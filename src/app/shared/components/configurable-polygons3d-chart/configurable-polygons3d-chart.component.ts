import * as echarts from 'echarts';
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
import { buildPolygons3DChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-polygons3d-chart',
  templateUrl: './configurable-polygons3d-chart.component.html',
  styleUrls: ['./configurable-polygons3d-chart.component.scss'],
})
export class ConfigurablePolygons3dChartComponent
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
  mapReady: boolean = false;

  private readonly MAP_KEY = 'polygons3d_world';
  private readonly WORLD_MAP_URL = '/assets/maps/world.json';

  private defaultConfig: any = {
    animations: true,
    tooltipDisabled: false,
    colorScheme: 'default',
    autoRotate: true,
    polygons3DBorderWidth: 1,
    polygons3DBorderColor: '#ffffff',
    polygons3DOpacity: 0.85,
    showDataLabel: false,
  };

  get config(): any {
    return this.chartConfig || this.defaultConfig;
  }

  ngOnInit(): void {
    this.loadMapAndRender();
    this.previousConfigSnapshot = JSON.stringify(this.config);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['data'] ||
      changes['chartConfig'] ||
      changes['chartWidth'] ||
      changes['chartHeight']
    ) {
      if (!this.mapReady) {
        this.loadMapAndRender();
      } else {
        this.updateChartOption();
      }
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

  private loadMapAndRender(): void {
    fetch(this.WORLD_MAP_URL)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(geoJson => {
        echarts.registerMap(this.MAP_KEY, geoJson);
        this.mapReady = true;
        this.updateChartOption();
      })
      .catch(() => {
        // Map failed to load — render without backdrop (polygons may not show)
        this.mapReady = true;
        this.updateChartOption();
      });
  }

  updateChartOption(): void {
    this.chartOption = buildPolygons3DChartOption(this.data || [], this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
