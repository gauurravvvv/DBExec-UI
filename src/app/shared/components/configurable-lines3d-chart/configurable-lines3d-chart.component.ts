import { ChangeDetectionStrategy, Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  DoCheck,
  SimpleChanges, } from '@angular/core';
import { buildLines3DChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-lines3d-chart',
  templateUrl: './configurable-lines3d-chart.component.html',
  styleUrls: ['./configurable-lines3d-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurableLines3dChartComponent
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
    autoRotate: true,
    lines3DEffect: true,
    lines3DEffectPeriod: 4,
    lines3DTrailWidth: 4,
    lines3DTrailLength: 0.2,
    lines3DLineWidth: 1,
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
    this.chartOption = buildLines3DChartOption(this.data || [], this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
