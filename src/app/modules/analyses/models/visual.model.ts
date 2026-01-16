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
 * Visual object representing a chart on the canvas
 */
export interface Visual {
  /** Unique identifier for the visual */
  id: number;

  /** Display title of the visual */
  title: string;

  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** X position on canvas */
  x: number;

  /** Y position on canvas */
  y: number;

  /** Chart type identifier (e.g., 'bar-vertical', 'line', 'pie') */
  chartType: string | null;

  /** Column name for X-axis / Category mapping */
  xAxisColumn: string | null;

  /** Column name for Y-axis / Value mapping */
  yAxisColumn: string | null;

  /** Column name for Z-axis / third dimension (heat-map) */
  zAxisColumn: string | null;

  /** Pre-computed chart data - using any[] for template compatibility with different chart components */
  chartData: any[];

  /** Chart configuration options */
  config: any;
}

/**
 * Dataset field definition from the API
 */
export interface DatasetField {
  id: number;
  columnToUse: string;
  columnToView: string;
  customLogic: string | null;
  isCfUsed: number;
}

/**
 * Dataset details containing metadata and fields
 */
export interface DatasetDetails {
  id: number;
  name: string;
  description?: string;
  datasetFields: DatasetField[];
}

/**
 * Axis selection mode type
 */
export type AxisSelection = 'x' | 'y' | 'z' | null;

/**
 * Field labels for different chart types
 */
export interface FieldLabels {
  field1: string;
  field2: string;
  field3?: string;
}

/**
 * Factory function to create a new Visual with default values
 */
export function createVisual(id: number, config: any): Visual {
  return {
    id,
    title: 'Untitled Visual',
    width: 400,
    height: 350,
    x: 0,
    y: 0,
    chartType: null,
    xAxisColumn: null,
    yAxisColumn: null,
    zAxisColumn: null,
    chartData: [],
    config,
  };
}
