# Prompt config rework + QB polish + datasource dropdowns

Date: 2026-08-05 · Repo: DBExec-UI (+ minor DBExec-API if needed)

## Mental model (locked with the user)

- **A Prompt = one filter.** It reaches a column (possibly on a related table
  via joins), and produces a value / value-set the end user picks, backed by
  admin-defined SQL: which column, which table, the joins to reach it, the
  value source, the operator, and the appearance.
- **Query Builder = a group of prompts.** QB owns the AND/OR composition of
  many prompts into the full query. Prompt does NOT get its own condition tree.
- So Prompt config's job: **base table → structured joins to reach any column →
  target column + simple predicate → value source → operator → appearance.**
  The complex AND/OR lives in QB.

## Problems being fixed

1. **Schema-select fires no API; tables/columns empty.** ROOT CAUSE: the BE
   `GET /datasources/:id/schemas` was rebuilt to be lazy and returns
   `[{schema_name, tables: []}]` (names only). `config-prompt` still uses the
   old all-at-once `listDatasourceSchemas` and reads `staticSchemaData[].tables[].columns`
   — always empty now. It must call `listSchemaTables` on schema-select and
   `listTableColumns` on table-select (both already in the FE service).
2. **Too much control noise.** The page stacks schema/table/column multiselects
   + inline WHERE autocomplete + inline JOIN autocomplete + chips + SQL dialog +
   appearance form at once (~1575-line component). Collapse to summary cards +
   focused "Configure" dialogs.
3. **No real joins / complex reach.** Joins = one free-text `promptJoin` string.
   Replace with a structured, point-and-click JOIN builder: FK-suggested +
   manual, multi-hop, to reach any column in the schema.
4. **Highly configurable** = the sum of the above with a clean structured model.

Plus: **QB UI/styling polish** (visual pass + condition-tree readability + join
designer / output columns + SQL preview / run-results), and a **datasource
dropdown** on Connections + Saved Queries that filters the list.

## Design

### A. Fix schema→table→column to fully lazy (issue #1)
- Introduce a small `PromptSchemaService` (or reuse the dataset schema-tree
  service pattern) that wraps: `listSchema` (names) → `listSchemaTables(ds, schema)`
  → `listTableColumns(ds, schema, table)` → `listForeignKeys(ds, {schema, table})`,
  with per-key caching (keyed `${schema}` / `${schema}.${table}`) and
  `{skipLoader:true}` (button-level busy, per the loading standard).
- config-prompt: on schema-select → fetch tables (spinner on the table control);
  on table-select → fetch that table's columns. No more reading nested empties.
- Backfill for an existing saved config: resolve the saved schema/tables, then
  lazily fetch their columns so the saved selection renders.

### B. Restructure config-prompt into summary cards + dialogs (issue #2)
Replace the one-big-form with a parent card containing **collapsed summary
cards**, each with a "Configure" button opening a focused dialog:
1. **Source & Joins** — base table + the structured join list (reach a column).
2. **Column & Filter** — the target column reached + operator + predicate shape.
3. **Values** — the value source (reuse the existing `prompt-value-source`
   component + SQL dialog).
4. **Appearance** — reuse the existing `prompt-appearance-form`.
Each card shows a one-line human summary when configured; the heavy controls
live in the dialog, not on the page. Slim the ~1575-line component by moving each
concern into its own `config-*` sub-component (source-joins, column-filter),
reusing value-source + appearance as-is.

### C. Structured JOIN builder (issue #3) — reuse QB's engine as shared
- The QB `qb-join-designer` already models structured joins. **Extract the join
  model + a builder component into a SHARED place** so both QB and Prompt use
  one engine (no drift). The prompt join builder:
  - Base table is the prompt's table.
  - **Add join**: primary path = pick from FK-suggested edges (`listForeignKeys`);
    fallback = manual (left table.col = right table.col + join type INNER/LEFT).
  - **Multi-hop**: after a join, the reached table's columns + its FKs become
    available, so A→B→C chains are possible.
  - Output: an ordered list of structured join rows + the reachable-column set,
    compiled to the prompt's `required_joins` / `join_edges` / `filter_expr` /
    `select_expr` (the v2 fields the BE + compiler already consume).
- The single-hop `prompt-join-picker` is superseded by this multi-hop builder.

### D. QB UI/styling polish (all four sub-scopes the user picked)
- **Visual pass**: parent-card consistency, spacing/token cleanup, heading +
  button styles across qb-design / compose / list-add-edit-view.
- **Condition tree**: clearer nesting/indentation, add/remove affordances,
  operator/value alignment in qb-filter-tree / group-node / condition-row.
- **Join designer + output columns**: polish qb-join-designer / qb-output-columns
  (shared with Prompt after C).
- **SQL preview + run/results**: qb-sql-preview + run-query-builder layout/states.
- Styling only where possible; behavior unchanged unless a fix is needed.

### E. Datasource dropdown on Connections + Saved Queries (FE-only)
- Both BE list endpoints already filter: connections `?datasourceId=`,
  saved-queries `filter.datasourceId`. So FE-only.
- Add an `app-custom-dropdown` (server-mode, datasource list) above each list's
  toolbar. On change, pass the datasourceId into the `UsServerListAdapter`
  params and reload; clear = all. Persist the pick in the URL query so a refresh
  keeps the filter.

## Components / data flow

```
config-prompt (summary cards)
  ├─ Source & Joins dialog → shared JoinBuilder (FK + manual, multi-hop)
  │      └─ PromptSchemaService (lazy: schemas→tables→columns→FKs, cached)
  ├─ Column & Filter dialog → reached column + operator + predicate
  ├─ Values dialog → prompt-value-source (reuse) + sql-query-dialog (reuse)
  └─ Appearance dialog → prompt-appearance-form (reuse)
        save → configPrompt(submitData) with prompt_schema/table/column,
               required_joins/join_edges/filter_expr/select_expr, appearance
```

## Error handling
- Lazy fetch failures: the control shows an inline error + retry, never a blank
  silent state (the exact bug we're fixing). Button-level busy, no global overlay.
- Save keeps the existing configPrompt + updateAppearance two-call flow.

## Testing / verification
- tsc → ngc AOT → prod build (the gate) after each slice.
- Headless (against the Docker stack, token+permission-tree seeded): open a
  prompt config, select a schema → assert `listSchemaTables` fires and tables
  populate; select a table → assert columns populate; add an FK-suggested join
  → assert reachable columns extend; save → reload → config round-trips.
- Datasource dropdown: select one → assert the list reloads with `datasourceId`
  and rows narrow.
- Screenshots of the new config cards + dialogs + polished QB to the screenshots
  folder.

## Rollout (sliced, each independently shippable)
1. **S1 — Fix #1 (lazy schema/table/column)** in the current config-prompt, no
   redesign yet. Immediate functional fix.
2. **S2 — Shared JoinBuilder** (extract from QB) + wire into config-prompt
   (multi-hop FK+manual). Fixes #3.
3. **S3 — Summary-cards + dialogs restructure** of config-prompt. Fixes #2/#4.
4. **S4 — QB styling polish** (4 sub-scopes).
5. **S5 — Datasource dropdown** on Connections + Saved Queries.
Verify + screenshot per slice.

## Build results (2026-08-06)

All 5 slices implemented. Gates: `tsc --noEmit` 0, `ngc -p tsconfig.app.json --noEmit` 0, all 10 i18n locales parse; prod build run as the final gate.

- **S1** (lazy schema→table→column) — done + PROVEN LIVE earlier (schema-select fires `listSchemaTables`, table-select fires `listTableColumns`; also fixed the `data`-vs-`data.columns` shape bug). The "no API on schema select" bug is gone.
- **S2** (`prompt-join-builder`) — structured multi-hop FK+manual join builder emitting the compiler's `join_edges` contract; wired into config-prompt; 18 i18n keys ×10 locales. Built prompt-local (NOT extracted from QB — QB's designer is server-coupled), so zero QB risk; the contract is shared even though the component isn't.
- **S3** — config-prompt's 5 sections are now `app-custom-accordion` cards (Query-config open, rest collapsed). Form bindings untouched; ngc validates the structure.
- **S4** — QB styling polish, SCSS-only across 15 files (condition-tree depth nesting + AND/OR accent, join-designer/output-columns layout, SQL-preview/results, parent-card consistency, tokenization, ~440 lines dead-CSS removed). No .ts/.html touched.
- **S5** — datasource dropdown on Connections (`?datasourceId`) + Saved Queries (`filter.datasourceId`), URL-persisted, clear=all. FE-only. `COMMON.ALL_DATASOURCES` ×10 locales.

Not committed (user pushes). The running Docker UI image predates these edits — deploy = rebuild the `dbexec-ui` image (or the hot-swap-into-container flow used for live testing).

## S6 — config-prompt rebuilt as a guided two-pane stepper (user pick, 2026-08-06)

User chose the **guided two-pane** mockup and asked for: the Alert-module stepper idiom, Save enabled only while valid+dirty with correct value patching, and FE+BE mandatory/validation checks.

**Stepper (mirrors `add-alert` exactly):** a `PROMPT_WIZARD_STEPS` constant (key/titleKey/icon), `currentStep`/`lastStep`, the `.steps-container`/`.step`/`.step-dot`/`.step-line` markup + scss copied from add-alert, `isStepValid(step)` per-step gate, `nextStep`/`previousStep`/`onStepClick` (backward free; forward only if every prior step valid), Next disabled on `!isStepValid(currentStep)`, Save on the last step gated by `canSave && isFormDirty`.

**5 steps:**
1. Source — schema + tables (lazy S1). Required: schema + ≥1 table.
2. Joins — `prompt-join-builder` (S2). Optional; valid edges if present.
3. Column & Filter — filter column (from reachable columns incl. joined) + operator + optional WHERE. Required: column.
4. Values — `prompt-value-source` + chips/SQL/upload. Required for dropdown/multiselect/checkbox/radio.
5. Review & Appearance — read-only summary + `prompt-appearance-form`; Save here.

**Save gating + patching:** on config load, patch every step's controls (keep S1 lazy backfill) then `markAsPristine()` so Save starts disabled; any edit flips dirty; Save disabled unless whole form valid AND dirty; button-level busy (`saving()`), no global overlay (loading standard).

**Validation FE↔BE:** FE per-step (`Validators.required`/zod on schema/tables/column; join-required-if-multi-table; values-required-by-type) mirrors the BE `configurePrompt.validation` (id/schema/tables required, promptJoin if >1 table). **BE extended**: accept the structured `joinEdges`/`requiredJoins` path so a multi-table config expressed as structured joins isn't rejected for a missing free-text `promptJoin`.

## Risks
- **Extracting qb-join-designer to shared** touches QB; must keep QB behavior
  identical (parity check + the compiler contract unchanged). If extraction is
  too entangled, fall back to a prompt-local join builder that emits the SAME
  join_edges/required_joins shape (compiler stays the contract).
- Lazy loading changes config-prompt's load sequence (schema data no longer
  present upfront for the saved-config backfill) — must sequence the fetches
  before patching the saved selection, or the saved tables/columns won't render.
- Large multi-hop join graphs could be heavy; cap suggestions + lazy-load each
  hop's FKs.
