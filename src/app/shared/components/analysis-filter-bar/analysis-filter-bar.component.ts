import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { AnalysesService } from '../../../modules/analyses/services/analyses.service';
import {
  FilterOption,
  FilterOptionsCacheService,
  FilterValuesResult,
} from '../../../modules/analyses/services/filter-options-cache.service';

/**
 * Per-filter UI state. `staleSelectedValues` holds saved values that
 * are no longer in the source data — surfaced as warning chips so
 * the user knows what's silently disappearing, instead of having it
 * silently disappear. `columnMissing` is set when the BE returned
 * `error: column_missing` for this filter, triggering an actionable
 * empty-state in the template.
 */
interface FilterUiState {
  options: FilterOption[];
  total: number;
  totalApproximate: boolean;
  truncated: boolean;
  staleSelectedValues: string[];
  columnMissing: boolean;
  errorMessage: string | null;
  loading: boolean;
}

@Component({
  selector: 'app-analysis-filter-bar',
  templateUrl: './analysis-filter-bar.component.html',
  styleUrls: ['./analysis-filter-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisFilterBarComponent implements OnInit {
  @Input() orgId!: string;
  @Input() analysisId!: string;
  @Output() filtersApplied = new EventEmitter<any[]>();
  @Output() filtersCleared = new EventEmitter<void>();

  filters: any[] = [];
  /** Per-filter UI state keyed by filter id. Replaces the previous
   *  pair of bare options + selection maps so all per-filter UI
   *  concerns (options, staleness, error, loading) live in one slot. */
  state: Record<string, FilterUiState> = {};
  appliedValues: { [filterId: string]: any } = {};
  isLoading = false;

  constructor(
    private analysesService: AnalysesService,
    private optionsCache: FilterOptionsCacheService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadFilters();
  }

  /** Force-clear the options cache and reload. Wire to the dataset
   *  Refresh Data button. */
  refresh(): void {
    this.optionsCache.clear();
    this.loadFilters();
  }

  async loadFilters(): Promise<void> {
    if (!this.orgId || !this.analysisId) return;
    this.isLoading = true;
    try {
      const res: any = await this.analysesService.listFilters(
        this.orgId,
        this.analysisId,
      );
      if (!res?.status) return;

      this.filters = (res.data || []).filter((f: any) => f.isEnabled);

      // Seed per-filter state so the template can render shells
      // without an extra null check.
      for (const f of this.filters) {
        this.state[f.id] = {
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

      const dropdownFilters = this.filters.filter(
        f => f.controlType === 'dropdown' || f.controlType === 'list',
      );

      if (dropdownFilters.length) {
        // One batched call populates every dropdown's first page —
        // see FilterOptionsCacheService.prefetch for the coalesce
        // logic. Subsequent .get() calls below read from the warm
        // cache instead of refetching.
        await this.optionsCache.prefetch(
          this.analysisId,
          dropdownFilters.map(f => f.id),
        );
        for (const f of dropdownFilters) {
          const result = await this.optionsCache.get(this.analysisId, f.id);
          this.applyResultToState(f.id, result);
        }
      }

      this.initializeDefaults();
    } catch (err) {
      console.error('Failed to load filters', err);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Build a fetcher closure compatible with app-custom-dropdown's
   * server-mode contract. The dropdown calls this on panel open,
   * filter-text change, and near-end scroll — pagination and search
   * just work, backed by the same cache the eager prefetch uses.
   *
   * Returned items use the {value,label} shape; total comes straight
   * from the BE response.
   */
  fetcherFor(filter: any) {
    return async (args: { search: string; page: number; limit: number }) => {
      const result = await this.optionsCache.get(
        this.analysisId,
        filter.id,
        {
          search: args.search || undefined,
          page: args.page,
          pageSize: args.limit,
        },
      );
      // Reflect result state on the local UI slot so column-missing
      // and staleness paths still react when the user interacts.
      this.applyResultToState(filter.id, result);
      if (!result.ok) return { items: [], total: 0 };
      return { items: result.values, total: result.total };
    };
  }

  private applyResultToState(
    filterId: string,
    result: FilterValuesResult,
  ): void {
    const s = this.state[filterId];
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

  /**
   * Apply saved defaults to appliedValues; split saved values that
   * aren't in current options into a separate staleSelectedValues
   * bucket so the template can surface warning chips instead of
   * silently dropping them.
   */
  private initializeDefaults(): void {
    for (const f of this.filters) {
      const config = f.config || {};

      if (f.filterType === 'category' && config.defaultValue != null) {
        this.initializeCategoryDefault(f, config);
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
        if (!isNaN(d.getTime())) {
          this.appliedValues[f.id] = d;
        }
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

  /**
   * Case-insensitive match of saved defaults against live options.
   * Present matches go into appliedValues; missing ones go into
   * staleSelectedValues for the warning-chip render path.
   */
  private initializeCategoryDefault(filter: any, config: any): void {
    const s = this.state[filter.id];
    if (!s) return;

    const liveLookup = new Map<string, string | number>();
    for (const opt of s.options) {
      if (opt.value === null || opt.value === undefined) continue;
      liveLookup.set(String(opt.value).toLowerCase(), opt.value);
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
      const hit = liveLookup.get(d.toLowerCase());
      if (hit !== undefined) present.push(hit);
      else stale.push(d);
    }

    s.staleSelectedValues = stale;

    if (present.length === 0) return;
    if (filter.controlType === 'dropdown') {
      this.appliedValues[filter.id] = present[0];
    } else if (filter.controlType === 'list') {
      this.appliedValues[filter.id] = present;
    }
  }

  /** Drop one stale chip from the warning row. Doesn't touch BE — the
   *  warning is presentational; users either accept the stale value
   *  (chart returns zero rows for it) or edit the filter to fix the
   *  saved config. */
  removeStaleValue(filter: any, value: string): void {
    const s = this.state[filter.id];
    if (!s) return;
    s.staleSelectedValues = s.staleSelectedValues.filter(v => v !== value);
    this.cdr.markForCheck();
  }

  hasStaleValues(filter: any): boolean {
    return !!this.state[filter.id]?.staleSelectedValues.length;
  }

  isColumnMissing(filter: any): boolean {
    return !!this.state[filter.id]?.columnMissing;
  }

  optionsFor(filter: any): FilterOption[] {
    return this.state[filter.id]?.options || [];
  }

  truncatedFor(filter: any): boolean {
    return !!this.state[filter.id]?.truncated;
  }

  totalFor(filter: any): number {
    return this.state[filter.id]?.total || 0;
  }

  trackById(_index: number, item: any): any {
    return item.id;
  }

  onFilterChange(filter: any, value: any): void {
    this.appliedValues[filter.id] = value;
  }

  applyFilters(): void {
    const applied = this.filters
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
          if (Array.isArray(val) && val.length === 2) {
            base.dateRangeStart =
              val[0] instanceof Date ? val[0].toISOString() : val[0];
            base.dateRangeEnd =
              val[1] instanceof Date ? val[1].toISOString() : val[1];
            base.operator = 'BETWEEN';
          } else {
            const dateVal = val instanceof Date ? val.toISOString() : val;
            base.values = [dateVal];
          }
        }

        return base;
      });

    this.filtersApplied.emit(applied);
  }

  clearFilters(): void {
    this.appliedValues = {};
    // Stale chips are presentational only; they vanish along with
    // the selection state when the user clicks Clear.
    for (const f of this.filters) {
      const s = this.state[f.id];
      if (s) s.staleSelectedValues = [];
    }
    this.filtersCleared.emit();
  }

  getDefaultOperator(filterType: string): string {
    switch (filterType) {
      case 'category':
        return 'EQUALS';
      case 'numeric_equality':
        return 'EQUALS';
      case 'numeric_range':
        return 'BETWEEN';
      case 'time_equality':
        return 'EQUALS';
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
