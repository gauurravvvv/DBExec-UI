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
import { buildPolarChartOption } from '../../helpers/echarts-option-builder';

export interface PolarChartSeries {
  name: string;
  series: { name: string; value: number }[];
}

export interface PolarChartConfig {
  // Legend
  legend: boolean;
  legendTitle: string;
  legendPosition: string;
  // Axis
  xAxis: boolean;
  yAxis: boolean;
  showGridLines: boolean;
  roundDomains: boolean;
  // Axis labels
  showXAxisLabel: boolean;
  showYAxisLabel: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  // Scale
  autoScale: boolean;
  // Styling
  gradient: boolean;
  animations: boolean;
  rangeFillOpacity: number;
  // Curve
  curveType: string;
  // Labels
  labelTrim: boolean;
  labelTrimSize: number;
  // Tooltip
  tooltipDisabled: boolean;
  showSeriesOnHover: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-polar-chart',
  templateUrl: './configurable-polar-chart.component.html',
  styleUrls: ['./configurable-polar-chart.component.scss'],
})
export class ConfigurablePolarChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: PolarChartSeries[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: PolarChartConfig | undefined;

  @Output() onSelect = new EventEmitter<any>();
  @Output() onActivate = new EventEmitter<any>();
  @Output() onDeactivate = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: PolarChartConfig = {
    legend: true,
    legendTitle: 'Legend',
    legendPosition: 'right',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    roundDomains: false,
    showXAxisLabel: false,
    showYAxisLabel: false,
    xAxisLabel: '',
    yAxisLabel: '',
    autoScale: true,
    gradient: false,
    animations: false,
    rangeFillOpacity: 0.15,
    curveType: 'linearClosed',
    labelTrim: true,
    labelTrimSize: 10,
    tooltipDisabled: false,
    showSeriesOnHover: true,
    colorScheme: 'default',
  };

  get config(): PolarChartConfig {
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
    this.chartOption = buildPolarChartOption(this.data, this.config);
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
