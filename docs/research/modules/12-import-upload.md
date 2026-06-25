# 12 · Import & Upload

> Getting data INTO DBExec, when the user can't (or won't) configure
> a live datasource. CSV / Excel / JSON / Parquet drops, URL pulls,
> Google-Sheets links, "uploaded dataset" workflows.
>
> Sister modules:
> [03 · Dataset](03-dataset.md) (the destination), [01 · Datasource](01-datasource-connection.md)
> (the live alternative), [13 · Export](13-export-download.md) (the
> opposite flow).

**Depends on:** Dataset (03), Cache (05)
**Unblocks:** Self-serve analyst flows (no IT involvement)
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Tool | Upload path | Limits | Storage backend |
|---|---|---|---|
| **Tableau Public / Online** | Drag CSV/XLSX/JSON, "Add to data source" | 15M rows (Public), 16GB (Cloud) | Hyper extract |
| **Power BI** | Get Data → File. Same flow as live but data resides in dataset | 1GB per dataset (Pro), 100GB (Premium) | VertiPaq |
| **Looker Studio** | Upload CSV (free), Google Sheets connector | 100MB per upload | BigQuery |
| **Metabase** | "Upload CSV" since v0.49 — drops into the application DB | 200MB by default | App DB Postgres |
| **Mode** | Upload via SQL Editor's "+ Upload" | 100MB | Mode's redshift |
| **Hex** | Notebook "Files" panel, multi-file | 5GB per project | Hex's DuckDB or your warehouse |

**The patterns to copy:**

- Push the actual rows into a *managed datasource* — a Postgres
  schema that DBExec owns, separate from any customer-connected
  database. Hides storage details from the user.
- Idempotency by content hash. Re-uploading the same file with the
  same column set returns the existing dataset id rather than
  creating a duplicate.
- Quota per organisation. Self-serve uploads without a quota are
  how vendors discover their billing model the hard way.
- Streaming parse + bulk insert. Reading a 500MB CSV into memory
  is a non-starter.

## 2. DBExec today

- **Nothing.** Every dataset is built from a live datasource via
  SQL. No upload path exists. Users who have CSVs in hand are
  told to load them into their own Postgres / Snowflake / etc.
- This pushes a ton of low-value friction onto the analyst: "I
  have one file with 80k rows and I want a quick chart" turns
  into a 2-hour DBA exercise.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| UP-G01 | CSV upload | P0 | M |
| UP-G02 | XLSX upload | P0 | M |
| UP-G03 | JSON upload (line-delimited + array forms) | P1 | S |
| UP-G04 | Parquet upload | P1 | M |
| UP-G05 | URL pull (HTTP/S) | P1 | M |
| UP-G06 | Google Sheets sync | P1 | M |
| UP-G07 | Tus.io resumable upload (>500MB) | P1 | M |
| UP-G08 | Content-hash idempotency | P0 | S |
| UP-G09 | Per-org storage quota | P0 | S |
| UP-G10 | Per-org row-count quota | P1 | S |
| UP-G11 | Schema inference (types from sample rows) | P0 | M |
| UP-G12 | Column-name sanitization (sql-safe identifiers) | P0 | S |
| UP-G13 | Refresh / replace existing dataset from new file | P1 | M |
| UP-G14 | Append / incremental upload | P2 | M |
| UP-G15 | Mapping templates (skip rows, header offset, ...) | P1 | M |
| UP-G16 | Per-column manual type override on upload | P1 | S |
| UP-G17 | Virus / malware scan before parse | P1 | S |
| UP-G18 | Upload audit + size + sha256 in audit log | P0 | S |
| UP-G19 | Background processing (worker queue) for big files | P1 | M |

## 4. Target architecture

### 4.1 Where the rows actually live — the managed datasource

For every org that has uploads enabled, DBExec provisions exactly
one Postgres database (separate from the master DB and the org's
own master DB) called the *managed datasource*. Schema:
`up_<short_org_id>`. Each uploaded file becomes a table inside it.

```
DBExec Cluster
├─ master_db                          # platform-level
├─ org_<id>_db                        # one per org, app state
└─ managed_uploads_db                 # one DB, all orgs as schemas
   ├─ up_3f9aa01b /  invoices_q3      ← org A
   │              /  product_catalog
   ├─ up_d6c4e218 /  signups_2024     ← org B
   │              /  experiments
```

Why a separate DB:

- **Backup cadence differs.** Uploaded data is customer-owned but
  not source-of-truth; nightly snapshots are enough.
- **Quota enforcement.** Postgres per-schema disk usage is queryable
  via `pg_total_relation_size`; gate inserts against the org's quota.
- **Connection-pool isolation.** Uploads are heavy writes; mixing
  with app-state reads causes pool contention.
- **Cleanup.** Deleting an org → drop its schema, done.

### 4.2 Entity additions

```ts
// src/shared/db/shared_entity/dataset.entity.ts — additions
@Column({ length: 32, nullable: true })
kind?: 'sql' | 'upload' | 'url' | 'google_sheets';

@Column('uuid', { nullable: true })
managedDatasourceId?: string;                 // → DatasourceS for the managed DB

@Column({ length: 64, nullable: true })
targetSchema?: string;                         // up_<orgid>

@Column({ length: 100, nullable: true })
targetTable?: string;                          // resolved table name

@Column('jsonb', { nullable: true })
uploadSourceMeta?: {
  originalName?: string;
  sizeBytes: number;
  sha256: string;
  format: 'csv' | 'xlsx' | 'json' | 'jsonl' | 'parquet';
  rowCount: number;
  columnCount: number;
  parsedAt: string;                            // ISO
  refreshStrategy: 'replace' | 'append';
  url?: string;                                // for url-source datasets
  googleSheetId?: string;                      // for sheets-source datasets
};

@Column('bigint', { nullable: true })
rowCountHint?: number;                          // duplicated from meta for fast filtering

@Column('timestamptz', { nullable: true })
lastRefreshAt?: Date;

@Column({ length: 16, nullable: true })
lastRefreshStatus?: 'ok' | 'failed' | 'running';
```

```ts
// src/shared/db/shared_entity/orgStorageQuota.entity.ts
@Entity('org_storage_quota')
export class OrgStorageQuota {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { unique: true }) organisationId!: string;
  @Column('bigint', { default: 0 }) usedBytes!: number;
  @Column('bigint') maxBytes!: number;             // default 1 GiB
  @Column('bigint', { default: 0 }) usedRows!: number;
  @Column('bigint') maxRows!: number;              // default 5 million
  @Column('int', { default: 0 }) usedDatasets!: number;
  @Column('int') maxDatasets!: number;             // default 100
  @UpdateDateColumn() updatedOn!: Date;
}
```

### 4.3 Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/datasets/upload/csv` | multipart CSV (≤500 MiB) |
| POST | `/datasets/upload/xlsx` | multipart XLSX |
| POST | `/datasets/upload/json` | multipart JSON / NDJSON |
| POST | `/datasets/upload/parquet` | multipart Parquet |
| POST | `/datasets/upload/url` | server pulls from URL (deny private IPs — see [01 · Datasource](01-datasource-connection.md) §SSRF guard) |
| POST | `/datasets/upload/google-sheets` | OAuth'd sheet pull |
| POST | `/api/v1/upload/tus` | tus.io resumable upload (mounts a tus server for >500 MiB) |
| POST | `/datasets/:id/refresh-from-file` | replace a dataset's rows from a new upload (same column schema) |
| POST | `/datasets/:id/append-from-file` | append rows from a new upload |
| GET | `/quota/storage` | org's quota usage + limits |

### 4.4 Upload pipeline (CSV — others are variations)

```
multipart/form-data           ┌─────────────────────────────────┐
   ↓                          │ multer (memory or disk storage) │
   ↓                          └─────────────────────────────────┘
   ↓
   ▼
1. virus scan (ClamAV optional) — fail closed if enabled
   ↓
2. sha256 hash of bytes
   ↓
3. quota precheck (sizeBytes <= maxBytes - usedBytes)
   ↓
4. idempotency check (existing dataset with same sha256 + org → 200 OK, return existing)
   ↓
5. format detection (sniff first 1KiB)
   ↓
6. streaming parse — papaparse for CSV, exceljs stream for XLSX,
   ndjson reader for JSONL, parquetjs for Parquet
   ↓
7. column inference (first 100 rows): type for each column,
   nullability, name sanitisation
   ↓
8. provision a target table on the managed datasource:
   CREATE TABLE up_<orgid>.up_<timestamp_id> (<col1> <type1>, ...)
   ↓
9. COPY FROM STDIN (Postgres) — bulk insert from a stream
   ↓
10. compute row count, update org_storage_quota.used_bytes / used_rows
    ↓
11. persist Dataset row with kind='upload' + uploadSourceMeta
    ↓
12. audit log + webhook event (dataset.uploaded)
    ↓
13. return Dataset to caller
```

Each numbered step is a single named function in the controller so a
failure at step 9 (say, COPY errors out) can be caught, the
partially-created table dropped, and the org quota refunded.

### 4.5 Streaming parse — why mandatory

For a 500MB CSV with 5M rows, in-memory parse + insert needs ~3GB
peak heap. Streaming brings it under 200MB. Pipeline:

```ts
import { Transform, pipeline } from 'node:stream';
import { from as copyFrom } from 'pg-copy-streams';
import { parse as csvParse } from 'csv-parse';

async function streamCsvIntoTable(
  file: Express.Multer.File,
  client: PoolClient,
  table: string,
  columns: ColumnDef[],
): Promise<{ rowCount: number }> {
  const parser = csvParse({
    columns: true,           // first row is header
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,      // tolerate occasional broken quotes
  });

  const stringify = new Transform({
    objectMode: true,
    transform(row, _, cb) {
      // Convert object row → tab-separated literal for COPY
      const line = columns.map(c => {
        const v = row[c.originalName];
        if (v == null || v === '') return '\\N';   // null sentinel
        const s = String(v).replace(/\\/g, '\\\\')
                            .replace(/\t/g, '\\t')
                            .replace(/\n/g, '\\n')
                            .replace(/\r/g, '');
        return s;
      }).join('\t') + '\n';
      cb(null, line);
    },
  });

  const copyStream = client.query(copyFrom(
    `COPY ${q(table)} (${columns.map(c => q(c.name)).join(', ')})
     FROM STDIN WITH (FORMAT text, NULL '\\N')`,
  ));

  let rowCount = 0;
  parser.on('readable', () => { while (parser.read()) rowCount++; });

  await new Promise<void>((resolve, reject) => {
    pipeline(
      // input stream — multer disk path or memory buffer
      file.buffer ? Readable.from(file.buffer) : fs.createReadStream(file.path),
      parser,
      stringify,
      copyStream,
      (err) => err ? reject(err) : resolve(),
    );
  });

  return { rowCount };
}
```

### 4.6 Column inference

```ts
type Inferred = {
  name: string;         // sanitised (snake_case, ascii)
  originalName: string; // raw from header
  type: 'bool' | 'smallint' | 'integer' | 'bigint'
        | 'numeric' | 'real' | 'double precision'
        | 'date' | 'timestamptz' | 'text';
  nullable: boolean;
};

function inferColumns(rows: Record<string, string>[]): Inferred[] {
  if (rows.length === 0) throw new BadRequest('Empty file');
  const sample = rows.slice(0, Math.min(rows.length, 100));
  const headers = Object.keys(sample[0]);

  return headers.map(rawName => {
    const name = sanitiseColumnName(rawName);    // see §4.7
    const observations = sample.map(r => r[rawName]);
    const type = dominantType(observations);
    const nullable = observations.some(v => v == null || v === '');
    return { name, originalName: rawName, type, nullable };
  });
}

function dominantType(values: (string | null)[]): Inferred['type'] {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (v == null || v === '') continue;
    counts[detect(v)] = (counts[detect(v)] || 0) + 1;
  }
  // Numeric beats bool when both could match (e.g. '0','1' samples)
  const order = ['bool','smallint','integer','bigint','numeric','real',
                 'double precision','date','timestamptz','text'];
  return order.find(t => counts[t]) as Inferred['type'] ?? 'text';
}

function detect(v: string): Inferred['type'] {
  const s = v.trim();
  if (/^(true|false)$/i.test(s)) return 'bool';
  if (/^-?\d{1,4}$/.test(s) && Math.abs(Number(s)) < 32768) return 'smallint';
  if (/^-?\d+$/.test(s) && Math.abs(Number(s)) < 2147483648) return 'integer';
  if (/^-?\d+$/.test(s)) return 'bigint';
  if (/^-?\d+\.\d+$/.test(s)) return 'numeric';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
  if (!isNaN(Date.parse(s)) && /\d{4}/.test(s) && s.length > 10) return 'timestamptz';
  return 'text';
}
```

User can override any inferred type via the upload-mapping step
(see §6).

### 4.7 Column name sanitisation

```ts
function sanitiseColumnName(raw: string): string {
  // Lowercase, replace non-ascii word chars with _, collapse runs,
  // trim leading/trailing underscores, prefix _ if starts with digit.
  let n = raw.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(n)) n = '_' + n;
  if (n.length === 0) n = '_unnamed';
  if (n.length > 63) n = n.slice(0, 63);
  return n;
}
```

Duplicate sanitised names (e.g. "Sales-2024" and "sales 2024" both
→ `sales_2024`) get a `_2`, `_3` suffix.

### 4.8 Refresh strategies

Two modes on `dataset.uploadSourceMeta.refreshStrategy`:

- **`replace`** (default): TRUNCATE target table, COPY new rows.
  Schema must match (same columns, same types). Schema-drift is
  surfaced as a 400 with a diff.
- **`append`**: COPY rows in. Skips any row whose primary-key
  column (if declared) already exists. Useful for daily drops.

### 4.9 Quota enforcement

```ts
async function ensureQuotaForUpload(
  orgId: string,
  sizeBytes: number,
  rowCount: number | null,
  conn: DataSource,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const quota = await conn.getRepository(OrgStorageQuota)
    .findOne({ where: { organisationId: orgId } });
  if (!quota) return { ok: false, reason: 'quota.not_configured' };

  if (quota.usedBytes + sizeBytes > quota.maxBytes)
    return { ok: false, reason: 'quota.storage.exceeded' };
  if (rowCount !== null && quota.usedRows + rowCount > quota.maxRows)
    return { ok: false, reason: 'quota.rows.exceeded' };
  if (quota.usedDatasets + 1 > quota.maxDatasets)
    return { ok: false, reason: 'quota.datasets.exceeded' };

  return { ok: true };
}

async function commitQuotaAfterUpload(
  orgId: string,
  sizeBytes: number,
  rowCount: number,
  conn: DataSource,
) {
  await conn.query(`
    UPDATE org_storage_quota
       SET used_bytes = used_bytes + $1,
           used_rows = used_rows + $2,
           used_datasets = used_datasets + 1,
           updated_on = now()
     WHERE organisation_id = $3`,
    [sizeBytes, rowCount, orgId]);
}
```

Atomic update; can be done in the same transaction as the
Dataset insert so a rollback recovers the quota cleanly.

### 4.10 URL pull

```ts
// POST /datasets/upload/url   body: { url: string, name: string, format: 'csv'|'json' }
async function uploadFromUrl(req, res) {
  const { url, name, format } = req.body;

  // SSRF guard — module 01 ipReachability.shouldBlockHost
  const host = new URL(url).hostname;
  if (shouldBlockHost(host)) return sendResponse(res, false, 400, 'url.blocked');

  // Stream the response straight into the pipeline — no temp file.
  const upstream = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'DBExec/1.0' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!upstream.ok) return sendResponse(res, false, 502, 'url.fetch_failed');

  const contentLength = Number(upstream.headers.get('content-length') || 0);
  if (contentLength > MAX_UPLOAD_BYTES) return sendResponse(res, false, 413, 'url.too_large');

  // Tee the body — hash + parse + store happen in parallel
  // ... (same pipeline as CSV upload, source stream is upstream.body)
}
```

### 4.11 Resumable uploads (tus.io)

For files > 500MB or unreliable client networks. Mount `@tus/server`
at `/api/v1/upload/tus`. Client uploads in chunks; when the upload
completes the `onUploadFinish` hook drops the finalised file into
the same processing pipeline (now reading from local disk instead
of multer memory).

```ts
import { Server as TusServer } from '@tus/server';
import { FileStore } from '@tus/file-store';

const tus = new TusServer({
  path: '/api/v1/upload/tus',
  datastore: new FileStore({ directory: '.tus' }),
  respectForwardedHeaders: true,
  onUploadFinish: async (req, res, upload) => {
    const orgId = res.locals.orgData.id;
    // Move into the processing pipeline as a background job.
    await scheduleQueue.add('upload:process', {
      uploadId: upload.id,
      orgId,
      filename: upload.metadata?.filename,
    });
    return res;
  },
});
app.all('/api/v1/upload/tus*', tus.handle.bind(tus));
```

Background job picks up the local file, runs the same pipeline,
emits an audit + webhook on completion.

### 4.12 Google Sheets

OAuth-based. Org admin authorises DBExec to read sheets; the
backend stores a refresh token. Endpoint accepts a sheet URL,
parses it via the Google Sheets API, and treats the result as a
streaming CSV.

For now, **read-only** and **manual refresh** (user clicks Refresh
in the dataset view). Scheduled sync is module-15.

## 5. APIs in detail

### 5.1 `POST /datasets/upload/csv`

**Request (multipart/form-data):**

```
file:           <binary>           required
name:           "Q3 Invoices"      required
description:    "..."              optional
refreshStrategy:"replace"          optional, default "replace"
primaryKey:     "invoice_id"       optional, only meaningful for append
columnTypes:    {"qty":"integer"}  optional, override inference per column
```

**Response (200):**

```json
{
  "status": true,
  "code": 200,
  "data": {
    "id": "01J7...",
    "name": "Q3 Invoices",
    "kind": "upload",
    "rowCount": 8421,
    "columnCount": 14,
    "uploadSourceMeta": {
      "originalName": "invoices.csv",
      "sizeBytes": 12345678,
      "sha256": "f3a8...",
      "format": "csv",
      "rowCount": 8421,
      "columnCount": 14,
      "parsedAt": "2026-07-08T11:23:00Z",
      "refreshStrategy": "replace"
    },
    "fields": [
      { "name": "invoice_id", "type": "bigint", "nullable": false },
      { "name": "issued_at",  "type": "timestamptz", "nullable": true }
    ]
  }
}
```

**Errors:**

| code | reason | message |
|---|---|---|
| 400 | empty file | `upload.empty` |
| 400 | malformed format (CSV parse error) | `upload.csv.parse_error` with row number |
| 400 | column inference inconsistent (rare) | `upload.inference.ambiguous` |
| 400 | schema mismatch on refresh | `upload.schema.drift` + diff |
| 409 | duplicate (sha256 already uploaded) | returns existing dataset, status 200 with a `duplicate: true` flag — not an error |
| 413 | size > MAX_UPLOAD_BYTES (500MB) | `upload.too_large` |
| 413 | rowCount > MAX_UPLOAD_ROWS (10M) | `upload.too_many_rows` |
| 413 | org quota exceeded | `quota.storage.exceeded` etc. |
| 422 | unsupported encoding | `upload.encoding.unsupported` |
| 500 | virus detected | `upload.virus.detected` (only if ClamAV is wired) |

## 6. FE specs

### 6.1 Upload wizard

```
Step 1: Drop file or pick URL / Sheets
Step 2: Preview first 50 rows
       - per-column type override dropdown
       - per-column rename
       - skip-rows (some users have 3-row Excel headers)
Step 3: Name + description + refresh strategy
Step 4: Click "Create dataset" → POST endpoint → redirect to dataset detail
```

Step 2's preview comes from a **dry-run endpoint** that runs only
column inference (not the actual COPY):

```
POST /datasets/upload/csv?dryRun=true
→ { columns: [...], rowCountEstimate: 8421, previewRows: [...50] }
```

### 6.2 Quota meter on every upload screen

Top-of-page chip:

```
Storage: 380 MiB / 1 GiB · Rows: 1.2M / 5M · Datasets: 12 / 100
```

Yellow at 80%, red at 95%. Clicking opens a per-dataset breakdown.

### 6.3 Refresh dialog

For an existing upload-kind dataset:

- "Replace from file" → opens a strict-schema-match uploader.
- "Append from file" → opens an uploader that warns about
  primary-key dedupe.
- "Refresh from URL" / "Refresh from Sheet" — one-click for kinds
  that have a remote source.

## 7. Code recipes

### 7.1 Full upload controller

See [BE implementation doc](../../be-implementation/DBEXEC-BE-IMPLEMENTATION.md)
§12 for the complete `uploadDatasetCsv` controller — that's the
canonical implementation. This module describes *what* and *why*;
the BE doc is the *how*.

### 7.2 Sample-row dry run

```ts
async function dryRunUpload(req, res) {
  if (!req.file) return sendResponse(res, false, 400, 'upload.no_file');

  // Sniff the first chunk, parse the first 100 rows, infer types,
  // return immediately. No DB writes.
  const head = req.file.buffer.subarray(0, 64 * 1024).toString('utf8');
  const rows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    csvParse(head, { columns: true, skip_empty_lines: true, bom: true })
      .on('readable', function () { let r; while ((r = this.read())) rows.push(r); })
      .on('error', reject)
      .on('end', () => resolve());
  });
  const columns = inferColumns(rows.slice(0, 100));
  return sendResponse(res, true, 200, '', {
    columns,
    previewRows: rows.slice(0, 50),
  });
}
```

### 7.3 Refresh-from-file with schema check

```ts
async function refreshDatasetFromFile(req, res) {
  const dataset = await loadDataset(req.params.id, res.locals.orgData.id);
  if (dataset.kind !== 'upload')
    return sendResponse(res, false, 400, 'refresh.not_upload');

  // Parse incoming, infer columns.
  const newCols = inferColumns(/* ... */);

  // Compare with existing columns. Same names, compatible types?
  const oldCols = await loadDatasetFields(dataset.id);
  const diff = diffColumns(oldCols, newCols);
  if (diff.added.length || diff.removed.length || diff.typeChanged.length) {
    return sendResponse(res, false, 400, 'refresh.schema_drift', null, [diff]);
  }

  // TRUNCATE + COPY inside a transaction. On failure, rollback —
  // quota stays consistent.
  await managedPool.transaction(async (tx) => {
    await tx.query(`TRUNCATE ${q(dataset.targetTable!)}`);
    await streamCsvIntoTable(req.file!, tx, dataset.targetTable!, newCols);
  });
}
```

## 8. Test plan

```
UP-CSV-H-01     small CSV → dataset created, rows persisted
UP-CSV-H-02     CSV with BOM → BOM stripped
UP-CSV-H-03     CSV with newlines in quoted cells → preserved
UP-CSV-H-04     CSV with backslash + tab in data → COPY escape correct
UP-CSV-N-01     empty file → 400 upload.empty
UP-CSV-N-02     CSV with mismatched column count on row 17 → 400 with row number
UP-CSV-N-03     CSV header has duplicate column names → suffixes _2/_3 applied
UP-CSV-N-04     CSV column name with emoji → sanitised to _unnamed (or transliteration)
UP-XLSX-H-01    xlsx with two sheets → first sheet used, others ignored
UP-XLSX-H-02    xlsx with formula cells → resolved value used, not formula text
UP-XLSX-N-01    xlsx > 100MB → handled via tus path, not multipart
UP-JSON-H-01    JSONL (one object per line) → loaded
UP-JSON-H-02    JSON array of objects → loaded
UP-JSON-N-01    JSON array of mixed-shape objects → 400 inference ambiguous
UP-PARQ-H-01    parquet → typed columns preserved (int64, decimal, timestamp)
UP-URL-H-01     URL pull (public CSV) → dataset created
UP-URL-N-01     URL with 169.254.* → blocked by SSRF guard
UP-URL-N-02     URL returning 404 → 502 url.fetch_failed
UP-URL-N-03     URL returning Content-Length > limit → 413
UP-SHEETS-H-01  Google Sheet first sheet → loaded
UP-SHEETS-N-01  revoked OAuth → 401 sheets.auth_revoked
UP-TUS-H-01     2 GiB upload via tus → completes, dataset created
UP-IDEMP-H-01   re-upload same file (same sha256) → returns existing dataset
UP-IDEMP-N-01   re-upload same file with different name → still de-duped
UP-QUOTA-N-01   upload that would exceed maxBytes → 413 quota.storage.exceeded
UP-QUOTA-N-02   upload that would exceed maxRows → 413 quota.rows.exceeded
UP-QUOTA-H-01   delete dataset → quota usedBytes / usedRows decremented
UP-REFRESH-H-01 refresh w/ same schema → rows replaced, count updated
UP-REFRESH-N-01 refresh w/ extra column → 400 with diff
UP-APPEND-H-01  append rows with PK → dedupe correct
UP-INFER-H-01   ISO-date string → date column
UP-INFER-H-02   ISO timestamp → timestamptz
UP-INFER-H-03   '0','1' samples → smallint (not bool)
UP-INFER-H-04   mixed '0','true' → text (no dominant type)
UP-AUDIT-H-01   audit row written with size + sha256 + format
UP-VIRUS-N-01   EICAR test file → 500 upload.virus.detected (if ClamAV on)
```

## 9. Migration & rollout

1. **Phase 1**: managed datasource provisioning service + Dataset
   entity additions + `org_storage_quota` table. No FE.
2. **Phase 2**: CSV + XLSX upload endpoints + FE wizard. Feature
   flag `enableDatasetUpload` (default off).
3. **Phase 3**: JSON / Parquet / URL / Sheets.
4. **Phase 4**: tus.io resumable uploads, virus scan, refresh
   workflows, append + primary-key dedupe.

Per-org rollout. Quotas configured per pricing plan at the master
level.

## 10. Open questions

- **Encoding detection.** UTF-8 covers ~95% of CSV. Should we
  auto-detect ISO-8859-1 and re-encode, or fail with a clear
  "please re-save as UTF-8"? Recommend the latter — encoding
  detection is unreliable.
- **Empty cells in numeric columns.** Currently treated as NULL.
  Should there be a "fill with 0" option? Add as a per-column
  setting in the mapping step.
- **Excel date weirdness.** Excel stores some dates as floats
  (days since 1900-01-01) with a 29 Feb 1900 bug. exceljs handles
  this but worth a tested case.
- **CSV with arbitrary quotes inside text** — `relax_quotes: true`
  in csv-parse tolerates this but produces unexpected splits on
  pathological inputs. Document.

## 11. References

- tus.io spec: <https://tus.io/protocols/resumable-upload>
- pg-copy-streams: <https://github.com/brianc/node-pg-copy-streams>
- csv-parse stream mode: <https://csv.js.org/parse/options/>
- exceljs streaming reader: <https://github.com/exceljs/exceljs#streaming-xlsx-reader>
- Metabase CSV upload design: <https://www.metabase.com/blog/import-csv>
- ClamAV node binding: <https://github.com/kylefarris/clamscan>

## Appendix · Review additions

- **tus.io** for resumable uploads on flaky connections.
- **URL pull** with SSRF guard reusing `shouldBlockHost`.
- **Virus scan** opt-in via ClamAV.
- **Storage quota** per org with three independent dimensions
  (bytes, rows, datasets).
- **Idempotency by sha256** — same file twice = no-op.
- **Mapping templates** so repeat uploads can reuse a schema map.
