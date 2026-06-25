# 11 · Analyses + Visual Builder — Deep Test Cases

## Fixtures
- Dataset `chart_demo` with the columns the chart matrix references.
- Analysis `Q3 Sales Review` (empty) for builder tests.
- Analysis `Bar Pilot` with one Bar visual mapped to region+sales.

## CRUD — happy
- **ANL-H-01** · Create analysis on existing dataset. P0
- **ANL-H-02** · Add Bar Chart; map xAxis=region, yAxis=sales; chart renders. P0
- **ANL-H-03** · Save; reload; visual + mapping persisted. P0
- **ANL-H-04** · Delete analysis. P0
- **ANL-H-05** · Duplicate analysis. P1
- **ANL-H-06** · Filter / sort. P1
- **ANL-H-07** · Pagination preserves filter+sort. P2

## CRUD — negative
- **ANL-N-01** · Name pattern violation. P0
- **ANL-N-02** · Name < 2. P0
- **ANL-N-03** · Name > 100. P0
- **ANL-N-04** · Duplicate name within (org, ds, dataset) → 409. P0
- **ANL-N-05** · Same name across datasets → allowed. P1
- **ANL-N-06** · Dataset from another org → 404. P0
- **ANL-N-07** · `Not(id)` dup-check still permits same-name save. P1
- **ANL-N-08** · User without analysis permission → bounce. P0

## Visual builder — universal per chart (73 types)

Each chart type T runs:
- **ANL-CHART-{T}-01** · render — `getOption().series.length > 0`. P0
- **ANL-CHART-{T}-02** · theme switch light↔dark preserves render. P1
- **ANL-CHART-{T}-03** · empty data graceful empty state. P1
- **ANL-CHART-{T}-04** · single-series styling. P1
- **ANL-CHART-{T}-05** · multi-series renders both. P1
- **ANL-CHART-{T}-06** · viewport resize re-renders without overflow. P1
- **ANL-CHART-{T}-07** · property toggle ON→OFF round-trips (no merge leak). P0

Properties exercised per chart where applicable: legend, tooltip,
dataZoom, animation, toolbox, inverseAxes, stacking, smoothLine,
stepLine, areaStyle, symbolSize, label, colorPalette, performanceMode,
emphasis.

The full matrix is materialised by `e2e/utils/generate-chart-matrix.ts`
into 1,606 tests; verify a representative bar / line / pie / scatter
manually as P0 acceptance.

## Visuals — negative
- **ANL-V-N-01** · Chart needing lat+lng without mapping → "incomplete" badge; save allowed. P1
- **ANL-V-N-02** · Visual references deleted custom field → warning; series skipped. P1
- **ANL-V-N-03** · Duplicate visual title → reject (or auto-suffix). P2

## Visuals — edge
- **ANL-V-E-01** · Numeric col mapped to category axis → coerced to string. P1
- **ANL-V-E-02** · Same field xAxis + yAxis → diagonal scatter. P2
- **ANL-V-E-03** · dataZoom OFF after ON → option's dataZoom removed. P0
- **ANL-V-E-04** · Theme switch mid-animation → no errors; final state correct. P1
- **ANL-V-E-05** · Resize during render → chart adapts. P1
- **ANL-V-E-06** · `getOption()` consistent after `applyChanges` 10× rapidly. P1

## Parameters
- **ANL-PARAM-H-01** · Declare param; reference in SQL; change value; visual re-renders. P0
- **ANL-PARAM-N-01** · Param value violating enum → reject. P1
- **ANL-PARAM-E-01** · Param default = first enum value when not specified. P2

## Cross-filters
- **ANL-CROSS-H-01** · Click bar in visual A → visual B re-renders filtered. P0
- **ANL-CROSS-H-02** · Clear all → cross-filters removed. P0
- **ANL-CROSS-N-01** · Cross-filter on table chart no-ops. P2

## Drill
- **ANL-DRILL-H-01** · Region → country drill shows country column. P0
- **ANL-DRILL-H-02** · Back-button drill-up. P1
- **ANL-DRILL-E-01** · Drill on field that no longer exists → graceful. P1

## URL state
- **ANL-URL-H-01** · Share URL with filter + drill state → recipient loads same view. P0
- **ANL-URL-N-01** · Tampered URL params → ignored, default applied. P1

## Bookmarks / saved views
- **ANL-BOOK-H-01** · Save bookmark; reload restores filters+drill. P1

## Forecast / trendline
- **ANL-FC-H-01** · Forecast 6 periods with CI bands renders. P1
- **ANL-TREND-H-01** · Linear trendline overlay on scatter. P1
- **ANL-FC-N-01** · Forecast on < 10 data points → graceful "insufficient data". P2

## Security
- **ANL-S-01** · Cross-org analysis id → 404. P0 🟣
- **ANL-S-02** · Visual options sanitised (no inline `eval`-able JS). P0 🟣

## Performance
- **ANL-P-01** · Canvas with 5 charts first-paint < 3s. P1 ⚡
- **ANL-P-02** · 50-visual analysis renders < 8s. P1 ⚡

## Regression buckets
- Property panel → ANL-CHART-{T}-07 across families
- Visual builder migration → all ANL-V-*
- Cross-filter wiring → ANL-CROSS-*
