import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges,
} from '@angular/core';
import { buildGraphGLChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-graphgl-chart',
  templateUrl: './configurable-graphgl-chart.component.html',
  styleUrls: ['./configurable-graphgl-chart.component.scss'],
})
export class ConfigurableGraphGlChartComponent implements OnInit, OnChanges, DoCheck {
  private previousConfigSnapshot: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;
  @Input() chartType: string = 'graphgl';

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: any = {
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'default',
    legend: true,
    graphGravity: 0.1,
  };

  get config(): any {
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
    this.chartOption = buildGraphGLChartOption(this.data, [], this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
