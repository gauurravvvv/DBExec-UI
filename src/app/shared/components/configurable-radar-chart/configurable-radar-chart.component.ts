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
import { buildRadarChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-radar-chart',
  templateUrl: './configurable-radar-chart.component.html',
  styleUrls: ['./configurable-radar-chart.component.scss'],
})
export class ConfigurableRadarChartComponent implements OnInit, OnChanges, DoCheck {
  private previousConfigSnapshot: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;
  @Input() chartType: string = 'radar';

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: any = {
    gradient: false,
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'default',
    legend: true,
    legendPosition: 'right',
    radarShape: 'polygon',
    radarAreaOpacity: 0.3,
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
    this.chartOption = buildRadarChartOption(this.data, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
