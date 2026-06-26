# Backup, restore, multi-region

> Implementation companion to research module 28. Pins
> backup_artifact + restore_job entities, KMS envelope
> encryption with BYOK, logical backups (gzipped JSONL),
> self-serve restore with dry-run + diff, the verify-restore
> weekly job, PITR via WAL, legal hold, and tiered GFS
> retention.

**Status:** 🔴 not in product.
**Effort:** L (~4 weeks).

---

## 0. Problem statement

Three customer asks roll up:

1. "If we accidentally delete a dashboard, can we get it back?"
2. "If our shared DB region fails, can you fail us over to
   another region?"
3. "Legal asks for a 2-year-old snapshot — can you produce it
   with a chain-of-custody?"

Plus regulatory: GDPR retention, SOC2 evidence, legal hold.

---

## 1. Data model

```sql
CREATE TABLE backup_artifact (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organisation(id) ON DELETE SET NULL,  -- null after org deleted (legal hold)
  kind          TEXT NOT NULL CHECK (kind IN ('full','incremental','schema_only')),
  scope         TEXT NOT NULL CHECK (scope IN ('org','master')),
  storage_url   TEXT NOT NULL,                          -- s3://...
  byte_size     BIGINT NOT NULL,
  sha256        BYTEA NOT NULL,
  dek_id        UUID NOT NULL,                          -- KMS DEK identifier
  byok_key_id   UUID REFERENCES org_byok_key(id),        -- when customer BYOK
  row_count_est BIGINT,
  schema_version TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  legal_hold    BOOLEAN NOT NULL DEFAULT false,
  retention_tier TEXT NOT NULL CHECK (retention_tier IN ('daily','weekly','monthly','yearly','legal_hold')),
  verified_at   TIMESTAMPTZ,
  verify_status TEXT CHECK (verify_status IN ('pending','ok','failed'))
);

CREATE INDEX idx_backup_org_at ON backup_artifact(org_id, created_at DESC);
CREATE INDEX idx_backup_expires ON backup_artifact(expires_at) WHERE legal_hold = false;

CREATE TABLE restore_job (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  backup_id     UUID NOT NULL REFERENCES backup_artifact(id),
  initiated_by  UUID NOT NULL REFERENCES "user"(id),
  scope         TEXT NOT NULL,                           -- 'full' | 'entity'
  entity_kind   TEXT,
  entity_id     UUID,
  target_kind   TEXT NOT NULL,                          -- 'in_place' | 'sandbox' | 'new_org'
  target_org_id UUID,
  dry_run       BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'pending',
  diff_summary  JSONB,
  log_url       TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_backup_retention (
  org_id        UUID PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  daily_keep    INTEGER NOT NULL DEFAULT 7,
  weekly_keep   INTEGER NOT NULL DEFAULT 4,
  monthly_keep  INTEGER NOT NULL DEFAULT 12,
  yearly_keep   INTEGER NOT NULL DEFAULT 7
);

CREATE TABLE org_byok_key (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('aws_kms','gcp_kms','azure_kv')),
  kms_key_arn   TEXT NOT NULL,
  alias         TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Logical backup format

Gzipped JSONL, one file per table:

```
backup-<orgId>-<timestamp>/
  meta.json              # schema_version, table list, row counts, sha256s
  user.jsonl.gz
  group.jsonl.gz
  dataset.jsonl.gz
  dataset_field.jsonl.gz
  analysis.jsonl.gz
  ...
  audit_log.jsonl.gz
```

Each line: one row as JSON. Foreign keys preserved as UUIDs;
the restorer remaps if needed (when restoring to a different
org).

Why logical not physical:
- Cross-engine portable.
- Easier diff at restore time.
- Storage cheaper (gzip ratios for relational JSON are good).
- Schema migrations don't break old backups (the restorer
  knows how to forward-migrate via `schema_version`).

---

## 3. Take-backup worker

```typescript
// src/services/backup/take.ts
export async function takeBackup(orgId: string, kind: 'full' | 'incremental' = 'full'): Promise<BackupArtifact> {
  const conn = await getOrgConnection(orgId);
  const tables = await listTables(conn);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/org_${orgId}/${ts}/`;
  const dek = randomBytes(32);
  const wrappedDek = await wrapDekForOrg(dek, orgId);   // BYOK-aware

  let byteCount = 0;
  const fileHashes: Record<string, string> = {};

  for (const table of tables) {
    const stream = await streamRows(conn, table, kind === 'incremental' ? lastBackupAt(orgId) : null);
    const cipher = createCipheriv('aes-256-gcm', dek, randomBytes(12));
    const gz = zlib.createGzip();
    const upload = await storage.openWrite(`${key}${table}.jsonl.gz.enc`);
    const hashStream = createHash('sha256');

    await pipeline(
      stream.pipe(stringifyJsonl),
      gz, cipher,
      tap(chunk => { byteCount += chunk.length; hashStream.update(chunk); }),
      upload,
    );
    fileHashes[table] = hashStream.digest('hex');
  }

  const meta = {
    orgId, schemaVersion: SCHEMA_VERSION, kind,
    tables, fileHashes, takenAt: ts,
  };
  await storage.writeJson(`${key}meta.json`, meta);

  const totalSha = sha256(JSON.stringify(meta) + Object.values(fileHashes).join(''));

  const artifact = await connection.getRepository('BackupArtifact').save({
    orgId, kind, scope: 'org',
    storageUrl: `s3://${BUCKET}/${key}`,
    byteSize: byteCount,
    sha256: totalSha,
    dekId: storeWrappedDek(wrappedDek),
    rowCountEst: await estimateRowCount(conn),
    schemaVersion: SCHEMA_VERSION,
    expiresAt: computeExpiry(kind, orgId),
    retentionTier: deriveRetentionTier(),
  });

  return artifact;
}
```

Per-org cron schedule: daily at 02:00 local time.

---

## 4. Verify-restore weekly job

Catches "backups all green but unrestorable":

```typescript
// src/jobs/verifyRestore.ts
export async function verifyLatestBackup(orgId: string): Promise<void> {
  const latest = await loadLatestBackup(orgId);
  if (!latest) return;

  // Restore into a sandbox Postgres schema
  const sandboxSchema = `verify_${orgId.replace(/-/g, '_')}`;
  await managedPool.query(`DROP SCHEMA IF EXISTS ${sandboxSchema} CASCADE; CREATE SCHEMA ${sandboxSchema};`);

  try {
    await restoreToSchema(latest, sandboxSchema, { dryRun: false });

    // Run a row-count + checksum check vs metadata
    const ok = await crossCheck(latest, sandboxSchema);

    await connection.getRepository('BackupArtifact').update({ id: latest.id }, {
      verifiedAt: new Date(),
      verifyStatus: ok ? 'ok' : 'failed',
    });

    if (!ok) {
      await notify({
        orgId, userId: SUPER_ADMIN_USER_ID, category: 'admin', severity: 'critical',
        title: `Backup verify failed for org ${orgId}`,
        body: `Latest backup ${latest.id} could not be restored cleanly.`,
      });
    }
  } finally {
    await managedPool.query(`DROP SCHEMA ${sandboxSchema} CASCADE`);
  }
}
```

Runs Sunday 03:00 UTC. Alerts on failure.

---

## 5. Self-serve restore

```typescript
// src/controllers/backup/restore.ts
const initiateRestore = async (req: Request, res: Response) => {
  const { backupId, scope, entityKind, entityId, targetKind, dryRun, confirmation } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    if (targetKind === 'in_place' && confirmation !== orgData.name) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, BK_MSG.NEED_CONFIRM);
    }

    const job = await connection.getRepository('RestoreJob').save({
      orgId: orgData.orgId, backupId, initiatedBy: loggedInId,
      scope, entityKind, entityId, targetKind, dryRun: !!dryRun,
      status: 'pending',
    });

    await restoreQueue.add('restore', { jobId: job.id });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.RESTORE, action: AUDIT_ACTIONS.INITIATE,
      entityName: 'RestoreJob', entityId: job.id,
      metadata: { backupId, scope, targetKind, dryRun: !!dryRun },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, BK_MSG.OK, { jobId: job.id });
  } catch (err: any) {
    Logger.error(`Initiate restore failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

Worker pulls the job, downloads + decrypts, runs the restore
into a sandbox first to compute the diff, posts diff to
`restore_job.diff_summary`, and pauses until the user confirms
or aborts. On confirm, swaps into place via tx; on abort,
discards.

---

## 6. PITR via WAL

For the org's Postgres shared DB (when we own it), wal-g or
pgBackRest streams WAL segments to S3 continuously. Restore at
T = restore base + replay until T.

PITR is an *infra* lift, not application code, but the API
surface lets an org admin pick a target timestamp from the
restore UI.

---

## 7. Legal hold

```sql
ALTER TABLE backup_artifact ADD COLUMN legal_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE backup_artifact ADD COLUMN legal_hold_reason TEXT;
ALTER TABLE backup_artifact ADD COLUMN legal_hold_by UUID REFERENCES "user"(id);
ALTER TABLE backup_artifact ADD COLUMN legal_hold_at TIMESTAMPTZ;
```

Flag flips via admin → "Place hold". Once set:

- Retention purge skips the artifact.
- S3 Object Lock (compliance mode) prevents bucket-level deletion.
- Org-delete is blocked while any of the org's artifacts have
  hold.

Release: super-admin only; audit-logged with justification.

---

## 8. Tiered retention (GFS)

```typescript
function deriveRetentionTier(date: Date): RetentionTier {
  const d = new Date(date);
  if (isLastDayOfYear(d)) return 'yearly';
  if (isLastDayOfMonth(d)) return 'monthly';
  if (d.getDay() === 0) return 'weekly';   // Sunday
  return 'daily';
}
```

Retention cron prunes per `org_backup_retention`. Default
defaults to GFS 7-4-12-7 (7 daily / 4 weekly / 12 monthly / 7
yearly). Customers configure.

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_backup_take_total` | counter | `kind`, `outcome` | reliability |
| `dbexec_backup_size_bytes` | histogram | `kind` | size distribution |
| `dbexec_backup_take_ms` | histogram | `kind` | latency |
| `dbexec_backup_verify_total` | counter | `outcome` | nightly verify |
| `dbexec_backup_pruned_total` | counter | `tier` | retention pruning |
| `dbexec_restore_initiated_total` | counter | `target` | usage |
| `dbexec_restore_ms` | histogram | `target` | latency |
| `dbexec_backup_storage_bytes` | gauge | `org` | per-org footprint |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| Backup stolen from S3 | KMS envelope encryption; without DEK access the bytes are useless |
| BYOK key revocation | Without the customer's KEK, even DBExec can't decrypt — this is the customer's safety property |
| Restore reintroduces PII | Restore audit captures actor + scope; subjects of GDPR erasure are checked before restore (`gdpr_request.kind='erasure'` blocks restore unless super-admin override) |
| Restore wipes legitimate data | In-place restore requires typed-org-name confirmation; sandbox-first preview always available |
| Legal hold bypass | S3 Object Lock + app-layer block + audit-logged release |
| Cross-org restore | Backup org_id required to match target unless super-admin moving an org |
| Backup buffer overflow | Streaming pipeline; no full-table in memory |
| Race on retention prune vs restore | Restore acquires advisory lock on artifact; prune respects lock |
| WAL gap | Continuous-archiving health check; alert if gap > 5 min |

---

## 11. Operational runbook

**Symptom: nightly verify fails for one org.**
1. Storage corruption? Re-run download with sha256 check.
   If hash mismatches stored value, S3 corruption — alert.
2. Schema migration drift? Verify catches version skew; bump
   `schema_version` and re-run migration.

**Symptom: restore stuck in `pending`.**
1. Queue worker down. Check BullMQ admin.

**Symptom: customer demands proof of restore.**
1. Verify-restore log per artifact lives in `backup_artifact.
   verified_at`. Export the audit chain for that period.

**Symptom: region outage.**
1. Failover: spin up replica in DR region, swap DNS, point app
   to DR shared DB. Documented in DR runbook; this module's
   schema makes it possible.

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Take backup (small org, 100 MB DB) | 30 s | 90 s | 5 min |
| Take backup (large org, 50 GB DB) | 20 min | 60 min | 4 h |
| Restore dry-run | 60 s | 5 min | 30 min |
| Restore in-place | 2 min | 10 min | 1 h |
| Verify-restore | 1 min | 5 min | 30 min |
| KMS DEK unwrap | 20 ms | 80 ms | 500 ms |

---

## 13. Migration & rollout

1. **Migrations:** `backup_artifact`, `restore_job`,
   `org_backup_retention`, `org_byok_key`. Idempotent.
2. **Bucket lifecycle:** S3 lifecycle moves objects to
   Standard-IA after 30 days, Glacier after 1 year for cost.
3. **Verify-restore:** run only in dev/staging first; record
   ms p95 to size production resource.
4. **BYOK:** admin opt-in; document IAM grant per customer.
5. **Feature flag:** `feature.backup_v2`.

---

## 14. Open questions

1. **Cross-region replication of S3 backups** — for true DR
   isolation. Trivial infra config; document.
2. **App-layer point-in-time** (DBExec entities at T, not
   warehouse data) — versioning module 18 already serves this
   for entities. Document the boundary.
3. **Customer-driven export of their data** — different from
   backup; lives in module 24 GDPR. Cross-reference.

---

## 15. References

- [28-backup-restore.md](../research/modules/28-backup-restore.md)
- [24-admin-console.md](../research/modules/24-admin-console.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- AWS KMS envelope encryption pattern
- S3 Object Lock compliance mode
- PostgreSQL WAL archiving + wal-g / pgBackRest
- AWS S3 lifecycle Glacier transitions
