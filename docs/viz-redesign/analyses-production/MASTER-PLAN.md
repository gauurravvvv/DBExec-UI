Now I'll produce the master implementation plan as markdown. This is my final response — the deliverable itself.

---

# DBExec Analyses — Master Implementation Plan to Production GA

**Author:** Engineering Lead · **Target:** `version_261` lineage, fan-out across git worktrees · **Repos:** `dbexec-api` (Express + TypeORM + Postgres, per-org DBs) · `dbexec-ui` (Angular 18 + PrimeNG + ECharts)

---

## 0. Ground truth (what actually exists today — corrects the corpus)

Before planning, I read the code. The requirements corpus repeatedly says "~24 wired." **That undercounts what shipped on `version_261`.** The real state:

| Area                                               | Corpus claim       | Actual code state                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart types wired                                  | ~24                | **~60 chart IDs** in `charts.constants.ts` (incl. `theme-river`, `sankey`, `graph`, `tree`, `sunburst`, `candlestick`, `parallel`, `bar3d`/`line3d`/`scatter3d`/`surface`/`globe`, `graphgl`/`scattergl`/`linesgl`/`flowgl`, `world-map`/`map3d`/`flow-lines`) with per-type builders in `echarts-option-builder.ts` (4818 lines) |
| Aggregation                                        | "core only"        | Dialect-aware engine `buildAggregationWrap.helper.ts` — `sum/avg/count/min/max/count_distinct` portable + `median/percentile/stddev/variance` with `PERCENTILE_CONT WITHIN GROUP` (postgres/oracle), gated off MySQL/MSSQL; numeric-type guard; `MAX_AGGREGATED_GROUPS=10000` ceiling                                             |
| Pivot totals                                       | "must audit"       | `pivotTotals.helper.ts` exists (subtotal + grand-total rows)                                                                                                                                                                                                                                                                      |
| Result caching                                     | "missing (likely)" | **Exists** — `queryResultCache.service.ts` + `DatasetResultCache` entity, org-DB backed, RLS-identity in cache key                                                                                                                                                                                                                |
| LIMIT / timeout                                    | "verify"           | `DATASET_QUERY_LIMIT=1000`, `DATASET_STATEMENT_TIMEOUT_MS=30000`, aggregation skips row-LIMIT (correct)                                                                                                                                                                                                                           |
| Versioned save                                     | given              | `cloneAnalysisVersion.helper.ts` + `updateAnalysis.ts` — clone A→A', reconcile tabs→visuals→params atomically, returns idMaps; lineage unique-index race guard                                                                                                                                                                    |
| Reference lines / conditional format / annotations | flagged missing    | **Shipped** (task #1207/#1208) — `buildMarkOverlays`, `applyConditionalFormatting`, `buildVisualMap` in the option builder                                                                                                                                                                                                        |
| RLS row+column                                     | given              | `rlsResolver.service.ts` (`resolveRlsFilters` + `applyColumnSecurity`)                                                                                                                                                                                                                                                            |
| Config sidebar                                     | "flat 67-section"  | 4181-line HTML; already has trend/movingAverage/smallMultiples/crossFilter/dualAxis **stubs**                                                                                                                                                                                                                                     |

**The honest gap is NOT chart count.** It is depth and correctness in six areas, and this plan is organized around them:

1. **Type-semantics layer** — no tri-axis field model (physical/role/continuous-discrete), no VBA format grammar, no three-way temporal model. `DatasetField` has `role`/`defaultAggregation`/`formatHint`/`typeOverride` columns but they are **display-only dead hints** per the prior audit (`aggregation-field-audit`).
2. **Aggregation depth** — **no table-calc / window / time-intelligence / LOD / date-spine engine** (confirmed: no BE files exist). Statistical aggregates exist; everything post-aggregate does not.
3. **Geo is cosmetic** — ECharts-GL `globe`/`map3d`/`world-map` render but there is **no `registerMap` GeoJSON, no geocoding, no region-code join, no lat/lon typing** on BE. The map family is not data-bound.
4. **Config depth** — most rows are "partial": a global setting exists but is not wired per-encoding-element; labels/reference-lines are not universal across all chart types.
5. **Interaction** — **no author-wiring action layer**; cross-filter is per-chart ECharts default, not dashboard-scoped; no drill; no drill-to-detail.
6. **Authoring UX** — no undo/redo, no multi-select/align/z-order, thin drag polish, no on-pill menus.

---

## 1. Architecture decisions that gate everything (build these first, they are shared)

These are **foundation seams**. Every wave depends on them. They must land in **Wave 0** before fan-out, because they define the JSONB config contract and the field-model shape that all parallel agents read.

### 1.1 The `visual_config.config` JSONB is the extension point — do NOT add columns

`VisualConfig` already stores `config: jsonb` ("40+ tunables"). Per the codebase convention (`Additive schema changes`), **all new per-visual options go into `config`**, not new columns. This means chart-type additions, reference-line configs, format grammar, table-calc specs, and interaction wiring are **JSONB key additions** — they need **zero migrations** and are onboarding-safe by construction. The only new **columns** in this whole program are on `DatasetField` (§1.2) and two new small entities (§Wave 5, §Wave 6).

### 1.2 Tri-axis field model — the one unavoidable entity change (onboarding-safe)

`DatasetField` already has `role`, `defaultAggregation`, `formatHint`, `typeOverride`, `isVisible`. They exist but are **dead** (UI-only). We make them **load-bearing** and add exactly the missing axes as **nullable additive columns** (TypeORM schema-sync safe, legacy rows keep NULL):

- `continuousDiscrete: varchar null` — `'continuous' | 'discrete'`, independent of role.
- `semanticType: varchar null` — `'geo_country' | 'geo_state' | 'geo_city' | 'geo_postal' | 'geo_lat' | 'geo_lon' | 'url' | 'image' | null`.
- `doNotAggregate: boolean null` — the "do-not-SUM" flag for ratios/rates.

File: `dbexec-api/src/shared/db/shared_entity/datasetField.entity.ts`. **No migration** — comment the columns like the existing ones; org onboarding DDL sync picks them up. (Remember the `seedPermissionCatalog` / apostrophe-in-comment lesson — keep comments apostrophe-free.)

### 1.3 One BE compute engine, exposed as presets

The corpus is explicit and correct: table-calcs, time-intelligence, and computed reference lines should **share one server-side window/SQL engine**, surfaced in the config panel as presets — not one-off encodings. We build **`analyticsEngine`** (new folder `dbexec-api/src/shared/helpers/analytics/`) as the single home for window functions, date-spine joins, ratio-of-sums, and LOD subqueries. `runAnalysisQuery.ts` composes it **after** `buildAggregationWrap` and **before** the LIMIT/enrich steps, reusing the same `VALID_IDENTIFIER` guard and `$N` param discipline as `filterEngine`/`buildAggregationWrap`.

### 1.4 Serialization hazards — the files that MUST NOT be edited by two agents at once

| File                                   | Lines | Role                             | Rule                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit-analyses.component.ts`           | 3609  | The authoring shell orchestrator | **Serialize.** Every wave that touches the studio shell queues here. One owner at a time.                                                                                                                                                                                                       |
| `edit-analyses.component.html`         | 1487  | Studio template                  | **Serialize** (paired with the .ts).                                                                                                                                                                                                                                                            |
| `echarts-option-builder.ts`            | 4818  | All chart render logic           | **Partition by function.** Adding new `buildXChartOption` fns is append-only and parallel-safe **if** each agent adds a new exported fn and does not touch shared helpers (`buildCartesianAxis`, `applySortAndLimit`). Cross-cutting helper edits (labels-everywhere, ref-lines) **serialize**. |
| `visual-config-sidebar.component.html` | 4181  | Config panel template            | **Serialize** for structural redesign; **partition by accordion section** for additive config controls (each section is a distinct `<p-accordionTab>` block — agents can own disjoint sections).                                                                                                |
| `visual-config-sidebar.component.ts`   | 1610  | Config panel logic               | Same as its HTML.                                                                                                                                                                                                                                                                               |
| `charts.constants.ts`                  | 2894  | Chart registry                   | **Append-only, parallel-safe.** New chart entries are independent array items.                                                                                                                                                                                                                  |
| `chart-data-transformer.service.ts`    | 1472  | Row→series shaping               | **Partition by transform fn.**                                                                                                                                                                                                                                                                  |
| `runAnalysisQuery.ts` (BE)             | large | Query orchestration              | **Serialize.** The single BE choke point where filters/RLS/aggregation/enrich compose.                                                                                                                                                                                                          |
| `all_entities.constant.ts` (BE)        | —     | Entity registry                  | **Serialize** (append imports); trivially short so conflicts are cheap to resolve.                                                                                                                                                                                                              |
| 10× i18n locale files                  | —     | Strings                          | **Serialize per file** OR each agent owns a distinct key-prefix; run parity sweep at integration.                                                                                                                                                                                               |

**Partition principle for the whole program:** an agent owns _files_, not _features_. Where a feature needs the serialized shell, it lands as a small dedicated method/`@Output` that the shell owner splices in during the **shell-integration step** at the end of each wave (see §Integration).

### 1.5 The `updateAnalysis` clone-reconcile contract is frozen

Any new per-visual config is inside `VisualConfig.config` (JSONB) and is therefore **automatically cloned** by `cloneAnalysisVersion.helper.ts` (it deep-copies `VisualConfig` verbatim). New **child entities** (e.g. interaction wiring, §Wave 6) **must be added to the clone helper's deep-copy list and its `CloneIdMap`** — this is the one place a new entity can silently break versioning. Every wave that adds a child entity has an explicit "extend clone helper" task.

---

## 2. Wave overview (dependency-ordered; within a wave, worktrees fan out in parallel)

```
Wave 0  Foundations (field model, config contract, analytics-engine skeleton, i18n keys)   [gates all]
Wave 1  Aggregation depth: table-calcs + time-intel + ratio-of-sums + correctness audits   [P0 correctness]
Wave 2  Type-semantics: detection/role-override/format-grammar/temporal-model              [P0]
Wave 3  Config-encoding depth: labels-everywhere, ref-lines universal, axis/color/sort/Top-N [P0]
Wave 4  Chart-type additions: geo pipeline (P0) + statistical + specialized + missing cartesian
Wave 5  Data-scale & perf: truncation banner, tz semantics, error UX, Top-N Other, downsampling
Wave 6  Interaction unification: action layer + cross-filter + drill + drill-to-detail
Wave 7  Authoring UX: undo/redo, multi-select/align/z-order, drag polish, on-pill menus, present mode
Wave 8  Verification + integration + code review (continuous, but final gate here)
```

Waves 1–5 are **largely independent** (different files/domains) and can overlap once Wave 0 lands. Waves 6 and 7 both need the shell (`edit-analyses.*`) heavily, so they **serialize against each other on that file** even though their BE work is parallel.

---

## Wave 0 — Foundations (gates everything; short, high-discipline)

**Goal:** Land the field-model columns, the JSONB config schema doc, the analytics-engine skeleton, and stub every i18n key — so downstream agents never block on shared contracts or race on locale files.

**Worktree 0A — BE field model + config contract** (`feature/m-analyses-w0-be-foundation`)

- `datasetField.entity.ts`: add `continuousDiscrete`, `semanticType`, `doNotAggregate` (nullable, commented, apostrophe-free). Register nothing new (existing entity). **Onboarding-safe** — verify with a fresh org boot that DDL sync adds columns.
- New `dbexec-api/src/shared/helpers/analytics/analyticsEngine.ts` **skeleton only**: exported `applyTableCalcs(sql, specs, dialect, paramOffset)`, `applyTimeIntelligence(...)`, `applyRatioMeasure(...)`, all throwing `NotImplemented` for now, with the `AnalyticsError extends Error` typed-error class (mirrors `AggregationError`) so Wave 1 fills bodies without touching signatures.
- Extend `runAnalysisQuery.validation.ts` Zod schema (`dbexec-api/src/shared/validators/analyses.ts`) with **optional** `tableCalcs?`, `timeIntel?`, `dateSpine?` blocks (all `.optional()`, default no-op) — mirror verbatim to `dbexec-ui/src/app/shared/validators/analyses.ts`. Remember Zod 4 `z.record(z.string(), z.any())`.

**Worktree 0B — FE config-schema types + i18n stubs** (`feature/m-analyses-w0-fe-foundation`)

- New `dbexec-ui/src/app/modules/analyses/models/visual-config.model.ts`: TypeScript interface for the full `config` JSONB contract (all keys Waves 1–7 will write), so every FE agent types against one source. This is a **new file** — parallel-safe.
- Add **all** new i18n keys for the whole program to `en.json` up front (chart names, config labels, format presets, interaction labels, error messages), then fan the 9 non-en locales. Doing this once in Wave 0 removes the per-wave locale-file serialization bottleneck: later waves only _use_ keys, never _add_ them. (If a wave needs a new key, it appends to `en.json` and flags it for the Wave 8 parity sweep.)

**Serialization:** 0A and 0B are fully parallel (disjoint repos/files). **Both must merge before any Wave 1–7 worktree starts.**

**BE changes called out:** 3 nullable columns on `DatasetField` (onboarding-safe, no migration); new `analyticsEngine.ts` skeleton; additive optional Zod fields on the run validator (mirrored FE).

---

## Wave 1 — Aggregation depth (P0 correctness + the shared compute engine)

**Goal:** Fill `analyticsEngine` with the six P0 table-calcs, ratio-of-sums, and core time-intelligence; run the two trust audits. This is the **highest-leverage BE investment** in the whole program.

All Wave-1 worktrees write **new files** under `src/shared/helpers/analytics/` and only **read** `runAnalysisQuery.ts`; the single edit to `runAnalysisQuery.ts` (wiring the engine into the compose chain) is done **once** by worktree 1A, and 1B/1C/1D deliver pure helper modules 1A imports. This keeps the BE choke point single-owner.

**Worktree 1A — Window/table-calc engine + run-chain wiring** (`feature/m-analyses-w1-tablecalcs`)

- Implement in `analyticsEngine.ts`: **running total, moving average, rank (ties→skip), dense rank, row number, difference-from-prior (LAG), percent-difference (÷0-guarded via `NULLIF`), lag/lead(offset), percent-of-total**. Emit as SQL window functions layered **outside** the `buildAggregationWrap` result: `SELECT *, SUM(value) OVER (PARTITION BY … ORDER BY … ROWS …) FROM (<agg wrap>) __calc`.
- **SQL-dialect notes (must implement):**
  - Window functions (`ROW_NUMBER/RANK/DENSE_RANK/LAG/LEAD/SUM…OVER`) are portable across postgres/oracle/mysql8+/mssql — emit uniformly.
  - **MySQL < 8 / MariaDB < 10.2** have no window functions → `AnalyticsError('Table calculations require MySQL 8+ / MariaDB 10.2+')`. Reuse the `resolveAggDialect` family switch from `buildAggregationWrap.helper.ts` (extract it to a shared `dialect.helper.ts` so both engines share it — **this extraction is the only edit to `buildAggregationWrap.helper.ts` and 1A owns it**).
  - Frame syntax: `ROWS BETWEEN N PRECEDING AND CURRENT ROW` portable; expose `frame: {mode:'rows'|'range', preceding, following}` in the spec.
- Wire into `runAnalysisQuery.ts`: after aggregation wrap, before LIMIT skip logic. Guard identifiers with `VALID_IDENTIFIER`, bind offsets/windows as bounded integer literals (never client strings).
- **Correctness audit #1 (÷0):** grep every `/` in aggregation/percent paths (`buildAggregationWrap`, `pivotTotals`, new engine); wrap each divisor in `NULLIF(x,0)`. Document in a `analytics-correctness.md` note.

**Worktree 1B — Ratio-of-sums + weighted-average measure** (`feature/m-analyses-w1-ratio`)

- New `analytics/ratioMeasure.helper.ts`: a first-class "measure ÷ measure, re-derived at grain" — emits `SUM(num)/NULLIF(SUM(den),0)` **inside** the GROUP BY, so it recomputes correctly at every grain (never avg-of-ratios). Weighted average = `SUM(v*w)/NULLIF(SUM(w),0)`.
- FE-side guardrail spec (a warning payload the config panel shows when a user SUMs a field flagged `doNotAggregate`). No shell edit — delivered as a service + a config-panel accordion section (see Wave 3 ownership handoff).

**Worktree 1C — Date spine + core time-intelligence** (`feature/m-analyses-w1-timeintel`)

- New `analytics/dateSpine.helper.ts`: generate a bounded calendar CTE (`generate_series` on postgres-family; dialect-specific recursive CTE on mssql/oracle; **degrade with `AnalyticsError` on mysql<8**). LEFT JOIN the spine so absent periods densify.
- New `analytics/timeIntelligence.helper.ts`: **YTD/QTD/MTD, SPLY (same-period-last-year), YoY (value + %)** as SQL over the spine. MoM/QoQ and rolling-N follow the same pattern (deliver YTD/SPLY/YoY as P0, MoM/QoQ/rolling as P1 in the same module).
- **Dialect notes:** `DATE_TRUNC` (postgres/redshift/snowflake), `TRUNC` (oracle), `DATE_FORMAT`/`DATE_SUB` (mysql), `DATEADD`/`DATETRUNC` (mssql). Centralize in the shared `dialect.helper.ts`.

**Worktree 1D — Pivot totals re-aggregation audit + count-distinct grand total** (`feature/m-analyses-w1-pivot-audit`)

- **Correctness audit #2:** read `pivotTotals.helper.ts` end-to-end; **confirm AVG/ratio grand totals recompute from source rows, not sum-of-visible-cells.** If they sum cells, rewrite to re-aggregate. This is P0 — a wrong AVG total silently ships.
- Add **distinct-count grand total** (separate recount, not sum of group distincts) and a `GROUPING()`-flag path to distinguish total-row NULL from data NULL. Add ROLLUP subtotals (P1).

**Serialization within Wave 1:** 1A owns `runAnalysisQuery.ts` + the `dialect.helper.ts` extraction; 1B/1C/1D deliver standalone helper modules that 1A imports at integration. FE consumption of all Wave-1 output is a **Wave 3** config-panel task (deferred so the panel is edited by one owner).

**BE changes called out:** new `analytics/` engine (window fns, date-spine, time-intel, ratio); one wiring edit to `runAnalysisQuery.ts`; `dialect.helper.ts` shared extraction; two correctness fixes (÷0 guard, pivot re-aggregation). Additive Zod already landed in Wave 0. New config keys: `config.tableCalc`, `config.timeIntel`, `config.ratioMeasure` (JSONB — auto-cloned).

---

## Wave 2 — Type-semantics layer (P0)

**Goal:** Make the tri-axis field model load-bearing; ship the VBA/Excel format grammar; ship the three-way temporal model and date-part extraction; fix chronological sort + relative-date filters; null-as-first-class-member.

**Worktree 2A — BE: detection, role, temporal model** (`feature/m-analyses-w2-be-types`)

- **Type inference + role heuristic** consumed by the run/fields path: numbers→measure, else dimension; ID/ZIP/year demotable via `role` override (now load-bearing). Populate `continuousDiscrete` on field introspection (`getAnalysisFields.ts`).
- **Three-way temporal model** in `analyticsEngine`/a new `analytics/temporal.helper.ts`: `DATE_TRUNC` value (continuous), `EXTRACT` date-part (discrete: year/quarter/month/ISO-week/dow/day/hour/minute/second, month-name, hour-of-day), exact (row-level). Dialect-mapped via `dialect.helper.ts`.
- **Chronological sort fix:** ensure date columns sort on underlying value, never lexical on formatted text (audit `applySortAndLimit` path + the BE order-by).
- **Relative-date filter semantics:** last-N days/weeks/months/quarters, this/prev/next period, YTD — resolved server-side. FE already has `relative-date-presets.util.ts` (203 lines) — wire it to real BE resolution.
- **Null as first-class member:** group-by null → own `(Blank)` bucket (never silently dropped); null as selectable filter member + exclude-nulls toggle; confirm SUM/AVG skip nulls (SQL semantics). This touches the filter engine + aggregation wrap — coordinate the aggregation-wrap null bucket edit with **nobody** (1A already merged), so it's safe.

**Worktree 2B — FE: format grammar + type UI** (`feature/m-analyses-w2-fe-format`)

- New `dbexec-ui/src/app/modules/analyses/utils/format-grammar.util.ts`: **VBA/Excel placeholder grammar** (`0 # . , % E+ $ ;`-sections), named presets (General/Currency/Fixed/Standard/Percent/Scientific), locale separators, display-unit auto-scale (K/M/B) as a **toggle separate from the format string**, VBA **date tokens** (`d/dd/mmm/mmmm/yy/yyyy/dddd/hh/nn/tt`) + named date presets. This is a **new util** — parallel-safe, consumed by the option builder's `formatValueByHint`/`formatTooltipValue` and the config panel.
- New `dbexec-ui/src/app/modules/analyses/utils/type-detection.util.ts`: client heuristic + override plumbing feeding `DatasetField.role`/`continuousDiscrete`/`typeOverride`.
- Wire live **format preview** into the config panel (delivered as a config-panel accordion section — handed to the Wave-3 panel owner, or landed in the pill-menu overlay which is a new component, §Wave 7).

**Serialization:** 2A (BE) and 2B (FE new utils) are fully parallel. 2B's _consumption points_ (option builder `formatValueByHint`, config panel) are edited in Wave 3 by the panel/builder owners — 2B delivers the util + a PR-ready patch snippet for those call sites.

**BE changes called out:** temporal helper (date-trunc/date-part/exact, dialect-mapped); chronological-sort fix; relative-date resolution; null-bucket in aggregation + filter engine; `getAnalysisFields.ts` populates `continuousDiscrete`. Field-model columns already added in Wave 0.

---

## Wave 3 — Config/encoding depth (P0 — the "demo→product" polish layer)

**Goal:** Data labels on **every** applicable chart type; reference lines/bands universal on all cartesian; axis config (min/max/log/dual/format); color palette + swatch picker + colorblind-safe defaults; sort (dim+measure) + Top-N; null-on-line toggle; empty/error states per chart. Wire Wave-1/Wave-2 output into the panel.

This wave concentrates on **two serialized files** (`echarts-option-builder.ts` cross-cutting helpers, `visual-config-sidebar.*`) plus new components. Partition carefully.

**Worktree 3A — Option-builder cross-cutting helpers** (`feature/m-analyses-w3-builder-crosscut`) — **owns the shared helpers in `echarts-option-builder.ts`**

- `buildDataLabel`: make labels available on **every** cartesian/pie/bar type (position: auto/inside-end/outside-end/inside-center/inside-base; content: value/category/percent/multi; conditional-color; stack-total labels; min/max/first/last-only). Currently `buildDataLabel` exists but is applied unevenly — make it universal.
- `buildMarkOverlays`: extend to **computed reference lines** (average/median/min/max/percentile) + reference bands, with value labels + formatting. Constant lines already partly exist; computed lines call the new analytics engine (or compute client-side for simple avg/median over the already-fetched series).
- `buildValueAxis`/`buildCategoryAxis`: min/max independent ends, log + symlog, reversed axis, tick format (separate axis-vs-tooltip format), rotation, skip-Nth, dual-axis sync toggle.
- `applySortAndLimit`, `applyStackingOverride` (100% normalize), `applyNullHandling` (gap/connect/zero): harden and make universal.
- **This worktree is the single owner of the shared-helper region of the builder.** New per-chart builders (Wave 4) append their own `buildXChartOption` fns and only _call_ these helpers — no conflict.

**Worktree 3B — Config-panel redesign: Data/Format tabs + accordions + search** (`feature/m-analyses-w3-panel-shell`) — **owns the structural shell of `visual-config-sidebar.*`**

- Restructure the flat 67-section panel into **Data / Format tabs + collapsible accordions + a section search box** (corpus + prior spec). This is a **structural HTML rewrite** — must be single-owner. Establishes the accordion skeleton that 3C/3D/other waves slot sections into.
- Interactive **field pills** shell (icon/agg-text/caret/state marker) — the pill _component_ is new (§Wave 7 builds the on-pill menu overlay); 3B lays out the wells.

**Worktree 3C — Color + palette system** (`feature/m-analyses-w3-color`) — **new files + one accordion section**

- New `dbexec-ui/src/app/modules/analyses/utils/palette.util.ts`: categorical/sequential/diverging palettes, **colorblind-safe named schemes (Okabe-Ito, Viridis/Cividis, RdBu)**, deterministic category→color (stable hash) so colors are stable across charts/refreshes, per-value color pin, diverging midpoint, opacity, mark border/halo. **Do-not-force-red-green default.**
- Swatch-picker component (new component dir) + one config-panel accordion section (handed to 3B's skeleton at integration).
- Continuous-color stepped/binned → calls `buildVisualMap` (already exists) with new bin config.

**Worktree 3D — Null/empty/error states per chart** (`feature/m-analyses-w3-states`) — **`chart-renderer` + `echart-visual`**

- Four distinct states in `chart-renderer.component.*` + `echart-visual.component.*`: not-loaded (skeleton), empty-result, all-null-measure, nulls-within-data — never a blank/crashing panel. Legible **DB-error surfacing** in the panel (reuse `classifyQueryError.service.ts` BE output — syntax/permission/timeout) instead of a generic toast.
- Null label text (N/A / —), null grey encoding swatch.

**Serialization within Wave 3:** 3A owns builder shared-helpers; 3B owns panel structure; 3C/3D own new files + disjoint accordion sections. **3B must land its accordion skeleton before 3C's section merges** (3C rebases onto 3B). This is the one intra-wave ordering constraint. Wave-1 (table-calc) and Wave-2 (format) consumption sections are added to the panel here by 3B/3C as disjoint accordion tabs.

**BE changes called out:** computed-reference-line values may reuse the Wave-1 analytics engine (avg/median/percentile over grain); otherwise this wave is **FE-heavy** (config wiring on top of existing render). No new endpoints.

---

## Wave 4 — Chart-type additions (geo pipeline is the one big BE build; rest are FE)

**Goal:** Close real chart-type gaps. The **only P0 here is the geo data pipeline** (the map family is cosmetic today). Statistical/specialized/missing-cartesian are P1/P2 and are almost all append-only FE builders.

**Worktree 4A — Geo pipeline (P0, BE-heavy)** (`feature/m-analyses-w4-geo-be`)

- **New BE `dbexec-api/src/shared/helpers/geo/`**:
  - Region-code join: map dimension values (country/state names, ISO codes, FIPS, ZIP) to canonical region IDs for choropleth. Ship a bundled region lookup (countries + US/EU states) — no external service.
  - Lat/lon typing: honor `semanticType` `geo_lat/geo_lon` (from Wave 0/2); **never SUM lat/lon** (guard). Postal codes stay string (leading-zero preservation).
  - New endpoint or extend `runAnalysisQuery` output shape: return `{regionCode, value}` for choropleth and `{lat, lon, measure}` for point/bubble maps.
- **New BE GeoJSON asset serving:** a `getGeoBoundaries` endpoint (or static asset) returning TopoJSON/GeoJSON for world + admin-1, so the FE `registerMap` has real geometry. Follow the existing route/controller/validation pattern (`src/modules/analyses/…` or a new `geo` module; permission = `analyses` READ).

**Worktree 4B — Geo render (FE)** (`feature/m-analyses-w4-geo-fe`) — **append-only builders**

- `echarts.registerMap(...)` wiring in a **new** `geo-map.helper.ts` (not the big builder) using 4A's GeoJSON. New `buildChoroplethOption`, `buildPointMapOption`, `buildBubbleMapOption` — append to `charts.constants.ts` (parallel-safe) and register in `echart-visual`. This **replaces the cosmetic `world-map`/`globe` GL toys with data-bound maps.**

**Worktree 4C — Statistical + distribution charts (FE, append-only)** (`feature/m-analyses-w4-statistical`)

- Append builders + constants for **violin, density/KDE, ridgeline, strip/jitter, beeswarm, Q-Q, ECDF, 2D-histogram, hexbin, scatter+regression-line, correlation-matrix, control-chart (SPC), waffle, marimekko, streamgraph**. KDE/quantile/regression/corr compute calls the Wave-1 analytics engine (BE) where needed; simple ones compute client-side. Each is a **new exported builder fn** — no shared-helper edits, fully parallel with 4D.

**Worktree 4D — Ranking + flow + time-specialized + radial (FE, append-only)** (`feature/m-analyses-w4-specialized`)

- Append: **lollipop, cleveland dot, dumbbell, slope, bump, bar-chart-race, Pareto (cumulative % via analytics engine), alluvial, chord, arc, network, calendar-heatmap, gantt, OHLC-bar, cycle-plot, polar-area/rose, radial-bar, wind-rose, circular-heatmap, bullet, progress-bar/linear-gauge, solid-gauge/activity-ring, KPI+sparkline, KPI-delta (prior-period via analytics engine)**.
- **KPI-delta (P0 in corpus):** the prior-period compute is a Wave-1 time-intel call — this is the single P0 KPI gap and it's already unlocked by Wave 1.

**Serialization within Wave 4:** 4A (BE geo) is independent. 4B/4C/4D are all **append-only** to `charts.constants.ts` + new builder files — the only shared touch is `charts.constants.ts` (append-only, trivial merge) and the `echart-visual` chart-type→builder dispatch `switch` (append-only cases — assign disjoint case blocks per worktree, resolve at integration). **They must NOT edit the Wave-3-owned shared helpers**; they only call them.

**BE changes called out:** geo helpers (region-code join, lat/lon guard, GeoJSON serving) + one new read endpoint; analytics-engine calls for KDE/quantile/regression/corr/cumulative/prior-period (extend Wave-1 engine — coordinate so Wave 1 is merged first, or 4C/4D add their own analytics submodules that the engine re-exports). New chart configs are JSONB (auto-cloned).

---

## Wave 5 — Data-scale & performance (correctness/safety floor)

**Goal:** Truncation transparency, timezone semantics, error UX, Top-N + "Other", downsampling, virtual-scroll confirmation, export.

**Worktree 5A — BE: truncation flag, Top-N Other, tz, downsampling** (`feature/m-analyses-w5-be-scale`)

- **Truncation banner data:** `runAnalysisQuery` returns `{rows, totalRowsBeforeLimit, truncated}` so the FE can show "showing top N of M." Silent truncation is a correctness bug. (`DATASET_QUERY_LIMIT=1000` and `MAX_AGGREGATED_GROUPS=10000` already exist — expose whether they clipped.)
- **Top-N + "Other" bucket (totals-preserving):** server-side rollup of the long tail into "Other" (never dropped). New `analytics/topNOther.helper.ts`.
- **Timezone semantics (P0 correctness):** store UTC, convert at display, pin the bucketing zone in `DATE_TRUNC`. A daily chart bucketed in the wrong zone shifts counts across midnight. Add an explicit query TZ param; document the policy.
- **Server-side time-bucketing to display granularity** + **LTTB line downsampling** (`analytics/downsample.helper.ts`) — bucket to ~1 row/pixel-column for dense series.

**Worktree 5B — FE: banners, states wiring, virtual-scroll audit, export** (`feature/m-analyses-w5-fe-scale`) — mostly new files + `table-visual`

- Truncation banner + high-cardinality axis warn ("8,412 distinct — showing top 20") + search.
- Confirm the Analyses `table-visual` (335 lines) is truly windowed + chunked (uses `app-custom-table` infinite scroll per `custom-table-standard`) — fix if it full-DOM-renders.
- Format-appropriate export (CSV stream / XLSX / PNG snapshot) — `visual-export.util.ts` already exists; confirm streaming CSV, add XLSX row bound.

**Serialization:** 5A (BE new helpers + one `runAnalysisQuery` shape edit — coordinate with Wave 1's single-owner rule; sequence 5A's `runAnalysisQuery` edit after Wave 1 merges). 5B is FE new-files + `table-visual` (disjoint from shell). Fully parallel with each other.

**BE changes called out:** truncation-flag in run response; Top-N-Other rollup; tz param + policy; LTTB/time-bucket downsampling; count-distinct/large-result handling. All extend the existing run path (single-owner sequencing).

---

## Wave 6 — Interaction unification (the one architectural build)

**Goal:** The corpus is explicit — DBExec has **no author-wiring action layer**, and cross-filter/scoped-cross-filter/action-triggers/edit-mode-gating are effectively **one architectural build**. Everything advanced (highlight/parameter/drill-through/navigate actions) hangs off it.

**Worktree 6A — BE: interaction/action model + scoped cross-filter + drill** (`feature/m-analyses-w6-be-interaction`)

- **New entity `InteractionRule`** (analysis-scoped: source visual → target visual(s), behavior `filter|highlight|none`, trigger `select|hover|menu`, clearing rule). JSONB config. **Register in `all_entities.constant.ts` AND add to `cloneAnalysisVersion.helper.ts` deep-copy + `CloneIdMap`** (versioning contract — §1.5). Onboarding-safe (new nullable entity).
- **Scoped cross-filter:** when a mark is clicked, re-run scoped sibling queries with the emitted filter prepended (reuse `filterEngine` + `wrapQueryWithFilters` + `resolveRlsFilters` — cross-filter must respect RLS). New endpoint `POST /:analysisId/cross-filter` or extend `run` with a `crossFilterContext`.
- **Drill-down (hierarchy regroup)** and **drill-to-row-detail** (atomic underlying rows behind an aggregate, with the same filters + RLS applied, capped): new endpoints. Hierarchy metadata stored in `config`.
- New module `src/modules/analysis-interactions/` following the standard controller/validation/route pattern; permission = `analyses`.

**Worktree 6B — FE: action wiring UI + cross-filter/drill runtime** (`feature/m-analyses-w6-fe-interaction`) — **`analysis-interaction.service.ts` (175 lines, already exists) + new components; splices into shell**

- Cross-filter runtime via ECharts `dispatchAction` (highlight) + scoped re-run (filter). Multi-select model (Ctrl/Cmd additive, Shift/marquee, empty-click deselect). Clear/deselect. Reset-to-default. URL-encoded shareable filter state.
- Drill down/up + breadcrumb; drill-to-detail modal.
- **Reading vs Editing mode split** — consumers interact, only authors rewire (gate the action-wiring UI to edit mode).
- **Shell integration:** the action-wiring entry points and mode gate are a small set of methods/`@Output`s spliced into `edit-analyses.*` by the **shell owner** during Wave-6 shell-integration (this is where Wave 6 serializes against Wave 7 on the shell).

**Serialization:** 6A (BE, new module + new entity) is independent. 6B needs the shell — **it holds the shell-edit lock for its integration step; Wave 7's shell work waits.** The clone-helper edit (6A) is a serialized single-owner touch of `cloneAnalysisVersion.helper.ts`.

**BE changes called out:** new `InteractionRule` entity (registered + **cloned** + onboarding-safe); new `analysis-interactions` module + endpoints; cross-filter/drill/drill-to-detail queries reusing filter+RLS engines; hierarchy metadata in `config`.

---

## Wave 7 — Authoring UX (the trust primitives)

**Goal:** Undo/redo (the experimentation-enabler), multi-select/align/z-order/Selection pane, drag polish, on-pill menus, duplicate tab/chart, present mode. Corpus flags undo/redo (effort L, touches every mutation) and z-order/multi-select as the most under-scoped P0s.

**Worktree 7A — Undo/redo engine** (`feature/m-analyses-w7-undo`) — **new service; splices into shell**

- New `dbexec-ui/src/app/modules/analyses/services/undo-redo.service.ts`: a command/history stack over **all** authoring mutations (field bindings, format, layout, deletions, tab ops). Ctrl/Cmd-Z + redo. Survives whole session; survives Save (draft model already atomic per #1300). This is a **new service**; the shell owner wires every mutation method through it during shell-integration. Because the shell is serialized, 7A **delivers the service + a checklist of shell mutation call-sites**; the shell owner splices.

**Worktree 7B — Canvas: multi-select, align, z-order, Selection pane, snap, duplicate** (`feature/m-analyses-w7-canvas`) — **new components + shell layout methods**

- New `layers-panel` / `selection-pane` component (list, reorder, show/hide, lock). Multi-select (shift/ctrl + marquee), align (L/C/R/T/M/B), distribute, snap-to-grid toggle, gridlines, resize + numeric W/H, duplicate-in-place (Ctrl-D), nudge, smart guides. Canvas geometry lives in the shell (`placeVisualsOnGrid`, `computeVisualDimensions` — I saw these at lines 617–711 of `edit-analyses.component.ts`) — **7B owns the canvas-geometry region of the shell** and holds the shell lock for the canvas methods.

**Worktree 7C — On-pill menus + chart gallery + empty states + present mode** (`feature/m-analyses-w7-pills-present`) — **new overlay components + panel sections**

- New pill-menu overlay component: on-pill aggregation, sort, format override (uses Wave-2 `format-grammar.util`), date-granularity (uses Wave-2 temporal), rename-alias, remove, drag-between-wells. Role color-coding (dim vs measure).
- Chart-type **gallery** (categorized, thumbnailed, searchable, per-type description, field-aware validity) — replaces the current picker. Empty-canvas + empty-chart placeholder ("drag a field to X/Y") states.
- **Present/full-screen mode** + Edit↔View toggle + focus-single-chart. Duplicate tab (BE clone already exists via `duplicateAnalysis`) + duplicate chart.

**Serialization within Wave 7:** the **shell (`edit-analyses.*`) is the bottleneck.** Sequence the shell-integration steps: **7B (canvas geometry) → 7A (undo wiring over all mutations) → 6B/7C (splice entry points).** 7A/7B/7C develop their **new components/services in parallel worktrees**; only the shell-splice steps serialize, and they are small, mechanical, single-owner edits done at the end. This is the same "parallel-worktree stale-base integration pattern" the memory notes worked for the dataset/analyses completion programs.

**BE changes called out:** essentially none new — duplicate-tab/chart reuse existing `duplicateAnalysis` + clone helper. Undo/redo is pure FE. This wave is **FE-heavy**, concentrated on new components + serialized shell splices.

---

## Wave 8 — Verification + integration + code review (continuous, final gate)

**Compile gates (run per worktree before merge; the memory is explicit — never trust a detached build's self-report):**

- **BE:** `cd dbexec-api && npx tsc --noEmit` — must be clean.
- **FE:** `cd dbexec-ui && npx tsc --noEmit` **and** a real `ng build --configuration production` (tsc misses template binding errors — mandatory for every FE worktree).
- **i18n parity sweep:** every key in `en.json` exists in all 9 other locales (script the diff). Preserve `{{placeholders}}` verbatim.
- **Onboarding safety:** boot a **fresh org** and confirm every new nullable column (`DatasetField` ×3) and new entity (`InteractionRule`) appears via DDL sync with **no migration** and **no apostrophe-in-comment 500** (the known onboarding-DDL trap). Run `npm run backfill:perms` if any new grantable permission was added (none planned, but verify).
- **Versioning integrity:** a save (`updateAnalysis`) on an analysis carrying every new config key + an `InteractionRule` must clone cleanly (A→A'), leave A immutable, and return correct idMaps. Add a targeted test asserting the clone helper copies `InteractionRule` and remaps ids.

**Integration strategy (worktree merge order):**

1. **Wave 0 merges first, alone** (foundation gate).
2. Waves 1, 2 merge next (BE-heavy, disjoint files) — reconcile the single-owner `runAnalysisQuery.ts` / `dialect.helper.ts` edits by landing 1A before 5A's run-shape edit.
3. Wave 3 merges with the intra-wave order 3A(builder helpers) + 3B(panel skeleton) → then 3C/3D rebased.
4. Wave 4 merges (append-only builders + geo) — resolve `charts.constants.ts` and the `echart-visual` dispatch `switch` by concatenating disjoint case blocks.
5. Wave 5 merges (run-shape edit sequenced after Wave 1).
6. **Wave 6 then Wave 7** — they share the shell; land 6B's shell splice, then 7B→7A→7C shell splices in that order. This is the serialized tail.
7. **Reconcile the two immutable choke files last:** `edit-analyses.component.ts` and `visual-config-sidebar.component.*` receive all their splices in a final single-owner integration pass, then one `ng build` gate.

**Code review (workflow-driven; user drives live verification):**

- Run the repo's code-review workflow after each wave lands on the integration branch, at effort `high` for the BE analytics engine + geo + interaction entity (correctness-critical), `medium` for FE render/config.
- **Security review focus:** every new dynamic-SQL path (analytics window fns, date-spine, geo region-join, cross-filter, drill) must use `VALID_IDENTIFIER` + `$N` params + `paramOffset` composition (never string-concat) and must compose with `resolveRlsFilters` (cross-filter/drill must not bypass row/column security — this was a real prior bug, task #1228). Confirm the query-result cache key still includes RLS identity for any new cached path.
- **User drives live testing** on the running app (FE 8755 / BE 9058 per the desktop config) — the plan produces compile-green, review-passed branches; the user does the click-through and pushing (the user always pushes; never the agent).

---

## Appendix A — Concrete BE change inventory (every backend touch, for onboarding-safety review)

| Change                                                                               | File(s)                                                                           | Onboarding-safe?                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 3 nullable field-model columns                                                       | `datasetField.entity.ts` (`continuousDiscrete`, `semanticType`, `doNotAggregate`) | Yes — additive nullable, DDL sync, apostrophe-free comments    |
| Analytics engine (window/time-intel/ratio/date-spine/temporal/topN-other/downsample) | new `src/shared/helpers/analytics/*`                                              | Yes — pure helpers                                             |
| Shared dialect resolver                                                              | extract `dialect.helper.ts` from `buildAggregationWrap.helper.ts`                 | Yes — refactor                                                 |
| Run-chain wiring (analytics + truncation flag + tz + cross-filter ctx)               | `runAnalysisQuery.ts` (single-owner, sequenced)                                   | Yes — output-shape additive                                    |
| ÷0 guard + pivot re-aggregation fixes                                                | `buildAggregationWrap.helper.ts`, `pivotTotals.helper.ts`                         | Yes — correctness                                              |
| Geo pipeline + GeoJSON serving                                                       | new `src/shared/helpers/geo/*` + endpoint                                         | Yes — new read route, `analyses` perm                          |
| `InteractionRule` entity                                                             | new entity + `all_entities.constant.ts` + **`cloneAnalysisVersion.helper.ts`**    | Yes — new nullable entity; **must extend clone helper**        |
| Interaction/drill/drill-to-detail endpoints                                          | new `src/modules/analysis-interactions/*`                                         | Yes — standard pattern, `analyses` perm                        |
| Additive Zod on run/update validators (mirrored FE)                                  | `src/shared/validators/analyses.ts` + FE mirror                                   | Yes — all `.optional()`, Zod-4 `z.record(z.string(), z.any())` |

**No destructive DB changes. No migrations. Every new column/entity is nullable-additive and validated against a fresh-org boot.**

## Appendix B — Parallelism cheat-sheet (who can run at once)

- **Fully parallel, no shared files:** Wave-0 0A‖0B; Wave-1 1B‖1C‖1D (1A owns run-wiring); Wave-2 2A‖2B; Wave-4 4A‖4B‖4C‖4D (append-only, disjoint dispatch cases); Wave-5 5A‖5B.
- **Intra-wave ordering constraint:** Wave-3 3A + 3B first, then 3C/3D rebase.
- **Serialized on the shell (`edit-analyses.*`):** Wave-6 6B and all of Wave-7 — develop components in parallel, splice into the shell single-owner in order 6B → 7B → 7A → 7C.
- **Serialized on the config panel (`visual-config-sidebar.*`):** structural rewrite is 3B-only; additive sections partition by accordion tab.
- **Serialized on `runAnalysisQuery.ts`:** 1A first, then 5A's and 6A's output-shape edits sequenced after.

**Single highest-leverage investments (do not defer):** (1) the Wave-1 analytics engine — it unlocks KPI-delta, computed reference lines, Pareto, ratio measures, and time-intel in one stroke; (2) the Wave-4 geo pipeline — the only true P0 chart-family hole; (3) the Wave-6 interaction/action layer — one architectural build that every advanced interaction hangs off. Everything else is polish or append-only.
