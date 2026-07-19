# Analyses → Production GA — Phase 1 deliverables

Produced 2026-07-18 from deep multi-tool BI research (Tableau, Power BI, Looker,
Metabase, Superset, Hex, Sigma, Qlik, ThoughtSpot, Observable Plot, Highcharts,
ECharts, AntV/G2, Plotly) → requirements corpus → master implementation plan.

This is the **Phase-1 output** of the "make Analyses production-ready" program.
Phase 2 (fan-out build across worktrees) starts **after user approval**.

## The one big reframing (verified against the code)

The research corpus assumed DBExec had "~24 chart types." **That is wrong.**
Reading the actual code:

- **60 chart IDs** exist in `analyses/constants/charts.constants.ts` (2,894 lines)
  with per-type builders in `echarts-option-builder.ts` (4,818 lines) — including
  3D/GL, sankey, tree, sunburst, candlestick, world-map/globe.
- A **dialect-aware aggregation engine** exists (`shared/helpers/analysis/buildAggregationWrap.helper.ts`)
  — sum/avg/count/min/max/count_distinct portable + median/percentile/stddev/variance
  via `PERCENTILE_CONT`, gated off engines that can't express them.
- **Pivot totals** (`shared/helpers/analysis/pivotTotals.helper.ts`), **result caching**
  (`queryResultCache.service.ts`), **reference lines / conditional formatting**, and
  **RLS row+column security** all already ship.

> ⚠️ **Path correction to the plan:** MASTER-PLAN.md cites the two aggregation
> helpers under `shared/helpers/visualisations/`; the real path is
> `shared/helpers/**analysis**/`. Phase-2 agents must use the `analysis/` path.

**So the gap is NOT chart count — it is depth + correctness in six areas:**
1. Type-semantics (field role/format/temporal model is display-only-dead)
2. **Aggregation depth** — no table-calc / window / time-intelligence / LOD engine (genuinely absent)
3. **Geo is cosmetic** — maps render but aren't data-bound (no GeoJSON/region-join/lat-lon typing)
4. Config depth — many options are global-only, not per-encoding; labels/ref-lines not universal
5. **Interaction** — no author-wiring action layer; cross-filter is ECharts default, not scoped
6. Authoring UX — no undo/redo, multi-select, align, z-order, on-pill menus

## Contents

- **[MASTER-PLAN.md](MASTER-PLAN.md)** — the plan of record. 8 waves, worktree
  fan-out shape, file-serialization hazards (the 3609-line shell, 4818-line option
  builder), full BE change inventory (Appendix A) + parallelism cheat-sheet (Appendix B).
- **corpus/** — 7 requirements sections (chart-types, data-types, aggregations,
  config-encoding, interaction, data-scale, authoring-ux), each with a gap table
  (have / partial / missing · P0/P1/P2 · effort · needs-BE).
- **research/** — the raw per-domain competitor research the corpus draws on.

## Wave structure (the gate summary)

```
Wave 0  Foundations — field-model columns, JSONB config contract, analytics-engine
        skeleton, all i18n keys up front  [gates everything]
Wave 1  Aggregation depth — table-calcs + time-intelligence + ratio-of-sums +
        ÷0 & pivot-total correctness audits  [P0, highest leverage]
Wave 2  Type-semantics — detection, role override, VBA format grammar, temporal model,
        chronological sort, relative-date, null-as-member  [P0]
Wave 3  Config/encoding depth — labels everywhere, universal reference lines, axis/
        color/sort/Top-N, palette + colorblind-safe, per-chart states + Data/Format
        panel redesign  [P0 "demo→product" polish]
Wave 4  Chart-type additions — geo DATA pipeline (P0, BE) + statistical + specialized;
        the 60 render targets exist, this makes the gaps data-bound
Wave 5  Data-scale & perf — truncation banner, timezone semantics, Top-N Other,
        LTTB downsampling, virtual scroll, export
Wave 6  Interaction unification — action layer + scoped cross-filter + drill +
        drill-to-detail  [one architectural build]
Wave 7  Authoring UX — undo/redo, multi-select/align/z-order, drag polish, on-pill
        menus, present mode
Wave 8  Verification + integration + code review  [continuous + final gate]
```

**Three highest-leverage builds (do not defer):** (1) the Wave-1 analytics/window
engine — unlocks KPI-delta, computed reference lines, Pareto, ratio measures, time-
intelligence in one stroke; (2) the Wave-4 geo pipeline — the only true P0 chart-family
hole; (3) the Wave-6 interaction/action layer — everything advanced hangs off it.

## Safety posture (from the plan)

- **No migrations, no destructive DB changes.** New per-visual options go into the
  existing `VisualConfig.config` JSONB (auto-cloned by the versioned-save helper).
- Only new **columns** are 3 nullable ones on `DatasetField` + a new nullable
  `InteractionRule` entity (Wave 6) — both onboarding-safe, apostrophe-free comments.
- Every new dynamic-SQL path uses `VALID_IDENTIFIER` + `$N` params and must compose
  with `resolveRlsFilters` (cross-filter/drill must not bypass row/column security).
- Verify per worktree: BE `tsc`; FE `tsc` + real prod build; i18n parity; fresh-org
  onboarding boot; versioning-clone integrity. **User drives live + pushes.**

## Prototype + mockups (the visual side of Phase 1)

- Interactive working prototype (clickable studio, sample data): published artifact.
- Before/after static mockup of the authoring shell: published artifact.
- Both live on DBExec design tokens; see `../analyses-authoring-mockup.html` +
  `../analyses-prototype.html`.
