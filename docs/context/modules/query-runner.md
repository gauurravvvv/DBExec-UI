# query-runner
> Update the Progress log on every change.
> Code path: `src/app/modules/query-runner` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The "SQL Workspace" — owner-private saved queries (home list + CRUD), private connection profiles CRUD, and a full-screen SQL executor (CodeMirror 6 editor + IntelliSense + server-side result grid + object explorer). This is the most complex FE module.
- Key files:
  - `executor/query-executor.component.ts` — the editor. CodeMirror 6 (SQL lang, minimap, find/replace, fold, lint gutter, autocomplete). `schema-catalog.ts` (lazy `${schema}.${table}` catalog cache + IntelliSense source), `completion.ts`, `split-statements.ts` (run selection / statement-at-cursor), `search-panel.ts`, `typed-cell.component.ts` (result cell rendering).
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
