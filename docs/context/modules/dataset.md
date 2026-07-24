# dataset
> Update the Progress log on every change.
> Code path: `src/app/modules/dataset` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The semantic layer. A dataset = a saved SQL query against a datasource + typed field metadata + calculated fields + `{{name}}` query params. It's the source for analyses/dashboards/RLS/alerts.
- Key files:
  - `components/add-dataset` + `edit-dataset` — the editor: **Monaco** SQL editor (`MonacoLoaderService` + `MonacoIntelliSenseService`, lazy schema tree pre-warm), result grid (p-table, not AG Grid), diff-before-save (`preview-columns`), save-and-run, column profiling + CSV/JSON export.
  - `components/calculated-fields-dialog` — **Engine 1** UI (SQL `[bracket]` compiler; no function palette; entity `CalculatedField`).
  - `components/add-custom-field-dialog` — **Engine 2** UI (JS `{brace}` FormulaCompiler; Monaco `formulaLang`; `constants/functions-reference.ts` = ~137-function QuickSight-style palette; writes `DatasetField.customLogic`).
  - `components/dataset-params-panel` + `helpers/param-tokens.helper.ts` — `{{name}}` param tokenizer (ignores string-literals/comments; mirrored BE `datasetParams.ts`), static + query-based dropdown options.
  - `components/edit-dataset-fields-dialog` — rich column metadata editor (description/role/defaultAggregation/formatHint/isVisible/typeOverride).
  - `services/dataset.service.ts` (HTTP+signals), `calculated-fields.service.ts`, plus SQL helper services (formatter/linter/validator/scope-tracker) and `config/sql-dialects/` (postgres/mysql/mariadb/mssql/oracle/snowflake).
- Depends on: **datasource** (schema introspection + runQuery). `DATASET` api/routes constants. Mirrored Zod `validators/datasets.ts` + `calculatedFields.ts` (byte-identical FE↔BE).
- Depended on by: **analyses** (dataset picker + fields), **dashboard**, **rls-rules** (rules bind to a dataset), **alerts**, **migration** (export/import + dependency inclusion).
- How it works: List (`app-custom-table`, Datasource column + optional filter). Add/Edit: pick datasource → write SQL (params tokenized) → run preview → map/type fields → add calc fields (either engine) → Save (versioned on BE). View: freshness, field metadata, delete-dependency guard via lineage.
- Decisions: **TWO calc-field engines, do not confuse them** (see [calc-field-engines memory]): Engine 1 = SQL `[bracket]`, pushed DOWN to warehouse as SQL, AST-compiled + whitelisted. Engine 2 = JS `{brace}`, runs per-row in Node AFTER the query (enrichment). `concat({a},{b})` uses Engine 2. Result section deliberately uses p-table (us-data-grid reverted). See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints:
  - **Save is VERSIONED** — each save clones into a new-version row (new id, same `lineageId`) and returns the new id; the analysis-save-persistence "bug" was a stale-id test artifact, not data loss.
  - **Field metadata is mostly DEAD/UI-only** (aggregation-field-audit): `role`/`defaultAggregation`/`formatHint`/`isVisible`/`typeOverride` are stored+returned but the BE has ~zero consumers — the editor writes columns the backend never reads. Don't assume `isVisible` hides columns or `defaultAggregation` auto-picks.
  - Engine 2 `add-custom-field-dialog` naming is confusing: formula stored in `customField.columnToUse`, display name in `columnToView`.
  - Save `/datasets/:id/fields` needs `datasetId` in the BODY too (not just URL) or 400.
  - Engine 2 enrichment re-parses the formula per-row (O(rows × parse)); length cap 4000 + max-paren-depth 32 bound the worst case (DoS fix).

## 2. Goals
- Objective: Author a trustworthy, typed, parameterised dataset with derived fields that downstream BI can consume safely.
- Current focus: — none active.
- Next up: wire the dead field-metadata engine to the BE query builder (role→dimension/measure auto-split, isVisible column hiding, formatHint on data labels) — the biggest open parity gap.
- Out of scope: chart authoring (analyses), raw ad-hoc SQL runs (query-runner).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full dataset editor (Monaco + IntelliSense + dialect configs + diff-before-save + save-and-run + profiling + export). **Both calc engines shipped + hardened** to version_261: Engine 1 SQL `[bracket]` AST compiler (`- -a`→`-(-"a")` fix), Engine 2 JS `{brace}` FormulaCompiler (~137 fns) with save-path formula validation + deep-nesting DoS guard + 4000-char cap (BE 09e88f9, FE ce697cf). add-custom-field-dialog fixes: validate-state race + reserved-name Save bypass + Monaco leak (a3e5afae). Rich column-metadata editor + `{{name}}` params + view trust surface (dataset-analyses-completion FE 396442b1 / BE 10242b0). Migration export/import on list rows (c1bf1cc1). Asset-share action on list + view (1900064c). Reference-data DB-driven dropdowns (3d27b282). live-verified end-to-end (5-table JOIN, 5000 rows, 8 calc fields).
- In progress / Known issues: field-metadata columns are UI-only/dead (see gotcha); Engine-2 per-row re-parse is the known perf hotspot; COUNT-DISTINCT alias collision + no numeric-type guard on SUM(text) are open BE aggregation bugs.
- Next: wire dead field metadata to BE (next-up above).
- Files touched: docs/context/modules/dataset.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/dataset`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/dataset.md
