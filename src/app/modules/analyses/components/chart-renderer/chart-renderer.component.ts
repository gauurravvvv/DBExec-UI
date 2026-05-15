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
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-chart-renderer',
  templateUrl: './chart-renderer.component.html',
  // No styleUrls — see visuals-chart-sidebar for context. The chart
  // wrappers (`.visual-card`, `.maximized-visual-body`) live in the
  // parent template and are styled there.
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
    return getDummyData(visual?.chartType ?? '');
  }
}
