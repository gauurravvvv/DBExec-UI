import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';

export interface BarChartData {
  name: string;
  value: number;
}

export interface BarChartConfig {
  // Legend options
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Axis options
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  roundDomains: boolean;
  // Axis labels
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  // Data display
  showDataLabel: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  roundEdges: boolean;
  // Bar specific
  barPadding: number;
  noBarWhenZero: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-bar-chart',
  templateUrl: './configurable-bar-chart.component.html',
  styleUrls: ['./configurable-bar-chart.component.scss'],
})
export class ConfigurableBarChartComponent implements OnInit, OnChanges, DoCheck {
  // Track previous color scheme to detect changes
  private previousColorScheme: string = '';
  // Data input
  @Input() data: BarChartData[] = [];

  // Whether to show the configuration panel
  @Input() showConfigPanel: boolean = true;

  // Dynamic sizing inputs
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  // External config input (from parent component)
  @Input() chartConfig: BarChartConfig | undefined;
  
  // Chart type variant (bar-vertical, bar-horizontal, bar-vertical-2d, etc.)
  @Input() chartType: string = 'bar-vertical';

  // View dimensions for ngx-charts [width, height]
  view: [number, number] | undefined;

  // Output events
  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  // Internal configuration state (used when chartConfig not provided)
  private defaultConfig: BarChartConfig = {
    legend: false,
    legendTitle: 'Legend',
    legendPosition: 'right',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'Category',
    yAxisLabel: 'Value',
    showDataLabel: false,
    gradient: false,
    animations: false,
    roundEdges: false,
    barPadding: 8,
    noBarWhenZero: true,
    tooltipDisabled: false,
    colorScheme: 'vivid',
  };

  // Active config - use input if provided, else use default
  get config(): BarChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  // Configuration panel collapsed state
  isConfigPanelCollapsed: boolean = false;

  // Color scheme object for ngx-charts
  colorSchemeObj: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: []
  };

  // Available color schemes
  colorSchemes = [
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
    { label: 'Picnic', value: 'picnic' },
    { label: 'Night', value: 'night' },
    { label: 'Night Lights', value: 'nightLights' },
  ];

  // Color scheme palettes
  private colorPalettes: { [key: string]: string[] } = {
    vivid: ['#647c8a', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39'],
    natural: ['#bf9d76', '#e99450', '#d89f59', '#f2dfa7', '#a5d7c6', '#7794b1', '#afafaf', '#707160'],
    cool: ['#a8385d', '#7aa3e5', '#a27ea8', '#aae3f5', '#adcded', '#a95963', '#8796c0', '#7ed3ed'],
    fire: ['#ff3d00', '#bf360c', '#ff6e40', '#ff9e80', '#ffccbc', '#d84315', '#ff5722', '#e64a19'],
    solar: ['#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000'],
    air: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1'],
    aqua: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7'],
    flame: ['#a10a28', '#d3342d', '#ef6d49', '#faad67', '#fdde90', '#dbed91', '#a9d770', '#6cba67'],
    ocean: ['#1a237e', '#283593', '#303f9f', '#3949ab', '#3f51b5', '#5c6bc0', '#7986cb', '#9fa8da'],
    forest: ['#1b5e20', '#2e7d32', '#388e3c', '#43a047', '#4caf50', '#66bb6a', '#81c784', '#a5d6a7'],
    horizon: ['#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b'],
    neons: ['#ff00ff', '#00ffff', '#ff0066', '#00ff00', '#ffff00', '#ff3300', '#00ff99', '#9900ff'],
    picnic: ['#ffc6ff', '#bdb2ff', '#a0c4ff', '#9bf6ff', '#caffbf', '#fdffb6', '#ffd6a5', '#ffadad'],
    night: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1', '#1abc9c', '#16a085'],
    nightLights: ['#4a266a', '#8e44ad', '#9b59b6', '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c'],
  };

  // Dummy data for initial rendering (single series)
  private dummyData: BarChartData[] = [
    { name: 'Germany', value: 8940000 },
    { name: 'USA', value: 5000000 },
    { name: 'France', value: 7200000 },
    { name: 'UK', value: 6200000 },
    { name: 'Italy', value: 4900000 },
    { name: 'Spain', value: 4100000 },
  ];

  // Multi-series data for grouped/stacked/normalized charts
  multiData: any[] = [
    {
      name: 'Germany',
      series: [
        { name: '2020', value: 8940000 },
        { name: '2021', value: 9200000 },
        { name: '2022', value: 9500000 },
      ]
    },
    {
      name: 'USA',
      series: [
        { name: '2020', value: 5000000 },
        { name: '2021', value: 5300000 },
        { name: '2022', value: 5600000 },
      ]
    },
    {
      name: 'France',
      series: [
        { name: '2020', value: 7200000 },
        { name: '2021', value: 7500000 },
        { name: '2022', value: 7800000 },
      ]
    },
  ];

  ngOnInit(): void {
    // Use dummy data if no data is provided
    if (!this.data || this.data.length === 0) {
      this.data = [...this.dummyData];
    }
    this.updateColorScheme();
    this.updateViewDimensions();
    this.previousColorScheme = this.config.colorScheme;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartWidth'] || changes['chartHeight']) {
      this.updateViewDimensions();
    }
    if (changes['chartConfig']) {
      this.updateColorScheme();
      this.previousColorScheme = this.config.colorScheme;
    }
  }

  ngDoCheck(): void {
    // Detect changes to colorScheme within the config object
    if (this.config && this.config.colorScheme !== this.previousColorScheme) {
      this.previousColorScheme = this.config.colorScheme;
      this.updateColorScheme();
    }
  }

  private updateViewDimensions(): void {
    if (this.chartWidth && this.chartHeight) {
      // Account for header (~45px) and some padding
      const headerHeight = 45;
      const padding = 20;
      const width = this.chartWidth - padding;
      const height = this.chartHeight - headerHeight - padding;
      this.view = [Math.max(width, 100), Math.max(height, 100)];
    } else {
      // Let ngx-charts auto-size
      this.view = undefined;
    }
  }

  toggleConfigPanel(): void {
    this.isConfigPanelCollapsed = !this.isConfigPanelCollapsed;
  }

  onColorSchemeChange(): void {
    this.updateColorScheme();
  }

  private updateColorScheme(): void {
    const palette = this.colorPalettes[this.config.colorScheme];
    this.colorSchemeObj = {
      name: 'custom',
      selectable: true,
      group: ScaleType.Ordinal,
      domain: palette || this.colorPalettes['vivid']
    };
  }

  handleSelect(event: any): void {
    this.onSelect.emit(event);
  }

  handleActivate(event: any): void {
    this.onActivate.emit(event);
  }

  handleDeactivate(event: any): void {
    this.onDeactivate.emit(event);
  }

  getLegendPosition(): LegendPosition {
    return this.config.legendPosition === 'below' ? LegendPosition.Below : LegendPosition.Right;
  }
}
