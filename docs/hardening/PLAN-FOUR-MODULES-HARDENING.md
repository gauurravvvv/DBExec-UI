# Hardening plan — Dataset · Analysis · Dashboard · RLS

> Make the four core modules end-to-end perfect (BE ↔ FE ↔ DB) before
> any new feature work. Evidence-driven: every "do this" below is
> traceable to a finding in `docs/hardening/CODE-READ-FINDINGS.md`
> (the consolidated output of the four code-read agents).
>
> Last updated: 2026-06-25

## TL;DR

- **5 weeks**, 4 parallel tracks. One engineer (or session) per track
  is the unit of capacity assumed.
- **Week 0 ("Day 1–2") is non-negotiable and serial**: the three real
  defects we already know about, plus the universal foundation
  (shared types, test harness, error envelope). Everything else
  blocks on this.
- Weeks 1–4 run four parallel module tracks. Each track ends with a
  green CI suite — no module is "done" until its bar is met.
- Week 5 is the convergence: cross-module e2e, perf, security review,
  documentation, ship.
- **Quality bar** (per your decision): functional correctness +
  production hardening + perf/UX polish + tests & security depth.
- **Scope**: pull in deep-research/gap features when they remove
  a real defect or close a real gap; defer pure-greenfield additions
  to the next phase (see § 8 "Pulled-in gap features").
- **Status:** plan committed, ready to start.

## Process for each track

Every track follows the same loop. No "vibes-based fixing".

1. **Open** the findings doc, pick the next item.
2. **Reproduce** with a failing test (unit, integration, or e2e — fits
   the layer).
3. **Fix**.
4. **Confirm** the test goes green.
5. **Add a regression case** if the bug suggests a class.
6. **Audit**: does the fix log? Does it emit a webhook event? Does it
   honour the cascade registry?
7. **PR**, link the finding ID (`RLS-P0-1` etc.).

Reviewer rejects any PR that doesn't show the failing-first test in
the diff. This is how we avoid silent regressions.

---

## Week 0 (Day 1–2) — Stop the bleeding & lay the foundation

These items are **serial** and **block everything else**. No track
starts until Week 0 closes.

### 0.1 · The three real defects (fix today)

These were surfaced by the code-reads and are not abstract.

| ID | File:line | Defect | Fix |
|---|---|---|---|
| **RLS-P0-1** | `shared/services/rlsResolver.service.ts:46` | If a user has zero RLS rules on a dataset, `resolveRlsFilters` returns `[]` → query runs unrestricted → user sees every row. Allow-by-default. | Replace with deny-by-default *opt-in per dataset*. New column `dataset.rls_default_policy` (`'allow' \| 'deny'`, default `'allow'` to preserve existing behaviour); after backfill, switch enforcement so that `deny` + zero rules returns `WHERE FALSE`. Log the decision in audit. |
| **RLS-P1-1** | `shared/services/rlsResolver.service.ts:82` | `BETWEEN` rules get hard-mapped to `EQUALS` filter, silently dropping the numeric range. | Preserve the source operator through `AppliedFilter`. Add unit tests with all four operators × {string, numeric, date} value shapes. |
| **RLS-P2-1** | `modules/queries/controllers/executeQuery.ts:50` & `modules/datasources/controllers/runQuery.ts:29` | Ad-hoc query endpoints execute raw SQL **without** invoking `resolveRlsFilters`. Anyone with the query-execute permission can `SELECT * FROM <sensitive_table>` and bypass RLS. | Two changes, both required: (a) gate these endpoints behind a new permission `datasource.rawSql` separate from `analysis.run`; (b) when the endpoint is used to populate prompt/filter values for a dataset, route through `resolveRlsFilters` exactly like the analysis path. |

Each fix lands behind a feature flag (`rlsDenyByDefault`,
`rlsOperatorFix`, `rawSqlPermissionEnforced`) so we can dark-launch
per org if a regression surfaces. Cleanup PR removes the flags at the
end of Week 4.

### 0.2 · Foundation that the four tracks all consume

These are **prerequisites** for the parallel tracks. Each is small
and ships standalone.

#### 0.2.1 Shared response envelope

- Standardise on `{ status, code, message, data, errors[] }` (already
  the shape in `sendResponse` — extend it to carry the multi-error
  array described in the BE-implementation doc § 0.7).
- One PR: extend `sendResponse`; update `zodValidate` to push Zod
  issues into `errors[]`; FE error-display helper reads from
  `errors[]` first, falls back to `message`.

#### 0.2.2 Shared types via Zod

- Every Zod schema in `src/shared/validators/*.ts` exports both the
  schema and the inferred TypeScript type:
  ```ts
  export const datasetCreateSchema = z.object({ ... });
  export type DatasetCreateBody = z.infer<typeof datasetCreateSchema>;
  ```
- FE imports the types from the **same file** (the validators package
  is mirrored to FE today — already in place). This single change
  kills the "BE adds a field, FE finds out at runtime" failure mode
  flagged in every code-read.
- For each of the four modules, the track's first PR replaces
  `any` on its service layer with the generated types. Compile errors
  surface every implicit contract drift.

#### 0.2.3 Test harness

We have skeleton specs everywhere and almost no real tests. Before any
fix lands, the harness needs to work:

- **BE**: Jest already configured. Add a single `tests/setup.ts` that:
  - spins a Postgres test container (`testcontainers`) per worker;
  - applies migrations OR runs `synchronize: true` against the empty DB;
  - exposes `withOrgConn(fn)` so a test gets a transaction-scoped
    shared-DB connection and a rollback at teardown.
  This gives integration tests with real SQL and zero mock SQL strings.
- **FE**: Angular tests already use Karma; raise the bar so a test must
  assert something (no more "should create" stubs). A trivial lint
  rule (`no-empty-it`) rejects empty `it()` blocks.
- **e2e**: Playwright is already wired. Add a dispatcher entry per
  module so a single command runs the module's regression set:
  `npm run e2e:dataset`, `:analysis`, `:dashboard`, `:rls`.

#### 0.2.4 Statement timeout

`PgDatasourcePool` already accepts a `statement_timeout` — but the
existing pool factory doesn't set it. Two-line fix at pool init:
```ts
statement_timeout: cfg.statementTimeoutMs ?? 60_000,
```
This is the single most important production-hardening change in the
whole plan and it lands today. It defuses **DSH-H02** (runaway SQL
hang) before we touch the rest.

#### 0.2.5 Soft-delete cascade registry

Lift the registry from BE-implementation doc § 0.6 into
`src/shared/services/cascade.registry.ts` *with only the four modules
wired* (dataset, analysis, dashboard, rls_rule). `precheckDelete()` is
called by every delete controller in the four modules. This kills the
class of "zombie dashboard" / "orphan filter" bugs each agent surfaced.

#### 0.2.6 Audit-log hash chain

Add the `prev_hash` / `row_hash` columns to `audit_log`. The audit
helper computes and writes them on every insert. This costs nothing
to add now and pays off in the security track. It also exposes a
tamper-detection endpoint (`GET /audit/verify-chain/:from`) used by
the QA suite.

**End of Week 0**: three P0 defects fixed, shared envelope + types
landed, test harness running, statement timeout enforced. Branch into
parallel tracks.

---

## Weeks 1–4 — Four parallel module tracks

Each track has the same shape:

```
W1   Foundation + critical defects
W2   Hardening (perf, observability, cascade)
W3   UX & feature parity with research gap
W4   Tests + docs + sign-off
```

The exit criteria below define "perfect" for that module. A track
isn't done until all of them are green.

### Track A — Dataset

**Owner**: TBD · **Branch**: `harden/dataset` · **Files of interest**:
`src/modules/datasets/`, `src/shared/db/shared_entity/dataset.entity.ts`,
`src/shared/db/shared_entity/datasetField.entity.ts`,
`src/app/modules/dataset/`.

#### W1 — Foundation & critical defects

1. **Type the service layer end-to-end** (`addDataset.ts:178` BE response
   shape vs `dataset.service.ts:152` FE — confirmed mismatch in the
   code-read). Extract `DatasetResponse` from Zod; FE consumes it; the
   `any` casts disappear (`dataset.service.ts:27–290`).
2. **Identifier escaping in `pg_typeof()` calls** (`addDataset.ts:100`,
   `updateDataset.ts:112`, `validateDatasetField.ts:98`). Quote with the
   existing `quoteIdent` util; add unit test with a column literal
   containing `"` to prove the escape.
3. **Replace the "load all datasources then `.find()`" pattern**
   (`listDataset.ts:53`, `addDataset.ts`, `updateDataset.ts`,
   `validateDatasetField.ts` — same in 4 controllers). Single helper
   `loadDatasourceForOrg(orgId, dsId)` with a typed return; benchmark
   shows N+1 saving on orgs with >50 datasources.

#### W2 — Hardening

4. **Multi-dialect column-type discovery**. Today `pg_typeof()` is
   used unconditionally — MySQL / Oracle silently fail (`addDataset.ts:100`).
   Replace with a per-dialect strategy on the pool: `pool.describe(sql)`
   returns `ColumnMeta[]` and the controller uses that instead of
   running a second query. Postgres impl uses `pg`'s
   `client.query({ rowMode: 'array' })` which exposes
   `fields[i].dataTypeID`; MySQL impl uses `mysql2`'s field metadata;
   etc. (See BE-implementation § 1.2 — already drafted.)
5. **Cache the schema introspection**. The same dataset's column list
   is re-queried on every preview. Add `dataset_introspection_cache`
   row (jsonb of `ColumnMeta[]` + ttl). Invalidate on dataset update
   and on a manual "refresh schema" button.
6. **File upload pipeline** — *only* the slice that fixes a real defect:
   uploads exist in the gap list but DBExec has none today. Decision:
   the Dataset module ships **CSV-only** upload in W3 (see below). Skip
   xlsx / tus / URL fetch for now.
7. **Soft-delete cascade audit**. `cascadeSoftDelete` already covers
   dataset → analyses → filters → visuals. Confirm with an integration
   test that creates the full graph, soft-deletes the dataset, and
   asserts every child reaches `status = 0`.

#### W3 — UX & gap closure

8. **CSV upload (one feature from the gap list, fully done)** —
   end-to-end per BE-implementation § 12. Quota check, sha256
   idempotency, COPY-stream bulk insert, audit, webhook event,
   feature flag.
9. **Custom-field live preview** — the validate endpoint exists; FE
   doesn't call it during edit. Add a debounced call from the formula
   editor that runs against a 100-row sample and renders the inferred
   column type + sample values.
10. **List page UX** — proper loading / empty / error states; cursor
    pagination (BE already gets the helper from § 0.3 of
    BE-implementation); per-row deleting spinner on bulk delete.

#### W4 — Tests, docs, sign-off

11. **BE integration tests** with the new harness — one happy path per
    controller, plus the regression cases above.
12. **FE tests** — replace skeleton specs (one per `*.component.spec.ts`)
    with real assertions; service tests mock `HttpClient` and assert
    on dispatched URLs + payload shapes.
13. **Playwright suite** — `e2e/dataset/*.spec.ts`: create → add field →
    add custom field → preview → run → list → soft-delete →
    list-excludes-deleted. ~15 specs.
14. **Docs**: `docs/modules/dataset.md` — current behaviour, gotchas
    (multi-dialect coverage, soft-delete cascade), example payloads.

#### Exit criteria

- [ ] 0 `any` types in `dataset.service.ts`, `dataset.controller.ts`,
      `addDataset.ts`.
- [ ] Every CUD endpoint: validation + audit + cascade-precheck +
      idempotency-aware.
- [ ] Multi-dialect type discovery works on Postgres, MySQL, MSSQL.
- [ ] CSV upload ships behind a flag, all checks green.
- [ ] CI: dataset BE unit > 80% line coverage; FE > 60%; Playwright 15
      specs all green.
- [ ] Findings doc shows every Dataset-P0/P1 with a "closed by PR #" link.

---

### Track B — Analysis & Visual Builder

**Owner**: TBD · **Branch**: `harden/analysis` ·
**Files**: `src/modules/analyses/`, `src/modules/analysis-filters/`,
`src/modules/visuals/`, `src/app/modules/analyses/`,
`src/app/shared/helpers/echarts-option-builder.ts`,
`src/app/modules/analyses/constants/charts.constants.ts`.

#### W1 — Foundation & critical defects

1. **Type `visual.config` (jsonb)** end-to-end. Today `VisualConfig.config: any`
   on BE (`visual_config.entity.ts:49`) and `Visual.config: any` on FE
   (`visual.model.ts:1-310`). Per chart type, define a Zod schema; the
   union becomes the canonical `VisualConfig` type. Save endpoint
   `zodValidate`s the union. This kills a whole class of "merge-leak"
   and "unwired property" bugs.
2. **Type `analysis_filter.config`** similarly. Remove the
   `categoryValues` dead field that the entity comments out
   (`analysis_filter.entity.ts:41–49`).
3. **Filter payload validation before `runAnalysisQuery`**
   (`runAnalysisQuery.ts:146–148` — currently un-shape-validated).
   Add `filterRunRequestSchema` to the request body so a malformed
   filter is rejected at the gate.
4. **Source-of-truth for chart count**. The code-read found
   `charts.constants.ts` defines **86** chart types, not the 73 the
   doc claims. Reconcile: either update the doc, or trim the registry
   to a curated 73 + mark the rest experimental. Decision needed in
   W1 ("Properties verification" plan in `~/.claude/plans/harmonic-…`
   assumes 73).
5. **Soft-delete column missing on `Visual` / `VisualConfig`**
   (`visual.entity.ts`, `visual_config.entity.ts` — no
   `@DeleteDateColumn`). Add it; backfill `deletedOn IS NULL` to
   every query that loads them.

#### W2 — Hardening

6. **Visual options builder — declarative from VisualSpec**. The FE
   sidebar (`visual-config-sidebar.component.ts`) renders properties
   procedurally with one `*ngIf` per chart family — drifts from the
   actual ECharts capabilities. Introduce `VisualSpec` (already
   defined in the deep-research doc), make the sidebar render from
   the spec, and verify property → option-path → render against the
   live `echartsInstance.getOption()` (this dovetails with the
   existing `plans/harmonic-strolling-peach.md` chart-property
   verification plan).
7. **RLS in `runAnalysisQuery` path** is already wired correctly
   (`runAnalysisQuery.ts:138–142`). Add a regression test that
   snapshots the compiled SQL for a known fixture so a future refactor
   can't silently break the RLS step.
8. **N+1 on filter values resolution** — `getDistinctAnalysisFieldValues`
   loads per-field; check whether a multi-filter dashboard re-issues
   one query per filter. If yes, batch.
9. **Audit on analysis run** (`runAnalysisQuery.ts` — currently no
   audit). Read operations are usually skipped, but customer compliance
   asks regularly require "who ran what query when". Log with
   redacted SQL (params bound).
10. **Cascade**: deleting an analysis must restrict if a published
    dashboard still references it (`sourceAnalysisId`). Wire into the
    cascade registry as `analysis -> dashboard: restrict`.

#### W3 — UX & gap closure

11. **Filter contract drift** — the code-read flagged a real risk that
    a denormalised `org/datasource/dataset` name on
    `analysis_filter.entity.ts:85–95` can go stale if an org/datasource
    is renamed. Drop the denormalisation; resolve at read time via
    join (one query, indexed).
12. **Empty / error states on visuals** — today a missing column
    renders a blank chart with no banner. Show an inline error card
    ("column `revenue` no longer exists in this dataset") with a
    "Re-map column" CTA that opens the field picker.
13. **Parameters (the gap-list addition that actually unblocks
    something)** — wire the `analysis_parameter` table per
    BE-implementation § 6.2. This is the *only* greenfield addition
    we pull into Analysis hardening because parameters are a
    prerequisite for snapshot-stable dashboards (next track).

#### W4 — Tests, docs, sign-off

14. **Snapshot tests for `runAnalysisQuery` SQL** across 12 fixtures
    (no filter, 1 filter, multi-filter, RLS-applied, custom field,
    edge cases). Treat as a regression contract.
15. **FE component tests** — replace skeletons. The 73-chart-property
    verification (from `plans/harmonic-strolling-peach.md`) is folded
    in here; each chart family gets one e2e covering at least
    "add visual → map field → assert rendered option contains the
    field".
16. **Playwright e2e** — `e2e/analysis/*.spec.ts`: create analysis →
    add filter → add visual → configure properties → save → re-open →
    properties persisted → run → results match expectation. ~20 specs.

#### Exit criteria

- [ ] `VisualConfig.config` and `AnalysisFilter.config` are typed
      Zod unions (no `any`).
- [ ] Every property on every chart type round-trips: set, save,
      reload, re-render — matches.
- [ ] Run path snapshot-tested across 12 fixtures.
- [ ] Cascade registry blocks deletion of an analysis with live
      dashboards.
- [ ] Audit-on-run lives behind a flag with payload redaction tested.
- [ ] CI: analysis BE > 80% coverage; FE > 60%; Playwright 20+ specs
      green.

---

### Track C — Dashboard

**Owner**: TBD · **Branch**: `harden/dashboard` ·
**Files**: `src/modules/dashboards/`,
`src/shared/db/shared_entity/dashboard*.ts`,
`src/app/modules/dashboards/`.

#### W1 — Foundation & critical defects

1. **Statement timeout** — already shipped in Week 0 § 0.2.4. Confirm
   by deliberately running a deliberately-slow query against a test
   dataset and assert the request returns `499`/`504` within
   `statementTimeoutMs`, not hangs.
2. **`config` JSONB on `DashboardVisualConfig` + `DashboardFilter`**
   (`dashboardVisualConfig.entity.ts:49`,
   `dashboardFilter.entity.ts:50`) typed identically to Track B's W1.
   Snapshot-publish writes the typed shape; renderer reads it.
3. **Distinct-values pagination** (`getDistinctDashboardFieldValues.ts:195`)
   — currently loads the full custom-field result set into memory,
   enriches everything, then paginates. Replace with: paginate at SQL
   layer (LIMIT + OFFSET / keyset), enrich only the page, hand back.
   Add a memory-cap regression test.
4. **Zombie-dashboard race** — list endpoint already innerJoins live
   analyses so deleted-analysis dashboards never appear; FE-side, if
   the source analysis disappears between page load and card click,
   show a friendly empty state instead of a 404.

#### W2 — Hardening

5. **Visual missing-field banner** — when a published dashboard
   references a column no longer in the dataset (
   `view-dashboard.component.ts:379–382` — currently silently blank),
   show an "Outdated snapshot — Republish" CTA with a list of broken
   visuals.
6. **Republish UX risk** — renaming a dashboard requires republish
   today, which wipes visuals (`publishDashboard.ts:101–108`). Either
   split metadata edits from snapshot republishes (recommended) or
   show an explicit confirmation. Pick metadata-split; document.
7. **Overindexed `DashboardVisualConfig`** (`dashboardVisualConfig.entity.ts:21–23`)
   — drop the redundant indices, keep only `(dashboardVisualId)` +
   `(organisationId, datasourceId)`.
8. **Cascade**: deleting a dashboard already wipes children via FK
   `ON DELETE CASCADE` (`dashboardVisual.entity.ts:34` etc.). Confirm
   with an integration test; reconcile the misleading
   `cascade: false` in the entity (`dashboard.entity.ts:128–135`) so
   future-you isn't lied to. Change to `cascade: true` everywhere or
   drop the option entirely.
9. **Audit gap**: publish currently logs metadata; render does not.
   Add a compact audit on render: user, dashboardId, filterDigest,
   ms — useful for capacity planning.

#### W3 — UX & gap closure

10. **Filter bar UX**:
    - relative-date preset chips (`last 7d`, `mtd`, `ytd`),
    - "Apply / Reset" pair,
    - filter scope picker (which visuals each filter affects),
    - persisted URL state for filters.
   This is the closest the dashboard module has to a P0 user pain
   point and the work is described in
   `docs/research/modules/07-filters-actions.md`.
11. **Empty / error / loading states on the view page**:
    - explicit "no dashboards yet" empty card,
    - per-visual loading skeleton,
    - per-visual error state ("this query timed out" / "RLS denied").
12. **Mobile responsive layout** — auto-stack visuals below
    768 px, hide filter sidebar by default with a slide-out toggle.

#### W4 — Tests, docs, sign-off

13. **BE integration**: publish → render → run → bulk-delete. Snapshot
    of the publish payload for one fixture so contract drift is caught.
14. **FE component tests**: ResizeObserver behaviour, ratio→grid
    conversion, race-id discard logic.
15. **Playwright e2e**:
    - publish dashboard → reload → render matches,
    - filter changes re-query and update visuals,
    - delete source analysis → dashboard list excludes,
    - statement-timeout → user sees clear error,
    - bulk delete → audit row exists.
    ~15 specs.

#### Exit criteria

- [ ] No `any` on snapshot payload (BE → FE).
- [ ] Statement timeout enforced; runaway SQL test green.
- [ ] Distinct-values memory-bounded.
- [ ] Missing-field banner shipped.
- [ ] Mobile-responsive verified on 320/768/1280.
- [ ] CI: dashboard BE > 80%; FE > 60%; Playwright 15+ specs green.

---

### Track D — RLS & Column Security

**Owner**: TBD (single owner only — security module) ·
**Branch**: `harden/rls`.

This is the highest-stakes track. **All changes ship behind feature
flags; no flag-cleanup until a security review signs off.**

#### W1 — Foundation & critical defects

Already covered by Week 0 § 0.1 (RLS-P0-1, RLS-P1-1, RLS-P2-1) —
plus the test suite that proves them fixed:

1. **Unit tests for `rlsResolver`** — every combination of
   `(operator × scope × value-type × user/group)` across 30+ cases.
   Use the new test harness.
2. **Snapshot tests for compiled SQL** — given fixtures of
   {rules, user attributes, target SQL}, snapshot the compiled SQL.
   Any change to the compiler produces a reviewable diff.
3. **Audit on rule application** — RLS-P3 from the code-read. Every
   query path logs `(user, dataset, rule_ids_fired, fingerprint)` to
   a high-volume `rls_application_log` table with daily partition.
   Pure observability, no behavioural change.

#### W2 — Hardening

4. **Group-membership cache** — RLS-P2-2 from the code-read.
   `UserGroupMapping.find({userId})` runs synchronously per query;
   cache in Redis with a 60 s TTL and invalidate on group membership
   change.
5. **Case-sensitivity normalisation** — RLS-P3 from the code-read.
   Pick one rule: column names are lower-cased on save and at
   compile-time. Backfill existing rules. Add a migration that
   normalises and a constraint that rejects mixed-case names.
6. **Connection impersonation (P1 — pulled from gap list)**. For
   customers asking for Snowflake-native row policies, route their
   queries via a DB-level impersonated role rather than rewriting
   `WHERE`. New table `connection_impersonation` (already drafted in
   BE-implementation § 9.1). Default off; explicit opt-in per dataset.

#### W3 — UX & gap closure

7. **Column masking (P0 from gap list — pulled in because RLS
   without column masking leaks PII trivially)**. Schema, compiler,
   FE picker per BE-implementation § 9. Mask patterns: `{last4}`,
   `{first2}`, `{hash}`, `{category}`. Audit each mask application.
8. **Test-as-user / preview-as** (RLS-G05 from the deep-research doc).
   Admin endpoint `POST /dataset/:id/preview-as` with explicit
   audit and a banner "Previewing as Alice" on the FE.
9. **Effective-permissions endpoint** — `GET /dataset/:id/effective/:userId`
   returns the merged predicate + projection that would apply. This
   becomes the single source of truth the FE can display to an admin
   debugging "why does Alice see this?".

#### W4 — Security review, tests, docs

10. **External-eye security review**: one engineer who didn't write
    this track reviews every PR with the threat model in hand. Block
    on signoff.
11. **Playwright "leak hunt" suite** — 25+ specs covering known
    bypass vectors:
    - user with no rules, deny-by-default flag on → returns empty,
    - user with rules → returns only matching rows,
    - admin user → returns all (owner override per rule),
    - RLS rule on column not in projection → still filters,
    - SQL-injection attempts in rule values → rejected,
    - identical rule under user + group → no duplicate predicate,
    - rename of column referenced in rule → rule invalidated, no panic,
    - test-as-user against self → no-op,
    - test-as-user audit row exists,
    - effective-permissions endpoint returns expected predicate,
    - column masking applied,
    - column masking with `{hash}` is deterministic for same input.
12. **Docs**: `docs/modules/rls.md` — operator semantics, value
    composition, rule precedence, deny-by-default policy, threat
    model.

#### Exit criteria

- [ ] All three Week-0 P0/P1 bugs closed; flags removed after review.
- [ ] No code path executes a user-aware query without invoking
      `SecurityCompiler`.
- [ ] Column masking shipped behind flag.
- [ ] Test-as-user shipped with audit.
- [ ] External security review signed off.
- [ ] CI: 100% coverage on `rlsResolver` + `securityCompiler`;
      Playwright leak-hunt suite green.

---

## Week 5 — Convergence, ship

When all four tracks signal exit-criteria-green:

1. **Cross-module integration suite**. One Playwright file at the
   repo root, `e2e/integration/*.spec.ts`:
   - create dataset → add custom field → create RLS rule →
     create analysis → publish dashboard → user without rule sees
     filtered rows → admin sees all → soft-delete dataset →
     dashboard becomes zombie → list excludes → audit chain verifies.
   - 5–10 such end-to-end flows. Each covers a real customer journey.
2. **Perf pass**. Pin a representative dataset (1M rows, 20-column).
   Measure P50/P95 on:
   - dataset run with 0/1/3/10 filters,
   - analysis run,
   - dashboard render,
   - distinct-values for column with 1/100/10k cardinality.
   Targets per your bar: P95 dashboard render < 2 s with snapshot
   cache warm. Where we miss, the cache strategy from
   BE-implementation § 5 lands now.
3. **Security review part 2**. Same reviewer, but now on the
   integrated system rather than module-by-module.
4. **Observability sweep**. Wire OpenTelemetry per BE-implementation
   § 19.2 across the four modules. Add `/healthz/ready` checking
   master DB + Redis + at least one shared DB.
5. **Docs**: each module's `docs/modules/<name>.md` is final;
   `docs/RUNBOOK.md` covers ops scenarios — RLS rule audit, schema
   drift, dashboard republish-vs-rename, dataset upload failure
   triage.
6. **Flag cleanup**. Every feature flag from Weeks 0–4 either:
   - is enabled for all orgs and the flag is removed from code, or
   - is parked as a deliberate runtime knob (e.g.
     `rlsDenyByDefault`) with documentation.
7. **Ship tag**: `v1.0-hardened`. The four core modules are now the
   foundation the gap-list features are built on top of.

---

## How this maps to your decisions

| You picked | How the plan honours it |
|---|---|
| **All four quality bars** | Each track's exit criteria covers all four (functional ✓, hardening ✓, perf/UX ✓, tests/security ✓). |
| **Pull in gap features when relevant** | Pulled: deny-by-default RLS policy, column masking, test-as-user, parameters (for Analysis), CSV upload (for Dataset), statement timeout, cascade registry, audit hash chain. Deferred: live dashboards, semantic layer, NL-AI, embed JWT, scheduling. |
| **Code-read first, plan in parallel** | This document is the output of a parallel code-read pass; every concrete defect is traceable to a file:line. |
| **All four in parallel tracks** | Weeks 1–4 are four tracks, one prerequisite week (W0) for the foundation they share. |

---

## What we *don't* do in this phase

Listed explicitly so we can defend scope creep:

- **No semantic layer**. Adding semantic models touches every dataset
  / analysis touch point and is its own multi-week project.
- **No live (non-snapshot) dashboards**. The snapshot model is a
  feature, not a bug. Live-mode is a downstream feature whose work
  starts after this phase.
- **No new visualisations**. The 73 (or 86) we have are enough. We
  *verify* every existing one as part of Analysis Track W4.
- **No public REST API / OpenAPI / SDK / embed**. Save for the
  next phase.
- **No mobile-app shell / PWA / web-push**. The mobile-responsive
  pass in Dashboard W3 is the boundary.
- **No AI features**. Decoupled work stream.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS deny-by-default rollout breaks existing customer dashboards | High | Per-dataset opt-in, default `'allow'`, scheduled communication to admins, dry-run preview before enable. |
| Typing `config` JSONB exposes bad shapes already in prod | Medium | Migration scans every row, logs invalid shapes to a triage table; UI surfaces them as "republish required". |
| Statement timeout cuts off a legitimately-slow query | Low | Per-dataset override (`statement_timeout_ms` column); admin can raise it. |
| Test harness flake on Postgres testcontainer | Medium | Pin image, use deterministic seeds, retry-once + report. |
| One track blocks another | Low (parallel by design) | Daily 10-minute sync; the four tracks share only the foundation, not features. |

---

## Done means done

When this plan is done, here's what's true:

- Every CUD on Dataset / Analysis / Dashboard / RLS:
  validates → permission-checks → audits → cascade-prechecks → emits
  a webhook event → returns a typed response.
- Every read on a user-owned resource flows through
  `SecurityCompiler` exactly once.
- The four modules ship with > 200 e2e tests, > 80% unit coverage on
  BE, > 60% on FE, and a single command runs them all.
- A new engineer reading `docs/modules/<name>.md` can hold the module
  in their head in one sitting.
- No code path executes user-typed SQL without a statement timeout.
- No code path returns `any` from BE to FE on the canonical CRUD
  surfaces.
- One reviewer can verify with a single audit-log query that no
  unauthorised data left the system since the last verified point.

That is what "perfect" means for the four modules.
