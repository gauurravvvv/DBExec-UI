/**
 * Per-chart capability map (Wave 4).
 *
 * THE single source of truth for "which config options make sense for this
 * chart type". Wave 3's visual-config sidebar reads a chart's capabilities to
 * SHOW/HIDE property groups (e.g. don't offer an X-axis config on a pie, don't
 * offer stacking on a scatter, offer a region field only on choropleth). This
 * decouples the option-builder (echarts-option-builder.ts) from the config UI:
 * the builder reads config keys defensively, the UI reads capabilities to know
 * which keys are worth surfacing.
 *
 * Design rules:
 *   - Pure data. NO runtime code beyond the lookup helper, NO Angular, NO
 *     imports. Safe to import from constants, services, and pure builders.
 *   - Every key is a boolean. Absent === false (see DEFAULT_CAPABILITIES and
 *     getChartCapabilities). Be HONEST per chart — this drives the UI, so a
 *     wrong `true` shows a control that does nothing, and a wrong `false` hides
 *     a control the builder actually honours.
 *   - Keyed by the chart `id` used in CHART_TYPES / the builder dispatcher.
 *
 * Capability keys (what each gates in the config UI):
 *   xAxis                 category / independent axis config (label, ticks, rotation)
 *   yAxis                 value / dependent axis config (scale, min/max, gridlines)
 *   dualAxis              a second measure drawn on a secondary Y axis (combo/line)
 *   secondaryValueAxis    an independent right-hand value axis is meaningful
 *   legend                series legend toggle + placement
 *   dataLabels            on-mark value labels
 *   stacking              stack mode (none/total/percent)
 *   colorByDimension      colour marks by a categorical dimension
 *   colorScale            continuous colour scale (visualMap) keyed to a measure
 *   referenceLines        markLine / markArea reference overlays
 *   sort                  sort categories by axis / measure
 *   topN                  top-/bottom-N limiting
 *   smallMultiples        facet into a grid of small charts
 *   tooltip               hover tooltip config
 *   geo                   renders on a registered GeoJSON map (choropleth family)
 *   sizeEncoding          a measure mapped to mark size (bubble radius, symbol size)
 *   requiresLatLon        NEEDS latitude + longitude columns (point/bubble maps)
 *   requiresRegion        NEEDS a region-name column to join to map features (choropleth)
 *   polar                 polar/angle-radius coordinate system
 *   threeD                3D (echarts-gl) chart
 */

/** Boolean capability flags read by the config UI to gate property groups. */
export interface ChartCapabilities {
  xAxis: boolean;
  yAxis: boolean;
  dualAxis: boolean;
  secondaryValueAxis: boolean;
  legend: boolean;
  dataLabels: boolean;
  stacking: boolean;
  colorByDimension: boolean;
  /** Continuous colour scale (visualMap). */
  colorScale: boolean;
  referenceLines: boolean;
  sort: boolean;
  topN: boolean;
  smallMultiples: boolean;
  tooltip: boolean;
  geo: boolean;
  sizeEncoding: boolean;
  requiresLatLon: boolean;
  requiresRegion: boolean;
  polar: boolean;
  threeD: boolean;
}

/** All-false baseline. Every entry below spreads/overrides this. */
export const DEFAULT_CAPABILITIES: ChartCapabilities = {
  xAxis: false,
  yAxis: false,
  dualAxis: false,
  secondaryValueAxis: false,
  legend: false,
  dataLabels: false,
  stacking: false,
  colorByDimension: false,
  colorScale: false,
  referenceLines: false,
  sort: false,
  topN: false,
  smallMultiples: false,
  tooltip: false,
  geo: false,
  sizeEncoding: false,
  requiresLatLon: false,
  requiresRegion: false,
  polar: false,
  threeD: false,
};

const cap = (over: Partial<ChartCapabilities>): ChartCapabilities => ({
  ...DEFAULT_CAPABILITIES,
  ...over,
});

/**
 * Common capability profiles to keep the map DRY and consistent across the many
 * bar/line/area variants that share the same cartesian feature set.
 */
// Standard cartesian category→value chart (bar / line / area base).
const CARTESIAN = cap({
  xAxis: true,
  yAxis: true,
  legend: true,
  dataLabels: true,
  colorByDimension: true,
  referenceLines: true,
  sort: true,
  topN: true,
  smallMultiples: true,
  tooltip: true,
});
// Stackable cartesian (stacked / normalized bar & area, stacked line).
const CARTESIAN_STACKABLE = cap({ ...CARTESIAN, stacking: true });
// Pie family (no axes; slices coloured by dimension).
const PIE = cap({
  legend: true,
  dataLabels: true,
  colorByDimension: true,
  sort: true,
  topN: true,
  tooltip: true,
});
// Minimal single-value display (gauges, KPI, number card).
const MINIMAL = cap({ tooltip: true });
// 3D (echarts-gl) — most 3D types offer a value colour scale + tooltip.
const THREE_D = cap({ threeD: true, tooltip: true, colorScale: true });

/**
 * The capability map, keyed by chart id. Covers every CHART_TYPES entry
 * (60 existing + 27 Wave-4 additions).
 */
export const CHART_CAPABILITIES: Record<string, ChartCapabilities> = {
  /* ── Bar family ─────────────────────────────────────────────────────── */
  'bar-vertical': CARTESIAN,
  'bar-horizontal': CARTESIAN,
  'bar-vertical-2d': CARTESIAN,
  'bar-horizontal-2d': CARTESIAN,
  'bar-vertical-stacked': CARTESIAN_STACKABLE,
  'bar-horizontal-stacked': CARTESIAN_STACKABLE,
  'bar-vertical-normalized': CARTESIAN_STACKABLE,
  'bar-horizontal-normalized': CARTESIAN_STACKABLE,

  /* ── Combo (dual-axis bars + line) ──────────────────────────────────── */
  combo: cap({
    ...CARTESIAN_STACKABLE,
    dualAxis: true,
    secondaryValueAxis: true,
  }),

  /* ── Line family ────────────────────────────────────────────────────── */
  line: cap({ ...CARTESIAN, dualAxis: true, secondaryValueAxis: true }),
  'line-stacked': CARTESIAN_STACKABLE,
  'line-step': CARTESIAN,
  polar: cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    tooltip: true,
    polar: true,
  }),

  /* ── Area family ────────────────────────────────────────────────────── */
  area: CARTESIAN,
  'area-stacked': CARTESIAN_STACKABLE,
  'area-normalized': CARTESIAN_STACKABLE,

  /* ── Pie family ─────────────────────────────────────────────────────── */
  pie: PIE,
  'pie-advanced': PIE,
  'pie-grid': cap({ ...PIE, smallMultiples: true }),
  donut: PIE,
  'half-donut': PIE,
  'nested-pie': PIE,
  rose: cap({ ...PIE, polar: true }),

  /* ── Gauges / single value ──────────────────────────────────────────── */
  gauge: MINIMAL,
  'linear-gauge': MINIMAL,
  'number-card': MINIMAL,
  table: cap({ sort: true, topN: true }),

  /* ── Maps / matrix ──────────────────────────────────────────────────── */
  'heat-map': cap({
    xAxis: true,
    yAxis: true,
    colorScale: true,
    dataLabels: true,
    tooltip: true,
  }),
  'tree-map': cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    colorScale: true,
    tooltip: true,
  }),

  /* ── Scatter family ─────────────────────────────────────────────────── */
  bubble: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    colorByDimension: true,
    sizeEncoding: true,
    referenceLines: true,
    tooltip: true,
  }),
  scatter: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    colorByDimension: true,
    colorScale: true,
    sizeEncoding: true,
    referenceLines: true,
    tooltip: true,
  }),
  'effect-scatter': cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    colorByDimension: true,
    sizeEncoding: true,
    tooltip: true,
  }),

  /* ── Statistical ────────────────────────────────────────────────────── */
  'box-chart': cap({
    xAxis: true,
    yAxis: true,
    tooltip: true,
    referenceLines: true,
  }),
  histogram: cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    referenceLines: true,
    tooltip: true,
  }),
  radar: cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    tooltip: true,
    polar: true,
  }),
  parallel: cap({ legend: true, colorByDimension: true, tooltip: true }),

  /* ── Funnel ─────────────────────────────────────────────────────────── */
  funnel: cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    sort: true,
    tooltip: true,
  }),

  /* ── Hierarchical ───────────────────────────────────────────────────── */
  sunburst: cap({ dataLabels: true, colorByDimension: true, tooltip: true }),
  tree: cap({ dataLabels: true, tooltip: true }),

  /* ── Flow ───────────────────────────────────────────────────────────── */
  sankey: cap({ dataLabels: true, colorByDimension: true, tooltip: true }),
  graph: cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    tooltip: true,
  }),
  'flow-lines': cap({ tooltip: true, colorByDimension: true }),

  /* ── Bar variants ───────────────────────────────────────────────────── */
  waterfall: cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    referenceLines: true,
    tooltip: true,
  }),
  'pictorial-bar': cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    tooltip: true,
    sort: true,
  }),
  'bar-polar': cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    tooltip: true,
    polar: true,
  }),

  /* ── Special / financial ────────────────────────────────────────────── */
  'theme-river': cap({ legend: true, colorByDimension: true, tooltip: true }),
  candlestick: cap({
    xAxis: true,
    yAxis: true,
    tooltip: true,
    referenceLines: true,
    dataLabels: true,
  }),

  /* ── 3D (echarts-gl) ────────────────────────────────────────────────── */
  bar3d: THREE_D,
  line3d: THREE_D,
  scatter3d: cap({ ...THREE_D, sizeEncoding: true }),
  surface: THREE_D,
  globe: cap({ threeD: true, geo: true, tooltip: true }),
  graphgl: cap({ threeD: true, tooltip: true, colorByDimension: true }),
  scattergl: cap({
    threeD: true,
    tooltip: true,
    colorScale: true,
    sizeEncoding: true,
  }),
  linesgl: cap({ threeD: true, tooltip: true }),
  map3d: cap({
    threeD: true,
    geo: true,
    colorScale: true,
    requiresRegion: true,
    tooltip: true,
  }),
  flowgl: cap({ threeD: true, geo: true, tooltip: true }),
  lines3d: cap({ threeD: true, geo: true, tooltip: true }),
  polygons3d: cap({
    threeD: true,
    geo: true,
    colorScale: true,
    requiresRegion: true,
    tooltip: true,
  }),

  /* ── 2D geo map ─────────────────────────────────────────────────────── */
  // world-map is a data-bound choropleth (Wave 4): region join + colour scale.
  'world-map': cap({
    geo: true,
    requiresRegion: true,
    colorScale: true,
    tooltip: true,
  }),

  /* ══ Wave 4 new chart types ═════════════════════════════════════════════ */

  // Bullet — measure vs target with qualitative bands (single cartesian bar).
  bullet: cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    referenceLines: true,
    tooltip: true,
  }),
  // Choropleth — region-shaded map. Needs a region column; colours by measure.
  choropleth: cap({
    geo: true,
    requiresRegion: true,
    colorScale: true,
    tooltip: true,
  }),
  // Point map — markers at lat/lon.
  'point-map': cap({
    geo: true,
    requiresLatLon: true,
    tooltip: true,
    colorByDimension: true,
  }),
  // Bubble map — lat/lon markers sized by a measure.
  'bubble-map': cap({
    geo: true,
    requiresLatLon: true,
    sizeEncoding: true,
    colorScale: true,
    tooltip: true,
  }),
  // Violin — distribution density per category (needs statistical binning).
  violin: cap({ xAxis: true, yAxis: true, tooltip: true }),
  // Density — 1D/2D density (needs statistical binning).
  density: cap({ xAxis: true, yAxis: true, colorScale: true, tooltip: true }),
  // Ridgeline — stacked density ridges (needs statistical binning).
  ridgeline: cap({ xAxis: true, yAxis: true, legend: true, tooltip: true }),
  // Streamgraph — themeRiver over time, centre-baseline stacked areas.
  streamgraph: cap({
    legend: true,
    colorByDimension: true,
    stacking: true,
    tooltip: true,
  }),
  // Marimekko — variable-width stacked bars (share × share).
  marimekko: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    dataLabels: true,
    stacking: true,
    colorByDimension: true,
    tooltip: true,
  }),
  // Calendar heatmap — value per day on a calendar grid.
  'calendar-heatmap': cap({
    colorScale: true,
    tooltip: true,
    dataLabels: true,
  }),
  // Lollipop — stems + dots (bar alternative).
  lollipop: cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    colorByDimension: true,
    sort: true,
    topN: true,
    referenceLines: true,
    tooltip: true,
  }),
  // Cleveland dot plot — one dot per category on a value axis.
  'cleveland-dot': cap({
    xAxis: true,
    yAxis: true,
    dataLabels: true,
    sort: true,
    topN: true,
    tooltip: true,
  }),
  // Dumbbell — two dots per category joined by a bar (before/after).
  dumbbell: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    dataLabels: true,
    sort: true,
    topN: true,
    tooltip: true,
  }),
  // Slope — two-point line per series (rank/value change between two periods).
  slope: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    dataLabels: true,
    tooltip: true,
  }),
  // Bump — rank-over-time lines.
  bump: cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    dataLabels: true,
    tooltip: true,
  }),
  // Pareto — sorted bars + cumulative-% line on a secondary axis.
  pareto: cap({
    xAxis: true,
    yAxis: true,
    secondaryValueAxis: true,
    dataLabels: true,
    referenceLines: true,
    tooltip: true,
  }),
  // Arc diagram — nodes on a line with arc links (graph layout).
  arc: cap({ legend: true, colorByDimension: true, tooltip: true }),
  // Chord — circular relationship graph (graph/circular layout).
  chord: cap({ legend: true, colorByDimension: true, tooltip: true }),
  // Network — force-directed node/link graph.
  network: cap({ legend: true, colorByDimension: true, tooltip: true }),
  // Cycle plot — seasonal sub-series lines.
  'cycle-plot': cap({
    xAxis: true,
    yAxis: true,
    legend: true,
    tooltip: true,
    smallMultiples: true,
  }),
  // Wind rose — polar stacked bars by direction.
  'wind-rose': cap({
    legend: true,
    colorByDimension: true,
    stacking: true,
    tooltip: true,
    polar: true,
  }),
  // Radial bar — bars on a polar radius axis.
  'radial-bar': cap({
    legend: true,
    dataLabels: true,
    colorByDimension: true,
    sort: true,
    topN: true,
    tooltip: true,
    polar: true,
  }),
  // Solid gauge — filled arc gauge (single value).
  'solid-gauge': MINIMAL,
  // KPI delta — big number + delta vs comparison (single value).
  'kpi-delta': MINIMAL,
  // Hexbin — 2D hex-binned density (needs statistical binning).
  hexbin: cap({ xAxis: true, yAxis: true, colorScale: true, tooltip: true }),
  // Q-Q plot — quantile-quantile scatter (needs statistical pre-processing).
  'qq-plot': cap({
    xAxis: true,
    yAxis: true,
    referenceLines: true,
    tooltip: true,
  }),
  // ECDF — empirical cumulative distribution step line (needs pre-processing).
  ecdf: cap({ xAxis: true, yAxis: true, tooltip: true }),
};

/**
 * Look up a chart's capabilities. Unknown ids fall back to the all-false
 * DEFAULT (so the config UI hides every gated group rather than guessing).
 */
export function getChartCapabilities(chartId: string): ChartCapabilities {
  return CHART_CAPABILITIES[chartId] || DEFAULT_CAPABILITIES;
}
