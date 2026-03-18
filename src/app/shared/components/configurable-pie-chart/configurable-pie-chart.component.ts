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
import { buildPieChartOption } from '../../helpers/echarts-option-builder';

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
export class ConfigurablePieChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: PieChartData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: PieChartConfig | undefined;
  @Input() chartType: string = 'pie'; // pie, donut, pie-advanced, pie-grid

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

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
    colorScheme: 'default',
  };

  get config(): PieChartConfig {
    return this.chartConfig || this.defaultConfig;
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
      changes['chartHeight']
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
    this.chartOption = buildPieChartOption(
      this.data,
      this.config,
      this.chartType,
    );
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
