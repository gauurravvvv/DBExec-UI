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
import {
  COLOR_PALETTES,
  DUMMY_MULTI_SERIES,
  DEFAULT_BAR_CHART_CONFIG,
  BarChartConfig,
} from '../../helpers/chart-config.helper';
import { buildBarChartOption } from '../../helpers/echarts-option-builder';

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
  // Track previous config snapshot to detect any property change
  private previousConfigSnapshot: string = '';

  // Data input
  @Input() data: BarChartData[] = [];

  // Whether to show the configuration panel
  @Input() showConfigPanel: boolean = true;

  // Dynamic sizing inputs
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  // External config input (from parent component)
  @Input() chartConfig: BarChartConfig | undefined;

  // Chart type variant
  @Input() chartType: string = 'bar-vertical';

  // Output events
  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  // ECharts
  chartOption: any = {};
  echartsInstance: any = null;

  // Internal configuration state (uses imported default from helper)
  private defaultConfig: BarChartConfig = { ...DEFAULT_BAR_CHART_CONFIG };

  // Active config - use input if provided, else use default
  get config(): BarChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  // Configuration panel collapsed state
  isConfigPanelCollapsed: boolean = false;

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

  // Multi-series data for grouped/stacked/normalized charts
  multiData = DUMMY_MULTI_SERIES;

  ngOnInit(): void {
    this.updateChartOption();
    this.previousConfigSnapshot = JSON.stringify(this.config);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['chartConfig'] || changes['chartType'] ||
        changes['chartWidth'] || changes['chartHeight']) {
      this.updateChartOption();
      this.previousConfigSnapshot = JSON.stringify(this.config);
    }
  }

  ngDoCheck(): void {
    if (this.config) {
      const snapshot = JSON.stringify(this.config);
      if (snapshot !== this.previousConfigSnapshot) {
        this.previousConfigSnapshot = snapshot;
        this.updateChartOption();
      }
    }
  }

  updateChartOption(): void {
    this.chartOption = buildBarChartOption(this.data, this.config, this.chartType, this.multiData);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  toggleConfigPanel(): void {
    this.isConfigPanelCollapsed = !this.isConfigPanelCollapsed;
  }

  onColorSchemeChange(): void {
    this.updateChartOption();
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
}
