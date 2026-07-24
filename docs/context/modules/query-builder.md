# query-builder
> Update the Progress log on every change.
> Code path: `src/app/modules/query-builder` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: DBExec **Studio** feature — build a parameterised query WITHOUT hand-writing SQL: define the base query, then compose a form layout of **tabs → sections → prompts** over it, then let end-users run it by filling that form. Can produce a dataset (`/datasets/from-builder`).
- Key files:
  - `components/{list,add,edit,view}-query-builder` — the CRUD quartet (name/description/datasource + base query).
  - `components/configure-query-builder` — the **layout designer**: drag-drop prompts into tabs/sections (`helpers/drag-drop.helper.ts`, `group.helper.ts`, `style.helper.ts`; models in `models/`). Pulls in `TabService` (and section/prompt structures) to assemble the runnable form.
  - `components/execute-query-builder` — the **runtime**: renders the configured prompts into a reactive form (`helpers/prompt-renderer.helper.ts`, `form.helper.ts`, `createPromptFormControl`), binds values, runs, and shows results via the dataset `QueryService`/`QueryResult`.
  - `services/query-builder.service.ts` — signal-state HTTP; `QUERY_BUILDER` endpoints incl. `/tabs`, `/config`, `/structure`, `/execute`.
- Depends on: **datasource** (base query target), **tab** + **section** + **prompt** (the composed form pieces), **dataset** (`QueryService`/`QueryResult` for execution + can emit a dataset). `QUERY_BUILDER` api/routes constants.
- Depended on by: dataset (from-builder creation path); Studio sidebar group.
- How it works: List (`app-custom-table`). Add/edit sets up the query-builder entity. `configure(:dbId,:id)` designs the prompt layout (drag prompts into tabs/sections, persisted via `/config`). `run(:dbId,:queryBuilderId)` (`execute-query-builder`) loads the `/structure` (tabs/sections/prompts), renders a form, and POSTs the filled values to `/query-builders/:id/execute` → results grid. `loadStructure`/`loadTabs` hydrate the designer + runtime.
- Decisions: Studio composition model (tab/section/prompt are separate reusable entities the builder arranges) — this is the "no-SQL query" primitive that predates the newer dataset/analyses BI pillar. RBAC-gated CUD buttons via `*hasPermission`. See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: This is one of the OLDER Studio modules and was **excluded from the app-custom-table migration pass** for its result/config grids (per custom-table-standard: tab/section/prompt/query-builder excluded that pass) — the list uses custom-table but the configure/execute surfaces are bespoke. Reference-data DB-driven dropdowns did NOT specifically convert this module. Skeleton-loading + relative-timestamps rollout applied. `bulkDelete` exists in the service but bulk-select is removed app-wide.

## 2. Goals
- Objective: Author a reusable, form-driven parameterised query and let non-SQL users run it; optionally graduate it into a dataset.
- Current focus: — none active.
- Next up: — (candidate: align configure/execute surfaces with the newer shared UI kit; overlaps conceptually with prompt + the analyses parameters system).
- Out of scope: hand-written SQL (dataset/query-runner), chart authoring (analyses).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full builder pipeline works — CRUD + `configure` drag-drop layout designer (tabs/sections/prompts) + `execute` runtime (renders prompts to a form, runs, shows results) + can produce a dataset from a builder. RBAC-gated every CUD button (bfe557d6); skeleton-loading + cancellation rollout (66fe8f41); relative timestamps (a1654900); dropped fixed max-height on add/edit form bodies (ef88920c); missing reactive validators wired (60a8fe81).
- In progress / Known issues: an older Studio module — configure/execute grids not on the shared app-custom-table/reference-data path; conceptual overlap with prompt + analyses-parameters. No active work.
- Next: —
- Files touched: docs/context/modules/query-builder.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/query-builder`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/query-builder.md
