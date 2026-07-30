# prompt
> Update the Progress log on every change.
> Code path: `src/app/modules/prompt` · Status: 🟢 · Last updated: 2026-07-30

## 1. Context
- Responsibility: DBExec **Studio** primitive — a reusable parameterised input control (a "prompt"). Each prompt has a control **type** (one of ~9: text, number, dropdown, multiselect, checkbox, radio, calendar, daterange, rangeslider), is bound to a datasource + tab + section, and supplies values either statically or from a SQL query. Prompts are the form fields that `query-builder` (and older Studio flows) arrange and run.
- Key files:
  - `components/{list,add,edit,view}-prompt` — the CRUD quartet. add-prompt captures name/type/datasource/tab/section.
  - `components/config-prompt` — the per-type configurator; delegates to one of the type-specific dialogs based on the selected control type. Uses `/config`, `/values`, `/appearance`, `/refresh-values`.
  - `components/*-config-dialog` — the 9 control-type editors: `text/number/dropdown/multiselect/checkbox/radio/calendar/daterange/rangeslider`.
  - `components/sql-query-dialog` — lets a dropdown/multiselect prompt draw its options from a SQL query (with an Execute preview) rather than a static list.
  - `services/prompt.service.ts` — signal-state HTTP (`PROMPT` endpoints); `store/` — NgRx slice for config-prompt state.
- Depends on: **datasource** (prompt is datasource-bound; SQL-value dialog runs against it), **tab** + **section** (a prompt lives under a section of a tab). `PROMPT` api/routes constants.
- Depended on by: **query-builder** (configure drags prompts into its layout; execute renders them into a form and binds their values into the query).
- How it works: List (`app-custom-table`). Add sets identity + type + datasource/tab/section. `configure(:id)` opens config-prompt → the matching type dialog edits the control's options/validation/appearance → persisted via `/config` (+ `/appearance`). Query-backed prompts fetch options via `/values` / `/refresh-values` (SQL against the datasource). At run time, query-builder renders the prompt and feeds the selected value into the query.
- Decisions: control type drives which config dialog + which value model is used (`type` is the discriminator — note a historical bug where the form control was `promptType` vs `type`, since corrected). Studio composition model shared with tab/section/query-builder. RBAC-gated CUD + Actions column hidden entirely when the user has no row actions (53c57624). See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: older Studio module — **excluded from the app-custom-table migration pass** for its config surfaces (per custom-table-standard; list uses custom-table, the config dialogs are bespoke). Query-backed prompt values run raw SQL through the datasource preview path, which **bypasses RLS** (RLS-P2-1 — the resolver isn't invoked on the prompt-value populator). Uses NgRx (`store/`) — one of the few FE modules that does (mirrors add-dataset). Conceptual overlap with the newer analyses-parameters system.

## 2. Goals
- Objective: Define reusable, typed, optionally query-driven input controls that Studio query-builders can compose into runnable forms.
- Current focus: — none active.
- Next up: — (candidate: converge with analyses-parameters; route query-backed values through the RLS resolver).
- Out of scope: chart/BI parameters (analyses), dataset `{{name}}` params (dataset).

## 3. Progress (newest first)
### 2026-07-30 — Query Builder v2: de-couple from Tab/Section
- Done: prompts are now datasource-scoped, not section-scoped. `add-prompt`
  rewritten as a flat single-prompt reactive form (datasource / name /
  description / type / optional groupName); `edit-prompt` drops the required
  `section` control (keeps name/description/datasource/groupName/status).
  `prompt.service` posts the flat body (no tab/section). The Section module was
  deleted; the config-prompt per-type dialogs are unchanged.
- Files touched: components/add-prompt, components/edit-prompt, services/prompt.service.

### 2026-07-24 — Current state captured
- Done: Full prompt CRUD + per-type configuration across all 9 control types (text/number/dropdown/multiselect/checkbox/radio/calendar/daterange/rangeslider), static + SQL-query-driven values (sql-query-dialog with Execute preview + refresh-values), appearance config, NgRx-backed config-prompt state. RBAC: hide Actions column when no row actions (53c57624) + gate every CUD button (bfe557d6). Skeleton-loading + cancellation (66fe8f41); relative timestamps (a1654900); form body max-height dropped (ef88920c).
- In progress / Known issues: older Studio module not on the shared custom-table/reference-data path for its config dialogs; query-backed values bypass RLS (RLS-P2-1); overlaps with analyses-parameters. No active work.
- Next: —
- Files touched: docs/context/modules/prompt.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/prompt`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/prompt.md
