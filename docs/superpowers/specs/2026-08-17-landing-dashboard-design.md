# Landing Dashboards — Design Spec

_Date: 2026-08-17 · Branch: `feature/landing-dashboard` (both repos) · Status: approved, building_

## Goal

Replace the two blank/static post-login home screens with live, insight-rich,
permission-aware landing dashboards so that **nothing is blank when a user logs
in**. Two audiences:

- **Per-Org User dashboard** — one shared layout for every org user; each
  widget's data is gated by the viewer's RBAC permissions.
- **System / Super Admin dashboard** — the master-DB platform operator; shows a
  cross-org rollup of the whole platform.

Both must feel modern (KPI tiles + animated charts + activity feed), load fast
(skeleton stages, parallel fetch, fastest-first paint), and stay on the app's
existing theme (44 CSS-var tokens, auto per-org/per-user branded).

## Where it plugs in (NOT greenfield)

The `home` module already exists and already dispatches by role:

- `EmptyRootComponent` — dispatcher. `canRead('systemUserManagement')` →
  system-admin home, else org home. **Keep as-is.**
- `OrgHomeComponent` — today a static quick-link grid, no live data. **Rebuild.**
- `SystemAdminHomeComponent` — today real entity counts but a `Math.random()`
  fake "active users" metric. **Rebuild** (kills the fake metric).

Login flow: `/login → /app → /app/home → EmptyRoot → /app/home/org` or
`/app/home/system-admin`. Unchanged.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Widget data loading | **Hybrid**: one `/home/summary` counts call (all scalar KPIs, Promise.all) + per-widget lazy endpoints for heavier charts/feeds, fired in parallel, painting fastest-first. |
| 2 | Permission-gated widgets | Widget **always occupies its fixed slot**; if the viewer lacks the permission, the card body renders a localized **"Permission Denied"** state. Layout never reflows. (Differs from the sidebar, which hides — deliberate, so positions never shuffle.) |
| 3 | Layout | **Fixed curated layout** for v1. No user drag/reorder/persist (possible v2). |
| 4 | Admin cross-org scope | **Full cross-org rollup upfront.** v1 = live loop over org DBs with a concurrency cap + per-org timeout + skeleton. A cached nightly rollup (`node-cron`, like the alerts engine) is a **v2 follow-up** noted below. |
| 5 | Extra widgets | Recent activity feed + Quick actions + **Announcement (top-of-page)**. No "My stuff" panel. **No alerts-firing strip** (removed per user). |
| 6 | Trend range control | A global **date-range picker** at the top driving every trend widget, plus a quick **7 / 30 / 90-day** segmented toggle. |
| 7 | KPI component | Build a **new dashboard-specific stat tile** (`app-stat-tile`) using theme tokens. Leave the analyses `app-kpi-card` untouched. |
| 8 | Announcement empty state | If no active announcement, the top announcement bar is simply **not rendered** — no placeholder, no dead space. |
| 9 | Component home | New **`src/app/shared/components/dashboard/`** exported via `DashboardWidgetsModule` (imports `SharedChartsModule`). |
| 10 | Branch / push | `feature/landing-dashboard` in both repos. **User pushes; agent never pushes.** |

## Architecture

### Backend (`dbexec-api`)

New module `src/modules/home/` gains endpoints (org-scoped go through the normal
`AuthMiddleware → VerifyResourceMiddleware → VerifyDatabaseMiddleware` chain so
`res.locals.master_db_connection` is the caller's org DB; system-admin routes use
`systemContext` → master `AppDataSource`).

**Org endpoints** (each permission-gated with `VerifyPermissionMiddleware`, so a
widget the user can't see returns 403 → FE renders "Permission Denied"):

- `GET /home/summary` — one `Promise.all` of `repo.count()` across org tables
  (users by status, groups, datasources, datasets, analyses[distinct lineage],
  dashboards, saved queries, RLS rules, alerts). Returns scalar KPIs **plus a
  prior-period count per metric** so the FE can render the ▲/▼ delta. Each
  metric tagged with its gating permission; caller-forbidden metrics omitted.
- `GET /home/trends/queries?from&to&bucket` — audit_log `action='EXECUTE'`
  bucketed per day/week. Gated `auditLogs`.
- `GET /home/trends/logins?from&to&bucket` — login_activity success/fail split.
  Gated `loginActivity`.
- `GET /home/activity?limit` — recent audit_log rows (actor, action, entity,
  createdOn) for the feed. Gated `auditLogs`.
- `GET /home/executions-by-module?from&to` — audit_log EXECUTE grouped by
  module, for the donut. Gated `auditLogs`.
- Active announcement uses the existing announcement fetch (already
  group+window+dismissal filtered).

**System-admin endpoints** (gated `systemUserManagement` / master context):

- `GET /home/system-admin/summary` — master aggregates: total orgs, active vs
  inactive (`organisation.status`), orgs-created delta, plus a **live cross-org
  rollup**: loop non-default orgs, `getOrgDbConnection` each (capped concurrency,
  per-org timeout, skip failures), sum users/datasets/queries. Returns per-org
  rows for the rollup table + platform totals. Documents load cost; **v2 = cache
  to a master `org_stats` table refreshed by cron**.
- `GET /home/system-admin/trends` — master `audit_log` + `login_activity`
  platform-wide, bucketed.
- `GET /home/system-admin/orgs-created?from&to` — `organisation.createdOn`
  bucketed.

All controllers: one function per file, `sendResponse`, `try/catch` + `Logger`,
close org connections, audit not required (reads).

### Frontend (`dbexec-ui`)

**New shared widgets** — `src/app/shared/components/dashboard/`, exported by
`DashboardWidgetsModule` (imports `SharedChartsModule`, `SharedModule`):

- `app-widget-card` — the card shell. `@Input() title, icon, permission,
  state ('loading'|'ready'|'empty'|'denied'|'error'), link`. Renders the correct
  body slot. **This one component enforces fixed-slot gating and the skeleton
  stage.** Body projected via `<ng-content>`.
- `app-stat-tile` — KPI tile. `@Input() label, value, format, delta,
  deltaDirection, sparkData, icon, tone`. Big tabular-nums number, ▲/▼
  `app-chip` delta, ECharts sparkline. Own skeleton.
- `app-trend-chart` — wraps `app-echart-visual`; `@Input() series, type, height`;
  reacts to the shared date range; **animated on data arrival** (ECharts
  `animationDuration`, staggered).
- `app-activity-item` — one feed row (actor avatar, verb, target, action tag,
  `RelativeTimePipe` time).
- `app-empty-state` (small, reusable) — icon + title + optional CTA.

**Rebuilt pages**:

- `OrgHomeComponent` — greeting + global date controls; announcement bar (top,
  conditional); KPI row (stat tiles, each gated); charts row (query activity +
  executions donut); activity feed + quick actions; each widget owns its fetch
  and skeleton, fired in parallel via `forkJoin`/independent subscribes so the
  fastest paints first.
- `SystemAdminHomeComponent` — platform KPIs; platform trend + orgs-created
  charts; org usage rollup table + login-health; skeleton while cross-org rollup
  streams.

**Loading model**: each widget starts in `loading` → shows skeleton (p-skeleton
/ shimmer via `--skeleton-bg`) → its own request resolves → `ready`/`empty`.
KPI row uses the single `/home/summary`; charts/feed use their own endpoints.
No global blocking overlay (matches app convention). Skeleton only if >~300ms.

**Theme**: consume `--primary-color`, `--card-background`, `--text-color`,
`--fs-*`, `--space-*`, `--radius-*`, `--success/warning/error/info-color`,
`--skeleton-bg`, chart palette `COLOR_PALETTES.default`. No hardcoded hex.

**i18n**: all strings as `DASHBOARD.*` keys in all 10 locale files (parity
enforced). `DASHBOARD.PERMISSION_DENIED`, `.EMPTY.*`, KPI labels, etc.

**Permission gating**: `app-widget-card [permission]` uses
`PermissionService.canRead(PERMISSIONS.*)` with the exact keys the sidebar uses
(`auditLogs`, `loginActivity`, `dashboard`, `datasetManager`, `userManagement`,
`analyses`, `rlsRules`, `alertManagement`, …). Forbidden → `denied` state.

## Insight content (what actually gets shown)

**Org**: Queries executed (30d, ▲/▼ vs prior 30d, sparkline) · Active users
(x/total, new this month) · Datasets · Dashboards · Query-activity trend
(queries + logins lines) · Executions-by-module donut · Recent activity feed ·
Quick actions (New Query/Dataset/Analysis/Dashboard/Invite/Query-Builder,
permission-aware).

**Admin**: Organisations (▲ new) · Active orgs (x/total, inactive chip) · Total
users (all orgs) · Platform queries · Platform activity (queries bar + logins
line) · Orgs-created-over-time bar · Org usage rollup table (users/datasets/
queries/activity bar per org) · Login health (success/fail stacked + success %).

## Out of scope (v1)

- User-customizable widget layout / persistence.
- Cached cross-org rollup table + cron job (v2 — flagged where the live loop is).
- Drill-through pages beyond linking to the existing module routes.
- Any new chart types (reuse ECharts via `app-echart-visual`).

## Verification

- BE: `npx tsc --noEmit` clean; hit each endpoint against the running dev API
  (:3000) with a real token; confirm counts match direct DB queries; confirm a
  forbidden permission returns 403.
- FE: `npx tsc --noEmit` + real `ng build --configuration production`; run the
  app (:4200), log in, confirm skeleton → data on both dashboards, charts
  animate, a de-permissioned widget shows "Permission Denied", announcement bar
  appears/omits correctly, date toggle re-filters trends.
- i18n parity sweep: every `DASHBOARD.*` key present in all 10 locales.
