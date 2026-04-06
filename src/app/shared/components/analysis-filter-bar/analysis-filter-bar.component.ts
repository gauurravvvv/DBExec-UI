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
    try {
      const res: any = await this.analysesService.listFilters(
        this.orgId,
        this.analysisId,
      );
      if (res?.status) {
        this.filters = (res.data || []).filter((f: any) => f.isEnabled);
        this.initializeDefaults();
        this.loadAllFilterValues();
      }
    } catch (err) {
      console.error('Failed to load filters', err);
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

  private initializeDefaults(): void {
    for (const f of this.filters) {
      const config = f.config || {};
      if (f.filterType === 'category' && config.defaultValue) {
        this.appliedValues[f.id] = config.defaultValue;
      } else if (f.filterType === 'numeric_equality' && config.defaultValue != null) {
        this.appliedValues[f.id] = config.defaultValue;
      } else if (f.filterType === 'numeric_range' && (config.rangeMin != null || config.rangeMax != null)) {
        this.appliedValues[f.id] = [config.rangeMin ?? 0, config.rangeMax ?? 100];
      } else if (f.filterType === 'time_equality' && config.defaultValue) {
        this.appliedValues[f.id] = new Date(config.defaultValue);
      } else if (f.filterType === 'time_range') {
        const dates: Date[] = [];
        if (config.dateRangeStart) dates.push(new Date(config.dateRangeStart));
        if (config.dateRangeEnd) dates.push(new Date(config.dateRangeEnd));
        if (dates.length > 0) this.appliedValues[f.id] = dates;
      }
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
            base.dateRangeStart = val[0] instanceof Date ? val[0].toISOString() : val[0];
            base.dateRangeEnd = val[1] instanceof Date ? val[1].toISOString() : val[1];
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
