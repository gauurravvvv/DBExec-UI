// ========= Color Palettes =========
// Modern, vibrant palettes designed for data visualization with 10+ colors each
export const COLOR_PALETTES: { [key: string]: string[] } = {
  vivid: [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0',
    '#6fde8e', '#f4a261', '#a78bfa', '#fb7185',
  ],
  natural: [
    '#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51',
    '#606c38', '#dda15e', '#bc6c25', '#283618', '#fefae0',
  ],
  cool: [
    '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8',
    '#7dd3fc', '#38bdf8', '#0ea5e9', '#06b6d4', '#22d3ee',
  ],
  fire: [
    '#dc2626', '#ea580c', '#f97316', '#fb923c', '#fdba74',
    '#fbbf24', '#f59e0b', '#d97706', '#b91c1c', '#9a3412',
  ],
  solar: [
    '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#d97706',
    '#b45309', '#92400e', '#78350f', '#facc15', '#eab308',
  ],
  air: [
    '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9',
    '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#dbeafe',
  ],
  aqua: [
    '#06b6d4', '#22d3ee', '#67e8f9', '#0891b2', '#0e7490',
    '#155e75', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4',
  ],
  flame: [
    '#ef4444', '#f97316', '#eab308', '#f43f5e', '#ec4899',
    '#e11d48', '#dc2626', '#c2410c', '#a16207', '#be185d',
  ],
  ocean: [
    '#0077b6', '#00b4d8', '#90e0ef', '#023e8a', '#0096c7',
    '#48cae4', '#ade8f4', '#caf0f8', '#03045e', '#0077b6',
  ],
  forest: [
    '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e',
    '#4ade80', '#86efac', '#bbf7d0', '#052e16', '#365314',
  ],
  horizon: [
    '#4361ee', '#4cc9f0', '#7209b7', '#f72585', '#3a0ca3',
    '#560bad', '#480ca8', '#b5179e', '#4895ef', '#4361ee',
  ],
  neons: [
    '#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0',
    '#06d6a0', '#ffd166', '#ef476f', '#118ab2', '#073b4c',
  ],
  macarons: [
    '#2ec7c9', '#b6a2de', '#5ab1ef', '#ffb980', '#d87a80',
    '#8d98b3', '#e5cf0d', '#97b552', '#95706d', '#dc69aa',
  ],
  walden: [
    '#3fb1e3', '#6be6c1', '#626c91', '#a0a7e6', '#c4ebad',
    '#96dee8', '#3fb1e3', '#6be6c1', '#626c91', '#a0a7e6',
  ],
  vintage: [
    '#d87c7c', '#919e8b', '#d7ab82', '#6e7074', '#61a0a8',
    '#efa18d', '#787464', '#cc7e63', '#724e58', '#4b565b',
  ],
  dark: [
    '#dd6b66', '#759aa0', '#e69d87', '#8dc1a9', '#ea7e53',
    '#eedd78', '#73a373', '#73b9bc', '#7289ab', '#91ca8c',
  ],
  roma: [
    '#e01f54', '#001852', '#f5e8c8', '#0098d9', '#95706d',
    '#dc69aa', '#07a2a4', '#9a7fd1', '#588dd5', '#f5994e',
  ],
  infographic: [
    '#c1232b', '#27727b', '#fcce10', '#e87c25', '#b5c334',
    '#fe8463', '#9bca63', '#fad860', '#f3a43b', '#60c0dd',
  ],
  picnic: [
    '#ffc6ff', '#bdb2ff', '#a0c4ff', '#9bf6ff', '#caffbf',
    '#fdffb6', '#ffd6a5', '#ffadad', '#d0f4de', '#a9def9',
  ],
  night: [
    '#fc97af', '#87f7cf', '#f7f494', '#72ccff', '#f7c5a0',
    '#d4a4eb', '#76f2f2', '#7eb0d5', '#fd7f6f', '#b2e061',
  ],
  nightLights: [
    '#4a266a', '#8e44ad', '#e74c3c', '#f39c12', '#f1c40f',
    '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e67e22',
  ],
  shine: [
    '#c12e34', '#e6b600', '#0098d9', '#2b821d', '#005eaa',
    '#339ca8', '#cda819', '#32a487', '#3fb1e3', '#6be6c1',
  ],
  westeros: [
    '#516b91', '#59c4e6', '#edafda', '#93b7e3', '#a5e7f0',
    '#cbb0e3', '#516b91', '#59c4e6', '#edafda', '#93b7e3',
  ],
};

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
  legend: false,
  legendTitle: 'Legend',
  legendPosition: 'right',
  animations: true,
  tooltipDisabled: false,
  colorScheme: 'vivid',
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
  colorScheme: 'vivid',
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
  colorScheme: 'vivid',
};
