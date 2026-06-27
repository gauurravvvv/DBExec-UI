# Dataset module — raw query hardening (m03)

> Scope: continue the dataset module with a focus on the raw-query
> authoring flow. Make it solid + secure end-to-end (FE → BE → DB).
> Defer uploads, sheets, semantic-layer integration, versioning UI
> to their own modules per the build plan. Keep the editor's existing
> Monaco / IntelliSense / scope-tracker infrastructure — this is a
> polish + safety pass, not a rewrite.

## 0. Problem framing

DBExec lets a user paste a SELECT into the dataset editor, run it,
preview the rows, decide which columns are "fields" of the dataset,
and save. Downstream, analyses + dashboards + RLS rules build on
that dataset.

Today's gaps for the raw-query path (verified against current code):

1. **SQL safety is absent on the BE.** `addDataset` runs the user's
   SQL directly. A query like `DELETE FROM users; SELECT 1` would
   execute the DELETE half. Multi-statement injection works. There
   is a FE-side validator service, but trusting the FE for safety
   is a non-starter.
2. **Introspection is Postgres-only.** `addDataset.ts` uses
   `pg_typeof(...)::text` to get column types. On MySQL, MSSQL,
   Oracle, Snowflake this is a syntax error and the dataset cannot
   be created. The list pages show MySQL/Snowflake datasources
   exist in the catalog, so this is a real break.
3. **No statement timeout.** A user pasting `SELECT pg_sleep(3600)`
   hangs a worker for an hour.
4. **No row cap on introspection or column-type query.** The
   "wrapped LIMIT 1" pattern is good, but the type query lacks one
   for some branches. Preview's `DATASET_QUERY_LIMIT` is set but
   the LIMIT wrap happens via string concatenation only when
   `limit !== -1`, with `-1` meaning "no cap" — exposed to callers.
5. **No usage telemetry.** Can't answer "is this dataset still
   being used?" Cannot drive a freshness badge or a "slow dataset"
   admin alert.
6. **No lineage endpoint.** When deleting a dataset, we don't tell
   the user which analyses / dashboards / RLS rules will break.
7. **Editor UX rough edges.** Long save errors get toasted and
   disappear — when the BE rejects an unsafe SQL fragment, the
   user has to re-trigger the save to see it again. Preview is
   hard-capped at the full result load; no pagination.

This spec covers fixes for 1-7 in one feature branch.

## 1. Goal

A raw-SQL dataset author can:

- paste any SELECT or WITH ... SELECT
- get inline feedback if the SQL touches DDL/DML/etc, with the
  offending keyword highlighted
- run the query against any supported engine (PG / MySQL / MSSQL /
  Oracle / Snowflake) and have columns introspected correctly
- not crash a warehouse worker by accident (timeouts + caps)
- see how often the dataset has been used and what depends on it
- preview rows page-by-page

…without giving up the existing Monaco editor, schema browser,
custom-field formula editor, or per-dialect snippets.

## 2. Non-goals (deferred)

| Feature | Why deferred | Lives in |
|---|---|---|
| CSV / XLSX / JSON upload | Owned by import module | m12 |
| Google Sheets connector | Cross-cutting OAuth surface | m12 |
| Dataset version history (DB + diff UI) | Owned by versioning module | m18 |
| Physical-table mirror (`source_kind = 'table'`) | Marginal value vs writing `SELECT * FROM schema.tbl` | follow-up |
| Materialised refresh | Needs scheduler | m15 |
| Cross-datasource joins | Federation work | semantic layer m02 |
| Reusable parameters (`:param`) | Couples to RLS + scheduler | next pass |
| PII auto-flag | Couples to RLS column security | m09 |

## 3. Architecture changes

### 3.1 BE — SQL safety validator

New file: `src/shared/services/sqlSafety.service.ts`.

```ts
interface SafetyVerdict { ok: true } | {
  ok: false; reason: string; offendingToken?: string;
}

export function isSafeSelect(sql: string): SafetyVerdict
```

Rules:

- Must parse as a single statement (no second statement after `;`
  ignoring trailing whitespace + comments).
- Must start with `SELECT` or `WITH` (case-insensitive, after
  comment/whitespace strip).
- Must not contain any of the banned top-level keywords as
  tokens (not inside string literals or comments):
  `INSERT UPDATE DELETE MERGE TRUNCATE ALTER CREATE DROP GRANT REVOKE COPY ATTACH DETACH SET RESET CALL EXEC EXECUTE`.
- `INTO` only allowed after `SELECT` when followed by FROM (i.e.
  banning `SELECT … INTO new_table FROM …`).
- Single-line `--` and block `/* … */` comments stripped before
  pattern matching so commented banned keywords are fine.
- Returns the first offending keyword if any.

Called from `addDataset`, `updateDataset`, `runDatasetQuery`
**before** any connection is opened.

### 3.2 BE — dialect-aware column introspection

New helper: `src/shared/helpers/datasource/introspectColumns.ts`.

```ts
introspectColumnsForSelect(
  connection: DataSource,
  userSql: string,
  dbType: 'postgres' | 'mysql' | 'mariadb' | 'mssql' | 'oracle' | 'snowflake',
): Promise<{ name: string; dataType: string }[]>
```

Strategy per engine:

- **postgres / mysql / mariadb / mssql** — run
  `SELECT * FROM (<userSql>) AS _t WHERE 1=0` and read the column
  metadata off the driver field descriptors (TypeORM passes through
  pg `fields`, mysql2 `columns`, tedious `metadata`). The driver
  already maps OIDs / type codes to a string we can normalise.
- **oracle** — same wrapper + `OracleDB describe()` returns
  `metaData[].dbType`.
- **snowflake** — `DESCRIBE RESULT LAST_QUERY_ID()` after a
  `LIMIT 0` execution.

The `WHERE 1=0` short-circuit means zero row fetch even on
warehouses, so a 5-billion-row table introspects in milliseconds.

If any engine surfaces an unknown type code, fall back to `'text'`
rather than failing.

### 3.3 BE — timeouts + row caps

New helper: `src/shared/services/safeDatasetQuery.service.ts`.

Wraps every dataset run with:

1. **Statement timeout**, before the user SQL fires:
   - PG: `SET LOCAL statement_timeout = '30s'`
   - MySQL/MariaDB: `/*+ MAX_EXECUTION_TIME(30000) */` injected
     after `SELECT`
   - MSSQL: connection option `requestTimeout: 30000`
   - Oracle: `CALL DBMS_RESOURCE_MANAGER.SWITCH_PLAN(...)` is too
     heavyweight — use connection-level `callTimeout`
   - Snowflake: session parameter
     `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 30`
2. **Row cap** — hard ceiling at 10,000 for preview, configurable
   via env `DATASET_PREVIEW_MAX_ROWS`. The current `-1 = no cap`
   sentinel is removed; the largest value any caller can request
   is the env-driven cap.
3. **Read-only intent** — the wrapped SELECT executes inside a
   read-only transaction where the engine has the concept (PG +
   MSSQL). Other engines rely on the safety validator + DB user
   permissions.

The two distinct concerns — **shape safety** (validator) and
**runtime cost safety** (timeout + cap) — both run; they're not
substitutes for each other.

### 3.4 BE — dataset_run audit table + usage endpoint

```sql
CREATE TABLE dataset_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL,
  caller_id     UUID,
  source        VARCHAR(32) NOT NULL,  -- 'preview' | 'analysis' | 'dashboard' | 'export'
  rows_returned INT,
  duration_ms   INT NOT NULL,
  error         TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON dataset_run (dataset_id, occurred_at DESC);
```

`runDatasetQuery` inserts one row at the end of each call. The
insert is fire-and-forget — never blocks the response.

Endpoint: `GET /datasets/:id/usage` → returns:

```json
{
  "summary": { "runs": 142, "errors": 3, "p50": 240, "p95": 1200 },
  "daily":   [{ "day": "2026-06-15", "runs": 12 }, ...]
}
```

Window: trailing 30 days, capped at 90.

### 3.5 BE — lineage endpoint

`GET /datasets/:id/lineage` — answers "what breaks if I delete
this?" Returns three lists:

```json
{
  "analyses":  [{ "id": "...", "name": "Sales Q4" }],
  "dashboards": [{ "id": "...", "name": "Exec Overview" }],
  "rlsRules":  [{ "id": "...", "name": "EMEA only" }]
}
```

Backed by three indexed reads — no new tables. Used by the delete
confirmation modal AND the dataset detail page's Lineage tab.

### 3.6 FE — list page redesign

Match the recent datasource list aesthetic:

- Single parent card filling the router-pane (no nested cards)
- Columns: name, datasource (chip), kind (`SQL` for now;
  `Upload`/`Sheet` reserved for m12), last run (relative), status
- Bulk delete (existing)
- "+ New dataset" CTA

### 3.7 FE — editor polish

The 2,700-line `add-dataset.component.ts` stays — it's the working
Monaco shell. Adds:

- Inline SQL safety banner above the editor when BE rejects:
  red border, monospace token highlight, persistent (not a toast)
- Preview rail: cursor-paginated table, 200 rows / page
- New right-rail tabs on detail view: Columns / Lineage / Usage
  - Columns reuses the existing field editor
  - Lineage reads `/datasets/:id/lineage` and renders three
    grouped lists with click-through nav
  - Usage reads `/datasets/:id/usage`, renders ngx-echarts
    sparkline + p50/p95 strip
- Delete confirmation now reads lineage and shows what will break

### 3.8 FE — safety errors UX

Today: save failure → red toast that fades.

After: a persistent banner stuck above the editor with the BE's
`reason` + `offendingToken` highlighted in red `<code>`. The
banner clears the moment the SQL textarea changes. This is a
recurring problem in raw-SQL UIs and the toast pattern is wrong
for it.

## 4. Data model deltas

```sql
-- New entity. Lives in the per-org shared DB so usage stays
-- isolated to the org.
CREATE TABLE dataset_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL,
  caller_id     UUID NULL,
  source        VARCHAR(32) NOT NULL,
  rows_returned INT NULL,
  duration_ms   INT NOT NULL,
  error         TEXT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dataset_run_dataset_time ON dataset_run (dataset_id, occurred_at DESC);
```

TypeORM auto-sync handles the create on next BE boot (no manual
migration per the project's dev convention).

The existing `Dataset` entity is untouched. The research doc lists
new columns (`kind`, `target_table`, `last_refresh_at`, `version`)
— those land with their respective modules (m12, m15, m18).

## 5. API surface added

| Method | Path | Purpose |
|---|---|---|
| GET | `/datasets/:id/lineage` | Downstream consumers |
| GET | `/datasets/:id/usage` | 30-day usage stats |

Routes added to `src/modules/datasets/datasets.routes.ts` behind
`VerifyPermissionMiddleware('datasetManager', 'read')`.

No breaking changes to existing endpoints — `addDataset`,
`updateDataset`, `runDatasetQuery` keep the same shapes and just
get safer internals.

## 6. Security threat model

| Threat | Mitigation |
|---|---|
| Multi-statement injection in SQL | `isSafeSelect` rejects on save AND on every run |
| DDL/DML hidden in comments | Comment-strip happens before keyword scan |
| Long-running query DoSes the warehouse | Per-engine statement timeout, default 30s |
| Unbounded row fetch | Hard cap 10k rows; configurable; -1 sentinel removed |
| Engine driver crash on unusual column types | Fallback to `text` data type |
| Cross-org dataset access | Existing `organisationId` filter on every find — unchanged |
| Dataset_run table growth | Index supports range delete; trim job deferred to m19 |
| Stale lineage causing delete failure | Lineage endpoint is best-effort read; not transactional |

## 7. Perf budgets

| Operation | p50 target | p95 target |
|---|---|---|
| SQL safety validation | <1 ms | <5 ms |
| Column introspection (any engine) | <100 ms | <500 ms |
| Preview (200 rows, simple query) | <200 ms | <800 ms |
| Usage endpoint | <50 ms | <200 ms |
| Lineage endpoint | <50 ms | <200 ms |
| Editor save end-to-end | <500 ms | <2 s |

## 8. Implementation order

1. BE safety validator + tests (no UI exposure yet)
2. BE introspection helper + swap addDataset/updateDataset
3. BE timeouts/caps in safeDatasetQuery
4. BE dataset_run entity + usage endpoint
5. BE lineage endpoint
6. FE list redesign (independent)
7. FE editor: inline safety banner
8. FE editor: usage + lineage tabs
9. Merge into version_261

## 9. Verification

After implementation, with both servers up:

1. Paste `SELECT 1; DROP TABLE users;` → reject with banner
   pointing at `;` then `DROP`.
2. Paste `WITH cte AS (SELECT 1) SELECT * FROM cte` → OK.
3. Paste `SELECT pg_sleep(60)` (PG) → 30s timeout, error surface.
4. Paste a heavy `SELECT * FROM big_table` → rows capped at 10k.
5. Create a dataset on a MySQL datasource → columns introspected
   correctly (the existing pg_typeof break is gone).
6. Click "Usage" tab → see runs/p50/p95 + daily sparkline.
7. Click "Lineage" tab → see analyses + dashboards + RLS rules.
8. Delete a dataset that has dependents → confirmation shows what
   breaks; if confirmed, delete proceeds with cascade.
9. FE + BE both build clean.

## 10. Rollback

Single feature branch. `git revert <merge-commit>` restores the
previous behaviour. `dataset_run` table stays — empty rows are
harmless. The schema delta is additive.
