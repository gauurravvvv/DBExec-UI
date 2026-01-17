import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import {
  curveLinear,
  curveCardinal,
  curveBasis,
  curveMonotoneX,
  curveCatmullRom,
  curveStep,
} from 'd3-shape';

// ========= Color Palettes =========
export const COLOR_PALETTES: { [key: string]: string[] } = {
  vivid: [
    '#647c8a',
    '#3f51b5',
    '#2196f3',
    '#00bcd4',
    '#009688',
    '#4caf50',
    '#8bc34a',
    '#cddc39',
  ],
  natural: [
    '#bf9d76',
    '#e99450',
    '#d89f59',
    '#f2dfa7',
    '#a5d7c6',
    '#7794b1',
    '#afafaf',
    '#707160',
  ],
  cool: [
    '#a8385d',
    '#7aa3e5',
    '#a27ea8',
    '#aae3f5',
    '#adcded',
    '#a95963',
    '#8796c0',
    '#7ed3ed',
  ],
  fire: [
    '#ff3d00',
    '#bf360c',
    '#ff6e40',
    '#ff9e80',
    '#ffab40',
    '#ffcc80',
    '#ffecb3',
    '#fff3e0',
  ],
  ocean: [
    '#1abc9c',
    '#16a085',
    '#3498db',
    '#2980b9',
    '#9b59b6',
    '#8e44ad',
    '#34495e',
    '#2c3e50',
  ],
  forest: [
    '#1b5e20',
    '#2e7d32',
    '#388e3c',
    '#43a047',
    '#4caf50',
    '#66bb6a',
    '#81c784',
    '#a5d6a7',
  ],
  horizon: [
    '#2196f3',
    '#03a9f4',
    '#00bcd4',
    '#009688',
    '#4caf50',
    '#8bc34a',
    '#cddc39',
    '#ffeb3b',
  ],
  neons: [
    '#ff00ff',
    '#00ffff',
    '#ff0066',
    '#00ff00',
    '#ffff00',
    '#ff3300',
    '#00ff99',
    '#9900ff',
  ],
  picnic: [
    '#ffc6ff',
    '#bdb2ff',
    '#a0c4ff',
    '#9bf6ff',
    '#caffbf',
    '#fdffb6',
    '#ffd6a5',
    '#ffadad',
  ],
  night: [
    '#2c3e50',
    '#34495e',
    '#7f8c8d',
    '#95a5a6',
    '#bdc3c7',
    '#ecf0f1',
    '#1abc9c',
    '#16a085',
  ],
  nightLights: [
    '#4a266a',
    '#8e44ad',
    '#9b59b6',
    '#e74c3c',
    '#f39c12',
    '#f1c40f',
    '#2ecc71',
    '#1abc9c',
  ],
};

// ========= Curve Types =========
export const CURVE_TYPES: { [key: string]: any } = {
  linear: curveLinear,
  cardinal: curveCardinal,
  basis: curveBasis,
  monotoneX: curveMonotoneX,
  catmullRom: curveCatmullRom,
  step: curveStep,
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

// ========= Color Scheme Helper =========
export function createColorScheme(paletteName: string): Color {
  const domain = COLOR_PALETTES[paletteName] || COLOR_PALETTES['vivid'];
  return {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: domain,
  };
}

// ========= Legend Position Helper =========
export function getLegendPositionEnum(position: string): LegendPosition {
  return position === 'below' ? LegendPosition.Below : LegendPosition.Right;
}

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
  // Axis tick options
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
  // Axis tick defaults
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
}

export const DEFAULT_BAR_CHART_CONFIG: BarChartConfig = {
  ...DEFAULT_BASE_CONFIG,
  ...DEFAULT_AXIS_CONFIG,
  showDataLabel: false,
  barPadding: 8,
  roundEdges: false,
  noBarWhenZero: true,
};

// ========= Line Chart Config =========
export interface LineChartConfig extends BaseChartConfig, AxisConfig {
  curveType: string;
  autoScale: boolean;
  rangeFillOpacity: number;
  showRefLines: boolean;
  showRefLabels: boolean;
  // Timeline for time-series data
  timeline: boolean;
  // Y-axis scale bounds
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

// ========= Area Chart Config =========
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

// ========= Polar Chart Config =========
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

// ========= Pie Chart Config =========
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

// ========= Gauge Chart Config =========
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

// ========= Card Chart Config =========
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

// ========= Heat Map Config =========
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

// ========= Tree Map Config =========
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
