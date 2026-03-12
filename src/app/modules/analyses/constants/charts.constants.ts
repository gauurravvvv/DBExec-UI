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

  // Scatter Charts
  {
    id: 'scatter',
    name: 'Scatter Plot',
    icon: 'pi pi-circle',
    category: 'Scatter',
    description:
      'Plots individual data points by X and Y values to reveal patterns and correlations',
  },
  {
    id: 'effect-scatter',
    name: 'Ripple Scatter',
    icon: 'pi pi-circle',
    category: 'Scatter',
    description:
      'Scatter plot with animated ripple effects to highlight data points',
  },

  // Funnel Charts
  {
    id: 'funnel',
    name: 'Funnel Chart',
    icon: 'pi pi-sort-amount-down',
    category: 'Funnel',
    description:
      'Visualizes progressive reduction of data through stages, ideal for conversion pipelines',
  },

  // Hierarchical Charts
  {
    id: 'sunburst',
    name: 'Sunburst Chart',
    icon: 'pi pi-sun',
    category: 'Hierarchical',
    description:
      'Displays hierarchical data as concentric rings, showing part-to-whole relationships',
  },
  {
    id: 'tree',
    name: 'Tree Diagram',
    icon: 'pi pi-sitemap',
    category: 'Hierarchical',
    description:
      'Visualizes parent-child relationships in a branching tree structure',
  },

  // Flow Charts
  {
    id: 'sankey',
    name: 'Sankey Diagram',
    icon: 'pi pi-arrows-h',
    category: 'Flow',
    description:
      'Shows flow and quantity between nodes, ideal for energy, budget, or traffic analysis',
  },
  {
    id: 'graph',
    name: 'Network Graph',
    icon: 'pi pi-share-alt',
    category: 'Flow',
    description:
      'Displays relationships between entities as a force-directed network diagram',
  },

  // Line Chart Variants
  {
    id: 'line-stacked',
    name: 'Stacked Line',
    icon: 'pi pi-chart-line',
    category: 'Line Charts',
    description:
      'Shows cumulative trends by stacking multiple data series on a line chart',
  },
  {
    id: 'line-step',
    name: 'Step Line',
    icon: 'pi pi-chart-line',
    category: 'Line Charts',
    description:
      'Displays data as a step function with sharp transitions between values',
  },

  // Pie Chart Variants
  {
    id: 'half-donut',
    name: 'Half Donut',
    icon: 'pi pi-circle',
    category: 'Pie Charts',
    description:
      'Semi-circle donut chart showing proportions in a 180-degree arc',
  },
  {
    id: 'nested-pie',
    name: 'Nested Pie',
    icon: 'pi pi-circle',
    category: 'Pie Charts',
    description:
      'Multi-ring pie chart with inner summary and outer detail rings',
  },
  {
    id: 'rose',
    name: 'Rose Chart',
    icon: 'pi pi-circle',
    category: 'Pie Charts',
    description:
      'Nightingale rose chart where slices vary in radius to show magnitude differences',
  },

  // Bar Chart Variants
  {
    id: 'waterfall',
    name: 'Waterfall Chart',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Shows cumulative effect of sequential positive and negative values on a total',
  },
  {
    id: 'pictorial-bar',
    name: 'Pictorial Bar',
    icon: 'pi pi-image',
    category: 'Bar Charts',
    description:
      'Bar chart using custom shapes and symbols instead of plain rectangles',
  },
  {
    id: 'bar-polar',
    name: 'Polar Bar',
    icon: 'pi pi-chart-bar',
    category: 'Bar Charts',
    description:
      'Bar chart rendered in polar/circular coordinates for radial comparison',
  },

  // Special Charts
  {
    id: 'theme-river',
    name: 'Theme River',
    icon: 'pi pi-chart-line',
    category: 'Special',
    description:
      'Displays thematic data changes over time as a flowing river visualization',
  },
  {
    id: 'radar',
    name: 'Radar Chart',
    icon: 'pi pi-sun',
    category: 'Statistical',
    description:
      'Displays multivariate data on a radial grid, ideal for comparing performance across dimensions',
  },
  {
    id: 'candlestick',
    name: 'Candlestick Chart',
    icon: 'pi pi-chart-bar',
    category: 'Financial',
    description:
      'Shows open, high, low, close values for financial time series data',
  },
  {
    id: 'parallel',
    name: 'Parallel Coordinates',
    icon: 'pi pi-bars',
    category: 'Statistical',
    description:
      'Visualizes multi-dimensional data by drawing parallel vertical axes with connected lines',
  },

  // 3D Charts (require echarts-gl)
  {
    id: 'bar3d',
    name: 'Bar 3D',
    icon: 'pi pi-chart-bar',
    category: '3D Charts',
    description:
      'Three-dimensional bar chart for spatial data comparison',
  },
  {
    id: 'line3d',
    name: 'Line 3D',
    icon: 'pi pi-chart-line',
    category: '3D Charts',
    description:
      'Three-dimensional line chart for visualizing trajectories and paths in 3D space',
  },
  {
    id: 'scatter3d',
    name: 'Scatter 3D',
    icon: 'pi pi-circle',
    category: '3D Charts',
    description:
      'Three-dimensional scatter plot for exploring relationships across three variables',
  },
  {
    id: 'surface',
    name: 'Surface Chart',
    icon: 'pi pi-map',
    category: '3D Charts',
    description:
      'Renders continuous 3D surfaces from mathematical equations or data grids',
  },
  {
    id: 'globe',
    name: 'Globe',
    icon: 'pi pi-globe',
    category: '3D Charts',
    description:
      'Interactive 3D globe visualization for geospatial data points',
  },
  {
    id: 'graphgl',
    name: 'Graph GL',
    icon: 'pi pi-share-alt',
    category: '3D Charts',
    description:
      'WebGL-accelerated network graph for large-scale relationship data with GPU rendering',
  },
  {
    id: 'scattergl',
    name: 'Scatter GL',
    icon: 'pi pi-circle',
    category: '3D Charts',
    description:
      'WebGL-accelerated scatter plot for rendering millions of data points efficiently',
  },
  {
    id: 'linesgl',
    name: 'Lines GL',
    icon: 'pi pi-chart-line',
    category: '3D Charts',
    description:
      'WebGL-accelerated line rendering for large-scale polyline datasets',
  },
  {
    id: 'map3d',
    name: 'Map 3D',
    icon: 'pi pi-map',
    category: '3D Charts',
    description:
      'Three-dimensional geographic map visualization with height-encoded data',
  },
  {
    id: 'flowgl',
    name: 'Flow GL',
    icon: 'pi pi-arrows-alt',
    category: '3D Charts',
    description:
      'WebGL-accelerated vector field flow visualization for wind, current, or magnetic field data',
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
  { label: 'Macarons', value: 'macarons' },
  { label: 'Walden', value: 'walden' },
  { label: 'Vintage', value: 'vintage' },
  { label: 'Dark', value: 'dark' },
  { label: 'Roma', value: 'roma' },
  { label: 'Infographic', value: 'infographic' },
  { label: 'Picnic', value: 'picnic' },
  { label: 'Night', value: 'night' },
  { label: 'Night Lights', value: 'nightLights' },
  { label: 'Shine', value: 'shine' },
  { label: 'Westeros', value: 'westeros' },
];

// ECharts-native dropdown options

export const LEGEND_POSITIONS = [
  { label: 'Top', value: 'top' },
  { label: 'Right', value: 'right' },
  { label: 'Bottom', value: 'below' },
  { label: 'Left', value: 'left' },
];

export const LEGEND_TYPES = [
  { label: 'Plain', value: 'plain' },
  { label: 'Scroll', value: 'scroll' },
];

export const LABEL_POSITIONS = [
  { label: 'Top', value: 'top' },
  { label: 'Right', value: 'right' },
  { label: 'Bottom', value: 'bottom' },
  { label: 'Left', value: 'left' },
  { label: 'Inside', value: 'inside' },
  { label: 'Inside Left', value: 'insideLeft' },
  { label: 'Inside Right', value: 'insideRight' },
  { label: 'Inside Top', value: 'insideTop' },
  { label: 'Inside Bottom', value: 'insideBottom' },
];

export const TOOLTIP_TRIGGERS = [
  { label: 'Item', value: 'item' },
  { label: 'Axis', value: 'axis' },
  { label: 'None', value: 'none' },
];

export const AXIS_POINTER_TYPES = [
  { label: 'Line', value: 'line' },
  { label: 'Shadow', value: 'shadow' },
  { label: 'Cross', value: 'cross' },
  { label: 'None', value: 'none' },
];

export const GRID_LINE_STYLES = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

export const EMPHASIS_MODES = [
  { label: 'None', value: 'none' },
  { label: 'Self', value: 'self' },
  { label: 'Series', value: 'series' },
];

export const ANIMATION_EASINGS = [
  { label: 'Linear', value: 'linear' },
  { label: 'Cubic Out', value: 'cubicOut' },
  { label: 'Elastic Out', value: 'elasticOut' },
  { label: 'Bounce Out', value: 'bounceOut' },
  { label: 'Quadratic In/Out', value: 'quadraticInOut' },
  { label: 'Exponential Out', value: 'exponentialOut' },
];

// Line/Area chart ECharts options
export const LINE_STEP_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Start', value: 'start' },
  { label: 'Middle', value: 'middle' },
  { label: 'End', value: 'end' },
];

export const LINE_STYLE_TYPES = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

export const SYMBOL_SHAPES = [
  { label: 'Circle', value: 'circle' },
  { label: 'Rectangle', value: 'rect' },
  { label: 'Round Rect', value: 'roundRect' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Pin', value: 'pin' },
  { label: 'Arrow', value: 'arrow' },
  { label: 'None', value: 'none' },
];

// Pie chart ECharts options
export const PIE_LABEL_POSITIONS = [
  { label: 'Outside', value: 'outside' },
  { label: 'Inside', value: 'inside' },
  { label: 'Center', value: 'center' },
];

export const PIE_SELECTED_MODES = [
  { label: 'None', value: 'none' },
  { label: 'Single', value: 'single' },
  { label: 'Multiple', value: 'multiple' },
  { label: 'Series', value: 'series' },
];

export const PIE_ROSE_TYPES = [
  { label: 'None', value: 'none' },
  { label: 'Radius', value: 'radius' },
  { label: 'Area', value: 'area' },
];

// Funnel chart options
export const FUNNEL_SORT_OPTIONS = [
  { label: 'Descending', value: 'descending' },
  { label: 'Ascending', value: 'ascending' },
  { label: 'None', value: 'none' },
];

export const FUNNEL_ALIGN_OPTIONS = [
  { label: 'Center', value: 'center' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
];

// Radar chart options
export const RADAR_SHAPES = [
  { label: 'Polygon', value: 'polygon' },
  { label: 'Circle', value: 'circle' },
];

// Graph chart options
export const GRAPH_LAYOUTS = [
  { label: 'Force', value: 'force' },
  { label: 'Circular', value: 'circular' },
];

// Tree chart options
export const TREE_ORIENTATIONS = [
  { label: 'Top to Bottom', value: 'TB' },
  { label: 'Bottom to Top', value: 'BT' },
  { label: 'Left to Right', value: 'LR' },
  { label: 'Right to Left', value: 'RL' },
];

export const TREE_LAYOUTS = [
  { label: 'Orthogonal', value: 'orthogonal' },
  { label: 'Radial', value: 'radial' },
];

// Sankey chart options
export const SANKEY_ORIENTATIONS = [
  { label: 'Horizontal', value: 'horizontal' },
  { label: 'Vertical', value: 'vertical' },
];

// Pictorial bar chart options
export const PICTORIAL_SYMBOLS = [
  { label: 'Round Rect', value: 'roundRect' },
  { label: 'Circle', value: 'circle' },
  { label: 'Rectangle', value: 'rect' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Arrow', value: 'arrow' },
];

// Default chart configuration with all possible ECharts options
export const DEFAULT_CHART_CONFIG = {
  // === Global ===
  colorScheme: 'vivid',

  // === Axis (ECharts xAxis/yAxis) ===
  xAxis: true,
  yAxis: true,
  showGridLines: true,
  gridLineStyle: 'dashed',        // splitLine.lineStyle.type
  showXAxisLabel: true,
  showYAxisLabel: true,
  xAxisLabel: 'Category',
  yAxisLabel: 'Value',
  xAxisLabelRotate: 0,           // axisLabel.rotate (0-90)
  niceScale: false,              // yAxis.nice (was roundDomains)
  autoScale: true,               // yAxis.scale
  boundaryGap: true,             // xAxis.boundaryGap
  inverseX: false,               // xAxis.inverse
  inverseY: false,               // yAxis.inverse
  axisPointerType: 'line',       // tooltip.axisPointer.type

  // === Data Labels (ECharts series.label) ===
  showDataLabel: false,
  labelPosition: 'top',          // series.label.position
  labelFontSize: 12,             // series.label.fontSize

  // === Legend (ECharts legend) ===
  legend: false,
  legendTitle: 'Legend',
  legendPosition: 'right',       // legend orient + position
  legendType: 'scroll',          // legend.type: 'plain' | 'scroll'

  // === Tooltip (ECharts tooltip) ===
  tooltipDisabled: false,
  tooltipTrigger: 'axis',        // tooltip.trigger: 'item' | 'axis' | 'none'

  // === Emphasis (ECharts series.emphasis) ===
  emphasis: 'series',            // emphasis.focus

  // === Animation (ECharts animation) ===
  animations: false,
  animationDuration: 1000,       // animationDuration (ms)
  animationEasing: 'cubicOut',   // animationEasing

  // === Interactive Features ===
  dataZoom: false,               // dataZoom component
  toolbox: false,                // toolbox component
  gradient: false,               // gradient fill

  // === Bar Chart (ECharts series type: 'bar') ===
  barWidth: '',                  // series.barWidth (px or %, empty = auto)
  barGap: '30%',                 // series.barGap
  barCategoryGap: '20%',         // series.barCategoryGap
  roundEdges: false,             // series.itemStyle.borderRadius
  showBackground: false,         // series.showBackground

  // === Line Chart (ECharts series type: 'line') ===
  lineSmooth: false,             // series.smooth
  lineSmoothness: 0.5,           // series.smooth (0-1 when number)
  lineStep: 'none',              // series.step: false | 'start' | 'middle' | 'end'
  lineStyleType: 'solid',        // series.lineStyle.type
  showSymbol: true,              // series.showSymbol
  symbolShape: 'circle',         // series.symbol
  symbolSize: 4,                 // series.symbolSize
  lineWidth: 2,                  // series.lineStyle.width
  connectNulls: false,           // series.connectNulls
  rangeFillOpacity: 0.15,        // series.areaStyle.opacity (for line with area)

  // === Area Chart (extends Line) ===
  areaOpacity: 0.7,              // series.areaStyle.opacity

  // === Pie Chart (ECharts series type: 'pie') ===
  labels: true,                  // series.label.show
  pieLabelPosition: 'outside',   // series.label.position
  pieLabelLine: true,            // series.labelLine.show
  pieInnerRadius: 0,             // series.radius[0] (%)
  pieOuterRadius: 70,            // series.radius[1] (%)
  pieStartAngle: 90,             // series.startAngle
  piePadAngle: 0,                // series.padAngle (gap between slices)
  pieSelectedMode: 'none',       // series.selectedMode
  pieSelectedOffset: 10,         // series.selectedOffset
  pieBorderRadius: 0,            // series.itemStyle.borderRadius
  roseType: 'none',              // series.roseType
  trimLabels: true,
  maxLabelLength: 10,

  // === Polar/Radar Chart (ECharts type: 'radar') ===
  radarShape: 'polygon',         // radar.shape: 'polygon' | 'circle'
  radarAreaOpacity: 0.15,        // series.areaStyle.opacity
  labelTrim: true,
  labelTrimSize: 10,

  // === Gauge Chart (ECharts series type: 'gauge') ===
  min: 0,                        // series.min
  max: 100,                      // series.max
  units: '%',                    // series.detail.formatter
  gaugeStartAngle: 225,          // series.startAngle
  gaugeEndAngle: -45,            // series.endAngle
  splitNumber: 10,               // series.splitNumber (was bigSegments)
  tickSplitNumber: 5,            // series.axisTick.splitNumber (was smallSegments)
  gaugeShowScale: true,          // axisLabel.show (was showAxis)
  gaugeShowValue: true,          // detail.show (was showText)
  gaugeShowPointer: true,        // pointer.show
  gaugePointerLength: 60,        // pointer.length (%)
  gaugeShowProgress: false,      // progress.show
  gaugeAxisLineWidth: 15,        // axisLine.lineStyle.width

  // === Card chart specific ===
  cardColor: '',
  bandColor: '',
  textColor: '',
  emptyColor: 'rgba(0, 0, 0, 0)',
  innerPadding: 15,

  // === Heat Map (ECharts series type: 'heatmap') ===
  heatmapShowLabels: true,       // series.label.show
  trimXAxisTicks: true,
  trimYAxisTicks: true,
  maxXAxisTickLength: 16,
  maxYAxisTickLength: 16,

  // === Bubble Chart (ECharts series type: 'scatter' with symbolSize) ===
  minRadius: 3,
  maxRadius: 20,

  // === Scatter Chart (ECharts series type: 'scatter') ===
  scatterSymbolSize: 10,         // series.symbolSize
  scatterSymbolShape: 'circle',  // series.symbol
  effectRippleScale: 3,          // series.rippleEffect.scale (for effect-scatter)

  // === Funnel Chart (ECharts series type: 'funnel') ===
  funnelSort: 'descending',      // series.sort
  funnelAlign: 'center',         // series.funnelAlign
  funnelGap: 2,                  // series.gap

  // === Sankey Chart (ECharts series type: 'sankey') ===
  sankeyNodeWidth: 20,           // series.nodeWidth
  sankeyNodeGap: 8,              // series.nodeGap
  sankeyOrient: 'horizontal',    // series.orient

  // === Waterfall Chart (stacked bar) ===
  waterfallShowTotal: true,

  // === Treemap Chart (ECharts series type: 'treemap') ===
  treemapShowLabels: true,       // series.label.show
  treemapRoam: false,            // series.roam
  treemapBreadcrumb: false,      // series.breadcrumb.show

  // === Graph Chart (ECharts series type: 'graph') ===
  graphLayout: 'force',          // series.layout
  graphRepulsion: 200,           // series.force.repulsion
  graphEdgeLength: 100,          // series.force.edgeLength
  graphGravity: 0.1,             // series.force.gravity

  // === Tree Chart (ECharts series type: 'tree') ===
  treeOrient: 'TB',              // series.orient
  treeLayout: 'orthogonal',      // series.layout

  // === Pictorial Bar (ECharts series type: 'pictorialBar') ===
  pictorialSymbol: 'roundRect',  // series.symbol
  pictorialRepeat: false,        // series.symbolRepeat

  // === Polar Bar (ECharts bar in polar coordinates) ===
  polarBarInnerRadius: 15,       // polar.radius[0] (%)
};

// ============================================================
// Dummy chart data for previews and testing
// ============================================================

/**
 * Single-series data: monthly revenue by product category
 */
const SINGLE_SERIES_DATA = [
  { name: 'Electronics', value: 48200 },
  { name: 'Clothing', value: 35800 },
  { name: 'Home & Garden', value: 27400 },
  { name: 'Sports', value: 22100 },
  { name: 'Books', value: 18600 },
  { name: 'Toys', value: 15300 },
  { name: 'Automotive', value: 12700 },
  { name: 'Health', value: 9800 },
];

/**
 * Multi-series data: quarterly sales across regions
 */
const MULTI_SERIES_DATA = [
  {
    name: 'North America',
    series: [
      { name: 'Q1', value: 142000 },
      { name: 'Q2', value: 165000 },
      { name: 'Q3', value: 178000 },
      { name: 'Q4', value: 210000 },
      { name: 'H1 Total', value: 307000 },
      { name: 'H2 Total', value: 388000 },
    ],
  },
  {
    name: 'Europe',
    series: [
      { name: 'Q1', value: 98000 },
      { name: 'Q2', value: 115000 },
      { name: 'Q3', value: 132000 },
      { name: 'Q4', value: 148000 },
      { name: 'H1 Total', value: 213000 },
      { name: 'H2 Total', value: 280000 },
    ],
  },
  {
    name: 'Asia Pacific',
    series: [
      { name: 'Q1', value: 76000 },
      { name: 'Q2', value: 89000 },
      { name: 'Q3', value: 104000 },
      { name: 'Q4', value: 125000 },
      { name: 'H1 Total', value: 165000 },
      { name: 'H2 Total', value: 229000 },
    ],
  },
  {
    name: 'Latin America',
    series: [
      { name: 'Q1', value: 34000 },
      { name: 'Q2', value: 41000 },
      { name: 'Q3', value: 52000 },
      { name: 'Q4', value: 63000 },
      { name: 'H1 Total', value: 75000 },
      { name: 'H2 Total', value: 115000 },
    ],
  },
];

/**
 * Bubble data: market analysis (x=market share, y=growth rate, r=revenue)
 */
const BUBBLE_DATA = [
  {
    name: 'Technology',
    series: [
      { name: 'Cloud Services', x: 32, y: 28, r: 85 },
      { name: 'AI/ML', x: 18, y: 45, r: 52 },
      { name: 'Cybersecurity', x: 12, y: 35, r: 38 },
      { name: 'SaaS', x: 25, y: 22, r: 71 },
      { name: 'IoT', x: 8, y: 40, r: 24 },
      { name: 'DevOps', x: 15, y: 30, r: 42 },
    ],
  },
  {
    name: 'Healthcare',
    series: [
      { name: 'Telemedicine', x: 22, y: 38, r: 48 },
      { name: 'Biotech', x: 14, y: 42, r: 62 },
      { name: 'MedTech', x: 28, y: 18, r: 55 },
      { name: 'Pharma', x: 35, y: 12, r: 90 },
      { name: 'Digital Health', x: 10, y: 50, r: 30 },
      { name: 'Diagnostics', x: 20, y: 25, r: 40 },
    ],
  },
  {
    name: 'Finance',
    series: [
      { name: 'FinTech', x: 20, y: 32, r: 58 },
      { name: 'Banking', x: 40, y: 8, r: 95 },
      { name: 'Insurance', x: 30, y: 10, r: 72 },
      { name: 'Crypto', x: 5, y: 55, r: 20 },
      { name: 'Payments', x: 24, y: 26, r: 65 },
      { name: 'WealthTech', x: 12, y: 34, r: 32 },
    ],
  },
];

/**
 * Graph/network data: team collaboration network
 */
const GRAPH_DATA = {
  nodes: [
    { name: 'Engineering', value: 45 },
    { name: 'Product', value: 28 },
    { name: 'Design', value: 18 },
    { name: 'Marketing', value: 32 },
    { name: 'Sales', value: 38 },
    { name: 'Support', value: 22 },
    { name: 'Data Science', value: 15 },
    { name: 'QA', value: 12 },
  ],
  links: [
    { source: 'Engineering', target: 'Product', value: 40 },
    { source: 'Engineering', target: 'Design', value: 25 },
    { source: 'Engineering', target: 'QA', value: 35 },
    { source: 'Engineering', target: 'Data Science', value: 20 },
    { source: 'Product', target: 'Design', value: 30 },
    { source: 'Product', target: 'Marketing', value: 22 },
    { source: 'Product', target: 'Sales', value: 18 },
    { source: 'Marketing', target: 'Sales', value: 45 },
    { source: 'Sales', target: 'Support', value: 28 },
    { source: 'Support', target: 'Engineering', value: 15 },
    { source: 'Data Science', target: 'Product', value: 12 },
    { source: 'Design', target: 'Marketing', value: 16 },
  ],
};

/**
 * Sankey data: budget allocation flow
 */
const SANKEY_DATA = {
  nodes: [
    { name: 'Total Budget', value: 100 },
    { name: 'R&D', value: 35 },
    { name: 'Operations', value: 28 },
    { name: 'Marketing', value: 22 },
    { name: 'HR', value: 15 },
    { name: 'Product Dev', value: 20 },
    { name: 'Research', value: 15 },
    { name: 'Infrastructure', value: 16 },
    { name: 'Logistics', value: 12 },
    { name: 'Digital Ads', value: 14 },
    { name: 'Events', value: 8 },
  ],
  links: [
    { source: 'Total Budget', target: 'R&D', value: 350000 },
    { source: 'Total Budget', target: 'Operations', value: 280000 },
    { source: 'Total Budget', target: 'Marketing', value: 220000 },
    { source: 'Total Budget', target: 'HR', value: 150000 },
    { source: 'R&D', target: 'Product Dev', value: 200000 },
    { source: 'R&D', target: 'Research', value: 150000 },
    { source: 'Operations', target: 'Infrastructure', value: 160000 },
    { source: 'Operations', target: 'Logistics', value: 120000 },
    { source: 'Marketing', target: 'Digital Ads', value: 140000 },
    { source: 'Marketing', target: 'Events', value: 80000 },
  ],
};

/**
 * Tree data (single-series with hierarchical names)
 */
const TREE_DATA = [
  { name: 'CEO', value: 1 },
  { name: 'CTO', value: 45 },
  { name: 'CFO', value: 28 },
  { name: 'COO', value: 35 },
  { name: 'VP Engineering', value: 22 },
  { name: 'VP Product', value: 18 },
  { name: 'VP Sales', value: 30 },
  { name: 'VP Marketing', value: 20 },
];

/**
 * Waterfall data: monthly P&L with positive and negative values
 */
const WATERFALL_DATA = [
  { name: 'Revenue', value: 520000 },
  { name: 'COGS', value: -195000 },
  { name: 'Gross Profit', value: 325000 },
  { name: 'Salaries', value: -142000 },
  { name: 'Marketing', value: -38000 },
  { name: 'R&D', value: -55000 },
  { name: 'Rent', value: -24000 },
  { name: 'Utilities', value: -8500 },
  { name: 'Other Income', value: 12000 },
  { name: 'Net Profit', value: 69500 },
];

/**
 * Funnel data: sales conversion pipeline
 */
const FUNNEL_DATA = [
  { name: 'Website Visits', value: 15200 },
  { name: 'Sign Ups', value: 8400 },
  { name: 'Free Trial', value: 4600 },
  { name: 'Demo Requests', value: 2100 },
  { name: 'Proposals Sent', value: 1350 },
  { name: 'Negotiations', value: 820 },
  { name: 'Closed Won', value: 480 },
];

/**
 * Gauge data: single KPI value
 */
const GAUGE_DATA = [
  { name: 'Uptime', value: 99.7 },
];

/**
 * Linear gauge data: multiple KPIs
 */
const LINEAR_GAUGE_DATA = [
  { name: 'CPU Usage', value: 72 },
  { name: 'Memory', value: 58 },
  { name: 'Disk I/O', value: 34 },
  { name: 'Network', value: 85 },
  { name: 'GPU', value: 45 },
  { name: 'Cache Hit', value: 91 },
];

/**
 * Number card data: key business metrics
 */
const NUMBER_CARD_DATA = [
  { name: 'Total Revenue', value: 2450000 },
  { name: 'Active Users', value: 184500 },
  { name: 'Conversion Rate', value: 3.8 },
  { name: 'Avg Order Value', value: 127 },
  { name: 'Churn Rate', value: 2.1 },
  { name: 'NPS Score', value: 72 },
  { name: 'Support Tickets', value: 342 },
  { name: 'Uptime %', value: 99.97 },
];

/**
 * Heat map data: weekly activity by day and hour
 */
const HEAT_MAP_DATA = [
  {
    name: 'Monday',
    series: [
      { name: '9 AM', value: 45 },
      { name: '10 AM', value: 78 },
      { name: '11 AM', value: 92 },
      { name: '12 PM', value: 65 },
      { name: '1 PM', value: 52 },
      { name: '2 PM', value: 88 },
      { name: '3 PM', value: 95 },
      { name: '4 PM', value: 72 },
      { name: '5 PM', value: 38 },
    ],
  },
  {
    name: 'Tuesday',
    series: [
      { name: '9 AM', value: 52 },
      { name: '10 AM', value: 85 },
      { name: '11 AM', value: 98 },
      { name: '12 PM', value: 70 },
      { name: '1 PM', value: 58 },
      { name: '2 PM', value: 92 },
      { name: '3 PM', value: 88 },
      { name: '4 PM', value: 68 },
      { name: '5 PM', value: 42 },
    ],
  },
  {
    name: 'Wednesday',
    series: [
      { name: '9 AM', value: 48 },
      { name: '10 AM', value: 82 },
      { name: '11 AM', value: 95 },
      { name: '12 PM', value: 72 },
      { name: '1 PM', value: 55 },
      { name: '2 PM', value: 90 },
      { name: '3 PM', value: 97 },
      { name: '4 PM', value: 75 },
      { name: '5 PM', value: 40 },
    ],
  },
  {
    name: 'Thursday',
    series: [
      { name: '9 AM', value: 50 },
      { name: '10 AM', value: 80 },
      { name: '11 AM', value: 90 },
      { name: '12 PM', value: 68 },
      { name: '1 PM', value: 54 },
      { name: '2 PM', value: 86 },
      { name: '3 PM', value: 93 },
      { name: '4 PM', value: 70 },
      { name: '5 PM', value: 36 },
    ],
  },
  {
    name: 'Friday',
    series: [
      { name: '9 AM', value: 38 },
      { name: '10 AM', value: 72 },
      { name: '11 AM', value: 85 },
      { name: '12 PM', value: 78 },
      { name: '1 PM', value: 60 },
      { name: '2 PM', value: 75 },
      { name: '3 PM', value: 68 },
      { name: '4 PM', value: 50 },
      { name: '5 PM', value: 28 },
    ],
  },
];

/**
 * Box chart data: multi-series with enough values per category for meaningful quartiles
 */
const BOX_CHART_DATA = [
  {
    name: 'Engineering',
    series: [
      { name: 'Sprint 1', value: 42 },
      { name: 'Sprint 2', value: 58 },
      { name: 'Sprint 3', value: 65 },
      { name: 'Sprint 4', value: 48 },
      { name: 'Sprint 5', value: 72 },
      { name: 'Sprint 6', value: 55 },
      { name: 'Sprint 7', value: 80 },
      { name: 'Sprint 8', value: 38 },
      { name: 'Sprint 9', value: 67 },
      { name: 'Sprint 10', value: 74 },
    ],
  },
  {
    name: 'Design',
    series: [
      { name: 'Sprint 1', value: 28 },
      { name: 'Sprint 2', value: 35 },
      { name: 'Sprint 3', value: 42 },
      { name: 'Sprint 4', value: 30 },
      { name: 'Sprint 5', value: 50 },
      { name: 'Sprint 6', value: 38 },
      { name: 'Sprint 7', value: 55 },
      { name: 'Sprint 8', value: 25 },
      { name: 'Sprint 9', value: 45 },
      { name: 'Sprint 10', value: 48 },
    ],
  },
  {
    name: 'QA',
    series: [
      { name: 'Sprint 1', value: 18 },
      { name: 'Sprint 2', value: 24 },
      { name: 'Sprint 3', value: 32 },
      { name: 'Sprint 4', value: 20 },
      { name: 'Sprint 5', value: 38 },
      { name: 'Sprint 6', value: 28 },
      { name: 'Sprint 7', value: 42 },
      { name: 'Sprint 8', value: 15 },
      { name: 'Sprint 9', value: 35 },
      { name: 'Sprint 10', value: 30 },
    ],
  },
];

/**
 * Sunburst data: department budget breakdown
 */
const SUNBURST_DATA = [
  { name: 'Engineering', value: 450000 },
  { name: 'Frontend', value: 180000 },
  { name: 'Backend', value: 200000 },
  { name: 'DevOps', value: 70000 },
  { name: 'Marketing', value: 280000 },
  { name: 'Digital', value: 160000 },
  { name: 'Brand', value: 120000 },
  { name: 'Sales', value: 350000 },
  { name: 'Enterprise', value: 220000 },
  { name: 'SMB', value: 130000 },
];

/**
 * Theme river data: topic popularity over months
 */
const THEME_RIVER_DATA = [
  { name: 'AI', value: 120 },
  { name: 'Cloud', value: 95 },
  { name: 'Mobile', value: 78 },
  { name: 'Security', value: 65 },
  { name: 'IoT', value: 42 },
  { name: 'Blockchain', value: 28 },
  { name: 'AR/VR', value: 35 },
  { name: 'Quantum', value: 15 },
];

/**
 * Pictorial bar data: team headcount
 */
const PICTORIAL_BAR_DATA = [
  { name: 'Engineering', value: 85 },
  { name: 'Sales', value: 62 },
  { name: 'Marketing', value: 45 },
  { name: 'Product', value: 32 },
  { name: 'Design', value: 24 },
  { name: 'Support', value: 38 },
  { name: 'HR', value: 18 },
  { name: 'Finance', value: 15 },
];

/**
 * Polar bar data: performance scores by category
 */
const POLAR_BAR_DATA = [
  { name: 'Innovation', value: 88 },
  { name: 'Quality', value: 95 },
  { name: 'Speed', value: 72 },
  { name: 'Collaboration', value: 84 },
  { name: 'Reliability', value: 91 },
  { name: 'Scalability', value: 78 },
  { name: 'Security', value: 96 },
  { name: 'Usability', value: 82 },
];

/**
 * Scatter data: correlation between effort and output
 */
const SCATTER_DATA = [
  { name: 'Project Alpha', value: 82 },
  { name: 'Project Beta', value: 67 },
  { name: 'Project Gamma', value: 93 },
  { name: 'Project Delta', value: 54 },
  { name: 'Project Epsilon', value: 78 },
  { name: 'Project Zeta', value: 41 },
  { name: 'Project Eta', value: 89 },
  { name: 'Project Theta', value: 72 },
  { name: 'Project Iota', value: 95 },
  { name: 'Project Kappa', value: 38 },
];

/**
 * Rose data: market share distribution
 */
const ROSE_DATA = [
  { name: 'North America', value: 34 },
  { name: 'Europe', value: 28 },
  { name: 'Asia Pacific', value: 22 },
  { name: 'Latin America', value: 8 },
  { name: 'Middle East', value: 5 },
  { name: 'Africa', value: 3 },
];

/**
 * Pie data: expense breakdown
 */
const PIE_DATA = [
  { name: 'Salaries', value: 42 },
  { name: 'Cloud Services', value: 18 },
  { name: 'Office Rent', value: 12 },
  { name: 'Marketing', value: 10 },
  { name: 'Equipment', value: 8 },
  { name: 'Travel', value: 5 },
  { name: 'Training', value: 3 },
  { name: 'Misc', value: 2 },
];

/**
 * Tree map data: disk usage by folder
 */
const TREE_MAP_DATA = [
  { name: 'node_modules', value: 1850 },
  { name: 'dist', value: 420 },
  { name: 'src', value: 380 },
  { name: '.git', value: 275 },
  { name: 'assets', value: 195 },
  { name: 'docs', value: 82 },
  { name: 'tests', value: 65 },
  { name: 'config', value: 28 },
];

/**
 * Candlestick data: stock prices [open, close, low, high]
 */
const CANDLESTICK_DATA = [
  { name: 'Mon', value: [20, 34, 10, 38] },
  { name: 'Tue', value: [40, 35, 30, 50] },
  { name: 'Wed', value: [31, 38, 33, 44] },
  { name: 'Thu', value: [38, 15, 5, 42] },
  { name: 'Fri', value: [15, 28, 12, 36] },
  { name: 'Sat', value: [25, 36, 20, 40] },
  { name: 'Sun', value: [36, 32, 28, 45] },
];

/**
 * Parallel coordinates data: multi-dimension comparison
 */
const PARALLEL_DATA = [{
  dimensions: ['Price', 'Rating', 'Storage', 'Battery', 'Weight'],
  data: [
    [799, 4.5, 128, 4000, 175],
    [999, 4.7, 256, 4500, 185],
    [599, 4.2, 64, 3500, 160],
    [1199, 4.8, 512, 5000, 195],
    [449, 3.9, 64, 3000, 150],
    [899, 4.6, 256, 4200, 180],
    [699, 4.3, 128, 3800, 165],
    [1099, 4.7, 512, 4800, 190],
  ],
}];

/**
 * 3D chart data: [x, y, z] coordinates
 */
const DATA_3D = [
  [0, 0, 5], [0, 1, 1], [0, 2, 0], [0, 3, 3], [0, 4, 2],
  [1, 0, 7], [1, 1, 2], [1, 2, 4], [1, 3, 1], [1, 4, 6],
  [2, 0, 3], [2, 1, 4], [2, 2, 6], [2, 3, 8], [2, 4, 3],
  [3, 0, 1], [3, 1, 6], [3, 2, 8], [3, 3, 5], [3, 4, 7],
  [4, 0, 2], [4, 1, 3], [4, 2, 1], [4, 3, 7], [4, 4, 9],
];

/**
 * Surface chart data: parametric equation for a torus
 */
// Generate torus surface data as coordinate grid [[x, y, z], ...]
const SURFACE_DATA: number[][] = (() => {
  const points: number[][] = [];
  const step = Math.PI / 12;
  for (let u = -Math.PI; u <= Math.PI; u += step) {
    for (let v = 0; v <= Math.PI * 2; v += step) {
      points.push([
        (2 + Math.cos(v)) * Math.cos(u),
        (2 + Math.cos(v)) * Math.sin(u),
        Math.sin(v),
      ]);
    }
  }
  return points;
})();

/**
 * Globe chart data: city coordinates [lng, lat, value]
 */
const GLOBE_DATA = [
  { name: 'New York', value: [-74.0, 40.7, 85] },
  { name: 'London', value: [-0.12, 51.5, 78] },
  { name: 'Tokyo', value: [139.7, 35.7, 92] },
  { name: 'Sydney', value: [151.2, -33.9, 65] },
  { name: 'Mumbai', value: [72.9, 19.1, 88] },
  { name: 'São Paulo', value: [-46.6, -23.6, 72] },
  { name: 'Dubai', value: [55.3, 25.2, 70] },
  { name: 'Singapore', value: [103.8, 1.35, 80] },
];

/**
 * Scatter GL data: large dataset of 2D points
 */
const SCATTER_GL_DATA = Array.from({ length: 500 }, () => [
  Math.random() * 100 - 50 + Math.sin(Math.random() * 6) * 20,
  Math.random() * 100 - 50 + Math.cos(Math.random() * 6) * 20,
]);

/**
 * Lines GL data: polyline paths
 */
const LINES_GL_DATA = Array.from({ length: 20 }, (_, i) => ({
  coords: Array.from({ length: 10 }, (__, j) => [
    i * 5 + Math.sin(j * 0.5) * 10,
    j * 10 + Math.cos(i * 0.3) * 5,
  ]),
}));

/**
 * Map 3D data: region values
 */
const MAP_3D_DATA = [
  { name: 'China', value: 95 },
  { name: 'United States', value: 88 },
  { name: 'India', value: 76 },
  { name: 'Brazil', value: 62 },
  { name: 'Russia', value: 58 },
  { name: 'Germany', value: 72 },
  { name: 'Japan', value: 82 },
  { name: 'Australia', value: 55 },
];

/**
 * Flow GL data: vector field (simplified)
 */
const FLOW_GL_DATA = [{
  data: Array.from({ length: 100 }, (_, i) => {
    const x = (i % 10) / 10;
    const y = Math.floor(i / 10) / 10;
    return [x, y, Math.sin(x * 6) * 0.5, Math.cos(y * 6) * 0.5];
  }),
}];

/**
 * Master map of dummy chart data keyed by chart type ID.
 * Each entry contains realistic, visually interesting data
 * in the format expected by the chart builder for that type.
 */
export const DUMMY_CHART_DATA: { [chartType: string]: any } = {
  // --- Single-series bar charts ---
  'bar-vertical': SINGLE_SERIES_DATA,
  'bar-horizontal': SINGLE_SERIES_DATA,

  // --- Multi-series bar charts ---
  'bar-vertical-2d': MULTI_SERIES_DATA,
  'bar-horizontal-2d': MULTI_SERIES_DATA,
  'bar-vertical-stacked': MULTI_SERIES_DATA,
  'bar-horizontal-stacked': MULTI_SERIES_DATA,
  'bar-vertical-normalized': MULTI_SERIES_DATA,
  'bar-horizontal-normalized': MULTI_SERIES_DATA,

  // --- Line charts (multi-series) ---
  'line': MULTI_SERIES_DATA,
  'line-stacked': MULTI_SERIES_DATA,
  'line-step': MULTI_SERIES_DATA,

  // --- Area charts (multi-series) ---
  'area': MULTI_SERIES_DATA,
  'area-stacked': MULTI_SERIES_DATA,
  'area-normalized': MULTI_SERIES_DATA,

  // --- Polar (multi-series) ---
  'polar': MULTI_SERIES_DATA,

  // --- Pie family ---
  'pie': PIE_DATA,
  'donut': PIE_DATA,
  'half-donut': PIE_DATA,
  'rose': ROSE_DATA,
  'pie-advanced': PIE_DATA,
  'pie-grid': PIE_DATA,
  'nested-pie': PIE_DATA,

  // --- Gauges ---
  'gauge': GAUGE_DATA,
  'linear-gauge': LINEAR_GAUGE_DATA,

  // --- Cards ---
  'number-card': NUMBER_CARD_DATA,

  // --- Maps ---
  'heat-map': HEAT_MAP_DATA,
  'tree-map': TREE_MAP_DATA,

  // --- Scatter ---
  'scatter': SCATTER_DATA,
  'effect-scatter': SCATTER_DATA,
  'bubble': BUBBLE_DATA,

  // --- Statistical ---
  'box-chart': BOX_CHART_DATA,

  // --- Funnel ---
  'funnel': FUNNEL_DATA,

  // --- Hierarchical ---
  'sunburst': SUNBURST_DATA,
  'tree': TREE_DATA,

  // --- Flow ---
  'sankey': SANKEY_DATA,
  'graph': GRAPH_DATA,

  // --- Bar variants ---
  'waterfall': WATERFALL_DATA,
  'pictorial-bar': PICTORIAL_BAR_DATA,
  'bar-polar': POLAR_BAR_DATA,

  // --- Special ---
  'theme-river': THEME_RIVER_DATA,

  // --- Radar ---
  'radar': MULTI_SERIES_DATA,

  // --- Candlestick ---
  'candlestick': CANDLESTICK_DATA,

  // --- Parallel ---
  'parallel': PARALLEL_DATA,

  // --- 3D Charts ---
  'bar3d': DATA_3D,
  'line3d': DATA_3D,
  'scatter3d': DATA_3D,
  'surface': SURFACE_DATA,
  'globe': GLOBE_DATA,
  'graphgl': GRAPH_DATA,
  'scattergl': SCATTER_GL_DATA,
  'linesgl': LINES_GL_DATA,
  'map3d': MAP_3D_DATA,
  'flowgl': FLOW_GL_DATA,
};

/**
 * Returns the appropriate dummy data for a given chart type.
 * Falls back to single-series data if the chart type is not recognized.
 */
export function getDummyData(chartType: string): any {
  return DUMMY_CHART_DATA[chartType] ?? SINGLE_SERIES_DATA;
}

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

const LINE_CHART_TYPES = ['line', 'line-stacked', 'line-step'];

const AREA_CHART_TYPES = ['area', 'area-stacked', 'area-normalized'];

const PIE_CHART_TYPES = ['pie', 'pie-advanced', 'pie-grid', 'donut', 'half-donut', 'nested-pie', 'rose'];

const GAUGE_CHART_TYPES = ['gauge', 'linear-gauge'];

const FUNNEL_CHART_TYPES = ['funnel'];

const SANKEY_CHART_TYPES = ['sankey'];

const SUNBURST_CHART_TYPES = ['sunburst'];

const WATERFALL_CHART_TYPES = ['waterfall'];

const GRAPH_CHART_TYPES = ['graph'];

const TREE_CHART_TYPES = ['tree'];

const THEME_RIVER_CHART_TYPES = ['theme-river'];

const PICTORIAL_BAR_CHART_TYPES = ['pictorial-bar'];

const POLAR_BAR_CHART_TYPES = ['bar-polar'];

const RADAR_CHART_TYPES = ['radar'];

const CANDLESTICK_CHART_TYPES = ['candlestick'];

const PARALLEL_CHART_TYPES = ['parallel'];

const BAR3D_CHART_TYPES = ['bar3d'];

const LINE3D_CHART_TYPES = ['line3d'];

const SCATTER3D_CHART_TYPES = ['scatter3d'];

const SURFACE_CHART_TYPES = ['surface'];

const GLOBE_CHART_TYPES = ['globe'];

const GRAPHGL_CHART_TYPES = ['graphgl'];

const SCATTERGL_CHART_TYPES = ['scattergl'];

const LINESGL_CHART_TYPES = ['linesgl'];

const MAP3D_CHART_TYPES = ['map3d'];

const FLOWGL_CHART_TYPES = ['flowgl'];

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
  'sankey',
  'graph',
  'tree',
  'theme-river',
  'bar-polar',
  'radar',
  'parallel',
  'globe',
  'graphgl',
  'flowgl',
  'surface',
  'bar3d',
  'line3d',
  'scatter3d',
  'map3d',
];

const NO_GRADIENT_CHART_TYPES = [
  'polar',
  'gauge',
  'linear-gauge',
  'number-card',
  'sankey',
  'sunburst',
  'graph',
  'tree',
  'theme-river',
  'radar',
  'parallel',
  'globe',
  'graphgl',
  'scattergl',
  'linesgl',
  'flowgl',
  'surface',
  'bar3d',
  'line3d',
  'scatter3d',
  'map3d',
];

// Helper functions for chart type checking
export function isBarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return BAR_CHART_TYPES.includes(chartType);
}

export function isLineChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return LINE_CHART_TYPES.includes(chartType);
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

export function isBubbleChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'bubble';
}

export function isBoxChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'box-chart';
}

export function isPolarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'polar';
}

export function isScatterChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return chartType === 'scatter' || chartType === 'effect-scatter';
}

export function isFunnelChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return FUNNEL_CHART_TYPES.includes(chartType);
}

export function isSankeyChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return SANKEY_CHART_TYPES.includes(chartType);
}

export function isSunburstChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return SUNBURST_CHART_TYPES.includes(chartType);
}

export function isWaterfallChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return WATERFALL_CHART_TYPES.includes(chartType);
}

export function isGraphChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return GRAPH_CHART_TYPES.includes(chartType);
}

export function isTreeChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return TREE_CHART_TYPES.includes(chartType);
}

export function isThemeRiverChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return THEME_RIVER_CHART_TYPES.includes(chartType);
}

export function isPictorialBarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return PICTORIAL_BAR_CHART_TYPES.includes(chartType);
}

export function isPolarBarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return POLAR_BAR_CHART_TYPES.includes(chartType);
}

export function isRadarChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return RADAR_CHART_TYPES.includes(chartType);
}

export function isCandlestickChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return CANDLESTICK_CHART_TYPES.includes(chartType);
}

export function isParallelChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return PARALLEL_CHART_TYPES.includes(chartType);
}

export function isBar3dChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return BAR3D_CHART_TYPES.includes(chartType);
}

export function isLine3dChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return LINE3D_CHART_TYPES.includes(chartType);
}

export function isScatter3dChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return SCATTER3D_CHART_TYPES.includes(chartType);
}

export function isSurfaceChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return SURFACE_CHART_TYPES.includes(chartType);
}

export function isGlobeChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return GLOBE_CHART_TYPES.includes(chartType);
}

export function isGraphGlChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return GRAPHGL_CHART_TYPES.includes(chartType);
}

export function isScatterGlChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return SCATTERGL_CHART_TYPES.includes(chartType);
}

export function isLinesGlChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return LINESGL_CHART_TYPES.includes(chartType);
}

export function isMap3dChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return MAP3D_CHART_TYPES.includes(chartType);
}

export function isFlowGlChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return FLOWGL_CHART_TYPES.includes(chartType);
}

export function hasAxisLabels(chartType: string | null): boolean {
  if (!chartType) return false;
  return !NO_AXIS_CHART_TYPES.includes(chartType);
}

export function is3DCoordinateChartType(chartType: string | null): boolean {
  if (!chartType) return false;
  return ['bar3d', 'line3d', 'scatter3d'].includes(chartType);
}

export function supportsGradient(chartType: string | null): boolean {
  if (!chartType) return false;
  return !NO_GRADIENT_CHART_TYPES.includes(chartType);
}

export function supportsDataZoom(chartType: string | null): boolean {
  if (!chartType) return false;
  const zoomTypes = [
    ...BAR_CHART_TYPES, ...LINE_CHART_TYPES, ...AREA_CHART_TYPES,
    'scatter', 'effect-scatter', 'bubble',
    'waterfall', 'heat-map', 'box-chart', 'pictorial-bar',
  ];
  return zoomTypes.includes(chartType);
}

export function supportsDataLabel(chartType: string | null): boolean {
  if (!chartType) return false;
  const noLabelTypes = ['number-card', 'sankey'];
  return !noLabelTypes.includes(chartType);
}

// Get a fresh copy of default chart config
export function getDefaultChartConfig(): any {
  return { ...DEFAULT_CHART_CONFIG };
}
