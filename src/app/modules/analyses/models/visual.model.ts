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
 * Aggregate functions supported by the server-side aggregation wrap
 * (Track D). Mirrors AGGREGATE_VALUES in shared/validators/visuals.ts.
 */
export type AggregateFn =
  | 'sum'
  | 'avg'
  | 'count'
  | 'min'
  | 'max'
  | 'count_distinct'
  | 'median'
  | 'percentile'
  | 'stddev'
  | 'variance';

/**
 * One extra combo measure for multi-measure charts. Persisted in
 * visual.config.aggregations[] and echoed into the aggregation SQL wrap
 * as `AGG(column) AS alias` alongside the primary measure.
 */
export interface AggregationMeasure {
  column: string;
  aggregate: AggregateFn;
  alias: string;
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
 * Data mapping configuration for chart axes. Carries the legacy 3-slot model
 * AND the new per-chart roles — the transformer reads whichever ones the
 * chart's roles spec actually needs.
 */
export interface ChartDataMapping {
  xAxisColumn: string | null;
  yAxisColumn: string | null;
  zAxisColumn?: string | null;
  // Extended roles — optional, populated only for chart types that need them
  openColumn?: string | null;
  highColumn?: string | null;
  lowColumn?: string | null;
  closeColumn?: string | null;
  sampleColumn?: string | null;
  parentColumn?: string | null;
  indicatorColumns?: string[];
  dimensionColumns?: string[];
  valueColumns?: string[];
  lngColumn?: string | null;
  latColumn?: string | null;
  timeColumn?: string | null;
  /**
   * Histogram: number of bins to compute client-side. 0 / undefined → auto
   * (Sturges' rule). Sourced from `config.histogramBins` by buildMapping so the
   * transform layer, which owns the binning, can honour the author's choice.
   */
  histogramBins?: number;

  // ── Analytics quick-calc + compare (Slice B) ────────────────────────
  // Sourced from `config.quickCalc` / `config.movingAverageWindow` /
  // `config.compare` by buildMapping. The transformer applies these to the
  // shaped {name,value} series after the base transform. null/absent = raw.
  /** Per-measure quick calc applied post-transform (running total, etc.). */
  quickCalc?:
    | 'running_total'
    | 'percent_of_total'
    | 'difference'
    | 'percent_difference'
    | 'moving_average'
    | 'rank'
    | null;
  /** Window size for the moving-average quick calc. */
  movingAverageWindow?: number;
  /** Period-over-period comparison mode. */
  compareMode?: 'previous_period' | 'same_period_last_year' | null;

  // ── Type-semantics (Wave 2) ─────────────────────────────────────────
  // Sourced from `config.format` / `config.nullHandling` / `config.nullLabel`
  // by buildMapping. All optional — absent means "no explicit formatting /
  // default null handling", so untouched charts keep their previous shape.
  /** Format applied to category / axis LABELS (the x dimension). */
  labelFormat?: import('./visual-config.model').ValueFormat;
  /** Format applied to measure VALUES (used by the builder via WAVE2-FORMAT-HOOK). */
  valueFormat?: import('./visual-config.model').ValueFormat;
  /**
   * How a null dimension value is handled. 'gap' | 'connect' | 'zero' keep the
   * legacy drop/skip behaviour; when null-as-member is desired the caller
   * sets `nullAsMember` and the null category is retained under `nullLabel`.
   */
  nullHandling?: import('./visual-config.model').NullHandling;
  /** When true, a null dimension value is kept as its own category. */
  nullAsMember?: boolean;
  /** Label used for the retained null category (defaults to '(null)'). */
  nullLabel?: string;
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
 * Analytics keys the Analyses transform path reads off the free-form
 * `Visual.config` (jsonb). Documented as a typed shape even though
 * `Visual.config` stays `any` for back-compat with the many other config
 * keys. All optional — absent means "no analytics transform".
 */
export interface VisualAnalyticsConfig {
  /** Per-measure quick calc; null/absent = raw values. */
  quickCalc?:
    | 'running_total'
    | 'percent_of_total'
    | 'difference'
    | 'percent_difference'
    | 'moving_average'
    | 'rank'
    | null;
  /** Window (in points) for the moving-average quick calc. Default 3. */
  movingAverageWindow?: number;
  /** Period-over-period comparison config. */
  compare?: {
    mode?: 'previous_period' | 'same_period_last_year' | null;
    dateColumn?: string | null;
  };
}

/**
 * Visual object representing a chart on the canvas
 */
export interface Visual {
  /** Unique identifier for the visual */
  id: string;

  /**
   * Owning tab id (Track A). null / undefined = the default (first)
   * tab, for back-compat with analyses authored before multi-tab.
   */
  tabId?: string | null;

  /** Display title of the visual */
  title: string;

  /**
   * i18n key that produced the current `title`, when the title was set
   * automatically (new visual = ANALYSES.UNTITLED_VISUAL, picked chart
   * type = CHART_TYPES.<CID>.NAME). Cleared the moment the user edits
   * the title manually — so user-typed titles never get clobbered by
   * a language switch. The translate consumer reads this and re-resolves
   * the title on `onLangChange`.
   */
  titleKey?: string | null;

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

  // ─── Server-side aggregation encoding (Track D) ─────────────────────
  // When `aggregate` is set, the BE groups rows server-side over the full
  // dataset: SELECT dimensionColumn, AGG(measureColumn) AS value GROUP BY
  // dimensionColumn. `config.aggregations` carries extra combo measures.
  // All null = no server aggregation, raw rows (back-compat).

  /** Category column to GROUP BY (defaults to xAxisColumn on the BE). */
  dimensionColumn?: string | null;
  /** Numeric column the aggregate runs over (defaults to yAxisColumn). */
  measureColumn?: string | null;
  /** Aggregate function, or null for no server-side aggregation. */
  aggregate?: AggregateFn | null;

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

  // ─── Advanced interactions (spec §6) ────────────────────────────────

  /**
   * Cross-filter opt-in. When true, clicking a data point in this visual
   * emits a filter that constrains the OTHER visuals on the same analysis.
   * Off by default so charts stay static until the author opts in.
   */
  crossFilterEnabled?: boolean;

  /**
   * Ordered drill dimensions for this visual. When set (length > 0),
   * clicking a category descends to the next dimension in the list and a
   * breadcrumb lets the user ascend. Empty/undefined = no drill behaviour.
   * Column keys reference dataset/analysis field `columnToUse` values.
   */
  drillDimensions?: string[];

  /**
   * Server-side pivot total rows (Feature 5), populated at run time from
   * response.meta.pivotTotals when config.pivotTotals is enabled on a
   * table visual. Each row is a data-shaped object tagged with
   * `__rowType: 'subtotal' | 'grand'`. Rendered by table-visual as
   * distinct footer rows. Not persisted — derived per run.
   */
  pivotTotalRows?: any[];

  /**
   * Result-scale truncation flag (Wave 5, DATA-SCALE & PERF), populated at
   * run time from response.meta when the BE clipped the result to a cap
   * (raw-row LIMIT or the aggregation group ceiling). `shown` is the number
   * of rows returned and `cap` the ceiling that was applied; the renderer
   * shows the ANALYSES.V2.ERROR.TRUNCATION_BANNER ("Showing top {n} of
   * {total}") when this is present and `truncated` is true. Not persisted —
   * derived per run, parallel to pivotTotalRows.
   */
  truncation?: {
    truncated: boolean;
    shown: number;
    cap: number;
  } | null;
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
    tabId: null,
    // Default English value lives here as a no-Angular fallback for
    // any caller that constructs visuals outside the editor (tests,
    // placeholder, hydration before TranslateService is ready).
    // `edit-analyses.addVisual()` overwrites this with the active
    // locale's translation and stamps `titleKey` so it can be
    // re-translated on language switch.
    title: 'Untitled Visual',
    titleKey: 'ANALYSES.UNTITLED_VISUAL',
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
    dimensionColumn: null,
    measureColumn: null,
    aggregate: null,
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
    crossFilterEnabled: false,
    drillDimensions: [],
  };
}
