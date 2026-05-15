import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  NgZone,
  Output,
} from '@angular/core';
import {
  ANIMATION_EASINGS,
  AXIS_POINTER_TYPES,
  BOXPLOT_LAYOUTS,
  COLOR_SCHEMES,
  EFFECT_SHOW_ON_OPTIONS,
  EMPHASIS_MODES,
  FUNNEL_ALIGN_OPTIONS,
  FUNNEL_ORIENT_OPTIONS,
  FUNNEL_SORT_OPTIONS,
  GRAPH_EDGE_SYMBOLS,
  GRAPH_LAYOUTS,
  GRID_LINE_STYLES,
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
  LABEL_POSITIONS,
  LEGEND_POSITIONS,
  LEGEND_TYPES,
  LINE_STEP_OPTIONS,
  LINE_STYLE_TYPES,
  PICTORIAL_REPEAT_DIRECTION_OPTIONS,
  PICTORIAL_SYMBOLS,
  PICTORIAL_SYMBOL_POSITIONS,
  PIE_LABEL_POSITIONS,
  PIE_ROSE_TYPES,
  PIE_SELECTED_MODES,
  RADAR_SHAPES,
  RIPPLE_BRUSH_TYPE_OPTIONS,
  SAMPLING_OPTIONS,
  SANKEY_NODE_ALIGNS,
  SANKEY_ORIENTATIONS,
  SHOW_ALL_SYMBOL_OPTIONS,
  STACK_STRATEGY_OPTIONS,
  SUNBURST_NODE_CLICK_OPTIONS,
  SUNBURST_SORT_OPTIONS,
  supportsAnimation,
  supportsDataLabel,
  supportsDataZoom,
  supportsEmphasis,
  supportsGradient,
  supportsLegend,
  supportsToolbox,
  supportsTooltip,
  SYMBOL_SHAPES,
  TOOLTIP_TRIGGERS,
  TREEMAP_NODE_CLICK_OPTIONS,
  TREE_EDGE_SHAPES,
  TREE_LAYOUTS,
  TREE_ORIENTATIONS,
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-visual-config-sidebar',
  templateUrl: './visual-config-sidebar.component.html',
  // No styleUrls — see visuals-chart-sidebar for context. Parent
  // edit-analyses owns the styling and skipping the stylesheet here
  // keeps the child encapsulation-free so parent selectors match.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualConfigSidebarComponent implements DoCheck {
  @Input() focusedVisual!: Visual;
  @Output() close = new EventEmitter<void>();
  @Output() configChanged = new EventEmitter<void>();

  /**
   * JSON snapshot of focusedVisual + config used to detect ANY mutation —
   * including the synthetic events PrimeNG widgets fire (slider drags,
   * dropdowns, toggle buttons) that don't bubble as DOM `change` events.
   *
   * The previous `(change)="configChanged.emit()"` listener at the template
   * root only caught native DOM change events — checkboxes and native selects
   * worked, but PrimeNG sliders / inputNumber / dropdown / colorPicker /
   * toggleButton mutated state silently. Result: many property tweaks didn't
   * propagate to the chart. ngDoCheck runs on every CD cycle the parent
   * triggers (typing, clicking, focus, etc.); diffing the JSON snapshot is
   * the same trick EchartVisual uses internally.
   */
  private configSnapshot = '';

  constructor(private ngZone: NgZone) {}

  ngDoCheck(): void {
    if (!this.focusedVisual) return;
    const snapshot = JSON.stringify({
      // Stringify the slice we actually care about. Including the field
      // assignments (xAxisColumn, etc.) catches axis remaps too.
      cfg: this.focusedVisual.config,
      x: this.focusedVisual.xAxisColumn,
      y: this.focusedVisual.yAxisColumn,
      z: this.focusedVisual.zAxisColumn,
      title: this.focusedVisual.title,
      chartType: this.focusedVisual.chartType,
    });
    if (snapshot !== this.configSnapshot) {
      // Skip the very first call — we don't want to fire configChanged just
      // because the component initialized.
      const isFirstCall = this.configSnapshot === '';
      this.configSnapshot = snapshot;
      if (!isFirstCall) {
        // Defer the emit to a microtask so the parent's `markDirty` (which
        // bumps `chartConfigVersion`) runs in a fresh CD pass. Emitting
        // synchronously here lands inside the current CD cycle; if the
        // chart-renderer was already visited by CD on this pass, the
        // bumped Input wouldn't be picked up until the NEXT user
        // interaction — which is why property tweaks were only applying
        // after a click somewhere else.
        this.ngZone.runOutsideAngular(() => {
          Promise.resolve().then(() =>
            this.ngZone.run(() => this.configChanged.emit()),
          );
        });
      }
    }
  }

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
