import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AnalysesService } from '../../../modules/analyses/services/analyses.service';
import {
  FilterOption,
  FilterOptionsCacheService,
  FilterValuesResult,
} from '../../../modules/analyses/services/filter-options-cache.service';

/**
 * Per-filter UI state — what the template branches on. The bar's
 * internal `state` map and the host-driven `filterStates` input both
 * use this shape so the template doesn't have to discriminate
 * sources.
 */
export interface FilterUiState {
  options: FilterOption[];
  total: number;
  totalApproximate: boolean;
  truncated: boolean;
  staleSelectedValues: string[];
  columnMissing: boolean;
  errorMessage: string | null;
  loading: boolean;
}

/**
 * Closure shape for host-supplied dropdown fetchers. Matches
 * app-custom-dropdown's serverMode contract.
 */
export type FilterFetcher = (args: {
  search: string;
  page: number;
  limit: number;
}) => Promise<{ items: FilterOption[]; total: number }>;

/**
 * AnalysisFilterBar — runs in two modes:
 *
 *  hosted (preferred): caller passes `[filters]`, `[filterStates]`,
 *    and `[fetcherFor]` from a store-backed parent. The bar becomes
 *    purely presentational — owns only the user's in-flight
 *    selections (appliedValues, ephemeral form state) and emits
 *    filtersApplied / filtersCleared events upward.
 *
 *  service (legacy): no inputs beyond orgId / analysisId. The bar
 *    talks to AnalysesService + FilterOptionsCacheService directly,
 *    same as before the store landed.
 *
 * Mode is auto-detected: presence of `[filters]` switches to hosted
 * mode. The two paths coexist so individual host components can
 * migrate to the store on their own schedule.
 */
@Component({
  selector: 'app-analysis-filter-bar',
  templateUrl: './analysis-filter-bar.component.html',
  styleUrls: ['./analysis-filter-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisFilterBarComponent implements OnInit, OnChanges {
  // ── Shared inputs ────────────────────────────────────────────────
  @Input() orgId!: string;
  @Input() analysisId!: string;
  @Output() filtersApplied = new EventEmitter<any[]>();
  @Output() filtersCleared = new EventEmitter<void>();

  // ── Hosted-mode inputs ───────────────────────────────────────────
  /** When present, switches into hosted mode and the bar stops calling
   *  AnalysesService.listFilters / cache.open itself. */
  @Input() filters: any[] | null = null;
  /** Per-filter UI state keyed by filter id. */
  @Input() filterStates: Record<string, FilterUiState> | null = null;
  /** Host-supplied fetcher closure factory. The bar passes this
   *  straight to app-custom-dropdown's [fetcher] binding. */
  @Input() fetcherFactory: ((filter: any) => FilterFetcher) | null = null;
  /** Host-supplied "dismiss stale chip" handler — keeps stale-chip
   *  state in the store (a dispatch) instead of local. */
  @Input() onDismissStale: ((filter: any, value: string) => void) | null =
    null;

  // ── Service-mode internal state ──────────────────────────────────
  internalFilters: any[] = [];
  internalState: Record<string, FilterUiState> = {};

  // ── Form state — always local, both modes ───────────────────────
  appliedValues: { [filterId: string]: any } = {};
  isLoading = false;

  constructor(
    private analysesService: AnalysesService,
    private optionsCache: FilterOptionsCacheService,
    private cdr: ChangeDetectorRef,
  ) {}

  /** True while the bar should rely on its own service/cache calls
   *  rather than the host-supplied inputs. */
  get serviceMode(): boolean {
    return this.filters === null;
  }

  /** Resolved filter list for the template — host inputs override
   *  service-mode internal state when present. */
  get visibleFilters(): any[] {
    return this.serviceMode ? this.internalFilters : this.filters ?? [];
  }

  /** Per-filter state in whichever mode is active. */
  private resolveState(filterId: string): FilterUiState | null {
    if (this.serviceMode) return this.internalState[filterId] ?? null;
    return this.filterStates?.[filterId] ?? null;
  }

  ngOnInit(): void {
    if (this.serviceMode) this.loadFilters();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Host swapped the analysis or the filter list — drop any in-flight
    // selections so we don't apply stale values to the new analysis.
    if (changes['analysisId'] && !changes['analysisId'].firstChange) {
      this.appliedValues = {};
    }
    if (changes['filters'] && this.filters) {
      // When the host hands us new filters, sync defaults from each
      // filter's saved config. The host has already validated stale
      // values before populating filterStates.
      this.initializeDefaultsFromHosted();
    }
  }

  /** Force-clear the options cache and reload (service mode only).
   *  Hosted callers dispatch invalidateAnalysis instead. */
  refresh(): void {
    if (!this.serviceMode) return;
    this.optionsCache.clear();
    this.loadFilters();
  }

  // ── Service-mode load ─────────────────────────────────────────────
  async loadFilters(): Promise<void> {
    if (!this.orgId || !this.analysisId) return;
    this.isLoading = true;
    try {
      const { filters, warmed } = await this.optionsCache.open(
        this.analysisId,
      );
      this.internalFilters = (filters || []).filter((f: any) => f.isEnabled);

      for (const f of this.internalFilters) {
        this.internalState[f.id] = {
          options: [],
          total: 0,
          totalApproximate: false,
          truncated: false,
          staleSelectedValues: [],
          columnMissing: false,
          errorMessage: null,
          loading: false,
        };
      }

      const dropdownFilters = this.internalFilters.filter(
        f => f.controlType === 'dropdown' || f.controlType === 'list',
      );
      if (warmed && dropdownFilters.length) {
        for (const f of dropdownFilters) {
          const result = await this.optionsCache.get(this.analysisId, f.id);
          this.applyResultToInternalState(f.id, result);
        }
      }

      this.initializeDefaultsFromInternal();
    } catch (err) {
      console.error('Failed to load filters', err);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Service-mode fetcher closure — proxies the dropdown's serverMode
   *  calls through the in-process cache so paging + search work
   *  without an extra trip. */
  fetcherFor(filter: any): FilterFetcher {
    // Hosted mode delegates to the host's fetcherFactory.
    if (!this.serviceMode && this.fetcherFactory) {
      return this.fetcherFactory(filter);
    }
    return async (args: { search: string; page: number; limit: number }) => {
      const result = await this.optionsCache.get(this.analysisId, filter.id, {
        search: args.search || undefined,
        page: args.page,
        pageSize: args.limit,
      });
      this.applyResultToInternalState(filter.id, result);
      if (!result.ok) return { items: [], total: 0 };
      return { items: result.values, total: result.total };
    };
  }

  private applyResultToInternalState(
    filterId: string,
    result: FilterValuesResult,
  ): void {
    const s = this.internalState[filterId];
    if (!s) return;
    if (result.ok) {
      s.options = result.values;
      s.total = result.total;
      s.totalApproximate = result.totalApproximate;
      s.truncated = result.truncated;
      s.columnMissing = false;
      s.errorMessage = null;
    } else {
      s.options = [];
      s.total = 0;
      s.totalApproximate = false;
      s.truncated = false;
      s.columnMissing = result.error === 'column_missing';
      s.errorMessage = result.message || null;
    }
  }

  // ── Default initialisation ───────────────────────────────────────
  /** Service-mode wrapper around initializeDefaults — reads the bar's
   *  internal state. */
  private initializeDefaultsFromInternal(): void {
    this.initializeDefaults(filter => this.internalState[filter.id]);
  }

  /** Hosted-mode wrapper. Note: in hosted mode the host has already
   *  computed staleSelectedValues, so the bar only needs to apply the
   *  present values to appliedValues. */
  private initializeDefaultsFromHosted(): void {
    this.initializeDefaults(filter => this.filterStates?.[filter.id] ?? null);
  }

  private initializeDefaults(
    stateAccessor: (filter: any) => FilterUiState | null,
  ): void {
    for (const f of this.visibleFilters) {
      const config = f.config || {};

      if (f.filterType === 'category' && config.defaultValue != null) {
        this.initializeCategoryDefault(f, config, stateAccessor);
      } else if (
        f.filterType === 'numeric_equality' &&
        config.defaultValue != null
      ) {
        this.appliedValues[f.id] = Number(config.defaultValue);
      } else if (
        f.filterType === 'numeric_range' &&
        (config.rangeMin != null || config.rangeMax != null)
      ) {
        this.appliedValues[f.id] = [
          Number(config.rangeMin ?? 0),
          Number(config.rangeMax ?? 100),
        ];
      } else if (f.filterType === 'time_equality' && config.defaultValue) {
        const d = new Date(config.defaultValue);
        if (!isNaN(d.getTime())) this.appliedValues[f.id] = d;
      } else if (f.filterType === 'time_range') {
        const dates: Date[] = [];
        if (config.dateRangeStart) {
          const d = new Date(config.dateRangeStart);
          if (!isNaN(d.getTime())) dates.push(d);
        }
        if (config.dateRangeEnd) {
          const d = new Date(config.dateRangeEnd);
          if (!isNaN(d.getTime())) dates.push(d);
        }
        if (dates.length > 0) this.appliedValues[f.id] = dates;
      }
    }
  }

  private initializeCategoryDefault(
    filter: any,
    config: any,
    stateAccessor: (filter: any) => FilterUiState | null,
  ): void {
    const s = stateAccessor(filter);
    if (!s) return;
    // Case- AND whitespace-insensitive lookup: 'Marketing ' (saved
    // with a trailing space) should still match live 'Marketing'.
    // Mirrors the BE probe's LOWER(TRIM(...)) comparison so the two
    // sides agree on what counts as stale.
    const liveLookup = new Map<string, string | number>();
    for (const opt of s.options) {
      if (opt.value === null || opt.value === undefined) continue;
      liveLookup.set(String(opt.value).trim().toLowerCase(), opt.value);
    }
    const rawDefaults = Array.isArray(config.defaultValue)
      ? config.defaultValue
      : [config.defaultValue];
    const stringDefaults = rawDefaults
      .filter((d: any) => d !== null && d !== undefined && d !== '')
      .map((d: any) => String(d));
    const present: (string | number)[] = [];
    const stale: string[] = [];
    for (const d of stringDefaults) {
      const hit = liveLookup.get(d.trim().toLowerCase());
      if (hit !== undefined) present.push(hit);
      else stale.push(d);
    }
    // In service mode we own staleSelectedValues; in hosted mode the
    // host has already populated it via the store, so we don't write
    // here.
    if (this.serviceMode) s.staleSelectedValues = stale;
    if (present.length === 0) return;
    if (filter.controlType === 'dropdown') {
      this.appliedValues[filter.id] = present[0];
    } else if (filter.controlType === 'list') {
      this.appliedValues[filter.id] = present;
    }
  }

  /** Template helper — exposes per-filter state regardless of mode. */
  stateFor(filter: any): FilterUiState | null {
    return this.resolveState(filter.id);
  }

  optionsFor(filter: any): FilterOption[] {
    return this.stateFor(filter)?.options || [];
  }

  truncatedFor(filter: any): boolean {
    return !!this.stateFor(filter)?.truncated;
  }

  totalFor(filter: any): number {
    return this.stateFor(filter)?.total || 0;
  }

  hasStaleValues(filter: any): boolean {
    return !!this.stateFor(filter)?.staleSelectedValues.length;
  }

  staleValuesFor(filter: any): string[] {
    return this.stateFor(filter)?.staleSelectedValues || [];
  }

  isColumnMissing(filter: any): boolean {
    return !!this.stateFor(filter)?.columnMissing;
  }

  removeStaleValue(filter: any, value: string): void {
    if (this.onDismissStale) {
      // Hosted mode — bubble up so the host can dispatch.
      this.onDismissStale(filter, value);
      return;
    }
    // Service mode — mutate the bar's own state.
    const s = this.internalState[filter.id];
    if (!s) return;
    s.staleSelectedValues = s.staleSelectedValues.filter(v => v !== value);
    this.cdr.markForCheck();
  }

  trackById(_index: number, item: any): any {
    return item.id;
  }

  onFilterChange(filter: any, value: any): void {
    this.appliedValues[filter.id] = value;
  }

  applyFilters(): void {
    const applied = this.visibleFilters
      .filter(f => {
        const val = this.appliedValues[f.id];
        return (
          val !== undefined &&
          val !== null &&
          val !== '' &&
          !(Array.isArray(val) && val.length === 0)
        );
      })
      .map(f => {
        const val = this.appliedValues[f.id];
        const base: any = {
          filterId: f.id,
          columnName: f.columnName,
          filterType: f.filterType,
          operator:
            f.config?.matchOperator || this.getDefaultOperator(f.filterType),
          nullOption: f.nullOption || 'ALL_VALUES',
        };

        if (f.filterType === 'category') {
          base.values = Array.isArray(val) ? val : [val];
        } else if (
          f.filterType === 'numeric_range' ||
          f.filterType === 'numeric_equality'
        ) {
          if (Array.isArray(val) && val.length === 2) {
            base.rangeMin = val[0];
            base.rangeMax = val[1];
            base.operator = 'BETWEEN';
          } else if (typeof val === 'object' && val.min !== undefined) {
            base.rangeMin = val.min;
            base.rangeMax = val.max;
            base.operator = 'BETWEEN';
          } else {
            base.values = [val];
          }
        } else if (
          f.filterType === 'time_range' ||
          f.filterType === 'time_equality'
        ) {
          // PrimeNG range mode emits [start, null] while the user is
          // mid-selection. Skip half-formed ranges so the chart
          // doesn't re-query on an unfinished selection.
          if (
            Array.isArray(val) &&
            val.length === 2 &&
            val[0] != null &&
            val[1] != null
          ) {
            base.dateRangeStart =
              val[0] instanceof Date ? val[0].toISOString() : val[0];
            base.dateRangeEnd =
              val[1] instanceof Date ? val[1].toISOString() : val[1];
            base.operator = 'BETWEEN';
          } else if (!Array.isArray(val) && val != null && val !== '') {
            const dateVal = val instanceof Date ? val.toISOString() : val;
            base.values = [dateVal];
          } else {
            base._skip = true;
          }
        }

        return base;
      })
      .filter(b => !b._skip);

    this.filtersApplied.emit(applied);
  }

  clearFilters(): void {
    this.appliedValues = {};
    if (this.serviceMode) {
      for (const f of this.internalFilters) {
        const s = this.internalState[f.id];
        if (s) s.staleSelectedValues = [];
      }
    }
    this.filtersCleared.emit();
  }

  getDefaultOperator(filterType: string): string {
    switch (filterType) {
      case 'category':
      case 'numeric_equality':
      case 'time_equality':
        return 'EQUALS';
      case 'numeric_range':
      case 'time_range':
        return 'BETWEEN';
      default:
        return 'EQUALS';
    }
  }

  get hasActiveFilters(): boolean {
    return Object.keys(this.appliedValues).some(key => {
      const val = this.appliedValues[key];
      return (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        !(Array.isArray(val) && val.length === 0)
      );
    });
  }
}
