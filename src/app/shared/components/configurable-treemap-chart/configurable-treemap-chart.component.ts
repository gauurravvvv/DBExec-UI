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
import { buildTreeMapChartOption } from '../../helpers/echarts-option-builder';

export interface TreeMapData {
  name: string;
  value: number;
}

export interface TreeMapConfig {
  // Styling
  gradient: boolean;
  animations: boolean;
  // Tooltip
  tooltipDisabled: boolean;
  // Color
  colorScheme: string;
}

@Component({
  selector: 'app-configurable-treemap-chart',
  templateUrl: './configurable-treemap-chart.component.html',
  styleUrls: ['./configurable-treemap-chart.component.scss'],
})
export class ConfigurableTreemapChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';

  @Input() data: TreeMapData[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: TreeMapConfig | undefined;

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;

  private defaultConfig: TreeMapConfig = {
    gradient: false,
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'default',
  };

  get config(): TreeMapConfig {
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
    this.chartOption = buildTreeMapChartOption(this.data, this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
