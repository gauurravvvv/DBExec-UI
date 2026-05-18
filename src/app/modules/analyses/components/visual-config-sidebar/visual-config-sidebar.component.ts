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
  isTableChartType,
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
  // styleUrls is REQUIRED. The previous decomposition commit assumed
  // the parent edit-analyses could style the inner .config-sidebar
  // markup, but Angular view-encapsulation scopes parent CSS to the
  // parent template only — child markup is unstyled. The child must
  // own its own visual chrome.
  styleUrls: ['./visual-config-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualConfigSidebarComponent implements DoCheck {
  @Input() focusedVisual!: Visual;
  /**
   * All dataset + analysis fields for the current analysis. Used by the
   * Table visual's column picker so the user can choose which fields
   * to display even before any data has flowed through (chartData would
   * otherwise be empty on first paint).
   */
  @Input() allFields: any[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() configChanged = new EventEmitter<void>();

  /**
   * Available column names for the Table visual's column-visibility
   * picker. Sources, in priority order:
   *   1. The analysis's allFields list — present from the moment the
   *      sidebar opens, so the picker shows up immediately.
   *   2. Keys of the first chartData row — fallback for the case where
   *      allFields isn't populated (e.g. an isolated render path).
   * Returns [] only when neither source has any fields.
   */
  get tableAvailableColumns(): string[] {
    if (!this.focusedVisual) return [];
    if (Array.isArray(this.allFields) && this.allFields.length > 0) {
      // Prefer columnToUse (the actual row key) — falling back to
      // columnToView and finally the raw value for malformed entries.
      const cols = this.allFields
        .map((f: any) => f?.columnToUse ?? f?.columnToView ?? f)
        .filter((v: any) => typeof v === 'string' && v.length > 0);
      if (cols.length > 0) return cols as string[];
    }
    const rows = this.focusedVisual.chartData;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const first = rows[0];
    if (!first || typeof first !== 'object') return [];
    return Object.keys(first);
  }

  /**
   * Look up a friendly display label for a column key from allFields.
   * Falls back to the humanised raw key when the field isn't found.
   */
  tableColumnLabel(col: string): string {
    const match = this.allFields?.find(
      (f: any) => f?.columnToUse === col || f?.columnToView === col,
    );
    return match?.columnToView || this.humaniseFieldName(col);
  }

  /**
   * Whether a given column is currently visible (not in the hidden
   * list). Used by the Properties sidebar's per-column toggle.
   */
  isTableColumnVisible(col: string): boolean {
    const hidden = this.focusedVisual?.config?.tableHiddenColumns;
    if (!Array.isArray(hidden)) return true;
    return !hidden.includes(col);
  }

  /**
   * Toggle a single column's visibility. Stores the hidden list on
   * the visual config so the change persists with the analysis.
   * Re-assigns the array reference so OnPush downstream picks it up.
   */
  setTableColumnVisible(col: string, visible: boolean): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const hidden: string[] = Array.isArray(cfg.tableHiddenColumns)
      ? [...cfg.tableHiddenColumns]
      : [];
    const idx = hidden.indexOf(col);
    if (visible && idx >= 0) {
      hidden.splice(idx, 1);
    } else if (!visible && idx < 0) {
      hidden.push(col);
    } else {
      return; // no change
    }
    cfg.tableHiddenColumns = hidden;
  }

  /** Format a raw field key as a humanised label for display. */
  humaniseFieldName(key: string): string {
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }

  /** trackBy for *ngFor over string arrays (column names). */
  trackByValue(_: number, value: string): string {
    return value;
  }

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
  isTableChartType = isTableChartType;
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
