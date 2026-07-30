/**
 * Pure formatting, numeric and shape helpers for the chart data transformer.
 *
 * Extracted verbatim: none read instance state, so they are free functions the
 * service delegates to.
 */
import {
  ChartData,
  ChartDataMapping,
  MultiSeriesData,
  SingleSeriesData,
} from '../models';
import {
  DEFAULT_NULL_MEMBER_LABEL,
  MULTI_SERIES_CHART_TYPES,
  HEAT_MAP_CHART_TYPE,
  BUBBLE_CHART_TYPE,
  SANKEY_CHART_TYPE,
  GRAPH_CHART_TYPE,
  POLYGONS3D_CHART_TYPE,
  THREE_D_CHART_TYPES,
  MAX_LABEL_LENGTH,
} from '../constants/chart-type-categories';
import { chronoSortKey, looksTemporal } from '../helpers/temporal';
import { formatValue } from '../helpers/format-grammar';

/**
 * Reduce a bucket of numeric samples to a single value per the chosen
 * aggregate function. Client-side twin of the BE aggregation wrap so the
 * editor + dashboard (which never receive server-grouped rows) compute the
 * SAME measure the author picked instead of blindly summing. Unknown / absent
 * functions fall back to SUM (the legacy default). GENERALISED — no column or
 * domain assumptions.
 */
export function aggregateSamples(
  values: number[],
  fn: string | null | undefined,
  percentile?: number,
): number {
  if (!values.length) return 0;
  switch (fn) {
    case 'avg': {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    case 'min':
      // reduce (not Math.min(...values)) so a very large bucket can't blow
      // the argument-count stack limit.
      return values.reduce((a, b) => (b < a ? b : a), values[0]);
    case 'max':
      return values.reduce((a, b) => (b > a ? b : a), values[0]);
    case 'count':
      return values.length;
    case 'count_distinct':
      return new Set(values).size;
    case 'median':
      return quantile(values, 0.5);
    case 'percentile': {
      const p =
        typeof percentile === 'number' && percentile >= 0 && percentile <= 100
          ? percentile / 100
          : 0.9;
      return quantile(values, p);
    }
    case 'stddev':
    case 'variance': {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
        values.length;
      return fn === 'variance' ? variance : Math.sqrt(variance);
    }
    case 'sum':
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

/** Compact numeric label for a histogram bin edge. */
export function formatBinBoundary(n: number): string {
  if (!Number.isFinite(n)) return '';
  // Keep small decimals readable; round wide ranges to whole numbers.
  const abs = Math.abs(n);
  if (abs >= 1000) return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function formatCategoryLabel(value: any, mapping: ChartDataMapping): string {
  if (value === null || value === undefined || value === '') {
    return mapping.nullAsMember
      ? mapping.nullLabel || DEFAULT_NULL_MEMBER_LABEL
      : '(empty)';
  }
  if (mapping.labelFormat) {
    const formatted = formatValue(value, mapping.labelFormat);
    // Guard: if the grammar produced an empty string for a non-null value,
    // fall back so the category never silently disappears.
    if (formatted !== '') return formatted;
  }
  return formatLabelValue(value);
}

/**
 * PUBLIC formatting authority (code-review CR-1). Formats a raw category
 * value to its display label exactly as the chart does, so callers outside
 * the transformer (e.g. the editor resolving a clicked tick label back to
 * its raw value for cross-filter/drill) share ONE formatting definition and
 * never drift. Thin delegate to the private formatCategoryLabel.
 */
export function formatCategoryValue(value: any, mapping: ChartDataMapping): string {
  return formatCategoryLabel(value, mapping);
}

/**
 * Format a date for display in charts
 */
export function formatDate(date: Date): string {
  if (isNaN(date.getTime())) {
    return '(invalid date)';
  }
  // Format as "MMM DD, YYYY" (e.g., "Dec 16, 2025")
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${
    months[date.getMonth()]
  } ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Format any value into a display-friendly label string
 * Handles: strings, numbers, dates, booleans, null/undefined
 */
export function formatLabelValue(value: any): string {
  // Handle null/undefined/empty
  if (value === null || value === undefined || value === '') {
    return '(empty)';
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Handle numbers
  if (typeof value === 'number') {
    return String(value);
  }

  // Handle Date objects
  if (value instanceof Date) {
    return formatDate(value);
  }

  // Handle ISO date strings (detect and format)
  const stringValue = String(value).trim();
  if (isISODateString(stringValue)) {
    return formatDate(new Date(stringValue));
  }

  // Truncate long strings
  if (stringValue.length > MAX_LABEL_LENGTH) {
    return stringValue.substring(0, MAX_LABEL_LENGTH - 3) + '...';
  }

  return stringValue || '(empty)';
}

/**
 * Type-semantics (Wave 2) category-label formatter. Layers null-as-member
 * and the author's label ValueFormat on top of the legacy formatLabelValue:
 *
 *   - null / undefined / '' →
 *       • `nullLabel` (default '(null)') when `nullAsMember` is on;
 *       • the legacy '(empty)' otherwise (unchanged behaviour).
 *   - a configured `labelFormat` routes the value through the format grammar
 *     (so a date dimension can render 'MMM yyyy', a code can carry a prefix,
 *     etc.). When no labelFormat is set we fall back to formatLabelValue so
 *     existing charts look identical.
 *
 * Returns the display label; callers still aggregate by this string.
 */

/**
 * WAVE2-FORMAT-HOOK — public measure-value formatter for the ECharts option
 * builder (owned by Waves 3/4). The transformer intentionally keeps `value`
 * as a RAW number so downstream calcs (stacking, %-of-total, reference
 * lines) stay numeric; the display string is produced only at the render
 * edge — axis tick labels, data labels, tooltip value fields.
 *
 * The builder should call this at each of those sites, passing the visual's
 * value ValueFormat (mapping.valueFormat / config.format.value):
 *
 *   formatter: (v) => transformer.formatMeasureValue(v, mapping.valueFormat)
 *
 * Kept here (not in the builder) so all value formatting funnels through the
 * one pure grammar and the builder file stays owned by its wave. A no-format
 * (undefined) input returns a plain grouped-number string.
 */
export function formatMeasureValue(
  value: number | string | null | undefined,
  fmt?: import('../models/visual-config.model').ValueFormat,
): string {
  return formatValue(value, fmt);
}

/**
 * Validate if a visual has all required fields for chart data
 */
export function hasRequiredFields(visual: any): boolean {
  if (!visual?.chartType) return false;

  if (requiresThirdDimension(visual.chartType)) {
    return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
  }

  // number-card needs only a value (yAxis) — it shows a single metric, no
  // category axis. Requiring xAxis too left it permanently on "No data
  // available" when the user mapped only the value field (which is all its
  // role spec asks for: required ['yAxis'], optional ['xAxis']).
  if (visual.chartType === 'number-card') {
    return !!visual.yAxisColumn;
  }

  // Histogram bins a single numeric column — only the X (measure) role is
  // required; Y is the computed frequency.
  if (visual.chartType === 'histogram') {
    return !!visual.xAxisColumn;
  }

  return !!(visual.xAxisColumn && visual.yAxisColumn);
}

// ── New per-family transformers (Phase 2) ───────────────────────────────

/**
 * Check if a column contains primarily numeric values
 * Samples up to 20 non-null values to determine type
 */
export function isColumnNumeric(data: any[], columnName: string): boolean {
  let numericCount = 0;
  let sampleCount = 0;
  const sampleSize = Math.min(20, data.length);

  for (let i = 0; i < data.length && sampleCount < sampleSize; i++) {
    const value = data[i][columnName];
    if (value !== null && value !== undefined && value !== '') {
      sampleCount++;
      // Accept both real numbers AND numeric strings. SQL drivers return
      // Postgres NUMERIC/DECIMAL columns as strings over JSON, so a strict
      // `typeof === 'number'` test wrongly classified numeric columns
      // (e.g. marketing/revenue) as categorical — which made scatter group
      // every row into its own single-point series.
      const num = typeof value === 'number' ? value : Number(value);
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
      }
    }
  }

  // Consider numeric if more than 80% of samples are valid numbers
  return sampleCount > 0 && numericCount / sampleCount >= 0.8;
}

/**
 * Check if chart type is a heat-map
 */
export function isHeatMapChart(chartType: string | null): boolean {
  return chartType === HEAT_MAP_CHART_TYPE;
}

/**
 * Check if a string looks like an ISO date
 */
export function isISODateString(value: string): boolean {
  // Match ISO 8601 date formats
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
  if (!isoPattern.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/** True when `data` is the flat single-series `{name,value}[]` shape. */
export function isSingleSeriesShape(data: ChartData): boolean {
  const first = (data as any[])[0];
  return !!first && typeof first === 'object' && !('series' in first);
}

/**
 * Check if chart type requires multi-series data format
 */
export function needsMultiSeriesFormat(chartType: string | null): boolean {
  if (!chartType) return false;
  return MULTI_SERIES_CHART_TYPES.includes(chartType);
}

/**
 * Calculate percentile of a sorted array
 */
export function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Linear-interpolated quantile (q in [0,1]) over a numeric sample. */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/**
 * Check if chart type requires a third dimension (z-axis)
 * Heat map, bubble, sankey, graph, and 3D charts benefit from a third dimension
 */
export function requiresThirdDimension(chartType: string | null): boolean {
  return (
    isHeatMapChart(chartType) ||
    chartType === BUBBLE_CHART_TYPE ||
    chartType === SANKEY_CHART_TYPE ||
    chartType === GRAPH_CHART_TYPE ||
    chartType === POLYGONS3D_CHART_TYPE ||
    (!!chartType && THREE_D_CHART_TYPES.includes(chartType))
  );
}

/**
 * Order a category series chronologically when its underlying dimension is
 * temporal, otherwise leave the order untouched. `rawCategoryFor` maps a
 * shaped point back to the RAW (pre-format) x value so the sort keys off the
 * real date, not the formatted label — fixing the "Apr, Aug, Dec…"
 * alphabetical bug. No-op (returns input) when the dimension isn't temporal.
 */
export function sortChronologicallyIfTemporal<T extends { name: string }>(
  points: T[],
  rawByLabel: Map<string, unknown>,
): T[] {
  const rawValues = points.map(p => rawByLabel.get(p.name));
  if (!looksTemporal(rawValues)) return points;
  return [...points].sort(
    (a, b) =>
      chronoSortKey(rawByLabel.get(a.name)) -
      chronoSortKey(rawByLabel.get(b.name)),
  );
}

/**
 * Convert any value to a number safely
 * Returns 0 for non-numeric or invalid values
 */
export function toNumber(value: any): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const parsed = parseFloat(String(value));
  return isFinite(parsed) ? parsed : 0;
}

/**
 * Wrap single-series data into multi-series format
 * Used for line, area, polar charts
 */
export function wrapAsMultiSeries(
  singleSeries: SingleSeriesData[],
): MultiSeriesData[] {
  return [
    {
      name: 'Data Series',
      series: singleSeries,
    },
  ];
}
