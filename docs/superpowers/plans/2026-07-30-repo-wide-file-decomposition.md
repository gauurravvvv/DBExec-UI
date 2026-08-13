# Repo-wide File Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bring every logic `.ts` file in the codebase under **1,000 lines** by moving
cohesive slices into helpers and services, with **zero change to how the application
behaves**.

**Architecture:** the three mechanisms proven on the dataset module, applied in
increasing order of risk. (1) Stateless logic → pure free functions in `helpers/`.
(2) Cohesive stateful concerns → **component-provided** injectable services (declared
in each component's own `providers: []`, so every screen gets a private instance),
with the component keeping thin proxy accessors so **templates are never touched**.
(3) Only where two files' bodies are already byte-identical do they share one
implementation. Long **data tables** are left alone — length is the correct shape for
data.

**Tech Stack:** Angular 18.2 (NgModule, OnPush, signals, NgRx in analyses), TypeScript
strict, Playwright for functional coverage.

---

## Global Constraints

These apply to every task. A task is not done until all of them hold.

- **Zero behaviour change.** Method bodies move verbatim. If a body must be edited to
  fit a new home, the edit is limited to rebinding identifiers (`this.foo` →
  `this.svc.foo`) — never to changing logic, order, conditions, defaults or error
  handling.
- **No file over 1,000 lines** at the end, except the data tables named in
  "Explicitly NOT to split".
- **Templates untouched.** Where state moves into a service, the component keeps a
  proxy getter/setter for every member the HTML binds. Check with
  `grep -c '\b<member>\b' <component>.html` before deciding proxy vs. rebind.
- **Verification gate, run all three, after every task:**
  ```bash
  npx tsc --noEmit
  npx ngc -p tsconfig.app.json --noEmit
  npx ng build --configuration production
  ```
  `tsc` alone is not enough — it does not check Angular templates, and it accepts a
  method missing an ambient `declare const monaco`. `ngc` AOT strict catches a template
  referencing a member that no longer exists and a stranded decorator (NG1006 / NG6001).
  A green `tsc` with a broken template still ships a runtime error.
- **e2e gate:** the module's smoke spec (Phase 0) must pass after every task in that
  module.
- **Extraction fidelity — carve, do not eyeball.** Move members with a
  **signature-to-signature** carver, not a brace counter: a brace counter stops early
  on a signature whose parameters contain `{}` and on a regex literal with an unmatched
  brace, silently truncating or dropping the member. After every scripted move, assert
  `count('/*') == count('*/')` on the file. After every component split, run a
  **member-set audit** against the pre-refactor file: every member must be on the
  component or its new service, none lost, and the decorator inventory must match
  exactly. This is not optional — it is how the dataset work caught a stranded
  `@HostListener` that would have made Escape discard unsaved SQL.
- **Never commit** `src/environments/environment*.ts` or any `.env`. They currently
  carry local port changes (`:9058`) and are tracked.
- **Branch:** `version_261`. **The user pushes, never the agent.**
- **Commit messages:** `type(scope): summary`, imperative, ~72 chars, plain and factual.
  No AI/model attribution, no `Co-Authored-By`, no generated-by trailer. One commit per
  file decomposed.
- **No new user-facing strings** are expected. If one appears, add the key to all 10
  locales in `src/assets/i18n/`.
- Ports in use during this work: FE `:8755`, BE `:9058`.

---

## Measured starting state

`find src -name '*.ts' -not -name '*.spec.ts' | xargs wc -l | awk '$1>1000'` on
2026-07-30:

### Logic files to decompose (11 over 1,000, plus 3 dataset stragglers finished under 1,000)

| File | Lines | Module | Largest members |
|---|---:|---|---|
| `shared/helpers/echarts-option-builder.ts` | 6,664 | shared | ~60 `buildXChartOption` + 49 private helpers + `buildChartOption` dispatch |
| `analyses/components/edit-analyses/edit-analyses.component.ts` | 4,673 | analyses | `handleSaveDialogClose` 173, `loadAllVisuals` 129, `pruneSelection` 112 |
| `query-runner/executor/query-executor.component.ts` | 1,935 | query-runner | `run` 104, `initEditor` 97, `paletteActions` 95, `fetchColumns` 76 |
| `analyses/components/visual-config-sidebar/…component.ts` | 1,847 | analyses | `isCapable` 124, `localizeDropdownOptions` 118, `ngDoCheck` 96 |
| `prompt/components/config-prompt/…component.ts` | 1,781 | prompt | `loadConfigData` 100, `initForm` 99, `executeSqlQuery` 67 |
| `analyses/services/chart-data-transformer.service.ts` | 1,721 | analyses | `transformDataRaw` 226, `transformToHierarchy` 80, `buildMapping` 73 |
| `query-builder/…/configure-query-builder/…component.ts` | 1,355 | query-builder | `patchQueryBuilderConfiguration` 223, `saveQueryBuilderConfiguration` 72 |
| `query-builder/…/execute-query-builder/…component.ts` | 1,302 | query-builder | `executeQueryForResults` 103, `onSaveConfirm` 98, `patchSavedPromptValues` 79 |
| `analyses/components/filter-dialog/…component.ts` | 1,208 | analyses | `save` 177, `onFilterTypeChange` 82, `loadColumnDistinctValues` 61 |
| `dashboard/components/view-dashboard/…component.ts` | 1,110 | dashboard | `executeQuery` 103, `loadDashboard` 57, `mapVisualsFromResponse` 48 |
| `dataset/components/edit-dataset/…component.ts` | 1,233 | dataset | finish the deferred `initMonaco` / query-pipeline split |
| `dataset/components/add-dataset/…component.ts` | 1,111 | dataset | same |
| `dataset/components/formula-field-dialog/…component.ts` | 1,024 | dataset | form-state service |

### Explicitly NOT to split — data tables (length is correct)

| File | Lines | Why |
|---|---:|---|
| `analyses/constants/charts.constants.ts` | 3,208 | raw chart-type definitions (a catalog); 126 data-property lines, capabilities stamped from `chart-capabilities.ts` |
| `dataset/config/sql-dialects/snowflake.ts` | 2,120 | keyword/type/function data — 1 control-flow line |
| `dataset/config/sql-dialects/postgres.ts` | 1,633 | same |
| `dataset/constants/postgres-sql.constants.ts` | 932 | same (already < 1000) |
| `dbexec-api/src/shared/formula/registry/docs.ts` | 1,024 | one `usage`/`description` pair per function — a data table |

Splitting a data table adds indirection and buys no comprehension. Leave them.

---

## Phase 0 — Smoke e2e per module (PREREQUISITE, do first)

**The controlling risk is the functional-test gap.** The dataset decomposition leaned on
`editor-parity` and the 53-case formula suites, and *still* surfaced latent bugs the
compiler could not see. Analyses, dashboard, prompt and query-builder have **no
functional e2e at all** (existing specs: editor-parity, editor-showcase, formula-fields,
formula-screenshots, migration, query-executor, screenshot-cleanup). Restructuring
`edit-analyses` — 4,673 lines, NgRx-connected — behind no functional test is how a
chart silently stops rendering and nobody notices for a week.

So before decomposing a module, write a **thin smoke spec** for it: load the main screen,
assert it renders, exercise one key action, assert no console error and no 5xx. This is a
safety net, not full coverage — it must pass against the **current, un-refactored** code
before any decomposition in that module begins.

**Files (create):**
- `e2e/analyses-smoke.e2e.ts`
- `e2e/dashboard-smoke.e2e.ts`
- `e2e/prompt-smoke.e2e.ts`
- `e2e/query-builder-smoke.e2e.ts`
- `e2e/dataset-workbench.e2e.ts` (also unblocks the deferred dataset tasks)

Reuse `e2e/_auth.ts` — `login`, `authToken`, `firstConnection`, `connectableDatasourceId`,
`API`. Never `waitUntil: 'networkidle'` (the app holds an open SSE stream). Drive Monaco
through its model API, not keystrokes. Use `connectableDatasourceId()` rather than the
first/newest datasource — the newest is often a migration-import stub whose `/schemas`
answers 500.

- [ ] **Step 1: `e2e/analyses-smoke.e2e.ts`** — open an existing analysis in edit; assert
  the visual grid renders at least one `echart-visual`/canvas; open the config sidebar;
  change one property and assert the chart re-renders (option rebuild fired); assert no
  console error and no `/api/v1` response ≥ 500.
- [ ] **Step 2: `e2e/dashboard-smoke.e2e.ts`** — open a dashboard in view; assert visuals
  paint (no "No data" where rows exist — the KPI paint-gate bug's signature); toggle the
  filter sidebar.
- [ ] **Step 3: `e2e/prompt-smoke.e2e.ts`** — open config-prompt; assert the form builds;
  generate the SQL preview and assert it is non-empty.
- [ ] **Step 4: `e2e/query-builder-smoke.e2e.ts`** — open configure- then
  execute-query-builder; assert tabs load and a structure node selects.
- [ ] **Step 5: `e2e/dataset-workbench.e2e.ts`** — the spec from the dataset plan:
  pick a connectable datasource, tree loads, expand schema→table→column, run a query,
  results render, save, reopen in edit, SQL round-trips.
- [ ] **Step 6:** run all five against current code; each must PASS. Fix **selectors**,
  never components. Commit: `test(<module>): smoke e2e before decomposition`.

---

## Phase 1 — `echarts-option-builder.ts` (6,664 → per-file < 1,000)

The largest file in the repo and the **lowest risk**: ~60 exported `buildXChartOption`
functions, each pure `(data, config) => option`, plus 49 private shared helpers and a
`buildChartOption` dispatcher. Only 4 files import it, all via the barrel it will become.

**Files:**
- Create `shared/helpers/echarts/` with:
  - `chart-primitives.ts` — the 49 private helpers (`getColors`, `buildLegend`,
    `buildTooltip`, `buildGrid`, `buildValueAxis`, `buildDataLabel`, `buildMarkOverlays`,
    `buildVisualMap`, `makeGradient`, `build3DAxis`, `readGeoFields`, …) + `CHART_TYPOGRAPHY`.
    These are the shared vocabulary; export them so the family files import from here.
  - `cartesian-charts.ts` — bar, line, area, combo, histogram, scatter, waterfall, boxplot,
    pareto, lollipop, cleveland-dot, dumbbell, slope, bump, marimekko, cycle-plot.
  - `part-to-whole-charts.ts` — pie, funnel, sunburst, treemap, sankey, themeriver,
    streamgraph, radial-bar, wind-rose.
  - `statistical-charts.ts` — polar, gauge, heatmap, bubble, bullet, kpi-delta, radar,
    parallel, candlestick, calendar-heatmap, and the six `*Stub` builders.
  - `graph-charts.ts` — graph, tree, network, arc, chord.
  - `geo-charts.ts` — choropleth, worldmap, pointmap, bubblemap, flowlines, flowGL.
  - `gl-3d-charts.ts` — bar3d, line3d, scatter3d, surface, globe, graphGL, scatterGL,
    linesGL, map3d, lines3d, polygons3d.
  - `build-chart-option.ts` — the `buildChartOption` dispatcher (the switch that maps a
    chart type to its builder).
- Keep `shared/helpers/echarts-option-builder.ts` as a **barrel** re-exporting everything,
  so the 4 importers change nothing:
  ```ts
  export * from './echarts/chart-primitives';
  export * from './echarts/cartesian-charts';
  // … etc
  export * from './echarts/build-chart-option';
  ```

- [ ] **Step 1:** create `chart-primitives.ts` by moving the 49 private helpers +
  `CHART_TYPOGRAPHY` verbatim, adding `export` to each. `npx tsc --noEmit`.
- [ ] **Step 2:** move each family file, one at a time, importing what it needs from
  `./chart-primitives`. `npx tsc --noEmit` after each family — a builder that references a
  helper not yet exported fails here.
- [ ] **Step 3:** move `buildChartOption` into `build-chart-option.ts`; it imports the
  builders from the family files.
- [ ] **Step 4:** replace `echarts-option-builder.ts` body with the barrel re-exports.
- [ ] **Step 5:** confirm no family file exceeds 1,000 lines; if one does, split that
  family by sub-group (e.g. cartesian → `cartesian-basic` + `cartesian-derived`).
- [ ] **Step 6:** full gate + `analyses-smoke` + `dashboard-smoke` (both render charts
  through this builder). Commit: `refactor(charts): split echarts-option-builder by chart family`.

---

## Phase 2 — analyses module

The heaviest module: four files over 1,000, one NgRx store, and the repo's single biggest
component. Do it after Phase 1, because `edit-analyses` and the transformer both lean on
the chart builder that Phase 1 just made navigable.

### Task 2a — `chart-data-transformer.service.ts` (1,721 → < 1,000)

A service of ~42 pure-ish transforms. `transformDataRaw` (226) is the dispatcher; the rest
are per-shape transforms (`transformToHierarchy`, `transformToSingleSeries`,
`transformTo3DFormat`, `transformToMultiSeriesByValueColumns`, `applyAnalytics`,
`buildMapping`, `getFieldLabels`).

- [ ] Extract the pure transforms into `analyses/helpers/chart-transforms/` grouped by
  output shape (`series-transforms.ts`, `hierarchy-transforms.ts`, `geo-transforms.ts`,
  `analytics.ts`). The service keeps `transformDataRaw` as the dispatcher and any state.
  Move one function per `tsc`. Full gate + `analyses-smoke`. Commit.

### Task 2b — `visual-config-sidebar.component.ts` (1,847 → < 1,000)

`isCapable` (124), `localizeDropdownOptions` (118), `trackByValue` (192 — likely a large
option-map, verify it isn't actually data), `ngDoCheck` (96).

- [ ] Pull the capability logic (`isCapable`, `limitOther`, `addConditionalRule`,
  `syncFormatToStructured`) into a `VisualConfigService` (component-provided) and the
  dropdown-option localisation into an `analyses/helpers/config-options.helper.ts`.
  Proxy template-bound members. If `trackByValue`'s 192 lines are a static option map,
  move it to a constants file (data, not logic). Full gate + `analyses-smoke`. Commit.

### Task 2c — `filter-dialog.component.ts` (1,208 → < 1,000)

`save` (177), `onFilterTypeChange` (82), `loadColumnDistinctValues` (61),
`buildDefaultValueConfig` (48).

- [ ] Extract the filter-model assembly (`save`, `buildDefaultValueConfig`,
  `populateFromFilter`, `updateControlTypeOptions`) into a pure
  `analyses/helpers/filter-model.helper.ts`, and the reference/distinct-value loading into
  the existing analyses data service or a small `filter-options.service.ts`. Full gate +
  `analyses-smoke`. Commit.

### Task 2d — `edit-analyses.component.ts` (4,673 → < 1,000)

**The hardest file in the repo.** 225 members, NgRx-connected. Do it last in the module,
after 2a–2c have shrunk its collaborators, and only behind `analyses-smoke`.

- [ ] **Map first.** Group the 225 members: store wiring (`initializeStoreSelectors`,
  `loadAnalysis`, `loadAllVisuals`, `loadDatasetData`, `refreshFields`); visual CRUD
  (`addVisual`, `pruneSelection`, `scrollToVisual`, `handleSaveDialogClose`); field/role
  selection (`onFieldClick`, `applyRoleSelection`, `pruneSelection`); chart data
  (`transformSingleVisualChartData`); layout (`onResize`, `scrollToVisual`).
- [ ] Extract, in this order, each behind its own `tsc` + the smoke spec:
  1. `analyses/services/analysis-visuals.store-facade.ts` — the NgRx selector/dispatch
     wiring (`initializeStoreSelectors`, the load* methods). Keeps the component from
     touching the store directly.
  2. `analyses/services/visual-selection.service.ts` (component-provided) — field/role
     selection and pruning (`onFieldClick`, `applyRoleSelection`, `pruneSelection`).
  3. `analyses/helpers/visual-layout.helper.ts` — pure geometry (`onResize` math,
     `scrollToVisual` target computation).
  4. `analyses/services/visual-save.service.ts` — `handleSaveDialogClose` and the save
     pipeline.
- [ ] Proxy every template-bound member. Member-set audit against the original. Full gate
  + `analyses-smoke` after **each** extraction (not just at the end — this file is too big
  to debug a regression across four moves at once). Commit per extraction.

---

## Phase 3 — query-runner: `query-executor.component.ts` (1,935 → < 1,000)

`run` (104), `initEditor` (97), `paletteActions` (95), `fetchColumns` (76),
`loadSchemaObjects` (58), `buildOverflowMenu` (56), `fetchServerPage` (45).

This component already went through the Monaco migration, so its editor setup is clean.
Extract:
- [ ] `query-runner/executor/executor-palette.ts` — `paletteActions` + `buildOverflowMenu`
  (command-palette and overflow-menu definitions; largely data + small builders).
- [ ] `query-runner/executor/executor-schema.service.ts` (component-provided) —
  `loadSchemaObjects`, `fetchColumns`, and the `SchemaCatalog` glue.
- [ ] `query-runner/executor/executor-results.helper.ts` — `fetchServerPage` and the
  server-paging/derivable-result logic.
- [ ] Leave the `run` pipeline and `initEditor` on the component. Proxy template-bound
  members. Full gate + `query-executor` (existing) + `dataset-workbench`. Commit.

---

## Phase 4 — query-builder (two files)

### Task 4a — `configure-query-builder.component.ts` (1,355 → < 1,000)

`patchQueryBuilderConfiguration` (223) and `saveQueryBuilderConfiguration` (72) dominate.

- [ ] Extract the config patch/save into a `query-builder/services/qb-config.service.ts`
  (component-provided): `patchQueryBuilderConfiguration`, `saveQueryBuilderConfiguration`,
  `getTabsData`, `handleTabClose`, `handlePromptSelection`, `clearSelected`. Keep
  `screenState` and tab-click UI on the component. Full gate + `query-builder-smoke`. Commit.

### Task 4b — `execute-query-builder.component.ts` (1,302 → < 1,000)

`executeQueryForResults` (103), `onSaveConfirm` (98), `patchSavedPromptValues` (79),
`buildValueSnapshots` (77).

- [ ] Extract execution + snapshot logic into `query-builder/services/qb-execute.service.ts`
  and the pure `buildValueSnapshots` / `patchSavedPromptValues` into
  `query-builder/helpers/value-snapshot.helper.ts`. Full gate + `query-builder-smoke`. Commit.

---

## Phase 5 — prompt: `config-prompt.component.ts` (1,781 → < 1,000)

`loadConfigData` (100), `initForm` (99), `onJoinConditionInput` (69), `executeSqlQuery` (67),
`onWhereConditionInput` (66), `loadSchemaDataFromAPI` (59), `generateSqlPreview` (58).

- [ ] Extract the SQL assembly (`generateSqlPreview`, the join/where condition builders) into
  a pure `prompt/helpers/sql-preview.helper.ts`, and schema/config loading into a
  `prompt/services/prompt-config.service.ts` (component-provided). Keep `initForm` and the
  reactive-form wiring on the component. Full gate + `prompt-smoke`. Commit.

---

## Phase 6 — dashboard: `view-dashboard.component.ts` (1,110 → < 1,000)

`executeQuery` (103), `loadDashboard` (57), `mapVisualsFromResponse` (48),
`computeVisualDimensions` (23), `markGridCells` (22), `updateCanvasDimensions` (23).

- [ ] Extract the grid geometry (`computeVisualDimensions`, `markGridCells`,
  `updateCanvasDimensions`, `hasRequiredChartFields`) into a pure
  `dashboard/helpers/dashboard-layout.helper.ts`, and the load/execute/map pipeline into a
  `dashboard/services/dashboard-view.service.ts`. Watch the KPI paint-gate: assert
  `dashboard-smoke` still shows data, not "No data". Full gate + `dashboard-smoke`. Commit.

---

## Phase 7 — finish the dataset stragglers

Now that `dataset-workbench.e2e.ts` exists (Phase 0), the deferred dataset work is safe.

- [ ] **`edit-dataset` / `add-dataset` (1,233 / 1,111 → < 1,000):** finish the split the
  base-class task deferred — move the remaining query-execution pipeline
  (`executeQueryForDatasource` and friends) and the drifted `initMonaco` into per-screen
  strategy objects, or push more identical members to `DatasetSqlWorkbenchBase`. Re-measure
  identity first; do not reuse stale numbers. **Also fix the recorded defect:** edit-dataset
  registers neither the SQL validator nor the formatter and binds Ctrl+Enter through the
  non-binding `editor.addCommand` — bring it up to add-dataset (this is a behaviour change,
  so call it out in the commit). Full gate + `dataset-workbench` + `editor-parity`. Commit.
- [ ] **`formula-field-dialog.component.ts` (1,024 → < 1,000):** extract form state,
  validation round-trip and catalog wiring into `formula-field-form.service.ts`
  (component-provided). Full gate + `formula-fields` (53 cases). Commit.
- [ ] **`intellisense/completion-provider.ts` (693 — under 1,000, optional):** it holds one
  586-line method with six clean `if (ctx === '…')` branches, each ending in a single
  `return { suggestions }`. Extractable into a `SuggestionSink` + per-context dispatch. This
  is a **control-flow** split, not a member move — higher risk — so only do it with
  `dataset-workbench` green, and only if the < 1,000 target is wanted (it already passes).

---

## Phase 8 — documentation (session-end protocol)

- [ ] Prepend a dated Progress entry to each touched module's
  `docs/context/modules/<module>.md`, with the before/after line counts.
- [ ] Update each module's Status + Last-updated line and its row in
  `docs/context/INDEX.md`. Use `date +%Y-%m-%d`; never guess.
- [ ] Add a dated `docs/context/SESSION_LOG.md` entry.
- [ ] Record any latent bug found (as the dataset work did with the stranded
  `@HostListener`) and any data table deliberately left large.
- [ ] Commit: `docs: record the repo-wide file decomposition`.

---

## Ordering rationale

Phase 0 first because there is no functional coverage of these modules and a base of
smoke specs is the only thing that makes "nothing breaks" verifiable rather than hoped.
Phase 1 next because the chart builder is the largest file, the lowest risk (pure
functions, one barrel), and a dependency of the analyses and dashboard work that follows.
Then analyses (Phase 2) with its own files ordered collaborators-before-`edit-analyses`,
so the 4,673-line component is tackled last and smallest. query-runner, query-builder,
prompt and dashboard (Phases 3–6) are independent and can be reordered freely. The dataset
stragglers (Phase 7) come last because they need the Phase 0 dataset spec. Documentation
(Phase 8) closes each module per the repo protocol.

## Risk notes

- **`edit-analyses` (4,673, NgRx)** is the single highest-risk item. Extract one collaborator
  at a time, run the smoke spec after each, and never batch its moves.
- **`trackByValue` (192) in visual-config-sidebar** and **`patchQueryBuilderConfiguration`
  (223)** are suspiciously large for their names — inspect each before moving; a large
  option/config map is data and belongs in a constants file, not a service.
- The `*Stub` echarts builders (`buildViolinStubOption`, etc.) are intentional placeholders —
  move them but do not "implement" them.
