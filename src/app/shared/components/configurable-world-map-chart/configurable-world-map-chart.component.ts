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
import { buildWorldMapChartOption } from '../../helpers/echarts-option-builder';

@Component({
  selector: 'app-configurable-world-map-chart',
  templateUrl: './configurable-world-map-chart.component.html',
  styleUrls: ['./configurable-world-map-chart.component.scss'],
})
export class ConfigurableWorldMapChartComponent
  implements OnInit, OnChanges, DoCheck
{
  private previousConfigSnapshot: string = '';
  private loadedMapUrl: string = '';

  @Input() data: any[] = [];
  @Input() showConfigPanel: boolean = true;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;
  @Input() chartConfig: any | undefined;

  @Output() onSelect = new EventEmitter<any>();

  chartOption: any = {};
  echartsInstance: any = null;
  mapReady: boolean = false;
  mapLoading: boolean = false;
  mapError: boolean = false;
  mapErrorMessage: string = '';

  private readonly WORLD_MAP_URL = '/assets/maps/world.json';

  private defaultConfig: any = {
    colorScheme: 'default',
    animations: true,
    tooltipDisabled: false,
    worldMapRoam: true,
    worldMapShowLabels: false,
    worldMapVisualMapMin: null,
    worldMapVisualMapMax: null,
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
    const url = this.WORLD_MAP_URL;

    this.mapLoading = true;
    this.mapReady = false;
    this.mapError = false;

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(geoJson => {
        echarts.registerMap('world', geoJson);
        this.loadedMapUrl = url;
        this.mapLoading = false;
        this.mapReady = true;
        this.updateChartOption();
      })
      .catch(err => {
        this.mapLoading = false;
        this.mapError = true;
        this.mapErrorMessage = `Could not load map data from "${url}". Add a GeoJSON world map file to your assets.`;
      });
  }

  updateChartOption(): void {
    if (!this.mapReady) return;
    this.chartOption = buildWorldMapChartOption(this.data || [], this.config);
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartSelect(event: any): void {
    this.onSelect.emit(event);
  }
}
