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
  curveCardinalClosed,
  curveCatmullRomClosed,
  curveLinearClosed,
} from 'd3-shape';

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
  gradient: boolean;
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
export class ConfigurablePolarChartComponent
  implements OnInit, OnChanges, DoCheck
{
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
    gradient: false,
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
      case 'cardinalClosed':
        return curveCardinalClosed;
      case 'catmullRomClosed':
        return curveCatmullRomClosed;
      case 'linearClosed':
        return curveLinearClosed;
      default:
        return curveLinearClosed;
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
