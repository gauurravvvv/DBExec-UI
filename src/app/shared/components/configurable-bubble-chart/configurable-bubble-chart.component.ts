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
  createColorScheme,
  getLegendPositionEnum,
} from '../../helpers/chart-config.helper';

export interface BubbleChartConfig {
  // Axis
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  // Labels
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  // Legend
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
  // Bubble specific
  autoScale: boolean;
  minRadius: number;
  maxRadius: number;
}

@Component({
  selector: 'app-configurable-bubble-chart',
  templateUrl: './configurable-bubble-chart.component.html',
  styleUrls: ['./configurable-bubble-chart.component.scss'],
})
export class ConfigurableBubbleChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousColorScheme: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: BubbleChartConfig | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  private defaultConfig: BubbleChartConfig = {
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X-Axis',
    yAxisLabel: 'Y-Axis',
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    tooltipDisabled: false,
    colorScheme: 'vivid',
    autoScale: true,
    minRadius: 3,
    maxRadius: 20,
  };

  get config(): BubbleChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  colorSchemeObj: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#AAAAAA'],
  };

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
      const padding = 10;
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
