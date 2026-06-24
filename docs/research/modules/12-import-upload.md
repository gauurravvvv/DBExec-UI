# 12 · Import / Upload / ETL-lite

Covered in module 03 (Dataset). Extras specific to ingestion:

## Formats

| Format | Parser | Notes |
|---|---|---|
| CSV | papaparse (streaming) | Most common |
| TSV / SSV | papaparse with delimiter | |
| XLSX | exceljs (streaming) | Pick sheet via UI |
| XLS | xlsx-js (slow, V2) | Optional |
| JSON | stream-json | NDJSON also supported |
| JSONL | stream-json | One row per line |
| Parquet | parquetjs-lite | V2 |
| Google Sheets | googleapis | OAuth + sheet picker |

## Limits

| Plan | Max rows | Max size | Refresh allowed |
|---|---|---|---|
| Free | 100k | 50MB | manual only |
| Pro | 1M | 500MB | scheduled |
| Enterprise | 25M | 5GB | scheduled |

## Type inference rules

- Whole-numeric → `bigint`
- Decimal-numeric → `numeric(18,4)`
- ISO date → `date`
- ISO datetime → `timestamptz`
- `true|false|yes|no|1|0` (homogenous) → `boolean`
- Default → `text`

User can override during the "preview + types" step.

## Multi-sheet XLSX

UI shows tabs per sheet. User picks one, OR creates one dataset per
sheet ("Import all"). Default: first sheet only.

## Refresh

For sheet-backed datasets (CSV from S3, Google Sheets):

- Manual: button on dataset detail page.
- Scheduled: cron, runs through BullMQ worker.
- On-demand: API token `POST /dataset/:id/refresh`.

## Sample seed

For onboarding, ship a `sample_chart_demo.csv` (1,000 rows) and a
"Try with sample data" button on the empty dataset list.

## Tests

- **UP-CSV-H-01** — 100k rows → 200, dataset created in < 30s
- **UP-CSV-N-01** — 2M rows on free plan → 413
- **UP-XLSX-H-01** — multi-sheet xlsx → user picks one
- **UP-JSON-H-01** — nested JSON flattened with `.` keys
- **UP-PARSE-N-01** — malformed row → error with line number
- **UP-AUDIT-H-01** — upload writes audit row with file hash
