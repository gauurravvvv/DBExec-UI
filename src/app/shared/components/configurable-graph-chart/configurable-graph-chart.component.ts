import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges, DoCheck, SimpleChanges,
} from '@angular/core';
import { COLOR_PALETTES } from '../../helpers/chart-config.helper';
import { buildGraphChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-graph-chart',
  templateUrl: './configurable-graph-chart.component.html',
  styleUrls: ['./configurable-graph-chart.component.scss'],
})
export class ConfigurableGraphChartComponent implements OnInit, OnChanges, DoCheck {
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
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'vivid',
    labels: true,
    graphLayout: 'force',
    graphRepulsion: 200,
    graphEdgeLength: 100,
    toolbox: false,
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
    const graphData = this.data || { nodes: [], links: [] };
    const nodes = graphData.nodes || [];
    const links = graphData.links || [];
    this.chartOption = buildGraphChartOption(nodes, links, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
