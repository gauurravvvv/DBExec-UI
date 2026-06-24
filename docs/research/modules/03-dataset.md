# 03 · Dataset

> The queryable unit. Every analysis, visual, RLS rule, alert, and
> subscription points at a dataset. This module is "mature but
> upgradable" in DBExec — we have SQL + custom fields; we lack
> uploads, lineage, freshness, usage stats, and physical-vs-virtual.

**Depends on:** Datasource (01)
**Unblocks:** Semantic Layer (02), Query Compiler (04), Analyses (06),
RLS (09), Alerts (15)
**DBExec maturity:** 🟡

---

## 0. Context

A dataset = (datasource_id, connection_id, name, sql, custom_fields[]).
Today it's always **virtual** (wraps a SQL query). Industry tools split
virtual vs **physical** (points at a real table/view) for a fast-path
on schema discovery and aggregate awareness.

## 1. Industry baseline

| Tool | Concept | Physical / Virtual |
|---|---|---|
| Tableau | Data source | Live connection or extract (Hyper) |
| Power BI | Table | Imported / DirectQuery / Composite |
| Looker | View | Always physical (sql_table_name) or derived |
| Metabase | Model / Question | Models can be SQL or GUI-built |
| Superset | Dataset | Physical OR virtual |

Superset's physical/virtual split is the cleanest model. Adopt it.

## 2. DBExec today

| Aspect | Status | Notes |
|---|---|---|
| Entity `Dataset` | ✅ | `shared/db/shared_entity/dataset.entity.ts` |
| Virtual SQL | ✅ | `dataset.sql` |
| Custom fields | ✅ | `DatasetField` per dataset / per analysis |
| Preview | ✅ | `/dataset/preview` |
| Distinct values | ✅ | `/dataset/distinct/:col` |
| Duplicate | ✅ | `/dataset/duplicate/:id` |
| Query-builder-backed dataset | ✅ | `/dataset/builder/*` |
| Physical (point at a table) | ❌ | — |
| CSV / XLSX / JSON upload | ❌ | — |
| Google Sheets | ❌ | — |
| Lineage | ❌ | — |
| Usage stats | ❌ | — |
| Freshness badge | ❌ | — |
| Versioning | ❌ | — |
| Compare-with-previous | ❌ | — |

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| DST-G01 | Physical dataset (target_table + target_schema) | P1 |
| DST-G02 | CSV upload → managed datasource → dataset | P0 |
| DST-G03 | XLSX upload | P0 |
| DST-G04 | JSON / NDJSON upload | P1 |
| DST-G05 | Parquet upload | P2 |
| DST-G06 | Google Sheets connector | P1 |
| DST-G07 | Lineage graph endpoint | P1 |
| DST-G08 | Usage stats per dataset (queries, p95, error rate) | P1 |
| DST-G09 | Freshness badge (last-refresh + SLA) | P1 |
| DST-G10 | Dataset version history | P2 |
| DST-G11 | Sample-data preview (anonymous read) | P2 |
| DST-G12 | Column-level statistics (min/max/null %) | P2 |
| DST-G13 | Reusable filters (segments) lift from analysis to dataset | P1 |
| DST-G14 | Dataset folders / hierarchical organisation | P1 |
| DST-G15 | Tagging + collections (covered in 17) | — |

## 4. Target architecture

### 4.1 Physical + Virtual model

```sql
ALTER TABLE dataset
  ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'virtual',
                                                 -- virtual | physical | upload | sheet
  ADD COLUMN target_schema varchar(63),
  ADD COLUMN target_table varchar(128),
  ADD COLUMN upload_source_meta jsonb,           -- { originalName, sizeBytes, format, parsedAt }
  ADD COLUMN sheet_url varchar(512),
  ADD COLUMN sheet_oauth_id uuid,                -- OAuth credential ref
  ADD COLUMN row_count_hint bigint,              -- best-effort count
  ADD COLUMN last_refresh_at timestamptz,
  ADD COLUMN last_refresh_status varchar(16),    -- ok | failed
  ADD COLUMN last_refresh_error text,
  ADD COLUMN sla_freshness_secs int,             -- e.g. 3600 → "must be fresh in last hour"
  ADD COLUMN cache_ttl_secs int NOT NULL DEFAULT 300,
  ADD COLUMN version int NOT NULL DEFAULT 1;
```

Physical datasets skip the `WITH base AS (...)` wrap in the compiler.

### 4.2 Managed datasource for uploads

A single DBExec-internal Postgres instance per org holds uploaded
tables. The instance is provisioned on the first upload. Tables are
named `up_<orgshort>_<userprefix>_<ts>`.

### 4.3 Lineage graph

Computed on demand from joins:

```
dataset → analyses (where analysis.dataset_id = dataset.id)
       → dashboards (where dashboard.snapshot references those analyses)
       → subscriptions (where subscription.target_id in dashboards)
       → alerts (where alert.dataset_id = dataset.id)
       → rls_rules (where rls_rule.dataset_id = dataset.id)
       → semantic_models (where semantic_model.dataset_id = dataset.id)
```

### 4.4 Usage stats

Add a tiny event table:

```sql
CREATE TABLE dataset_run (
  id            bigserial PRIMARY KEY,
  dataset_id    uuid NOT NULL,
  caller_id     uuid,                             -- nullable for service runs
  source        varchar(32) NOT NULL,             -- preview|analysis|dashboard|alert|subscription|api
  rows_returned int,
  duration_ms   int NOT NULL,
  cache_hit     boolean NOT NULL DEFAULT false,
  error         text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON dataset_run (dataset_id, occurred_at DESC);
```

Aggregate to a daily summary nightly:

```sql
CREATE TABLE dataset_run_daily (
  dataset_id  uuid,
  day         date,
  runs        int,
  cache_hits  int,
  p50_ms      int,
  p95_ms      int,
  p99_ms      int,
  error_count int,
  PRIMARY KEY (dataset_id, day)
);
```

### 4.5 Version history

```sql
CREATE TABLE dataset_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  version     int NOT NULL,
  sql         text,
  fields_snapshot jsonb,
  comment     text,
  author_id   uuid NOT NULL,
  created_on  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);
```

Save creates a new row; revert sets the dataset back to that version.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST   | `/dataset` | Create virtual |
| POST   | `/dataset/physical` | Create physical |
| POST   | `/dataset/upload/csv` | Upload CSV (multipart) |
| POST   | `/dataset/upload/xlsx` | Upload XLSX |
| POST   | `/dataset/upload/json` | Upload JSON/NDJSON |
| POST   | `/dataset/sheet` | Connect Google Sheet |
| POST   | `/dataset/sheet/:id/refresh` | Re-pull from sheet |
| POST   | `/dataset/:id/refresh` | Re-materialise (upload-backed) |
| GET    | `/dataset/:id/lineage` | Graph (downstream consumers) |
| GET    | `/dataset/:id/usage` | Stats (last 30d) |
| GET    | `/dataset/:id/columns/stats` | Per-column min/max/null% |
| GET    | `/dataset/:id/versions` | List versions |
| POST   | `/dataset/:id/versions/:v/revert` | Revert |

## 6. UI specs

### 6.1 Dataset list page

Add columns:

- **Kind** badge: SQL · Physical · CSV · Sheet
- **Last refresh** with traffic-light: green/yellow/red vs SLA
- **Usage** sparkline: queries per day, last 30d

Add bulk action: "Tag", "Move to folder", "Delete".

### 6.2 Add Dataset modal

Wizard with 4 options:

```
┌──────────────────────────────────────────────────────────────┐
│  Add Dataset                                                 │
│                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────┐ │
│   │ SQL         │  │ Table       │  │ Upload      │  │Sheet│ │
│   │ (virtual)   │  │ (physical)  │  │ CSV / XLSX  │  │     │ │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Dataset detail page

Tabs:

- **Preview** (existing)
- **Columns** (new) — list with type, null %, distinct count, sample
  values
- **Custom fields** (existing)
- **Lineage** (new) — interactive graph
- **Usage** (new) — sparkline + slow-query table
- **Versions** (new) — list + diff + revert
- **Semantic model** (new — link to module 02 editor)

### 6.4 CSV upload UX

Following Power BI / Google Data Studio pattern:

```
Step 1: choose file
Step 2: parse preview — show first 10 rows + inferred types
        - user can change inferred type per column
        - user can rename columns
        - user can drop columns
Step 3: name + description + tags
Step 4: import (progress bar)
```

## 7. Code recipes

### 7.1 CSV upload controller (Express + multer)

```ts
// src/modules/datasets/controllers/uploadDatasetCsv.ts
import { Request, Response } from 'express';
import Papa from 'papaparse';
import { ManagedDatasourceService } from '../services/managedDatasource.service';
import { Dataset } from '../../../shared/db/shared_entity/dataset.entity';
import { DatasetField } from '../../../shared/db/shared_entity/dataset_field.entity';
import sendResponse from '../../../shared/utility/response';
import { CODE } from '../../../../config/config';

export default async function uploadDatasetCsv(req: Request, res: Response) {
  const file = req.file; // multer memoryStorage
  if (!file) return sendResponse(res, false, CODE.BAD_REQUEST, 'no file');
  const { orgData, master_db_connection, loggedInId } = res.locals;

  // 1. Parse + infer
  const { rows, columns } = await parseCsv(file.buffer);
  if (rows.length === 0)
    return sendResponse(res, false, CODE.BAD_REQUEST, 'empty file');
  if (rows.length > 1_000_000)
    return sendResponse(res, false, CODE.BAD_REQUEST, 'over 1M rows');

  // 2. Provision (or reuse) the managed datasource
  const managed = await ManagedDatasourceService.ensureFor(orgData.id);

  // 3. Create table
  const tableName = `up_${shortOrgId(orgData.id)}_${Date.now()}`;
  const columnDdl = columns
    .map(c => `${q(c.name)} ${pgType(c.type)}`).join(', ');
  await managed.query(`CREATE TABLE ${q(tableName)} (${columnDdl})`);

  // 4. Bulk insert
  await batchInsert(managed, tableName, columns, rows);

  // 5. Persist dataset + dataset_fields
  const ds = new Dataset();
  ds.organisationId = orgData.id;
  ds.datasourceId  = managed.datasourceId;
  ds.name          = req.body.name || file.originalname;
  ds.description   = req.body.description || '';
  ds.kind          = 'upload';
  ds.targetSchema  = 'public';
  ds.targetTable   = tableName;
  ds.sql           = `SELECT * FROM ${q(tableName)}`;
  ds.uploadSourceMeta = {
    originalName: file.originalname,
    sizeBytes: file.size,
    format: 'csv',
    parsedAt: new Date().toISOString(),
    rowCount: rows.length,
  };
  ds.rowCountHint = rows.length;
  ds.lastRefreshAt = new Date();
  ds.lastRefreshStatus = 'ok';
  await master_db_connection.getRepository(Dataset).save(ds);

  for (const c of columns) {
    const f = new DatasetField();
    f.datasetId  = ds.id;
    f.name       = c.name;
    f.dataType   = c.type;
    await master_db_connection.getRepository(DatasetField).save(f);
  }

  // Audit
  await auditLogger.logAuditToOrg({
    connection: master_db_connection, req, res,
    module: AUDIT_MODULES.DATASET, action: AUDIT_ACTIONS.CREATE,
    entityName: 'Dataset (upload)', entityId: ds.id,
    metadata: { rowCount: rows.length, format: 'csv' },
  });

  return sendResponse(res, true, CODE.SUCCESS, 'dataset created', ds);
}

async function parseCsv(buf: Buffer): Promise<ParseResult> {
  const rows: Record<string, string>[] = [];
  await new Promise<void>((resolve, reject) => {
    Papa.parse(buf.toString('utf8'), {
      header: true,
      skipEmptyLines: true,
      complete: r => { rows.push(...(r.data as any[])); resolve(); },
      error: e => reject(e),
    });
  });
  const columns = inferColumns(rows);
  return { rows, columns };
}

function inferColumns(rows: any[]) {
  const sample = rows.slice(0, 100);
  const cols: { name: string; type: 'bool' | 'numeric' | 'timestamp' | 'text' }[] = [];
  if (sample.length === 0) return cols;
  for (const name of Object.keys(sample[0])) {
    const types = sample.map(r => detect(r[name]));
    cols.push({ name, type: dominant(types) });
  }
  return cols;
}
function detect(v: any) {
  if (v == null || v === '') return 'text';
  if (/^(true|false)$/i.test(v)) return 'bool';
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'numeric';
  if (!isNaN(Date.parse(v))) return 'timestamp';
  return 'text';
}
function dominant(arr: string[]) {
  const cnt: Record<string, number> = {};
  for (const t of arr) cnt[t] = (cnt[t] || 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0] as any;
}
const pgType = (t: string) => ({
  bool: 'boolean', numeric: 'numeric', timestamp: 'timestamptz', text: 'text',
}[t] || 'text');
const q = (n: string) => `"${n.replace(/"/g, '""')}"`;
const shortOrgId = (uuid: string) => uuid.replace(/-/g, '').slice(0, 8);
```

### 7.2 Batch insert with `COPY FROM STDIN`

For large files, plain `INSERT` is slow. Postgres has `COPY`:

```ts
import { from as copyFrom } from 'pg-copy-streams';

async function batchInsertCopy(
  pool: pg.Pool,
  table: string,
  columns: { name: string; type: string }[],
  rows: any[],
) {
  const client = await pool.connect();
  try {
    const colList = columns.map(c => q(c.name)).join(', ');
    const stream = client.query(
      copyFrom(`COPY ${q(table)} (${colList}) FROM STDIN WITH (FORMAT csv)`),
    );
    const csv = rows.map(r =>
      columns.map(c => escapeCsvCell(r[c.name])).join(',')
    ).join('\n');
    stream.write(csv);
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  } finally {
    client.release();
  }
}
function escapeCsvCell(v: any) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
```

### 7.3 Lineage endpoint

```ts
// src/modules/datasets/controllers/datasetLineage.ts
export default async function datasetLineage(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection } = res.locals;

  const analyses = await master_db_connection.query(
    `SELECT id, name FROM analyses WHERE dataset_id = $1`, [id],
  );
  const analysisIds = analyses.map((a: any) => a.id);
  const dashboards = analysisIds.length === 0 ? [] :
    await master_db_connection.query(
      `SELECT id, name FROM dashboard
        WHERE snapshot->>'analyses' && $1::text[]`, // approximate
      [analysisIds],
    );
  const rls = await master_db_connection.query(
    `SELECT id, name FROM rls_rule WHERE dataset_id = $1`, [id],
  );
  const subs = dashboards.length === 0 ? [] :
    await master_db_connection.query(
      `SELECT id, recipients, cron FROM subscription
        WHERE target_type = 'dashboard' AND target_id = ANY($1::uuid[])`,
      [dashboards.map((d: any) => d.id)],
    );
  const alerts = await master_db_connection.query(
    `SELECT id, name FROM alert WHERE dataset_id = $1`, [id],
  );
  const semModels = await master_db_connection.query(
    `SELECT id, name FROM semantic_model WHERE dataset_id = $1`, [id],
  );

  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    dataset: id,
    nodes: {
      analyses, dashboards, rls, subscriptions: subs, alerts,
      semanticModels: semModels,
    },
  });
}
```

### 7.4 Usage stats endpoint

```ts
// src/modules/datasets/controllers/datasetUsage.ts
export default async function datasetUsage(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection } = res.locals;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const summary = await master_db_connection.query(`
    SELECT
      COUNT(*)::int                              AS runs,
      SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::int AS cache_hits,
      SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END)::int AS errors,
      PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_ms) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
    FROM dataset_run
    WHERE dataset_id = $1 AND occurred_at > $2
  `, [id, since]);

  const daily = await master_db_connection.query(`
    SELECT
      DATE_TRUNC('day', occurred_at) AS day,
      COUNT(*)::int AS runs
    FROM dataset_run
    WHERE dataset_id = $1 AND occurred_at > $2
    GROUP BY 1 ORDER BY 1
  `, [id, since]);

  return sendResponse(res, true, CODE.SUCCESS, 'ok', { summary: summary[0], daily });
}
```

## 8. Test plan

- **DST-H-20** — CSV upload happy path → row appears, preview works
- **DST-H-21** — XLSX upload, multi-sheet → first sheet picked
- **DST-H-22** — Lineage endpoint returns the analyses + dashboards
- **DST-N-30** — Upload > 100MB → 413 Payload Too Large
- **DST-N-31** — Upload with malformed CSV → 400 with row number
- **DST-N-32** — Upload with reserved table name → renamed safely
- **DST-E-30** — CSV with BOM → parsed correctly
- **DST-E-31** — CSV with quoted commas → parsed
- **DST-E-32** — XLSX with formulas → values, not formulas, stored
- **DST-E-33** — Re-upload to existing dataset → versioned

## 9. Migration & rollout

1. Schema migration adds optional columns; existing rows default-fine.
2. `kind='virtual'` for every existing dataset.
3. Managed datasource is provisioned lazily on first upload — no
   change for orgs that don't upload.
4. Lineage / usage / versions endpoints are additive.
5. UI tabs (Lineage, Usage, Versions) hidden behind flag until each
   feature ships individually.

## 10. Open questions

- Should uploads count against the customer's row-count plan? Yes —
  publish a `quota.upload_rows` field on the org.
- Should we offer "auto-refresh from Google Sheets" or only manual
  refresh? Auto-refresh is a sub-feature of scheduling (module 15).
