import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
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
  isAreaChartType,
  isBarChartType,
  isBar3dChartType,
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
  supportsGradient,
  supportsDataLabel,
  supportsLegend,
  supportsEmphasis,
  supportsToolbox,
  supportsTooltip,
  supportsAnimation,
  supportsDataZoom,
  is3DCoordinateChartType,
  hasAxisLabels,
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-visual-config-sidebar',
  templateUrl: './visual-config-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualConfigSidebarComponent {
  @Input() focusedVisual!: Visual;
  @Output() close = new EventEmitter<void>();
  @Output() configChanged = new EventEmitter<void>();

  // Chart type checkers
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

  // Feature support checkers
  supportsGradient = supportsGradient;
  supportsDataLabel = supportsDataLabel;
  supportsLegend = supportsLegend;
  supportsEmphasis = supportsEmphasis;
  supportsToolbox = supportsToolbox;
  supportsTooltip = supportsTooltip;
  supportsAnimation = supportsAnimation;
  supportsDataZoom = supportsDataZoom;

  // Dropdown options
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
}
