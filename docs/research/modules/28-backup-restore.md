# 28 · Backup, Restore, Multi-region

> The "if everything explodes, can we recover?" surface. Per-org
> logical backups, point-in-time recovery from WAL, verified
> restores (a backup that's never been restored is just a hope),
> multi-region replication for disaster recovery, legal-hold
> exemptions to retention.
>
> Sister modules:
> [19 · Audit](19-audit-observability.md) (audit chain across
> backups), [24 · Admin Console](24-admin-console.md) (the
> self-serve UI), [22 · API & SDK](22-api-sdk-plugins.md)
> (workspace YAML export is a soft-backup).

**Depends on:** Admin (24), Audit (19), Auth (10)
**Unblocks:** SOC2 BCDR controls, customer "give us our data back",
  regional data residency
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Tool | Logical backup | PITR | Verify-restore | Multi-region | Legal hold |
|---|---|---|---|---|---|
| **Tableau Server** | ✓ (`tsm maintenance backup`) | partial | manual | partial | ✗ |
| **Power BI** | n/a (cloud) | n/a | n/a | ✓ | ✓ |
| **Looker** | ✓ (`looker backup`) | n/a | manual | ✓ | partial |
| **Metabase** | partial | ✗ | ✗ | ✗ | ✗ |
| **Hex** | n/a (cloud) | n/a | n/a | ✓ | ✓ |
| **GitHub** | ✓ (account migration) | ✓ | ✓ | ✓ | ✓ |
| **AWS RDS** | ✓ | ✓ | ✗ (need to test) | ✓ (read replicas) | n/a |

**The patterns to copy:**

- **Logical backups separate from infrastructure backups.** The
  cloud provider snapshots the DB volume; that's IT's job.
  Customer-self-serve "give me my org's data as JSON" is a
  different artifact: portable, restorable anywhere, GDPR-friendly.
- **PITR via WAL archive** is cheap if Postgres + S3; expensive
  to build elsewhere. We use it where available.
- **Verify by restore.** A backup that hasn't been restored at
  least once is unverified. Build a sandbox restore into the
  weekly job. Catches "the backup tool silently stopped working
  6 weeks ago" — the classic incident pattern.
- **KMS encryption at rest + in transit**. Customer-managed keys
  for enterprise.
- **Legal hold** disables retention deletion for the period of a
  legal preservation order, even when GDPR erasure runs.

## 2. DBExec today

- The cloud provider snapshots the master DB and per-org DBs
  nightly. That's the operational backup story.
- No customer-self-serve "export my org" beyond YAML workspace
  (module 18).
- No PITR exposed to admins.
- No verify-restore job. Backups are unverified.
- No multi-region replication (deployment-dependent).

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| BU-G01 | Logical backup job (per org, on demand) | P0 | M |
| BU-G02 | Logical backup schedule (daily / weekly) | P0 | S |
| BU-G03 | Backup artifact table + S3 storage | P0 | M |
| BU-G04 | KMS encryption of backup artifacts | P0 | S |
| BU-G05 | Customer-managed KMS keys (BYOK) | P1 | M |
| BU-G06 | Self-serve restore (full org) | P1 | L |
| BU-G07 | Self-serve restore (per entity: rolled-back dataset, etc.) | P1 | M |
| BU-G08 | Sandbox restore for verification | P0 | M |
| BU-G09 | Verify-restore weekly job + alert on failure | P0 | M |
| BU-G10 | PITR via WAL (Postgres) | P1 | L |
| BU-G11 | Multi-region replication | P2 | L |
| BU-G12 | Cross-region failover playbook | P2 | M |
| BU-G13 | Legal hold flag with retention bypass | P1 | S |
| BU-G14 | Backup retention policy per org | P0 | S |
| BU-G15 | Audit log of every backup + restore action | P0 | S |
| BU-G16 | Webhook event `backup.completed` / `restore.completed` | P1 | S |
| BU-G17 | Backup browser (admin UI) — list + filter + download | P0 | M |
| BU-G18 | Restore dry-run with diff against current state | P1 | M |

## 4. Target architecture

### 4.1 Backup artifact

```sql
CREATE TABLE backup_artifact (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,

  -- What's in it
  kind                varchar(16) NOT NULL,        -- full | incremental | yaml | wal
  scope               varchar(16) NOT NULL,        -- org | entity
  scope_entity_type   varchar(32),                  -- when scope=entity
  scope_entity_id     uuid,

  -- Where it lives
  storage_provider    varchar(16) NOT NULL,        -- s3 | gcs | azure | local
  bucket              varchar(255),
  key                 text NOT NULL,
  size_bytes          bigint NOT NULL,
  checksum_sha256     varchar(64) NOT NULL,

  -- Encryption
  encrypted_by        varchar(16) NOT NULL,        -- kms | platform | byok
  kms_key_arn         varchar(255),
  byok_org_key_id     uuid,

  -- Provenance
  created_by          uuid,                        -- null = scheduled
  trigger             varchar(16) NOT NULL,        -- manual | scheduled | gdpr | clone
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,                 -- retention boundary

  -- Verification
  verified_at         timestamptz,
  verified_ok         boolean,
  verification_notes  text,

  -- Legal hold (override retention)
  legal_hold          boolean NOT NULL DEFAULT false,
  legal_hold_reason   varchar(255),
  legal_hold_until    timestamptz
);
CREATE INDEX backup_artifact_org_time
  ON backup_artifact (organisation_id, created_at DESC);
CREATE INDEX backup_artifact_retention
  ON backup_artifact (expires_at)
  WHERE legal_hold = false AND expires_at IS NOT NULL;
```

### 4.2 Logical backup job

```ts
// jobs/backupOrg.ts
import { Readable } from 'stream';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';

export default async function backupOrgJob(jobData: {
  organisationId: string;
  trigger: 'manual'|'scheduled'|'gdpr'|'clone';
  triggeredBy?: string;
}) {
  const orgId = jobData.organisationId;
  const t0 = Date.now();

  // 1. Open the org's shared DB read-only
  const conn = await openOrgConnection(orgId, { readOnly: true });

  // 2. Stream every table to JSON Lines
  const tables = await listBackedUpTables(conn);
  const lines: string[] = [];

  for (const t of tables) {
    // Cursor-based scan to keep memory bounded
    const cursor = await conn.query(`DECLARE c CURSOR FOR SELECT * FROM "${t}"`);
    while (true) {
      const batch = await conn.query('FETCH 1000 FROM c');
      if (batch.rows.length === 0) break;
      for (const row of batch.rows) {
        lines.push(JSON.stringify({ table: t, row }));
      }
    }
    await conn.query('CLOSE c');
  }
  await conn.close();

  // 3. Compose the bundle
  const meta = {
    version: 1,
    organisationId: orgId,
    createdAt: new Date().toISOString(),
    trigger: jobData.trigger,
    triggeredBy: jobData.triggeredBy,
    tableCount: tables.length,
    rowCount: lines.length,
    schema: 'dbexec.io/v1',
  };

  const body = JSON.stringify(meta) + '\n' + lines.join('\n');
  const checksum = createHash('sha256').update(body).digest('hex');

  // 4. Gzip
  const gzipped = await gzipBuffer(Buffer.from(body, 'utf8'));

  // 5. Encrypt (KMS or per-org DEK)
  const { encrypted, encryptedBy, kmsKeyArn } = await encryptBackup(gzipped, orgId);

  // 6. Upload to S3
  const key = `backups/${orgId}/${meta.createdAt}.json.gz.enc`;
  await s3.upload({
    Bucket: process.env.BACKUP_BUCKET!,
    Key: key,
    Body: encrypted,
    Metadata: {
      'x-dbexec-checksum': checksum,
      'x-dbexec-org': orgId,
      'x-dbexec-trigger': jobData.trigger,
    },
  }).promise();

  // 7. Record artifact
  const retentionDays = await loadRetentionDays(orgId);
  const artifact = await BackupArtifact.save({
    organisationId: orgId,
    kind: 'full',
    scope: 'org',
    storageProvider: 's3',
    bucket: process.env.BACKUP_BUCKET!,
    key,
    sizeBytes: encrypted.length,
    checksumSha256: checksum,
    encryptedBy,
    kmsKeyArn,
    createdBy: jobData.triggeredBy,
    trigger: jobData.trigger,
    expiresAt: retentionDays ? new Date(Date.now() + retentionDays * 86400_000) : null,
  });

  // 8. Audit + webhook
  await auditLogger.logAuditToMaster({
    module: 'backup', action: 'CREATE',
    entityName: 'BackupArtifact', entityId: artifact.id,
    organisationId: orgId,
    metadata: {
      sizeBytes: encrypted.length,
      durationMs: Date.now() - t0,
      tableCount: tables.length,
      rowCount: lines.length,
    },
  });
  await eventBus.emit({
    type: 'backup.completed',
    organisationId: orgId,
    payload: {
      backupId: artifact.id, sizeBytes: encrypted.length,
      checksum, trigger: jobData.trigger,
    },
    actor: { type: 'service', id: 'backup-worker' },
  });
}

async function gzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip();
    gz.on('data', c => chunks.push(c));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(buf);
  });
}
```

### 4.3 Encryption (KMS + BYOK)

```ts
async function encryptBackup(plaintext: Buffer, orgId: string): Promise<{
  encrypted: Buffer;
  encryptedBy: 'kms' | 'platform' | 'byok';
  kmsKeyArn?: string;
}> {
  const byok = await OrgByokKey.findOne({ where: { organisationId: orgId, status: 1 } });

  if (byok) {
    // Customer-managed KMS — encrypt with their CMK
    const kms = new KMSClient({ region: byok.region });
    const resp = await kms.send(new EncryptCommand({
      KeyId: byok.keyArn,
      Plaintext: plaintext,
      EncryptionContext: { orgId, purpose: 'backup' },
    }));
    return {
      encrypted: Buffer.from(resp.CiphertextBlob!),
      encryptedBy: 'byok',
      kmsKeyArn: byok.keyArn,
    };
  }

  // Platform-managed KMS
  const platformKms = new KMSClient({ region: process.env.AWS_REGION! });
  const resp = await platformKms.send(new EncryptCommand({
    KeyId: process.env.PLATFORM_KMS_KEY_ID!,
    Plaintext: plaintext,
    EncryptionContext: { orgId, purpose: 'backup' },
  }));
  return {
    encrypted: Buffer.from(resp.CiphertextBlob!),
    encryptedBy: 'kms',
    kmsKeyArn: process.env.PLATFORM_KMS_KEY_ID!,
  };
}
```

BYOK config:

```sql
CREATE TABLE org_byok_key (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE,
  provider        varchar(16) NOT NULL,        -- aws | gcp | azure
  region          varchar(32) NOT NULL,
  key_arn         varchar(255) NOT NULL,
  status          smallint NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

KMS payload limit is 4KB; for larger payloads, use envelope
encryption (data key from KMS, encrypt body with AES-256-GCM,
wrap data key with KMS). Implementation TODO in code; structure
above is the simplified version.

### 4.4 Self-serve restore

Restore is the dangerous direction. Make it:

- **Async** (background job).
- **Dry-run by default** — show a diff before applying.
- **Org-scoped** — never restore one org's backup into another.
- **Audited extensively**.

```ts
// jobs/restoreOrg.ts
export default async function restoreOrgJob(jobData: {
  backupId: string;
  targetOrgId: string;
  mode: 'full' | 'merge' | 'selective';
  selective?: string[];          // table names when mode=selective
  triggeredBy: string;
  dryRun: boolean;
}) {
  const artifact = await BackupArtifact.findOne({
    where: { id: jobData.backupId, organisationId: jobData.targetOrgId },
  });
  if (!artifact) throw new Error('backup not found or not for this org');

  // 1. Download from S3
  const obj = await s3.getObject({ Bucket: artifact.bucket, Key: artifact.key }).promise();
  const encrypted = Buffer.from(obj.Body as Buffer);

  // 2. Decrypt
  const decrypted = await decryptBackup(encrypted, artifact);

  // 3. Verify checksum
  const gunzipped = await gunzipBuffer(decrypted);
  const computed = createHash('sha256').update(gunzipped).digest('hex');
  if (computed !== artifact.checksumSha256) {
    throw new Error('checksum mismatch — artifact corrupted');
  }

  // 4. Parse — meta on first line, rows after
  const body = gunzipped.toString('utf8');
  const lineList = body.split('\n');
  const meta = JSON.parse(lineList[0]);
  if (meta.organisationId !== jobData.targetOrgId && jobData.mode !== 'full') {
    throw new Error('org id mismatch — cross-org restore requires mode=full and explicit consent');
  }

  // 5. Bucket rows by table
  const rowsByTable = new Map<string, any[]>();
  for (const line of lineList.slice(1)) {
    if (!line) continue;
    const { table, row } = JSON.parse(line);
    if (!rowsByTable.has(table)) rowsByTable.set(table, []);
    rowsByTable.get(table)!.push(row);
  }

  // 6. Dry-run: compute diff against current state
  if (jobData.dryRun) {
    const diff = await computeRestoreDiff(rowsByTable, jobData.targetOrgId);
    await RestoreJob.update(jobData.jobId, { status: 'dry_ready', diff });
    return;
  }

  // 7. Apply
  const conn = await openOrgConnection(jobData.targetOrgId);
  await conn.transaction(async (tx) => {
    const tables = jobData.mode === 'selective'
      ? jobData.selective ?? []
      : Array.from(rowsByTable.keys());

    for (const t of tables) {
      const rows = rowsByTable.get(t) ?? [];
      if (rows.length === 0) continue;

      if (jobData.mode === 'full') {
        // TRUNCATE + INSERT
        await tx.query(`TRUNCATE "${t}" CASCADE`);
      }
      // Bulk insert with COPY or batched INSERT
      await bulkInsert(tx, t, rows);
    }
  });

  // 8. Audit
  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { backupId: artifact.id, mode: jobData.mode, dryRun: false },
  });
  await eventBus.emit({
    type: 'restore.completed',
    organisationId: jobData.targetOrgId,
    payload: { backupId: artifact.id, mode: jobData.mode },
    actor: { type: 'user', id: jobData.triggeredBy },
  });
}
```

### 4.5 Restore job tracker

```sql
CREATE TABLE restore_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  backup_id       uuid NOT NULL REFERENCES backup_artifact(id),
  initiated_by    uuid NOT NULL,
  status          varchar(16) NOT NULL,    -- queued | dry_running | dry_ready | running | done | failed
  mode            varchar(16) NOT NULL,    -- full | merge | selective
  selective       text[],
  diff            jsonb,                    -- populated after dry-run
  error           text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_on      timestamptz NOT NULL DEFAULT now()
);
```

Flow:

```
1. Admin clicks Restore.
2. POST /backups/:id/restore?dryRun=true
   → restore_job (status=queued, mode, dryRun=true)
3. Worker picks up, decrypts, computes diff.
4. status=dry_ready, diff populated.
5. Admin reviews diff in UI.
6. POST /restore-jobs/:id/apply  body: { confirm: true }
7. Worker applies. status=running → done.
8. Audit + webhook fired.
```

### 4.6 Verify-restore (weekly job)

```ts
// cron: every Sunday at 04:00 UTC
export default async function verifyBackupsJob() {
  // Pick a random sample (1 in 10) of recent backups across all orgs
  const recent = await BackupArtifact.find({
    where: {
      createdAt: MoreThan(subDays(new Date(), 7)),
      verifiedAt: IsNull(),
      kind: 'full',
    },
    take: 100,
  });

  const sample = recent.filter(() => Math.random() < 0.1);
  for (const artifact of sample) {
    await verifyOne(artifact);
  }
}

async function verifyOne(artifact: BackupArtifact) {
  const sandboxSchema = `verify_${artifact.id.replace(/-/g, '').slice(0, 12)}`;
  let ok = false;
  let notes = '';

  try {
    // 1. Download + decrypt + checksum
    const obj = await s3.getObject({
      Bucket: artifact.bucket, Key: artifact.key,
    }).promise();
    const decrypted = await decryptBackup(Buffer.from(obj.Body as any), artifact);
    const gunzipped = await gunzipBuffer(decrypted);
    const checksum = createHash('sha256').update(gunzipped).digest('hex');
    if (checksum !== artifact.checksumSha256) {
      throw new Error(`checksum mismatch: ${checksum} vs ${artifact.checksumSha256}`);
    }
    const body = gunzipped.toString('utf8');
    const lineList = body.split('\n');
    const meta = JSON.parse(lineList[0]);

    // 2. Create a sandbox Postgres schema in a non-prod cluster
    const sandboxConn = await openSandboxConnection(sandboxSchema);
    await sandboxConn.query(`CREATE SCHEMA IF NOT EXISTS "${sandboxSchema}"`);

    // 3. Apply a representative subset (don't restore the full backup —
    //    too expensive in CI cost). Restore the schema DDL + 10% of rows.
    const rowsByTable = new Map<string, any[]>();
    for (const line of lineList.slice(1).slice(0, Math.max(1000, lineList.length * 0.1))) {
      if (!line) continue;
      const { table, row } = JSON.parse(line);
      if (!rowsByTable.has(table)) rowsByTable.set(table, []);
      rowsByTable.get(table)!.push(row);
    }
    for (const [t, rows] of rowsByTable) {
      await bulkInsertSandbox(sandboxConn, sandboxSchema, t, rows);
    }

    // 4. Spot-check: every backed-up table has at least one row
    for (const t of Object.keys(meta.tableCounts ?? {})) {
      const cnt = await sandboxConn.query(`
        SELECT COUNT(*) AS c FROM "${sandboxSchema}"."${t}"`);
      if (cnt[0].c === 0 && meta.tableCounts[t] > 0) {
        throw new Error(`table ${t} restored empty but backup had ${meta.tableCounts[t]} rows`);
      }
    }

    // 5. Cleanup
    await sandboxConn.query(`DROP SCHEMA "${sandboxSchema}" CASCADE`);
    ok = true;
    notes = 'verified ok';
  } catch (e: any) {
    notes = `verification failed: ${e.message}`;
  } finally {
    await BackupArtifact.update(artifact.id, {
      verifiedAt: new Date(),
      verifiedOk: ok,
      verificationNotes: notes,
    });
    if (!ok) {
      // Alert ops
      await notifyOpsTeam('backup.verify_failed', { artifactId: artifact.id, notes });
    }
  }
}
```

Verifying every backup is expensive; verifying a 10% sample weekly
gives statistical confidence the pipeline works. Failures alert
ops immediately.

### 4.7 PITR (Postgres + WAL)

Where the deployment supports it (Postgres + S3 WAL archive,
e.g. via pgBackRest, wal-g, or AWS RDS PITR), expose admin-facing
restore-to-time:

```ts
// POST /admin/orgs/:id/pitr-restore  body: { targetTime, mode: 'preview'|'apply' }
async function pitrRestore(req, res) {
  if (!hasPermission(res.locals.permissions, 'superAdmin.pitr')) {
    return sendResponse(res, false, 403, 'pitr.no_perm');
  }
  const targetTime = new Date(req.body.targetTime);

  // Hand off to ops worker (this is privileged DB-cluster work)
  const job = await PitrJob.save({
    organisationId: req.params.id,
    targetTime,
    mode: req.body.mode,
    initiatedBy: res.locals.loggedInId,
  });
  await scheduleQueue.add('admin:pitr', { jobId: job.id });
  return sendResponse(res, true, 202, 'pitr.queued', { jobId: job.id });
}
```

PITR is typically platform-internal — handled by your DBA team
via pgBackRest or RDS console, not customer-self-serve. The
DBExec admin surface is read-only by default; only super-admins
can initiate.

### 4.8 Multi-region replication

Deployment-dependent. The data model treats it as separate
regional installs with cross-region replication of the master DB
and customer-controlled per-org-DB residency.

```sql
ALTER TABLE organisation
  ADD COLUMN primary_region varchar(32) NOT NULL DEFAULT 'us-east-1',
  ADD COLUMN data_residency_lock boolean NOT NULL DEFAULT false;
                                              -- when true, refuse to fail over
                                              -- to a non-allowed region
```

Failover playbook:

1. Region A is down.
2. DNS flips dbexec.com → region B.
3. Region B reads its replicated master DB.
4. For each org with `primary_region=us-east-1`, region B detects
   it can't reach the org's per-org DB → degraded mode.
5. Org admins are notified via secondary channel (email service in
   region B is independent).

Implementation: outside the scope of one module's doc. Mentioned
here because backups feed into the cross-region story (last-good
backup in region B is the lower-bound RPO).

### 4.9 Legal hold

```ts
// POST /admin/backups/:id/legal-hold
//   body: { reason, until }
async function applyLegalHold(req, res) {
  const { reason, until } = req.body;
  const artifact = await BackupArtifact.findOne({
    where: { id: req.params.id, organisationId: res.locals.orgData.id },
  });
  if (!artifact) return sendResponse(res, false, 404, 'backup.not_found');

  await BackupArtifact.update(artifact.id, {
    legalHold: true,
    legalHoldReason: reason,
    legalHoldUntil: until ? new Date(until) : null,
  });

  await auditLogger.logAuditToOrg({
    /* ... */
    action: 'LEGAL_HOLD_APPLIED',
    metadata: { reason, until },
  });
  return sendResponse(res, true, 200, 'backup.legal_hold_applied');
}
```

The retention cron skips artifacts with `legal_hold = true`:

```sql
DELETE FROM backup_artifact
WHERE expires_at < now()
  AND legal_hold = false
  AND (legal_hold_until IS NULL OR legal_hold_until < now());
```

S3 lifecycle rules also respect the `LegalHold` object metadata
(set via `s3:PutObjectLegalHold` when the flag flips), so even a
rogue manual delete can't remove a held object.

GDPR erasure (module 24) explicitly checks for legal hold:

```ts
if (await hasActiveLegalHold(userId)) {
  await GdprRequest.update(requestId, {
    status: 'failed', error: 'legal_hold_active',
  });
  await notifyDpo('gdpr.erasure_blocked_by_legal_hold', { userId, requestId });
  return;
}
```

Document loudly: GDPR vs legal hold is a real legal tension; the
DPO has to resolve before erasure runs.

### 4.10 Retention policy

```sql
CREATE TABLE org_backup_retention (
  organisation_id  uuid PRIMARY KEY,
  daily_keep_days     int NOT NULL DEFAULT 7,
  weekly_keep_weeks   int NOT NULL DEFAULT 4,
  monthly_keep_months int NOT NULL DEFAULT 12,
  yearly_keep_years   int NOT NULL DEFAULT 7,
  enabled             boolean NOT NULL DEFAULT true
);
```

Tiered retention (the classic 7-4-12 model). The nightly job
marks artifacts to keep:

```sql
WITH ranked AS (
  SELECT
    id, organisation_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY organisation_id,
                                    date_trunc('day', created_at)
                       ORDER BY created_at DESC) AS daily_rank,
    ROW_NUMBER() OVER (PARTITION BY organisation_id,
                                    date_trunc('week', created_at)
                       ORDER BY created_at DESC) AS weekly_rank,
    ROW_NUMBER() OVER (PARTITION BY organisation_id,
                                    date_trunc('month', created_at)
                       ORDER BY created_at DESC) AS monthly_rank,
    ROW_NUMBER() OVER (PARTITION BY organisation_id,
                                    date_trunc('year', created_at)
                       ORDER BY created_at DESC) AS yearly_rank
  FROM backup_artifact
)
UPDATE backup_artifact ba
SET expires_at = CASE
  WHEN r.daily_rank = 1 AND r.created_at > now() - interval '7 days' THEN NULL
  WHEN r.weekly_rank = 1 AND r.created_at > now() - interval '4 weeks' THEN NULL
  WHEN r.monthly_rank = 1 AND r.created_at > now() - interval '12 months' THEN NULL
  WHEN r.yearly_rank = 1 AND r.created_at > now() - interval '7 years' THEN NULL
  ELSE now() + interval '1 day'  -- to be expired tomorrow
END
FROM ranked r
WHERE ba.id = r.id;
```

### 4.11 Backup browser

```
Admin → Backups

  Backups for "Acme Analytics"
  ────────────────────────────────────────────────────────────
   Date              Size    Trigger    Status     Verified
   2027-09-15 04:00  482 MB  scheduled  active     ✓ Sep 16
   2027-09-14 04:00  481 MB  scheduled  active     ✓ Sep 14
   2027-09-13 21:14   12 MB  manual     active     ─
   2027-09-13 04:00  478 MB  scheduled  active     ✓ Sep 14
   2027-09-12 04:00  475 MB  scheduled  retiring   ─
   ⚖ 2027-08-30 04:00 462 MB scheduled  legal hold ✓ Aug 31
                                        until Mar 1, 2028

   [Schedule]  [Retention policy]  [Create backup now]
```

Per-row actions: Download (admin-only), Restore (opens wizard),
Apply legal hold, Verify now.

### 4.12 Restore wizard

```
Restore from backup

  Source backup:    Sep 15, 2027 04:00 UTC (482 MB)
  Verified:         ✓ Sep 16, 2027

  Mode:
    ◉ Full restore (REPLACE all data)
    ○ Merge (insert new + update existing)
    ○ Selective (pick tables / entities)

  Dry-run first:    ☑ Recommended

  Type to confirm:  [ acme-analytics                 ]
                    (the org's short name)

  ⚠ A full restore will replace all current data. Once applied,
    this action cannot be undone (except by restoring a more
    recent backup).

  [Cancel]  [Start dry-run]
```

After dry-run completes:

```
Dry-run result

  This restore would:
    ✓ Add 14 datasets that don't currently exist
    ⚠ Replace 38 datasets that have changed since backup
        click to see per-dataset diff
    ✗ Remove 3 datasets that exist now but didn't in backup
        click to see which

    ✓ Add 7 dashboards
    ⚠ Replace 22 dashboards
    ✗ Remove 1 dashboard

  Tables affected: 26
  Total rows changed: ~28,400

  [Cancel]  [Apply restore (irreversible)]
```

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/backups` | Create backup now (manual trigger) |
| GET | `/admin/backups` | List for current org |
| GET | `/admin/backups/:id` | Detail |
| GET | `/admin/backups/:id/download` | Download (admin) |
| POST | `/admin/backups/:id/verify` | Force verify now |
| POST | `/admin/backups/:id/legal-hold` | Apply hold |
| DELETE | `/admin/backups/:id/legal-hold` | Release hold |
| POST | `/admin/backups/:id/restore` | Start restore (dryRun default true) |
| POST | `/admin/restore-jobs/:id/apply` | Apply after dry-run review |
| GET | `/admin/restore-jobs/:id` | Status + diff |
| GET | `/admin/backup-retention` | Retention policy |
| PUT | `/admin/backup-retention` | Update policy |
| POST | `/admin/byok` | Register customer-managed KMS key |
| GET | `/admin/byok` | Show config |

## 6. FE specs

(Inline above.)

## 7. Validators

```ts
export const triggerBackupSchema = z.object({
  // No body; auth + org context suffices
});

export const restoreSchema = z.object({
  backupId: z.string().uuid(),
  mode: z.enum(['full','merge','selective']).default('full'),
  selective: z.array(z.string()).optional(),
  dryRun: z.boolean().default(true),
  confirmation: z.string().min(1),    // user must type org short_name
}).superRefine((data, ctx) => {
  if (data.mode === 'selective' && (!data.selective || data.selective.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selective'],
      message: 'restore.selective.empty' });
  }
});

export const updateRetentionSchema = z.object({
  dailyKeepDays:    z.number().int().min(1).max(90).default(7),
  weeklyKeepWeeks:  z.number().int().min(1).max(52).default(4),
  monthlyKeepMonths:z.number().int().min(1).max(120).default(12),
  yearlyKeepYears:  z.number().int().min(1).max(50).default(7),
  enabled:          z.boolean().default(true),
});

export const legalHoldSchema = z.object({
  reason: z.string().min(1).max(255),
  until: z.string().datetime().optional(),
});

export const byokKeySchema = z.object({
  provider: z.enum(['aws','gcp','azure']),
  region: z.string().min(1).max(32),
  keyArn: z.string().min(1).max(255),
});
```

## 8. Test plan

```
BU-CREATE-H-01  POST /admin/backups → artifact row + S3 object
BU-CREATE-H-02  artifact.checksum matches downloaded content
BU-CREATE-H-03  encrypted_by='kms' on platform-only keys
BU-CREATE-H-04  encrypted_by='byok' when BYOK configured
BU-CREATE-N-01  S3 upload failure → audit + retry queued

BU-VERIFY-H-01  weekly job picks ~10% of recent backups
BU-VERIFY-H-02  checksum match → verified_ok=true
BU-VERIFY-N-01  checksum mismatch → verified_ok=false + alert
BU-VERIFY-N-02  decryption failure → verified_ok=false + alert

BU-RESTORE-H-01 POST /restore?dryRun=true → restore_job in dry_ready
BU-RESTORE-H-02 diff reports adds/removes/updates by table
BU-RESTORE-H-03 apply after dry-run rewrites org tables
BU-RESTORE-H-04 full-mode TRUNCATEs target tables before insert
BU-RESTORE-N-01 wrong org → 403
BU-RESTORE-N-02 confirmation mismatch → 400
BU-RESTORE-H-05 selective mode restores only chosen tables

BU-RETAIN-H-01  retention sweep marks expired artifacts
BU-RETAIN-H-02  tiered keep — 7 daily / 4 weekly / 12 monthly / 7 yearly
BU-RETAIN-H-03  legal_hold=true → not expired even past retention
BU-RETAIN-H-04  legal_hold_until passed → eligible for expiry

BU-LEGAL-H-01   apply legal hold → S3 object lock set
BU-LEGAL-H-02   release legal hold → audit row + S3 lock cleared
BU-LEGAL-N-01   GDPR erasure blocked when legal hold active

BU-BYOK-H-01    register BYOK key → encrypt uses customer's CMK
BU-BYOK-H-02    decrypt requires customer's CMK to be accessible
BU-BYOK-N-01    BYOK key disabled → backup fails with clear error

BU-WH-H-01      backup.completed webhook fires
BU-WH-H-02      restore.completed webhook fires

BU-AUDIT-H-01   create/restore/legal-hold all audited
```

## 9. Migration & rollout

1. Phase 1 — schema (backup_artifact, restore_job,
   org_backup_retention) + manual backup endpoint.
2. Phase 2 — scheduled daily backup job + tiered retention.
3. Phase 3 — restore (dry-run + apply) + admin UI.
4. Phase 4 — verify-restore weekly job + ops alerting.
5. Phase 5 — KMS encryption (platform default).
6. Phase 6 — BYOK key support.
7. Phase 7 — legal hold + GDPR interaction.
8. Phase 8 — PITR admin surface (super-admin only).
9. Phase 9 — multi-region replication (deployment-dependent).

Feature flag `enableBackup` per org. PITR + BYOK gated to paid
tier.

## 10. Open questions

- **Backup size at scale**. Large orgs (1M datasets, 100M audit
  rows) produce multi-GB backups daily. Incremental backups via
  WAL diff (Postgres LSN-based) cut this to MB/day; full backup
  weekly. Defer to v2.
- **Cross-region replication of backups themselves**. S3
  cross-region replication is operational; document with the
  deployment runbook.
- **Restore-to-a-different-org**. Disaster scenario: org A is
  corrupted, customer wants to restore into a fresh org B. Allowed
  for super-admins with explicit migration mode; org IDs re-mapped.
- **Backup of plugin code**. Per-org plugins (module 22) live in
  S3; do those go in the backup or stay in their own retention?
  Recommend stay in their own — they're versioned externally.
- **Cost of verify-restore**. Sandbox Postgres + S3 download = a
  few hundred MB / week per org × N orgs. Document as a fixed-cost
  line in ops budget.
- **Audit log retention vs backup retention**. Audit has its own
  retention (module 19); backups respect that and don't restore
  audit older than the cutoff.

## 11. References

- pgBackRest: <https://pgbackrest.org/>
- wal-g: <https://github.com/wal-g/wal-g>
- AWS RDS PITR: <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html>
- KMS envelope encryption: <https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping>
- S3 Object Lock (legal hold): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html>
- Tiered retention (GFS): <https://en.wikipedia.org/wiki/Backup_rotation_scheme>

## Appendix · Review additions

- **PITR via WAL** for Postgres-backed deployments — §4.7.
- **KMS encryption** + **BYOK** — §4.3.
- **Verify-restore weekly job** with sandbox schema — §4.6.
- **Legal hold** with retention + S3 Object Lock — §4.9.
- **Tiered retention** (7/4/12/7 GFS) — §4.10.
- **Dry-run restore** with diff against current state — §4.5.
- **Cross-region replication** — §4.8.
- **Webhook events** `backup.completed` / `restore.completed`
  — §4.2.
