import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { AnalysesService } from '../../service/analyses.service';

export interface ConfiguredFilter {
  tempId: string;
  name: string;
  columnName: string;
  filterType: string;
  controlType: string;
  config: any;
  nullOption: string;
  isEnabled: boolean;
  isMandatory: boolean;
  sequence: number;
}

export const FILTER_OPERATORS: Record<
  string,
  { label: string; value: string }[]
> = {
  category: [
    { label: 'Equals', value: 'EQUALS' },
    { label: 'Does Not Equal', value: 'DOES_NOT_EQUAL' },
    { label: 'Contains', value: 'CONTAINS' },
    { label: 'Does Not Contain', value: 'DOES_NOT_CONTAIN' },
    { label: 'Starts With', value: 'STARTS_WITH' },
    { label: 'Ends With', value: 'ENDS_WITH' },
  ],
  numeric_equality: [
    { label: 'Equals', value: 'EQUALS' },
    { label: 'Not Equals', value: 'NOT_EQUALS' },
    { label: 'Greater Than', value: 'GREATER_THAN' },
    { label: 'Greater Than or Equal', value: 'GREATER_THAN_OR_EQUAL' },
    { label: 'Less Than', value: 'LESS_THAN' },
    { label: 'Less Than or Equal', value: 'LESS_THAN_OR_EQUAL' },
  ],
  numeric_range: [{ label: 'Between', value: 'BETWEEN' }],
  time_equality: [
    { label: 'Equals', value: 'EQUALS' },
    { label: 'Before', value: 'BEFORE' },
    { label: 'After', value: 'AFTER' },
  ],
  time_range: [{ label: 'Between', value: 'BETWEEN' }],
};

export const NULL_OPTIONS = [
  { label: 'All Values', value: 'ALL_VALUES' },
  { label: 'Non-Nulls Only', value: 'NON_NULLS_ONLY' },
  { label: 'Nulls Only', value: 'NULLS_ONLY' },
];

export const DATE_FORMAT_OPTIONS = [
  { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
  { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
  { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
  { label: 'DD-MM-YYYY', value: 'dd-mm-yy' },
  { label: 'MM-DD-YYYY', value: 'mm-dd-yy' },
  { label: 'YYYY/MM/DD', value: 'yy/mm/dd' },
  { label: 'DD.MM.YYYY', value: 'dd.mm.yy' },
];

@Component({
  selector: 'app-filter-dialog',
  templateUrl: './filter-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterDialogComponent implements OnChanges {
  @Input() visible: boolean = false;
  @Input() editingFilter: ConfiguredFilter | null = null;
  @Input() datasetFields: any[] = [];
  @Input() datasetId: string = '';
  @Input() orgId: string = '';
  @Input() analysisId: string = '';
  @Input() configuredFiltersCount: number = 0;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  // Form fields
  filterDialogColumn: any = null;
  filterDialogType: string = '';
  filterDialogControl: string = '';
  filterDialogName: string = '';
  filterDialogEnabled: boolean = true;
  filterDialogMandatory: boolean = false;
  filterDialogOperator: string = '';
  filterDialogNullOption: string = 'ALL_VALUES';
  filterDialogDefaultValue: any = null;
  filterDialogPlaceholder: string = '';
  filterDialogIncludeTime: boolean = false;
  filterDialogDateFormat: string = 'yy-mm-dd';
  filterDialogCategoryValues: any[] = [];
  isLoadingFilterValues: boolean = false;
  isSavingFilter: boolean = false;

  // Dropdown options
  filterTypeOptions = [
    { label: 'Category', value: 'category' },
    { label: 'Numeric (Exact)', value: 'numeric_equality' },
    { label: 'Numeric (Range)', value: 'numeric_range' },
    { label: 'Date/Time (Exact)', value: 'time_equality' },
    { label: 'Date/Time (Range)', value: 'time_range' },
  ];
  controlTypeOptions: { label: string; value: string }[] = [];
  operatorOptions: { label: string; value: string }[] = [];
  nullOptions = NULL_OPTIONS;
  dateFormatOptions = DATE_FORMAT_OPTIONS;

  private columnValuesCache: {
    [columnName: string]: { label: string; value: string }[];
  } = {};

  constructor(
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private datasetService: DatasetService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.editingFilter) {
        this.populateFromFilter(this.editingFilter);
      } else {
        this.resetForm();
      }
    }
  }

  private populateFromFilter(filter: ConfiguredFilter): void {
    this.filterDialogColumn =
      this.datasetFields?.find(
        (f: any) =>
          f.columnName === filter.columnName ||
          f.columnToView === filter.columnName ||
          f.columnToUse === filter.columnName,
      ) || null;
    this.filterDialogType = filter.filterType;
    this.filterDialogControl = filter.controlType;
    this.filterDialogName = filter.name;
    this.filterDialogEnabled = filter.isEnabled;
    this.filterDialogMandatory = filter.isMandatory;

    const config = filter.config || {};
    this.filterDialogOperator = config.matchOperator || '';
    this.filterDialogNullOption = filter.nullOption || 'ALL_VALUES';
    this.filterDialogPlaceholder = config.placeholder || '';
    this.filterDialogIncludeTime = config.includeTime || false;
    this.filterDialogDateFormat = config.dateFormat || 'yy-mm-dd';
    this.filterDialogDefaultValue = this.extractDefaultValue(
      config,
      filter.filterType,
    );

    this.updateControlTypeOptions();
    this.updateOperatorOptions();

    if (filter.filterType === 'category') {
      this.loadColumnDistinctValues();
    }
  }

  private resetForm(): void {
    this.filterDialogColumn = null;
    this.filterDialogType = '';
    this.filterDialogControl = '';
    this.filterDialogName = '';
    this.filterDialogEnabled = true;
    this.filterDialogMandatory = false;
    this.filterDialogOperator = '';
    this.filterDialogNullOption = 'ALL_VALUES';
    this.filterDialogDefaultValue = null;
    this.filterDialogPlaceholder = '';
    this.filterDialogIncludeTime = false;
    this.filterDialogDateFormat = 'yy-mm-dd';
    this.filterDialogCategoryValues = [];
    this.isLoadingFilterValues = false;
    this.controlTypeOptions = [];
    this.operatorOptions = [];
  }

  onDialogHide(): void {
    this.visibleChange.emit(false);
  }

  cancel(): void {
    this.visibleChange.emit(false);
  }

  async save(): Promise<void> {
    if (
      !this.filterDialogColumn ||
      !this.filterDialogType ||
      !this.filterDialogControl
    )
      return;

    if (this.filterDialogType === 'numeric_range') {
      const val = this.filterDialogDefaultValue;
      if (
        val?.min !== null &&
        val?.min !== undefined &&
        val?.max !== null &&
        val?.max !== undefined &&
        Number(val.min) > Number(val.max)
      ) {
        this.globalService.handleErrorService({
          status: false,
          message: 'Range minimum cannot be greater than maximum',
        });
        return;
      }
    }

    if (this.filterDialogType === 'time_range') {
      const val = this.filterDialogDefaultValue;
      if (
        Array.isArray(val) &&
        val[0] instanceof Date &&
        val[1] instanceof Date &&
        val[0].getTime() > val[1].getTime()
      ) {
        this.globalService.handleErrorService({
          status: false,
          message: 'Start date cannot be after end date',
        });
        return;
      }
    }

    const columnName =
      this.filterDialogColumn.columnName ||
      this.filterDialogColumn.columnToView;
    const name = this.filterDialogName || this.filterDialogColumn.columnToView;

    const config: any = {};
    if (this.filterDialogOperator) {
      config.matchOperator = this.filterDialogOperator;
    }
    if (this.filterDialogPlaceholder) {
      config.placeholder = this.filterDialogPlaceholder;
    }
    if (
      this.filterDialogType === 'time_equality' ||
      this.filterDialogType === 'time_range'
    ) {
      config.includeTime = this.filterDialogIncludeTime;
      config.dateFormat = this.filterDialogDateFormat;
    }
    this.buildDefaultValueConfig(config, this.filterDialogType);

    this.isSavingFilter = true;

    try {
      let res: any;
      if (this.editingFilter) {
        res = await this.analysesService.updateFilter({
          id: this.editingFilter.tempId,
          organisation: this.orgId,
          name,
          columnName,
          filterType: this.filterDialogType,
          controlType: this.filterDialogControl,
          config,
          nullOption: this.filterDialogNullOption || 'ALL_VALUES',
          isEnabled: this.filterDialogEnabled,
          isMandatory: this.filterDialogMandatory,
          sequence: this.editingFilter.sequence,
        });
      } else {
        res = await this.analysesService.addFilters({
          analysisId: this.analysisId,
          organisation: this.orgId,
          filters: [
            {
              name,
              columnName,
              filterType: this.filterDialogType,
              controlType: this.filterDialogControl,
              config,
              nullOption: this.filterDialogNullOption || 'ALL_VALUES',
              isEnabled: this.filterDialogEnabled,
              isMandatory: this.filterDialogMandatory,
              sequence: this.configuredFiltersCount,
            },
          ],
        });
      }

      if (this.globalService.handleSuccessService(res, true)) {
        this.visibleChange.emit(false);
        this.saved.emit();
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    } finally {
      this.isSavingFilter = false;
    }
  }

  onFilterTypeChange(): void {
    this.updateControlTypeOptions();
    this.updateOperatorOptions();
    if (this.controlTypeOptions.length > 0) {
      this.filterDialogControl = this.controlTypeOptions[0].value;
    }
    if (this.operatorOptions.length > 0) {
      this.filterDialogOperator = this.operatorOptions[0].value;
    }

    const isTimeType =
      this.filterDialogType === 'time_equality' ||
      this.filterDialogType === 'time_range';
    if (!isTimeType) {
      this.filterDialogIncludeTime = false;
      this.filterDialogDateFormat = 'yy-mm-dd';
    }

    if (this.filterDialogType === 'numeric_range') {
      this.filterDialogDefaultValue = { min: null, max: null };
    } else if (this.filterDialogType === 'time_range') {
      this.filterDialogDefaultValue = null;
    } else if (this.filterDialogType === 'category') {
      this.filterDialogDefaultValue = [];
    } else {
      this.filterDialogDefaultValue = null;
    }

    if (this.filterDialogType === 'category' && this.filterDialogColumn) {
      this.loadColumnDistinctValues();
    } else {
      this.filterDialogCategoryValues = [];
    }
  }

  onDateFormatChange(): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    if (val instanceof Date) {
      this.filterDialogDefaultValue = new Date(val.getTime());
    } else if (Array.isArray(val)) {
      this.filterDialogDefaultValue = val.map((d: Date | null) =>
        d instanceof Date ? new Date(d.getTime()) : d,
      );
    }
  }

  onIncludeTimeChange(): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    if (!this.filterDialogIncludeTime) {
      if (val instanceof Date) {
        this.filterDialogDefaultValue = new Date(
          val.getFullYear(),
          val.getMonth(),
          val.getDate(),
        );
      } else if (Array.isArray(val)) {
        this.filterDialogDefaultValue = val.map((d: Date | null) =>
          d instanceof Date
            ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
            : d,
        );
      }
    } else {
      this.onDateFormatChange();
    }
  }

  onFilterColumnChange(): void {
    if (this.filterDialogColumn && !this.filterDialogName) {
      this.filterDialogName = this.filterDialogColumn.columnToView;
    }
    if (this.filterDialogColumn) {
      this.loadColumnDistinctValues();
    }
  }

  private updateControlTypeOptions(): void {
    switch (this.filterDialogType) {
      case 'category':
        this.controlTypeOptions = [
          { label: 'Dropdown', value: 'dropdown' },
          { label: 'Multi-Select List', value: 'list' },
        ];
        break;
      case 'numeric_equality':
        this.controlTypeOptions = [
          { label: 'Text Input', value: 'text' },
          { label: 'Dropdown', value: 'dropdown' },
        ];
        break;
      case 'numeric_range':
        this.controlTypeOptions = [
          { label: 'Slider', value: 'slider' },
          { label: 'Text Input', value: 'text' },
        ];
        break;
      case 'time_equality':
      case 'time_range':
        this.controlTypeOptions = [
          { label: 'Date Picker', value: 'datepicker' },
        ];
        break;
      default:
        this.controlTypeOptions = [];
    }
  }

  private updateOperatorOptions(): void {
    this.operatorOptions = FILTER_OPERATORS[this.filterDialogType] || [];
  }

  async loadColumnDistinctValues(): Promise<void> {
    if (!this.filterDialogColumn || !this.datasetId || !this.orgId) return;

    const colName =
      this.filterDialogColumn.columnName ||
      this.filterDialogColumn.columnToUse ||
      this.filterDialogColumn.columnToView;

    if (!colName) return;

    if (this.columnValuesCache[colName]) {
      this.filterDialogCategoryValues = this.columnValuesCache[colName];
      return;
    }

    this.isLoadingFilterValues = true;
    this.filterDialogCategoryValues = [];

    try {
      const res: any = await this.datasetService.getDistinctColumnValues(
        this.orgId,
        this.datasetId,
        colName,
      );
      if (res?.status && res.data) {
        const mapped = (res.data || []).map((v: any) => ({
          label: String(v),
          value: String(v),
        }));
        this.columnValuesCache[colName] = mapped;
        this.filterDialogCategoryValues = mapped;
      }
    } catch (err) {
      console.error('Failed to load distinct values', err);
    } finally {
      this.isLoadingFilterValues = false;
    }
  }

  private extractDefaultValue(config: any, filterType: string): any {
    switch (filterType) {
      case 'category':
        return config.defaultValue || config.categoryValues || [];
      case 'numeric_equality':
        return config.defaultValue ?? null;
      case 'numeric_range':
        return {
          min: config.rangeMin ?? null,
          max: config.rangeMax ?? null,
        };
      case 'time_equality':
        return config.defaultValue ? new Date(config.defaultValue) : null;
      case 'time_range':
        const dates: Date[] = [];
        if (config.dateRangeStart) dates.push(new Date(config.dateRangeStart));
        if (config.dateRangeEnd) dates.push(new Date(config.dateRangeEnd));
        return dates.length > 0 ? dates : null;
      default:
        return null;
    }
  }

  private buildDefaultValueConfig(config: any, filterType: string): void {
    const val = this.filterDialogDefaultValue;
    if (val === null || val === undefined) return;

    switch (filterType) {
      case 'category':
        if (Array.isArray(val) && val.length > 0) {
          config.defaultValue = val;
        }
        break;
      case 'numeric_equality':
        if (val !== null && val !== '') {
          config.defaultValue = val;
        }
        break;
      case 'numeric_range':
        if (val?.min !== null && val?.min !== undefined) {
          config.rangeMin = val.min;
        }
        if (val?.max !== null && val?.max !== undefined) {
          config.rangeMax = val.max;
        }
        break;
      case 'time_equality':
        if (val) {
          config.defaultValue = val instanceof Date ? val.toISOString() : val;
        }
        break;
      case 'time_range':
        if (Array.isArray(val) && val[0]) {
          config.dateRangeStart =
            val[0] instanceof Date ? val[0].toISOString() : val[0];
        }
        if (Array.isArray(val) && val[1]) {
          config.dateRangeEnd =
            val[1] instanceof Date ? val[1].toISOString() : val[1];
        }
        break;
    }
  }
}
