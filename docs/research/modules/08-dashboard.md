# 08 · Dashboard

> The viewing surface. DBExec ships snapshot dashboards. Adding live
> mode, dashboard-level filters, cross-analysis filters, embedding,
> and exports turns it into a full peer of Looker / Superset.

**Depends on:** Analysis (06), Filters (07), Cache (05)
**Unblocks:** Sharing (14), Subscriptions (15)
**Maturity:** 🟡

---

## 1. Industry baseline

- **Tableau Server** — Workbooks live; thumbnails cached.
- **Power BI** — Reports are live (DirectQuery) or import-mode.
- **Looker** — Dashboards live; "Cache results" toggle.
- **Metabase** — Live; per-question cache TTL.
- **Superset** — Live; Redis result cache + thumbnails.

DBExec's snapshot model is a deliberate choice for sharing reliability
but customers will ask for live mode within months.

## 2. DBExec today

- **Mode**: snapshot only.
- **Filters**: inherited from analyses; no dashboard-level bar.
- **Export**: none.
- **Cross-analysis filters**: none.
- **Public link / embed**: none.

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| DSH-G01 | Live mode (re-query on render) | P0 |
| DSH-G02 | Dashboard filter bar | P0 |
| DSH-G03 | Cross-analysis filters | P0 |
| DSH-G04 | PDF export | P0 |
| DSH-G05 | PNG export (per visual + whole-board) | P0 |
| DSH-G06 | Public share link | P0 |
| DSH-G07 | Embed (JWT-signed) | P0 |
| DSH-G08 | Dashboard layout: drag-resize grid | 🟡 partial today, polish needed |
| DSH-G09 | Dashboard sections / tabs | P1 |
| DSH-G10 | Mobile layout (auto-stack on narrow screens) | P1 |
| DSH-G11 | Dashboard description / cover image | P2 |
| DSH-G12 | Dashboard "follow" + new-comment notification | P2 |
| DSH-G13 | Dashboard comments + @mentions | P1 |
| DSH-G14 | Dashboard versioning + restore | P1 |
| DSH-G15 | Thumbnail caching (Redis) | P1 |
| DSH-G16 | "Snapshot vs live" override per visual on a board | P2 |

## 4. Target architecture

### 4.1 Schema delta

```sql
ALTER TABLE dashboard
  ADD COLUMN mode varchar(16) NOT NULL DEFAULT 'snapshot',
  ADD COLUMN cover_image_url text,
  ADD COLUMN sections jsonb,                    -- [{ id, name, layout }]
  ADD COLUMN settings jsonb;                    -- per-board prefs

CREATE TABLE dashboard_thumbnail (
  dashboard_id uuid PRIMARY KEY,
  bytes        bytea NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 Render flow (live mode)

```
GET /dashboards/:id/render
  ↓
load dashboard row
  ↓
for each analysis on the board:
   ↓
   compile SemanticRequest (with dashboard filters merged)
   ↓
   cacheService.getOrCompute(sql, ttl, () => pool.query)
   ↓
   return rows
  ↓
respond {layout, visuals: [{id, options, rows, columns}]}
```

### 4.3 PDF / PNG export

Server-side, headless Chromium navigates to `/embed/dashboard/<id>?print=true`
with a short-lived service token; waits for `__DASHBOARD_READY__ === true`;
calls `page.pdf()` or `page.screenshot()`.

```ts
// shared/services/dashboardExport.service.ts
export class DashboardExportService {
  constructor(private browser: BrowserPool) {}

  async pdf(dashboardId: string, opts: ExportOpts): Promise<Buffer> {
    return this.browser.use(async (page) => {
      await page.setExtraHTTPHeaders({ 'x-auth-token': opts.serviceToken });
      await page.goto(
        `${FE_URL}/embed/dashboard/${dashboardId}?print=true&filters=${encodeURIComponent(JSON.stringify(opts.filters || {}))}`,
        { waitUntil: 'networkidle0', timeout: 90_000 },
      );
      await page.waitForFunction(
        () => (window as any).__DASHBOARD_READY__ === true,
        { timeout: 90_000 },
      );
      return await page.pdf({
        format: opts.format || 'A3',
        landscape: opts.landscape ?? true,
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });
    });
  }
}
```

Browser pool keeps 2-4 warm Chromium instances to avoid spin-up cost.

### 4.4 Thumbnails

Async job: every dashboard publish + every 24h regenerates a 640×400
PNG. Stored in `dashboard_thumbnail` row, cached in Redis for hot
serving.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/dashboards/publish` | New or republish (existing) |
| GET  | `/dashboards/list` | List |
| GET  | `/dashboards/:id` | Single |
| GET  | `/dashboards/:id/render` | Render data (live or snapshot) |
| GET  | `/dashboards/:id/render/visual/:vid` | Single visual data |
| POST | `/dashboards/:id/filters` | Update dashboard filter bar |
| POST | `/dashboards/:id/export/pdf` | Export PDF |
| POST | `/dashboards/:id/export/png` | Export PNG |
| POST | `/dashboards/:id/export/xlsx` | Export rows as XLSX (multi-sheet) |
| GET  | `/dashboards/:id/thumbnail` | PNG thumbnail |
| POST | `/dashboards/:id/follow` | Follow / unfollow |
| GET  | `/dashboards/:id/comments` | List comments |
| POST | `/dashboards/:id/comments` | Add comment + @mentions |

## 6. UI specs

### 6.1 Dashboard view page

Layout:

```
┌──────────────────────────────────────────────────────────────┐
│  ◀ Back │ Sales Q3 Review                  [Share] [Refresh] │
│  Owner: Gaurav · Last published 2h ago · Live                │
├──────────────────────────────────────────────────────────────┤
│  [Region: APAC ▾] [Period: MTD ▾] [...] [Apply] [Reset]      │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────────────────────────────────┐ │
│  │ Visual 1    │ │              Visual 2                   │ │
│  │             │ │                                          │ │
│  └─────────────┘ └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐│
│  │ Visual 3                    │ │ Visual 4                 ││
│  │                             │ │                          ││
│  └─────────────────────────────┘ └──────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

Top bar: title, owner, freshness ("Last published 2h ago"), mode badge
(Snapshot / Live), Share button, Refresh button.

Filter bar: dashboard-level filters with "Apply" toggle and "Reset".

### 6.2 Share dialog

Tabs:

- **Internal** — search users/groups, pick permission (View / Edit).
- **Link** — toggle public link, set expiry, set password.
- **Embed** — JWT generator preview, copy snippet, host allowlist.
- **Export** — PDF / PNG / XLSX immediate or schedule.

### 6.3 Comments

Right sidebar slide-out:

- Comment thread anchored to dashboard OR to a specific visual.
- @mention autocomplete from org users.
- Markdown supported.

## 7. Code recipes

### 7.1 Live render endpoint

```ts
// src/modules/dashboards/controllers/renderDashboard.ts
export default async function renderDashboard(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection, orgData, loggedInId } = res.locals;

  const dashboard = await master_db_connection.getRepository(Dashboard)
    .findOne({ where: { id, organisationId: orgData.id } });
  if (!dashboard) return sendResponse(res, false, CODE.NOT_FOUND, 'not found');

  if (dashboard.mode === 'snapshot') {
    return sendResponse(res, true, CODE.SUCCESS, 'ok', dashboard.snapshot);
  }

  // Live mode — render each analysis.
  const analyses = await loadAnalyses(dashboard.layout.analyses);
  const dashboardFilters = mergeDashboardFilters(dashboard.filters, req.query);

  const visuals = await Promise.all(
    analyses.map(a => renderVisual(a, dashboardFilters, { caller: loggedInId, orgData })),
  );

  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    layout: dashboard.layout,
    visuals,
    meta: { mode: 'live', generatedAt: new Date().toISOString() },
  });
}

async function renderVisual(analysis: Analyses, filters: FilterClause[], ctx: any) {
  // Compile + run + cache (using semantic compiler + cache service).
  return { id: analysis.id, options: ..., rows: ..., columns: ... };
}
```

### 7.2 Browser pool (puppeteer)

```ts
// shared/services/browserPool.ts
import puppeteer, { Browser, Page } from 'puppeteer';

export class BrowserPool {
  private browsers: Browser[] = [];
  private capacity = 4;

  async use<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.acquire();
    const page = await browser.newPage();
    try { return await fn(page); }
    finally { await page.close(); }
  }

  private async acquire(): Promise<Browser> {
    if (this.browsers.length < this.capacity) {
      const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      this.browsers.push(b);
      return b;
    }
    return this.browsers[Math.floor(Math.random() * this.browsers.length)];
  }

  async destroy() {
    await Promise.all(this.browsers.map(b => b.close()));
    this.browsers = [];
  }
}
```

## 8. Test plan

- **DSH-LIVE-H-01** — live dashboard re-queries on render
- **DSH-LIVE-H-02** — snapshot dashboard returns frozen rows
- **DSH-FLT-H-01** — dashboard filter applies to every visual
- **DSH-FLT-H-02** — filter scope excludes a specific analysis
- **DSH-EXP-H-01** — PDF export downloads non-zero bytes
- **DSH-EXP-H-02** — PNG export per visual matches the on-screen render
- **DSH-EXP-N-01** — PDF export when one visual errors → renders the rest, error placeholder for the bad one
- **DSH-EMBED-H-01** — JWT-signed embed loads in iframe; sidebar/header hidden
- **DSH-EMBED-N-01** — expired JWT → 401 in iframe

## 9. Migration & rollout

1. Schema migration adds `mode`, defaults to `snapshot` (current
   behaviour).
2. Live mode ships behind flag.
3. Filter bar additive.
4. Export gated by feature flag per org.

## 10. Open questions

- "Snapshot vs live per visual" — should we allow heterogenous on
  one board (G16)? Yes, useful for "current revenue (live) +
  last-published target (snapshot)". V2.
