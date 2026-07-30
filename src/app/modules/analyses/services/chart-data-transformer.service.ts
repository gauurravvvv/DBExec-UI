import { Injectable } from '@angular/core';
import {
  transformTo3DFormat,
  transformToBoxPlotFormat,
  transformToBubbleFormat,
  transformToGeoLines3D,
  transformToGeoLngLatValue,
  transformToHeatMapFormat,
  transformToHierarchy,
  transformToHistogram,
  transformToLineSegments,
  transformToMultiSeriesByValueColumns,
  transformToOhlc,
  transformToParallel,
  transformToPolygons3DFormat,
  transformToRadar,
  transformToSankeyFormat,
  transformToSingleSeries,
  transformToThemeRiver,
  transformToVectorField,
} from '../helpers/chart-shape-transforms';

import {
  MULTI_SERIES_CHART_TYPES,
  BUBBLE_CHART_TYPE,
  BOX_CHART_TYPE,
  SANKEY_CHART_TYPE,
  GRAPH_CHART_TYPE,
  FLOW_LINES_CHART_TYPE,
  LINES3D_CHART_TYPE,
  POLYGONS3D_CHART_TYPE,
  THREE_D_CHART_TYPES,
  MULTI_BAR_CHART_TYPES,
  CANDLESTICK_CHART_TYPE,
  COMBO_CHART_TYPE,
  HISTOGRAM_CHART_TYPE,
  HIERARCHY_CHART_TYPES,
  RADAR_CHART_TYPE,
  PARALLEL_CHART_TYPE,
  THEME_RIVER_CHART_TYPE,
  GLOBE_CHART_TYPE,
  LINESGL_CHART_TYPE,
  FLOWGL_CHART_TYPE,
} from '../constants/chart-type-categories';
import {
  aggregateSamples,
  formatBinBoundary,
  formatCategoryLabel,
  formatCategoryValue,
  formatDate,
  formatLabelValue,
  formatMeasureValue,
  hasRequiredFields,
  isColumnNumeric,
  isHeatMapChart,
  isISODateString,
  isSingleSeriesShape,
  needsMultiSeriesFormat,
  percentile,
  quantile,
  requiresThirdDimension,
  sortChronologicallyIfTemporal,
  toNumber,
  wrapAsMultiSeries,
} from '../helpers/chart-transform-utils';

import { formatValue } from '../helpers/format-grammar';
import { chronoSortKey, looksTemporal } from '../helpers/temporal';
import {
  ChartData,
  ChartDataMapping,
  MultiSeriesData,
  SingleSeriesData,
} from '../models';
import {
  AnalysisAnalyticsService,
  CompareMode,
  Point,
  QuickCalc,
} from './analysis-analytics.service';

/** Default category label for a retained null dimension value (null-as-member). */

/**
 * Service to transform raw data into chart-compatible formats
 *
 * Features:
 * - Universal data type detection (numeric, string, date, boolean)
 * - Smart aggregation (sum for numbers, count for non-numbers)
 * - Automatic label truncation for long strings
 * - Date parsing and formatting
 * - Empty/null value handling
 * - Zero-value filtering
 */
@Injectable({
  providedIn: 'root',
})
export class ChartDataTransformerService {
  constructor(private analytics: AnalysisAnalyticsService) {}

  /**
   * Transform raw data into the appropriate chart format based on chart type
   * @param chartType - The type of chart (e.g., 'bar-vertical', 'line', 'heat-map')
   * @param rawData - Array of raw data objects from the store
   * @param mapping - Column mapping for axes
   * @returns Transformed data array in the correct format for the chart
   */
  transformData(
    chartType: string | null,
    rawData: any[],
    mapping: ChartDataMapping,
  ): ChartData {
    const shaped = this.transformDataRaw(chartType, rawData, mapping);
    // Slice B: apply the per-measure quick calc + period-over-period
    // compare to the shaped {name,value} series after the base transform.
    return this.applyAnalytics(chartType, shaped, mapping);
  }

  /**
   * Base transform (pre-analytics). Split out so applyAnalytics can layer
   * the quick-calc / compare transforms onto the shaped result.
   */
  private transformDataRaw(
    chartType: string | null,
    rawData: any[],
    mapping: ChartDataMapping,
  ): ChartData {
    try {
      if (!chartType || !rawData?.length) {
        return [];
      }

      // Heat-map requires special 3-dimensional handling
      if (isHeatMapChart(chartType)) {
        return transformToHeatMapFormat(rawData, mapping);
      }

      // Bubble + scatter share the numeric X/Y transform. Scatter and
      // effect-scatter are true XY plots: both axes must be continuous and
      // each row is a point at (xColumn, yColumn). Without this they fell
      // through to the default single-series (category) transform, which
      // bucketed X as a category and collapsed Y to a per-category count —
      // so every point landed on a flat line. transformToBubbleFormat
      // defaults the radius (r=10) when no z-axis is mapped, which is exactly
      // what a plain scatter needs.
      if (
        chartType === BUBBLE_CHART_TYPE ||
        chartType === 'scatter' ||
        chartType === 'effect-scatter'
      ) {
        return transformToBubbleFormat(rawData, mapping);
      }

      // Box plot requires statistical data format
      if (chartType === BOX_CHART_TYPE) {
        return transformToBoxPlotFormat(rawData, mapping);
      }

      // Sankey chart requires source, target, value format
      if (chartType === SANKEY_CHART_TYPE) {
        return transformToSankeyFormat(rawData, mapping);
      }

      // Graph chart uses same 3-field format as sankey
      if (chartType === GRAPH_CHART_TYPE) {
        return transformToSankeyFormat(rawData, mapping);
      }

      // Graph GL (WebGL-accelerated network) is the same node+link shape as
      // the regular graph — it had a builder (buildGraphGLChartOption) but no
      // transform case, so it fell through to the single-series transform and
      // produced no graphGL series. Route it to the sankey/graph transform.
      if (chartType === 'graphgl') {
        return transformToSankeyFormat(rawData, mapping);
      }

      // Flow-lines uses sankey source→target→value format
      if (chartType === FLOW_LINES_CHART_TYPE) {
        return transformToSankeyFormat(rawData, mapping);
      }

      // Lines 3D: [[lng, lat], ...] coordinate pairs for globe polyline.
      // When lngColumn/latColumn are explicitly set we use those (geo
      // canonical); otherwise fall back to xAxis/yAxis as legacy did.
      if (chartType === LINES3D_CHART_TYPE) {
        return transformToGeoLines3D(rawData, mapping);
      }

      // Polygons 3D: grouped polygon vertices by name
      if (chartType === POLYGONS3D_CHART_TYPE) {
        return transformToPolygons3DFormat(rawData, mapping);
      }

      // 3D charts need [[x, y, z], ...] coordinate format
      if (THREE_D_CHART_TYPES.includes(chartType)) {
        return transformTo3DFormat(rawData, mapping, chartType);
      }

      // Histogram — auto-bin a single numeric column into frequency buckets.
      if (chartType === HISTOGRAM_CHART_TYPE) {
        return transformToHistogram(rawData, mapping);
      }

      // ── New per-family transformers (Phase 2) ────────────────────────
      // Multi-series bars (2D / stacked / normalized) need a wrapped
      // shape — single series can't stack against itself. Combo (bars + line
      // dual-axis) uses the identical multi-series-by-value-columns shape.
      if (
        MULTI_BAR_CHART_TYPES.includes(chartType) ||
        chartType === COMBO_CHART_TYPE
      ) {
        return transformToMultiSeriesByValueColumns(rawData, mapping);
      }

      // Multi-line / multi-area when valueColumns are populated.
      // (Single-series fallback covered below.)
      if (
        MULTI_SERIES_CHART_TYPES.includes(chartType) &&
        mapping.valueColumns &&
        mapping.valueColumns.length > 0
      ) {
        return transformToMultiSeriesByValueColumns(rawData, mapping);
      }

      // Candlestick — OHLC ordering matches ECharts canonical [open, close, low, high]
      if (chartType === CANDLESTICK_CHART_TYPE) {
        return transformToOhlc(rawData, mapping);
      }

      // Hierarchical — tree/treemap/sunburst with parent column
      if (HIERARCHY_CHART_TYPES.includes(chartType)) {
        return transformToHierarchy(rawData, mapping);
      }

      // Radar — one value per indicator axis
      if (chartType === RADAR_CHART_TYPE) {
        return transformToRadar(rawData, mapping);
      }

      // Parallel — N-dim row per data point
      if (chartType === PARALLEL_CHART_TYPE) {
        return transformToParallel(rawData, mapping);
      }

      // Theme river — [time, value, category] triples
      if (chartType === THEME_RIVER_CHART_TYPE) {
        return transformToThemeRiver(rawData, mapping);
      }

      // Globe — [lng, lat, value] triples on geo coord system
      if (chartType === GLOBE_CHART_TYPE) {
        return transformToGeoLngLatValue(rawData, mapping);
      }

      // Lines GL — pair-of-points segments
      if (chartType === LINESGL_CHART_TYPE) {
        return transformToLineSegments(rawData, mapping);
      }

      // Flow GL — vector field [[x, y, vx, vy]...]
      if (chartType === FLOWGL_CHART_TYPE) {
        return transformToVectorField(rawData, mapping);
      }

      // Number-card — a single KPI value. It maps only yAxis (no category
      // axis), so the standard single-series transform (which groups by
      // xAxisColumn) yielded nothing and the card showed "No data available".
      // Aggregate the value column to one total. When xAxis IS also mapped we
      // still emit per-category rows so a multi-card layout can group by it.
      if (chartType === 'number-card') {
        const yCol = mapping.yAxisColumn;
        if (!yCol) return [];
        const yNumeric = isColumnNumeric(rawData, yCol);
        const aggFn = mapping.aggregate ?? null;
        // Pure count mode: explicit COUNT, or a non-numeric measure with no
        // explicit aggregate (legacy). Otherwise reduce the numeric samples by
        // the chosen function so a KPI's AVG/MIN/MAX/etc. is correct.
        const countMode = aggFn === 'count' || (!yNumeric && !aggFn);
        if (mapping.xAxisColumn) {
          const buckets = new Map<string, number[]>();
          const counts = new Map<string, number>();
          rawData.forEach(row => {
            const name = formatLabelValue(row[mapping.xAxisColumn!]);
            if (countMode) {
              counts.set(name, (counts.get(name) || 0) + 1);
            } else {
              const b = buckets.get(name) ?? [];
              b.push(toNumber(row[yCol]));
              buckets.set(name, b);
            }
          });
          return countMode
            ? Array.from(counts.entries()).map(([name, value]) => ({
                name,
                value,
              }))
            : Array.from(buckets.entries()).map(([name, samples]) => ({
                name,
                value: aggregateSamples(
                  samples,
                  aggFn,
                  mapping.percentile,
                ),
              }));
        }
        const total = countMode
          ? rawData.length
          : aggregateSamples(
              rawData.map(row => toNumber(row[yCol])),
              aggFn,
              mapping.percentile,
            );
        return [{ name: yCol, value: total }];
      }

      // Standard 2-field transformation
      const singleSeries = transformToSingleSeries(rawData, mapping);

      // Multi-series charts need wrapped format
      if (needsMultiSeriesFormat(chartType)) {
        return wrapAsMultiSeries(singleSeries);
      }

      return singleSeries;
    } catch (error) {
      console.error(
        'ChartDataTransformerService: Error transforming data',
        error,
      );
      return [];
    }
  }

  /**
   * Slice B — layer the analytics transforms onto the shaped chart data.
   * Handles both single-series (`{name,value}[]`) and multi-series
   * (`{name,series:[…]}[]`) shapes; each numeric series is transformed
   * in the order the base transform emitted it.
   *
   *  1. Quick calc (running total / % of total / difference / % diff /
   *     moving average / rank) — applied per series.
   *  2. Period-over-period — when a compare mode is set, appends a
   *     "prior period" companion series (multi-series shapes only, where
   *     a secondary series reads cleanly on a time chart).
   *
   * A no-op (returns the input) when neither is configured, so untouched
   * charts keep their exact previous shape/labels.
   */
  applyAnalytics(
    chartType: string | null,
    data: ChartData,
    mapping: ChartDataMapping,
  ): ChartData {
    const calc: QuickCalc = mapping.quickCalc ?? null;
    const compareMode: CompareMode = mapping.compareMode ?? null;
    if (!calc && !compareMode) return data;
    if (!Array.isArray(data) || data.length === 0) return data;

    const win = mapping.movingAverageWindow ?? 3;

    // Single-series shape — array of {name,value}.
    if (isSingleSeriesShape(data)) {
      const pts = data as unknown as Point[];
      const calced = calc
        ? this.analytics.applyQuickCalcToPoints(pts, calc, win)
        : pts;
      // A compare on a single-series chart can't add a second series
      // (there's no series wrapper), so we leave the shape as-is; the
      // KPI card + multi-series charts carry the compare visualisation.
      return calced as unknown as ChartData;
    }

    // Multi-series shape — array of {name, series:[{name,value}]}.
    const multi = data as MultiSeriesData[];
    const transformed: MultiSeriesData[] = multi.map(s => ({
      name: s.name,
      series: calc
        ? this.analytics.applyQuickCalcToPoints(s.series as Point[], calc, win)
        : s.series,
    }));

    if (compareMode) {
      // Append a prior-period companion for the FIRST measure series so the
      // time chart shows current vs prior. Uses the base (pre-quick-calc)
      // series so the comparison reflects real values.
      const base = multi[0]?.series as Point[] | undefined;
      if (base && base.length > 1) {
        const { previous } = this.analytics.splitForCompare(base, compareMode);
        if (previous.length > 0) {
          // Re-align prior points onto the current category labels so the
          // two series share an x-axis.
          const current = multi[0].series as Point[];
          const offset = current.length - previous.length;
          const aligned: Point[] = current.map((p, i) => {
            const idx = i - offset;
            return {
              name: p.name,
              value:
                idx >= 0 && idx < previous.length ? previous[idx].value : 0,
            };
          });
          transformed.push({
            name: this.PRIOR_SERIES_NAME,
            series: aligned,
          });
        }
      }
    }

    return transformed;
  }

  /** Label used for the appended prior-period companion series. */
  private readonly PRIOR_SERIES_NAME = 'Prior period';


  /**
   * Get the field labels for a chart type
   * Returns appropriate labels based on chart category
   */
  getFieldLabels(chartType: string | null): {
    field1: string;
    field2: string;
    field3?: string;
  } {
    if (isHeatMapChart(chartType)) {
      return { field1: 'Row', field2: 'Column', field3: 'Value' };
    }

    if (chartType === BUBBLE_CHART_TYPE) {
      return { field1: 'X-Axis', field2: 'Y-Axis', field3: 'Size' };
    }

    if (chartType === BOX_CHART_TYPE) {
      return { field1: 'Category', field2: 'Values' };
    }

    // Histogram bins a single numeric column; field2 is the computed frequency.
    if (chartType === HISTOGRAM_CHART_TYPE) {
      return { field1: 'Value', field2: 'Frequency' };
    }

    if (
      chartType === SANKEY_CHART_TYPE ||
      chartType === GRAPH_CHART_TYPE ||
      chartType === FLOW_LINES_CHART_TYPE
    ) {
      return { field1: 'Source', field2: 'Target', field3: 'Value' };
    }

    if (chartType === 'world-map') {
      return { field1: 'Region', field2: 'Value' };
    }

    if (chartType === LINES3D_CHART_TYPE) {
      return { field1: 'Longitude', field2: 'Latitude' };
    }

    if (chartType === POLYGONS3D_CHART_TYPE) {
      return { field1: 'Name', field2: 'Longitude', field3: 'Latitude' };
    }

    if (chartType && THREE_D_CHART_TYPES.includes(chartType)) {
      return { field1: 'X-Axis', field2: 'Y-Axis', field3: 'Z-Axis' };
    }

    // Check if it's a chart with axes (bar, line, area, etc.)
    const NO_AXIS_CHART_TYPES = [
      'pie',
      'pie-advanced',
      'pie-grid',
      'donut',
      'half-donut',
      'nested-pie',
      'rose',
      'gauge',
      'linear-gauge',
      'number-card',
      'tree-map',
      'funnel',
      'sunburst',
      'tree',
      'theme-river',
      'bar-polar',
    ];

    if (!chartType || NO_AXIS_CHART_TYPES.includes(chartType)) {
      return { field1: 'Category', field2: 'Value' };
    }

    return { field1: 'X-Axis', field2: 'Y-Axis' };
  }


  buildMapping(visual: any): ChartDataMapping {
    const mapping: ChartDataMapping = {
      xAxisColumn: visual.xAxisColumn ?? null,
      yAxisColumn: visual.yAxisColumn ?? null,
      zAxisColumn: visual.zAxisColumn ?? null,
      openColumn: visual.openColumn ?? null,
      highColumn: visual.highColumn ?? null,
      lowColumn: visual.lowColumn ?? null,
      closeColumn: visual.closeColumn ?? null,
      sampleColumn: visual.sampleColumn ?? null,
      parentColumn: visual.parentColumn ?? null,
      indicatorColumns: visual.indicatorColumns ?? [],
      dimensionColumns: visual.dimensionColumns ?? [],
      valueColumns: visual.valueColumns ?? [],
      lngColumn: visual.lngColumn ?? null,
      latColumn: visual.latColumn ?? null,
      timeColumn: visual.timeColumn ?? null,
      histogramBins: Number(visual.config?.histogramBins) || 0,
      // Slice B analytics — quick calc + compare read off the visual config.
      quickCalc: visual.config?.quickCalc ?? null,
      movingAverageWindow: Number(visual.config?.movingAverageWindow) || 3,
      compareMode: visual.config?.compare?.mode ?? null,

      // ── Type-semantics (Wave 2) ──────────────────────────────────────
      // Value / label format grammar + null handling from config.format /
      // config.nullHandling / config.nullLabel (the AnalysisVisualConfig
      // shape). Absent → no explicit format + legacy null handling.
      valueFormat: visual.config?.format?.value ?? undefined,
      labelFormat: visual.config?.format?.label ?? undefined,
      nullHandling: visual.config?.nullHandling ?? undefined,
      // Null-as-member: opt-in via config.nullAsMember, or implied when the
      // author named a null category (config.nullLabel present).
      nullAsMember:
        visual.config?.nullAsMember === true ||
        typeof visual.config?.nullLabel === 'string',
      nullLabel: visual.config?.nullLabel ?? undefined,
    };

    // ── Aggregation shape (Track D) ──────────────────────────────────
    // When the visual declares an `aggregate`, group by the dimension over the
    // measure. The Analyses editor + dashboard render CLIENT-SIDE: the shared
    // query returns RAW rows (never a server-grouped `value` column), so the
    // transformer must aggregate the REAL measure column with the chosen
    // function itself. Point x = dimension, y = the real measure column, and
    // carry the aggregate + percentile so the category transforms accumulate
    // correctly (SUM/AVG/MIN/MAX/COUNT/COUNT_DISTINCT/MEDIAN/…) instead of the
    // blind SUM that made every aggregate render as a row COUNT. Combo extra
    // measures come from config.aggregations[].column. No-op when `aggregate`
    // is absent (raw-row back-compat).
    if (visual.aggregate) {
      mapping.xAxisColumn =
        visual.dimensionColumn ?? visual.xAxisColumn ?? null;
      mapping.yAxisColumn = visual.measureColumn ?? visual.yAxisColumn ?? null;
      mapping.aggregate = visual.aggregate;
      mapping.percentile =
        typeof visual.config?.percentile === 'number'
          ? visual.config.percentile
          : undefined;
      const extras = Array.isArray(visual.config?.aggregations)
        ? visual.config.aggregations
            .map((a: any) => a?.column)
            .filter((v: any) => typeof v === 'string' && v.length > 0)
        : [];
      if (extras.length > 0) {
        // Primary measure first, then the combo measure columns.
        mapping.valueColumns = [mapping.yAxisColumn, ...extras].filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
      }
    }

    return mapping;
  }
  /**
   * Public delegate kept for external callers (edit-analyses uses it to match a
   * clicked category against a mapping). The implementation is the free function
   * in chart-transform-utils; this preserves the service's public surface.
   */
  formatCategoryValue(value: any, mapping: ChartDataMapping): string {
    return formatCategoryValue(value, mapping);
  }

}
