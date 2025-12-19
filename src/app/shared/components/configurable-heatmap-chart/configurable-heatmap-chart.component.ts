import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';

export interface HeatMapSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface HeatMapConfig {
  // Legend options
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Axis options
  xAxis: boolean;
  yAxis: boolean;
  // Axis labels
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  // Tick options
  trimXAxisTicks: boolean;
  trimYAxisTicks: boolean;
  rotateXAxisTicks: boolean;
  maxXAxisTickLength: number;
  maxYAxisTickLength: number;
  wrapTicks: boolean;
  // Styling
  gradient: boolean;
  innerPadding: number;
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-heatmap-chart',
  templateUrl: './configurable-heatmap-chart.component.html',
  styleUrls: ['./configurable-heatmap-chart.component.scss'],
})
export class ConfigurableHeatmapChartComponent implements OnInit, OnChanges, DoCheck {
  private previousColorScheme: string = '';
  
  @Input() data: HeatMapSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: HeatMapConfig | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();

  private defaultConfig: HeatMapConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    xAxis: true,
    yAxis: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X Axis',
    yAxisLabel: 'Y Axis',
    trimXAxisTicks: true,
    trimYAxisTicks: true,
    rotateXAxisTicks: true,
    maxXAxisTickLength: 16,
    maxYAxisTickLength: 16,
    wrapTicks: false,
    gradient: false,
    innerPadding: 8,
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'cool',
  };

  get config(): HeatMapConfig {
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

  dummyData: HeatMapSeries[] = [
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
      domain: palette || this.colorPalettes['cool'],
    };
  }

  getLegendPosition(): LegendPosition {
    return this.config.legendPosition === 'below' ? LegendPosition.Below : LegendPosition.Right;
  }

  onChartSelect(event: any): void { this.onSelect.emit(event); }
}
