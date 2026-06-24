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

## Appendix · Review additions

### Concepts

- **Watermarks** on exported PDFs (org logo, "Confidential" text,
  recipient email, timestamp).
- **Encrypted PDF** with password (re-encrypt with `pdf-lib`).
- **Excel formatting**: bold headers, locked number formats, freeze
  panes, conditional formatting per metric, per-row colouring
  matching the visual.
- **Chart in Excel**: embed both the chart image and the underlying
  data sheet.
- **PowerPoint export** (PPTX, one slide per visual) via `pptxgenjs`.
- **Markdown export** of an analysis — analyst-friendly raw form.
- **Inline HTML** export of a dashboard for email body delivery.
- **Signed download URL** (S3-style) instead of direct stream when
  large jobs run async.
- **Background export with email link** for any job > 30s.
- **Idempotency** via `Idempotency-Key` so retries don't double-export.

### Schema delta

```sql
ALTER TABLE export_job
  ADD COLUMN watermark_text varchar(255),
  ADD COLUMN password_enc bytea,
  ADD COLUMN signed_url text,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN idempotency_key varchar(255);
```

### New endpoints

- `POST /export/dashboard/:id/pptx`
- `POST /export/analysis/:id/markdown`
- `POST /export/dashboard/:id/embed-html`

### PDF watermark code

```ts
await page.evaluate((wm) => {
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%) rotate(-30deg);
    opacity:.08;font-size:96px;pointer-events:none;z-index:9999;
    font-family:sans-serif;color:#000`;
  div.textContent = wm;
  document.body.appendChild(div);
}, watermarkText);
```

### Test IDs

- EXP-WM-H-01 — watermark visible on every page
- EXP-PWD-N-01 — encrypted PDF prompts for password
- EXP-PPTX-H-01 — PPTX produced, one slide per visual
- EXP-ASYNC-H-01 — large export emails a download link
- EXP-IDEMP-H-01 — same idempotency key returns first job, no duplicate
