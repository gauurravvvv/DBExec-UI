import { ChangeDetectionStrategy, Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  DoCheck,
  SimpleChanges, } from '@angular/core';
import { buildPictorialBarChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-pictorial-bar-chart',
  templateUrl: './configurable-pictorial-bar-chart.component.html',
  styleUrls: ['./configurable-pictorial-bar-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurablePictorialBarChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';
  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;
  @Output() onSelect = new EventEmitter<any>();
  chartOption: any = {};
  echartsInstance: any = null;
  private defaultConfig: any = {
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'default',
    showDataLabel: false,
    xAxis: true,
    yAxis: true,
    showGridLines: true,
    showXAxisLabel: true,
    showYAxisLabel: true,
    xAxisLabel: 'Category',
    yAxisLabel: 'Value',
    pictorialSymbol: 'roundRect',
    pictorialRepeat: false,
    toolbox: false,
  };
  get config(): any {
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
    this.chartOption = buildPictorialBarChartOption(this.data, this.config);
  }
  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }
  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
