# 13 · Export & Download

## Surfaces

| Surface | Formats |
|---|---|
| Dataset | CSV, XLSX, JSON, Parquet |
| Single visual | PNG, SVG, CSV (data behind) |
| Analysis | PDF (canvas), PPTX (story) |
| Dashboard | PDF, PNG (whole board), XLSX (one sheet per visual) |

## DB

```sql
CREATE TABLE export_job (
  id          uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  caller_id   uuid NOT NULL,
  target_type varchar(16) NOT NULL,           -- dataset|analysis|dashboard|visual
  target_id   uuid NOT NULL,
  format      varchar(16) NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'queued',  -- queued|running|done|failed
  filters     jsonb,
  result_url  text,                            -- S3 / minio / local FS pointer
  size_bytes  bigint,
  rows        bigint,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
```

Large exports run as BullMQ jobs and email a download link.

## CSV streaming (large datasets)

```ts
// src/modules/exports/controllers/exportDatasetCsv.ts
export default async function exportDatasetCsv(req: Request, res: Response) {
  const ds = await loadDataset(req.params.id);
  const cursor = await openCursor(ds, res.locals.caller);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${ds.name}.csv"`);

  let header = false;
  for await (const batch of cursor) {
    if (!header) {
      res.write(batch.columns.join(',') + '\n');
      header = true;
    }
    for (const row of batch.rows) {
      res.write(batch.columns.map(c => csvCell(row[c])).join(',') + '\n');
    }
  }
  res.end();
}
```

Server-side stream — never buffers the full dataset in memory.

## XLSX with multiple sheets

```ts
import ExcelJS from 'exceljs';

async function exportDashboardXlsx(dashboardId: string, res: Response) {
  const data = await renderDashboardLive(dashboardId);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  for (const v of data.visuals) {
    const ws = wb.addWorksheet(safeName(v.title));
    ws.addRow(v.columns);
    for (const row of v.rows) ws.addRow(v.columns.map(c => row[c]));
    ws.commit();
  }
  await wb.commit();
}
function safeName(s: string) {
  return s.replace(/[\\\/\*\?\:\[\]]/g, '_').slice(0, 31);
}
```

## PDF dashboard (puppeteer)

See module 08 §4.3.

## PNG per visual

FE-side via `echartsInstance.getDataURL`:

```ts
const url = ec.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' });
const a = document.createElement('a');
a.href = url;
a.download = `${visual.title}.png`;
a.click();
```

## Audit + rate limit

- Every export writes an `audit_log` row with rows-returned + bytes.
- Per-user rate: 10 exports per 10 min (configurable).
- Per-org daily cap (plan-dependent).

## Tests

- **EXP-CSV-H-01** — 100-row dataset → 200, valid CSV
- **EXP-XLSX-H-01** — 5-visual dashboard → 5-sheet XLSX
- **EXP-PDF-H-01** — dashboard → PDF non-zero bytes
- **EXP-PDF-N-01** — visual that errored → placeholder in PDF, no crash
- **EXP-RATE-N-01** — 11th export in 10 min → 429
- **EXP-LARGE-H-01** — 1M row export streams without OOM
