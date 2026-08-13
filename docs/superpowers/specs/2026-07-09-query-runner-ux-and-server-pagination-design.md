# Query Runner UX + App-wide Server-side Pagination

## Context

Three cross-cutting problems, all confirmed against the code:

1. **Query Executor** (`/query-runner/exec?conn=…`, component
   `query-runner/executor/query-executor.component.*`):
   - Toolbar reads cluttered on load (~9 always-on icon buttons).
   - Result grid text/rows look "large" — AG Grid `themeQuartz` runs with no
     `rowHeight`/`headerHeight` override (~36px rows), font already 13px.
   - Sort/filter run **client-side in memory** over the fetched result (capped
     at `rowLimit`, default 200). User wants **server-side**.
2. **Query Runner launcher** (`/app/query-runner`, `query-runner/launcher/…`):
   uses **list-page chrome** (`dataset-page-wrapper` + `db-access-page` mixin)
   instead of the canonical **add/edit-form chrome**; no `<form>`, off spacing,
   floating "Manage Connections" in header.
3. **Pagination**: 7 lists already do true server-side paging via the shared
   `UsServerListAdapter` + `us-data-grid` + paged endpoints. Stragglers fetch
   ALL rows and paginate client-side.

Decisions locked with the user:

- Executor sort/filter → **server-side via SQL wrapping**, with safe fallback
  to client-side when wrapping isn't valid.
- Pagination scope → **every list in the app** (no fetch-all-then-paginate).
- Executor toolbar → **declutter + group, one row**; Palette/Shortcuts/Minimap
  into ⋮ overflow; plus compact result-grid density.

Branch: `version_261`. FE :4210 ↔ BE :3010. Never commit `environment*.ts`;
never push. Standard commit trailer.

## Reference facts (from exploration)

- Executor `execute` FE call:
  `execute(id, sql, write, executionId, { explain, analyze, maxRows })` →
  `POST /connections/:id/execute` body `{ sql, write, executionId, explain,
analyze, maxRows? }` (`query-runner.service.ts:241`).
- BE `execute.ts` → `executeScript(conn, sql, opts)` runs on a single pinned
  pg backend. `splitStatements(script)` yields statements; `isPlannable(sql)`
  classifies SELECT/WITH/VALUES/TABLE/INSERT/UPDATE/DELETE. Array row-mode
  preserves duplicate column names. `MAX_ROWS_CAP = 50_000`.
- Executor grid: `themeQuartz.withPart(colorSchemeLightWarm)`
  (`query-executor.ts:272`); `ModuleRegistry` has `ClientSideRowModelModule`
  (line 90); `defaultColDef { sortable:true, filter:true }` (281–282);
  `onQuickFilter` sets `quickFilterText` (client-side); results held in memory
  (`this.results` line 1127). us-data-grid AG font var `--ag-font-size: 13px`
  (`us-data-grid.component.scss:14`).
- Launcher: `launcher/launcher.component.{html,scss,ts}`. Uses
  `app-custom-dropdown` (correct control) inside `.launcher-card`/`.launcher-
step` under the list-page mixin. Canonical form chrome =
  `add-admin-wrapper`/`add-admin-container` + `db-access-form` mixin (see
  `add-db-role.component.html` + `_db-access-shared.scss` `@mixin
db-access-form` lines ~741–946).
- Pagination shared pattern: `UsServerListAdapter<T>({ load, unwrap,
sortFieldMap, filterBuilders, initial })` + `us-data-grid`. Reference
  implementations: `list-connections`, `list-user`, `list-dataset`,
  `list-datasource`, `list-audit-logs`, `list-organisation`,
  `list-login-activity`.
- Pagination inventory:
  - **Already correct (7):** connections, dataset, user, datasource,
    audit-logs, organisation, login-activity.
  - **FE-only, BE ready (2):** `list-db-roles` (`listRolesPaged` opt-in),
    `sessions` (`listSessions` opt-in).
  - **FE-only, BE ready, needs p-table→grid (1):** `list-query-builder`
    (`listQueryBuilder` fully paged).
  - **BE verify + FE migrate (2):** `list-prompt`, `list-section`.
  - **Verify (~11 endpoints):** roles, groups, tabs, dashboards, rls-rules,
    announcements, analyses, queries, system-admins, and any others.
  - **No change:** `table-visual` (embedded viz, local scroll).

## Design

### Slice A — Query Executor

**A1. Toolbar declutter (FE, presentation only).** One row, regrouped:
Run (primary) · Run-all · Stop │ Format (icon-only) · Wrap · Explain │
row-limit + Read-only/Write (calm inline) │ ⋮. Move **Command Palette,
Keyboard Shortcuts, Minimap** into the ⋮ overflow menu (alongside existing
download/goto/case/copy/clear). Keyboard shortcuts for palette/shortcuts stay
bound. No handler/behaviour changes; HTML regroup + SCSS only.

**A2. Result-grid density (FE).** Give the executor's AG Grid compact theme
params: `rowHeight: 30`, `headerHeight: 32`, and font tied to `--fs-control`
(13px). Applied via the grid theme/params on the executor grid; matches the
app's data density.

**A3. Server-side sort/filter/paging via SQL wrapping (BE + FE).**

- **BE** (`execute` controller + `executeScript` or a new `deriveQuery`
  helper): accept an optional body field `derived`:
  ```
  derived?: {
    orderBy?: { col: string; dir: 'asc' | 'desc' }[];
    filters?: { col: string; op: 'contains'|'equals'|'startsWith'|'endsWith'|'gt'|'lt'|...; value: any }[];
    offset?: number;
    limit?: number;
  }
  ```
  When `derived` is present AND `splitStatements(sql).length === 1` AND the one
  statement `isPlannable` as a SELECT/WITH (read query), run:
  ```
  SELECT * FROM ( <original sql> ) AS _q
    [WHERE <filters>]  [ORDER BY <orderBy>]  LIMIT <limit> OFFSET <offset>
  ```
  and a sibling count: `SELECT count(*) FROM ( <original sql> ) AS _q [WHERE …]`.
  Identifiers double-quoted; filter **values parameterized** ($1,$2,…) — never
  string-concatenated. Return `{ results, derived: { total, derivable: true } }`.
  If NOT a single safe SELECT (multi-statement, DDL, non-plannable), ignore
  `derived`, run exactly as today, and return `derived: { derivable: false }`.
  Read-only transaction semantics unchanged; `maxRows` + statement timeout
  still apply.
- **FE**: after a normal Run, read `derivable`. If true, switch the grid to AG
  Grid **serverSide** row model whose datasource calls `execute(..., derived)`
  with the grid's current sort model, filter model, and the requested block
  (offset/limit) — mapping grid column ids to the wrapped subquery's column
  names (identity map: the outer query selects the subquery's own columns).
  Show total from `derived.total`. If false, keep the current in-memory
  client-side grid. A small banner states the active mode.
- **Fallback/edge**: if the wrapped query errors (e.g. ambiguous/duplicate
  outer column names, ORDER BY on a non-output name), surface the DB error and
  fall back to client-side for that result. The user's original SQL is never
  mutated.

### Slice B — Launcher form (FE, presentation only)

Convert `launcher.component.{html,scss}` from list chrome to the canonical
add/edit-form chrome:

- `.dataset-page-wrapper`/`.dataset-content-container` + `db-access-page` →
  `.add-admin-wrapper`/`.add-admin-container` + `@include db.db-access-form`.
- Wrap the selectors in `<form class="admin-form">` → `.left-section` →
  `.form-grid` (50% width, `--space-8` gap, responsive to 100%). Drop
  `.launcher-step`.
- Keep `app-custom-dropdown` for Datasource + Connection; consistent `[label]`
  - static `[placeholder]` + `icon` (`pi-database` / `pi-link`).
- Header: canonical `.page-header` with back affordance + `.action-buttons`
  (Manage Connections as secondary). **Open Executor** becomes a right-aligned
  form action (canonical primary), not floating.
- Empty-state (no connections) kept, restyled as a form-hint prompt.
- `launcher.component.ts` logic unchanged.

### Slice C — Server-side pagination everywhere (BE verify + FE), in waves

Bring every list to `UsServerListAdapter` + `us-data-grid` + a paged endpoint.
Copy the reference implementations' adapter shape (load → unwrap {rows,total},
`sortFieldMap`, `filterBuilders`, `initial {page,limit}`).

- **Wave 1 (FE-only):** `list-db-roles`, `sessions` → server adapter.
- **Wave 2 (FE-only):** `list-query-builder` → p-table→us-data-grid + adapter.
- **Wave 3 (BE+FE):** `list-prompt`, `list-section` → verify/add BE paging,
  migrate to us-data-grid + adapter.
- **Wave 4 (audit + fix):** remaining endpoints — for each, confirm BE returns
  page+total and FE calls lazily; fix any fetch-all. Produce a final matrix.

## Files (indicative)

- Slice A: `query-runner/executor/query-executor.component.{ts,html,scss}`;
  BE `modules/query-runner/controllers/execute.ts` +
  `services/executeScript.ts` (+ maybe new `services/deriveQuery.ts`);
  `modules/query-runner/middleware/execute.validation.ts` (allow `derived`).
- Slice B: `query-runner/launcher/launcher.component.{html,scss}`.
- Slice C: per-list components + services under `modules/*`; BE list
  controllers under `dbexec-api/src/modules/*` where paging is missing;
  i18n only if new strings appear.

## Verification

- `npx tsc --noEmit` clean both repos; `ng build --configuration production`
  green; BE `npx tsc --noEmit` green.
- Live on :4210 (BE :3010) — NOTE: single-session auth; coordinate so live
  testing doesn't fight the user's own session.
  - Executor: toolbar shows Run + a few grouped icons + ⋮ (Palette/Shortcuts/
    Minimap inside ⋮); result rows compact (~30px), text control-sized;
    running `select * from <table>` then sorting/filtering/paging re-runs on
    the server (verify via network calls carrying `derived`), total reflects
    the whole result; a non-SELECT or multi-statement script falls back to
    in-memory with the banner.
  - Launcher: form chrome matches add/edit screens (card, header, 50% form,
    labeled dropdowns, right-aligned Open); Manage Connections in header.
  - Pagination: each fixed list sends page/limit/sort/filter and the BE
    returns only that page + a correct total; sorting/filtering hit the server
    (network shows the params); no list fetches the full set.
- Commit per slice/wave on `version_261`, not pushed, standard trailer,
  excluding `environment*.ts`.

## Constraints (standing)

- FE :4210 ↔ BE :3010; never commit `environment.ts` / `environment.dev.ts`.
- Never push; user pushes. Don't touch sidebar styling. App tokens only; reuse
  shared controls/adapter; no new dependency.
