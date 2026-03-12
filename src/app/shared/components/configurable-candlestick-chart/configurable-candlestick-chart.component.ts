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
import { buildCandlestickChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-candlestick-chart',
  templateUrl: './configurable-candlestick-chart.component.html',
  styleUrls: ['./configurable-candlestick-chart.component.scss'],
})
export class ConfigurableCandlestickChartComponent implements OnInit, OnChanges, DoCheck {
  private previousConfigSnapshot: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;
  @Input() chartType: string = 'candlestick';

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: any = {
    gradient: false,
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'vivid',
    xAxis: true,
    yAxis: true,
    showGridLines: true,
  };

  get config(): any {
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
    this.chartOption = buildCandlestickChartOption(this.data, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
