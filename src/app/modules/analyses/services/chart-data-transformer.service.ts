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

      // Bubble chart requires x, y, r format with 3 dimensions
      if (chartType === BUBBLE_CHART_TYPE) {
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

      // Flow-lines uses sankey source→target→value format
      if (chartType === FLOW_LINES_CHART_TYPE) {
        return this.transformToSankeyFormat(rawData, mapping);
      }

      // Lines 3D: [[lng, lat], ...] coordinate pairs for globe polyline
      if (chartType === LINES3D_CHART_TYPE) {
        return this.transformTo3DFormat(rawData, mapping);
      }

      // Polygons 3D: grouped polygon vertices by name
      if (chartType === POLYGONS3D_CHART_TYPE) {
        return this.transformToPolygons3DFormat(rawData, mapping);
      }

      // 3D charts need [[x, y, z], ...] coordinate format
      if (THREE_D_CHART_TYPES.includes(chartType)) {
        return this.transformTo3DFormat(rawData, mapping);
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
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
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

    const bubbleData: any[] = [];
    const categoryMap = new Map<string, any[]>();

    rawData.forEach(row => {
      const category = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const x = this.toNumber(row[mapping.xAxisColumn!]);
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
    if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
      return [];
    }

    const groupMap = new Map<string, number[]>();

    // Group numeric values by category
    rawData.forEach(row => {
      const category = this.formatLabelValue(row[mapping.xAxisColumn!]);
      const value = this.toNumber(row[mapping.yAxisColumn!]);

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

    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }
}
