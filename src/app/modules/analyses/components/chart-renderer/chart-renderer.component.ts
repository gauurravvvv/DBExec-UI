import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartRendererComponent {
  @Input() visual!: Visual;
  @Input() chartWidth!: number;
  @Input() chartHeight!: number;

  isCardChartType = isCardChartType;

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
