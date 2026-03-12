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
import { COLOR_PALETTES } from '../../helpers/chart-config.helper';

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
export class ConfigurableCardChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: CardChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: CardChartConfig | undefined;

  @Output() onSelect = new EventEmitter<any>();

  colors: string[] = [];

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

  // Color palettes (using imported constants)
  colorPalettes = COLOR_PALETTES;

  ngOnInit(): void {
    this.updateColors();
    this.previousConfigSnapshot = JSON.stringify(this.config);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartConfig'] || changes['data']) {
      this.updateColors();
      this.previousConfigSnapshot = JSON.stringify(this.config);
    }
  }

  ngDoCheck(): void {
    if (this.config) {
      const snapshot = JSON.stringify(this.config);
      if (snapshot !== this.previousConfigSnapshot) {
        this.previousConfigSnapshot = snapshot;
        this.updateColors();
      }
    }
  }

  private updateColors(): void {
    this.colors = this.colorPalettes[this.config.colorScheme] || this.colorPalettes['vivid'];
  }

  getCardColor(index: number): string {
    if (this.config.cardColor) return this.config.cardColor;
    return this.colors[index % this.colors.length];
  }

  getBandColor(index: number): string {
    if (this.config.bandColor) return this.config.bandColor;
    const color = this.colors[index % this.colors.length];
    // Darken slightly for band
    return color;
  }

  getTextColor(): string {
    return this.config.textColor || '#ffffff';
  }

  formatValue(value: number): string {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return String(value);
  }

  onCardSelect(item: CardChartData): void {
    this.onSelect.emit(item);
  }
}
