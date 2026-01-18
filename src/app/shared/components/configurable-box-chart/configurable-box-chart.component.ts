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

export interface BoxChartConfig {
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
  // Styling
  gradient: boolean;
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
  roundDomains: boolean;
}

@Component({
  selector: 'app-configurable-box-chart',
  templateUrl: './configurable-box-chart.component.html',
  styleUrls: ['./configurable-box-chart.component.scss'],
})
export class ConfigurableBoxChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousColorScheme: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: BoxChartConfig | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();

  private defaultConfig: BoxChartConfig = {
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'Category',
    yAxisLabel: 'Value',
    legend: false,
    legendTitle: 'Legend',
    legendPosition: 'right',
    gradient: false,
    animations: false,
    tooltipDisabled: false,
    colorScheme: 'vivid',
    roundDomains: false,
  };

  get config(): BoxChartConfig {
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
}
