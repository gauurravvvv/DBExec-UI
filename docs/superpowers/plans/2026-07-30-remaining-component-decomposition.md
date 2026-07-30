# Remaining Component Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bring the five remaining logic components under **1,000 lines** by moving
cohesive slices into helpers and component-provided services, with **zero change to
how the application behaves**.

**Status of the wider effort.** The repo-wide sweep
(`2026-07-30-repo-wide-file-decomposition.md`) is partly done:
- `echarts-option-builder.ts` 6,664 → 11 files (commit `74359263`)
- `chart-data-transformer.service.ts` 1,721 → 4 files (commit `11be32d6`)
- query-builder smoke spec added (`c58f7df9`)

This plan covers what remains. **query-builder is deliberately out of scope** — see
"Excluded" below.

**Architecture:** the three mechanisms proven on the dataset module and on the two
files already done. (1) Stateless logic → pure free functions in `helpers/`.
(2) Cohesive stateful concerns → **component-provided** injectable services, with the
component keeping thin proxy accessors so **templates are never touched**. (3) Data
(large option maps, category constants) → a constants file, never a service.

---

## Global Constraints

Every task inherits these. A task is not done until all hold.

- **Zero behaviour change.** Bodies move verbatim; the only permitted edit is
  rebinding identifiers (`this.foo` → `svc.foo`, `this.leaf(` → `leaf(`). Never change
  logic, order, conditions, defaults or error handling.
- **No file over 1,000 lines** at the end.
- **Templates untouched.** Where state moves into a service, keep a proxy
  getter/setter for every member the HTML binds. Confirm with
  `grep -c '\b<member>\b' <component>.html` before choosing proxy vs. rebind. This
  matters most for `visual-config-sidebar` (4,364-line template) and `edit-analyses`
  (1,923-line template).
- **Verification gate, all three, after every task:**
  ```bash
  npx tsc --noEmit
  npx ngc -p tsconfig.app.json --noEmit
  npx ng build --configuration production
  ```
  `ngc` is not optional — it catches template references to removed members and
  stranded decorators (`@HostListener`/`@ViewChild`) that `tsc` accepts. The dataset
  work found a stranded `@HostListener` this way that would have made Escape discard
  unsaved SQL.
- **Runtime smoke gate** (see Phase 0): the module's smoke spec must pass after every
  task in a reachable module.
- **Carve, do not eyeball.** Use a signature-to-signature carver, not a brace counter
  (a brace counter stops early on a signature containing `{}` and on a regex literal
  with an unmatched brace — both silently truncate). After every scripted move, assert
  `count('/*') == count('*/')`. After every component split, run a **member-set audit**
  against the pre-refactor file: every member on the component or its new service/helper,
  none lost, decorator inventory identical.
- **Fidelity audit method.** Compare code-only bodies (strip leading/trailing comments
  and blank lines) between the original member and its moved form, normalising
  `this.<moved>(` → `<moved>(`. `tsc` compiling clean is the backstop; the audit is the
  belt.
- **Never commit** `src/environments/environment*.ts` or any `.env`.
- **Branch:** `version_261`. **The user pushes, never the agent.** One commit per file
  (or per collaborator extraction for `edit-analyses`).
- **Commit messages:** `type(scope): summary`, imperative, plain, factual. No AI/model
  attribution, no `Co-Authored-By`, no generated-by trailer.
- Ports: FE `:8755`, BE `:9058`. Kill the FE dev server before editing a 1,000+-line
  file so it does not thrash-rebuild.

---

## Measured starting state

| File | ts | html | members | NgRx | Module |
|---|---:|---:|---:|:--:|---|
| `analyses/…/filter-dialog.component.ts` | 1,209 | 583 | 30 | no | analyses |
| `analyses/…/visual-config-sidebar.component.ts` | 1,847 | 4,364 | 133 | no | analyses |
| `dashboard/…/view-dashboard.component.ts` | 1,111 | 594 | 63 | no | dashboard |
| `prompt/…/config-prompt.component.ts` | 1,781 | 736 | 69 | yes (7) | prompt |
| `analyses/…/edit-analyses.component.ts` | 4,674 | 1,923 | 225 | yes (20) | analyses |

Existing collaborators to extend rather than duplicate:
- analyses `services/`: `analyses.service`, `analysis-analytics.service`,
  `analysis-interaction.service`, `analysis-tabs.service`, `analysis-widgets.service`,
  `chart-data-transformer.service`, `filter-options-cache.service`, `geo-registry.service`.
- analyses `helpers/`: `visual-selection`, `authoring-history`, `chart-shape-transforms`,
  `chart-transform-utils`, `format-grammar`, `geo-registry`, `temporal`.
- dashboard `services/`: `dashboard.service`, `dashboard-interaction`,
  `dashboard-subscription.service`, `dashboard-export.util`.
- prompt `services/`: `prompt.service`.

---

## Excluded

- **query-builder** (`configure-query-builder` 1,355, `execute-query-builder` 1,302):
  the two screens **cannot be reached in the Playwright harness for this test org** —
  `/app/query-builders` redirects to home on a cold navigation, a pre-existing
  permission/routing condition unrelated to any refactor (confirmed with a control test:
  datasets/analyses/dashboards all load; query-builders does not). A runtime smoke net is
  therefore impossible here, and the user chose to defer these two files until the
  routing/permission issue is resolved. The smoke spec exists (`c58f7df9`) and skips
  gracefully, so it is ready the day the route is reachable.
- **Data tables** (unchanged from the parent plan): `charts.constants.ts` (3,208),
  `sql-dialects/*`, `postgres-sql.constants.ts`, `formula/registry/docs.ts`. Long is the
  correct shape for data.

---

## Phase 0 — Smoke e2e for the reachable modules

Runtime net before any component surgery. Reachability confirmed: **analyses,
dashboard** load; **prompt** to be confirmed on first run (probe `/app/prompts`).

- [ ] **Step 1: `e2e/analyses-smoke.e2e.ts`** — open an existing analysis in edit
  (`/app/analyses`, click through to an analysis); assert the visual grid renders at
  least one `echart-visual`/canvas; open the config sidebar (`app-visual-config-sidebar`);
  change one property (e.g. a dropdown) and assert the chart option rebuilds (canvas
  repaints / no console error). Assert no `/api/v1` response ≥ 500. **This is the net for
  both `filter-dialog`, `visual-config-sidebar` and `edit-analyses`.**
- [ ] **Step 2: `e2e/dashboard-smoke.e2e.ts`** — open a dashboard in view
  (`/app/dashboards` → a dashboard); assert visuals paint (no "No data" where rows exist
  — the KPI paint-gate bug's signature, memory `dashboard-kpi-paint-gate`); toggle the
  filter sidebar. Net for `view-dashboard`.
- [ ] **Step 3: `e2e/prompt-smoke.e2e.ts`** — probe `/app/prompts` reachability first;
  if reachable, open config-prompt, assert the form builds and the SQL preview is
  non-empty. If NOT reachable (same class of guard issue as query-builder), make the
  spec skip gracefully and note that `config-prompt` falls back to compile-gates-only,
  exactly as query-builder did.
- [ ] **Step 4:** run each against current code; each must PASS (or skip). Fix
  **selectors**, never components. Reuse the reachability + graceful-skip pattern from
  `query-builder-smoke.e2e.ts` (check `page.url()` after nav, `test.skip` if redirected).
- [ ] **Step 5:** commit `test(analyses|dashboard|prompt): smoke e2e before decomposition`.

---

## Phase 1 — analyses: `filter-dialog.component.ts` (1,209 → < 1,000)

Smallest analyses file, no NgRx, a self-contained dialog. Do it first.

**Largest members:** `save` (177), `saveDisabledHint` (101), `onFilterTypeChange` (82),
`loadColumnDistinctValues` (61), `updateControlTypeOptions` (59), `populateFromFilter`
(55), `buildDefaultValueConfig` (48), `loadReferenceOptions` (47),
`recomputeStaleDefaults` (35), `extractDefaultValue` (34).

**Extraction:**
- Create `analyses/helpers/filter-model.helper.ts` — the pure filter-model assembly and
  validation: `save`'s model-building portion, `buildDefaultValueConfig`,
  `populateFromFilter`, `extractDefaultValue`, `recomputeStaleDefaults`,
  `updateControlTypeOptions`, `saveDisabledHint` (a pure computed string). These read the
  form's values, not component-only state — pass what they need as arguments.
- Reference-data/distinct-value loading (`loadColumnDistinctValues`,
  `loadReferenceOptions`) already has `filter-options-cache.service.ts` — route through it
  rather than creating a new service; move only the orchestration that isn't there yet.
- Keep `save`'s dialog-close/emit tail and `onFilterColumnChange`/`onFilterTypeChange`
  event glue on the component.

**Steps:** move one member per `tsc`; proxy nothing (dialog binds mostly to the reactive
form, verify with the html grep); full gate + `analyses-smoke`; commit
`refactor(analyses): extract filter-dialog model logic into a helper`.

---

## Phase 2 — dashboard: `view-dashboard.component.ts` (1,111 → < 1,000)

No NgRx, ~110 lines over. The smallest lift in the set.

**Largest members:** `executeQuery` (103), `loadDashboard` (57), `mapVisualsFromResponse`
(48), `hasRequiredChartFields` (25), `updateCanvasDimensions` (23),
`computeVisualDimensions` (23), `markGridCells` (22), `handleResize` (22), `paintVisual`
(21), `buildExportMenu` (20).

**Extraction:**
- Create `dashboard/helpers/dashboard-grid-layout.helper.ts` — the pure geometry:
  `computeVisualDimensions`, `markGridCells`, `updateCanvasDimensions`, `handleResize`
  math, `hasRequiredChartFields`. ~115 lines, no component state (pass canvas size +
  visuals as arguments). **This alone clears the 1,000 line target.**
- If more headroom is wanted, move the load/execute/map pipeline (`loadDashboard`,
  `executeQuery`, `mapVisualsFromResponse`) into `dashboard/services/dashboard-view.service.ts`
  (component-provided), but Phase 2 only needs the helper.
- **Guard the paint-gate:** `paintVisual` and the "No data" logic are where the KPI
  paint-gate bug lived. Do not touch `paintVisual`'s gate; the `dashboard-smoke` spec must
  still show data.

**Steps:** move the geometry helper; full gate + `dashboard-smoke`; commit
`refactor(dashboard): extract view-dashboard grid geometry into a helper`.

---

## Phase 3 — analyses: `visual-config-sidebar.component.ts` (1,847 → < 1,000)

No NgRx, but a **4,364-line template** binds to many members — proxies are essential
here, and the html grep is mandatory before every move.

**Real body sizes** (the earlier "192 trackByValue" was doc-comment inflation;
`trackByValue` is 3 lines): `localizeDropdownOptions` (117), `ngDoCheck` (38),
`addConditionalRule` (25), `syncFormatToStructured` (23), `ensurePivot` (18),
`addReferenceLine` (18), `addReferenceBand` (17), `tableAvailableColumns` (16),
`setTableColumnVisible` (16), `setCrossFilterEnabled` (16). 133 members, 1,028 body
lines — the bulk is many small config setters plus fields and comments.

**Extraction:**
- `analyses/helpers/config-dropdown-options.helper.ts` — `localizeDropdownOptions` (117,
  pure: takes options + a translate fn, returns localised options) and `isCapable` (a
  pure capability lookup). ~150 lines out.
- `analyses/services/visual-config-mutation.service.ts` (component-provided) — the config
  setter cluster: `addConditionalRule`, `addReferenceLine`, `addReferenceBand`,
  `ensurePivot`, `setTableColumnVisible`, `setCrossFilterEnabled`,
  `syncFormatToStructured`, `ensureValueFormat`, `limitOther`. These mutate the bound
  `focusedVisual.config`; the service takes the visual as an argument and the component
  keeps thin proxy methods the template already calls.
- `ngDoCheck`'s change-detection snapshot logic (38) can move to a small
  `analyses/helpers/config-change-snapshot.helper.ts` (pure: JSON-snapshot compare).
- Leave `focusedVisual`, `ngOnInit`, and the `@Input`/`@Output` wiring on the component.

**Steps:** grep the template for every member before moving it; move one per `tsc`;
member-set + decorator audit; full gate + `analyses-smoke` (it exercises this sidebar);
commit `refactor(analyses): extract visual-config-sidebar options and mutations`.

---

## Phase 4 — prompt: `config-prompt.component.ts` (1,781 → < 1,000)

NgRx-touched (7 select/dispatch). Confirm `prompt-smoke` reachability first (Phase 0
Step 3); if the route is guarded away like query-builder, this file falls to
compile-gates-only.

**Largest members:** `loadConfigData` (100), `initForm` (99), `onJoinConditionInput`
(69), `executeSqlQuery` (67), `onWhereConditionInput` (66), `loadSchemaDataFromAPI` (59),
`generateSqlPreview` (58), `updateAvailableColumns` (54), `loadPromptData` (53),
`refreshPromptValues` (45), `onSubmit` (44), `updateTableColumns` (43).

**Extraction:**
- `prompt/helpers/sql-preview.helper.ts` — the pure SQL assembly: `generateSqlPreview`,
  the join/where condition builders (`onJoinConditionInput`/`onWhereConditionInput`
  *string-building* portions, not their event glue), `updateAvailableColumns`,
  `updateTableColumns`. These transform form values into SQL text — pure, ~250 lines.
- `prompt/services/prompt-config-loader.service.ts` (component-provided) — the load
  cluster: `loadConfigData`, `loadSchemaDataFromAPI`, `loadPromptData`,
  `refreshPromptValues`. Route store reads through it so the component stops touching the
  store directly.
- Keep `initForm` (reactive-form construction) and `onSubmit` on the component.

**Steps:** move one per `tsc`; proxy template-bound members; full gate + `prompt-smoke`
(or compile-only if unreachable); commit `refactor(prompt): extract config-prompt SQL
preview and loaders`.

---

## Phase 5 — analyses: `edit-analyses.component.ts` (4,674 → < 1,000)

**The hardest file in the repo.** 225 members, NgRx (20 select/dispatch), a 1,923-line
template. Do it **last**, after Phases 1 and 3 have shrunk its analyses collaborators,
and **only behind a green `analyses-smoke`**. Extract one collaborator at a time and run
the smoke spec after each — never batch its moves.

**Member groups** (largest per group):
- **Store wiring:** `initializeStoreSelectors` (65), `loadAnalysis` (69),
  `loadAllVisuals` (129), `loadDatasetData` (98), `refreshFields` (64).
- **Visual CRUD + save:** `handleSaveDialogClose` (173), `addVisual` (68),
  `pruneSelection` (112), `scrollToVisual` (65).
- **Field/role selection:** `onFieldClick` (71), `applyRoleSelection` (86),
  `pruneSelection` (112).
- **Chart data:** `transformSingleVisualChartData` (56).
- **Layout:** `onResize` (57), `scrollToVisual` (65).

**Extraction order** (each its own commit, each behind `tsc` + `analyses-smoke`):
1. `analyses/services/analysis-store-facade.service.ts` — the NgRx selector/dispatch
   wiring (`initializeStoreSelectors`, `loadAnalysis`, `loadAllVisuals`,
   `loadDatasetData`, `refreshFields`). The component stops touching the store directly.
   ~425 lines out, the single biggest reduction.
2. `analyses/helpers/visual-selection.ts` **(already exists)** — extend it with
   `onFieldClick`, `applyRoleSelection`, `pruneSelection` (field/role selection + pruning)
   if they are pure over (fields, selection); otherwise a component-provided
   `visual-selection.service.ts`. ~270 lines.
3. `analyses/helpers/visual-layout.helper.ts` — pure geometry: `onResize` math,
   `scrollToVisual` target computation. ~120 lines.
4. `analyses/services/visual-save.service.ts` (component-provided) —
   `handleSaveDialogClose` and the save pipeline. ~175 lines.
5. `transformSingleVisualChartData` routes through the existing
   `chart-data-transformer.service` — move only the glue.

**Steps for each:** grep the 1,923-line template for every member before moving; move
one per `tsc`; proxy template-bound members; member-set + decorator audit after each;
full gate + `analyses-smoke` after **each** extraction (not just at the end — this file
is too large to bisect a regression across four moves). Commit per extraction:
`refactor(analyses): extract edit-analyses <concern>`.

---

## Phase 6 — documentation (session-end protocol)

- [ ] Prepend a dated Progress entry to `docs/context/modules/{analyses,dashboard,prompt}.md`
  with before/after line counts and the files created.
- [ ] Update each module's Status + Last-updated line and its `docs/context/INDEX.md` row.
  `date +%Y-%m-%d`; never guess.
- [ ] Add a dated `docs/context/SESSION_LOG.md` entry.
- [ ] Record: query-builder deferred (routing-unreachable in harness) and any data table
  left large, and any latent bug found (as the dataset work recorded the stranded
  `@HostListener`).
- [ ] Commit `docs: record the remaining component decomposition`.

---

## Ordering rationale

filter-dialog (Phase 1) and view-dashboard (Phase 2) first — smallest, no NgRx, each
clears the target with a single pure-helper extraction. visual-config-sidebar (Phase 3)
next: no NgRx but a huge template, so it proves the proxy discipline at scale before the
hardest file. config-prompt (Phase 4) introduces the store-facade pattern on a
moderate-size file. edit-analyses (Phase 5) last and alone, because it is 4,674 lines of
NgRx-connected component and every earlier phase makes its collaborators smaller and the
pattern more practised. Docs (Phase 6) close per protocol.

## Risk notes

- **edit-analyses** is the single highest-risk item — NgRx, 225 members, 1,923-line
  template. One collaborator per commit, smoke after each, never batched.
- **visual-config-sidebar's 4,364-line template** means almost every member is
  template-bound — the html grep before each move is not optional, and proxies will be
  numerous.
- **Paint-gate:** do not touch `view-dashboard.paintVisual`'s gate logic; a regression
  there re-introduces the "No data" bug the paint-gate fix closed.
- **`saveDisabledHint` (filter-dialog, 101)** and **`localizeDropdownOptions`
  (visual-config-sidebar, 117)** are large but pure — good first moves to prove each
  file's extraction before touching stateful members.
- If `prompt-smoke` proves unreachable like query-builder, `config-prompt` proceeds on
  compile-gates + fidelity audits only; note it in the commit body.
