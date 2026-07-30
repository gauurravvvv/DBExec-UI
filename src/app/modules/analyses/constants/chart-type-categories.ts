/**
 * Chart-type category constants shared by the transformer and its helpers.
 *
 * Pure data. One source of truth for both chart-data-transformer.service.ts and
 * chart-transform-utils.ts.
 */
export const DEFAULT_NULL_MEMBER_LABEL = '(null)';

/**
 * Chart type categories for determining data format
 */
export const MULTI_SERIES_CHART_TYPES = [
  'line',
  'line-stacked',
  'line-step',
  'area',
  'area-stacked',
  'area-normalized',
  'polar',
];
export const HEAT_MAP_CHART_TYPE = 'heat-map';
export const BUBBLE_CHART_TYPE = 'bubble';
export const BOX_CHART_TYPE = 'box-chart';
export const SANKEY_CHART_TYPE = 'sankey';
export const GRAPH_CHART_TYPE = 'graph';
export const FLOW_LINES_CHART_TYPE = 'flow-lines';
export const LINES3D_CHART_TYPE = 'lines3d';
export const POLYGONS3D_CHART_TYPE = 'polygons3d';
export const THREE_D_CHART_TYPES = ['bar3d', 'line3d', 'scatter3d'];

// New per-family chart-id sets — match the ECharts-canonical shapes we
// produce in phase 2. Each set maps a chart family to its dedicated
// transformer; transformData() dispatches by these first, then falls back
// to the legacy single-series path for charts that genuinely fit it.
export const MULTI_BAR_CHART_TYPES = [
  'bar-vertical-2d',
  'bar-horizontal-2d',
  'bar-vertical-stacked',
  'bar-horizontal-stacked',
  'bar-vertical-normalized',
  'bar-horizontal-normalized',
];
export const CANDLESTICK_CHART_TYPE = 'candlestick';
// Combo (bars + line dual-axis) shares the multi-series-by-value-columns shape:
// x = category, yAxis = first measure, valueColumns = the rest. Which series
// renders as a line / rides the secondary axis is decided in the option builder
// from config.dualAxis. Histogram bins a single numeric column client-side.
export const COMBO_CHART_TYPE = 'combo';
export const HISTOGRAM_CHART_TYPE = 'histogram';
export const HIERARCHY_CHART_TYPES = ['tree-map', 'sunburst', 'tree'];
export const RADAR_CHART_TYPE = 'radar';
export const PARALLEL_CHART_TYPE = 'parallel';
export const THEME_RIVER_CHART_TYPE = 'theme-river';
export const GLOBE_CHART_TYPE = 'globe';
export const WORLD_MAP_CHART_TYPE = 'world-map';
export const LINESGL_CHART_TYPE = 'linesgl';
export const FLOWGL_CHART_TYPE = 'flowgl';

/**
 * Maximum label length for chart categories (prevents overflow)
 */
export const MAX_LABEL_LENGTH = 25;
