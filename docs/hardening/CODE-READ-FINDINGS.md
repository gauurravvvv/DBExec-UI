# Code-read findings — Dataset · Analysis · Dashboard · RLS

> Evidence behind `PLAN-FOUR-MODULES-HARDENING.md`. Produced by four
> parallel code-read passes over the current BE + FE + DB on
> 2026-06-25. Every line item is `file:line — finding — severity`.
> "Severity" uses P0 (security or data exposure), P1 (logic bug or
> contract drift), P2 (perf / DX / scaling), P3 (housekeeping).

---

## Dataset

### Backend

- **Universal P0**: zero meaningful unit / integration / e2e tests
  exist for the dataset module today. Skeleton specs only.
- `src/modules/datasets/controllers/addDataset.ts:100` (also
  `updateDataset.ts:112`, `validateDatasetField.ts:98`)
  — column names extracted from result set are interpolated into
  `pg_typeof("${col}")::text` without identifier escaping. **P1**
  (low risk for trusted datasources; defensible regardless).
- `src/modules/datasets/controllers/listDataset.ts:53–58` (same
  pattern in `addDataset.ts`, `updateDataset.ts`,
  `validateDatasetField.ts`) — "load all datasources for the org,
  then `.find()` in memory" repeated in 4 places. **P2**.
- `src/modules/datasets/controllers/addDataset.ts:178` — BE response
  wraps in `{ savedDataset }`, FE service consumes `res.data` as the
  whole object (`dataset.service.ts:152`). Contract drift. **P2**.
- `pg_typeof()` is Postgres-only — MySQL / Oracle silently fail with
  unknown column types. **P2**.

### Database

- `src/shared/db/index.ts` — `synchronize: true`, no migrations. **P2**
  (works for now, will hurt at scale).
- `src/shared/db/shared_entity/dataset.entity.ts:18–93` — clean schema
  with proper soft-delete (`@DeleteDateColumn`, `@VersionColumn`).
  Indices on `(organisationId, datasourceId)` and
  `(datasourceId, status)`. Audit columns deselected — **good**.
- `src/shared/db/shared_entity/datasetField.entity.ts:14–83` —
  `customLogic` typed as `text` (avoids varchar truncation). Cascade on
  analysis FK is hard-delete by design.

### Frontend

- `src/app/modules/dataset/services/dataset.service.ts:27–290` —
  signals typed `any[]`, `any`. Every HTTP method
  destructures `res: any`. **P1**.
- `add-dataset.component.ts` (~1000 lines) — template-driven forms;
  inconsistent with reactive-forms pattern used elsewhere. **P2**.
- No live preview when editing custom-field formula. **P2**.

### Things that look genuinely good

- Audit logging on every CUD.
- Soft-delete cascade helper (`cascadeSoftDelete`) covers the full
  graph.
- Cross-org isolation: every dataset lookup filters on `organisationId`,
  source of truth is JWT.
- Custom-field topological sort: dependencies evaluate in order,
  formula errors degrade to `null` per row instead of crashing.
- Connection lifecycle: every controller that opens a datasource
  connection destroys it in `finally`.

---

## Analysis & Visual Builder

### Backend

- `src/shared/db/shared_entity/visual_config.entity.ts:49` —
  `config: any` (jsonb). No schema validation on save. **P1**.
- `src/shared/db/shared_entity/analysis_filter.entity.ts:41–49` —
  `config: any` (jsonb), plus a `categoryValues` column with TODO
  comment that nothing writes to. **P1**.
- `src/modules/analyses/controllers/runAnalysisQuery.ts:138–142`
  — RLS integration is correctly wired through `resolveRlsFilters`.
  **Good**.
- `runAnalysisQuery.ts:146–148` — no schema validation of the filter
  payload received from FE. A malformed filter crashes the query
  builder downstream. **P1**.
- `runAnalysisQuery.ts` — no audit on analysis-run. **P3**
  (compliance ask, not security).
- `src/modules/analysis-filters/controllers/addAnalysisFilter.ts:79–88`
  — `validateFilterDefaults()` is best-effort post-save; warns about
  stale defaults but doesn't block. **OK**.
- `src/modules/visuals/visuals.routes.ts:1–41` — only one GET route;
  no create/update/delete endpoints for visuals exposed. They live
  inside the analysis save path. **OK**.
- No parameters table or CRUD; the analysis_parameter gap blocks
  snapshot-stable dashboards. **P0** (gap-list addition pulled in).

### Database

- Soft-delete inconsistency: `Analyses` and `AnalysisFilter` have
  `@DeleteDateColumn`; `Visual` and `VisualConfig` do not. **P2**.
- Denormalised `org/datasource/dataset` names on `AnalysisFilter`
  (`analysis_filter.entity.ts:85–95`) — risk of drift after rename. **P2**.

### Frontend

- `src/app/modules/analyses/constants/charts.constants.ts` —
  **86** chart types defined, not 73 as docs claim. **P2**.
- `src/app/modules/analyses/components/visual-config-sidebar/*` —
  procedural per-chart `*ngIf`s instead of declarative VisualSpec.
  This is the substrate for the existing
  `plans/harmonic-strolling-peach.md` property-verification plan. **P1**.
- `src/app/shared/helpers/echarts-option-builder.ts:61–66` —
  emphasis builder explicitly stamps `scale` as boolean to defuse
  merge-leak. **Good** (regression test would be ideal).
- `src/app/modules/analyses/components/edit-analyses/edit-analyses.component.ts`
  (2474 lines) — uses signals + NgRx; detects stale column refs at
  1274–1275 when dataset columns disappear. Defensive. **Good**.

### Seams

- `AppliedFilter` shape consistent BE↔FE.
- VisualConfig.config — both sides `any`. **P1**.

### Tests

- Three skeleton component specs only.
- No FE service tests.
- No BE unit/integration tests for analysis controllers.

### Things that look genuinely good

- RLS enforcement on `runAnalysisQuery` is correct and non-bypassable.
- Filter-engine column-name validation
  (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) plus parameterised values — strong.
- Stale-default detection on analysis-filter save.
- Custom-field topological dependency ordering reused from Dataset.

---

## Dashboard

### Backend

- **P0 (production hardening) — no statement timeout enforced on
  dashboard query execution** (`runDashboardQuery.ts:200`). A
  malicious or pathological SQL hangs the request indefinitely. **P0**.
- `src/modules/dashboards/controllers/getDistinctDashboardFieldValues.ts:195`
  — for custom-field distinct values, loads the full result set,
  enriches in memory, then paginates. Memory-bomb on large datasets. **P1**.
- `src/modules/dashboards/controllers/publishDashboard.ts:88–93`
  — wraps publish in a transaction, reloads target inside for the
  existing-mode safety check. **Good**.
- `publishDashboard.ts:140–144` — calls `snapshotAnalysisIntoDashboard`
  for atomic wipe + write. Idempotent. **Good**.
- `publishDashboard.ts:101–108` — existing-mode publish *wipes
  visuals*. Renaming a dashboard triggers republish, which
  destructively rewrites the snapshot. UX trap. **P1**.
- `snapshotAnalysisIntoDashboard.helper.ts:165–208` — solid
  remapping of field IDs across the snapshot boundary, including
  pruning relations whose endpoints didn't survive.
- `runDashboardQuery.ts:177–195` — RLS applied at query time, not
  at publish time. Intentional per design. **Good**.
- `renderDashboard.ts:54–62` — no logging when `visualConfig` comes
  back null; silent missing relation. **P2**.

### Database

- Soft-delete cascade via FK `ON DELETE CASCADE` on every dashboard
  child (`dashboardVisual.entity.ts:34` etc.). **Good**.
- Confusing entity-level `cascade: false` on Dashboard relations
  (`dashboard.entity.ts:128–135`) while DB-level cascades exist.
  Misleading. **P3**.
- Dead columns `datasetSql` and `datasetName` on Dashboard kept as
  empty strings for back-compat (`dashboard.entity.ts:82–99`). **P3**.
- `DashboardVisualConfig` over-indexed: 3 overlapping indices. **P3**.

### Frontend

- `src/app/modules/dashboards/services/dashboard.service.ts:1–257`
  — signal split between `_loading`, `_saving`, `_rendering` is the
  right call. **Good**.
- `view-dashboard.component.ts:379–382` — missing visual fields
  produce blank chart with no banner. **P1**.
- `view-dashboard.component.ts` — `dashboard: any`, `rawData: any`,
  `filters: any`. **P1**.
- Race-safe rendering via `currentQueryId` monotonic counter
  (`view-dashboard.component.ts:106`). **Good**.
- No explicit mobile layout (auto-stack). **P2**.

### Seams

- Snapshot payload contract stable, but every field on it typed
  `any`. **P1**.
- `visualConfig.config` typed `any` on both sides — same root issue
  as Analysis Track. **P1**.
- Source-analysis deletion creates "zombie dashboard" if loaded
  card opens after deletion. **P2**.

### Tests

- One Playwright spec (`login-dashboard.spec.ts`) covering login →
  navigate to dashboard. **No CRUD / publish / render / filter
  tests.**

### Things that look genuinely good

- Snapshot model transactional and atomic.
- Hybrid live-dataset SQL inside a frozen-layout snapshot is a clean
  design choice.
- Source-analysis innerJoin guards on list endpoint prevent zombies
  from appearing.
- Filter merge at render time excludes disabled filters at DB layer.
- Audit logging on publish includes snapshot counts.

---

## RLS & Column Security

### Backend (critical layer)

- **P0** — `src/shared/services/rlsResolver.service.ts:46` —
  `if (allRules.length === 0) return [];` Allow-by-default. A user
  with zero rules on a dataset sees every row. **Data exposure.**
- **P1** — `rlsResolver.service.ts:82` — operator hard-mapped:
  `entry.operator === 'NOT_IN' ? 'DOES_NOT_EQUAL' : 'EQUALS'`. A
  BETWEEN rule silently becomes an EQUALS filter. Numeric / date
  ranges not enforced. **Logic bypass.**
- **P2** — `modules/queries/controllers/executeQuery.ts:50` and
  `modules/datasources/controllers/runQuery.ts:29` — ad-hoc query
  endpoints execute raw SQL **without** invoking `resolveRlsFilters`.
  Anyone with the query-execute permission bypasses RLS. Privilege
  escalation (admin scope required, but real).
- **P2** — `rlsResolver.service.ts:25–28` — `UserGroupMapping.find()`
  re-runs per query, no caching.
- **P3** — `rlsResolver.service.ts:54 vs 80` — column name
  lower-cased for grouping but original case passed downstream.
  Silent rule loss on case-sensitive databases.
- **P3** — only rule edits are audited; rule *application* (which
  rules fired for which query) is not.

### Filter compiler (the safeguard layer)

- `shared/services/filterEngine.service.ts:41–48` — column-name
  validation via `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. **Good**.
- Filter values parameterised throughout. No string interpolation.
  **Good**.

### Database

- `src/shared/db/shared_entity/rls_rule.entity.ts` — indices on
  `(datasetId)`, `(organisationId, datasetId)`, `(scope, scopeId)`.
  Soft-delete via `@DeleteDateColumn`. JSONB `values`. Operator
  enum-validated at schema layer.
- No column_security entity. **P0** (gap-list addition pulled in).

### Frontend

- `src/app/modules/rls-rules/components/add-rls-rule.component.ts:71–76`
  — operator dropdown matches BE enum exactly. **Good**.
- Form validation via shared Zod schemas. **Good**.
- No "test-as-user" UI. **P2** (gap addition pulled in).

### Tests

- Zero tests for `rlsResolver`.
- Zero tests for compiled-SQL snapshots.
- No Playwright leak-hunt suite.

### Things that look genuinely good

- Parameterised SQL throughout.
- Cross-org isolation at every lookup.
- Operator enum strictly validated at schema gate.
- Consistent integration on analysis + dashboard query paths.

---

## Universal observations (apply to all four modules)

1. **No real tests anywhere.** Every track must build its own
   regression suite as part of the work.
2. **`any` typing** on FE services across the board. Every track
   exports the Zod-inferred type from the validators package and
   consumes it on FE.
3. **No statement timeout** on shared-DB pools used for user queries.
   This is the single fastest production hardening win.
4. **`config` JSONB columns** (visual, filter, dashboard-filter,
   dashboard-visual-config) are untyped. They're the substrate of
   "set a property → save → reload → property gone" bugs.
5. **Soft-delete cascade** isn't centrally registered. Each module
   has its own cascade helper. The plan lifts the registry from
   BE-implementation § 0.6 to harmonise.
6. **Audit-log coverage** is good on edits but absent on reads. For
   compliance-conscious customers this is a gap.
7. **Feature flags** exist as a planned construct but no service
   yet. The plan ships one in Week 0.

---

## How to use this document

Every PR opened against the four modules in this hardening phase
should cite at least one finding ID from this file in its description
(e.g. "closes RLS-P0-1, DSH-P2-1"). The reviewer's first check is
that the cited finding is the actual scope of the diff.

When a finding is closed, mark it here with a strike-through and the
PR link. When the file is empty (or only "good"-list items remain),
the hardening phase is complete.
