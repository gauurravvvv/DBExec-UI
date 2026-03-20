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

  /** Pre-computed chart data - using any[] for template compatibility with different chart components */
  chartData: any[];

  /** Chart configuration options */
  config: any;
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
 * Field labels for different chart types
 */
export interface FieldLabels {
  field1: string;
  field2: string;
  field3?: string;
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
    chartData: [],
    config,
  };
}
