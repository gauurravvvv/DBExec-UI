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
import { buildBubbleChartOption } from '../../helpers/echarts-option-builder';

export interface BubbleChartConfig {
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
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
  // Bubble specific
  autoScale: boolean;
  minRadius: number;
  maxRadius: number;
}

@Component({
  selector: 'app-configurable-bubble-chart',
  templateUrl: './configurable-bubble-chart.component.html',
  styleUrls: ['./configurable-bubble-chart.component.scss'],
})
export class ConfigurableBubbleChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: BubbleChartConfig | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: BubbleChartConfig = {
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'X-Axis',
    yAxisLabel: 'Y-Axis',
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    tooltipDisabled: false,
    colorScheme: 'default',
    autoScale: true,
    minRadius: 3,
    maxRadius: 20,
  };

  get config(): BubbleChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

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
    this.chartOption = buildBubbleChartOption(this.data, this.config);
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
