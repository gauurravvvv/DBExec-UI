import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { AggregateFn } from '../../models/visual.model';
import {
  CHART_TYPES,
  getChartRoles,
  hasAxisLabels,
  is3DCoordinateChartType,
  isBubbleChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  isSankeyChartType,
  isTableChartType,
} from '../../constants/charts.constants';
import { RoleKey, Visual } from '../../models/visual.model';
import { toFieldKind } from '../../utils/field-type.util';
import {
  findFieldByColumn,
  isNonAggregatableMeasure,
} from '../../utils/axis-label.util';

/**
 * A single slot in the field-mapping panel. Driven by the chart's
 * `roles` spec in charts.constants. Lets the same template render every
 * chart type's field pickers without hardcoded blocks per chart family.
 */
interface RoleSlot {
  key: RoleKey;
  label: string;
  required: boolean;
  /** true for list-valued roles (indicators, dimensions, valueColumns) */
  multi: boolean;
}

/**
 * Human-readable label for each role. Centralised here so future
 * localisation (i18n keys) only has to change one place.
 */
/**
 * i18n keys for each role. The chart-picker template pipes
 * `slot.label | translate` so PrimeNG / Angular renders the active
 * locale's string. Keys live under `ROLE_LABELS.*` in every locale JSON.
 */
const ROLE_LABELS: Record<RoleKey, string> = {
  xAxis: 'ROLE_LABELS.X_AXIS',
  yAxis: 'ROLE_LABELS.Y_AXIS',
  zAxis: 'ROLE_LABELS.Z_AXIS',
  open: 'ROLE_LABELS.OPEN',
  high: 'ROLE_LABELS.HIGH',
  low: 'ROLE_LABELS.LOW',
  close: 'ROLE_LABELS.CLOSE',
  sample: 'ROLE_LABELS.SAMPLE',
  parent: 'ROLE_LABELS.PARENT',
  indicators: 'ROLE_LABELS.INDICATORS',
  dimensions: 'ROLE_LABELS.DIMENSIONS',
  valueColumns: 'ROLE_LABELS.VALUE_COLUMNS',
  lng: 'ROLE_LABELS.LONGITUDE',
  lat: 'ROLE_LABELS.LATITUDE',
  time: 'ROLE_LABELS.TIME',
};

const LIST_VALUED_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  'indicators',
  'dimensions',
  'valueColumns',
]);

@Component({
  selector: 'app-visuals-chart-sidebar',
  templateUrl: './visuals-chart-sidebar.component.html',
  // Self-contained: child owns its full stylesheet so default Emulated
  // encapsulation correctly scopes everything to this component's DOM.
  styleUrls: ['./visuals-chart-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualsChartSidebarComponent implements OnInit, OnDestroy {
  /**
   * The chart picker is OnPush and renders chart cards from cached
   * category maps. The `| translate` pipe re-evaluates on language
   * change but only when CD visits this view — which doesn't happen
   * here without a parent prompt. Subscribe to onLangChange and
   * markForCheck explicitly so chart names/categories refresh in place.
   */
  private langSubscription?: Subscription;

  constructor(
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private referenceData: ReferenceDataService,
  ) {}

  ngOnInit(): void {
    this.langSubscription = this.translate.onLangChange.subscribe(() => {
      // The chart-category cache groups chart cards by their `category`
      // key — a translation-key string, identical across locales — so
      // it doesn't need rebuilding. We just need a CD pass so the pipe
      // re-evaluates against the new language.
      this.localizeAggregateOptions();
      this.cdr.markForCheck();
    });
    this.localizeAggregateOptions();
    this.loadAggregateOptions();
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  @Input() focusedVisual!: Visual;
  @Input() focusedVisualId: string | null = null;
  @Input() isDataLoaded = false;
  /**
   * Which role slot is currently waiting for a column pick. Generalised
   * from the legacy `'x' | 'y' | 'z'` to any RoleKey so the same selection
   * mechanism drives every chart-type's field roles.
   */
  @Input() activeAxisSelection: RoleKey | null = null;
  @Input() allFields: any[] = [];

  @Output() addVisualClicked = new EventEmitter<void>();
  /** Open the Add-widget dialog (moved here from the tab strip). */
  @Output() addWidgetClicked = new EventEmitter<void>();
  @Output() chartTypeSelected = new EventEmitter<void>();
  @Output() axisSelectionStarted = new EventEmitter<RoleKey | null>();
  @Output() axisFieldCleared = new EventEmitter<void>();
  /**
   * Fired when the visual's interaction config (cross-filter opt-in or
   * drill dimensions, spec §6) changes, so the parent can mark dirty and
   * re-run if a live drill/cross-filter is affected.
   */
  @Output() interactionChanged = new EventEmitter<void>();

  /**
   * Fired by the on-pill encoding menu (Wave 7, feature 5) the MOMENT the
   * user picks a menu, BEFORE the mutation is applied, so the parent can push
   * an undo snapshot of the pre-change state. Paired with encodingChanged.
   */
  @Output() encodingWillChange = new EventEmitter<void>();

  /**
   * Fired AFTER an on-pill encoding change (aggregation / sort / remove) is
   * applied to the focused visual, so the parent marks dirty + re-transforms.
   */
  @Output() encodingChanged = new EventEmitter<void>();

  // Chart type checkers
  isHeatMapChartType = isHeatMapChartType;
  isSankeyChartType = isSankeyChartType;
  isGraphChartType = isGraphChartType;
  isBubbleChartType = isBubbleChartType;
  is3DCoordinateChartType = is3DCoordinateChartType;
  isPolygons3dChartType = isPolygons3dChartType;
  isLines3dChartType = isLines3dChartType;
  isTableChartType = isTableChartType;
  hasAxisLabels = hasAxisLabels;

  // Chart types and search
  chartTypes = CHART_TYPES;
  chartSearchQuery = '';
  private _cachedChartCategories: string[] = [];
  private _cachedChartsByCategory: Map<string, any[]> = new Map();
  private _lastChartSearchQuery: string | null = null;

  private rebuildChartCategoryCache(): void {
    const filtered = this.getFilteredChartTypes();
    this._cachedChartCategories = [...new Set(filtered.map(c => c.category))];
    this._cachedChartsByCategory = new Map();
    for (const category of this._cachedChartCategories) {
      this._cachedChartsByCategory.set(
        category,
        filtered.filter(c => c.category === category),
      );
    }
    this._lastChartSearchQuery = this.chartSearchQuery;
  }

  private ensureChartCacheValid(): void {
    if (this._lastChartSearchQuery !== this.chartSearchQuery) {
      this.rebuildChartCategoryCache();
    }
  }

  getChartCategories(): string[] {
    this.ensureChartCacheValid();
    return this._cachedChartCategories;
  }

  getChartsByCategory(category: string): any[] {
    this.ensureChartCacheValid();
    return this._cachedChartsByCategory.get(category) || [];
  }

  getFilteredChartTypes(): any[] {
    if (!this.chartSearchQuery || this.chartSearchQuery.trim() === '') {
      return this.chartTypes;
    }
    const query = this.chartSearchQuery.toLowerCase().trim();
    return this.chartTypes.filter(
      chart =>
        chart.name.toLowerCase().includes(query) ||
        chart.description.toLowerCase().includes(query) ||
        chart.category.toLowerCase().includes(query),
    );
  }

  setVisualChartType(chartType: any): void {
    if (this.focusedVisual) {
      this.focusedVisual.chartType = chartType.id;
      // Intentionally do NOT overwrite the visual's title here. Users
      // expect the title they (or addVisual()) set to persist when they
      // pick a chart type — they'll edit the title from the Properties
      // pane on their own terms. Previously this assigned the
      // chart-type name to `title`, which clobbered "Untitled Visual"
      // (or a user-typed name) the moment the chart was chosen.
      this.chartTypeSelected.emit();
    }
  }

  startAxisSelection(role: RoleKey): void {
    const newValue = this.activeAxisSelection === role ? null : role;
    this.axisSelectionStarted.emit(newValue);
  }

  clearAxisField(role: RoleKey, event: Event): void {
    event.stopPropagation();
    if (!this.focusedVisual) return;
    this.clearRoleOnVisual(this.focusedVisual, role);
    this.axisFieldCleared.emit();
  }

  /**
   * Centralised setter — write a column name into the Visual field that
   * the role points to. Used by the parent's onFieldClick after the user
   * picks a column from the field tree.
   */
  setRoleOnVisual(visual: any, role: RoleKey, columnName: string): void {
    switch (role) {
      case 'xAxis':
        visual.xAxisColumn = columnName;
        break;
      case 'yAxis':
        visual.yAxisColumn = columnName;
        break;
      case 'zAxis':
        visual.zAxisColumn = columnName;
        break;
      case 'open':
        visual.openColumn = columnName;
        break;
      case 'high':
        visual.highColumn = columnName;
        break;
      case 'low':
        visual.lowColumn = columnName;
        break;
      case 'close':
        visual.closeColumn = columnName;
        break;
      case 'sample':
        visual.sampleColumn = columnName;
        break;
      case 'parent':
        visual.parentColumn = columnName;
        break;
      case 'lng':
        visual.lngColumn = columnName;
        break;
      case 'lat':
        visual.latColumn = columnName;
        break;
      case 'time':
        visual.timeColumn = columnName;
        break;
      case 'indicators': {
        if (!Array.isArray(visual.indicatorColumns))
          visual.indicatorColumns = [];
        if (!visual.indicatorColumns.includes(columnName)) {
          visual.indicatorColumns = [...visual.indicatorColumns, columnName];
        }
        break;
      }
      case 'dimensions': {
        if (!Array.isArray(visual.dimensionColumns))
          visual.dimensionColumns = [];
        if (!visual.dimensionColumns.includes(columnName)) {
          visual.dimensionColumns = [...visual.dimensionColumns, columnName];
        }
        break;
      }
      case 'valueColumns': {
        if (!Array.isArray(visual.valueColumns)) visual.valueColumns = [];
        if (!visual.valueColumns.includes(columnName)) {
          visual.valueColumns = [...visual.valueColumns, columnName];
        }
        break;
      }
    }
  }

  private clearRoleOnVisual(visual: any, role: RoleKey): void {
    switch (role) {
      case 'xAxis':
        visual.xAxisColumn = null;
        break;
      case 'yAxis':
        visual.yAxisColumn = null;
        break;
      case 'zAxis':
        visual.zAxisColumn = null;
        break;
      case 'open':
        visual.openColumn = null;
        break;
      case 'high':
        visual.highColumn = null;
        break;
      case 'low':
        visual.lowColumn = null;
        break;
      case 'close':
        visual.closeColumn = null;
        break;
      case 'sample':
        visual.sampleColumn = null;
        break;
      case 'parent':
        visual.parentColumn = null;
        break;
      case 'lng':
        visual.lngColumn = null;
        break;
      case 'lat':
        visual.latColumn = null;
        break;
      case 'time':
        visual.timeColumn = null;
        break;
      case 'indicators':
        visual.indicatorColumns = [];
        break;
      case 'dimensions':
        visual.dimensionColumns = [];
        break;
      case 'valueColumns':
        visual.valueColumns = [];
        break;
    }
  }

  /**
   * Look up the column-name currently bound to a role. Returns array for
   * list-valued roles, string for scalar roles. Template uses this to
   * render the chip(s) inside each slot.
   */
  getRoleValue(role: RoleKey): string | string[] | null {
    const v = this.focusedVisual as any;
    if (!v) return null;
    switch (role) {
      case 'xAxis':
        return v.xAxisColumn ?? null;
      case 'yAxis':
        return v.yAxisColumn ?? null;
      case 'zAxis':
        return v.zAxisColumn ?? null;
      case 'open':
        return v.openColumn ?? null;
      case 'high':
        return v.highColumn ?? null;
      case 'low':
        return v.lowColumn ?? null;
      case 'close':
        return v.closeColumn ?? null;
      case 'sample':
        return v.sampleColumn ?? null;
      case 'parent':
        return v.parentColumn ?? null;
      case 'lng':
        return v.lngColumn ?? null;
      case 'lat':
        return v.latColumn ?? null;
      case 'time':
        return v.timeColumn ?? null;
      case 'indicators':
        return v.indicatorColumns ?? [];
      case 'dimensions':
        return v.dimensionColumns ?? [];
      case 'valueColumns':
        return v.valueColumns ?? [];
    }
  }

  /**
   * Drives the dynamic field-mapping template — returns the ordered list
   * of role slots to render for the current chart type. Required slots
   * appear first, optional slots second.
   */
  getRoleSlots(): RoleSlot[] {
    const spec = getChartRoles(this.focusedVisual?.chartType ?? null);
    const slots: RoleSlot[] = [];
    spec.required.forEach(key =>
      slots.push({
        key,
        label: ROLE_LABELS[key] ?? key,
        required: true,
        multi: LIST_VALUED_ROLES.has(key),
      }),
    );
    spec.optional.forEach(key =>
      slots.push({
        key,
        label: ROLE_LABELS[key] ?? key,
        required: false,
        multi: LIST_VALUED_ROLES.has(key),
      }),
    );
    return slots;
  }

  /** Remove a single item from a list-valued role (chip × button). */
  removeFromMultiRole(role: RoleKey, columnName: string, event: Event): void {
    event.stopPropagation();
    if (!this.focusedVisual) return;
    const v = this.focusedVisual as any;
    if (role === 'indicators') {
      v.indicatorColumns = (v.indicatorColumns ?? []).filter(
        (c: string) => c !== columnName,
      );
    } else if (role === 'dimensions') {
      v.dimensionColumns = (v.dimensionColumns ?? []).filter(
        (c: string) => c !== columnName,
      );
    } else if (role === 'valueColumns') {
      v.valueColumns = (v.valueColumns ?? []).filter(
        (c: string) => c !== columnName,
      );
    }
    this.axisFieldCleared.emit();
  }

  /** Type-guard for the template — returns true when value is an array. */
  asArray(v: string | string[] | null): string[] {
    return Array.isArray(v) ? v : [];
  }

  asScalar(v: string | string[] | null): string | null {
    return Array.isArray(v) ? null : v;
  }

  getFieldDisplayName(columnToUse: string | null): string {
    if (!columnToUse) return '';
    const field = this.allFields.find(
      (f: any) =>
        f.columnToUse === columnToUse || f.columnToView === columnToUse,
    );
    return field?.columnToView || columnToUse;
  }

  // ─── Interactions config (cross-filter + drill, spec §6) ────────────

  /** Toggle whether clicking this visual broadcasts a cross-filter. */
  toggleCrossFilterEnabled(): void {
    if (!this.focusedVisual) return;
    this.focusedVisual.crossFilterEnabled = !this.focusedVisual
      .crossFilterEnabled;
    this.interactionChanged.emit();
  }

  /**
   * Dimension fields eligible for the drill stack — every non-numeric
   * field (categories / dates). Numeric measures aren't drill levels.
   * Shaped as { label, value } for the multiselect; value = columnToUse.
   */
  get drillDimensionOptions(): { label: string; value: string }[] {
    return (this.allFields || [])
      .filter((f: any) => toFieldKind(f?.dataType) === 'dimension')
      .map((f: any) => ({
        label: f.columnToView || f.columnToUse,
        value: f.columnToUse || f.columnToView,
      }))
      .filter(o => !!o.value);
  }

  /** Current drill dimensions (ordered) for the multiselect model. */
  get drillDimensions(): string[] {
    return this.focusedVisual?.drillDimensions ?? [];
  }

  /** Persist a new drill-dimension selection onto the visual. */
  onDrillDimensionsChange(cols: string[]): void {
    if (!this.focusedVisual) return;
    this.focusedVisual.drillDimensions = Array.isArray(cols) ? cols : [];
    this.interactionChanged.emit();
  }

  // ─── On-pill encoding menu (Wave 7, feature 5) ──────────────────────
  //
  // A placed field "pill" in a scalar role slot is clickable → an overlay
  // popover (appendTo=body) with: aggregation (the app's aggregate set),
  // sort (asc / desc / none by this field), open-format shortcut, and
  // remove-from-well. All writes land on the focused visual's encoding /
  // config; the parent captures undo (encodingWillChange) then re-transforms
  // (encodingChanged). Token-driven, i18n, OnPush-safe. Generalised — no
  // assumption about the column's meaning.

  /** The role whose pill menu is currently open (null = closed). */
  pillMenuRole: RoleKey | null = null;

  /**
   * Aggregate-function options for the pill menu. DB-driven (family
   * aggregate_fn) with an i18n-keyed fallback so it renders immediately,
   * mirroring the config sidebar. Includes the UI-only NONE (value '').
   */
  aggregateOptions: { label: string; value: AggregateFn | '' }[] = [];
  private readonly aggregateOptionsRaw: {
    label: string;
    value: AggregateFn | '';
  }[] = [
    { label: 'ANALYSES.AGG.NONE', value: '' },
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

  /** Resolve the aggregate option labels against the active locale. */
  private localizeAggregateOptions(): void {
    this.aggregateOptions = this.aggregateOptionsRaw.map(o => ({
      value: o.value,
      label: this.translate.instant(o.label),
    }));
  }

  /** Overwrite the fallback aggregate list with DB rows once resolved. */
  private loadAggregateOptions(): void {
    this.referenceData.getFamily('aggregate_fn').subscribe(rows => {
      if (!rows.length) return;
      const dbOptions = rows.map(r => ({
        label: r.label,
        value: r.code as AggregateFn,
      }));
      this.aggregateOptions = [
        { label: this.translate.instant('ANALYSES.AGG.NONE'), value: '' },
        ...dbOptions,
      ];
      this.cdr.markForCheck();
    });
  }

  /**
   * Roles that carry a MEASURE (a quantity you aggregate). The aggregation
   * section of the pill menu only applies to these; category/dimension pills
   * show sort + format + remove only.
   */
  private static readonly MEASURE_ROLES: ReadonlySet<RoleKey> =
    new Set<RoleKey>(['yAxis', 'zAxis', 'valueColumns', 'sample']);

  /** True when the pill's role is a measure (aggregation applies). */
  isMeasureRole(role: RoleKey): boolean {
    return VisualsChartSidebarComponent.MEASURE_ROLES.has(role);
  }

  /**
   * Soft inline hint (issue #2): true when a MEASURE slot holds a field whose
   * BE semanticType marks it non-aggregatable — a geographic coordinate
   * (SUM(longitude) is nonsense), or a field flagged doNotAggregate. Drives a
   * subtle warning chip in the well; it never blocks — the author can still
   * aggregate if they mean to. GENERALISED via field metadata, not column
   * names, so it holds for any dataset.
   */
  showNonAggregatableHint(role: RoleKey): boolean {
    if (!this.isMeasureRole(role)) return false;
    const col = this.asScalar(this.getRoleValue(role));
    if (!col) return false;
    const field = findFieldByColumn(col, this.allFields);
    return isNonAggregatableMeasure(field);
  }

  /** Open the pill menu for a scalar role via the overlay panel. */
  openPillMenu(role: RoleKey, event: Event, op: any): void {
    event.stopPropagation();
    this.pillMenuRole = role;
    op.toggle(event);
  }

  /** The aggregate currently set on the focused visual ('' = none). */
  get currentAggregate(): AggregateFn | '' {
    return (this.focusedVisual as any)?.aggregate ?? '';
  }

  /**
   * Apply an aggregate to the focused visual from the pill menu. Writes
   * `aggregate` + the dimension/measure columns the server-side aggregation
   * encoding expects (dimension = xAxisColumn, measure = the pill's column),
   * or clears them when NONE is picked. Fires will-change (undo) then changed.
   */
  setPillAggregate(agg: AggregateFn | '', op?: any): void {
    const v = this.focusedVisual as any;
    if (!v) return;
    this.encodingWillChange.emit();
    if (agg === '') {
      v.aggregate = null;
      v.dimensionColumn = null;
      v.measureColumn = null;
    } else {
      v.aggregate = agg;
      // Dimension = the category (x) axis; measure = the value (y) axis. This
      // is the same encoding the config sidebar / transformer read.
      v.dimensionColumn = v.xAxisColumn ?? v.dimensionColumn ?? null;
      v.measureColumn = v.yAxisColumn ?? v.measureColumn ?? null;
    }
    op?.hide();
    this.encodingChanged.emit();
  }

  /**
   * The sort axis this pill's role maps to: a MEASURE pill sorts by the
   * measure value ('measure'); a dimension/category pill sorts by the axis
   * category ('axis'). Matches the config sidebar's VISUAL_SORT_BY_OPTIONS so
   * both surfaces write the SAME config keys the shared applySortAndLimit
   * builder already consumes (config.sortBy / config.sortDir).
   */
  private sortByForRole(role: RoleKey): 'axis' | 'measure' {
    return this.isMeasureRole(role) ? 'measure' : 'axis';
  }

  /**
   * The pill's current sort direction, or 'none' when the visual isn't sorted
   * by THIS pill's axis. Reads config.sortBy / config.sortDir.
   */
  currentSortDir(role: RoleKey): 'asc' | 'desc' | 'none' {
    const cfg = (this.focusedVisual as any)?.config;
    if (!cfg) return 'none';
    if ((cfg.sortBy ?? 'none') !== this.sortByForRole(role)) return 'none';
    return cfg.sortDir === 'asc' ? 'asc' : 'desc';
  }

  /**
   * Set the sort applied by a field's pill. Writes the shared config.sortBy
   * ('axis' | 'measure' | 'none') + config.sortDir ('asc' | 'desc') that the
   * transform pipeline's applySortAndLimit reads — no bespoke sort key.
   * 'none' clears sorting. Generalised over any column.
   */
  setPillSort(role: RoleKey, direction: 'asc' | 'desc' | 'none', op?: any): void {
    const v = this.focusedVisual as any;
    if (!v) return;
    this.encodingWillChange.emit();
    if (!v.config) v.config = {};
    if (direction === 'none') {
      v.config = { ...v.config, sortBy: 'none' };
    } else {
      v.config = {
        ...v.config,
        sortBy: this.sortByForRole(role),
        sortDir: direction,
      };
    }
    op?.hide();
    this.encodingChanged.emit();
  }

  /** Remove the field bound to a role from its well (pill menu action). */
  removePillField(role: RoleKey, op?: any): void {
    if (!this.focusedVisual) return;
    this.encodingWillChange.emit();
    this.clearRoleOnVisual(this.focusedVisual, role);
    op?.hide();
    // Reuse the existing cleared path so the parent re-transforms.
    this.axisFieldCleared.emit();
  }

  /**
   * Format shortcut — the pill menu's "Format…" opens the format editor for
   * this field. The rich format controls live in the config sidebar (Wave 3),
   * so we surface the field for the author and emit interactionChanged, which
   * the parent already routes to open/refresh the config surface. Kept a
   * light hook so the two panels stay decoupled.
   */
  openPillFormat(role: RoleKey, op?: any): void {
    op?.hide();
    // Signal the parent (which owns the config sidebar) that the author wants
    // to format this visual; the parent opens the format panel. No mutation.
    this.formatRequested.emit();
  }

  /** Asks the parent to open the format (config) sidebar for the focused visual. */
  @Output() formatRequested = new EventEmitter<void>();

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: any): any {
    return item.id;
  }
}
