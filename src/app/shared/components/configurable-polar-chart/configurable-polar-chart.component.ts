import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { curveLinear, curveCardinalClosed, curveCatmullRomClosed, curveLinearClosed } from 'd3-shape';

export interface PolarChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface PolarChartConfig {
  // Legend
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Axis
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
  // Styling
  animations: boolean;
  rangeFillOpacity: number;
  // Curve
  curveType: string;
  // Labels
  labelTrim: boolean;
  labelTrimSize: number;
  // Tooltip
  tooltipDisabled: boolean;
  showSeriesOnHover: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-polar-chart',
  templateUrl: './configurable-polar-chart.component.html',
  styleUrls: ['./configurable-polar-chart.component.scss'],
})
export class ConfigurablePolarChartComponent implements OnInit, OnChanges, DoCheck {
  private previousColorScheme: string = '';
  
  @Input() data: PolarChartSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: PolarChartConfig | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  private defaultConfig: PolarChartConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: false,
    showYAxisLabel: false,
    xAxisLabel: '',
    yAxisLabel: '',
    autoScale: true,
    animations: false,
    rangeFillOpacity: 0.15,
    curveType: 'linearClosed',
    labelTrim: true,
    labelTrimSize: 10,
    tooltipDisabled: false,
    showSeriesOnHover: true,
    colorScheme: 'vivid',
  };

  get config(): PolarChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  colorSchemeObj: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#AAAAAA'],
  };

  colorPalettes: { [key: string]: string[] } = {
    vivid: ['#647c8a', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39'],
    natural: ['#bf9d76', '#e99450', '#d89f59', '#f2dfa7', '#a5d7c6', '#7794b1', '#afafaf', '#707160'],
    cool: ['#a8385d', '#7aa3e5', '#a27ea8', '#aae3f5', '#adcded', '#a95963', '#8796c0', '#7ed3ed'],
    fire: ['#ff3d00', '#bf360c', '#ff6e40', '#ff9e80', '#ffab40', '#ffcc80', '#ffecb3', '#fff3e0'],
    ocean: ['#1abc9c', '#16a085', '#3498db', '#2980b9', '#9b59b6', '#8e44ad', '#34495e', '#2c3e50'],
    forest: ['#27ae60', '#2ecc71', '#1abc9c', '#16a085', '#f39c12', '#f1c40f', '#e67e22', '#d35400'],
  };

  dummyData: PolarChartSeries[] = [
    {
      name: 'Team A',
      series: [
        { name: 'Communication', value: 85 },
        { name: 'Problem Solving', value: 90 },
        { name: 'Technical Skills', value: 75 },
        { name: 'Teamwork', value: 88 },
        { name: 'Creativity', value: 70 },
        { name: 'Leadership', value: 65 },
      ],
    },
    {
      name: 'Team B',
      series: [
        { name: 'Communication', value: 70 },
        { name: 'Problem Solving', value: 80 },
        { name: 'Technical Skills', value: 95 },
        { name: 'Teamwork', value: 75 },
        { name: 'Creativity', value: 85 },
        { name: 'Leadership', value: 80 },
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
      case 'cardinalClosed': return curveCardinalClosed;
      case 'catmullRomClosed': return curveCatmullRomClosed;
      case 'linearClosed': return curveLinearClosed;
      default: return curveLinearClosed;
    }
  }

  getLegendPosition(): LegendPosition {
    return this.config.legendPosition === 'below' ? LegendPosition.Below : LegendPosition.Right;
  }

  onChartSelect(event: any): void { this.onSelect.emit(event); }
  onChartActivate(event: any): void { this.onActivate.emit(event); }
  onChartDeactivate(event: any): void { this.onDeactivate.emit(event); }
}
