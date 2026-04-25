import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  getDummyData,
  hasAxisLabels,
  is3DCoordinateChartType,
  isAreaChartType,
  isBar3dChartType,
  isBarChartType,
  isBoxChartType,
  isBubbleChartType,
  isCandlestickChartType,
  isCardChartType,
  isFlowGlChartType,
  isFlowLinesChartType,
  isFunnelChartType,
  isGaugeChartType,
  isGlobeChartType,
  isGraphChartType,
  isGraphGlChartType,
  isHeatMapChartType,
  isLine3dChartType,
  isLineChartType,
  isLines3dChartType,
  isLinesGlChartType,
  isMap3dChartType,
  isParallelChartType,
  isPictorialBarChartType,
  isPieChartType,
  isPolarBarChartType,
  isPolarChartType,
  isPolygons3dChartType,
  isRadarChartType,
  isSankeyChartType,
  isScatter3dChartType,
  isScatterChartType,
  isScatterGlChartType,
  isSunburstChartType,
  isSurfaceChartType,
  isThemeRiverChartType,
  isTreeChartType,
  isTreeMapChartType,
  isWaterfallChartType,
  isWorldMapChartType,
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

  // Expose chart type checkers to template
  isBarChartType = isBarChartType;
  isLineChartType = isLineChartType;
  isAreaChartType = isAreaChartType;
  isPolarChartType = isPolarChartType;
  isPieChartType = isPieChartType;
  isGaugeChartType = isGaugeChartType;
  isCardChartType = isCardChartType;
  isHeatMapChartType = isHeatMapChartType;
  isTreeMapChartType = isTreeMapChartType;
  isBubbleChartType = isBubbleChartType;
  isBoxChartType = isBoxChartType;
  isScatterChartType = isScatterChartType;
  isFunnelChartType = isFunnelChartType;
  isSunburstChartType = isSunburstChartType;
  isSankeyChartType = isSankeyChartType;
  isWaterfallChartType = isWaterfallChartType;
  isGraphChartType = isGraphChartType;
  isTreeChartType = isTreeChartType;
  isThemeRiverChartType = isThemeRiverChartType;
  isPictorialBarChartType = isPictorialBarChartType;
  isPolarBarChartType = isPolarBarChartType;
  isRadarChartType = isRadarChartType;
  isCandlestickChartType = isCandlestickChartType;
  isParallelChartType = isParallelChartType;
  isBar3dChartType = isBar3dChartType;
  isLine3dChartType = isLine3dChartType;
  isScatter3dChartType = isScatter3dChartType;
  isSurfaceChartType = isSurfaceChartType;
  isGlobeChartType = isGlobeChartType;
  isGraphGlChartType = isGraphGlChartType;
  isScatterGlChartType = isScatterGlChartType;
  isLinesGlChartType = isLinesGlChartType;
  isMap3dChartType = isMap3dChartType;
  isFlowGlChartType = isFlowGlChartType;
  isWorldMapChartType = isWorldMapChartType;
  isFlowLinesChartType = isFlowLinesChartType;
  isLines3dChartType = isLines3dChartType;
  isPolygons3dChartType = isPolygons3dChartType;
  hasAxisLabels = hasAxisLabels;
  is3DCoordinateChartType = is3DCoordinateChartType;

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
