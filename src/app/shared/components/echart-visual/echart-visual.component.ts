import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { requiresGl } from '../../../modules/analyses/constants/charts.constants';
import { buildChartOption } from '../../helpers/echarts-option-builder';
import { loadEchartsGl } from '../../modules/shared-charts.module';

@Component({
  selector: 'app-echart-visual',
  templateUrl: './echart-visual.component.html',
  styleUrls: ['./echart-visual.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EchartVisualComponent
  implements OnInit, OnChanges, OnDestroy, DoCheck
{
  @Input() data: any = [];
  @Input() chartType = '';
  @Input() chartConfig: any;
  @Input() chartWidth: number | undefined;
  @Input() chartHeight: number | undefined;

  @Output() chartSelect = new EventEmitter<any>();

  chartOption: any = {};
  /**
   * Bumped each time we want ngx-echarts to merge-patch the chart
   * (incremental setOption(option, false)) instead of replacing it.
   * Bound to the directive's [merge] input. Cheaper than a full
   * replace for config-only tweaks (toggle legend, change axis
   * format, etc.) because ECharts diffs and updates only changed
   * subsystems instead of rebuilding the entire series state.
   */
  mergeOption: any = null;
  echartsInstance: any = null;
  /**
   * Render gate. Stays false until we've confirmed echarts-gl is
   * loaded for chart types that need it. Stops the chart from
   * rendering with missing GL series classes (which would throw).
   */
  glReady = true;

  /**
   * Init options passed to `echarts.init`. `useDirtyRect: true` switches the
   * canvas renderer to partial-repaint mode — only the bounding box of
   * changed graphic elements is redrawn each frame. Net win for dashboards
   * where most of the chart is static between renders (tooltips moving
   * over a heatmap, filter dropdown changes, etc.).
   *
   * Reference: https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/
   */
  initOpts = {
    renderer: 'canvas' as const,
    useDirtyRect: true,
  };

  private previousConfigSnapshot = '';
  private hasRenderedOnce = false;
  // Track component counts across renders so updateChartOption can detect a
  // structural shrink (dataZoom removed, series count dropped) that merge-mode
  // setOption can't express, and fall back to a full replace for that update.
  private prevZoomCount = 0;
  private prevSeriesCount = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.ensureGlLoaded();
    this.updateChartOption();
    this.previousConfigSnapshot = JSON.stringify(this.chartConfig);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartType']) {
      this.ensureGlLoaded();
    }
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

  /**
   * Dispose the ECharts instance to free its canvas + JS state.
   * ECharts holds onto a backing canvas and (for GL types) a WebGL
   * context; without explicit dispose, removing a visual from the
   * DOM leaks the renderer until GC eventually catches up. With many
   * cards on a canvas the leak compounds and FPS / memory degrade.
   */
  ngOnDestroy(): void {
    if (
      this.echartsInstance &&
      typeof this.echartsInstance.dispose === 'function'
    ) {
      this.echartsInstance.dispose();
      this.echartsInstance = null;
    }
  }

  /**
   * If the active chart type needs echarts-gl and it hasn't loaded
   * yet, gate rendering until the dynamic import resolves. For non-
   * GL charts this is a no-op.
   */
  private ensureGlLoaded(): void {
    if (!requiresGl(this.chartType)) {
      this.glReady = true;
      return;
    }
    this.glReady = false;
    loadEchartsGl().then(() => {
      this.glReady = true;
      this.cdr.markForCheck();
    });
  }

  private updateChartOption(): void {
    const opt = buildChartOption(
      this.data,
      this.chartConfig || {},
      this.chartType,
    );

    // Detect a structural shrink that merge-mode setOption can't express.
    // ngx-echarts [merge] calls setOption(opt, { notMerge: false }); under
    // merge, passing `dataZoom: []` does NOT remove an existing slider —
    // ECharts keeps the prior component. The same is true for series count
    // dropping (e.g. a stacked chart losing a series). When we detect the
    // dataZoom component going from present to empty, or the series count
    // decreasing, fall back to a full [options] replace so the removed
    // components actually disappear. Pure config tweaks (the common case)
    // still take the cheap merge path.
    const zoomCount = Array.isArray(opt.dataZoom) ? opt.dataZoom.length : 0;
    const seriesCount = Array.isArray(opt.series) ? opt.series.length : 0;
    const structuralShrink =
      (this.prevZoomCount > 0 && zoomCount === 0) ||
      seriesCount < this.prevSeriesCount;
    this.prevZoomCount = zoomCount;
    this.prevSeriesCount = seriesCount;

    if (!this.hasRenderedOnce || structuralShrink) {
      // First render OR structural shrink: hand the full option to the
      // directive's [options] binding so ECharts rebuilds state and drops
      // any components no longer present.
      this.chartOption = opt;
      this.hasRenderedOnce = true;
    } else {
      // Subsequent updates: feed through [merge] so ECharts applies an
      // incremental setOption(opt, false). Cheaper than the full
      // replace [options] triggers — series instances and animation
      // contexts are reused where possible.
      this.mergeOption = opt;
    }
  }

  onChartInit(ec: any): void {
    this.echartsInstance = ec;
  }

  onChartClick(event: any): void {
    this.chartSelect.emit(event);
  }
}
