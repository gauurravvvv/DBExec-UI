# 08 · Datasets — Deep Test Cases

> SQL + builder + custom fields + upload + duplicate + version.

## Fixtures
- Datasource `pg_local`
- Sample dataset SQL-mode: `SELECT * FROM public.chart_demo`
- Sample dataset upload-mode: `chart_demo.csv` (5040 rows)

## SQL dataset — happy
- **DST-H-01** · Save `SELECT * FROM chart_demo` → preview renders 1000 capped rows. P0
- **DST-H-02** · Edit SQL (add WHERE) → re-preview shows fewer rows. P0
- **DST-H-03** · Save-as duplicate → new dataset; dataset-level fields cloned; analysis-scoped fields excluded. P0
- **DST-H-04** · Toggle status with justification. P1
- **DST-H-05** · SQL with `SELECT sales AS s` alias → alias used. P1
- **DST-H-06** · SQL with JOIN → merged rows. P1
- **DST-H-07** · SQL with GROUP BY + agg → correct rollup. P1
- **DST-H-08** · SQL with CTE → executes. P1
- **DST-H-09** · SQL with window function → executes. P1
- **DST-H-10** · Name 2 chars → accepted boundary. P2
- **DST-H-11** · Name 100 chars → accepted boundary. P2
- **DST-H-12** · Description exactly 500 chars → accepted. P2

## SQL dataset — negative
- **DST-N-01** · SQL > 10000 chars → tooLong. P0
- **DST-N-02** · Empty SQL → required. P0
- **DST-N-03** · Name pattern violation. P0
- **DST-N-04** · Name 1 char → tooShort. P0
- **DST-N-05** · Name 101 → tooLong. P0
- **DST-N-06** · Duplicate name within (org, datasource) → 409. P0
- **DST-N-07** · Same name across datasources → ALLOWED. P1
- **DST-N-08** · SQL with DELETE/DROP/UPDATE/TRUNCATE/INSERT → reject (safelist). P0 🟣
- **DST-N-09** · Multi-statement SQL (`SELECT 1; DROP TABLE x`) → reject. P0 🟣
- **DST-N-10** · SQL references table user can't read → preview shows driver error; save still allowed. P1
- **DST-N-11** · Datasource id from another org → 404. P0
- **DST-N-12** · Update id from another org → 404. P0
- **DST-N-13** · User without `datasetManager` → bounce. P0
- **DST-N-14** · Description > 500 → tooLong. P1
- **DST-N-15** · Justification > 500 → tooLong. P1
- **DST-N-16** · Update without justification when audit gate enforces → reject. P1

## SQL dataset — edge
- **DST-E-01** · Snowflake QUALIFY → accepted on Snowflake. P1
- **DST-E-02** · MSSQL TOP 100 → accepted on MSSQL. P1
- **DST-E-03** · 5040-row dataset → preview capped + "truncated" badge. P1
- **DST-E-04** · Concurrent edit from 2 tabs → stale-row OR last-write-wins (document). P1
- **DST-E-05** · Reserved keyword column (`order`) → quoted in preview. P1
- **DST-E-06** · JOIN producing two same-name columns → de-duplicated. P1
- **DST-E-07** · 0 rows → empty state. P2
- **DST-E-08** · DB connection down → preview shows error; save allowed. P1
- **DST-E-09** · Column type drift (varchar→int) → next preview adapts. P1
- **DST-E-10** · Snowflake VARIANT renders as JSON string in preview. P1
- **DST-E-11** · Identifier quoting per engine in preview. P1

## Custom fields

- **FLD-H-01** · Add numeric calc `sales * 1.1` → preview shows column. P0
- **FLD-H-02** · Edit calc → downstream analyses flagged. P1
- **FLD-H-03** · Delete calc → cascading visual refs cleaned. P0
- **FLD-H-04** · String concat calc. P1
- **FLD-H-05** · Date calc (`date_part`). P1
- **FLD-H-06** · Validate endpoint returns OK for valid formula. P1

- **FLD-N-01** · Field name > 128 → tooLong. P1
- **FLD-N-02** · Field name empty → required. P0
- **FLD-N-03** · Logic references undefined column → BE validate catches; FE squiggle. P0
- **FLD-N-04** · SQL injection in logic (`'; DROP TABLE`) → parser rejects. P0 🟣
- **FLD-N-05** · Self-referential calc → cycle reject. P0
- **FLD-N-06** · Mutual cycle (A→B→A) → reject. P0
- **FLD-N-07** · Aggregate inside non-aggregate context → reject. P1
- **FLD-N-08** · Update field id from another org → 404. P0

- **FLD-E-01** · Division by zero → NULL not Infinity. P1
- **FLD-E-02** · Rename field → analyses referencing by id continue to render. P1
- **FLD-E-03** · Field with 1000-char formula → accepted. P2
- **FLD-E-04** · dataType vs formula type mismatch → BE coerces or warns. P2
- **FLD-E-05** · Two fields same name in different datasets → independent. P1
- **FLD-E-06** · Field on dataset whose connection pw just rotated → next preview retries with new creds. P1

## Upload (CSV/XLSX)

- **DST-UP-H-01** · CSV upload 100k rows → dataset created < 30s. P0
- **DST-UP-H-02** · XLSX multi-sheet → user picks one. P1
- **DST-UP-H-03** · Schema-mapping UI for re-uploads. P1
- **DST-UP-H-04** · JSON / NDJSON. P1
- **DST-UP-N-01** · 2M rows on free plan → 413. P0
- **DST-UP-N-02** · Malformed row → error with row number. P1
- **DST-UP-N-03** · Reserved table name → renamed safely. P2
- **DST-UP-E-01** · CSV with BOM → parsed. P2
- **DST-UP-E-02** · Quoted commas → parsed. P2
- **DST-UP-E-03** · CRLF endings → parsed. P2
- **DST-UP-E-04** · Re-upload same file (hash match) → idempotent. P1
- **DST-UP-E-05** · Upsert via primary_key on second upload. P1
- **DST-UP-S-01** · Virus-scanned file rejected on positive. P0 🟣
- **DST-UP-S-02** · Path traversal in filename sanitised. P0 🟣

## Lineage / usage / freshness

- **LIN-H-01** · `/dataset/:id/lineage` lists downstream analyses + dashboards. P1
- **USG-H-01** · `/dataset/:id/usage` shows p95 + run count last 30d. P1
- **FRESH-H-01** · Stale > SLA → red badge in list. P1

## Security

- **DST-S-01** · SQL safelist blocks DDL/DML even when wrapped in CTE. P0 🟣
- **DST-S-02** · pgsql-ast-parser bypass attempts caught (e.g. `SELECT 1; /* DROP */`). P0 🟣
- **DST-S-03** · Cross-org dataset id → 404. P0 🟣

## Performance

- **DST-P-01** · Preview on 1M-row source completes in < 5s with LIMIT 1000. P1 ⚡
- **DST-P-02** · 100 concurrent previews stay within pool budget. P1 ⚡

## Regression buckets
- Validators changed → DST-N-01..16
- Custom fields changed → FLD-*
- Upload flow → DST-UP-*
- SQL parser changed → DST-S-01, DST-S-02
