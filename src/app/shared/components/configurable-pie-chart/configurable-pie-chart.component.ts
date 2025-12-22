import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { COLOR_PALETTES, DUMMY_SINGLE_SERIES, DUMMY_MULTI_SERIES, createColorScheme, getLegendPositionEnum } from '../../helpers/chart-config.helper';

export interface PieChartData {
  name: string;
  value: number;
}

export interface PieChartConfig {
  // Legend options
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Labels
  labels: boolean;
  trimLabels: boolean;
  maxLabelLength: number;
  // Pie specific
  doughnut: boolean;
  arcWidth: number;
  explodeSlices: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-pie-chart',
  templateUrl: './configurable-pie-chart.component.html',
  styleUrls: ['./configurable-pie-chart.component.scss'],
})
export class ConfigurablePieChartComponent implements OnInit, OnChanges, DoCheck {
  private previousColorScheme: string = '';
  
  @Input() data: PieChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: PieChartConfig | undefined;
  @Input() chartType: string = 'pie'; // pie, advanced-pie, pie-grid

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  private defaultConfig: PieChartConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    labels: true,
    trimLabels: true,
    maxLabelLength: 10,
    doughnut: false,
    arcWidth: 0.25,
    explodeSlices: false,
    gradient: false,
    animations: false,
    tooltipDisabled: false,
    colorScheme: 'vivid',
  };

  get config(): PieChartConfig {
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

  // Dummy data (using imported constants)
  dummyData = DUMMY_SINGLE_SERIES;

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

  getLegendPosition(): LegendPosition {
    return this.config.legendPosition === 'below' ? LegendPosition.Below : LegendPosition.Right;
  }

  onChartSelect(event: any): void { this.onSelect.emit(event); }
  onChartActivate(event: any): void { this.onActivate.emit(event); }
  onChartDeactivate(event: any): void { this.onDeactivate.emit(event); }
}
