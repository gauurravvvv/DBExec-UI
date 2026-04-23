import { ChangeDetectionStrategy, Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  DoCheck,
  SimpleChanges, } from '@angular/core';
import { buildFlowLinesChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-flow-lines-chart',
  templateUrl: './configurable-flow-lines-chart.component.html',
  styleUrls: ['./configurable-flow-lines-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurableFlowLinesChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: any = { nodes: [], links: [] };
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: any = {
    colorScheme: 'default',
    animations: true,
    tooltipDisabled: false,
    flowLinesEffect: true,
    flowLinesCurveness: 0.3,
    flowLinesWidth: 1,
    flowLinesEffectSymbolSize: 4,
    flowLinesEffectPeriod: 4,
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
    const flowData = this.data || { nodes: [], links: [] };
    const nodes = flowData.nodes || [];
    const links = flowData.links || [];
    this.chartOption = buildFlowLinesChartOption(nodes, links, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
