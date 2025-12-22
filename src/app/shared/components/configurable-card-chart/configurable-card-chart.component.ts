import { Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges } from '@angular/core';
import { Color, ScaleType } from '@swimlane/ngx-charts';
import { COLOR_PALETTES, DUMMY_SINGLE_SERIES, DUMMY_MULTI_SERIES, createColorScheme, getLegendPositionEnum } from '../../helpers/chart-config.helper';

export interface CardChartData {
  name: string;
  value: number;
}

export interface CardChartConfig {
  // Colors
  cardColor: string;
  bandColor: string;
  textColor: string;
  emptyColor: string;
  // Layout
  innerPadding: number;
  // Styling
  animations: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-card-chart',
  templateUrl: './configurable-card-chart.component.html',
  styleUrls: ['./configurable-card-chart.component.scss'],
})
export class ConfigurableCardChartComponent implements OnInit, OnChanges, DoCheck {
  private previousColorScheme: string = '';
  
  @Input() data: CardChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: CardChartConfig | undefined;

  view: [number, number] | undefined;

  @Output() onSelect = new EventEmitter<any>();

  private defaultConfig: CardChartConfig = {
    cardColor: '',
    bandColor: '',
    textColor: '',
    emptyColor: 'rgba(0, 0, 0, 0)',
    innerPadding: 15,
    animations: true,
    colorScheme: 'vivid',
  };

  get config(): CardChartConfig {
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

  dummyData: CardChartData[] = [
    { name: 'Revenue', value: 125000 },
    { name: 'Users', value: 8500 },
    { name: 'Orders', value: 1250 },
    { name: 'Growth', value: 23 },
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

  onChartSelect(event: any): void { this.onSelect.emit(event); }
}
