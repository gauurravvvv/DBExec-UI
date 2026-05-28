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
  ) {}

  ngOnInit(): void {
    this.langSubscription = this.translate.onLangChange.subscribe(() => {
      // The chart-category cache groups chart cards by their `category`
      // key — a translation-key string, identical across locales — so
      // it doesn't need rebuilding. We just need a CD pass so the pipe
      // re-evaluates against the new language.
      this.cdr.markForCheck();
    });
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
  @Output() chartTypeSelected = new EventEmitter<void>();
  @Output() axisSelectionStarted = new EventEmitter<RoleKey | null>();
  @Output() axisFieldCleared = new EventEmitter<void>();

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

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: any): any {
    return item.id;
  }
}
