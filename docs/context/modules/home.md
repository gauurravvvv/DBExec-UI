# home
> Update the Progress log on every change.
> Code path: `src/app/modules/home` · Status: 🟢 · Last updated: 2026-08-17

## 1. Context
- **Responsibility:** The `/app/home` landing surface inside the shell. A tiny router-plus-two-dashboards module: an `empty-root` redirector picks the right home by permission, then renders either the **org-user** home or the **platform System-Admin** home.
- **Key files:**
  - `components/empty-root/empty-root.component.ts` — mounted at `/app/home`; on init checks login then `permissionService.canRead(SYSTEM_ADMIN)` → redirects to `/app/home/system-admin` else `/app/home/org`. Pure redirect, no UI.
  - `components/org-home/org-home.component.ts` — org user dashboard; `isAdmin` (`canDelete(USER_MANAGEMENT)`) surfaces extra admin cards.
  - `components/system-admin-home/system-admin-home.component.ts` — System-Admin dashboard: org selector + per-org stat cards (users/admins/datasources/environments counts) via `HomeService`.
  - `services/home.service.ts` — signals (`dashboard/loading`); `loadSystemAdminDashboard()` GET `HOME.SYSTEM_ADMIN`, with a cancel Subject for navigation-abort.
  - `home-routing.module.ts` — `''`→empty-root, `system-admin` (roleGuard + `SYSTEM_ADMIN`), `org` (no extra guard — `home` is the global mandatory permission every authed user holds).
- **Depends on:** `permission.service`, `login.service`, `HomeService`, `HOME` api/route constants. **Depended on by:** the relay screen (auth) navigates here post-login by permission; the shell sidebar links here.
- **How it works:** Home variant is chosen by **permission, not role string** — a user can belong to multiple groups carrying multiple roles, so a single "primary role" is unsafe; permissions aggregate via the BE `resolveUserPermissions` UNION. The org home reads its extra-card gate from a permission level, not a role name.
- **Decisions:** Permission-driven home routing (empty-root + auth relay both use `canRead(SYSTEM_ADMIN)`) — commit a512ff0d dropped FE role-string checks; 3a79eb2b dropped the single-role assumption. See ../ARCHITECTURE.md for the auth/permission model.
- **Gotchas:** The System-Admin home's per-org data still has a legacy `getSystemAdminDashboard()` observable path + some placeholder/"simulate" scaffolding in `loadOrganizationData` — the dashboard is functional but light, not a rich analytics home. `home` permission MUST be granted to every user or they'd have no landing page.

## 2. Goals
- **Objective:** Land every user on a correct, permission-appropriate home without any role-string logic.
- **Current focus:** — none active.
- **Next up:** — (richer org/system dashboards are a possible future, not scheduled).
- **Out of scope:** Actual BI dashboards (that's the `dashboard` module); asset lists (their own modules).

## 3. Progress (newest first)
### 2026-08-17 — Landing dashboards rebuilt (live data)
- Done: Rebuilt both homes from static/placeholder into live, permission-aware
  analytics dashboards (branch `feature/landing-dashboard`).
  - **OrgHome**: greeting + global date controls (7/30/90 toggle +
    `app-custom-daterange`); KPI row (queries/active-users/datasets/dashboards)
    via `GET /home/summary`; charts (query-activity line, executions-by-module
    donut, logins stacked bar) via `/home/trends/*` + `/home/executions-by-module`;
    recent-activity feed via `/home/activity`; permission-aware quick actions.
  - **SystemAdminHome**: rebuilt to `/home/system-admin/{summary,trends,orgs-created}`
    — platform KPIs, platform activity + orgs-created charts, cross-org usage
    rollup table, org-status donut. **Removed the `Math.random()` fake metric.**
  - New shared kit `src/app/shared/components/dashboard/` (DashboardWidgetsModule):
    `app-widget-card` (loading/ready/empty/**denied**/error states — the denied
    state is a FIXED slot so gating never reflows the grid), `app-stat-tile`
    (number + delta chip + animated ECharts sparkline), `app-trend-chart`
    (animated line/bar/donut off theme tokens), `app-activity-item`,
    `app-empty-state`. Re-exports the standalone `app-chip` (SharedModule imports
    but doesn't export it).
  - Per-widget parallel fetch (each widget owns its state + skeleton; fastest
    paints first). Reads use `{ skipLoader: true }` — no global overlay.
  - i18n: new top-level `HOME_DASH.*` namespace (NOT merged into the existing
    `DASHBOARD` block, which belongs to the dashboards module), 78 keys × 10 locales.
  - Announcement "at the very top" is already served app-wide by the shell
    `announcement-banner` (conditional) — the dashboards add no announcement block.
- Gates: `tsc --noEmit` ✓ · `ngc -p tsconfig.app.json --noEmit` ✓ ·
  `ng build --configuration production` ✓. BE booted on :3000; all 8 new routes
  return 401 unauth (registered + gated). Authenticated browser render deferred
  (user testing locally).
- Gotchas fixed during build: AOT flagged 4 `load*` handlers as private
  (template `(retry)` calls) → made public; `app-chip` NG8001 → re-exported via
  DashboardWidgetsModule.
- Files: home module (org-home, system-admin-home, home.service, models/,
  home.module), shared/components/dashboard/*, api.constant HOME.*, 10 i18n files.

### 2026-07-24 — Current state captured
- Done: empty-root permission-based redirect + org-home (admin-gated cards) + system-admin-home (org-scoped stat cards). RBAC cleanup — permission-driven routing (a512ff0d), multi-role assumption dropped (3a79eb2b). Skeleton-loading + read cancellation (66fe8f41). Org-dropdown plumbing removed app-wide (7fa4a2b5).
- In progress / Known issues: System-Admin home per-org data is light (legacy observable path + placeholder scaffolding). UI commits local-only on `version_261`.
- Next: —
- Files touched: docs/context/modules/home.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/home`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/home.md
