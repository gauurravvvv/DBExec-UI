export const CHART_TYPES = [
  {
    id: 'bar-vertical',
    name: 'Bar Chart',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Displays data using vertical bars to compare values across categories',
  },
  {
    id: 'bar-horizontal',
    name: 'Horizontal Bar',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Shows data with horizontal bars, ideal for long category names',
    rotate: true,
  },
  {
    id: 'bar-vertical-2d',
    name: 'Grouped Vertical',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Compares multiple data series side-by-side within each category',
  },
  {
    id: 'bar-horizontal-2d',
    name: 'Grouped Horizontal',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Displays multiple series horizontally for easy comparison across groups',
    rotate: true,
  },
  {
    id: 'bar-vertical-stacked',
    name: 'Stacked Vertical',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Shows part-to-whole relationships by stacking bars vertically',
  },
  {
    id: 'bar-horizontal-stacked',
    name: 'Stacked Horizontal',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Presents stacked data horizontally to show composition and totals',
    rotate: true,
  },
  {
    id: 'bar-vertical-normalized',
    name: 'Normalized Vertical',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Displays proportions as percentages with bars normalized to 100%',
  },
  {
    id: 'bar-horizontal-normalized',
    name: 'Normalized Horizontal',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description: 'Shows percentage distribution horizontally across categories',
    rotate: true,
  },

  // Line Charts
  {
    id: 'line',
    name: 'Line Chart',
    icon: 'pi pi-chart-line',
    category: 'Line Charts',
    description: 'Visualizes trends and changes over continuous data or time',
  },
  {
    id: 'polar',
    name: 'Polar Chart',
    icon: 'pi pi-sun',
    category: 'Line Charts',
    description:
      'Displays multivariate data on a circular grid for pattern comparison',
  },

  // Area Charts
  {
    id: 'area',
    name: 'Area Chart',
    icon: 'pi pi-chart-line',
    category: 'Area Charts',
    description: 'Shows trends over time with filled areas under the line',
  },
  {
    id: 'area-stacked',
    name: 'Stacked Area',
    icon: 'pi pi-chart-line',
    category: 'Area Charts',
    description:
      'Illustrates cumulative totals and individual contributions over time',
  },
  {
    id: 'area-normalized',
    name: 'Normalized Area',
    icon: 'pi pi-chart-line',
    category: 'Area Charts',
    description:
      'Displays proportional trends normalized to 100% at each point',
  },

  // Pie Charts
  {
    id: 'pie',
    name: 'Pie Chart',
    icon: 'pi pi-chart-pie',
    category: 'Pie Charts',
    description: 'Shows parts of a whole as slices of a circular chart',
  },
  {
    id: 'pie-advanced',
    name: 'Advanced Pie',
    icon: 'pi pi-chart-pie',
    category: 'Pie Charts',
    description:
      'Enhanced pie chart with legend, labels, and calculated totals',
  },
  {
    id: 'pie-grid',
    name: 'Pie Grid',
    icon: 'pi pi-th-large',
    category: 'Pie Charts',
    description: 'Displays multiple pie charts in a grid for comparison',
  },
  {
    id: 'donut',
    name: 'Donut Chart',
    icon: 'pi pi-circle',
    category: 'Pie Charts',
    description:
      'Circular chart with center cutout, ideal for displaying key metrics',
  },

  // Gauges
  {
    id: 'gauge',
    name: 'Gauge',
    icon: 'pi pi-compass',
    category: 'Gauges',
    description:
      'Shows a single value on a radial scale with min and max ranges',
  },
  {
    id: 'linear-gauge',
    name: 'Linear Gauge',
    icon: 'pi pi-minus',
    category: 'Gauges',
    description:
      'Displays progress or value along a horizontal or vertical bar',
  },

  // Other Charts
  {
    id: 'number-card',
    name: 'Number Cards',
    icon: 'pi pi-hashtag',
    category: 'Cards',
    description: 'Presents key metrics as large, prominent numerical displays',
  },
  {
    id: 'heat-map',
    name: 'Heat Map',
    icon: 'pi pi-table',
    category: 'Maps',
    description: 'Uses color intensity to represent values in a matrix layout',
  },
  {
    id: 'tree-map',
    name: 'Tree Map',
    icon: 'pi pi-sitemap',
    category: 'Maps',
    description:
      'Visualizes hierarchical data using nested rectangles sized by value',
  },
  {
    id: 'bubble',
    name: 'Bubble Chart',
    icon: 'pi pi-circle-fill',
    category: 'Scatter',
    description: 'Plots three dimensions using X, Y position and bubble size',
  },
  {
    id: 'box-chart',
    name: 'Box Chart',
    icon: 'pi pi-box',
    category: 'Statistical',
    description:
      'Shows data distribution through quartiles, median, and outliers',
  },
];

export const COLOR_SCHEMES = [
  { label: 'Vivid', value: 'vivid' },
  { label: 'Natural', value: 'natural' },
  { label: 'Cool', value: 'cool' },
  { label: 'Fire', value: 'fire' },
  { label: 'Solar', value: 'solar' },
  { label: 'Air', value: 'air' },
  { label: 'Aqua', value: 'aqua' },
  { label: 'Flame', value: 'flame' },
  { label: 'Ocean', value: 'ocean' },
  { label: 'Forest', value: 'forest' },
  { label: 'Horizon', value: 'horizon' },
  { label: 'Neons', value: 'neons' },
];

export const CURVE_TYPES = [
  { label: 'Linear', value: 'linear' },
  { label: 'Smooth', value: 'monotoneX' },
  { label: 'Step', value: 'step' },
  { label: 'Basis', value: 'basis' },
  { label: 'Cardinal', value: 'cardinal' },
];

export const LEGEND_POSITIONS = [
  { label: 'Right', value: 'right' },
  { label: 'Below', value: 'below' },
];

// Default chart configuration with all possible options
export const DEFAULT_CHART_CONFIG = {
  // Color
  colorScheme: 'vivid',
  // Axis
  xAxis: true,
  yAxis: true,
  showGridLines: true,
  roundDomains: false,
  // Labels
  showXAxisLabel: true,
  showYAxisLabel: true,
  xAxisLabel: 'Category',
  yAxisLabel: 'Value',
  showDataLabel: false,
  // Legend
  legend: false,
  legendTitle: 'Legend',
  legendPosition: 'right',
  // Styling
  gradient: false,
  animations: false,
  // Tooltip
  tooltipDisabled: false,
  // Bar chart specific
  barPadding: 8,
  roundEdges: false,
  noBarWhenZero: true,
  // Line chart specific
  curveType: 'linear',
  autoScale: true,
  timeline: false,
  rangeFillOpacity: 0.15,
  // Pie chart specific
  labels: true,
  trimLabels: true,
  maxLabelLength: 10,
  doughnut: false,
  arcWidth: 0.25,
  explodeSlices: false,
  // Polar chart specific
  labelTrim: true,
  labelTrimSize: 10,
  showSeriesOnHover: true,
  // Gauge chart specific
  min: 0,
  max: 100,
  units: '%',
  bigSegments: 10,
  smallSegments: 5,
  showAxis: true,
  angleSpan: 240,
  startAngle: -120,
  showText: true,
  // Card chart specific
  cardColor: '',
  bandColor: '',
  textColor: '',
  emptyColor: 'rgba(0, 0, 0, 0)',
  innerPadding: 15,
  // Heat map specific
  trimXAxisTicks: true,
  trimYAxisTicks: true,
  rotateXAxisTicks: true,
  maxXAxisTickLength: 16,
  maxYAxisTickLength: 16,
  wrapTicks: false,
  // Bubble chart specific
  minRadius: 3,
  maxRadius: 20,
};

// Chart type arrays for helper functions
const BAR_CHART_TYPES = [
  'bar-vertical',
  'bar-horizontal',
  'bar-vertical-2d',
  'bar-horizontal-2d',
  'bar-vertical-stacked',
  'bar-horizontal-stacked',
  'bar-vertical-normalized',
  'bar-horizontal-normalized',
];

const AREA_CHART_TYPES = ['area', 'area-stacked', 'area-normalized'];

const PIE_CHART_TYPES = ['pie', 'pie-advanced', 'pie-grid', 'donut'];

const GAUGE_CHART_TYPES = ['gauge', 'linear-gauge'];

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

const NO_GRADIENT_CHART_TYPES = [
  'polar',
  'gauge',
  'linear-gauge',
  'number-card',
];

// Helper functions for chart type checking
export function isBarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return BAR_CHART_TYPES.includes(chartType);
}

export function isAreaChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return AREA_CHART_TYPES.includes(chartType);
}

export function isPieChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return PIE_CHART_TYPES.includes(chartType);
}

export function isGaugeChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return GAUGE_CHART_TYPES.includes(chartType);
}

export function isCardChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'number-card';
}

export function isHeatMapChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'heat-map';
}

export function isTreeMapChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'tree-map';
}

export function hasAxisLabels(chartType: string | null): boolean {
  if (!chartType) return false;
  return !NO_AXIS_CHART_TYPES.includes(chartType);
}

export function supportsGradient(chartType: string | null): boolean {
  if (!chartType) return false;
  return !NO_GRADIENT_CHART_TYPES.includes(chartType);
}

// Get a fresh copy of default chart config
export function getDefaultChartConfig(): any {
  return { ...DEFAULT_CHART_CONFIG };
}
