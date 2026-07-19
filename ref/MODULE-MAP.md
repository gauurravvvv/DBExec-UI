# DBExec-UI — Module Map

> Every feature module under `src/app/modules/`, its landing route, and what
> it does. Routes come from `src/app/core/constants/routes.constant.ts`; API
> paths from `src/app/core/constants/api.constant.ts`. Screen quartet is
> `list-` / `add-` / `edit-` / `view-` unless noted.

## Route shape

Per-org features use a helper `feature(base)` producing:
`LIST = base`, `NEW = base/new`, `view(id) = base/<id>`,
`edit(id) = base/<id>/edit`. There is **no `:orgId` in any URL** — the BE
derives org identity from the JWT. Use the exported builders, never
string-built paths.

App shell routes live under `/app/...`; the Query Executor is the one
**standalone** route outside the shell (`/query-runner/exec`), opened in a
new browser tab.

---

## Studio pillar

### `query-runner` — Query Executor + connections + saved queries
- **Home:** `/app/query-runner` → the **saved-queries list** (the executor's
  new home; the old datasource→connection launcher is retired but kept for
  callers as `QUERY_RUNNER.LAUNCHER`).
- **Saved queries:** owner-private CRUD. `savedQueryNew()`,
  `savedQueryView(id)`, `savedQueryEdit(id)`. "New Query" opens a
  datasource→connection popup (`new-query-dialog`) that opens the executor.
- **Connections:** owner-private connection profiles CRUD at
  `/app/query-runner/connections` (`connectionNew()`, `connectionEdit(id)`).
- **Executor:** `/query-runner/exec?conn=<id>&query=<savedId>` — standalone
  tab. CodeMirror 6 editor, IntelliSense (`SchemaCatalog`), object explorer,
  server-side result grid (single-SELECT = `derivable`), EXPLAIN, cancel.
- API group `QUERY_RUNNER` (connections, catalog/tables/columns, objects,
  execute, cancel, saved-queries).

### `db-access` — DB Access Management (live Postgres roles/privileges)
- **Users & Roles:** one screen at `/app/db-roles` (a PG user and role are the
  same object; they differ by `canLogin`). `roleNew()`, `roleView(name)`,
  `roleEdit(name)`.
- **Privileges & Access:** composer + effective-privileges panel at
  `/app/db-privileges` (`privilegeView(id)`).
- Selected datasource carried via `?ds=<id>` query param
  (`DbAccessContextService` + shared datasource-picker), never in the path.
- Stateless: reads/writes live Postgres roles/grants; no DBExec-side mapping
  tables. Also hosts the Active Sessions viewer (cancel query / terminate
  connection) and access-profile export (JSON/CSV).

### `datasource` — connection sources
- `/app/datasources`, standard quartet. A datasource is the connection target
  that datasets, connections, and db-access all reference. Has schema/table/
  column introspection endpoints and a validate (test-connection) call.

## Data Management pillar

### `dataset` — saved SQL with typed fields
- `/app/datasets`, quartet + rich detail. A dataset is a saved SQL query
  against a datasource with: typed **DatasetField**s, **calculated fields**
  (two engines — see below), **parameters** (`:name` binding), run/preview,
  duplicate, lineage, distinct-values, result caching.
- **Two calculated-field engines** (don't confuse): SQL `[bracket]` expression
  compiler vs JS `{brace}` FormulaCompiler (137 functions, e.g.
  `concat({a},{b})`). Add/edit via `add-custom-field-dialog`.

### `query-builder` — visual query construction
- `/app/query-builders`, quartet + `configure(dbId,id)` + `run(dbId,id)`.
  Builds queries without hand-writing SQL; can produce a dataset
  (`/datasets/from-builder`).

### `prompt` — parameterised prompt configs
- `/app/prompts`, quartet + `configure(id)`.

## BI pillar

### `analyses` — aggregation / pivot / analytics
- `/app/analyses` — **no `/new`** (an analysis is created from a dataset).
  `view(id)`, `edit(id)`. Authoring surface: tabs, aggregation, analytics,
  filters, parameters, widgets. Backed by BE modules `analysis-tabs`,
  `analysis-filters`, `analysis-parameters`, `analysis-widgets`.

### `dashboard` — published boards (view-only in FE routing)
- `/app/dashboards`, `view(id)` only (dashboards are consumed, authored
  elsewhere). Widgets, cross-filter, scoped filters, parameters + preload
  gate, auto-refresh, snapshots, public/embed share links, subscriptions /
  scheduled delivery, conditional formatting, reference lines, PDF/PNG/CSV
  export.

### `embed` — public/embedded dashboard renderer
- Token-guarded read-only dashboard render for share links (outside normal
  auth).

### `tab` / `section` — dashboard/analysis layout primitives
- `/app/tabs`, `/app/sections` — quartets. Structural building blocks.

### `visuals` (BE) / chart rendering (FE)
- Chart configs rendered via `echart-visual` / `configurable-card-chart`
  (ECharts). The FE `visuals` surface is embedded in analyses/dashboards.

## Monitoring & security

### `alerts` — rule-based monitoring
- `/app/alerts`, quartet. Multi-step/multi-tab add form (like Add
  Organisation). Conditions (threshold, change-by-%, AND/OR), email delivery
  (editable Gmail-style recipient chips), alert history/events.

### `rls-rules` — row-level security
- `/app/rls-rules`, quartet. Row filters + column masking assignments;
  enforced BE-side on query + dashboard (incl. aggregated + public paths).

## Org & platform administration

### `users` — org users
- `/app/users`, quartet + `BULK_ADD` (CSV validate→commit). Unlock, password
  update. Setup-token onboarding (no inline passwords).

### `groups` — user groups
- `/app/groups`, quartet.

### `role` — app roles (permission-tree editor)
- `/app/roles`, quartet with a permission-tree editor. These are DBExec app
  roles (permission bundles), distinct from `db-access` Postgres roles.

### `organisation` — orgs (System Admin browse)
- `/app/organisations`. System-Admin-only; create/manage orgs on the master
  DB. `view(id)`, `edit(id)`.

### `system-admin` — platform operators
- `/app/admins`. System-Admin-only master-DB users.

### `audit-logs` / `login-activity`
- `/app/...` list + export (audit trail; login history). Org-scoped for org
  admins, all-org for system admin on the master audit surface.

### `app-settings` (announcements) / `profile` / `home` / `auth`
- `app-settings`: `/app/settings/announcements` quartet + theme/branding.
- `profile`: current-user profile + password.
- `home`: landing dashboard (role-aware).
- `auth`: login, forgot/reset/set-password, OTP, setup-token verify/resend.

---

## Legacy / not wired

`ENVIRONMENT`, `CATEGORY`, `CREDENTIAL` route constants exist but were never
wired to a real module — ignore unless reviving intentionally.
