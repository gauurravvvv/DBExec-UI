import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AnalysesService } from '../../../modules/analyses/service/analyses.service';

@Component({
  selector: 'app-analysis-filter-bar',
  templateUrl: './analysis-filter-bar.component.html',
  styleUrls: ['./analysis-filter-bar.component.scss'],
})
export class AnalysisFilterBarComponent implements OnInit {
  @Input() orgId!: string;
  @Input() analysisId!: string;
  @Output() filtersApplied = new EventEmitter<any[]>();
  @Output() filtersCleared = new EventEmitter<void>();

  filters: any[] = [];
  filterValues: { [filterId: string]: any[] } = {};
  appliedValues: { [filterId: string]: any } = {};
  isLoading = false;

  constructor(private analysesService: AnalysesService) {}

  ngOnInit(): void {
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
      if (res?.status) {
        this.filters = (res.data || []).filter((f: any) => f.isEnabled);
        // Load live options FIRST, then validate defaults against them
        await this.loadAllFilterValues();
        this.initializeDefaults();
      }
    } catch (err) {
      console.error('Failed to load filters', err);
    } finally {
      this.isLoading = false;
    }
  }

  async loadAllFilterValues(): Promise<void> {
    const dropdownFilters = this.filters.filter(
      f => f.controlType === 'dropdown' || f.controlType === 'list',
    );
    const promises = dropdownFilters.map(async f => {
      try {
        const res: any = await this.analysesService.getFilterValues(
          this.orgId,
          f.id,
        );
        if (res?.status) {
          this.filterValues[f.id] = (res.data || []).map((v: any) => ({
            label: String(v),
            value: String(v),
          }));
        }
      } catch (err) {
        console.error(`Failed to load values for filter ${f.name}`, err);
      }
    });
    await Promise.all(promises);
  }

  /**
   * Validates and sets defaults from filter config against live dropdown options.
   * - Category defaults are matched case-insensitively against live values
   * - Stale/missing defaults are silently dropped
   * - Array defaults on single-select (dropdown) take the first valid match
   * - Numeric defaults are type-coerced to numbers
   */
  private initializeDefaults(): void {
    for (const f of this.filters) {
      const config = f.config || {};

      if (f.filterType === 'category' && config.defaultValue) {
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
   * Validates category defaults against live dropdown/multiselect options.
   * Uses case-insensitive matching and resolves to the exact-case live value.
   */
  private initializeCategoryDefault(filter: any, config: any): void {
    const liveOptions = this.filterValues[filter.id] || [];
    // Build a lookup map: lowercase → exact-case live value
    const liveLookup = new Map<string, string>();
    for (const opt of liveOptions) {
      liveLookup.set(String(opt.value).toLowerCase(), opt.value);
    }

    // Normalize defaults to string array regardless of config shape
    const rawDefaults = Array.isArray(config.defaultValue)
      ? config.defaultValue
      : [config.defaultValue];
    const stringDefaults = rawDefaults.map((d: any) => String(d));

    // Match against live options (case-insensitive), resolve to exact case
    const validDefaults = stringDefaults
      .map((d: string) => liveLookup.get(d.toLowerCase()))
      .filter((v: string | undefined): v is string => v !== undefined);

    if (validDefaults.length === 0) return;

    if (filter.controlType === 'dropdown') {
      // Single-select: use first valid match
      this.appliedValues[filter.id] = validDefaults[0];
    } else if (filter.controlType === 'list') {
      // Multi-select: use all valid matches
      this.appliedValues[filter.id] = validDefaults;
    }
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
