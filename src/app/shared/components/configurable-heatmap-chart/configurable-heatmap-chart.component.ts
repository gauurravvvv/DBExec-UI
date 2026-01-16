import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  DoCheck,
  SimpleChanges,
} from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import {
  COLOR_PALETTES,
  DUMMY_SINGLE_SERIES,
  DUMMY_MULTI_SERIES,
  createColorScheme,
  getLegendPositionEnum,
} from '../../helpers/chart-config.helper';

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
export class ConfigurableHeatmapChartComponent
  implements OnInit, OnChanges, DoCheck
{
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

  // Color palettes (using imported constants)
  colorPalettes = COLOR_PALETTES;

  ngOnInit(): void {
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
    return this.config.legendPosition === 'below'
      ? LegendPosition.Below
      : LegendPosition.Right;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
