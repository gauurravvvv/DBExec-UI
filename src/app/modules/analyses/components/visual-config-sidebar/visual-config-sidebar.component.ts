import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  ANIMATION_EASINGS,
  AREA_ORIGIN_OPTIONS,
  AXIS_POINTER_TYPES,
  BOXPLOT_LAYOUTS,
  COLOR_MAPPING_BY_OPTIONS,
  COLOR_SCHEMES,
  DATA_ZOOM_FILTER_MODE_OPTIONS,
  DATA_ZOOM_TYPE_OPTIONS,
  EFFECT_SHOW_ON_OPTIONS,
  EMPHASIS_FOCUS_OPTIONS,
  EMPHASIS_MODES,
  FUNNEL_ALIGN_OPTIONS,
  FUNNEL_LABEL_POSITION_OPTIONS,
  FUNNEL_ORIENT_OPTIONS,
  FUNNEL_SORT_OPTIONS,
  MAP_NAME_PROPERTY_HINTS,
  SHADING_MODE_OPTIONS,
  SUNBURST_LABEL_ROTATE_OPTIONS,
  THEME_RIVER_LABEL_POSITION_OPTIONS,
  VISUAL_MAP_ORIENT_OPTIONS,
  VISUAL_MAP_TYPE_OPTIONS,
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
  isComboChartType,
  isHistogramChartType,
  VISUAL_SORT_BY_OPTIONS,
  VISUAL_SORT_DIR_OPTIONS,
  VISUAL_LIMIT_MODE_OPTIONS,
  VISUAL_STACKING_OPTIONS,
  VISUAL_LABEL_CONTENT_OPTIONS,
  VISUAL_NULL_HANDLING_OPTIONS,
  VISUAL_AXIS_SCALE_OPTIONS,
  VISUAL_FORMAT_KIND_OPTIONS,
  VISUAL_FORMAT_TARGET_OPTIONS,
} from '../../constants/charts.constants';
import { Visual } from '../../models';
import type { AggregateFn, AggregationMeasure } from '../../models/visual.model';
import {
  ConditionalRule,
  ConditionalOperator,
  CONDITIONAL_OPERATOR_OPTIONS,
  operandCount,
} from 'src/app/shared/helpers/conditional-formatting.helper';
import {
  PivotAggregation,
  PIVOT_AGGREGATION_OPTIONS,
} from 'src/app/shared/helpers/pivot.helper';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';

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
export class VisualConfigSidebarComponent implements DoCheck, OnInit, OnDestroy {
  private _focusedVisual!: Visual;

  /**
   * The visual whose properties this sidebar edits.
   *
   * Setter normalizes display-critical config defaults the moment a
   * visual is focused. The chart builder already falls back to the
   * 'default' palette when `colorScheme` is unset, but the Color Scheme
   * dropdown binds to the raw value — an unset value rendered a blank
   * dropdown even though the chart drew with the default palette. Seeding
   * the value here keeps the control and the chart in agreement and
   * persists the explicit choice with the analysis.
   */
  @Input() set focusedVisual(value: Visual) {
    this._focusedVisual = value;
    if (value?.config && !value.config.colorScheme) {
      value.config.colorScheme = 'default';
    }
  }
  get focusedVisual(): Visual {
    return this._focusedVisual;
  }
  /**
   * All dataset + analysis fields for the current analysis. Used by the
   * Table visual's column picker so the user can choose which fields
   * to display even before any data has flowed through (chartData would
   * otherwise be empty on first paint).
   */
  @Input() allFields: any[] = [];
  /**
   * Sibling visuals on the same analysis (id + title), used by the
   * Interaction section's explicit cross-filter target multiselect.
   */
  @Input() siblingVisuals: { id: string; title: string }[] = [];
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

  /**
   * Dropdown option arrays hold i18n keys in their `label` (e.g.
   * `'CHART_OPTIONS.LINE_STEP.NONE'`). Resolving keys at the template
   * via `| translate` doesn't apply, because PrimeNG's `[optionLabel]`
   * reads the raw string from the data array. We instead materialise
   * a translated copy of every option array here at init and again
   * whenever the language changes, swapping the raw arrays out for
   * resolved ones. The template binds to the same fields so no markup
   * changes are needed.
   */
  private langSubscription?: Subscription;

  constructor(
    private ngZone: NgZone,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private referenceData: ReferenceDataService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // Data + Analytics + Interaction authoring (Dashboard & Analysis v2)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Aggregate function options for the Data section (Track D4) and the
   * combo extra-measure editor. Labels are i18n keys resolved in the
   * template via | translate on optionLabel through the localize pass
   * below (kept as raw keys; we translate inline in the getters).
   */
  // Aggregate function options are DB-driven (family: aggregate_fn). Seeded
  // with the i18n-keyed fallback so the dropdown renders immediately, then
  // overwritten with DB rows (label + order) once the reference-data service
  // resolves. The leading NONE (value '') is a UI-only "no aggregate" entry
  // that is NOT part of the DB family, so it's re-prepended after a DB load.
  aggregateOptions: { label: string; value: AggregateFn | '' }[] = [
    { label: 'ANALYSES.AGG.NONE', value: '' },
    { label: 'ANALYSES.AGG.SUM', value: 'sum' },
    { label: 'ANALYSES.AGG.AVG', value: 'avg' },
    { label: 'ANALYSES.AGG.COUNT', value: 'count' },
    { label: 'ANALYSES.AGG.MIN', value: 'min' },
    { label: 'ANALYSES.AGG.MAX', value: 'max' },
    { label: 'ANALYSES.AGG.COUNT_DISTINCT', value: 'count_distinct' },
    // Dialect-aware statistical aggregates (BE: median/percentile/stddev/variance).
    { label: 'ANALYSES.AGG.MEDIAN', value: 'median' },
    { label: 'ANALYSES.AGG.PERCENTILE', value: 'percentile' },
    { label: 'ANALYSES.AGG.STDDEV', value: 'stddev' },
    { label: 'ANALYSES.AGG.VARIANCE', value: 'variance' },
  ];

  /** Aggregate options WITHOUT the "none" entry — for combo extra measures. */
  comboAggregateOptions: { label: string; value: AggregateFn }[] = [
    { label: 'ANALYSES.AGG.SUM', value: 'sum' },
    { label: 'ANALYSES.AGG.AVG', value: 'avg' },
    { label: 'ANALYSES.AGG.COUNT', value: 'count' },
    { label: 'ANALYSES.AGG.MIN', value: 'min' },
    { label: 'ANALYSES.AGG.MAX', value: 'max' },
    { label: 'ANALYSES.AGG.COUNT_DISTINCT', value: 'count_distinct' },
    { label: 'ANALYSES.AGG.MEDIAN', value: 'median' },
    { label: 'ANALYSES.AGG.PERCENTILE', value: 'percentile' },
    { label: 'ANALYSES.AGG.STDDEV', value: 'stddev' },
    { label: 'ANALYSES.AGG.VARIANCE', value: 'variance' },
  ];

  /**
   * Trend types for the Analytics section (Track E1). Extended with
   * logarithmic + polynomial fits (Slice E). `trendTypeOptionsRaw` holds the
   * i18n keys; `trendTypeOptions` is the localized copy the template binds to
   * (swapped in localizeDropdownOptions + on language change).
   */
  readonly trendTypeOptionsRaw: { label: string; value: string }[] = [
    { label: 'ANALYSES.ANALYTICS.TREND_NONE', value: 'none' },
    { label: 'ANALYSES.ANALYTICS.TREND_LINEAR', value: 'linear' },
    { label: 'ANALYSES.ANALYTICS.TREND_LOG', value: 'log' },
    { label: 'ANALYSES.ANALYTICS.TREND_POLY', value: 'poly' },
    { label: 'ANALYSES.ANALYTICS.TREND_MOVING_AVG', value: 'movingAverage' },
    { label: 'ANALYSES.ANALYTICS.TREND_FORECAST', value: 'forecast' },
  ];
  trendTypeOptions: { label: string; value: string }[] = [];

  /** Per-series render types for the dual-axis editor. */
  readonly dualAxisSeriesTypeOptions: { label: string; value: string }[] = [
    { label: 'ANALYSES.ANALYTICS.SERIES_BAR', value: 'bar' },
    { label: 'ANALYSES.ANALYTICS.SERIES_LINE', value: 'line' },
  ];

  /** Left / right axis choices for the dual-axis editor. */
  readonly dualAxisSideOptions: { label: string; value: number }[] = [
    { label: 'ANALYSES.ANALYTICS.AXIS_LEFT', value: 0 },
    { label: 'ANALYSES.ANALYTICS.AXIS_RIGHT', value: 1 },
  ];

  /**
   * Quick-calc options (Slice B). Raw i18n keys; `quickCalcOptions` is the
   * localized copy bound by the template (swapped in localizeDropdownOptions
   * + on language change), same pattern as trendTypeOptions.
   */
  readonly quickCalcOptionsRaw: { label: string; value: string }[] = [
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_NONE', value: '' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_RUNNING_TOTAL', value: 'running_total' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_PERCENT_OF_TOTAL', value: 'percent_of_total' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_DIFFERENCE', value: 'difference' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_PERCENT_DIFFERENCE', value: 'percent_difference' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_MOVING_AVERAGE', value: 'moving_average' },
    { label: 'ANALYSES.ANALYTICS.QUICK_CALC_RANK', value: 'rank' },
  ];
  quickCalcOptions: { label: string; value: string }[] = [];

  /** Period-over-period compare modes (Slice B). */
  readonly compareModeOptionsRaw: { label: string; value: string }[] = [
    { label: 'ANALYSES.ANALYTICS.COMPARE_NONE', value: '' },
    { label: 'ANALYSES.ANALYTICS.COMPARE_PREVIOUS_PERIOD', value: 'previous_period' },
    { label: 'ANALYSES.ANALYTICS.COMPARE_SAME_PERIOD_LAST_YEAR', value: 'same_period_last_year' },
  ];
  compareModeOptions: { label: string; value: string }[] = [];

  /** Cross-filter target-mode choices for the Interaction section (E2). */
  readonly crossFilterTargetOptions: { label: string; value: string }[] = [
    { label: 'ANALYSES.INTERACTION.TARGET_SAME_TAB', value: 'same-tab' },
    { label: 'ANALYSES.INTERACTION.TARGET_DASHBOARD', value: 'dashboard' },
    { label: 'ANALYSES.INTERACTION.TARGET_SELECTED', value: 'visuals' },
  ];

  /** True for the cartesian families the analytics sections support. */
  supportsCartesianAnalytics(chartType: string | null | undefined): boolean {
    if (!chartType) return false;
    return /^(bar-|line|area|combo|histogram)/.test(chartType);
  }

  /**
   * True for the cartesian families the per-visual formatting controls
   * (sort / top-N / stacking / null / axis scale / format) apply to. Same
   * family as the analytics sections.
   */
  supportsPerVisualControls(chartType: string | null | undefined): boolean {
    return this.supportsCartesianAnalytics(chartType);
  }

  /** All fields as { label, value } for column dropdowns. */
  get allFieldOptions(): { label: string; value: string }[] {
    return (this.allFields || [])
      .map((f: any) => {
        const value = f?.columnToUse ?? f?.columnToView ?? f;
        if (typeof value !== 'string' || !value) return null;
        const label = f?.columnToView || this.humaniseFieldName(value);
        return { label, value };
      })
      .filter((o): o is { label: string; value: string } => o !== null);
  }

  /** Heuristic: does this field's dataType read as numeric (a measure)? */
  private isNumericFieldType(dataType: unknown): boolean {
    if (typeof dataType !== 'string') return false;
    const t = dataType.toLowerCase();
    return (
      t.includes('int') ||
      t.includes('numeric') ||
      t.includes('decimal') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('real') ||
      t.includes('serial') ||
      t.includes('money') ||
      t.includes('number')
    );
  }

  /**
   * Numeric-field options for the Measure dropdown. When no field carries
   * a recognisable numeric dataType (e.g. schema without type hints) we
   * fall back to all fields so the picker is never empty.
   */
  get measureFieldOptions(): { label: string; value: string }[] {
    const numeric = (this.allFields || []).filter((f: any) =>
      this.isNumericFieldType(f?.dataType),
    );
    const source = numeric.length > 0 ? numeric : this.allFields || [];
    return source
      .map((f: any) => {
        const value = f?.columnToUse ?? f?.columnToView ?? f;
        if (typeof value !== 'string' || !value) return null;
        const label = f?.columnToView || this.humaniseFieldName(value);
        return { label, value };
      })
      .filter((o): o is { label: string; value: string } => o !== null);
  }

  // ── Data section: aggregate binding (top-level visual fields) ────────

  /** Two-way bind for the Aggregate dropdown ('' → null on the model). */
  get aggregateValue(): AggregateFn | '' {
    return (this.focusedVisual?.aggregate as AggregateFn) ?? '';
  }
  set aggregateValue(v: AggregateFn | '') {
    if (!this.focusedVisual) return;
    this.focusedVisual.aggregate = v ? (v as AggregateFn) : null;
    // Leaving 'percentile' drops the now-irrelevant P so a later switch back
    // starts from the default rather than a stale value.
    if (v !== 'percentile' && this.focusedVisual.config) {
      delete this.focusedVisual.config.percentile;
    }
  }

  /** True when the primary aggregate is 'percentile' — reveals the P input. */
  get isPercentileAggregate(): boolean {
    return this.focusedVisual?.aggregate === 'percentile';
  }

  /**
   * Percentile rank P (0..100, default 90) for aggregate='percentile'. Bound
   * into the config blob so it rides on every payload the visual's `config`
   * already travels on (updateVisual whole-visual PUT, save/publish
   * visualConfigurations, duplicate) — the same route `aggregate` uses. The BE
   * run schema reads it off the aggregation object (percentile), resolved
   * server-side by the dialect-aware PERCENTILE_CONT aggregate.
   */
  get percentileValue(): number {
    const p = this.focusedVisual?.config?.percentile;
    return typeof p === 'number' && isFinite(p) ? p : 90;
  }
  set percentileValue(v: number) {
    if (!this.focusedVisual?.config) return;
    // Clamp defensively to the BE's open (0,100) interval; the numeric input's
    // min/max already constrain the UI but a raw model write could exceed it.
    const clamped = Math.min(99, Math.max(1, Math.round(Number(v) || 90)));
    this.focusedVisual.config.percentile = clamped;
  }

  // ── Data section: combo extra measures (config.aggregations[]) ───────

  get comboMeasures(): AggregationMeasure[] {
    const list = this.focusedVisual?.config?.aggregations;
    return Array.isArray(list) ? list : [];
  }

  addComboMeasure(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const list: AggregationMeasure[] = Array.isArray(cfg.aggregations)
      ? [...cfg.aggregations]
      : [];
    const n = list.length + 1;
    list.push({ column: '', aggregate: 'sum', alias: 'measure_' + n });
    cfg.aggregations = list;
  }

  updateComboMeasure(
    index: number,
    key: 'column' | 'aggregate' | 'alias',
    value: string,
  ): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.aggregations)) return;
    const list = cfg.aggregations.map((m: AggregationMeasure) => ({ ...m }));
    if (!list[index]) return;
    (list[index] as any)[key] = value;
    cfg.aggregations = list;
  }

  removeComboMeasure(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.aggregations)) return;
    const list = [...cfg.aggregations];
    list.splice(index, 1);
    cfg.aggregations = list;
  }

  trackByIndex(i: number): number {
    return i;
  }

  // ── Analytics section: dual-axis series editor (config.dualAxis) ─────

  get dualAxisEnabled(): boolean {
    return !!this.focusedVisual?.config?.dualAxis;
  }
  setDualAxisEnabled(on: boolean): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (on) {
      cfg.dualAxis = cfg.dualAxis && Array.isArray(cfg.dualAxis.series)
        ? { ...cfg.dualAxis }
        : { series: [], rightAxisName: '' };
    } else {
      delete cfg.dualAxis;
    }
  }

  get dualAxisSeries(): { name: string; type: string; yAxisIndex: number }[] {
    const list = this.focusedVisual?.config?.dualAxis?.series;
    return Array.isArray(list) ? list : [];
  }

  addDualAxisSeries(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (!cfg.dualAxis) cfg.dualAxis = { series: [], rightAxisName: '' };
    const series = Array.isArray(cfg.dualAxis.series)
      ? [...cfg.dualAxis.series]
      : [];
    series.push({ name: '', type: 'line', yAxisIndex: 1 });
    cfg.dualAxis = { ...cfg.dualAxis, series };
  }

  updateDualAxisSeries(
    index: number,
    key: 'name' | 'type' | 'yAxisIndex',
    value: string | number,
  ): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg?.dualAxis || !Array.isArray(cfg.dualAxis.series)) return;
    const series = cfg.dualAxis.series.map((x: any) => ({ ...x }));
    if (!series[index]) return;
    (series[index] as any)[key] = value;
    cfg.dualAxis = { ...cfg.dualAxis, series };
  }

  removeDualAxisSeries(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg?.dualAxis || !Array.isArray(cfg.dualAxis.series)) return;
    const series = [...cfg.dualAxis.series];
    series.splice(index, 1);
    cfg.dualAxis = { ...cfg.dualAxis, series };
  }

  // ── Analytics section: trend (config.trend) ─────────────────────────

  get trendType(): string {
    return this.focusedVisual?.config?.trend?.type ?? 'none';
  }
  setTrendType(type: string): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (!type || type === 'none') {
      delete cfg.trend;
      return;
    }
    const prev = cfg.trend || {};
    cfg.trend = {
      type,
      window: prev.window ?? 3,
      forecastPeriods: prev.forecastPeriods ?? 3,
    };
  }

  get trendWindow(): number {
    return this.focusedVisual?.config?.trend?.window ?? 3;
  }
  set trendWindow(v: number) {
    if (!this.focusedVisual?.config?.trend) return;
    this.focusedVisual.config.trend = {
      ...this.focusedVisual.config.trend,
      window: v,
    };
  }

  get trendForecastPeriods(): number {
    return this.focusedVisual?.config?.trend?.forecastPeriods ?? 3;
  }
  set trendForecastPeriods(v: number) {
    if (!this.focusedVisual?.config?.trend) return;
    this.focusedVisual.config.trend = {
      ...this.focusedVisual.config.trend,
      forecastPeriods: v,
    };
  }

  /** Polynomial degree (2 = quadratic, 3 = cubic, …) for the poly trend fit. */
  get trendDegree(): number {
    return this.focusedVisual?.config?.trend?.degree ?? 2;
  }
  set trendDegree(v: number) {
    if (!this.focusedVisual?.config?.trend) return;
    this.focusedVisual.config.trend = {
      ...this.focusedVisual.config.trend,
      degree: v,
    };
  }

  // ── Analytics section: quick calc (config.quickCalc) — Slice B ───────

  /** Two-way bind for the Quick calc dropdown ('' clears the key). */
  get quickCalc(): string {
    return this.focusedVisual?.config?.quickCalc ?? '';
  }
  set quickCalc(v: string) {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (!v) {
      delete cfg.quickCalc;
    } else {
      cfg.quickCalc = v;
      // Seed a sensible default window the first time moving average is picked.
      if (v === 'moving_average' && !cfg.movingAverageWindow) {
        cfg.movingAverageWindow = 3;
      }
    }
  }

  get movingAverageWindow(): number {
    return this.focusedVisual?.config?.movingAverageWindow ?? 3;
  }
  set movingAverageWindow(v: number) {
    if (this.focusedVisual?.config) {
      this.focusedVisual.config.movingAverageWindow = v;
    }
  }

  // ── Analytics section: period-over-period (config.compare) — Slice B ─

  /** Two-way bind for the compare-mode dropdown ('' removes config.compare). */
  get compareMode(): string {
    return this.focusedVisual?.config?.compare?.mode ?? '';
  }
  set compareMode(v: string) {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (!v) {
      delete cfg.compare;
      return;
    }
    cfg.compare = { ...(cfg.compare || {}), mode: v };
  }

  /** Date column that orders rows into periods for the compare. */
  get compareDateColumn(): string {
    return this.focusedVisual?.config?.compare?.dateColumn ?? '';
  }
  set compareDateColumn(v: string) {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    cfg.compare = { ...(cfg.compare || { mode: 'previous_period' }), dateColumn: v || null };
  }

  // ── Per-visual controls (Slice C): sort / limit / stacking / null / format ──
  // All read/write flat config keys. Getters default to the passthrough value
  // so an un-configured visual shows the neutral option.

  get sortBy(): string {
    return this.focusedVisual?.config?.sortBy ?? 'none';
  }
  set sortBy(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.sortBy = v;
  }

  get sortDir(): string {
    return this.focusedVisual?.config?.sortDir ?? 'desc';
  }
  set sortDir(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.sortDir = v;
  }

  get limitMode(): string {
    return this.focusedVisual?.config?.limitMode ?? 'none';
  }
  set limitMode(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.limitMode = v;
  }

  get limitN(): number {
    return this.focusedVisual?.config?.limitN ?? 10;
  }
  set limitN(v: number) {
    if (this.focusedVisual?.config) this.focusedVisual.config.limitN = v;
  }

  get stacking(): string {
    return this.focusedVisual?.config?.stacking ?? 'none';
  }
  set stacking(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.stacking = v;
  }

  get labelContent(): string {
    return this.focusedVisual?.config?.labelContent ?? 'value';
  }
  set labelContent(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.labelContent = v;
  }

  get nullHandling(): string {
    return this.focusedVisual?.config?.nullHandling ?? 'gap';
  }
  set nullHandling(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.nullHandling = v;
  }

  get yAxisScaleType(): string {
    return this.focusedVisual?.config?.yAxisScaleType ?? 'linear';
  }
  set yAxisScaleType(v: string) {
    if (this.focusedVisual?.config) this.focusedVisual.config.yAxisScaleType = v;
  }

  get yScaleMin(): number | null {
    const v = this.focusedVisual?.config?.yScaleMin;
    return typeof v === 'number' ? v : null;
  }
  set yScaleMin(v: number | null) {
    if (!this.focusedVisual?.config) return;
    this.focusedVisual.config.yScaleMin =
      v === null || v === undefined ? undefined : v;
  }

  get yScaleMax(): number | null {
    const v = this.focusedVisual?.config?.yScaleMax;
    return typeof v === 'number' ? v : null;
  }
  set yScaleMax(v: number | null) {
    if (!this.focusedVisual?.config) return;
    this.focusedVisual.config.yScaleMax =
      v === null || v === undefined ? undefined : v;
  }

  // ── Per-field number/date format (config.valueFormat = formatHint) ──────
  // formatHint shape: { kind, decimals, currencyCode, dateFormat, thousands,
  // target }. `kind: 'auto'` (the default) means no override.

  private ensureValueFormat(): any {
    if (!this.focusedVisual?.config) return null;
    const cfg = this.focusedVisual.config;
    if (!cfg.valueFormat || typeof cfg.valueFormat !== 'object') {
      cfg.valueFormat = {
        kind: 'auto',
        decimals: 2,
        currencyCode: 'USD',
        dateFormat: 'YYYY-MM-DD',
        thousands: true,
        target: 'value',
      };
    }
    return cfg.valueFormat;
  }

  get formatKind(): string {
    return this.focusedVisual?.config?.valueFormat?.kind ?? 'auto';
  }
  set formatKind(v: string) {
    const fmt = this.ensureValueFormat();
    if (!fmt || !this.focusedVisual?.config) return;
    if (v === 'auto') {
      // Reset to passthrough — drop the whole hint so the builder no-ops.
      this.focusedVisual.config.valueFormat = null;
      return;
    }
    this.focusedVisual.config.valueFormat = { ...fmt, kind: v };
  }

  get formatTarget(): string {
    return this.focusedVisual?.config?.valueFormat?.target ?? 'value';
  }
  set formatTarget(v: string) {
    const fmt = this.ensureValueFormat();
    if (!fmt) return;
    this.focusedVisual!.config.valueFormat = { ...fmt, target: v };
  }

  get formatDecimals(): number {
    return this.focusedVisual?.config?.valueFormat?.decimals ?? 2;
  }
  set formatDecimals(v: number) {
    const fmt = this.ensureValueFormat();
    if (!fmt) return;
    this.focusedVisual!.config.valueFormat = { ...fmt, decimals: v };
  }

  get formatCurrencyCode(): string {
    return this.focusedVisual?.config?.valueFormat?.currencyCode ?? 'USD';
  }
  set formatCurrencyCode(v: string) {
    const fmt = this.ensureValueFormat();
    if (!fmt) return;
    this.focusedVisual!.config.valueFormat = { ...fmt, currencyCode: v };
  }

  get formatDateFormat(): string {
    return this.focusedVisual?.config?.valueFormat?.dateFormat ?? 'YYYY-MM-DD';
  }
  set formatDateFormat(v: string) {
    const fmt = this.ensureValueFormat();
    if (!fmt) return;
    this.focusedVisual!.config.valueFormat = { ...fmt, dateFormat: v };
  }

  get formatThousands(): boolean {
    return this.focusedVisual?.config?.valueFormat?.thousands ?? true;
  }
  set formatThousands(v: boolean) {
    const fmt = this.ensureValueFormat();
    if (!fmt) return;
    this.focusedVisual!.config.valueFormat = { ...fmt, thousands: v };
  }

  // ── Analytics section: small-multiples (config.smallMultiples) ───────

  get smallMultiplesEnabled(): boolean {
    return !!this.focusedVisual?.config?.smallMultiples?.enabled;
  }
  setSmallMultiplesEnabled(on: boolean): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    if (on) {
      const prev = cfg.smallMultiples || {};
      cfg.smallMultiples = {
        enabled: true,
        facetColumn: prev.facetColumn ?? null,
        maxCols: prev.maxCols ?? 2,
      };
    } else {
      delete cfg.smallMultiples;
    }
  }

  get smallMultiplesFacetColumn(): string | null {
    return this.focusedVisual?.config?.smallMultiples?.facetColumn ?? null;
  }
  set smallMultiplesFacetColumn(v: string | null) {
    if (!this.focusedVisual?.config?.smallMultiples) return;
    this.focusedVisual.config.smallMultiples = {
      ...this.focusedVisual.config.smallMultiples,
      facetColumn: v || null,
    };
  }

  get smallMultiplesMaxCols(): number {
    return this.focusedVisual?.config?.smallMultiples?.maxCols ?? 2;
  }
  set smallMultiplesMaxCols(v: number) {
    if (!this.focusedVisual?.config?.smallMultiples) return;
    this.focusedVisual.config.smallMultiples = {
      ...this.focusedVisual.config.smallMultiples,
      maxCols: v,
    };
  }

  // ── Interaction section: cross-filter (config.interaction) ──────────

  get crossFilterEnabled(): boolean {
    return !!this.focusedVisual?.config?.interaction?.crossFilter?.enabled;
  }
  setCrossFilterEnabled(on: boolean): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const prev = cfg.interaction?.crossFilter || {};
    cfg.interaction = {
      ...(cfg.interaction || {}),
      crossFilter: {
        enabled: on,
        targets: prev.targets ?? 'same-tab',
        ...(Array.isArray(prev.visualIds) ? { visualIds: prev.visualIds } : {}),
      },
    };
    // Mirror onto the flat visual flag so the existing interaction bus in
    // edit-analyses (which reads visual.crossFilterEnabled) stays in sync.
    if (this.focusedVisual) this.focusedVisual.crossFilterEnabled = on;
  }

  /** Target mode: 'same-tab' | 'dashboard' | 'visuals' (explicit ids). */
  get crossFilterTargetMode(): string {
    const t = this.focusedVisual?.config?.interaction?.crossFilter?.targets;
    if (t === 'dashboard') return 'dashboard';
    if (t && typeof t === 'object' && Array.isArray(t.visualIds)) return 'visuals';
    return 'same-tab';
  }
  set crossFilterTargetMode(mode: string) {
    if (!this.focusedVisual?.config?.interaction?.crossFilter) return;
    const cf = this.focusedVisual.config.interaction.crossFilter;
    let targets: any = 'same-tab';
    if (mode === 'dashboard') targets = 'dashboard';
    else if (mode === 'visuals')
      targets = { visualIds: Array.isArray(cf.targets?.visualIds) ? cf.targets.visualIds : [] };
    this.focusedVisual.config.interaction = {
      ...this.focusedVisual.config.interaction,
      crossFilter: { ...cf, targets },
    };
  }

  /** Explicit target visual ids (only meaningful when target mode = visuals). */
  get crossFilterVisualIds(): string[] {
    const t = this.focusedVisual?.config?.interaction?.crossFilter?.targets;
    return t && typeof t === 'object' && Array.isArray(t.visualIds)
      ? t.visualIds
      : [];
  }
  set crossFilterVisualIds(ids: string[]) {
    if (!this.focusedVisual?.config?.interaction?.crossFilter) return;
    const cf = this.focusedVisual.config.interaction.crossFilter;
    this.focusedVisual.config.interaction = {
      ...this.focusedVisual.config.interaction,
      crossFilter: { ...cf, targets: { visualIds: ids || [] } },
    };
  }

  /**
   * Sibling visuals (excluding this one) as multiselect options for the
   * explicit-target picker. Sourced from the optional siblingVisuals input.
   */
  get siblingVisualOptions(): { label: string; value: string }[] {
    return (this.siblingVisuals || [])
      .filter(v => v && v.id && v.id !== this.focusedVisual?.id)
      .map(v => ({ label: v.title || v.id, value: v.id }));
  }

  ngOnInit(): void {
    this.localizeDropdownOptions();
    this.langSubscription = this.translate.onLangChange.subscribe(() => {
      this.localizeDropdownOptions();
      // Force a CD pass — the option arrays we just swapped are
      // upstream of OnPush change detection. Without this, the
      // dropdowns keep showing the previous language's labels until
      // the next user interaction.
      this.cdr.markForCheck();
    });
    this.loadAggregateOptions();
  }

  /**
   * DB-driven aggregate-function options (family: aggregate_fn). Overwrites
   * the i18n-keyed fallback with DB rows (label + order). The combo variant
   * is the raw DB list; the primary variant re-prepends the UI-only NONE
   * entry (value '') which isn't part of the family. No-op on empty (family
   * absent / fetch failed) so the fallback list stays.
   */
  private loadAggregateOptions(): void {
    this.referenceData.getFamily('aggregate_fn').subscribe(rows => {
      if (!rows.length) return;
      const dbOptions = rows.map(r => ({
        label: r.label,
        value: r.code as AggregateFn,
      }));
      this.comboAggregateOptions = dbOptions;
      this.aggregateOptions = [
        { label: this.translate.instant('ANALYSES.AGG.NONE'), value: '' },
        ...dbOptions,
      ];
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  /** Resolve every i18n-keyed `label` to the active locale. */
  private localizeDropdownOptions(): void {
    const localize = <T extends { label: string; value: unknown }>(arr: T[]): T[] =>
      arr.map(
        (o) =>
          ({ ...o, label: this.translate.instant(o.label) }) as T,
      );
    // Original 24 arrays
    this.lineStepOptions = localize(LINE_STEP_OPTIONS);
    this.funnelSortOptions = localize(FUNNEL_SORT_OPTIONS);
    this.funnelAlignOptions = localize(FUNNEL_ALIGN_OPTIONS);
    this.treemapNodeClickOptions = localize(TREEMAP_NODE_CLICK_OPTIONS);
    this.sunburstNodeClickOptions = localize(SUNBURST_NODE_CLICK_OPTIONS);
    this.effectShowOnOptions = localize(EFFECT_SHOW_ON_OPTIONS);
    this.samplingOptions = localize(SAMPLING_OPTIONS);
    this.showAllSymbolOptions = localize(SHOW_ALL_SYMBOL_OPTIONS);
    this.stackStrategyOptions = localize(STACK_STRATEGY_OPTIONS);
    this.rippleBrushTypeOptions = localize(RIPPLE_BRUSH_TYPE_OPTIONS);
    this.funnelOrientOptions = localize(FUNNEL_ORIENT_OPTIONS);
    this.sunburstSortOptions = localize(SUNBURST_SORT_OPTIONS);
    this.pictorialRepeatDirectionOptions = localize(
      PICTORIAL_REPEAT_DIRECTION_OPTIONS,
    );
    this.emphasisFocusOptions = localize(EMPHASIS_FOCUS_OPTIONS);
    this.visualMapOrientOptions = localize(VISUAL_MAP_ORIENT_OPTIONS);
    this.visualMapTypeOptions = localize(VISUAL_MAP_TYPE_OPTIONS);
    this.dataZoomTypeOptions = localize(DATA_ZOOM_TYPE_OPTIONS);
    this.dataZoomFilterModeOptions = localize(DATA_ZOOM_FILTER_MODE_OPTIONS);
    this.areaOriginOptions = localize(AREA_ORIGIN_OPTIONS);
    this.sunburstLabelRotateOptions = localize(SUNBURST_LABEL_ROTATE_OPTIONS);
    this.colorMappingByOptions = localize(COLOR_MAPPING_BY_OPTIONS);
    this.funnelLabelPositionOptions = localize(FUNNEL_LABEL_POSITION_OPTIONS);
    this.themeRiverLabelPositionOptions = localize(
      THEME_RIVER_LABEL_POSITION_OPTIONS,
    );
    this.shadingModeOptions = localize(SHADING_MODE_OPTIONS);
    // Wave 2 — non-_OPTIONS arrays (legend/labels/symbols/etc.)
    this.legendPositions = localize(LEGEND_POSITIONS);
    this.legendTypes = localize(LEGEND_TYPES);
    this.labelPositions = localize(LABEL_POSITIONS);
    this.tooltipTriggers = localize(TOOLTIP_TRIGGERS);
    this.axisPointerTypes = localize(AXIS_POINTER_TYPES);
    this.gridLineStyles = localize(GRID_LINE_STYLES);
    this.emphasisModes = localize(EMPHASIS_MODES);
    this.animationEasings = localize(ANIMATION_EASINGS);
    this.lineStyleTypes = localize(LINE_STYLE_TYPES);
    this.symbolShapes = localize(SYMBOL_SHAPES);
    this.pieLabelPositions = localize(PIE_LABEL_POSITIONS);
    this.pieSelectedModes = localize(PIE_SELECTED_MODES);
    this.pieRoseTypes = localize(PIE_ROSE_TYPES);
    this.radarShapes = localize(RADAR_SHAPES);
    this.graphLayouts = localize(GRAPH_LAYOUTS);
    this.treeOrientations = localize(TREE_ORIENTATIONS);
    this.treeLayouts = localize(TREE_LAYOUTS);
    this.sankeyOrientations = localize(SANKEY_ORIENTATIONS);
    this.pictorialSymbols = localize(PICTORIAL_SYMBOLS);
    this.treeEdgeShapes = localize(TREE_EDGE_SHAPES);
    this.graphEdgeSymbols = localize(GRAPH_EDGE_SYMBOLS);
    this.boxplotLayouts = localize(BOXPLOT_LAYOUTS);
    this.pictorialSymbolPositions = localize(PICTORIAL_SYMBOL_POSITIONS);
    this.sankeyNodeAligns = localize(SANKEY_NODE_ALIGNS);
    // Conditional-formatting / reference-line / pivot dropdowns. localize
    // preserves extra fields (e.g. operator `operands`) via the object spread.
    // Always derive from the stable RAW_* / CONST sources so a language change
    // never double-translates an already-localized label.
    this.conditionalOperatorOptions = localize(CONDITIONAL_OPERATOR_OPTIONS);
    this.pivotAggregationOptions = localize(PIVOT_AGGREGATION_OPTIONS);
    this.referenceLineTypeOptions = localize(
      VisualConfigSidebarComponent.RAW_REFLINE_TYPES,
    );
    this.referenceAxisOptions = localize(VisualConfigSidebarComponent.RAW_REF_AXIS);
    this.conditionalAppliesToOptions = localize(
      VisualConfigSidebarComponent.RAW_CF_APPLIES,
    );
    this.conditionalDataTypeOptions = localize(
      VisualConfigSidebarComponent.RAW_CF_DTYPES,
    );
    // Per-visual controls (Slice C).
    this.sortByOptions = localize(VISUAL_SORT_BY_OPTIONS);
    this.sortDirOptions = localize(VISUAL_SORT_DIR_OPTIONS);
    this.limitModeOptions = localize(VISUAL_LIMIT_MODE_OPTIONS);
    this.stackingOptions = localize(VISUAL_STACKING_OPTIONS);
    this.labelContentOptions = localize(VISUAL_LABEL_CONTENT_OPTIONS);
    this.nullHandlingOptions = localize(VISUAL_NULL_HANDLING_OPTIONS);
    this.axisScaleOptions = localize(VISUAL_AXIS_SCALE_OPTIONS);
    this.formatKindOptions = localize(VISUAL_FORMAT_KIND_OPTIONS);
    this.formatTargetOptions = localize(VISUAL_FORMAT_TARGET_OPTIONS);
    // Trend types include the new log/poly fits; localize the display copy.
    this.trendTypeOptions = localize(this.trendTypeOptionsRaw);
    // Slice B — quick calc + period-over-period.
    this.quickCalcOptions = localize(this.quickCalcOptionsRaw);
    this.compareModeOptions = localize(this.compareModeOptionsRaw);
  }

  ngDoCheck(): void {
    if (!this.focusedVisual) return;
    const snapshot = JSON.stringify({
      // Stringify the slice we actually care about. Including the field
      // assignments (xAxisColumn, etc.) catches axis remaps too.
      cfg: this.focusedVisual.config,
      x: this.focusedVisual.xAxisColumn,
      y: this.focusedVisual.yAxisColumn,
      z: this.focusedVisual.zAxisColumn,
      // Track D: server aggregation lives in top-level visual fields, not
      // config — include them so the Data section's edits fire configChanged.
      dim: this.focusedVisual.dimensionColumn,
      measure: this.focusedVisual.measureColumn,
      agg: this.focusedVisual.aggregate,
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
  isComboChartType = isComboChartType;
  isHistogramChartType = isHistogramChartType;
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
  // Per-visual controls (Slice C). Localised in localizeDropdownOptions().
  sortByOptions = VISUAL_SORT_BY_OPTIONS;
  sortDirOptions = VISUAL_SORT_DIR_OPTIONS;
  limitModeOptions = VISUAL_LIMIT_MODE_OPTIONS;
  stackingOptions = VISUAL_STACKING_OPTIONS;
  labelContentOptions = VISUAL_LABEL_CONTENT_OPTIONS;
  nullHandlingOptions = VISUAL_NULL_HANDLING_OPTIONS;
  axisScaleOptions = VISUAL_AXIS_SCALE_OPTIONS;
  formatKindOptions = VISUAL_FORMAT_KIND_OPTIONS;
  formatTargetOptions = VISUAL_FORMAT_TARGET_OPTIONS;
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
  // ─── Phase 4b additions ───
  emphasisFocusOptions = EMPHASIS_FOCUS_OPTIONS;
  visualMapOrientOptions = VISUAL_MAP_ORIENT_OPTIONS;
  visualMapTypeOptions = VISUAL_MAP_TYPE_OPTIONS;
  dataZoomTypeOptions = DATA_ZOOM_TYPE_OPTIONS;
  dataZoomFilterModeOptions = DATA_ZOOM_FILTER_MODE_OPTIONS;
  areaOriginOptions = AREA_ORIGIN_OPTIONS;
  sunburstLabelRotateOptions = SUNBURST_LABEL_ROTATE_OPTIONS;
  colorMappingByOptions = COLOR_MAPPING_BY_OPTIONS;
  mapNamePropertyHints = MAP_NAME_PROPERTY_HINTS;
  funnelLabelPositionOptions = FUNNEL_LABEL_POSITION_OPTIONS;
  themeRiverLabelPositionOptions = THEME_RIVER_LABEL_POSITION_OPTIONS;
  shadingModeOptions = SHADING_MODE_OPTIONS;

  // ═══════════════════════════════════════════════════════════════════
  // Conditional formatting / reference lines / pivot — editor state
  // ═══════════════════════════════════════════════════════════════════

  // Localized display copies (labels resolved to the active locale in
  // localizeDropdownOptions, re-derived from the stable RAW_* sources below
  // on every language change — never localize an already-localized array).
  conditionalOperatorOptions = CONDITIONAL_OPERATOR_OPTIONS;
  pivotAggregationOptions = PIVOT_AGGREGATION_OPTIONS;
  referenceLineTypeOptions = VisualConfigSidebarComponent.RAW_REFLINE_TYPES;
  referenceAxisOptions = VisualConfigSidebarComponent.RAW_REF_AXIS;
  conditionalAppliesToOptions = VisualConfigSidebarComponent.RAW_CF_APPLIES;
  conditionalDataTypeOptions = VisualConfigSidebarComponent.RAW_CF_DTYPES;

  /** Line-style dropdown reused from the shared (already-localized) styles. */
  referenceLineStyleOptions = GRID_LINE_STYLES;

  // Stable i18n-keyed sources (never mutated) for the four local arrays.
  private static readonly RAW_REFLINE_TYPES = [
    { label: 'ANALYSES.REFLINE.TYPE.CONSTANT', value: 'constant' },
    { label: 'ANALYSES.REFLINE.TYPE.AVERAGE', value: 'average' },
    { label: 'ANALYSES.REFLINE.TYPE.MIN', value: 'min' },
    { label: 'ANALYSES.REFLINE.TYPE.MAX', value: 'max' },
  ];
  private static readonly RAW_REF_AXIS = [
    { label: 'ANALYSES.REFLINE.AXIS.Y', value: 'y' },
    { label: 'ANALYSES.REFLINE.AXIS.X', value: 'x' },
  ];
  private static readonly RAW_CF_APPLIES = [
    { label: 'ANALYSES.CF.APPLIES.CELL', value: 'cell' },
    { label: 'ANALYSES.CF.APPLIES.TEXT', value: 'text' },
    { label: 'ANALYSES.CF.APPLIES.BAR', value: 'bar' },
    { label: 'ANALYSES.CF.APPLIES.POINT', value: 'point' },
  ];
  private static readonly RAW_CF_DTYPES = [
    { label: 'ANALYSES.CF.DTYPE.NUMBER', value: 'number' },
    { label: 'ANALYSES.CF.DTYPE.STRING', value: 'string' },
    { label: 'ANALYSES.CF.DTYPE.DATE', value: 'date' },
  ];

  /**
   * Column options for target-field / pivot dropdowns. Sourced from
   * allFields (preferred) with a chartData-key fallback, shaped as
   * { label, value } for the custom dropdowns/multiselects.
   */
  get fieldOptions(): { label: string; value: string }[] {
    return this.tableAvailableColumns.map(c => ({
      label: this.tableColumnLabel(c),
      value: c,
    }));
  }

  // ── Feature gating ──

  /** Reference lines/bands/annotations apply to cartesian chart families. */
  supportsReferenceLines(chartType: string | null): boolean {
    return (
      this.isBarChartType(chartType) ||
      this.isLineChartType(chartType) ||
      this.isAreaChartType(chartType) ||
      this.isScatterChartType(chartType) ||
      this.isWaterfallChartType(chartType) ||
      this.isBoxChartType(chartType) ||
      this.isCandlestickChartType(chartType)
    );
  }

  /** Per-datum conditional colour applies to value-mapped cartesian charts. */
  supportsChartConditionalFormatting(chartType: string | null): boolean {
    return (
      this.isBarChartType(chartType) ||
      this.isLineChartType(chartType) ||
      this.isAreaChartType(chartType) ||
      this.isScatterChartType(chartType)
    );
  }

  /** A value-driven colour scale (visualMap) — bar + scatter for now. */
  supportsVisualMap(chartType: string | null): boolean {
    return this.isBarChartType(chartType) || this.isScatterChartType(chartType);
  }

  /** How many operand inputs an operator needs (0/1/2) — for template *ngIf. */
  operandCount(op: ConditionalOperator | undefined): 0 | 1 | 2 {
    return operandCount(op);
  }

  // ── Conditional-formatting rule CRUD ──

  get conditionalRules(): ConditionalRule[] {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return [];
    if (!Array.isArray(cfg.conditionalFormatting)) cfg.conditionalFormatting = [];
    return cfg.conditionalFormatting;
  }

  addConditionalRule(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const list: ConditionalRule[] = Array.isArray(cfg.conditionalFormatting)
      ? [...cfg.conditionalFormatting]
      : [];
    // Table visuals default the paint surface to 'cell'; charts to 'bar'.
    const defaultApplies = this.isTableChartType(this.focusedVisual.chartType)
      ? 'cell'
      : this.isScatterChartType(this.focusedVisual.chartType)
        ? 'point'
        : 'bar';
    list.push({
      id: this.genId(),
      targetField: '',
      operator: 'gt',
      value: null,
      value2: null,
      color: '#fde68a',
      appliesTo: defaultApplies as any,
      dataType: 'number',
      enabled: true,
    });
    cfg.conditionalFormatting = list;
  }

  removeConditionalRule(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.conditionalFormatting)) return;
    const list = [...cfg.conditionalFormatting];
    list.splice(index, 1);
    cfg.conditionalFormatting = list;
  }

  trackByRuleId(_: number, rule: ConditionalRule): string {
    return rule.id || String(_);
  }

  // ── Reference-line CRUD ──

  get referenceLines(): any[] {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return [];
    if (!Array.isArray(cfg.referenceLines)) cfg.referenceLines = [];
    return cfg.referenceLines;
  }

  addReferenceLine(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const list = Array.isArray(cfg.referenceLines) ? [...cfg.referenceLines] : [];
    list.push({
      id: this.genId(),
      type: 'constant',
      axis: 'y',
      value: 0,
      label: '',
      color: '#ef4444',
      lineStyle: 'dashed',
      width: 1.5,
    });
    cfg.referenceLines = list;
  }

  removeReferenceLine(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.referenceLines)) return;
    const list = [...cfg.referenceLines];
    list.splice(index, 1);
    cfg.referenceLines = list;
  }

  // ── Reference-band CRUD ──

  get referenceBands(): any[] {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return [];
    if (!Array.isArray(cfg.referenceBands)) cfg.referenceBands = [];
    return cfg.referenceBands;
  }

  addReferenceBand(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const list = Array.isArray(cfg.referenceBands) ? [...cfg.referenceBands] : [];
    list.push({
      id: this.genId(),
      axis: 'y',
      from: 0,
      to: 0,
      label: '',
      color: 'rgba(239,68,68,0.10)',
      opacity: 1,
    });
    cfg.referenceBands = list;
  }

  removeReferenceBand(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.referenceBands)) return;
    const list = [...cfg.referenceBands];
    list.splice(index, 1);
    cfg.referenceBands = list;
  }

  // ── Annotation CRUD ──

  get annotations(): any[] {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return [];
    if (!Array.isArray(cfg.annotations)) cfg.annotations = [];
    return cfg.annotations;
  }

  addAnnotation(): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const list = Array.isArray(cfg.annotations) ? [...cfg.annotations] : [];
    list.push({
      id: this.genId(),
      x: '',
      y: 0,
      label: '',
      color: '#f59e0b',
    });
    cfg.annotations = list;
  }

  removeAnnotation(index: number): void {
    const cfg = this.focusedVisual?.config;
    if (!cfg || !Array.isArray(cfg.annotations)) return;
    const list = [...cfg.annotations];
    list.splice(index, 1);
    cfg.annotations = list;
  }

  trackByGenId(_: number, item: any): string {
    return item?.id || String(_);
  }

  // ── Pivot config ──

  /** Ensure a pivot config object exists (lazily) and return it. */
  ensurePivot(): any {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return {};
    if (!cfg.pivot || typeof cfg.pivot !== 'object') {
      cfg.pivot = {
        enabled: false,
        rows: [],
        columns: [],
        measure: '',
        aggregation: 'sum' as PivotAggregation,
        showRowTotals: true,
        showColumnTotals: true,
      };
    }
    if (!Array.isArray(cfg.pivot.rows)) cfg.pivot.rows = [];
    if (!Array.isArray(cfg.pivot.columns)) cfg.pivot.columns = [];
    return cfg.pivot;
  }

  get pivotEnabled(): boolean {
    return this.focusedVisual?.config?.pivot?.enabled === true;
  }

  setPivotEnabled(on: boolean): void {
    const p = this.ensurePivot();
    p.enabled = on;
  }

  // ── Server-side pivot totals (Feature 5) ────────────────────────────
  //
  // Distinct from the ECharts-local showRow/ColumnTotals above: this
  // config asks the BE to append grand-total + per-group subtotal ROWS to
  // the run response (surfaced at response.meta.pivotTotals). It is sent
  // as `config.pivotTotals` = { grandTotal, subtotals, dimensionKeys[],
  // measures[] } on the run payload (see edit-analyses.loadDatasetData).
  // dimensionKeys / measures are derived from the pivot config's rows +
  // measure when the run is assembled, so here we only own the two
  // on/off toggles. Kept in its own region, well away from the Slice-4
  // aggregate dropdown.

  private ensurePivotTotals(): any {
    const cfg = this.focusedVisual?.config;
    if (!cfg) return {};
    if (!cfg.pivotTotals || typeof cfg.pivotTotals !== 'object') {
      cfg.pivotTotals = { grandTotal: false, subtotals: false };
    }
    return cfg.pivotTotals;
  }

  get pivotGrandTotal(): boolean {
    return this.focusedVisual?.config?.pivotTotals?.grandTotal === true;
  }
  setPivotGrandTotal(on: boolean): void {
    const pt = this.ensurePivotTotals();
    this.focusedVisual!.config.pivotTotals = { ...pt, grandTotal: on };
  }

  get pivotSubtotals(): boolean {
    return this.focusedVisual?.config?.pivotTotals?.subtotals === true;
  }
  setPivotSubtotals(on: boolean): void {
    const pt = this.ensurePivotTotals();
    this.focusedVisual!.config.pivotTotals = { ...pt, subtotals: on };
  }

  /**
   * Set the low (index 0) or high (index 1) endpoint colour of the
   * value-driven colour scale (ECharts visualMap). Persisted in
   * config.visualMapColors as a two-element [low, high] tuple. Mutates
   * config in place — the snapshot-diff watcher picks up the change and
   * fires configChanged, matching every other setter in this editor.
   */
  setVisualMapColor(index: 0 | 1, color: string): void {
    if (!this.focusedVisual?.config) return;
    const cfg = this.focusedVisual.config;
    const colors: string[] = Array.isArray(cfg.visualMapColors)
      ? [...cfg.visualMapColors]
      : [];
    // Keep a stable two-slot tuple so the other endpoint isn't lost when
    // only one swatch has been touched yet.
    while (colors.length < 2) colors.push(colors.length === 0 ? '#e0f2fe' : '#0369a1');
    colors[index] = color;
    cfg.visualMapColors = colors;
  }

  /** Short random id for editor row identity + overlay tracking. */
  private genId(): string {
    return 'cf_' + Math.random().toString(36).slice(2, 10);
  }
}
