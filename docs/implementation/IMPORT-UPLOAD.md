# Import & upload

> Implementation companion to research module 12. Pins the
> 13-step upload pipeline, the managed-datasource Postgres,
> tus.io resumable uploads, URL pulls with SSRF guard, and
> Google Sheets via OAuth.

**Status:** 🔴 not in product. P0 — self-serve analyst flow.
**Effort:** L (~4 weeks).

---

## 0. Problem statement

An analyst has a CSV. They want to upload it and chart it
within 60 seconds. The bar is high because every competitor
has it.

Constraints:

- Files up to 5 GB. Browser can't hold that in memory.
- Resumable (Wi-Fi flaps; analyst's laptop sleeps).
- The data lands as a real table in a real database (so the
  query processor + RLS + semantic layer all just work
  without a special path).
- Column types inferred sensibly (`"2026-06-26"` is a date,
  not a string; `"$1,234.56"` is a currency).
- Idempotent: re-uploading the same file with the same name
  replaces, doesn't duplicate.

---

## 1. The 13-step pipeline

```
1.  Client requests upload slot         POST /upload/init     → tusUploadUrl, fileId
2.  Client streams chunks via tus       PATCH ...
3.  Server stores raw bytes in S3       (configurable: local FS, S3, GCS)
4.  Server validates content-type       (CSV/XLSX/JSON; reject anything else)
5.  Server sniffs encoding (UTF-8/UTF-16/Latin-1)
6.  Server peeks first 1024 lines       → infer delimiter, quote char, header row
7.  Column inference                     → name normalisation, type guess, semantic guess
8.  User reviews + edits                 → "Looks like 17 columns; date is date?"
9.  Server provisions managed table     CREATE TABLE org_<id>.tbl_<slug>_<ts>
10. Server streams rows in via COPY FROM STDIN (PG) or LOAD DATA (MySQL)
11. Server creates dataset row + dataset_field rows
12. Server fires upload.completed event  → notifies (module 16)
13. Client navigates to dataset edit screen
```

Each step is restartable; tus handles resume at step 2.

---

## 2. Managed datasource

```sql
-- A single managed PG instance per region, owned by DBExec.
-- One schema per org. One table per upload.
-- Schema name pattern: org_<orgUuidUnderscored>
-- Table name pattern:  tbl_<slug>_<ts>
```

Provisioning: when an org first uploads, an admin-side worker
runs `CREATE SCHEMA IF NOT EXISTS org_<id>` and grants the
DBExec service account `USAGE` + `CREATE` on it.

Quota per org: `org.managed_upload_quota_gb` (default 10 GB).
Soft warning at 80%, hard reject at 100% with a clean error.

---

## 3. Upload init controller

```typescript
// src/controllers/upload/initUpload.ts
const initUpload = async (req: Request, res: Response) => {
  const { fileName, size, contentType, datasetSlug, replace } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    if (size > MAX_UPLOAD_BYTES) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, UPLOAD_MSG.TOO_LARGE);
    }
    if (!ACCEPTED_TYPES.includes(contentType)) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, UPLOAD_MSG.UNSUPPORTED_TYPE);
    }

    // Quota check
    const used = await currentManagedUsageBytes(orgData.orgId);
    const quota = orgData.managed_upload_quota_gb * 1024 ** 3;
    if (used + size > quota) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, UPLOAD_MSG.QUOTA);
    }

    const fileId = crypto.randomUUID();
    const tusUrl = await tus.createSlot({
      fileId, orgId: orgData.orgId, userId: loggedInId,
      size, contentType, metadata: { fileName, datasetSlug, replace: !!replace },
    });

    // Persist a row so we can resume after server restart
    await connection.getRepository('UploadJob').save({
      id: fileId, orgId: orgData.orgId, userId: loggedInId,
      fileName, size, contentType, datasetSlug,
      replaceExisting: !!replace, status: 'awaiting_upload',
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.UPLOAD,
      action: AUDIT_ACTIONS.INIT,
      entityName: 'UploadJob',
      entityId: fileId,
      metadata: { fileName, size, contentType },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, UPLOAD_MSG.OK, { fileId, tusUrl });
  } catch (err: any) {
    Logger.error(`Init upload failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 4. The COPY worker

```typescript
// src/services/upload/copyWorker.ts
export async function processUpload(jobId: string): Promise<void> {
  const job = await loadUploadJob(jobId);
  const stream = await storage.openReadStream(jobId);

  // Detect encoding
  const encoding = await sniffEncoding(stream);
  const decoded = stream.pipe(iconv.decodeStream(encoding));

  // Peek + parse first 1024 lines
  const peeked = await peekLines(decoded, 1024);
  const dialect = sniffCsvDialect(peeked);   // delimiter, quote, header
  const columns = await inferColumns(peeked, dialect);

  // Provision target table
  const targetSchema = `org_${job.orgId.replace(/-/g, '_')}`;
  const targetTable = job.replaceExisting && (await tableExists(targetSchema, job.datasetSlug))
    ? `tbl_${job.datasetSlug}_${Date.now()}`        // new physical, atomic swap later
    : `tbl_${job.datasetSlug}_${Date.now()}`;
  const ddl = renderCreateTable(targetSchema, targetTable, columns);
  await managedPool.query(ddl);

  // Stream rows via COPY FROM STDIN
  const csv = stringifyCsv(decoded, dialect);
  const copyStream = managedPool.query(copyFrom(`COPY ${targetSchema}.${targetTable} FROM STDIN WITH CSV HEADER`));
  await pipeline(csv, copyStream);

  // Atomic swap if replacing
  if (job.replaceExisting) {
    await managedPool.query(`
      BEGIN;
      DROP TABLE IF EXISTS ${targetSchema}.tbl_${job.datasetSlug}_current;
      ALTER TABLE ${targetSchema}.${targetTable} RENAME TO tbl_${job.datasetSlug}_current;
      COMMIT;
    `);
  }

  // Create dataset entity
  const dataset = await connection.getRepository('Dataset').save({
    orgId: job.orgId,
    datasourceId: MANAGED_DS_ID,
    name: deriveDatasetName(job.fileName),
    slug: job.datasetSlug,
    sourceKind: 'uploaded',
    sourceTable: `${targetSchema}.${targetTable}`,
    refreshCadence: 'live',
    ownerUserId: job.userId,
    status: 'draft',
  });

  // Fields
  for (const c of columns) {
    await connection.getRepository('DatasetField').save({
      datasetId: dataset.id,
      name: c.normalisedName, displayName: c.originalName,
      dataType: c.dataType, semanticType: c.semanticType,
      isPii: c.isPii, displayOrder: c.order,
    });
  }

  // Mark job done; emit event
  await connection.getRepository('UploadJob').update({ id: jobId },
    { status: 'completed', datasetId: dataset.id, completedAt: new Date() });

  await events.publish('upload.completed', {
    orgId: job.orgId, userId: job.userId, datasetId: dataset.id,
    rowCount: await rowCountOf(targetSchema, targetTable),
  });
}
```

---

## 5. Column inference

```typescript
export interface ColumnGuess {
  originalName: string;
  normalisedName: string;
  dataType: 'string' | 'number' | 'integer' | 'date' | 'timestamp' | 'boolean';
  semanticType: string | null;
  isPii: boolean;
  order: number;
}

export function inferColumns(rows: string[][], dialect: CsvDialect): ColumnGuess[] {
  const header = rows[0];
  const sample = rows.slice(1).slice(0, 200);
  return header.map((h, i) => {
    const vals = sample.map(r => r[i]).filter(v => v !== '' && v != null);
    const dataType = inferDataType(vals);
    const semanticType = inferSemanticType(h, vals);
    return {
      originalName: h,
      normalisedName: normaliseColumnName(h),
      dataType, semanticType,
      isPii: looksLikePii(h, vals),
      order: i,
    };
  });
}

function inferDataType(values: string[]): ColumnGuess['dataType'] {
  if (values.every(v => /^-?\d+$/.test(v))) return 'integer';
  if (values.every(v => /^-?\d+\.?\d*$/.test(v))) return 'number';
  if (values.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v))) return 'date';
  if (values.every(v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))) return 'timestamp';
  if (values.every(v => /^(true|false|yes|no|1|0|y|n)$/i.test(v))) return 'boolean';
  return 'string';
}

function normaliseColumnName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);              // Postgres identifier limit
}
```

Currency strings: `"$1,234.56"` is detected as currency
semantic type but stored as `number` after stripping `$` and
`,`. Inference panel surfaces "I stripped `$` from this column —
correct?" so the user can intervene.

---

## 6. URL pull

`POST /upload/url-pull` accepts a public URL. Pipeline reuses
steps 3-13 with one extra preamble:

```typescript
async function pullFromUrl(url: string, orgId: string, userId: string): Promise<string> {
  // SSRF guard
  const resolved = await guardedDnsLookup(url);
  if (isPrivateIp(resolved.address)) throw new Error('SSRF_BLOCKED');
  if (resolved.address === '169.254.169.254') throw new Error('SSRF_BLOCKED_METADATA');

  // Stream with size cap
  const res = await fetch(url, {
    redirect: 'follow', signal: AbortSignal.timeout(60_000),
    headers: { 'User-Agent': 'DBExec-URL-Pull/1.0' },
  });
  if (!res.ok) throw new Error(`URL pull failed: ${res.status}`);

  const fileId = crypto.randomUUID();
  await storage.streamWrite(fileId, res.body, { maxBytes: MAX_UPLOAD_BYTES });
  return fileId;
}
```

The SSRF guard pins DNS to the resolved IP so TOCTOU rebinding
doesn't sneak past.

---

## 7. Google Sheets

OAuth-based: user authorises DBExec to read sheets;
DBExec stores the refresh token (KMS-wrapped) per user; on
import we call `sheets.spreadsheets.values.get` and stream the
result through the same pipeline starting at step 7.

Refresh cadence: a `sheets_import_job` row stores the sheet
ID + refresh schedule; a cron re-imports daily (configurable),
producing a new `tbl_<slug>_<ts>` and atomic-swapping.

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_upload_init_total` | counter | `org`, `outcome` | init success/failure |
| `dbexec_upload_bytes_received_total` | counter | `org` | for quota tracking |
| `dbexec_upload_processing_ms` | histogram | `kind` (csv/xlsx/url) | end-to-end |
| `dbexec_upload_rows_loaded` | histogram | `kind` | row counts |
| `dbexec_upload_failed_total` | counter | `phase`, `reason` | which step fails most |
| `dbexec_upload_quota_used_bytes` | gauge | `org` | quota dashboard |

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| Zip-bomb XLSX | Cap decompressed size at 5× declared size; reject if exceeded |
| CSV formula injection | Cells starting with `=`, `+`, `-`, `@` prefixed with `'` before display (export side); never executed by us |
| Path traversal via filename | Filename treated as opaque; storage uses internal fileId; original name stored as metadata only |
| Schema overflow (1000 columns) | Cap at 200 columns by default; org admin can raise |
| Encoding sniff misleads | If decode fails, surface "Couldn't decode this file" and let user pick encoding manually |
| SSRF via URL pull | DNS resolved once + pinned; private/metadata IPs blocked; 60s timeout |
| OAuth token leak | Tokens KMS-wrapped per user; never logged; revocable from user profile |
| Re-upload race | UploadJob.status state machine + DB unique on (orgId, datasetSlug) for in-flight uploads |
| User uploads malware | We don't execute; AV scan optional and configurable per org |
| Cross-org schema access | Managed-DB grants scoped to `org_<id>` schema only |

---

## 10. Runbook

**Symptom: upload completes but no data.**
1. Encoding mis-detect → empty parse. Inspect `processing_ms`
   logs for "encoding: ...". Rerun with manual encoding hint
   via `/upload/reprocess`.

**Symptom: quota exceeded but data is gone.**
1. User probably did "replace" on a smaller file but quota
   counter is per-row over time, not current. Add nightly
   reconciliation cron.

**Symptom: Google Sheet refresh stops working.**
1. OAuth token refresh failed (user revoked). Surface a
   per-import "needs reauthorise" banner in dataset detail.

---

## 11. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Upload init | 80 ms | 250 ms | 1 s |
| 100 MB CSV processing | 30 s | 90 s | 5 min |
| 1 GB CSV processing | 5 min | 15 min | 30 min |
| URL pull (100 MB) | 30 s | 90 s | 5 min |
| Column inference (200 rows × 50 cols) | 100 ms | 300 ms | 2 s |

---

## 12. Migration & rollout

1. **Migrations:** create `upload_job`, `sheets_import_job`,
   `managed_datasource` (or use existing datasource_s row with
   `kind='managed'`).
2. **Per-region managed PG** provisioned outside this rollout.
3. **Feature flag:** `feature.upload`. Default OFF; enable
   per-org via admin.
4. **Quota defaults**: 10 GB free, configurable per plan.

---

## 13. Open questions

1. **Schema evolution** — user re-uploads with a new column.
   Today's design replaces the whole table; should we ALTER
   instead? Defer; replace is safer.
2. **Incremental load** — `append` vs `replace` modes. Add
   `append` once schema-evolution is solved.
3. **Excel multi-sheet** — import a workbook's tabs as separate
   datasets in one go. v2.

---

## 14. References

- [12-import-upload.md](../research/modules/12-import-upload.md)
- [01-datasource-connection.md](../research/modules/01-datasource-connection.md)
- [03-dataset.md](../research/modules/03-dataset.md)
- [27-cost-observability.md](../research/modules/27-cost-observability.md)
- tus.io protocol, RFC 7233
- Google Sheets API v4
