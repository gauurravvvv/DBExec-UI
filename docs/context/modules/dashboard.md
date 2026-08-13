# dashboard
> Update the Progress log on every change.
> Code path: `src/app/modules/dashboard` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: view a published dashboard (grid of visual widgets), run its live query, cross-filter/drill, export (PNG/PDF/CSV), manage sharing (public embed token + asset-share access), and schedule email delivery.
- Key files:
  - `components/view-dashboard` — the main render surface: preload-gate → per-visual paint, top filter bar, cross-filter wiring, export/share/schedule buttons.
  - `components/list-dashboard` — app-custom-table list + Dataset-name column (Datasource column dropped) + Share/Duplicate/Delete/Export-import row actions.
  - `components/dashboard-widget` (+ `simple-markdown.util.ts`) — one visual card (chart / KPI / markdown text).
  - `components/dashboard-preload-gate` — waits for all widget data before paint.
  - `components/share-dashboard-dialog` — public revocable/expiring embed-token link management.
  - `components/schedule-delivery-dialog` — cron + recipients + PDF delivery.
  - `services/dashboard.service.ts`, `services/dashboard-interaction.ts` (cross-filter; note: `.ts` not `.service.ts`), `services/dashboard-subscription.service.ts`, `services/dashboard-export.util.ts`.
- Depends on / depended on by: analyses (source of a published dashboard); shared echart-visual + asset-share-dialog; the standalone `embed` module renders the same dashboard unauthenticated via public token. BE counterpart: dbexec-api `renderDashboard.ts`, `/public/dashboards/:token` route (no-auth, RLS-enforced), subscription scheduler.
- How it works: view resolves a dashboard → preload-gate fetches every widget's rows via the dashboard `/run` query → `paintVisual()` transforms rows to echarts per widget → top filter bar re-queries in live/autoApply mode → cross-filter events flow through `dashboard-interaction.ts`. Export uses html2canvas + jspdf (bundled, no CDN). Public embed link stores only a sha256 HASH of a 256-bit token.
- Decisions: dashboards are intended to be **point-in-time snapshots at publish**, but the CURRENT implementation is a **live view** (`renderDashboard.ts` reads `dashboard.analysis.visuals` at render time) — editing the analysis changes every dashboard on it. This is the OPPOSITE of the intended model; snapshot columns are designed but not built ([[dashboard-snapshot-model]]). See ../ARCHITECTURE.md for tenancy/auth.
- Gotchas / constraints:
  - **Paint gate must match render gate**: KPI/number-cards render on a single axis; gating `paintVisual` on `xAxis && yAxis` blanks them → "No data available" despite rows (FIXED 038d33f2, [[dashboard-kpi-paint-gate]]).
  - Live-mode filters: `app-custom-multiselect` and `app-custom-rangeslider` needed explicit `(ngModelChange)` handlers to re-query — `[(ngModel)]`-only updated values silently without firing `/run` (FIXED 69e3e084).
  - Public embed path is STRICTER on RLS than the authed path — a dataset with rules but none resolving for the anon sentinel returns EMPTY (anti-leak); denyAll honoured; column masks applied.
  - `analyses.TableVisualComponent` is private to analyses.module — `view-dashboard`'s `app-table-visual` may not resolve; the embed viewer uses an inline table instead. Verify authed table visuals actually render.

## 2. Goals
- Objective: faithful, fast dashboard viewing with working live filters, cross-filter, export, sharing, and scheduled delivery.
- Current focus: — none active.
- Next up: implement the snapshot model (flip `renderDashboard.ts` ~L51 `dashboard.analysis?.visuals` → `dashboard.visualsSnapshot`) when the user greenlights it; confirm authed table-visual resolution.
- Out of scope: analysis authoring (in `analyses`), alert evaluation (in `alerts`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: viz-v2 dashboard shipped on version_261 — snapshot publish + dashboard-level filters + widgets + subscriptions; public share-token embed + export PNG/PDF/CSV (FE 28c36c7e/8b1addc5, BE 79684f4); pivot/conditional-formatting/reference-lines in visual_config JSONB (b2eda5e6); KPI/number-card paint-gate fix (038d33f2) + live multiselect/slider re-query fix (69e3e084); view-dashboard UX polish + 4-per-row filter grid (cf8d6e53); persistent top filter bar (48fb6396); asset-share Share/Manage-access on list+view (1900064c); export/import UI on the list (c1bf1cc1).
- In progress / Known issues: dashboards are LIVE-view, not snapshots (design gap, awaiting greenlight); authed dashboard table-visual resolution unverified; no live E2E of sharing/scheduled-delivery yet. All version_261 FE commits are **local-only, not pushed** (user pushes).
- Next: snapshot model when approved.
- Files touched: docs/context/modules/dashboard.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/dashboard`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/dashboard.md
