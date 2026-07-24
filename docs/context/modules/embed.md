# embed
> Update the Progress log on every change.
> Code path: `src/app/modules/embed` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The PUBLIC, read-only, chrome-less dashboard viewer a share link opens — hosted OUTSIDE the `/app` shell (no sidebar/topbar, no auth guard, no `x-auth-token`), token-gated.
- Key files:
  - `embed-dashboard.component.ts` (standalone) — reads the opaque `:token` from the route, renders the snapshot layout via the public render endpoint, runs snapshot SQL via the public run endpoint, and draws each visual with the SAME shared components the authed dashboard uses (echart-visual / table-visual / `ChartDataTransformerService`) so charts look identical. Multi-tab render, blocking pre-load gate, text/KPI widgets, configurable cross-filter.
  - `embed-dashboard.component.html/scss`, `embed-dashboard.module.ts`.
  - `core/constants/api.constant.ts` → `PUBLIC_DASHBOARD` (RENDER_PREFIX `/public/dashboards/:token`, RUN_PREFIX + RUN_SUFFIX `/run`) — a mount that sits OUTSIDE the auth middleware chain.
- Depends on / depended on by: reuses `analyses` (Visual model, ChartDataTransformer, chart constants), `dashboard` (DashboardService, cross-filter, preload-gate + widget components), `SharedChartsModule`. No dependents inside the app. BE counterpart: the `/public/dashboards` controllers, RLS-hardened for an anonymous viewer.
- Routes: lazy at `embed/dashboard/:token` in `app-routing.module.ts`, registered OUTSIDE the `/app` shell block — deliberately no auth/role guard.
- How it works: token in → public render endpoint returns the point-in-time snapshot layout → public run endpoint executes the snapshot SQL under the anonymous RLS-hardened identity (never more) → the shared widget/chart components paint. Render parity with the authed Dashboard/Analysis v2 view, but still view-only: no filter sidebar, no share/export/schedule chrome, no edit. A bad/expired/revoked token surfaces a friendly error state.
- Decisions: dashboards are point-in-time snapshots at publish, not live mirrors (see memory `dashboard-snapshot-model`) — the embed renders the snapshot. Chrome-less standalone component is the PRECEDENT the planned embedded-OEM auto-login mode clones (see memory `embedded-oem-autologin`). Global conventions in ../ARCHITECTURE.md.
- Gotchas / constraints: NO auth guard and NO `x-auth-token` — this route is intentionally public; all security is the opaque token + BE-side anonymous RLS. Today Helmet default = `X-Frame-Options: DENY` on the BE, so the app is NOT iframe-able yet (a hard blocker the OEM-embed design must lift via `frame-ancestors`). Do not add shell chrome, guards, or authed-only imports here — it must render with zero session.

## 2. Goals
- Objective: a pixel-faithful, view-only public snapshot of a published dashboard, safe for an anonymous viewer.
- Current focus: — none active.
- Next up: (adjacent, NOT this module) the embedded-OEM auto-login handoff design uses this component as its frameless precedent — DESIGN ONLY, not built (see `embedded-oem-autologin`).
- Out of scope: authoring, filters, export/schedule chrome, any write.

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: standalone public dashboard embed viewer (8b1addc5); render parity brought up to Dashboard/Analysis v2 — tabbed render, pre-load gate, text/KPI widgets, cross-filter (9e072fbb). Token-gated, chrome-less, no auth guard. On version_261.
- In progress / Known issues: app not iframe-able yet (Helmet `X-Frame-Options: DENY`); OEM auto-login that would reuse this shell is design-only. UI commits reported local-only in memory.
- Next: —
- Files touched: docs/context/modules/embed.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/embed`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/embed.md
