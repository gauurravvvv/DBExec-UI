# query-runner
> Update the Progress log on every change.
> Code path: `src/app/modules/query-runner` · Status: 🟢 · Last updated: 2026-08-21

## 1. Context
- Responsibility: The "SQL Workspace" — owner-private saved queries (home list + CRUD), private connection profiles CRUD, and a full-screen SQL executor (**Monaco** editor + shared SQL IntelliSense + server-side result grid + object explorer). This is the most complex FE module.
- Key files:
  - `executor/query-executor.component.ts` — the editor, mounted through **`shared/editor/CodeEditorService`** (`flavour: 'sql'`). Monaco supplies line numbers, folding, bracket matching, minimap, find/replace and history; `shared/editor/` supplies the placeholder, the run-flash and offset-based document access (`editor-doc.ts`). `schema-catalog.ts` is the lazy `${schema}.${table}` catalog, bridged into the shared IntelliSense by `shared/editor/schema-bridge.ts`. `split-statements.ts` (run selection / statement-at-cursor) is unchanged and pure.
  - **Gone with the Monaco migration:** `completion.ts` (superseded by `MonacoIntelliSenseService`) and `search-panel.ts` (superseded by Monaco's find widget, restyled).
  - `executor/object-detail.component.ts` — read-only object inspection (table/view/matview/function/sequence/trigger DDL + columns).
  - `services/query-runner.service.ts` — connection CRUD + catalog/execute/cancel. `services/saved-queries.service.ts` — owner-private saved-query CRUD.
  - `saved-queries/` — `list-saved-queries` (the module home), `new-query-dialog` (datasource→connection popup), add/edit/view saved-query forms.
  - `connections/` — list + add/edit connection profiles. `launcher/` — retired as landing; its ds→conn logic moved into New-Query popup.
- Depends on: **datasource** (a QueryConnection binds to a datasourceId; catalog/execute run against that DB as the connection's login). `QUERY_RUNNER` api/routes constants.
- Depended on by: **ai-workspace** / **saved-queries** deep-links (`/query-runner/exec?conn=<id>&query=<savedId>`); sidebar "SQL Workspace" entry.
- How it works: Module root (in-shell) lands on `ListSavedQueriesComponent`. "New Query" popup picks datasource→connection then `window.open`s the standalone executor `/query-runner/exec?conn=<id>` (executor is a lazy module mounted OUTSIDE the app shell). Executor reads `?conn=` (connection) + optional `?query=` (preload saved SQL + rowLimit). Editor autosaves a per-connection draft; a `?query=`-opened tab uses the saved SQL, never the draft. Execute POSTs to `/connections/:id/execute`; single-SELECT results are `derivable` so sort/filter/page re-query the DB instead of paging a truncated in-memory set. Object explorer reads `/objects`, `/object/table|view|function|sequence|trigger` etc.
- Decisions: **Two permissions** — saved-query screens gate on `queryRunner`, connection screens on `connectionManager` (roleGuard per route; a user with only one still reaches what they can use). Saved queries are **owner-PRIVATE** (ownerId-scoped, mirror connections). Passwords are write-only on connection create/edit, never returned. The saved-queries LIST is the executor home (launcher landing retired). See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: **AG Grid survives ONLY here** (the executor result grid) — every other list uses `app-custom-table`. Sidebar entry renamed "SQL Workspace". New-Query popup once dead-ended when an org had zero connections (both dropdowns were behind `!hasNoConnections`); fixed 5ef53dfa — datasource dropdown always renders + empty state offers New/Manage connection. Execute path (BE `executeQuery.ts`) runs raw user SQL and **bypasses RLS** (RLS-P2-1 known defect). The BE saved-query table is backfilled on-demand via `ensureSavedQueryTable` (schema-qualified DDL — the TypeORM unqualified-DDL footgun).

## 2. Goals
- Objective: A power-user SQL IDE: write/run/save SQL against any connection, inspect DB objects, with fast IntelliSense and server-side result paging.
- Current focus: — none active.
- Next up: —
- Out of scope: visual query building (query-builder), semantic datasets (dataset).

## 3. Progress (newest first)
### 2026-08-21 — Result grid follows dark themes (was hard-coded light)
- The AG Grid result grid was pinned to `themeQuartz.withPart(colorSchemeLightWarm)`
  with static params → bright white on a dark theme (the per-user picker lets users pick
  dark presets). Now `gridTheme` is a `computed()` reading `ThemeService.isDark`:
  `colorSchemeDarkBlue` vs `colorSchemeLightWarm` base + every colour param
  (`backgroundColor`/`foregroundColor`/`borderColor`/`headerBackgroundColor`/
  `headerTextColor`/`accentColor`/`oddRowBackgroundColor`) read from the matching CSS
  variable (`--card-background`, `--text-color`, …); a param is omitted (scheme default
  shows) if a var is empty — no literal hex. Template binds `[theme]="gridTheme()"`.
  Companion Monaco editor fix (dark-aware base + syntax rules) is in `shared/editor/`.
- Verified live (dark theme, TestingOrg): grid renders dark-correct. tsc/ngc/build 0.

### 2026-08-06 — Datasource dropdown filter on the two list screens
- Added an `app-custom-dropdown` (server-mode datasource picker, `optionLabel=name`/`optionValue=id`, `showClear`, `appendTo="body"`) above the table toolbar on both **Connections** and **Saved Queries** lists, in a new `.list-filter-bar` row inside `.content-card`. The fetcher mirrors New-Query popup's `loadDatasourcesPage` (`datasourceService.listDatasource`).
- Data path differs per list, matching each BE list contract: **Connections** passes the chosen id as the TOP-LEVEL first arg of `listConnections(selectedDatasourceId ?? undefined, {…})` (a `datasourceId` query param). **Saved Queries** folds it INTO the JSON `filter` as `filter.datasourceId` via a `withDatasourceFilter()` helper that parse-merges whatever the table already built (global search + column filters) so all survive together.
- Selection persists in the URL (`?datasourceId=`) via `router.navigate([], { queryParams, queryParamsHandling: 'merge' })`; `ngOnInit` reads it from `route.snapshot.queryParamMap` and pre-selects before the first `adapter.reload()`. Clearing → param becomes null and the list shows all. FE-only — no service or BE change.
- New i18n key `COMMON.ALL_DATASOURCES` (dropdown placeholder) added to all 10 locales. Label reuses existing `COMMON.DATASOURCE`.
- Verified: `tsc --noEmit` exit 0, `ngc -p tsconfig.app.json --noEmit` exit 0. (Prod build left to the caller.)
- Files: `connections/list-connections/list-connections.component.{ts,html,scss}`, `saved-queries/list-saved-queries/list-saved-queries.component.{ts,html,scss}`, `src/assets/i18n/*.json`.
### 2026-07-29 — Explorer parity, search, and the object-detail dialog
- The object browser now matches the Dataset Creator's schema tree: tables render directly under the schema (no `TABLES` wrapper), same panel title, search box, "N tables" count, amber folders, primary-key colour and data-type label. See `modules/dataset.md` for the full entry — the work spans both modules.
- Added a schema/table/**column** search. Columns load lazily here, so it reaches loaded columns; the placeholder says "tables and columns" rather than promising more.
- Column data types moved from an inline label to a `pTooltip`, because hiding the label with `opacity: 0` still reserved its width and truncated names to `organisat...`.
- **Object-detail dialog** — tab strip measured 22px against a 28px scrollHeight (compressed by the flexing body, labels clipped); height tracked the row count so the tabs moved per object; the Comment column wrapped one character per line and body scrollHeight was 3374px. Now `flex-shrink: 0` + `overflow-y: hidden`, a fixed height, and fixed table layout — scrollHeight down to 1030px. Header adopts the shared dialog-header mixin.
- Monaco's suggestion details pane no longer persists its expanded state across suggestions.
- Verified: `query-executor` 7/7, `editor-parity` 1/1, `editor-showcase` 3/3, plus tsc/ngc/prod build.
- Files: `executor/query-executor.component.{ts,html,scss}`, `executor/object-detail.component.{html,scss}`
### 2026-07-28 — Query Executor moved from CodeMirror 6 to Monaco
- The editor now mounts through the shared `CodeEditorService`, so this screen uses the same editor, theme, options and IntelliSense as the Dataset Creator and Field Creator. See `docs/context/modules/dataset.md` for the full entry — the work spans both modules.
- Feature parity was checked item by item against the CodeMirror extension list. Line numbers, active-line highlight, folding, bracket matching/closing, indent-on-input, selection-match highlight, history, multi-cursor, find/replace and the SQL grammar are all Monaco options or built-ins. Three things had no equivalent and were rebuilt in `shared/editor/`: the placeholder, the flash marking which statement ran (now whole-line), and offset-based document access — `splitStatements` works in character offsets because it mirrors the backend splitter, so offsets are the natural currency and Monaco's line/column model is the awkward one.
- Diagnostics and formatting now come from `SqlValidatorService` and `SqlFormatterService`, the same services the Dataset Creator uses, so an error marker looks identical on both screens and the same SQL formats the same way. The validator keeps its own marker key, separate from the run-failure markers the component sets, so neither clears the other.
- Shortcuts use `onKeyDown` with explicit matching, not `addCommand`/`addAction`: measured in the browser, neither of those binds in this app (not with CtrlCmd, WinCtrl or Alt) while Monaco's own built-ins respond to the same synthetic keystrokes. Root cause not established, which is why the implementation does not depend on it.
- Chrome: `.qx-browser-head` now uses the shared panel-header mixin (it had a bespoke uppercase, letter-spaced treatment), tree rows share the hover/selection language, and toolbar buttons share the reference geometry.
- Verified: `e2e/query-executor.e2e.ts` 7/7 — mount and placeholder, both run shortcuts, schemas after FROM, dot completion on a never-fetched table, wrap/minimap toggles, validator markers, formatting, find widget. Note a query-runner connection had to be created in AIOrg (there were none) for these to run: `e2e-local-pg`.
- Files: `executor/query-executor.component.{ts,scss}`, `executor/schema-catalog.ts`; deleted `executor/completion.ts`, `executor/search-panel.ts`
### 2026-07-24 — Current state captured
- Done: Full executor (CodeMirror 6 + minimap + lint + IntelliSense from lazy SchemaCatalog + derivable server-side grid + object explorer with per-type DDL). Connection profiles CRUD (owner-private, test/enable/set-default). **Saved Queries** shipped + PUSHED to version_261 (FE feat ea9c8a8a → review 9f2081ee → popup fix 5ef53dfa; BE a29465c): owner-private CRUD, saved-queries list is the new home, New-Query popup, executor preloads saved SQL+rowLimit + "Save query"/"Save as new". Saved-queries list reworked (columns + delete justification, 1eeba122). Save-Query prompt uses canonical confirmation-popup (8bc27439). Sidebar exact-match highlight + "SQL Workspace" rename (003846c2). app-wide `autocomplete=off` (custom-input emits `new-password` for password fields — browsers ignore `off` there).
- In progress / Known issues: RLS bypass on the execute endpoint (platform-level RLS-P2-1). No module-specific in-flight work.
- Next: —
- Files touched: docs/context/modules/query-runner.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/query-runner`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/query-runner.md
