import { Injectable } from '@angular/core';
import {
  ChartDataPoint,
  ChartSeriesData,
  ChartDataMapping,
  ChartData,
  Visual,
  SingleSeriesData,
  MultiSeriesData,
} from '../models';

/**
 * Chart type categories for determining data format
 */
const MULTI_SERIES_CHART_TYPES = [
  'line',
  'area',
  'area-stacked',
  'area-normalized',
  'polar',
];
const HEAT_MAP_CHART_TYPE = 'heat-map';

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
    mapping: ChartDataMapping
  ): ChartData {
    try {
      if (!chartType || !rawData?.length) {
        return [];
      }

      // Heat-map requires special 3-dimensional handling
      if (this.isHeatMapChart(chartType)) {
        return this.transformToHeatMapFormat(rawData, mapping);
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
        error
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
    mapping: ChartDataMapping
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
    singleSeries: SingleSeriesData[]
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
    mapping: ChartDataMapping
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
   * Check if chart type requires a third dimension (z-axis)
   */
  requiresThirdDimension(chartType: string | null): boolean {
    return this.isHeatMapChart(chartType);
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

    // Check if it's a chart with axes (bar, line, area, etc.)
    const NO_AXIS_CHART_TYPES = [
      'pie',
      'pie-advanced',
      'pie-grid',
      'donut',
      'gauge',
      'linear-gauge',
      'number-card',
      'tree-map',
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
