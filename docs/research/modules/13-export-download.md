# 13 · Export & Download

> Getting data OUT of DBExec — into the inboxes, file shares, and
> spreadsheets where humans actually consume it. Every BI tool's
> dirty secret: most of the "dashboard usage" is people clicking
> Export and pasting into PowerPoint.
>
> Sister modules:
> [12 · Import & Upload](12-import-upload.md) (the inbound flow),
> [15 · Scheduling & Subscriptions](15-scheduling-alerts.md) (timed
> exports), [14 · Sharing & Embed](14-share-embed.md) (live-link
> alternative), [08 · Dashboard](08-dashboard.md) (the canvas being
> exported).

**Depends on:** Dashboard (08), Analysis (06), Dataset (03), Cache (05)
**Unblocks:** Scheduling (15), Email subscriptions (16)
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

Every BI tool offers export. The interesting question is *what*
exactly comes out and *how* it gets generated.

| Tool | Visual PNG | Dashboard PDF | Dataset CSV | Native (.tableau, .pbix) |
|---|---|---|---|---|
| **Tableau** | screenshot via Tableau Server worker | headless print pipeline, multi-page | CSV / Excel | `.twbx` (workbook + extract) |
| **Power BI** | "Export to image" | "Export to PDF" — uses Power BI service render | CSV (max 30k rows free, 150k Pro) | `.pbix` |
| **Looker** | per-tile PNG via headless | dashboard PDF, scheduled | CSV / Excel / JSON | n/a |
| **Metabase** | per-question PNG | dashboard PDF | CSV / XLSX / JSON | n/a |
| **Superset** | per-chart PNG / SVG | dashboard PDF via Selenium | CSV / Excel | n/a |
| **Mode** | per-chart PNG | report PDF (notebook export) | CSV / Excel | n/a |

**Common patterns to copy:**

- **Server-side render via headless browser.** Charts are HTML/CSS/JS;
  rebuilding a PDF renderer from scratch is folly. Puppeteer / Playwright
  in a worker pool is the universal answer.
- **Synchronous for small, async for large.** Dataset of <50k rows
  exports synchronously (download in the browser). Larger exports
  spawn a background job, email a signed download URL when ready.
- **Watermark + audit on every export.** Especially PDF/PPTX — once
  the file leaves the platform, the audit log is the only way to
  know it existed.
- **Format-aware data type preservation.** Excel rounds timestamps,
  Parquet preserves them. CSV is lossy by design (everything is
  text); document this in the export dialog.

**The lesson DBExec should internalise**: export isn't a side
feature, it's a primary UX. The user clicks Export ten times more
often than they click any chart. Make it fast, reliable, and
auditable.

## 2. DBExec today

- **No export exists.** Users screenshot their browser, paste into
  PowerPoint. Or right-click → "Save image as" on the chart canvas
  (which loses HTML overlays, legends, the title).
- The dataset Run endpoint returns JSON to the FE; nothing turns it
  into CSV.
- No PDF render. No subscription pipeline. No watermark.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| EXP-G01 | Dataset CSV export (streaming, all rows) | P0 | M |
| EXP-G02 | Dataset XLSX export | P0 | M |
| EXP-G03 | Dataset Parquet export | P1 | M |
| EXP-G04 | Dataset JSON / JSONL export | P1 | S |
| EXP-G05 | Visual PNG export (one chart) | P0 | M |
| EXP-G06 | Visual SVG export | P1 | S |
| EXP-G07 | Visual CSV export (data behind) | P0 | S |
| EXP-G08 | Analysis PDF (multi-page if needed) | P1 | M |
| EXP-G09 | Dashboard PDF (full board, tabs handled) | P0 | L |
| EXP-G10 | Dashboard PNG (full board image) | P1 | M |
| EXP-G11 | Dashboard XLSX (one sheet per visual) | P1 | M |
| EXP-G12 | Per-tab PDF / PNG export | P1 | S |
| EXP-G13 | Parameter sweep export (one PDF per filter value) | P2 | L |
| EXP-G14 | Watermark (text overlay, optional) | P1 | S |
| EXP-G15 | Password-protected PDF | P2 | S |
| EXP-G16 | Async pipeline for large exports + download URL | P0 | M |
| EXP-G17 | Audit log every export with size + format + recipient | P0 | S |
| EXP-G18 | Per-format size cap + row cap | P0 | S |
| EXP-G19 | Webhook event `export.completed` | P1 | S |
| EXP-G20 | "Schedule this export" handoff into module 15 | P1 | S |
| EXP-G21 | Recently-exported queue per user | P2 | S |
| EXP-G22 | Print stylesheet (browser native Cmd+P fallback) | P2 | S |

## 4. Target architecture

### 4.1 Surface matrix

| Surface | Sync formats | Async formats |
|---|---|---|
| **Dataset (rows)** | CSV ≤50k, JSONL ≤50k | CSV/XLSX/Parquet any size |
| **Visual (one chart)** | PNG, SVG, CSV-data | — |
| **Analysis** | PDF (1 visual), PNG | PDF (multi-visual, multi-page) |
| **Dashboard** | per-tab PNG | full PDF, full PNG, full XLSX |
| **Tab (one tab of a dashboard)** | PNG | PDF, XLSX |

"Sync" = the user clicks → wait 2-10 seconds → browser downloads.
"Async" = the user clicks → "We'll email you a link" → background
worker renders → email + dashboard notification when ready.

The boundary is `EXPORT_SYNC_ROW_CAP = 50_000`. Above that, async.

### 4.2 Two render paths

| Render type | Tooling | Use cases |
|---|---|---|
| **Data render** | streaming SQL → CSV/JSON/Parquet/XLSX serializer | Dataset export, visual-data export, XLSX-per-visual on dashboard |
| **Pixel render** | Puppeteer (or Playwright) → headless Chromium hits a special print URL → page.pdf() / page.screenshot() | Visual PNG, analysis PDF, dashboard PDF/PNG |

Two render paths, two queues, two workers. Mixing them in one
process is how you get a Node worker that's both CPU-bound (PDF
render) and IO-bound (CSV stream) — neither side gets enough
resource.

### 4.3 Entities

```ts
// src/shared/db/shared_entity/export_job.entity.ts
@Entity('export_job')
@Index(['organisationId', 'status'])
@Index(['userId', 'createdOn'])
export class ExportJob {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;
  @Column('uuid') userId!: string;
  @Column({ length: 16 }) surface!:
    'dataset' | 'visual' | 'analysis' | 'dashboard' | 'tab';
  @Column('uuid') surfaceId!: string;
  @Column('uuid', { nullable: true }) tabId?: string;
  @Column({ length: 16 }) format!:
    'csv' | 'xlsx' | 'parquet' | 'json' | 'jsonl'
    | 'pdf' | 'png' | 'svg';
  @Column({ length: 16 }) renderType!: 'data' | 'pixel';
  @Column('jsonb', { nullable: true }) options?: {
    filters?: any;
    watermark?: string;
    password?: string;
    pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
    landscape?: boolean;
    parameterSweep?: { paramId: string; values: any[] };
  };
  @Column({ length: 16, default: 'queued' }) status!:
    'queued' | 'running' | 'ok' | 'failed' | 'cancelled';
  @Column('text', { nullable: true }) error?: string;
  @Column('bigint', { nullable: true }) sizeBytes?: number;
  @Column('text', { nullable: true }) downloadUrl?: string;
  @Column('text', { nullable: true }) storageKey?: string;
  @Column('timestamptz', { nullable: true }) expiresAt?: Date;
  @Column('int', { nullable: true }) durationMs?: number;
  @CreateDateColumn() createdOn!: Date;
  @Column('timestamptz', { nullable: true }) finishedOn?: Date;
}
```

The `export_job` row is the audit trail. Sync exports also write
one (status goes straight to `ok`); async exports update it as the
worker progresses.

### 4.4 Endpoints

```
─── Sync (small payload, browser downloads) ───────────────────

GET  /datasets/:id/export/csv?limit=50000
GET  /datasets/:id/export/jsonl?limit=50000
GET  /visuals/:id/export/csv-data
POST /visuals/:id/export/png
POST /visuals/:id/export/svg
POST /analyses/:id/export/png

─── Async (large payload or PDF/PPTX) ─────────────────────────

POST /exports                        body: { surface, surfaceId, format, options }
GET  /exports/:jobId                 status + downloadUrl when ready
GET  /exports                        my recent exports
DELETE /exports/:jobId               cancel running job (best effort)
GET  /exports/:jobId/download        proxy/redirect to storage
POST /exports/:jobId/schedule        handoff to module 15 (subscription)
```

Why GET for sync data exports: lets browsers handle download
natively (`<a href download>`). Server sets
`Content-Disposition: attachment; filename="..."` and streams.

### 4.5 Data-render pipeline (dataset CSV)

```ts
// src/modules/exports/controllers/exportDatasetCsv.ts
import { Response, Request } from 'express';
import { stringify } from 'csv-stringify';
import { extractClientIp } from '../../../shared/utility/clientIp';
import { auditLogger } from '../../../shared/services/auditLogger.service';

export default async function exportDatasetCsv(req: Request, res: Response) {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50_000, EXPORT_SYNC_ROW_CAP);
  const { orgData, loggedInId, master_db_connection } = res.locals;

  const dataset = await loadDataset(id, orgData.id);
  if (!dataset) return sendResponse(res, false, CODE.NOT_FOUND, 'dataset.not_found');

  // RLS still applies — re-use the resolver.
  const rls = await resolveRlsFilters(master_db_connection, loggedInId, dataset.id);
  if (rls.denyAll) {
    // Return an empty CSV with just the header so the user knows the
    // request succeeded but they have no rows.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(dataset.name)}.csv"`);
    res.write('\n');
    res.end();
    return;
  }

  const cfg = await loadDatasourceConfig(dataset.datasourceId);
  const pool = await acquire(cfg);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="${slug(dataset.name)}-${Date.now()}.csv"`);

  const stringifier = stringify({ header: true });
  stringifier.pipe(res);

  let wrote = 0;
  const onEnd = (status: 'ok'|'failed', err?: string) => recordExportJob({
    organisationId: orgData.id, userId: loggedInId,
    surface: 'dataset', surfaceId: dataset.id,
    format: 'csv', renderType: 'data',
    status, sizeBytes: res.socket?.bytesWritten ?? 0, error: err,
  });

  try {
    // Cursor-based stream so we don't hold 50k rows in memory.
    for await (const batch of pool.cursor(
      composeRlsSql(dataset.sql, rls.filters, limit)
    )) {
      for (const row of batch.rows) {
        stringifier.write(row);
        if (++wrote >= limit) break;
      }
      if (wrote >= limit) break;
    }
    stringifier.end();
    await onEnd('ok');
  } catch (e) {
    stringifier.end();
    await onEnd('failed', (e as Error).message);
    Logger.error(`exportDatasetCsv: ${(e as Error).message}`);
  }
}
```

Three things to notice:

1. **Headers are set BEFORE any error path** — once headers go
   out we can't switch to a JSON error. If something blows up
   mid-stream, the client sees a truncated CSV. We log + audit.
2. **RLS is applied identically to the run path.** A user who can't
   query the dataset interactively can't export it either.
3. **No in-memory accumulation.** The cursor + stringifier
   handles 1M rows in <100MB RAM.

### 4.6 Data-render pipeline (dataset XLSX)

```ts
import ExcelJS from 'exceljs';

export default async function exportDatasetXlsx(req: Request, res: Response) {
  const dataset = await loadDataset(req.params.id, res.locals.orgData.id);

  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    `attachment; filename="${slug(dataset.name)}.xlsx"`);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const sheet = wb.addWorksheet(slug(dataset.name).slice(0, 31));
  sheet.commit();

  const cfg = await loadDatasourceConfig(dataset.datasourceId);
  const pool = await acquire(cfg);

  let headerWritten = false;
  for await (const batch of pool.cursor(/* sql with RLS */)) {
    if (!headerWritten) {
      sheet.columns = batch.columns.map(c => ({ header: c.name, key: c.name }));
      sheet.getRow(1).font = { bold: true };
      headerWritten = true;
    }
    for (const row of batch.rows) {
      sheet.addRow(row).commit();
    }
  }
  sheet.commit();
  await wb.commit();
}
```

ExcelJS streaming writer writes the spreadsheet incrementally into
the response — same memory profile as CSV.

### 4.7 Data-render (dashboard XLSX, one sheet per visual)

```ts
// POST /exports → enqueue export-job → worker picks up
// → for each visual on the dashboard, run the same SQL the
//    dashboard would (with RLS) → write to its own worksheet
// → upload to S3 → update export_job with downloadUrl

async function renderDashboardXlsx(jobId: string) {
  const job = await ExportJob.findOne({ where: { id: jobId } });
  const dashboard = await loadDashboard(job.surfaceId, job.organisationId);
  const visuals = await loadDashboardVisuals(dashboard.id);

  // Stream into a tempfile, not memory.
  const tempPath = path.join(os.tmpdir(), `${jobId}.xlsx`);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: tempPath });

  for (const v of visuals) {
    const sheetName = sanitiseSheetName(v.title || `Visual ${v.sequence}`);
    const sheet = wb.addWorksheet(sheetName);
    const rows = await runVisualQuery(v, job.options?.filters, job.userId);
    sheet.columns = inferColumns(rows[0]);
    for (const r of rows) sheet.addRow(r);
    sheet.commit();
  }
  await wb.commit();

  // Upload to S3, build signed URL with 7-day expiry.
  const key = `exports/${job.organisationId}/${jobId}.xlsx`;
  await s3.upload({ Bucket: process.env.EXPORT_BUCKET!, Key: key,
                    Body: fs.createReadStream(tempPath) }).promise();
  const url = await s3.getSignedUrlPromise('getObject', {
    Bucket: process.env.EXPORT_BUCKET, Key: key, Expires: 7 * 24 * 3600,
  });
  await fs.promises.unlink(tempPath);

  await ExportJob.update(jobId, {
    status: 'ok', downloadUrl: url, storageKey: key,
    expiresAt: addDays(new Date(), 7), finishedOn: new Date(),
    sizeBytes: (await fs.promises.stat(tempPath).catch(()=>({size:0}))).size,
  });

  await notifyUser(job.userId, 'export.ready', { jobId, surface: 'dashboard',
                                                  format: 'xlsx', url });
}
```

Sheet names have weird Excel rules:

```ts
function sanitiseSheetName(s: string): string {
  // Excel sheet names: ≤31 chars, no \ / * ? : [ ]
  return s.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31).trim() || 'Sheet';
}
```

### 4.8 Pixel-render pipeline (dashboard PDF)

```ts
// src/modules/exports/services/pdfRenderer.ts
import puppeteer, { Browser, Page } from 'puppeteer';
import { signServiceToken } from '../../../shared/services/serviceToken';

class BrowserPool {
  private browsers: Browser[] = [];
  private capacity = Number(process.env.EXPORT_BROWSER_POOL || 4);
  private inUse = new Set<Browser>();

  async use<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.acquire();
    const page = await browser.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close();
      this.release(browser);
    }
  }

  private async acquire(): Promise<Browser> {
    for (const b of this.browsers) {
      if (!this.inUse.has(b)) { this.inUse.add(b); return b; }
    }
    if (this.browsers.length < this.capacity) {
      const b = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      });
      this.browsers.push(b);
      this.inUse.add(b);
      return b;
    }
    // All in use — wait
    await new Promise(r => setTimeout(r, 100));
    return this.acquire();
  }

  private release(b: Browser) { this.inUse.delete(b); }

  async destroy() {
    await Promise.all(this.browsers.map(b => b.close()));
    this.browsers = [];
  }
}

const pool = new BrowserPool();

export async function renderDashboardPdf(
  dashboardId: string,
  options: { filters?: any; watermark?: string; password?: string;
              pageSize?: string; landscape?: boolean; userId: string;
              organisationId: string },
): Promise<Buffer> {
  return pool.use(async (page) => {
    const token = await signServiceToken({
      userId: options.userId,
      organisationId: options.organisationId,
      purpose: 'export-render',
      ttlSeconds: 300,
    });
    const url = `${process.env.FE_URL}/embed/dashboard/${dashboardId}?print=true&filters=${encodeURIComponent(JSON.stringify(options.filters ?? {}))}`;
    await page.setExtraHTTPHeaders({ 'x-auth-token': token });
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 120_000 });

    // FE sets window.__DASHBOARD_READY__ = true after all visuals have
    // rendered. Polling beats networkidle because some charts do their
    // own animations that count as network "activity".
    await page.waitForFunction(
      () => (window as any).__DASHBOARD_READY__ === true,
      { timeout: 120_000 },
    );

    if (options.watermark) {
      await page.evaluate((wm: string) => {
        const d = document.createElement('div');
        d.style.cssText = `
          position:fixed; inset:0;
          display:flex; align-items:center; justify-content:center;
          pointer-events:none; z-index:9999;
        `;
        d.innerHTML = `<div style="
          opacity:.06; font-size:120px; transform:rotate(-30deg);
          font-family:Inter,sans-serif; color:#000;
        ">${wm.replace(/</g,'&lt;')}</div>`;
        document.body.appendChild(d);
      }, options.watermark);
    }

    const pdf = await page.pdf({
      format: (options.pageSize as any) || 'A3',
      landscape: options.landscape ?? true,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    if (options.password) {
      return await encryptPdf(pdf, options.password);
    }
    return pdf;
  });
}
```

### 4.9 Multi-tab dashboard PDF

Per [the multi-tab dashboard implementation doc](../../implementation/MULTI-TAB-DASHBOARD.md),
a dashboard has tabs. PDF export options:

- **All tabs**: render each tab as separate page section, separated
  by a page break. The print URL accepts `?tabs=all`.
- **Specific tab**: render only that tab. `?tab=<tabId>`.
- **Active tab**: default. The currently-active tab (per the user's
  last view) is what comes out.

```ts
// FE print template (page-level)
.dashboard-print {
  .dashboard-tab {
    page-break-after: always;
    /* Each tab renders on its own page section */
  }
  .dashboard-tab:last-child { page-break-after: avoid; }
}
```

### 4.10 Visual PNG

Three render strategies, picked by what's available:

1. **Puppeteer** (most reliable). Same browser-pool path as PDF.
   URL: `/embed/visual/:id?png=true`. After ready, `page.screenshot({
   clip: { x, y, width, height } })`.
2. **Server-side ECharts** (faster). Use `echarts` + `canvas` (node-
   canvas) to render the same option object the FE built. Saves a
   browser round-trip. ~10x faster for simple chart types.
3. **Client-side capture** (free). FE uses `dom-to-image` or
   `html2canvas`, posts the PNG to the BE which writes it through
   to export_job. Works for tiny instances without a Puppeteer
   pool, but quality is worse and chart fonts can mis-render.

Production: strategy 1 (Puppeteer) for fidelity, strategy 2 as an
optimisation for known chart types.

### 4.11 Async queue + storage

```
┌──────────────────────────────────────────────────────────────┐
│ POST /exports                                                 │
│   → insert export_job (status='queued')                      │
│   → publish to BullMQ:export queue                            │
│   → return { jobId } to caller                                │
└────────────────────┬─────────────────────────────────────────┘
                     ▼
            ┌──────────────────────┐
            │  BullMQ:export worker │  (capacity = browser pool size)
            └────────┬──────────────┘
                     ▼
        export_job.status='running'
                     ▼
   route by renderType:
     data:  → render to tempfile (csv/xlsx/parquet/json)
     pixel: → puppeteer render via BrowserPool
                     ▼
        upload to S3 with key
                     ▼
        signed URL (7-day default expiry)
                     ▼
        export_job.status='ok' + downloadUrl + sizeBytes
                     ▼
        notify user (websocket push + email if recipient set)
        emit webhook event 'export.completed'
                     ▼
        clean up tempfile
```

Worker concurrency = 4 by default (matches browser-pool capacity).
Tunable per environment.

### 4.12 Watermarks

The watermark string is drawn on every PDF page as a 45°-rotated,
6% opacity text overlay. Three sources, in priority order:

1. Per-export user-supplied string (`options.watermark` from the
   request body).
2. Per-org default from `org_branding.watermark_text` (if set).
3. Auto-generated for compliance-mode orgs:
   `EXPORTED BY {user.email} · {ISO timestamp} · {jobId.slice(0,8)}`.

Watermark presence is recorded on the `export_job` row so an
auditor can answer "was this file watermarked?" later.

### 4.13 Password-protected PDF

PDF encryption can't be done in pure JS easily. Two paths:

- **qpdf shell-out** (Linux). After `page.pdf()` writes the file,
  shell to `qpdf --encrypt <pw> <pw> 256 -- in.pdf out.pdf`.
  Requires qpdf binary on the host.
- **pdf-lib + sodium** — pdf-lib v1.18+ supports encryption but
  with limitations on signed PDFs. Pure JS, no system dep.

Recommended: shell out to qpdf. Documented as a host requirement.

```ts
async function encryptPdf(pdfBuffer: Buffer, password: string): Promise<Buffer> {
  const tmp = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
  const out = `${tmp}.enc.pdf`;
  try {
    await fs.promises.writeFile(tmp, pdfBuffer);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('qpdf', [
        '--encrypt', password, password, '256',
        '--print=full', '--modify=none', '--copy=none',
        '--', tmp, out,
      ]);
      child.on('exit', c => c === 0 ? resolve() : reject(new Error('qpdf failed')));
      child.on('error', reject);
    });
    return await fs.promises.readFile(out);
  } finally {
    await fs.promises.unlink(tmp).catch(() => {});
    await fs.promises.unlink(out).catch(() => {});
  }
}
```

### 4.14 Parameter sweep

"Generate one PDF per region" pattern. The user picks a parameter
(`region`) with N possible values. The job spawns N child jobs,
one per value. Each runs the dashboard with that parameter applied,
produces its own PDF, all collected into a ZIP at the end.

```ts
async function processParameterSweep(parentJobId: string) {
  const parent = await ExportJob.findOne({ where: { id: parentJobId } });
  const sweep = parent.options!.parameterSweep!;
  const childJobs = await Promise.all(sweep.values.map(v =>
    ExportJob.save({
      organisationId: parent.organisationId,
      userId: parent.userId,
      surface: parent.surface, surfaceId: parent.surfaceId,
      format: 'pdf', renderType: 'pixel',
      options: { ...parent.options,
                 filters: { ...parent.options?.filters, [sweep.paramId]: v },
                 parameterSweep: undefined },
      status: 'queued',
    })));
  // Process serially to avoid puppeteer pool exhaustion
  const buffers: { value: any; pdf: Buffer }[] = [];
  for (let i = 0; i < childJobs.length; i++) {
    const pdf = await renderDashboardPdf(parent.surfaceId, {
      ...parent.options,
      filters: { ...parent.options?.filters, [sweep.paramId]: sweep.values[i] },
      userId: parent.userId,
      organisationId: parent.organisationId,
    });
    buffers.push({ value: sweep.values[i], pdf });
    await ExportJob.update(childJobs[i].id, {
      status: 'ok', sizeBytes: pdf.length,
    });
  }
  // Bundle into ZIP
  const zip = new JSZip();
  for (const b of buffers) {
    zip.file(`${slug(String(b.value))}.pdf`, b.pdf);
  }
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  // Upload, signed URL, update parent...
}
```

### 4.15 Format-specific gotchas

| Format | Watch out for |
|---|---|
| **CSV** | Excel will mangle BOM-less UTF-8 with non-ASCII headers. Always write BOM (`﻿`) before the header row. |
| **CSV** | Excel auto-parses "01/02/2026" as date in user's locale. Numeric IDs that look like dates (e.g. SKU "01-02-2026") get reformatted. Workaround: prepend `=` for text-mode in Excel, or use XLSX instead. |
| **XLSX** | Sheet name ≤ 31 chars, no `\ / * ? : [ ]`. Sanitise. |
| **XLSX** | Big numbers (>15 digits) lose precision when Excel opens. Snowflake bigint user IDs are a classic victim. Force string format for any column where this matters. |
| **PDF** | `pdf-lib` and `qpdf` disagree on encryption flags. Test both. |
| **PNG** | Puppeteer's default viewport is 800×600 — way too small for a dashboard. Use 1920×1080 and `deviceScaleFactor: 2` for retina. |
| **JSON** | Default `JSON.stringify` mangles bigint and Date. Use a custom replacer. |
| **Parquet** | Schema must be declared upfront (no streaming inference like CSV). Run a dry pass to infer types, then write. |

## 5. Validators (Zod)

```ts
// src/shared/validators/exports.ts
export const EXPORT_FORMATS = [
  'csv','xlsx','parquet','json','jsonl','pdf','png','svg',
] as const;
export const EXPORT_SURFACES = [
  'dataset','visual','analysis','dashboard','tab',
] as const;
export const PAGE_SIZES = ['A4','A3','Letter','Legal'] as const;

export const createExportJobSchema = z.object({
  surface: z.enum(EXPORT_SURFACES),
  surfaceId: z.string().uuid(),
  tabId: z.string().uuid().optional(),
  format: z.enum(EXPORT_FORMATS),
  options: z.object({
    filters: z.record(z.string(), z.any()).optional(),
    watermark: z.string().max(64).optional(),
    password: z.string().min(8).max(64).optional(),
    pageSize: z.enum(PAGE_SIZES).optional(),
    landscape: z.boolean().optional(),
    parameterSweep: z.object({
      paramId: z.string().uuid(),
      values: z.array(z.any()).min(1).max(100),
    }).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  // PDF/PNG/SVG only make sense for visual/analysis/dashboard/tab
  if (['pdf','png','svg'].includes(data.format) && data.surface === 'dataset') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['format'],
      message: 'validation.export.format.invalidForSurface' });
  }
  // tabId is only meaningful when surface === 'tab' or 'dashboard'
  if (data.tabId && !['dashboard','tab'].includes(data.surface)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tabId'],
      message: 'validation.export.tabId.notApplicable' });
  }
  if (data.surface === 'tab' && !data.tabId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tabId'],
      message: 'validation.export.tabId.required' });
  }
});
```

## 6. FE specs

### 6.1 Export button

Lives on every export-capable surface. Tap reveals a menu with the
formats applicable to that surface and a small "..." for advanced
options (watermark, password, page size).

```
┌─────────────────────────┐
│ Export                 ▾│
├─────────────────────────┤
│ ⬇  CSV                  │
│ ⬇  Excel (.xlsx)        │
│ ⬇  PDF                  │
│ ⬇  PNG (image)          │
│ ─────────────────────── │
│ ⚙  More options...      │
│ ⏰ Schedule recurring... │
└─────────────────────────┘
```

### 6.2 Advanced options dialog

```
Export Dashboard as PDF

  Page size:    [ A3 ▾ ]
  Orientation:  ◉ Landscape  ○ Portrait
  Watermark:    [Confidential — Sales Team___________]
  Password:     [_______________] (optional)

  ☐ Apply current filter selections
  ☐ Export each tab as a separate page
  ☐ Parameter sweep:  [ region ▾ ] → 4 values

  [Cancel]                              [Export]
```

### 6.3 Export job tracker

For async exports, the FE shows a small toaster on submit:

```
┌──────────────────────────────────────┐
│ ⏳ Exporting dashboard PDF...        │
│ You can navigate away — we'll        │
│ notify you when it's ready.          │
└──────────────────────────────────────┘
```

A bell-icon dropdown in the topbar lists recent exports with their
status. Completed ones get a "Download" button; failed ones show
the error.

### 6.4 The "print URL" — what makes Puppeteer's job possible

`/embed/dashboard/:id?print=true` is a FE route that:

- Hides the chrome (sidebar, topbar, share dialog).
- Renders all tabs sequentially (when print=true) with
  `page-break-after: always` between them.
- Sets `document.body.dataset.printMode = '1'`.
- After all chart data loads + all images load,
  `window.__DASHBOARD_READY__ = true`.
- Honours `?watermark=`, `?filters=`, `?tab=` etc query params.

It's worth its own dedicated component because mixing print mode
into the interactive view leads to brittle CSS.

## 7. Test plan

### 7.1 Data render

```
EXP-CSV-H-01    dataset CSV, 1k rows → file downloaded
EXP-CSV-H-02    dataset CSV with non-ASCII headers → BOM prepended, Excel opens it correctly
EXP-CSV-H-03    50,000 rows → sync, browser receives stream
EXP-CSV-H-04    100,000 rows → 413 with "use async export"
EXP-CSV-H-05    cancel mid-download → connection drops cleanly
EXP-CSV-N-01    user denied by RLS → empty CSV (just header)
EXP-XLSX-H-01   small XLSX → file downloaded, opens in Excel
EXP-XLSX-H-02   sheet name with /:*? → sanitised to underscores
EXP-XLSX-H-03   bigint column → exported as text (no precision loss)
EXP-XLSX-N-01   sheet name longer than 31 chars → truncated
EXP-JSON-H-01   JSONL → one object per line, bigint serialised correctly
EXP-PARQ-H-01   Parquet → schema preserved, ints stay ints
```

### 7.2 Pixel render

```
EXP-PDF-H-01    dashboard PDF → file exists, multi-page if multi-tab
EXP-PDF-H-02    landscape A3 → page size honoured
EXP-PDF-H-03    watermark text appears on every page
EXP-PDF-H-04    password-protected PDF requires password to open
EXP-PDF-N-01    dashboard with one broken visual → others render, broken one shows placeholder
EXP-PDF-N-02    dashboard timeout (>2 min) → job marked failed with reason
EXP-PNG-H-01    visual PNG → 1920×1080 default, matches on-screen
EXP-PNG-H-02    deviceScaleFactor=2 → retina-quality
EXP-PNG-N-01    visual with empty data → blank chart frame + "no data" overlay
EXP-SVG-H-01    visual SVG → fonts embedded, opens in Illustrator
```

### 7.3 Async pipeline

```
EXP-ASYNC-H-01  POST /exports → 202 with jobId
EXP-ASYNC-H-02  GET /exports/:jobId → status progresses queued → running → ok
EXP-ASYNC-H-03  completed job → downloadUrl returns 200
EXP-ASYNC-H-04  download URL after 7 days → 403 expired
EXP-ASYNC-N-01  cancel running job → status='cancelled'
EXP-ASYNC-N-02  worker crash → status='failed' with error
EXP-ASYNC-H-05  notify user via websocket on completion
```

### 7.4 Sweep

```
EXP-SWEEP-H-01  4 values → ZIP with 4 PDFs
EXP-SWEEP-N-01  >100 values → 400 (cap)
EXP-SWEEP-H-02  one child fails → ZIP missing that file, audit notes
```

### 7.5 Audit

```
EXP-AUDIT-H-01  every export writes an export_job + audit_log row
EXP-AUDIT-H-02  audit metadata contains format, sizeBytes, surface, recipient
EXP-AUDIT-H-03  search "exports by user Alice in last 30 days" → returns set
```

### 7.6 Multi-tab dashboard exports

```
EXP-TAB-H-01    PDF with ?tabs=all → one section per tab, page breaks correct
EXP-TAB-H-02    PDF with ?tab=<id> → only that tab
EXP-TAB-H-03    XLSX one-sheet-per-visual respects tab grouping
                (visuals on different tabs land on differently-prefixed sheets)
```

## 8. Migration & rollout

1. Phase 1 — sync CSV + XLSX for datasets and visuals. No worker
   pool needed.
2. Phase 2 — Puppeteer worker pool, dashboard PNG export, audit
   trail.
3. Phase 3 — async job table, S3 storage, dashboard PDF.
4. Phase 4 — watermark, password, parameter sweep.
5. Phase 5 — Parquet, JSON, multi-tab.

Per-org feature flag `enableExport`. Quota for daily exports per
org (`max_exports_per_day`) prevents abuse.

## 9. Open questions

- **What goes into the PDF header / footer?** Currently nothing.
  Org branding (logo + name) is a small additional render step
  and ties into module 20.
- **Should we offer CSV with a column-mapping config?** Some users
  want the export to use friendly column names ("Customer Email")
  not the DB names ("customer_email"). Per-dataset mapping table.
- **Excel "tables"?** When the data goes into XLSX, Excel renders
  it nicer if it's a formal `<table>` object. ExcelJS supports this
  but it's slower. Pick per-org default.
- **Parquet schema compatibility.** When the dataset's column types
  drift, the Parquet export from yesterday won't merge with today's.
  Documentation problem more than code.

## 10. References

- Puppeteer print: <https://pptr.dev/api/puppeteer.page.pdf>
- ExcelJS streaming: <https://github.com/exceljs/exceljs#streaming-xlsx-writer>
- pg-cursor: <https://node-postgres.com/apis/cursor>
- qpdf encryption: <https://qpdf.readthedocs.io/en/stable/cli.html#option-encrypt>
- Apache Parquet schema: <https://parquet.apache.org/docs/file-format/types/>
- Tableau Export Excel notes: <https://help.tableau.com/current/server/en-us/dataserver.htm>

## Appendix · Review additions

- **Watermarks** — see §4.12 above.
- **Encrypted PDF** with password — see §4.13.
- **Multi-tab dashboard PDF** — see §4.9.
- **Parameter sweep export** — see §4.14.
- **Per-tab XLSX with tab-aware sheet grouping**.
- **Markdown / HTML export of an analysis** (V2).
- **Signed download URL with TTL** — implemented via S3 presigned URL.
- **Audit log includes recipient** when an export is emailed via
  subscription.
- **Idempotency key** on POST /exports — re-submit the same export
  options within 5 min returns the same job.
