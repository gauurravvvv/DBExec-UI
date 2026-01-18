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

export interface GaugeChartData {
  name: string;
  value: number;
}

export interface GaugeChartConfig {
  // Legend (Gauge only)
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Scale
  min: number;
  max: number;
  units: string;
  // Gauge specific
  bigSegments: number;
  smallSegments: number;
  showAxis: boolean;
  angleSpan: number;
  startAngle: number;
  showText: boolean;
  // Styling
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-gauge-chart',
  templateUrl: './configurable-gauge-chart.component.html',
  styleUrls: ['./configurable-gauge-chart.component.scss'],
})
export class ConfigurableGaugeChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousColorScheme: string = '';

  @Input() data: GaugeChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: GaugeChartConfig | undefined;
  @Input() chartType: string = 'gauge'; // 'gauge' or 'linear-gauge'

  // Linear gauge specific inputs
  @Input() value: number = 0;
  @Input() previousValue: number | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  private defaultConfig: GaugeChartConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    min: 0,
    max: 100,
    units: '%',
    bigSegments: 10,
    smallSegments: 5,
    showAxis: true,
    angleSpan: 240,
    startAngle: -120,
    showText: true,
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'vivid',
  };

  get config(): GaugeChartConfig {
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

  // For linear gauge, use a single value
  get linearValue(): number {
    return this.data && this.data.length > 0 ? this.data[0].value : this.value;
  }

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
      let width = this.chartWidth - padding;
      let height = this.chartHeight - padding;

      // When legend is below and enabled, subtract space for legend
      if (this.config.legend && this.config.legendPosition === 'below') {
        const legendHeight = 80; // Space for legend + spacing
        height = height - legendHeight;
      }

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
