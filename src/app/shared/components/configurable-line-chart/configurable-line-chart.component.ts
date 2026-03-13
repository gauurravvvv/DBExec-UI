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
import { buildLineChartOption } from '../../helpers/echarts-option-builder';

export interface LineChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface LineChartConfig {
  // Legend options
  legend: boolean;
  legendPosition: string;
  legendTitle: string;
  // Axis options
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  roundDomains: boolean;
  // Axis labels
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  // Axis tick formatting
  trimXAxisTicks: boolean;
  trimYAxisTicks: boolean;
  rotateXAxisTicks: boolean;
  maxXAxisTickLength: number;
  maxYAxisTickLength: number;
  wrapTicks: boolean;
  // Scale
  autoScale: boolean;
  timeline: boolean;
  // Data display
  showDataLabel: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  rangeFillOpacity: number;
  // Curve
  curveType: string;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-line-chart',
  templateUrl: './configurable-line-chart.component.html',
  styleUrls: ['./configurable-line-chart.component.scss'],
})
export class ConfigurableLineChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: LineChartSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: LineChartConfig | undefined;
  @Input() chartType: string = 'line';

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: LineChartConfig = {
    legend: true,
    legendPosition: 'right',
    legendTitle: 'Legend',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X Axis',
    yAxisLabel: 'Y Axis',
    trimXAxisTicks: true,
    trimYAxisTicks: true,
    rotateXAxisTicks: true,
    maxXAxisTickLength: 16,
    maxYAxisTickLength: 16,
    wrapTicks: false,
    autoScale: true,
    timeline: false,
    showDataLabel: false,
    gradient: false,
    animations: false,
    rangeFillOpacity: 0.15,
    curveType: 'linear',
    tooltipDisabled: false,
    colorScheme: 'default',
  };

  get config(): LineChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  curveTypes = [
    { label: 'Linear', value: 'linear' },
    { label: 'Smooth', value: 'monotoneX' },
    { label: 'Step', value: 'step' },
    { label: 'Basis', value: 'basis' },
    { label: 'Cardinal', value: 'cardinal' },
  ];

  legendPositions = [
    { label: 'Right', value: 'right' },
    { label: 'Below', value: 'below' },
  ];

  ngOnInit(): void {
    this.updateChartOption();
    this.previousConfigSnapshot = JSON.stringify(this.config);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['chartConfig'] || changes['chartWidth'] || changes['chartHeight']) {
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
    this.chartOption = buildLineChartOption(this.data, this.config, this.chartType);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }

  onChartMouseOver(event: any): void {
    this.onActivate.emit(event);
  }

  onChartMouseOut(event: any): void {
    this.onDeactivate.emit(event);
  }
}
