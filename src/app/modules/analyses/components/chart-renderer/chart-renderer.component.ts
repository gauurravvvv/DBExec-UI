import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import {
  getDummyData,
  hasAxisLabels,
  is3DCoordinateChartType,
  isCardChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  isSankeyChartType,
  isTableChartType,
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-chart-renderer',
  templateUrl: './chart-renderer.component.html',
  // styleUrls is REQUIRED: the host element defaults to display:
  // inline (zero height) without it, so the downstream
  // <app-echart-visual> computes height: 100% against zero and the
  // chart visually collapses. The wrapper styles (.visual-card,
  // .maximized-visual-body) still live in the parent template, but
  // the chart-renderer host itself must be a flex item that fills
  // its parent slot — see the .scss for details.
  styleUrls: ['./chart-renderer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartRendererComponent implements OnChanges {
  @Input() visual!: Visual;
  @Input() chartWidth!: number;
  @Input() chartHeight!: number;
  /**
   * Monotonic counter the parent bumps whenever `visual.config` is mutated
   * in place. Bumping it triggers an @Input change here, and we rebuild
   * `chartConfigRef` as a fresh shallow clone so the downstream OnPush
   * `<app-echart-visual>` actually sees a [chartConfig] reference change
   * — without that clone, OnPush blocks CD at echart-visual and the chart
   * never re-renders when sidebar properties change.
   */
  @Input() configVersion = 0;

  /** Shallow clone of `visual.config` rebuilt on every configVersion bump. */
  chartConfigRef: any = {};

  isCardChartType = isCardChartType;
  isTableChartType = isTableChartType;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visual'] || changes['configVersion']) {
      this.chartConfigRef = { ...(this.visual?.config ?? {}) };
    }
  }

  isGlobeSpecialType(chartType: string): boolean {
    return isLines3dChartType(chartType) || isPolygons3dChartType(chartType);
  }

  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    if (isLines3dChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn);
    }
    if (!hasAxisLabels(visual.chartType)) {
      return !!(visual.xAxisColumn || visual.yAxisColumn);
    }
    if (
      isHeatMapChartType(visual.chartType) ||
      isSankeyChartType(visual.chartType) ||
      isGraphChartType(visual.chartType)
    ) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  getDisplayData(visual: Visual): any {
    if (visual?.chartData?.length) {
      return visual.chartData;
    }
    // Tables never show dummy/sample rows — render the real (possibly
    // empty) dataset so the user sees the actual state of their data.
    if (isTableChartType(visual?.chartType ?? '')) {
      return [];
    }
    return getDummyData(visual?.chartType ?? '');
  }
}
