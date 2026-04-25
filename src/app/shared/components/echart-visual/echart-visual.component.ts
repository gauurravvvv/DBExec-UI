import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { buildChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-echart-visual',
  templateUrl: './echart-visual.component.html',
  styleUrls: ['./echart-visual.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EchartVisualComponent implements OnInit, OnChanges, DoCheck {
  @Input() data: any = [];
  @Input() chartType = '';
  @Input() chartConfig: any;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  @Output() chartSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private previousConfigSnapshot = '';

  ngOnInit(): void {
    this.updateChartOption();
    this.previousConfigSnapshot = JSON.stringify(this.chartConfig);
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
      this.previousConfigSnapshot = JSON.stringify(this.chartConfig);
    }
  }

  ngDoCheck(): void {
    const snapshot = JSON.stringify(this.chartConfig);
    if (snapshot !== this.previousConfigSnapshot) {
      this.previousConfigSnapshot = snapshot;
      this.updateChartOption();
    }
  }

  private updateChartOption(): void {
    this.chartOption = buildChartOption(
      this.data,
      this.chartConfig || {},
      this.chartType,
    );
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartClick(event: any): void {
    this.chartSelect.emit(event);
  }
}
