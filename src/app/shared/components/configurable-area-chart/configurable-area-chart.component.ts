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
import { buildAreaChartOption } from '../../helpers/echarts-option-builder';

export interface AreaChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface AreaChartConfig {
  // Legend options
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
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
  // Styling
  gradient: boolean;
  animations: boolean;
  // Curve
  curveType: string;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-area-chart',
  templateUrl: './configurable-area-chart.component.html',
  styleUrls: ['./configurable-area-chart.component.scss'],
})
export class ConfigurableAreaChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: AreaChartSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: AreaChartConfig | undefined;
  @Input() chartType: string = 'area'; // 'area', 'area-stacked', 'area-normalized'

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: AreaChartConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
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
    gradient: true,
    animations: false,
    curveType: 'linear',
    tooltipDisabled: false,
    colorScheme: 'default',
  };

  get config(): AreaChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  curveTypes = [
    { label: 'Linear', value: 'linear' },
    { label: 'Smooth', value: 'monotoneX' },
    { label: 'Step', value: 'step' },
    { label: 'Basis', value: 'basis' },
    { label: 'Cardinal', value: 'cardinal' },
  ];

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
    this.chartOption = buildAreaChartOption(this.data, this.config, this.chartType);
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
