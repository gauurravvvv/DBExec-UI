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
import { buildBoxPlotChartOption } from '../../helpers/echarts-option-builder';

export interface BoxChartConfig {
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
  // Styling
  gradient: boolean;
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
  roundDomains: boolean;
}

@Component({
  selector: 'app-configurable-box-chart',
  templateUrl: './configurable-box-chart.component.html',
  styleUrls: ['./configurable-box-chart.component.scss'],
})
export class ConfigurableBoxChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: BoxChartConfig | undefined;

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: BoxChartConfig = {
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'Category',
    yAxisLabel: 'Value',
    legend: false,
    legendTitle: 'Legend',
    legendPosition: 'right',
    gradient: false,
    animations: false,
    tooltipDisabled: false,
    colorScheme: 'vivid',
    roundDomains: false,
  };

  get config(): BoxChartConfig {
    return this.chartConfig || this.defaultConfig;
  }

  colorPalettes = COLOR_PALETTES;

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
    this.chartOption = buildBoxPlotChartOption(this.data, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
