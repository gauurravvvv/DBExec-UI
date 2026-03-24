import { Component, Input, Output, EventEmitter } from '@angular/core';
import {
  COLOR_SCHEMES,
  LEGEND_POSITIONS,
  LEGEND_TYPES,
  LABEL_POSITIONS,
  TOOLTIP_TRIGGERS,
  AXIS_POINTER_TYPES,
  GRID_LINE_STYLES,
  EMPHASIS_MODES,
  ANIMATION_EASINGS,
  LINE_STEP_OPTIONS,
  LINE_STYLE_TYPES,
  SYMBOL_SHAPES,
  PIE_LABEL_POSITIONS,
  PIE_SELECTED_MODES,
  PIE_ROSE_TYPES,
  FUNNEL_SORT_OPTIONS,
  FUNNEL_ALIGN_OPTIONS,
  RADAR_SHAPES,
  GRAPH_LAYOUTS,
  TREE_ORIENTATIONS,
  TREE_LAYOUTS,
  SANKEY_ORIENTATIONS,
  PICTORIAL_SYMBOLS,
  TREE_EDGE_SHAPES,
  GRAPH_EDGE_SYMBOLS,
  TREEMAP_NODE_CLICK_OPTIONS,
  SUNBURST_NODE_CLICK_OPTIONS,
  BOXPLOT_LAYOUTS,
  PICTORIAL_SYMBOL_POSITIONS,
  EFFECT_SHOW_ON_OPTIONS,
  SANKEY_NODE_ALIGNS,
  SAMPLING_OPTIONS,
  SHOW_ALL_SYMBOL_OPTIONS,
  STACK_STRATEGY_OPTIONS,
  RIPPLE_BRUSH_TYPE_OPTIONS,
  FUNNEL_ORIENT_OPTIONS,
  SUNBURST_SORT_OPTIONS,
  PICTORIAL_REPEAT_DIRECTION_OPTIONS,
  hasAxisLabels,
  isBarChartType,
  isLineChartType,
  isAreaChartType,
  isPieChartType,
  isGaugeChartType,
  isCardChartType,
  isHeatMapChartType,
  isTreeMapChartType,
  isBubbleChartType,
  isBoxChartType,
  isPolarChartType,
  isScatterChartType,
  isFunnelChartType,
  isSankeyChartType,
  isSunburstChartType,
  isWaterfallChartType,
  isGraphChartType,
  isTreeChartType,
  isThemeRiverChartType,
  isPictorialBarChartType,
  isPolarBarChartType,
  isRadarChartType,
  isCandlestickChartType,
  isParallelChartType,
  isBar3dChartType,
  isLine3dChartType,
  isScatter3dChartType,
  isSurfaceChartType,
  isGlobeChartType,
  isGraphGlChartType,
  isScatterGlChartType,
  isLinesGlChartType,
  isMap3dChartType,
  isFlowGlChartType,
  supportsGradient,
  supportsDataLabel,
  supportsLegend,
  supportsEmphasis,
  supportsToolbox,
  supportsTooltip,
  supportsAnimation,
  supportsDataZoom,
} from '../../constants/charts.constants';

@Component({
  selector: 'app-chart-config-sidebar',
  templateUrl: './chart-config-sidebar.component.html',
  styleUrls: ['./chart-config-sidebar.component.scss'],
})
export class ChartConfigSidebarComponent {
  @Input() visual: any;
  @Input() isOpen: boolean = false;

  @Output() close = new EventEmitter<void>();

  // Expose all constants as component properties for template access
  colorSchemes = COLOR_SCHEMES;
  legendPositions = LEGEND_POSITIONS;
  legendTypes = LEGEND_TYPES;
  labelPositions = LABEL_POSITIONS;
  tooltipTriggers = TOOLTIP_TRIGGERS;
  axisPointerTypes = AXIS_POINTER_TYPES;
  gridLineStyles = GRID_LINE_STYLES;
  emphasisModes = EMPHASIS_MODES;
  animationEasings = ANIMATION_EASINGS;
  lineStepOptions = LINE_STEP_OPTIONS;
  lineStyleTypes = LINE_STYLE_TYPES;
  symbolShapes = SYMBOL_SHAPES;
  pieLabelPositions = PIE_LABEL_POSITIONS;
  pieSelectedModes = PIE_SELECTED_MODES;
  pieRoseTypes = PIE_ROSE_TYPES;
  funnelSortOptions = FUNNEL_SORT_OPTIONS;
  funnelAlignOptions = FUNNEL_ALIGN_OPTIONS;
  radarShapes = RADAR_SHAPES;
  graphLayouts = GRAPH_LAYOUTS;
  treeOrientations = TREE_ORIENTATIONS;
  treeLayouts = TREE_LAYOUTS;
  sankeyOrientations = SANKEY_ORIENTATIONS;
  pictorialSymbols = PICTORIAL_SYMBOLS;
  treeEdgeShapes = TREE_EDGE_SHAPES;
  graphEdgeSymbols = GRAPH_EDGE_SYMBOLS;
  treemapNodeClickOptions = TREEMAP_NODE_CLICK_OPTIONS;
  sunburstNodeClickOptions = SUNBURST_NODE_CLICK_OPTIONS;
  boxplotLayouts = BOXPLOT_LAYOUTS;
  pictorialSymbolPositions = PICTORIAL_SYMBOL_POSITIONS;
  effectShowOnOptions = EFFECT_SHOW_ON_OPTIONS;
  sankeyNodeAligns = SANKEY_NODE_ALIGNS;
  samplingOptions = SAMPLING_OPTIONS;
  showAllSymbolOptions = SHOW_ALL_SYMBOL_OPTIONS;
  stackStrategyOptions = STACK_STRATEGY_OPTIONS;
  rippleBrushTypeOptions = RIPPLE_BRUSH_TYPE_OPTIONS;
  funnelOrientOptions = FUNNEL_ORIENT_OPTIONS;
  sunburstSortOptions = SUNBURST_SORT_OPTIONS;
  pictorialRepeatDirectionOptions = PICTORIAL_REPEAT_DIRECTION_OPTIONS;

  // Expose chart-type-checking functions as methods
  hasAxisLabels = hasAxisLabels;
  isBarChartType = isBarChartType;
  isLineChartType = isLineChartType;
  isAreaChartType = isAreaChartType;
  isPieChartType = isPieChartType;
  isGaugeChartType = isGaugeChartType;
  isCardChartType = isCardChartType;
  isHeatMapChartType = isHeatMapChartType;
  isTreeMapChartType = isTreeMapChartType;
  isBubbleChartType = isBubbleChartType;
  isBoxChartType = isBoxChartType;
  isPolarChartType = isPolarChartType;
  isScatterChartType = isScatterChartType;
  isFunnelChartType = isFunnelChartType;
  isSankeyChartType = isSankeyChartType;
  isSunburstChartType = isSunburstChartType;
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
  supportsGradient = supportsGradient;
  supportsDataLabel = supportsDataLabel;
  supportsLegend = supportsLegend;
  supportsEmphasis = supportsEmphasis;
  supportsToolbox = supportsToolbox;
  supportsTooltip = supportsTooltip;
  supportsAnimation = supportsAnimation;
  supportsDataZoom = supportsDataZoom;

  closeConfigSidebar(): void {
    this.close.emit();
  }
}
