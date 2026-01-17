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
  DEFAULT_BAR_CHART_CONFIG,
  BarChartConfig,
  createColorScheme,
  getLegendPositionEnum,
} from '../../helpers/chart-config.helper';

export interface BarChartData {
  name: string;
  value: number;
}

// BarChartConfig is imported from chart-config.helper.ts

@Component({
  selector: 'app-configurable-bar-chart',
  templateUrl: './configurable-bar-chart.component.html',
  styleUrls: ['./configurable-bar-chart.component.scss'],
})
export class ConfigurableBarChartComponent
  implements OnInit, OnChanges, DoCheck
{
  // Track previous color scheme to detect changes
  private previousColorScheme: string = '';
  // Data input
  @Input() data: BarChartData[] = [];

  // Whether to show the configuration panel
  @Input() showConfigPanel: boolean = true;

  // Dynamic sizing inputs
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  // External config input (from parent component)
  @Input() chartConfig: BarChartConfig | undefined;

  // Chart type variant (bar-vertical, bar-horizontal, bar-vertical-2d, etc.)
  @Input() chartType: string = 'bar-vertical';

  // View dimensions for ngx-charts [width, height]
  view: [number, number] | undefined;

  // Output events
  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  // Internal configuration state (uses imported default from helper)
  private defaultConfig: BarChartConfig = { ...DEFAULT_BAR_CHART_CONFIG };

  // Active config - use input if provided, else use default
  get config(): BarChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  // Configuration panel collapsed state
  isConfigPanelCollapsed: boolean = false;

  // Color scheme object for ngx-charts
  colorSchemeObj: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: [],
  };

  // Available color schemes
  colorSchemes = [
    { label: 'Vivid', value: 'vivid' },
    { label: 'Natural', value: 'natural' },
    { label: 'Cool', value: 'cool' },
    { label: 'Fire', value: 'fire' },
    { label: 'Solar', value: 'solar' },
    { label: 'Air', value: 'air' },
    { label: 'Aqua', value: 'aqua' },
    { label: 'Flame', value: 'flame' },
    { label: 'Ocean', value: 'ocean' },
    { label: 'Forest', value: 'forest' },
    { label: 'Horizon', value: 'horizon' },
    { label: 'Neons', value: 'neons' },
    { label: 'Picnic', value: 'picnic' },
    { label: 'Night', value: 'night' },
    { label: 'Night Lights', value: 'nightLights' },
  ];

  // Color scheme palettes (using imported constants)
  private colorPalettes = COLOR_PALETTES;

  // Multi-series data for grouped/stacked/normalized charts
  multiData = DUMMY_MULTI_SERIES;

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
    // Detect changes to colorScheme within the config object
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

      // ngx-charts handles legend space internally, no need to manually subtract
      // Just ensure minimum dimensions
      this.view = [Math.max(width, 100), Math.max(height, 100)];
    } else {
      // Let ngx-charts auto-size
      this.view = undefined;
    }
  }

  toggleConfigPanel(): void {
    this.isConfigPanelCollapsed = !this.isConfigPanelCollapsed;
  }

  onColorSchemeChange(): void {
    this.updateColorScheme();
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

  handleSelect(event: any): void {
    this.onSelect.emit(event);
  }

  handleActivate(event: any): void {
    this.onActivate.emit(event);
  }

  handleDeactivate(event: any): void {
    this.onDeactivate.emit(event);
  }

  getLegendPosition(): LegendPosition {
    return getLegendPositionEnum(this.config.legendPosition);
  }
}
