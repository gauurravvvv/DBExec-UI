import { Injectable } from '@angular/core';
import {
  ChartData,
  ChartDataMapping,
  MultiSeriesData,
  SingleSeriesData,
} from '../models';

/**
 * Chart type categories for determining data format
 */
const MULTI_SERIES_CHART_TYPES = [
  'line',
  'line-stacked',
  'line-step',
  'area',
  'area-stacked',
  'area-normalized',
  'polar',
];
const HEAT_MAP_CHART_TYPE = 'heat-map';
const BUBBLE_CHART_TYPE = 'bubble';
const BOX_CHART_TYPE = 'box-chart';
const SANKEY_CHART_TYPE = 'sankey';
const GRAPH_CHART_TYPE = 'graph';
const FLOW_LINES_CHART_TYPE = 'flow-lines';
const LINES3D_CHART_TYPE = 'lines3d';
const POLYGONS3D_CHART_TYPE = 'polygons3d';
const THREE_D_CHART_TYPES = ['bar3d', 'line3d', 'scatter3d'];

// New per-family chart-id sets — match the ECharts-canonical shapes we
// produce in phase 2. Each set maps a chart family to its dedicated
// transformer; transformData() dispatches by these first, then falls back
// to the legacy single-series path for charts that genuinely fit it.
const MULTI_BAR_CHART_TYPES = [
  'bar-vertical-2d',
  'bar-horizontal-2d',
  'bar-vertical-stacked',
  'bar-horizontal-stacked',
  'bar-vertical-normalized',
  'bar-horizontal-normalized',
];
const CANDLESTICK_CHART_TYPE = 'candlestick';
const HIERARCHY_CHART_TYPES = ['tree-map', 'sunburst', 'tree'];
const RADAR_CHART_TYPE = 'radar';
const PARALLEL_CHART_TYPE = 'parallel';
const THEME_RIVER_CHART_TYPE = 'theme-river';
const GLOBE_CHART_TYPE = 'globe';
const WORLD_MAP_CHART_TYPE = 'world-map';
const LINESGL_CHART_TYPE = 'linesgl';
const FLOWGL_CHART_TYPE = 'flowgl';

/**
 * Maximum label length for chart categories (prevents overflow)
 */
const MAX_LABEL_LENGTH = 25;

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
    try {
      if (!chartType || !rawData?.length) {
        return [];
      }

      // Heat-map requires special 3-dimensional handling
      if (this.isHeatMapChart(chartType)) {
        return this.transformToHeatMapFormat(rawData, mapping);
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
        return this.transformToBubbleFormat(rawData, mapping);
      }

      // Box plot requires statistical data format
      if (chartType === BOX_CHART_TYPE) {
        return this.transformToBoxPlotFormat(rawData, mapping);
      }

      // Sankey chart requires source, target, value format
      if (chartType === SANKEY_CHART_TYPE) {
        return this.transformToSankeyFormat(rawData, mapping);
      }

      // Graph chart uses same 3-field format as sankey
      if (chartType === GRAPH_CHART_TYPE) {
        return this.transformToSankeyFormat(rawData, mapping);
      }

      // Graph GL (WebGL-accelerated network) is the same node+link shape as
      // the regular graph — it had a builder (buildGraphGLChartOption) but no
      // transform case, so it fell through to the single-series transform and
      // produced no graphGL series. Route it to the sankey/graph transform.
      if (chartType === 'graphgl') {
        return this.transformToSankeyFormat(rawData, mapping);
      }

      // Flow-lines uses sankey source→target→value format
      if (chartType === FLOW_LINES_CHART_TYPE) {
        return this.transformToSankeyFormat(rawData, mapping);
      }

      // Lines 3D: [[lng, lat], ...] coordinate pairs for globe polyline.
      // When lngColumn/latColumn are explicitly set we use those (geo
      // canonical); otherwise fall back to xAxis/yAxis as legacy did.
      if (chartType === LINES3D_CHART_TYPE) {
        return this.transformToGeoLines3D(rawData, mapping);
      }

      // Polygons 3D: grouped polygon vertices by name
      if (chartType === POLYGONS3D_CHART_TYPE) {
        return this.transformToPolygons3DFormat(rawData, mapping);
      }

      // 3D charts need [[x, y, z], ...] coordinate format
      if (THREE_D_CHART_TYPES.includes(chartType)) {
        return this.transformTo3DFormat(rawData, mapping);
      }

      // ── New per-family transformers (Phase 2) ────────────────────────
      // Multi-series bars (2D / stacked / normalized) need a wrapped
      // shape — single series can't stack against itself.
      if (MULTI_BAR_CHART_TYPES.includes(chartType)) {
        return this.transformToMultiSeriesByValueColumns(rawData, mapping);
      }

      // Multi-line / multi-area when valueColumns are populated.
      // (Single-series fallback covered below.)
      if (
        MULTI_SERIES_CHART_TYPES.includes(chartType) &&
        mapping.valueColumns &&
        mapping.valueColumns.length > 0
      ) {
        return this.transformToMultiSeriesByValueColumns(rawData, mapping);
      }

      // Candlestick — OHLC ordering matches ECharts canonical [open, close, low, high]
      if (chartType === CANDLESTICK_CHART_TYPE) {
        return this.transformToOhlc(rawData, mapping);
      }

      // Hierarchical — tree/treemap/sunburst with parent column
      if (HIERARCHY_CHART_TYPES.includes(chartType)) {
        return this.transformToHierarchy(rawData, mapping);
      }

      // Radar — one value per indicator axis
      if (chartType === RADAR_CHART_TYPE) {
        return this.transformToRadar(rawData, mapping);
      }

      // Parallel — N-dim row per data point
      if (chartType === PARALLEL_CHART_TYPE) {
        return this.transformToParallel(rawData, mapping);
      }

      // Theme river — [time, value, category] triples
      if (chartType === THEME_RIVER_CHART_TYPE) {
        return this.transformToThemeRiver(rawData, mapping);
      }

      // Globe — [lng, lat, value] triples on geo coord system
      if (chartType === GLOBE_CHART_TYPE) {
        return this.transformToGeoLngLatValue(rawData, mapping);
      }

      // Lines GL — pair-of-points segments
      if (chartType === LINESGL_CHART_TYPE) {
        return this.transformToLineSegments(rawData, mapping);
      }

      // Flow GL — vector field [[x, y, vx, vy]...]
      if (chartType === FLOWGL_CHART_TYPE) {
        return this.transformToVectorField(rawData, mapping);
      }

      // Number-card — a single KPI value. It maps only yAxis (no category
      // axis), so the standard single-series transform (which groups by
      // xAxisColumn) yielded nothing and the card showed "No data available".
      // Aggregate the value column to one total. When xAxis IS also mapped we
      // still emit per-category rows so a multi-card layout can group by it.
      if (chartType === 'number-card') {
        const yCol = mapping.yAxisColumn;
        if (!yCol) return [];
        const yNumeric = this.isColumnNumeric(rawData, yCol);
        if (mapping.xAxisColumn) {
          const agg = new Map<string, number>();
          rawData.forEach(row => {
            const name = this.formatLabelValue(row[mapping.xAxisColumn!]);
            const val = yNumeric ? this.toNumber(row[yCol]) : 1;
            agg.set(name, (agg.get(name) || 0) + val);
          });
          return Array.from(agg.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        }
        const total = yNumeric
          ? rawData.reduce((s, row) => s + this.toNumber(row[yCol]), 0)
          : rawData.length;
        return [{ name: yCol, value: total }];
      }

      // Standard 2-field transformation
      const singleSeries = this.transformToSingleSeries(rawData, mapping);

      // Multi-series charts need wrapped format
      if (this.needsMultiSeriesFormat(chartType)) {
        return this.wrapAsMultiSeries(singleSeries);
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
   * Transform raw data to single-series format: [{name, value}]
   * Used for bar, pie, gauge, treemap, card charts
   *
   * Smart aggregation:
   * - Detects if Y-axis column is numeric by sampling
   * - If numeric: sums values by X-axis category
   * - If non-numeric: counts occurrences by X-axis category
   */
  private transformToSingleSeries(
    rawData: any[],
    mapping: ChartDataMapping,
  ): SingleSeriesData[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return [];
    }

    // Detect if Y-axis column contains numeric values by sampling
    const isYAxisNumeric = this.isColumnNumeric(rawData, mapping.yAxisColumn);
    const aggregatedMap = new Map<string, number>();

    rawData.forEach(row => {
      // Process X-axis value (category/name)
      const rawName = row[mapping.xAxisColumn!];
      const name = this.formatLabelValue(rawName);

      // Process Y-axis value (value/count)
      let value: number;
      if (isYAxisNumeric) {
        value = this.toNumber(row[mapping.yAxisColumn!]);
      } else {
        // Count occurrences for non-numeric columns
        value = 1;
      }

      const existing = aggregatedMap.get(name) || 0;
      aggregatedMap.set(name, existing + value);
    });

    return Array.from(aggregatedMap.entries())
      .filter(([_, value]) => value !== 0) // Filter out zero-value entries
      .sort((a, b) => b[1] - a[1]) // Sort by value descending
      .map(([name, value]) => ({ name, value }));
  }

  /**
   * Check if a column contains primarily numeric values
   * Samples up to 20 non-null values to determine type
   */
  private isColumnNumeric(data: any[], columnName: string): boolean {
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
   * Convert any value to a number safely
   * Returns 0 for non-numeric or invalid values
   */
  private toNumber(value: any): number {
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
   * Format any value into a display-friendly label string
   * Handles: strings, numbers, dates, booleans, null/undefined
   */
  private formatLabelValue(value: any): string {
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
      return this.formatDate(value);
    }

    // Handle ISO date strings (detect and format)
    const stringValue = String(value).trim();
    if (this.isISODateString(stringValue)) {
      return this.formatDate(new Date(stringValue));
    }

    // Truncate long strings
    if (stringValue.length > MAX_LABEL_LENGTH) {
      return stringValue.substring(0, MAX_LABEL_LENGTH - 3) + '...';
    }

    return stringValue || '(empty)';
  }

  /**
   * Check if a string looks like an ISO date
   */
  private isISODateString(value: string): boolean {
    // Match ISO 8601 date formats
    const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
    if (!isoPattern.test(value)) {
      return false;
    }
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  /**
   * Format a date for display in charts
   */
  private formatDate(date: Date): string {
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
   * Wrap single-series data into multi-series format
   * Used for line, area, polar charts
   */
  private wrapAsMultiSeries(
    singleSeries: SingleSeriesData[],
  ): MultiSeriesData[] {
    return [
      {
        name: 'Data Series',
        series: singleSeries,
      },
    ];
  }

  /**
   * Transform raw data to heat-map format (3D: row, column, value)
   * Groups data by xAxisColumn (rows) with yAxisColumn (columns) and zAxisColumn (values)
   */
  private transformToHeatMapFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): MultiSeriesData[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn || !mapping.zAxisColumn) {
      return [];
    }

    // Detect if Z-axis is numeric
    const isZAxisNumeric = this.isColumnNumeric(rawData, mapping.zAxisColumn);
    const rowMap = new Map<string, Map<string, number>>();

    rawData.forEach(row => {
      const rowName = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const colName = this.formatLabelValue(row[mapping.yAxisColumn!]);

      let value: number;
      if (isZAxisNumeric) {
        value = this.toNumber(row[mapping.zAxisColumn!]);
      } else {
        // Count occurrences for non-numeric Z-axis
        value = 1;
      }

      if (!rowMap.has(rowName)) {
        rowMap.set(rowName, new Map());
      }
      const colMap = rowMap.get(rowName)!;
      const existing = colMap.get(colName) || 0;
      colMap.set(colName, existing + value);
    });

    return Array.from(rowMap.entries()).map(([rowName, colMap]) => ({
      name: rowName,
      series: Array.from(colMap.entries()).map(([colName, value]) => ({
        name: colName,
        value,
      })),
    }));
  }

  /**
   * Check if chart type requires multi-series data format
   */
  needsMultiSeriesFormat(chartType: string | null): boolean {
    if (!chartType) return false;
    return MULTI_SERIES_CHART_TYPES.includes(chartType);
  }

  /**
   * Check if chart type is a heat-map
   */
  isHeatMapChart(chartType: string | null): boolean {
    return chartType === HEAT_MAP_CHART_TYPE;
  }

  /**
   * Transform data to bubble chart format
   * Bubble charts need: [{ name: 'Series', series: [{ name, x, y, r }] }]
   * Uses x-axis for x, y-axis for y, z-axis for bubble size (r)
   */
  private transformToBubbleFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): MultiSeriesData[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return [];
    }

    // ECharts bubble (scatter with size) expects numeric x AND y. When the
    // x column is non-numeric we substitute the row index as x (treating
    // bubble as a strip-plot grouped by category label). Previously this
    // function used `row[xAxisColumn]` twice — once as the category label,
    // once as the numeric x — which collapsed x to 0 for any category x.
    const isXNumeric = this.isColumnNumeric(rawData, mapping.xAxisColumn);
    const categoryMap = new Map<string, any[]>();

    rawData.forEach((row, rowIdx) => {
      // When X is numeric (the true XY scatter/bubble case) every row is a
      // distinct point — grouping by the X value would create one
      // single-point series per row (hundreds of series, each a different
      // colour). Put them all in ONE series instead. Only group into
      // separate (coloured) series when X is categorical.
      const category = isXNumeric
        ? 'points'
        : this.formatLabelValue(row[mapping.xAxisColumn!]);
      const x = isXNumeric ? this.toNumber(row[mapping.xAxisColumn!]) : rowIdx;
      const y = this.toNumber(row[mapping.yAxisColumn!]);
      const r = mapping.zAxisColumn
        ? this.toNumber(row[mapping.zAxisColumn])
        : 10; // Default size if no z-axis

      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }

      categoryMap.get(category)!.push({
        name: category,
        x: x,
        y: y,
        r: Math.max(r, 1), // Ensure minimum size
      });
    });

    // Convert to multi-series format
    return Array.from(categoryMap.entries()).map(([category, points]) => ({
      name: category,
      series: points,
    }));
  }

  /**
   * Transform data to box plot format
   * Box plots need: [{ name, value: [min, q1, median, q3, max] }]
   * Groups by x-axis and calculates statistics for y-axis values
   */
  private transformToBoxPlotFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    // Prefer the new `sampleColumn` role (raw samples — the canonical
    // ECharts input for boxplot). Fall back to yAxisColumn for visuals
    // created before the role spec existed.
    const sampleCol = mapping.sampleColumn ?? mapping.yAxisColumn;
    if (!mapping.xAxisColumn || !sampleCol) {
      return [];
    }

    const groupMap = new Map<string, number[]>();

    // Group numeric values by category
    rawData.forEach(row => {
      const category = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const value = this.toNumber(row[sampleCol!]);

      if (!groupMap.has(category)) {
        groupMap.set(category, []);
      }
      groupMap.get(category)!.push(value);
    });

    // Calculate box plot statistics for each group
    return Array.from(groupMap.entries()).map(([category, values]) => {
      const sorted = values.sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const q1 = this.percentile(sorted, 25);
      const median = this.percentile(sorted, 50);
      const q3 = this.percentile(sorted, 75);

      return {
        name: category,
        value: [min, q1, median, q3, max],
      };
    });
  }

  /**
   * Calculate percentile of a sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Transform data to sankey format (source → target with value)
   * Sankey needs: { nodes: [{name}], links: [{source, target, value}] }
   * Uses x-axis for source, y-axis for target, z-axis for value
   */
  private transformToSankeyFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return { nodes: [], links: [] };
    }

    const nodeSet = new Set<string>();
    const linkMap = new Map<string, number>();

    const hasValue = !!mapping.zAxisColumn;
    const isZNumeric = hasValue
      ? this.isColumnNumeric(rawData, mapping.zAxisColumn!)
      : false;

    rawData.forEach(row => {
      const source = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const target = this.formatLabelValue(row[mapping.yAxisColumn!]);
      if (source === target) return; // Skip self-loops

      nodeSet.add(source);
      nodeSet.add(target);

      const linkKey = `${source}→${target}`;
      const value =
        hasValue && isZNumeric ? this.toNumber(row[mapping.zAxisColumn!]) : 1;

      const existing = linkMap.get(linkKey) || 0;
      linkMap.set(linkKey, existing + value);
    });

    const nodes = Array.from(nodeSet).map(name => ({ name }));
    const links = Array.from(linkMap.entries()).map(([key, value]) => {
      const [source, target] = key.split('→');
      return { source, target, value };
    });

    return { nodes, links };
  }

  /**
   * Transform data to polygons3D format: [{name, coords: [[lng, lat], ...]}]
   * Groups rows by xAxisColumn (name) and collects [lng, lat] pairs from y/z columns
   */
  private transformToPolygons3DFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn || !mapping.zAxisColumn) {
      return [];
    }

    const polyMap = new Map<string, number[][]>();

    rawData.forEach(row => {
      const name = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const lng = this.toNumber(row[mapping.yAxisColumn!]);
      const lat = this.toNumber(row[mapping.zAxisColumn!]);

      if (!isFinite(lng) || !isFinite(lat)) return;

      if (!polyMap.has(name)) {
        polyMap.set(name, []);
      }
      polyMap.get(name)!.push([lng, lat]);
    });

    return Array.from(polyMap.entries()).map(([name, coords]) => ({
      name,
      coords,
    }));
  }

  /**
   * Transform data to 3D coordinate format: [[x, y, z], ...]
   * Used for bar3d, line3d, scatter3d chart types
   */
  private transformTo3DFormat(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return [];
    }

    return rawData
      .map(row => {
        const x = this.toNumber(row[mapping.xAxisColumn!]);
        const y = this.toNumber(row[mapping.yAxisColumn!]);
        const z = mapping.zAxisColumn
          ? this.toNumber(row[mapping.zAxisColumn])
          : 0;
        return [x, y, z];
      })
      .filter(([x, y, z]) => isFinite(x) && isFinite(y) && isFinite(z));
  }

  /**
   * Check if chart type requires a third dimension (z-axis)
   * Heat map, bubble, sankey, graph, and 3D charts benefit from a third dimension
   */
  requiresThirdDimension(chartType: string | null): boolean {
    return (
      this.isHeatMapChart(chartType) ||
      chartType === BUBBLE_CHART_TYPE ||
      chartType === SANKEY_CHART_TYPE ||
      chartType === GRAPH_CHART_TYPE ||
      chartType === POLYGONS3D_CHART_TYPE ||
      (!!chartType && THREE_D_CHART_TYPES.includes(chartType))
    );
  }

  /**
   * Get the field labels for a chart type
   * Returns appropriate labels based on chart category
   */
  getFieldLabels(chartType: string | null): {
    field1: string;
    field2: string;
    field3?: string;
  } {
    if (this.isHeatMapChart(chartType)) {
      return { field1: 'Row', field2: 'Column', field3: 'Value' };
    }

    if (chartType === BUBBLE_CHART_TYPE) {
      return { field1: 'X-Axis', field2: 'Y-Axis', field3: 'Size' };
    }

    if (chartType === BOX_CHART_TYPE) {
      return { field1: 'Category', field2: 'Values' };
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

  /**
   * Validate if a visual has all required fields for chart data
   */
  hasRequiredFields(visual: any): boolean {
    if (!visual?.chartType) return false;

    if (this.requiresThirdDimension(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }

    // number-card needs only a value (yAxis) — it shows a single metric, no
    // category axis. Requiring xAxis too left it permanently on "No data
    // available" when the user mapped only the value field (which is all its
    // role spec asks for: required ['yAxis'], optional ['xAxis']).
    if (visual.chartType === 'number-card') {
      return !!visual.yAxisColumn;
    }

    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  // ── New per-family transformers (Phase 2) ───────────────────────────────

  /**
   * Multi-series bars / lines / areas. `xAxisColumn` defines the category;
   * `yAxisColumn` is the first value series; `valueColumns` carries any
   * additional series. Output shape matches `MultiSeriesData[]`:
   *
   *   [{ name: <seriesName>, series: [{ name: <category>, value: <n> }, ...] }]
   *
   * One outer entry per series — that's what every consumer of multi-series
   * shape (line/area/2D-bar builders) already expects.
   */
  private transformToMultiSeriesByValueColumns(
    rawData: any[],
    mapping: ChartDataMapping,
  ): MultiSeriesData[] {
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return [];
    }
    const valueCols = [mapping.yAxisColumn!, ...(mapping.valueColumns ?? [])];

    // Aggregate one numeric-or-count per (series, category)
    return valueCols.map(col => {
      const isNumeric = this.isColumnNumeric(rawData, col);
      const aggregated = new Map<string, number>();
      rawData.forEach(row => {
        const name = this.formatLabelValue(row[mapping.xAxisColumn!]);
        const value = isNumeric ? this.toNumber(row[col]) : 1;
        aggregated.set(name, (aggregated.get(name) ?? 0) + value);
      });
      return {
        name: col,
        series: Array.from(aggregated.entries()).map(([name, value]) => ({
          name,
          value,
        })),
      };
    });
  }

  /**
   * Candlestick — `[[open, close, low, high], ...]` per category.
   * Empty rows or missing role columns surface as `null` data items so
   * ECharts skips them rather than rendering a zero-height candle.
   */
  private transformToOhlc(rawData: any[], mapping: ChartDataMapping): any {
    const { xAxisColumn, openColumn, highColumn, lowColumn, closeColumn } =
      mapping;
    if (
      !xAxisColumn ||
      !openColumn ||
      !highColumn ||
      !lowColumn ||
      !closeColumn
    ) {
      return { categories: [], values: [] };
    }
    const categories: string[] = [];
    const values: (number[] | null)[] = [];
    rawData.forEach(row => {
      categories.push(this.formatLabelValue(row[xAxisColumn]));
      const o = this.toNumber(row[openColumn]);
      const c = this.toNumber(row[closeColumn]);
      const l = this.toNumber(row[lowColumn]);
      const h = this.toNumber(row[highColumn]);
      if (!isFinite(o) || !isFinite(c) || !isFinite(l) || !isFinite(h)) {
        values.push(null);
      } else {
        values.push([o, c, l, h]);
      }
    });
    return { categories, values };
  }

  /**
   * Hierarchical — tree/treemap/sunburst. Reads `xAxisColumn` (name),
   * `yAxisColumn` (value), `parentColumn` (parent-name). Rows with a null
   * or empty parent become roots. Returns a forest (array of trees); the
   * tree builder wraps a single synthetic root around it if needed.
   *
   * If no `parentColumn` is set, returns flat `{name, value}[]` as siblings
   * of an implicit root — matches old behaviour.
   */
  private transformToHierarchy(rawData: any[], mapping: ChartDataMapping): any {
    const { xAxisColumn, yAxisColumn, parentColumn } = mapping;
    if (!xAxisColumn || !yAxisColumn) {
      return [];
    }
    if (!parentColumn) {
      // Flat fallback (no hierarchy). AGGREGATE by name — previously this
      // mapped every raw row 1:1, so a treemap/sunburst over e.g. 1000 rows of
      // 4 products produced 1000 tiny slivers instead of 4 summed tiles. Sum
      // the value per distinct name so each category is one node.
      const agg = new Map<string, number>();
      rawData.forEach(row => {
        const name = this.formatLabelValue(row[xAxisColumn]);
        if (!name || name === '(empty)') return;
        agg.set(name, (agg.get(name) || 0) + this.toNumber(row[yAxisColumn]));
      });
      return Array.from(agg.entries()).map(([name, value]) => ({
        name,
        value,
      }));
    }
    // Build a name → node map, then attach children to their parents.
    const nodes = new Map<
      string,
      { name: string; value: number; children: any[] }
    >();
    rawData.forEach(row => {
      const name = this.formatLabelValue(row[xAxisColumn]);
      const value = this.toNumber(row[yAxisColumn]);
      if (!name || name === '(empty)') return;
      if (nodes.has(name)) {
        // Aggregate duplicate-named rows
        nodes.get(name)!.value += value;
      } else {
        nodes.set(name, { name, value, children: [] });
      }
    });
    const roots: any[] = [];
    rawData.forEach(row => {
      const name = this.formatLabelValue(row[xAxisColumn]);
      const node = nodes.get(name);
      if (!node) return;
      const rawParent = row[parentColumn];
      const parentName =
        rawParent === null || rawParent === undefined || rawParent === ''
          ? null
          : this.formatLabelValue(rawParent);
      if (parentName === null || parentName === name) {
        if (!roots.includes(node)) roots.push(node);
      } else {
        const parent = nodes.get(parentName);
        if (parent && !parent.children.includes(node)) {
          parent.children.push(node);
        } else if (!parent && !roots.includes(node)) {
          // Orphan — parent doesn't exist; treat as root so it still renders.
          roots.push(node);
        }
      }
    });
    return roots;
  }

  /**
   * Radar — `[{name, value: [v1, v2, ...vK]}]`. `xAxisColumn` is the series
   * name; each row becomes one polygon. `indicatorColumns` defines the K
   * radar axes (in order). Each indicator's max is derived from the column.
   */
  private transformToRadar(rawData: any[], mapping: ChartDataMapping): any {
    const { xAxisColumn, indicatorColumns } = mapping;
    if (!xAxisColumn || !indicatorColumns?.length) {
      return { indicators: [], series: [] };
    }
    const indicators = indicatorColumns.map(col => {
      const max = Math.max(
        0,
        ...rawData.map(r => this.toNumber(r[col])).filter(v => isFinite(v)),
      );
      return { name: col, max: max || 1 };
    });
    const series = rawData.map(row => ({
      name: this.formatLabelValue(row[xAxisColumn]),
      value: indicatorColumns.map(col => this.toNumber(row[col])),
    }));
    return { indicators, series };
  }

  /**
   * Parallel — `[[d0, d1, ...dN], ...]` plus `parallelAxis[]` config. Reads
   * `dimensionColumns` (ordered). xAxis is optional and, when set, used as
   * the line-name (legend entry).
   */
  private transformToParallel(rawData: any[], mapping: ChartDataMapping): any {
    const { xAxisColumn, dimensionColumns } = mapping;
    if (!dimensionColumns?.length) {
      return { axes: [], data: [] };
    }
    const axes = dimensionColumns.map((col, idx) => ({
      dim: idx,
      name: col,
      type: this.isColumnNumeric(rawData, col) ? 'value' : 'category',
    }));
    const data = rawData.map(row => {
      const values = dimensionColumns.map(col => {
        return this.isColumnNumeric(rawData, col)
          ? this.toNumber(row[col])
          : this.formatLabelValue(row[col]);
      });
      const name = xAxisColumn
        ? this.formatLabelValue(row[xAxisColumn])
        : undefined;
      return name ? { name, value: values } : values;
    });
    return { axes, data };
  }

  /**
   * Theme river — `[[time, value, category], ...]`. If `timeColumn` is set
   * we use its values; otherwise we synthesise a time axis from the row
   * index so legacy visuals still render (the old behaviour).
   */
  private transformToThemeRiver(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    const { xAxisColumn, yAxisColumn, timeColumn } = mapping;
    if (!xAxisColumn || !yAxisColumn) return [];
    return rawData.map((row, idx) => {
      const time = timeColumn ? row[timeColumn] : idx;
      const value = this.toNumber(row[yAxisColumn]);
      const category = this.formatLabelValue(row[xAxisColumn]);
      return [time, value, category];
    });
  }

  /**
   * Globe / geo overlay — `[{value: [lng, lat, value]}, ...]`.
   * `lngColumn` / `latColumn` are required; `yAxisColumn` (if set)
   * carries the third numeric value, otherwise 1.
   */
  private transformToGeoLngLatValue(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    const { lngColumn, latColumn, yAxisColumn } = mapping;
    if (!lngColumn || !latColumn) return [];
    return rawData
      .map(row => {
        const lng = this.toNumber(row[lngColumn]);
        const lat = this.toNumber(row[latColumn]);
        const value = yAxisColumn ? this.toNumber(row[yAxisColumn]) : 1;
        return isFinite(lng) && isFinite(lat)
          ? { value: [lng, lat, value] }
          : null;
      })
      .filter((v): v is { value: number[] } => v !== null);
  }

  /**
   * Lines 3D on globe — pair-of-points segments. Prefer lng/lat roles
   * when set; fall back to x/y for backwards compat (legacy behaviour
   * was to read xAxis as lng and yAxis as lat).
   */
  private transformToGeoLines3D(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    const lngCol = mapping.lngColumn ?? mapping.xAxisColumn;
    const latCol = mapping.latColumn ?? mapping.yAxisColumn;
    if (!lngCol || !latCol) return [];
    return rawData
      .map(row => {
        const lng = this.toNumber(row[lngCol]);
        const lat = this.toNumber(row[latCol]);
        return isFinite(lng) && isFinite(lat) ? [lng, lat, 0] : null;
      })
      .filter((v): v is number[] => v !== null);
  }

  /**
   * Lines GL — multi-segment polyline. Each row contributes a vertex; the
   * builder splits into `[start, end]` pairs.
   */
  private transformToLineSegments(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    const lngCol = mapping.lngColumn ?? mapping.xAxisColumn;
    const latCol = mapping.latColumn ?? mapping.yAxisColumn;
    if (!lngCol || !latCol) return [];
    const points: number[][] = [];
    rawData.forEach(row => {
      const x = this.toNumber(row[lngCol]);
      const y = this.toNumber(row[latCol]);
      if (isFinite(x) && isFinite(y)) points.push([x, y]);
    });
    // Build consecutive [start, end] pairs as separate line segments.
    const segments: any[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({ coords: [points[i], points[i + 1]] });
    }
    return segments;
  }

  /**
   * Flow GL — vector field `[[x, y, vx, vy], ...]`. Needs four columns
   * mapped: x = lngColumn, y = latColumn, vx = xAxisColumn, vy = yAxisColumn
   * (legacy roles repurposed for the velocity components).
   */
  private transformToVectorField(
    rawData: any[],
    mapping: ChartDataMapping,
  ): any[] {
    const { lngColumn, latColumn, xAxisColumn, yAxisColumn } = mapping;
    if (!lngColumn || !latColumn || !xAxisColumn || !yAxisColumn) return [];
    return rawData
      .map(row => {
        const x = this.toNumber(row[lngColumn]);
        const y = this.toNumber(row[latColumn]);
        const vx = this.toNumber(row[xAxisColumn]);
        const vy = this.toNumber(row[yAxisColumn]);
        return isFinite(x) && isFinite(y) && isFinite(vx) && isFinite(vy)
          ? [x, y, vx, vy]
          : null;
      })
      .filter((v): v is number[] => v !== null);
  }

  /**
   * Build a ChartDataMapping from a Visual — central helper consumed by all
   * the call sites so they don't each have to know which role columns to
   * forward. New roles added to Visual only need to be added here.
   */
  buildMapping(visual: any): ChartDataMapping {
    return {
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
    };
  }
}
