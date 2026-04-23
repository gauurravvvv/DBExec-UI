import { ChangeDetectionStrategy, Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  DoCheck,
  SimpleChanges, } from '@angular/core';
import { buildGaugeChartOption } from '../../helpers/echarts-option-builder';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurableGaugeChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: GaugeChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: GaugeChartConfig | undefined;
  @Input() chartType: string = 'gauge'; // 'gauge' or 'linear-gauge'

  // Linear gauge specific inputs
  @Input() value: number = 0;
  @Input() previousValue: number | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

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
    colorScheme: 'default',
  };

  get config(): GaugeChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  // For linear gauge, use a single value
  get linearValue(): number {
    return this.data && this.data.length > 0 ? this.data[0].value : this.value;
  }

  get linearPercentage(): number {
    const min = this.config.min || 0;
    const max = this.config.max || 100;
    const range = max - min;
    if (range <= 0) return 0;
    return Math.min(100, Math.max(0, ((this.linearValue - min) / range) * 100));
  }

  get linearGaugeColor(): string {
    return '#5470c6';
  }

  ngOnInit(): void {
    this.updateChartOption();
    this.previousConfigSnapshot = JSON.stringify(this.config);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['data'] ||
      changes['chartConfig'] ||
      changes['chartType'] ||
      changes['chartWidth'] ||
      changes['chartHeight'] ||
      changes['value']
    ) {
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
    if (this.chartType === 'gauge') {
      this.chartOption = buildGaugeChartOption(this.data, this.config);
    }
    // Linear gauge uses custom HTML, no chart option needed
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }

  onLinearGaugeClick(): void {
    this.onSelect.emit({ name: '', value: this.linearValue });
  }
}
