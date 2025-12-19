import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { curveLinear, curveMonotoneX, curveStep, curveBasis, curveCardinal } from 'd3-shape';

export interface LineChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface LineChartConfig {
  // Legend options
  legend: boolean;
  legendPosition: string;
  legendTitle: string;
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
  // Scale
  autoScale: boolean;
  timeline: boolean;
  // Data display
  showDataLabel: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  rangeFillOpacity: number;
  // Curve
  curveType: string;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-line-chart',
  templateUrl: './configurable-line-chart.component.html',
  styleUrls: ['./configurable-line-chart.component.scss'],
})
export class ConfigurableLineChartComponent implements OnInit, OnChanges, DoCheck {
  // Track previous color scheme to detect changes
  private previousColorScheme: string = '';
  
  // Data input
  @Input() data: LineChartSeries[] = [];

  // Whether to show the configuration panel
  @Input() showConfigPanel: boolean = true;

  // Dynamic sizing inputs
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  // External config input (from parent component)
  @Input() chartConfig: LineChartConfig | undefined;

  // View dimensions for ngx-charts [width, height]
  view: [number, number] | undefined;

  // Output events
  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  // Internal configuration state (used when chartConfig not provided)
  private defaultConfig: LineChartConfig = {
    legend: false,
    legendPosition: 'right',
    legendTitle: 'Legend',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X Axis',
    yAxisLabel: 'Y Axis',
    autoScale: true,
    timeline: false,
    showDataLabel: false,
    gradient: false,
    animations: false,
    rangeFillOpacity: 0.15,
    curveType: 'linear',
    tooltipDisabled: false,
    colorScheme: 'vivid',
  };

  // Active config - use input if provided, else use default
  get config(): LineChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  // Color scheme object for ngx-charts
  colorSchemeObj: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#AAAAAA'],
  };

  // Available color palettes
  colorPalettes: { [key: string]: string[] } = {
    vivid: ['#647c8a', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39'],
    natural: ['#bf9d76', '#e99450', '#d89f59', '#f2dfa7', '#a5d7c6', '#7794b1', '#afafaf', '#707160'],
    cool: ['#a8385d', '#7aa3e5', '#a27ea8', '#aae3f5', '#adcded', '#a95963', '#8796c0', '#7ed3ed'],
    fire: ['#ff3d00', '#bf360c', '#ff6e40', '#ff9e80', '#ffab40', '#ffcc80', '#ffecb3', '#fff3e0'],
    solar: ['#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000'],
    air: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1'],
    aqua: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7'],
    flame: ['#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2'],
    ocean: ['#1abc9c', '#16a085', '#3498db', '#2980b9', '#9b59b6', '#8e44ad', '#34495e', '#2c3e50'],
    forest: ['#27ae60', '#2ecc71', '#1abc9c', '#16a085', '#f39c12', '#f1c40f', '#e67e22', '#d35400'],
    horizon: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1', '#3498db', '#2980b9'],
    neons: ['#ff00ff', '#00ffff', '#ffff00', '#ff6600', '#ff0066', '#00ff66', '#6600ff', '#66ff00'],
    picnic: ['#fad0c3', '#fdd5b1', '#f0e6ce', '#d5e8d4', '#b6d7a8', '#a4c2f4', '#b4a7d6', '#d5a6bd'],
    nightLights: ['#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784', '#aed581', '#dce775', '#fff176', '#ffb74d'],
  };

  // Curve types
  curveTypes = [
    { label: 'Linear', value: 'linear' },
    { label: 'Smooth', value: 'monotoneX' },
    { label: 'Step', value: 'step' },
    { label: 'Basis', value: 'basis' },
    { label: 'Cardinal', value: 'cardinal' },
  ];

  // Legend positions
  legendPositions = [
    { label: 'Right', value: 'right' },
    { label: 'Below', value: 'below' },
  ];

  // Dummy data for preview
  dummyData: LineChartSeries[] = [
    {
      name: 'Series A',
      series: [
        { name: 'Jan', value: 8500 },
        { name: 'Feb', value: 7300 },
        { name: 'Mar', value: 9100 },
        { name: 'Apr', value: 8400 },
        { name: 'May', value: 9800 },
        { name: 'Jun', value: 11200 },
      ],
    },
    {
      name: 'Series B',
      series: [
        { name: 'Jan', value: 6200 },
        { name: 'Feb', value: 5800 },
        { name: 'Mar', value: 7100 },
        { name: 'Apr', value: 6500 },
        { name: 'May', value: 7800 },
        { name: 'Jun', value: 8400 },
      ],
    },
  ];

  ngOnInit(): void {
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
    if (this.config && this.config.colorScheme !== this.previousColorScheme) {
      this.previousColorScheme = this.config.colorScheme;
      this.updateColorScheme();
    }
  }

  private updateViewDimensions(): void {
    if (this.chartWidth && this.chartHeight) {
      const padding = 20;
      const width = this.chartWidth - padding;
      const height = this.chartHeight - padding;
      this.view = [Math.max(width, 100), Math.max(height, 100)];
    } else {
      this.view = undefined;
    }
  }

  private updateColorScheme(): void {
    const palette = this.colorPalettes[this.config.colorScheme];
    this.colorSchemeObj = {
      name: 'custom',
      selectable: true,
      group: ScaleType.Ordinal,
      domain: palette || this.colorPalettes['vivid'],
    };
  }

  getCurve(): any {
    switch (this.config.curveType) {
      case 'monotoneX':
        return curveMonotoneX;
      case 'step':
        return curveStep;
      case 'basis':
        return curveBasis;
      case 'cardinal':
        return curveCardinal;
      default:
        return curveLinear;
    }
  }

  getLegendPosition(): LegendPosition {
    return this.config.legendPosition === 'below' ? LegendPosition.Below : LegendPosition.Right;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }

  onChartActivate(event: any): void {
    this.onActivate.emit(event);
  }

  onChartDeactivate(event: any): void {
    this.onDeactivate.emit(event);
  }
}
