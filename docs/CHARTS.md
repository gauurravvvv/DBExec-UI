# Chart system reference

A single-source map from product chart IDs to the ECharts series type
that backs them, the field roles each chart asks the user to map, and
the canonical data shape the option-builder emits.

This is the developer-facing companion to `CHART_ROLES` in
`src/app/modules/analyses/constants/charts.constants.ts`. When a new
chart is added, update both.

## Reading the table

- **Chart id** — string in `CHART_TYPES[].id`. Used as `visual.chartType`.
- **ECharts type** — backing `series.type` (or coord system for globe).
- **Required roles** — must be set for `hasRequiredChartFields()` to
  return true; unset → chart renders a "configure this column" prompt.
- **Optional roles** — used if present, otherwise a default is applied.
- **Data shape** — what the transformer produces and the builder
  consumes. Match these against the ECharts 5.6 option pages.

Roles map to columns on `Visual`:

| Role | Visual field |
|---|---|
| `xAxis` | `xAxisColumn` |
| `yAxis` | `yAxisColumn` |
| `zAxis` | `zAxisColumn` |
| `open/high/low/close` | `openColumn` / `highColumn` / `lowColumn` / `closeColumn` |
| `sample` | `sampleColumn` |
| `parent` | `parentColumn` |
| `indicators` | `indicatorColumns[]` |
| `dimensions` | `dimensionColumns[]` |
| `valueColumns` | `valueColumns[]` |
| `lng` / `lat` | `lngColumn` / `latColumn` |
| `time` | `timeColumn` |

## Reference table

### Bar family

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `bar-vertical`, `bar-horizontal` | `bar` | `xAxis`, `yAxis` | — | `[{name, value}]` |
| `bar-vertical-2d`, `bar-horizontal-2d` | `bar` (multi) | `xAxis`, `yAxis` | `valueColumns` | `[{name: series, series: [{name, value}]}]` |
| `bar-vertical-stacked`, `bar-horizontal-stacked` | `bar` + `stack: 'total'` | `xAxis`, `yAxis` | `valueColumns` | same as 2D |
| `bar-vertical-normalized`, `bar-horizontal-normalized` | `bar` stacked, max=100 | `xAxis`, `yAxis` | `valueColumns` | same, rescaled |
| `bar-polar` | `bar` on `polar` coord | `xAxis`, `yAxis` | — | `[{name, value}]` |
| `pictorial-bar` | `pictorialBar` | `xAxis`, `yAxis` | — | `number[]` |
| `waterfall` | three stacked `bar` series | `xAxis`, `yAxis` | — | `(number|'-')[]` per series |

### Line / area

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `line`, `line-stacked`, `line-step` | `line` | `xAxis`, `yAxis` | `valueColumns` | `number[]` or multi-series |
| `area`, `area-stacked`, `area-normalized` | `line` + `areaStyle` | `xAxis`, `yAxis` | `valueColumns` | same |
| `polar` | `radar` (radial coord) | `xAxis`, `yAxis` | — | multi-series wrapped |

### Pie / donut

| Chart id | ECharts type | Required | Optional |
|---|---|---|---|
| `pie`, `pie-advanced`, `pie-grid` | `pie` | `xAxis`, `yAxis` | — |
| `donut`, `half-donut`, `nested-pie`, `rose` | `pie` | `xAxis`, `yAxis` | — |

Data shape: `[{name, value}]`.

### Scatter / bubble / heatmap

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `scatter` | `scatter` | `xAxis`, `yAxis` | — | `[{name, value:[name, value]}]` |
| `effect-scatter` | `effectScatter` | `xAxis`, `yAxis` | — | same as scatter |
| `bubble` | `scatter` with size | `xAxis`, `yAxis` | `zAxis` (size) | `[{name, x, y, r}]` |
| `heat-map` | `heatmap` | `xAxis`, `yAxis`, `zAxis` | — | `[[colIdx, rowIdx, value]]` |

### Statistical

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `box-chart` | `boxplot` | `xAxis`, `sample` | — | `[{name, value: [min, q1, median, q3, max]}]` |
| `candlestick` | `candlestick` | `xAxis`, `open`, `high`, `low`, `close` | — | `{categories: string[], values: [[o, c, l, h]]}` |

### Hierarchical

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `sunburst` | `sunburst` | `xAxis` (name), `yAxis` (value) | `parent` | `[{name, value, children?}]` |
| `tree-map` | `treemap` | `xAxis`, `yAxis` | `parent` | `[{name, value, children?}]` |
| `tree` | `tree` | `xAxis` | `yAxis`, `parent` | `{name, children: [...]}` (single root) |

Without `parent`, hierarchy charts render flat siblings of an implicit root.

### Multi-dimensional

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `radar` | `radar` | `xAxis` (series name), `indicators` | — | `{indicators: [{name, max}], series: [{name, value: number[]}]}` |
| `parallel` | `parallel` | `dimensions` | `xAxis` (line name) | `{axes: [{dim, name, type}], data: [[v0, v1, ...vN]]}` |

### Flow / relationship

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `sankey` | `sankey` | `xAxis` (source), `yAxis` (target) | `zAxis` (value) | `{nodes: [{name}], links: [{source, target, value}]}` |
| `graph` | `graph` | `xAxis`, `yAxis` | `zAxis` | same as sankey |
| `flow-lines` | `lines` + `scatter` | `xAxis`, `yAxis` | `zAxis` | same as sankey, builder auto-layouts |
| `theme-river` | `themeRiver` | `xAxis` (category), `yAxis` (value) | `time` | `[[time, value, category]]` |

### Geo / map

| Chart id | ECharts type | Required | Optional | Data shape |
|---|---|---|---|---|
| `world-map` | `map` with registered `'world'` map | `xAxis` (region), `yAxis` (value) | — | `[{name, value}]` |
| `globe` | `globe` (GL coord) | `lng`, `lat` | `yAxis` (value) | `[{value: [lng, lat, value]}]` |
| `lines3d` | `lines3D` on globe | `lng`, `lat` | — | `[lng, lat, h][]` pair-wise |
| `polygons3d` | `polygons3D` | `xAxis` (name), `lng`, `lat` | — | `[{name, coords: [[lng, lat]]}]` |

### 3D cartesian (echarts-gl)

| Chart id | ECharts type | Required | Optional |
|---|---|---|---|
| `bar3d`, `line3d`, `scatter3d` | `bar3D`/`line3D`/`scatter3D` on `grid3D` | `xAxis`, `yAxis`, `zAxis` | — |
| `surface` | `surface` on `grid3D` | `xAxis`, `yAxis`, `zAxis` | — |
| `map3d` | `map3D` | `xAxis`, `yAxis` | `zAxis` |

Data shape: `[[x, y, z]]` (or `[{value: [x, y, z]}]`).

### GL

| Chart id | ECharts type | Required | Optional |
|---|---|---|---|
| `scattergl` | `scatterGL` | `xAxis`, `yAxis` | — |
| `graphgl` | `graphGL` | `xAxis`, `yAxis` | `zAxis` |
| `linesgl` | `linesGL` | `lng`, `lat` | — |
| `flowgl` | `flowGL` (vector field) | `lng`, `lat` | — |

### Non-ECharts

| Chart id | Component | Required | Optional |
|---|---|---|---|
| `number-card` | `<app-configurable-card-chart>` | `yAxis` | `xAxis` |
| `table` | `<app-table-visual>` | — | — |

## Adding a new chart type

1. Add an entry to `CHART_TYPES` in `charts.constants.ts` with `id`,
   `name`, `icon`, `category`, `description`.
2. Add a `CHART_ROLES[id]` entry declaring `required` + `optional` roles.
3. If the chart needs a data shape that isn't already produced, add a
   transformer method in `chart-data-transformer.service.ts` and route
   to it from `transformData()`.
4. Add a builder in `echarts-option-builder.ts` and register it in the
   appropriate dispatch table (`CHART_TYPE_BUILDERS`, `SIMPLE_BUILDERS`,
   or `NODE_LINK_BUILDERS`).
5. Add a chart-type predicate in `charts.constants.ts` if you want a
   dedicated config section in the sidebar.
6. Update this table.

## Performance notes

Wired into every chart by default:

- `tooltip.confine: true` (unless `tooltipAppendToBody` is enabled)
- `animationThreshold: 2000` (no entry animation above 2k items)
- `useDirtyRect: true` at `echarts.init` (partial-repaint canvas)
- `dataZoom.throttle: 100` ms

User-toggleable in the **Performance Mode** sidebar section (scatter /
line / bar):

- `large` + `largeThreshold` — batch-rendered primitives above N items
- `progressive` + `progressiveThreshold` — chunked render passes

Candlestick has its own `large` toggle in the Candlestick Performance
section because the default off-state matters for colour preservation.

## ECharts version

This codebase targets ECharts **5.6.0** (with `echarts-gl` ^2.0.9 for
the 3D / GL family). When upgrading to 6.x, see the v5→v6 migration
notes for: `tooltip.valueFormatter` 2nd-arg shape, `axis.startValue`
decoupling from `axis.min`, default theme changes (legend now bottom by
default), and the `axis.containShape` change for bars/candlestick.
