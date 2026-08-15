# prompt
> Update the Progress log on every change.
> Code path: `src/app/modules/prompt` · Status: 🟢 · Last updated: 2026-08-15

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
### 2026-08-15 — Phase 1: appearance removed; config-prompt rebuilt as a modular 4-step stepper
- **Appearance subsystem deleted (FE):** removed `prompt-appearance-form`, the `prompt-appearance-fields` registry, and the mirrored `promptAppearance` validator; dropped `APPEARANCE_SUFFIX` from the PROMPT api constant and the `updateAppearance`/`getAppearance`/`getAppearence` service methods; removed the `PROMPT_MODULE.APPEARANCE`/`CUSTOMISE_*` i18n keys across all 10 locales. (The `QUERY_BUILDER.APPEARANCE` i18n block is the QB-runtime namespace — deliberately left; out of scope.)
- **config-prompt rebuilt** from the 1768-line monolith into a thin shell (`config-prompt.component`) + a signal-based `prompt-config.service.ts` + four small step children under `config-prompt/steps/`: `cp-source-step` (schema/table/alias from DatasourceService), `cp-joins-step` (visual `prompt-join-builder` + Advanced Monaco raw-SQL escape), `cp-column-filter-step` (select expr + filter column/operator from the `filter_operator` catalog + Advanced Monaco), `cp-values-step` (hosts `prompt-value-source` + a review summary). Shared `cp-step.scss`. Save gated valid+dirty → `POST /prompts/:id/config`. No file over ~400 lines. The NgRx `store/` slice is retained (shared schema cache used by dataset/analyses) but the new stepper is signals-only.
- **Value source unified to include upload:** `prompt-value-source` gains an `upload` kind (dropzone + column map + parsed-sample preview + re-upload justification dialog) wired to `PromptService.uploadValues` (multipart) → BE `/prompts/:id/values/upload`. Mirrored `promptValuesUpload.ts` validator. New `PROMPT_MODULE.VS.*` + stepper i18n keys ×10 locales.
- Gates: `tsc --noEmit` 0 · `ngc -p tsconfig.app.json --noEmit` 0 · `ng build --configuration production` success. Branch `feature/prompt-builder`, not pushed.

### 2026-08-06 — Step 3 (Column & filter) simplified: no free-text SQL
- Replaced step 3's free-text `promptWhere` box + inline `promptJoin` input + autocomplete-suggestions dropdown with three stacked `app-custom-dropdown`s: output **Columns** (multiselect) → **Filter column** (`filterColumn`, options = `reachableColumns` from the join builder) → **Operator** (`operator`, options = `operatorOptions` from `filter_operator` catalog) → read-only bordered **SQL preview** (`.sql-preview`). New standalone `[ngModel]` state `filterColumn`/`operator` (+ `onFilterColumnChange`/`onOperatorChange`), `onSubmit` sends `filterExpr=selectExpr=filterColumn`+`operator`+`promptWhere:''`, `loadConfigData` seeds them from `config.filter_expr||select_expr`+`config.operator`. `multiTableNeedsJoin` now gates only on `joinEdges.length`. `generateSqlPreview()` rebuilt from the structured filter + joinEdges. Dead autocomplete helpers left declared-but-unreferenced (harmless). New scss `.step-help` + `.sql-preview*` (token-driven; replaced dead `.sql-preview-header/-container/-code`); `.wizard-step` now `flex column; gap:--space-7`. New i18n ×10: `FILTER_COLUMN`,`SELECT_FILTER_COLUMN`,`FILTER_COLUMN_HINT`,`OPERATOR`,`SELECT_OPERATOR`. Verified `tsc`+`ngc`+prod-build 0; live screenshots `simp-step1-source.png`/`simp-step2-joins.png`/`simp-step3-column-filter.png`. version_261, awaiting push.

### 2026-08-06 — S6: config-prompt rebuilt as a guided two-pane STEPPER (supersedes S3 cards)
- User rejected the flat/card layout as still too cluttered; picked the guided two-pane mockup. config-prompt is now a **5-step wizard mirroring the Add Alert stepper idiom exactly**: `steps[]` (key/titleKey/icon), `currentStep`/`lastStep`, the `.steps-container`/`.step`/`.step-dot`/`.step-line` markup + scss copied from add-alert, `isStepValid(step)` per-step gate, `nextStep`/`previousStep`/`onStepClick` (back free; forward only if every prior step valid), Next disabled on `!isStepValid(currentStep)`, Save only on the last step.
- **Steps:** 1 Source (schema+tables, lazy S1) · 2 Joins (`prompt-join-builder`, S2) · 3 Column & filter (columns+WHERE+SQL preview) · 4 Values (chips/SQL/upload + `prompt-value-source`) · 5 Review & Appearance (`prompt-appearance-form`). Each `<section class="wizard-step" *ngIf="currentStep === N">`; the old accordion cards are gone (0 accordions left).
- **Save gating + patching:** `canSave = form.valid && isFormDirty && !multiTableNeedsJoin`. On config load, patch all steps then `markAsPristine()` → Save starts DISABLED until the admin changes something; `onSubmit` now guards on `canSave` (was `form.valid` only) + a `saving()` double-fire guard.
- **Validation FE↔BE:** per-step FE gates (schema+table on 0; join-complete on 1 — structured `joinEdges` OR free-text; column on 2; values-by-type on 3; whole-form on 4). BE `configurePrompt.validation` EXTENDED: a multi-table prompt is valid with EITHER `promptJoin` OR structured `joinEdges`/`requiredJoins` (was rejecting structured-join configs for missing free-text join). 12 step/hint i18n keys ×10 locales.
- **Verified LIVE** (Docker, org UltraIntake): 5 dots render "Source/Joins/Column & filter/Values/Review"; Next disabled on step 0 until schema+table picked (gating proven), enabled after; step 1→2 shows completed(green ✓)/active(blue) states; Joins step shows the builder + Add join. tsc/ngc/prod-build all 0. Screenshots `s6-step*.png`. Spec `docs/superpowers/specs/2026-08-05-prompt-config-and-qb-ux-design.md` (§S6).

### 2026-08-06 — S2+S3: structured multi-hop join builder + config-prompt as collapsible cards
- **S2 — `prompt-join-builder` (NEW):** structured, point-and-click, MULTI-HOP join builder that supersedes the single-hop `prompt-join-picker`. Two add modes — FK-suggested (from `listForeignKeys`, edges originating on any in-scope table) + Manual (pick source alias.col = target schema/table/col + join type) for FK-less DBs. Multi-hop via `dependsOnKey` (a hop off a joined table depends on that join). Emits the compiler's exact `join_edges` shape (`{joinKey,joinType,targetSchema,targetTable,targetAlias,onClause,dependsOnKey,cardinality,sequence}`) + `required_joins` + reachable-columns. Decision: NOT extracted from QB's `qb-join-designer` (that's 76 lines coupled to a server-persisted `queryBuilderId` — unfit); prompt-local component emitting the shared contract instead (zero QB risk). Wired into config-prompt replacing the picker; `configPrompt` save now sends the full chain; `initialJoinEdges` seeds the builder on edit. i18n: 18 `PROMPT_MODULE.*` join keys across all 10 locales.
- **S3 — config-prompt = collapsible cards:** the 5 stacked flat sections (Query configurations / Values chips / Joins / Appearance / Value-source) are each wrapped in `app-custom-accordion` (Query-config expanded by default, rest collapsed) — kills the "too much control noise" (#2). No form-binding changes; content projected so reactive-form context is preserved. Verified tsc+ngc green.
- Spec: `docs/superpowers/specs/2026-08-05-prompt-config-and-qb-ux-design.md`. (S4 QB styling polish + S5 datasource dropdowns done in parallel — see query-builder.md / query-runner.md.)

### 2026-08-05 — S1: config-prompt schema→table→column is now LAZY (fixes "no API on schema select")
- **Root cause:** the BE `GET /datasources/:id/schemas` was rebuilt to return schema NAMES only (`[{schema_name, tables:[]}]`); tables + columns have their own endpoints. `config-prompt` still read the old nested `staticSchemaData[].tables[].columns` — always empty now → selecting a schema showed no tables/columns and fired no API.
- **Fix:** on schema-select `config-prompt` now calls `DatasourceService.listSchemaTables(ds, schema)`; on table-select it calls `listTableColumns(ds, schema, table)` per selected table. Added per-key caches (`tablesCacheBySchema`, `columnsCacheByTable`), client-generated table aliases (name→`mig1`…), and inline `Loading tables…/columns…` hints (i18n `PROMPT_MODULE.LOADING_TABLES/LOADING_COLUMNS`, all 10 locales). Removed the dead `updateTableColumns`/`updateAvailableColumns` (nested-shape readers); saved-config backfill now fetches the schema's tables + each saved table's columns before patching, and merges the saved `{tableName,alias}` into the options so the persisted selection shows.
- **Second bug fixed:** the columns endpoint returns the array DIRECTLY in `data` (`data:[{column_name,…}]`), NOT `data.columns` — the transform now accepts both, else columns were silently empty.
- **Verified LIVE** (Docker :8755/:9058, org UltraIntake, real remote DB "Dev 2 Ireland"): select schema `public` → `GET /schemas/public/tables` fires, 3 tables populate; select `migrations` → `GET /schemas/public/tables/migrations/columns` fires, "Loading columns…" shows, columns load. Screenshots `s1-0*.png`. (Left a throwaway "S1 Test Prompt" in that org — delete from UI.) Part of the config-prompt rework: `docs/superpowers/specs/2026-08-05-prompt-config-and-qb-ux-design.md` (S2–S5 pending: shared join builder, card restructure, QB polish, datasource dropdowns).

### 2026-07-31 — Prompt module now owns ALL prompt config (appearance/operators/values/joins)
Architectural rule (user): every prompt config lives here; the Query Builder only picks + arranges prompts and reads their config.
- **New components:** `prompt-appearance-form` (relocated from qb-appearance-form — data-driven General/per-type/date/Operator accordion, mirrored `promptAppearance` Zod) + `prompt-value-source` (relocated from qb-value-source — free/static/lookup_query/distinct_column) + `prompt-join-picker` (NEW — no-SQL FK join: pick related table→column, derives joinKey+onClause from `DatasourceService.listForeignKeys`, emits an edge descriptor). Helper `prompt-appearance-fields.ts` moved here.
- **config-prompt** now shows inline sections: Related table (FK join picker), Appearance & Operators (`prompt-appearance-form`, operators from `ReferenceDataService.getOptions('filter_operator')`), Values (`prompt-value-source`). The 9 legacy `*-config-dialog` components + the "Customise" dialog flow are DELETED. On save it persists v2 fields (filterExpr/selectExpr/requiredJoins/joinEdges) alongside the config.
- **PromptService** gained `getValueSource`/`saveValueSource`/`previewValues`; **fixed** the `appearence:`→`appearance:` body-key bug (BE reads `req.body.appearance`) so appearance actually persists.
- **list-prompt** migrated from raw p-table+bulk-select → `app-custom-table` + `UsServerListAdapter` (infinite scroll, row actions, datasource filter kept), matching every other module.
- Gates: tsc/ngc/prod-build green.

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
