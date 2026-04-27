import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    colorScheme: 'default',
  };

  get config(): CardChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

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
    const scheme = this.config.colorScheme || 'default';
    this.colors = COLOR_PALETTES[scheme] || COLOR_PALETTES['default'];
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

  getTextColor(index: number): string {
    if (this.config.textColor) return this.config.textColor;
    // Auto-detect text color based on card background brightness
    const bgColor = this.getCardColor(index);
    return this.isLightColor(bgColor) ? '#333333' : '#ffffff';
  }

  private isLightColor(hex: string): boolean {
    const color = hex.replace('#', '');
    if (color.length !== 6) return false;
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    // Perceived brightness (ITU-R BT.709)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150;
  }

  formatValue(value: number): string {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return String(value);
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  onCardSelect(item: CardChartData): void {
    this.onSelect.emit(item);
  }
}
