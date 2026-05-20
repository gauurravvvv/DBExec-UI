/**
 * Chart and Visual type definitions for the Analyses module
 */

/**
 * Single data point for simple charts (bar, pie, gauge, treemap, card)
 */
export interface ChartDataPoint {
  name: string;
  value: number;
}

/**
 * Multi-series data for complex charts (line, area, polar, heat-map)
 */
export interface ChartSeriesData {
  name: string;
  series: ChartDataPoint[];
}

/**
 * Aliases for backward compatibility with service
 */
export type SingleSeriesData = ChartDataPoint;
export type MultiSeriesData = ChartSeriesData;

/**
 * Union type for all chart data formats
 */
export type ChartData = ChartDataPoint[] | ChartSeriesData[];

/**
 * Data mapping configuration for chart axes
 */
export interface ChartDataMapping {
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  zAxisColumn?: string | null;
}

/**
 * Field-role identifiers a chart can declare it needs. The renderer + sidebar
 * + transformer all read from this same enum so each chart only ever asks for
 * the columns ECharts actually consumes for that series type.
 *
 * Legacy 3-slot roles (xAxis/yAxis/zAxis) are kept for the bar/line/pie/
 * scatter/funnel family that genuinely fits a simple category+value shape;
 * everything else gets its own role(s).
 */
export type RoleKey =
  | 'xAxis'
  | 'yAxis'
  | 'zAxis'
  // candlestick — OHLC ordering matches ECharts canonical [open, close, low, high]
  | 'open'
  | 'high'
  | 'low'
  | 'close'
  // boxplot — single numeric column of raw samples that gets reduced to a 5-tuple
  | 'sample'
  // hierarchy — name + value + parent-name (parent of root is null/empty)
  | 'parent'
  // radar — one column per indicator axis (ordered list)
  | 'indicators'
  // parallel — one column per axis (ordered list, N-dimensional)
  | 'dimensions'
  // multi-series (2D/stacked/normalized bars, multi-line) — extra value columns
  | 'valueColumns'
  // geo charts — longitude / latitude / optional value
  | 'lng'
  | 'lat'
  // time-series and theme-river
  | 'time';

/**
 * Per-chart role contract. Read by:
 *   - the field-mapping sidebar (renders the right column-pickers)
 *   - hasRequiredChartFields() (validates before render)
 *   - ChartDataTransformerService.transformData() (knows which Visual fields to read)
 */
export interface ChartRolesSpec {
  required: RoleKey[];
  optional: RoleKey[];
}

/**
 * Visual object representing a chart on the canvas
 */
export interface Visual {
  /** Unique identifier for the visual */
  id: string;

  /** Display title of the visual */
  title: string;

  /** Width in pixels (computed from widthRatio) */
  width: number;

  /** Height in pixels (computed from heightRatio) */
  height: number;

  /** Width as ratio of canvas width (0-1, e.g., 0.5 = 50%) */
  widthRatio: number;

  /** Height as ratio of canvas height (0-1, e.g., 0.5 = 50%) */
  heightRatio: number;

  /** X position on canvas (computed from xRatio) */
  x: number;

  /** Y position on canvas (computed from yRatio) */
  y: number;

  /** X position as ratio of canvas width (0-1) */
  xRatio: number;

  /** Y position as ratio of canvas height (0-1) */
  yRatio: number;

  /** Number of grid columns this visual spans (1-12 in a 12-column grid) */
  colSpan: number;

  /** Number of grid rows this visual spans */
  rowSpan: number;

  /** Computed grid column position (0-based, set by placement algorithm) */
  gridCol: number;

  /** Computed grid row position (0-based, set by placement algorithm) */
  gridRow: number;

  /** Chart type identifier (e.g., 'bar-vertical', 'line', 'pie') */
  chartType: string | null;

  /** Column name for X-axis / Category mapping */
  xAxisColumn: string | null;

  /** Column name for Y-axis / Value mapping */
  yAxisColumn: string | null;

  /** Column name for Z-axis / third dimension (heat-map) */
  zAxisColumn: string | null;

  // ─── Per-chart role columns ─────────────────────────────────────────────
  // Optional fields. Only the columns relevant to the selected chart type
  // are surfaced in the sidebar — others stay null/undefined and the
  // transformer ignores them. Adding a new role to ECharts here also
  // requires extending RoleKey + the chart's roles spec in charts.constants.

  /** Candlestick: open price column */
  openColumn?: string | null;
  /** Candlestick: high price column */
  highColumn?: string | null;
  /** Candlestick: low price column */
  lowColumn?: string | null;
  /** Candlestick: close price column */
  closeColumn?: string | null;
  /** Boxplot: raw-samples numeric column (5-tuple computed per category) */
  sampleColumn?: string | null;
  /** Tree / treemap / sunburst: parent-name column (root rows have null/empty parent) */
  parentColumn?: string | null;
  /** Radar: one column per indicator axis */
  indicatorColumns?: string[];
  /** Parallel: one column per N-D axis (order = render order) */
  dimensionColumns?: string[];
  /** Multi-series bars / lines / area / theme-river: extra value columns */
  valueColumns?: string[];
  /** Geo: longitude column (globe / lines3d / polygons3d / world-map) */
  lngColumn?: string | null;
  /** Geo: latitude column */
  latColumn?: string | null;
  /** Theme-river: time column (falls back to row index if unset) */
  timeColumn?: string | null;

  /** Pre-computed chart data - using any[] for template compatibility with different chart components */
  chartData: any[];

  /** Chart configuration options */
  config: any;

  /** Whether this visual is currently loading data */
  loading?: boolean;

  /** Whether this visual has finished loading data */
  loaded?: boolean;

  /** Whether this visual encountered an error during data loading */
  error?: boolean;
}

/**
 * Dataset field definition from the API
 */
export interface DatasetField {
  id: string;
  columnToUse: string;
  columnToView: string;
  customLogic: string | null;
  isCfUsed: number;
}

/**
 * Dataset details containing metadata and fields
 */
export interface DatasetDetails {
  id: string;
  name: string;
  description?: string;
  datasetFields: DatasetField[];
}

/**
 * Axis selection mode type
 */
export type AxisSelection = 'x' | 'y' | 'z' | null;

/**
 * Field labels for different chart types.
 *
 * Legacy `field1/field2/field3` are kept for the old 3-slot sidebar (bar/line/
 * pie/scatter etc.). `roles` is the new, per-chart contract — populated for
 * charts whose roles spec in charts.constants extends beyond the 3-slot model
 * (candlestick, boxplot, hierarchical, radar, parallel, geo).
 */
export interface FieldLabels {
  field1: string;
  field2: string;
  field3?: string;
  roles?: Array<{
    key: RoleKey;
    label: string;
    /** true for list-valued roles (indicators[], dimensions[], valueColumns[]) */
    multi?: boolean;
    /** false for optional-but-not-required roles */
    required?: boolean;
  }>;
}

/**
 * Factory function to create a new Visual with default values
 * Default ratios: 0.5 width (50% of canvas), 0.45 height (45% of canvas)
 */
export function createVisual(id: string, config: any): Visual {
  return {
    id,
    title: 'Untitled Visual',
    width: 400, // Will be computed from widthRatio
    height: 350, // Will be computed from heightRatio
    widthRatio: 0.5, // 50% of available space (2 visuals per row)
    heightRatio: 0.45, // 45% of canvas height
    x: 0,
    y: 0,
    xRatio: 0,
    yRatio: 0,
    colSpan: 12, // Half of 24-column grid (2 visuals per row)
    rowSpan: 6, // 6 grid rows (300px at 50px/row)
    gridCol: 0, // Set by placement algorithm
    gridRow: 0, // Set by placement algorithm
    chartType: null,
    xAxisColumn: null,
    yAxisColumn: null,
    zAxisColumn: null,
    openColumn: null,
    highColumn: null,
    lowColumn: null,
    closeColumn: null,
    sampleColumn: null,
    parentColumn: null,
    indicatorColumns: [],
    dimensionColumns: [],
    valueColumns: [],
    lngColumn: null,
    latColumn: null,
    timeColumn: null,
    chartData: [],
    config,
  };
}
