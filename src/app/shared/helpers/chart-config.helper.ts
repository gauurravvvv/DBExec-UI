// ========= Color Palettes =========
// Color palettes extracted from ECharts built-in themes — applied via the color option
// so only series/bar colors change (not the chart background).
export const COLOR_PALETTES: { [key: string]: string[] } = {
  default: [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0',
  ],
  dark: [
    '#4992ff', '#7cffb2', '#fddd60', '#ff6e76', '#58d9f9',
    '#05c091', '#ff8a45', '#8d48e3', '#dd79ff',
  ],
  vintage: [
    '#d87c7c', '#919e8b', '#d7ab82', '#6e7074', '#61a0a8',
    '#efa18d', '#787464', '#cc7e63', '#724e58', '#4b565b',
  ],
  macarons: [
    '#2ec7c9', '#b6a2de', '#5ab1ef', '#ffb980', '#d87a80',
    '#8d98b3', '#e5cf0d', '#97b552', '#95706d', '#dc69aa',
  ],
  infographic: [
    '#C1232B', '#27727B', '#FCCE10', '#E87C25', '#B5C334',
    '#FE8463', '#9BCA63', '#FAD860', '#F3A43B', '#60C0DD',
  ],
  shine: [
    '#c12e34', '#e6b600', '#0098d9', '#2b821d', '#005eaa',
    '#339ca8', '#cda819', '#32a487',
  ],
  roma: [
    '#E01F54', '#001852', '#f5e8c8', '#b8d2c7', '#c6b38e',
    '#a4d8c2', '#f3d999', '#d3758f', '#dcc392', '#2e4783',
  ],
  azul: [
    '#f2385a', '#f5a503', '#4ad9d9', '#f7879c', '#c1d7a8',
    '#4dffd2', '#fccfd7', '#d5f6f6',
  ],
  royal: [
    '#3f7ea6', '#993366', '#408000', '#8c6f56', '#a65149',
    '#731f17', '#adc2eb', '#d9c3b0',
  ],
  sakura: [
    '#e52c3c', '#f7b1ab', '#fa506c', '#f59288', '#f8c4d8',
    '#e54f5c', '#f06d5c', '#e54f80', '#f29c9f', '#eeb5b7',
  ],
  'tech-blue': [
    '#4d4d4d', '#3a5897', '#007bb6', '#7094db', '#0080ff',
    '#b3b3ff', '#00bdec', '#33ccff', '#ccddff',
  ],
  'dark-bold': [
    '#458c6b', '#f2da87', '#d9a86c', '#d94436', '#a62424',
    '#76bc9b', '#cce6da',
  ],
};

// Theme dropdown options for the UI
export const ECHARTS_THEME_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Dark', value: 'dark' },
  { label: 'Vintage', value: 'vintage' },
  { label: 'Macarons', value: 'macarons' },
  { label: 'Infographic', value: 'infographic' },
  { label: 'Shine', value: 'shine' },
  { label: 'Roma', value: 'roma' },
  { label: 'Azul', value: 'azul' },
  { label: 'Royal', value: 'royal' },
  { label: 'Sakura', value: 'sakura' },
  { label: 'Tech Blue', value: 'tech-blue' },
  { label: 'Dark Bold', value: 'dark-bold' },
];

// ========= Dummy Data =========
export const DUMMY_SINGLE_SERIES = [
  { name: 'Germany', value: 8940000 },
  { name: 'USA', value: 5000000 },
  { name: 'France', value: 7200000 },
  { name: 'UK', value: 6200000 },
  { name: 'Italy', value: 4900000 },
  { name: 'Spain', value: 4100000 },
];

export const DUMMY_MULTI_SERIES = [
  {
    name: 'Germany',
    series: [
      { name: '2018', value: 7300 },
      { name: '2019', value: 8940 },
      { name: '2020', value: 6200 },
      { name: '2021', value: 9100 },
    ],
  },
  {
    name: 'USA',
    series: [
      { name: '2018', value: 7870 },
      { name: '2019', value: 8270 },
      { name: '2020', value: 5400 },
      { name: '2021', value: 9800 },
    ],
  },
  {
    name: 'France',
    series: [
      { name: '2018', value: 5000 },
      { name: '2019', value: 5800 },
      { name: '2020', value: 4200 },
      { name: '2021', value: 6500 },
    ],
  },
];

// ========= Default Chart Configs =========
export interface BaseChartConfig {
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  animations: boolean;
  tooltipDisabled: boolean;
  colorScheme: string;
  gradient: boolean;
}

export const DEFAULT_BASE_CONFIG: BaseChartConfig = {
  legend: true,
  legendTitle: 'Legend',
  legendPosition: 'right',
  animations: true,
  tooltipDisabled: false,
  colorScheme: 'default',
  gradient: false,
};

export interface AxisConfig {
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  roundDomains: boolean;
  trimXAxisTicks: boolean;
  trimYAxisTicks: boolean;
  rotateXAxisTicks: boolean;
  maxXAxisTickLength: number;
  maxYAxisTickLength: number;
  wrapTicks: boolean;
  inverseX: boolean;
  inverseY: boolean;
}

export const DEFAULT_AXIS_CONFIG: AxisConfig = {
  xAxis: true,
  yAxis: true,
  showGridLines: true,
  showXAxisLabel: true,
  showYAxisLabel: true,
  xAxisLabel: 'Category',
  yAxisLabel: 'Value',
  roundDomains: false,
  trimXAxisTicks: true,
  trimYAxisTicks: true,
  rotateXAxisTicks: true,
  maxXAxisTickLength: 16,
  maxYAxisTickLength: 16,
  wrapTicks: false,
  inverseX: false,
  inverseY: false,
};

export interface BarChartConfig extends BaseChartConfig, AxisConfig {
  showDataLabel: boolean;
  barPadding: number;
  roundEdges: boolean;
  noBarWhenZero: boolean;
  yScaleMin?: number;
  yScaleMax?: number;
}

export const DEFAULT_BAR_CHART_CONFIG: BarChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  ...DEFAULT_AXIS_CONFIG,
  showDataLabel: false,
  barPadding: 8,
  roundEdges: false,
  noBarWhenZero: true,
};

export interface LineChartConfig extends BaseChartConfig, AxisConfig {
  curveType: string;
  autoScale: boolean;
  rangeFillOpacity: number;
  showRefLines: boolean;
  showRefLabels: boolean;
  timeline: boolean;
  yScaleMin?: number;
  yScaleMax?: number;
}

export const DEFAULT_LINE_CHART_CONFIG: LineChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  ...DEFAULT_AXIS_CONFIG,
  curveType: 'linear',
  autoScale: false,
  rangeFillOpacity: 0.15,
  showRefLines: false,
  showRefLabels: false,
  timeline: false,
};

export interface AreaChartConfig extends BaseChartConfig, AxisConfig {
  curveType: string;
  autoScale: boolean;
  timeline: boolean;
}

export const DEFAULT_AREA_CHART_CONFIG: AreaChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  ...DEFAULT_AXIS_CONFIG,
  curveType: 'linear',
  autoScale: false,
  timeline: false,
};

export interface PolarChartConfig extends BaseChartConfig {
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  curveType: string;
  autoScale: boolean;
  labelTrim: boolean;
  labelTrimSize: number;
  showSeriesOnHover: boolean;
  rangeFillOpacity: number;
}

export const DEFAULT_POLAR_CHART_CONFIG: PolarChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  xAxis: true,
  yAxis: true,
  showGridLines: true,
  curveType: 'linear',
  autoScale: false,
  labelTrim: true,
  labelTrimSize: 10,
  showSeriesOnHover: true,
  rangeFillOpacity: 0.15,
};

export interface PieChartConfig extends BaseChartConfig {
  labels: boolean;
  trimLabels: boolean;
  maxLabelLength: number;
  doughnut: boolean;
  arcWidth: number;
  explodeSlices: boolean;
}

export const DEFAULT_PIE_CHART_CONFIG: PieChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  labels: true,
  trimLabels: true,
  maxLabelLength: 14,
  doughnut: false,
  arcWidth: 0.25,
  explodeSlices: false,
};

export interface GaugeChartConfig extends BaseChartConfig {
  min: number;
  max: number;
  units: string;
  bigSegments: number;
  smallSegments: number;
  showAxis: boolean;
  angleSpan: number;
  startAngle: number;
  showText: boolean;
}

export const DEFAULT_GAUGE_CHART_CONFIG: GaugeChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  min: 0,
  max: 100,
  units: '',
  bigSegments: 10,
  smallSegments: 5,
  showAxis: true,
  angleSpan: 240,
  startAngle: -120,
  showText: true,
};

export interface CardChartConfig {
  cardColor: string;
  bandColor: string;
  textColor: string;
  emptyColor: string;
  innerPadding: number;
  animations: boolean;
  colorScheme: string;
}

export const DEFAULT_CARD_CHART_CONFIG: CardChartConfig = {
  cardColor: '',
  bandColor: '',
  textColor: '',
  emptyColor: 'rgba(0, 0, 0, 0)',
  innerPadding: 15,
  animations: true,
  colorScheme: 'default',
};

export interface HeatMapConfig extends BaseChartConfig, AxisConfig {
  innerPadding: number;
  trimXAxisTicks: boolean;
  trimYAxisTicks: boolean;
  rotateXAxisTicks: boolean;
  maxXAxisTickLength: number;
  maxYAxisTickLength: number;
  wrapTicks: boolean;
}

export const DEFAULT_HEAT_MAP_CONFIG: HeatMapConfig = {
  ...DEFAULT_BASE_CONFIG,
  ...DEFAULT_AXIS_CONFIG,
  innerPadding: 8,
  trimXAxisTicks: true,
  trimYAxisTicks: true,
  rotateXAxisTicks: true,
  maxXAxisTickLength: 16,
  maxYAxisTickLength: 16,
  wrapTicks: false,
};

export interface TreeMapConfig {
  gradient: boolean;
  animations: boolean;
  tooltipDisabled: boolean;
  colorScheme: string;
}

export const DEFAULT_TREE_MAP_CONFIG: TreeMapConfig = {
  gradient: false,
  animations: true,
  tooltipDisabled: false,
  colorScheme: 'default',
};
