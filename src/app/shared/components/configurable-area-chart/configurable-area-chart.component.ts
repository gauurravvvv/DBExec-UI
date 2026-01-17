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
import {
  curveLinear,
  curveMonotoneX,
  curveStep,
  curveBasis,
  curveCardinal,
} from 'd3-shape';

export interface AreaChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface AreaChartConfig {
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
  // Axis tick formatting
  trimXAxisTicks: boolean;
  trimYAxisTicks: boolean;
  rotateXAxisTicks: boolean;
  maxXAxisTickLength: number;
  maxYAxisTickLength: number;
  wrapTicks: boolean;
  // Scale
  autoScale: boolean;
  timeline: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  // Curve
  curveType: string;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-area-chart',
  templateUrl: './configurable-area-chart.component.html',
  styleUrls: ['./configurable-area-chart.component.scss'],
})
export class ConfigurableAreaChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousColorScheme: string = '';

  @Input() data: AreaChartSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: AreaChartConfig | undefined;
  @Input() chartType: string = 'area'; // 'area', 'area-stacked', 'area-normalized'

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  private defaultConfig: AreaChartConfig = {
    legend: false,
    legendTitle: 'Legend',
    legendPosition: 'right',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X Axis',
    yAxisLabel: 'Y Axis',
    // Tick formatting defaults
    trimXAxisTicks: true,
    trimYAxisTicks: true,
    rotateXAxisTicks: true,
    maxXAxisTickLength: 16,
    maxYAxisTickLength: 16,
    wrapTicks: false,
    autoScale: true,
    timeline: false,
    gradient: true,
    animations: false,
    curveType: 'linear',
    tooltipDisabled: false,
    colorScheme: 'vivid',
  };

  get config(): AreaChartConfig {
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

  curveTypes = [
    { label: 'Linear', value: 'linear' },
    { label: 'Smooth', value: 'monotoneX' },
    { label: 'Step', value: 'step' },
    { label: 'Basis', value: 'basis' },
    { label: 'Cardinal', value: 'cardinal' },
  ];

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
      // Minimal padding - let ngx-charts handle internal layout
      const padding = 10;
      let width = this.chartWidth - padding;
      let height = this.chartHeight - padding;

      // ngx-charts handles legend space internally
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
    return this.config.legendPosition === 'below'
      ? LegendPosition.Below
      : LegendPosition.Right;
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
