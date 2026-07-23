/**
 * The per-visual `config` JSONB contract (Analyses production program).
 *
 * Every visual persists a free-form `config` blob (see `Visual.config` in
 * visual.model.ts, still typed `any` for legacy back-compat). This file is
 * the SINGLE authoritative shape that all forthcoming waves — the config
 * panel, the query compiler, the ECharts transform layer, and the BE
 * mirror — read and write. FE code should type against
 * `AnalysisVisualConfig` instead of reaching into `any`.
 *
 * Design rules for this file:
 *   - Pure types only. NO runtime code, NO imports, NO Angular.
 *   - EVERY field is optional. An empty `{}` is a valid config; absence of
 *     a group means "feature not configured" and the transform layer falls
 *     back to its default behaviour.
 *   - Enumerated values are string-literal unions (not TS `enum`s) so they
 *     serialise 1:1 to the JSONB and match the BE/Zod string contract.
 *   - Sub-shapes are exported so panels and services can reference a single
 *     group (e.g. `AxisConfig`) without re-declaring it.
 *
 * Where a concept already has a narrower legacy home (e.g. the analytics
 * quick-calc keys on `VisualAnalyticsConfig`), this file supersedes it for
 * new work but does not remove the old type — that migration happens in a
 * later wave.
 */

/* ────────────────────────────────────────────────────────────────────────
 * Shared enums
 * ──────────────────────────────────────────────────────────────────────── */

/** Aggregate functions available to measures. Mirrors AggregateFn. */
export type AggFn =
  | 'sum'
  | 'avg'
  | 'count'
  | 'count_distinct'
  | 'min'
  | 'max'
  | 'median'
  | 'percentile'
  | 'stddev'
  | 'variance';

/** Ascending / descending, used by sort and axis ordering. */
export type SortDirection = 'asc' | 'desc';

/* ────────────────────────────────────────────────────────────────────────
 * 1. Encoding — which dataset column feeds which visual channel
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Column-to-channel mapping (the "wells" in the Data tab). All roles are
 * optional; the active chart type decides which it consumes. List-valued
 * roles allow multi-column encodings (e.g. several measures, faceting).
 */
export interface EncodingConfig {
  /** Category / independent axis column. */
  xAxisColumn?: string;
  /** One or more measure columns plotted on the value axis. */
  yAxisColumns?: string[];
  /** Column that drives series colour / grouping. */
  colorColumn?: string;
  /** Column mapped to mark size (bubble radius, etc.). */
  sizeColumn?: string;
  /** Column mapped to mark shape / symbol. */
  shapeColumn?: string;
  /** Columns that split marks without a visual channel (level of detail). */
  detailColumns?: string[];
  /** Extra columns surfaced only in the tooltip. */
  tooltipColumns?: string[];
  /** Column that facets the chart into rows of small multiples. */
  rowFacet?: string;
  /** Column that facets the chart into columns of small multiples. */
  colFacet?: string;
  /** When true, a second measure is drawn against a secondary (right) axis. */
  dualAxis?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. Aggregation — server-side GROUP BY wrap
 * ──────────────────────────────────────────────────────────────────────── */

/** One aggregated measure in the GROUP BY wrap. */
export interface AggregationMeasureConfig {
  /** Numeric column the aggregate runs over. */
  column: string;
  /** Aggregate function applied to `column`. */
  agg: AggFn;
  /** Percentile (0–100), required only when `agg` is `'percentile'`. */
  percentile?: number;
}

/** Aggregation group: how raw rows are collapsed before charting. */
export interface AggregationConfig {
  /** Measures to aggregate. */
  measures?: AggregationMeasureConfig[];
  /** Category column to GROUP BY. */
  dimensionColumn?: string;
  /**
   * Escape hatch: when true, skip server aggregation and plot raw rows even
   * if measures/dimension are present (row-level detail views).
   */
  doNotAggregate?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. Table calculations — window functions over the shaped result
 * ──────────────────────────────────────────────────────────────────────── */

/** Supported table-calculation (window-function) types. */
export type TableCalcType =
  | 'running_total'
  | 'moving_avg'
  | 'rank'
  | 'dense_rank'
  | 'row_number'
  | 'difference'
  | 'percent_difference'
  | 'lag'
  | 'lead'
  | 'percent_of_total';

/**
 * A single table calculation. `window`/`frame` tune windowed calcs
 * (moving average, running total); `partitionBy`/`orderBy` scope and order
 * the window, mirroring SQL `OVER (PARTITION BY … ORDER BY …)`.
 */
export interface TableCalcConfig {
  /** Which window calculation to apply. */
  type: TableCalcType;
  /** Number of points in the window (e.g. moving-average width). */
  window?: number;
  /** Frame spec, e.g. `'rows'` vs `'range'` framing hint. */
  frame?: string;
  /** Columns that reset the calculation (PARTITION BY). */
  partitionBy?: string[];
  /** Columns that order rows within each partition (ORDER BY). */
  orderBy?: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. Time intelligence — period-relative measures
 * ──────────────────────────────────────────────────────────────────────── */

/** Supported time-intelligence transforms. */
export type TimeIntelType =
  | 'ytd'
  | 'qtd'
  | 'mtd'
  | 'sply' // same period last year
  | 'yoy'
  | 'mom'
  | 'qoq'
  | 'rolling';

/** A time-intelligence transform anchored on a date column. */
export interface TimeIntelConfig {
  /** Which period calculation to apply. */
  type: TimeIntelType;
  /** Window length for the `'rolling'` type (e.g. 12 for rolling 12 months). */
  periods?: number;
  /** Date column that anchors the period logic. */
  dateColumn?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. Ratio measure — numerator / denominator (optionally weighted)
 * ──────────────────────────────────────────────────────────────────────── */

/** A computed ratio of two measures, optionally weighted. */
export interface RatioMeasureConfig {
  /** Column forming the numerator. */
  numerator: string;
  /** Column forming the denominator. */
  denominator: string;
  /** When true, compute a weighted ratio using `weightColumn`. */
  weighted?: boolean;
  /** Weight column used when `weighted` is true. */
  weightColumn?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. Value formatting — the number / date format grammar
 * ──────────────────────────────────────────────────────────────────────── */

/** Format families. `formatString` (below) can override for advanced cases. */
export type FormatKind =
  'auto' | 'number' | 'currency' | 'percent' | 'scientific' | 'date';

/** Order-of-magnitude scaling applied before formatting (K / M / B …). */
export type DisplayUnit =
  'auto' | 'none' | 'thousands' | 'millions' | 'billions' | 'trillions';

/**
 * A reusable format spec. Applied per value (measure) and per label
 * (category / axis tick) — see `FormatConfig` for the two slots.
 */
export interface ValueFormat {
  /** Which format family to use. */
  kind?: FormatKind;
  /** Decimal places to render. */
  decimals?: number;
  /** ISO 4217 currency code when `kind` is `'currency'` (e.g. `'USD'`). */
  currencyCode?: string;
  /** Date pattern when `kind` is `'date'` (e.g. `'yyyy-MM-dd'`). */
  dateFormat?: string;
  /** Whether to show a thousands separator. */
  thousands?: boolean;
  /** Literal text prepended to the formatted value. */
  prefix?: string;
  /** Literal text appended to the formatted value. */
  suffix?: string;
  /** Magnitude scaling / unit suffix (K, M, B …). */
  displayUnit?: DisplayUnit;
  /** Raw format string that overrides the structured fields when set. */
  formatString?: string;
  /**
   * Text rendered in place of a null / empty value by the format grammar
   * (Wave 2). Defaults to '' when unset. Distinct from `AnalysisVisualConfig.
   * nullLabel`, which names a null CATEGORY bucket; this formats a null VALUE.
   */
  nullText?: string;
}

/** Two format slots: one for measures/values, one for category labels. */
export interface FormatConfig {
  /** Format applied to measure values. */
  value?: ValueFormat;
  /** Format applied to category / axis labels. */
  label?: ValueFormat;
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. Axes — per-axis scale, bounds, ticks
 * ──────────────────────────────────────────────────────────────────────── */

/** Axis scale transforms. `symlog` handles data spanning zero on a log-ish scale. */
export type AxisScale = 'linear' | 'log' | 'symlog';

/** Configuration for a single axis. */
export interface SingleAxisConfig {
  /** Fixed axis minimum (auto when unset). */
  min?: number;
  /** Fixed axis maximum (auto when unset). */
  max?: number;
  /** Scale transform applied to the axis. */
  scale?: AxisScale;
  /** Reverse the axis direction. */
  reversed?: boolean;
  /** Tick label format string. */
  tickFormat?: string;
  /** Tick label rotation in degrees. */
  rotation?: number;
  /** Show gridlines for this axis. */
  gridlines?: boolean;
  /** For a dual axis: keep this axis's scale synced with the primary. */
  dualSync?: boolean;
}

/** The x and y axis configuration pair. */
export interface AxisConfig {
  /** X (category / independent) axis. */
  x?: SingleAxisConfig;
  /** Y (value / dependent) axis. */
  y?: SingleAxisConfig;
}

/* ────────────────────────────────────────────────────────────────────────
 * 8. Series & stacking
 * ──────────────────────────────────────────────────────────────────────── */

/** Per-series render type (lets a combo chart mix bars and lines). */
export type SeriesType = 'bar' | 'line' | 'area' | 'scatter';

/** Override applied to a single named series. */
export interface SeriesConfig {
  /** Series name (matches the series key emitted by the transform). */
  name: string;
  /** Explicit colour for this series. */
  color?: string;
  /** Render type override for this series. */
  type?: SeriesType;
  /** Which axis this series binds to (0 = primary/left, 1 = secondary/right). */
  yAxisIndex?: number;
}

/** How stacked series combine. */
export type StackingMode = 'none' | 'total' | 'percent';

/* ────────────────────────────────────────────────────────────────────────
 * 9. Data labels
 * ──────────────────────────────────────────────────────────────────────── */

/** Where a data label sits relative to its mark. */
export type DataLabelPosition =
  'inside' | 'outside' | 'top' | 'bottom' | 'left' | 'right' | 'center';

/** What a data label shows. */
export type DataLabelContent =
  'value' | 'percent' | 'category' | 'value_percent';

/** Data-label display options. */
export interface DataLabelsConfig {
  /** Master toggle. */
  show?: boolean;
  /** Label placement. */
  position?: DataLabelPosition;
  /** What the label renders. */
  content?: DataLabelContent;
  /** Colour labels by a conditional rule (defers to `color`/CF wiring). */
  conditionalColor?: boolean;
  /** Only label the min and max marks (declutter). */
  onlyMinMax?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 10. Legend & tooltip
 * ──────────────────────────────────────────────────────────────────────── */

/** Legend placement around the plot. */
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';

/** Legend interaction style. */
export type LegendType = 'plain' | 'scroll';

/** Legend display options. */
export interface LegendConfig {
  /** Master toggle. */
  show?: boolean;
  /** Legend placement. */
  position?: LegendPosition;
  /** Plain vs scrollable legend. */
  type?: LegendType;
}

/** What triggers the tooltip. */
export type TooltipTrigger = 'item' | 'axis' | 'none';

/** Tooltip display options. */
export interface TooltipConfig {
  /** Master toggle. */
  enabled?: boolean;
  /** Hover trigger mode. */
  trigger?: TooltipTrigger;
  /** Extra columns to surface in the tooltip body. */
  customFields?: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * 11. Colour
 * ──────────────────────────────────────────────────────────────────────── */

/** Colour options: palette, per-value overrides, diverging scale, a11y. */
export interface ColorConfig {
  /** Named categorical / sequential palette id. */
  palette?: string;
  /** Explicit colour per category value (value → hex). */
  perValue?: Record<string, string>;
  /** Use a diverging colour scale (needs `midpoint`). */
  diverging?: boolean;
  /** Neutral pivot value for a diverging scale. */
  midpoint?: number;
  /** Mark opacity (0–1). */
  opacity?: number;
  /** Restrict to a colourblind-safe palette. */
  colorblindSafe?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 12. Reference lines
 * ──────────────────────────────────────────────────────────────────────── */

/** How a reference line's position is derived. */
export type ReferenceLineKind =
  'constant' | 'avg' | 'median' | 'min' | 'max' | 'percentile';

/** One reference line (optionally a band via `band`). */
export interface ReferenceLineConfig {
  /** How the line value is computed. */
  kind: ReferenceLineKind;
  /** Fixed value for `'constant'`, or the P value for `'percentile'`. */
  value?: number;
  /** Label rendered next to the line. */
  label?: string;
  /** Line / band colour. */
  color?: string;
  /** When true, render as a shaded band rather than a single line. */
  band?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 13. Sort & limit
 * ──────────────────────────────────────────────────────────────────────── */

/** What the sort orders by. */
export type SortBy = 'none' | 'dimension' | 'measure' | 'value';

/** Sort configuration. */
export interface SortConfig {
  /** What to sort on. */
  by?: SortBy;
  /** Sort direction. */
  direction?: SortDirection;
}

/** Top-/bottom-N limiting mode. */
export type LimitMode = 'none' | 'top' | 'bottom';

/** Row-limit / Top-N configuration. */
export interface LimitConfig {
  /** Limiting mode. */
  mode?: LimitMode;
  /** How many rows to keep. */
  count?: number;
  /** Roll the remainder into a single "Other" bucket. */
  otherBucket?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * 14. Null handling
 * ──────────────────────────────────────────────────────────────────────── */

/** How nulls in the value series are rendered. */
export type NullHandling = 'gap' | 'connect' | 'zero';

/* ────────────────────────────────────────────────────────────────────────
 * 15. Small multiples
 * ──────────────────────────────────────────────────────────────────────── */

/** Small-multiples (faceting) configuration. */
export interface SmallMultiplesConfig {
  /** Master toggle. */
  enabled?: boolean;
  /** Column the chart is faceted by. */
  facetColumn?: string;
  /** Maximum facet columns per row before wrapping. */
  maxCols?: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * 16. Interaction — cross-filter & drill
 * ──────────────────────────────────────────────────────────────────────── */

/** Interaction wiring for cross-filtering and drill-down. */
export interface InteractionConfig {
  /** Emit a cross-filter when a mark in this visual is clicked. */
  crossFilterEnabled?: boolean;
  /** Visual ids this visual's cross-filter applies to (empty = siblings). */
  crossFilterTargets?: string[];
  /** Ordered dimension columns for drill-down descent. */
  drillDimensions?: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * 17. Geo
 * ──────────────────────────────────────────────────────────────────────── */

/** Geospatial encoding for map visuals (choropleth / point / bubble maps). */
export interface GeoConfig {
  /** Column keyed to map regions (choropleth join key). */
  regionField?: string;
  /** Latitude column for point/bubble maps. */
  latField?: string;
  /** Longitude column for point/bubble maps. */
  lonField?: string;
  /** Registered map id / topology to render against. */
  mapId?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * The full config blob
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The complete, canonical shape of a visual's `config` JSONB. Every field
 * is optional. Waves add UI that reads/writes individual groups; the query
 * compiler and transform layer read the whole shape.
 */
export interface AnalysisVisualConfig {
  /** Column-to-channel encoding (the Data-tab wells). */
  encoding?: EncodingConfig;
  /** Server-side aggregation (GROUP BY wrap). */
  aggregation?: AggregationConfig;
  /** Window-function table calculation over the shaped result. */
  tableCalc?: TableCalcConfig;
  /** Period-relative time-intelligence transform. */
  timeIntel?: TimeIntelConfig;
  /** Numerator / denominator ratio measure. */
  ratioMeasure?: RatioMeasureConfig;
  /** Value + label formatting grammar. */
  format?: FormatConfig;
  /** Per-axis scale, bounds, and ticks. */
  axis?: AxisConfig;
  /** Per-series overrides (colour, type, axis binding). */
  series?: SeriesConfig[];
  /** How stacked series combine. */
  stacking?: StackingMode;
  /** Data-label display options. */
  dataLabels?: DataLabelsConfig;
  /** Legend display options. */
  legend?: LegendConfig;
  /** Tooltip display options. */
  tooltip?: TooltipConfig;
  /** Colour palette / per-value / diverging / a11y options. */
  color?: ColorConfig;
  /** Reference lines and bands. */
  referenceLines?: ReferenceLineConfig[];
  /** Sort configuration. */
  sort?: SortConfig;
  /** Top-/bottom-N limiting. */
  limit?: LimitConfig;
  /** How nulls in the value series render. */
  nullHandling?: NullHandling;
  /** Label used in place of a null category value. */
  nullLabel?: string;
  /** Small-multiples faceting. */
  smallMultiples?: SmallMultiplesConfig;
  /** Cross-filter and drill-down wiring. */
  interaction?: InteractionConfig;
  /** Geospatial encoding for map visuals. */
  geo?: GeoConfig;
}
