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

## Appendix · Review additions

- **Upload from URL** (S3 / GCS / Azure Blob / HTTPS) — accept a signed
  URL instead of multipart; BE streams the bytes server-side.
- **Resumable uploads** (tus.io protocol) — `POST /upload/init`,
  `PATCH /upload/<id>` chunks, `HEAD /upload/<id>` for progress.
- **Schema mapping UI**: re-uploading a CSV with shifted column order
  → FE shows mapping `(new col → existing col)`.
- **Mapping templates**: save the mapping as
  `upload_mapping (id, dataset_id, source_format, mapping jsonb)` for
  future re-uploads.
- **Dry-run validation**: `POST /upload/dry-run` returns a report —
  row count, type mismatches, duplicate PKs, blank-required-cell rows
  — before persisting.
- **Virus scan** (ClamAV) for enterprise. Hook in via TCP socket to
  `clamav` daemon; abort upload on positive.
- **Source file hash** stored in `dataset.upload_source_meta.sha256` so
  re-uploading the same file is idempotent (skipped with notice).
- **Org storage quota**: `org_storage_quota (organisation_id, max_bytes,
  used_bytes)`; reject uploads that would exceed.
- **Backfill mode**: append multiple historical files into one dataset.
- **Webhook on upload complete**: emit `dataset.uploaded` event.
- **Encrypted-at-rest staging**: upload lands in a `.tmp/` dir with
  server-side AES-256 until processed.

### New endpoints

- `POST /upload/url` — submit URL, BE pulls server-side
- `POST /upload/init` + `PATCH /upload/<id>` + `HEAD /upload/<id>` (tus)
- `POST /upload/dry-run`
- `GET /org/storage` — quota usage

### Test IDs

- UP-URL-H-01 — upload from S3 URL works
- UP-TUS-H-01 — resumable upload after disconnect resumes from offset
- UP-VIRUS-N-01 — infected file rejected before parse
- UP-QUOTA-N-01 — over-quota → 413 with helpful message
- UP-DUP-H-01 — same file hash re-uploaded → idempotent (no double-create)
