import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface ConfiguredFilter {
  tempId: string;
  name: string;
  columnName: string;
  filterType: string;
  controlType: string;
  config: any;
  isEnabled: boolean;
  isMandatory: boolean;
  sequence: number;
}

export interface FilterDialogSaveEvent {
  name: string;
  columnName: string;
  filterType: string;
  controlType: string;
  isEnabled: boolean;
  isMandatory: boolean;
}

@Component({
  selector: 'app-filter-config-dialog',
  templateUrl: './filter-config-dialog.component.html',
  styleUrls: ['./filter-config-dialog.component.scss'],
})
export class FilterConfigDialogComponent implements OnChanges {
  @Input() visible: boolean = false;
  @Input() editingFilter: ConfiguredFilter | null = null;
  @Input() datasetFields: any[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<FilterDialogSaveEvent>();
  @Output() cancel = new EventEmitter<void>();

  // Internal form state
  filterDialogColumn: any = null;
  filterDialogName: string = '';
  filterDialogType: string = '';
  filterDialogControl: string = '';
  filterDialogEnabled: boolean = true;
  filterDialogMandatory: boolean = false;

  // Dropdown options
  filterTypeOptions = [
    { label: 'Category', value: 'category' },
    { label: 'Numeric (Exact)', value: 'numeric_equality' },
    { label: 'Numeric (Range)', value: 'numeric_range' },
    { label: 'Date/Time (Exact)', value: 'time_equality' },
    { label: 'Date/Time (Range)', value: 'time_range' },
  ];

  controlTypeOptions: { label: string; value: string }[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.editingFilter) {
        this.populateFromFilter(this.editingFilter);
      } else {
        this.resetFilterDialog();
      }
    }
  }

  private populateFromFilter(filter: ConfiguredFilter): void {
    this.filterDialogColumn = this.datasetFields?.find(
      (f: any) => (f.columnName || f.columnToView) === filter.columnName,
    ) || null;
    this.filterDialogType = filter.filterType;
    this.filterDialogControl = filter.controlType;
    this.filterDialogName = filter.name;
    this.filterDialogEnabled = filter.isEnabled;
    this.filterDialogMandatory = filter.isMandatory;
    this.updateControlTypeOptions();
  }

  resetFilterDialog(): void {
    this.filterDialogColumn = null;
    this.filterDialogType = '';
    this.filterDialogControl = '';
    this.filterDialogName = '';
    this.filterDialogEnabled = true;
    this.filterDialogMandatory = false;
    this.controlTypeOptions = [];
  }

  onFilterColumnChange(): void {
    if (this.filterDialogColumn && !this.filterDialogName) {
      this.filterDialogName = this.filterDialogColumn.columnToView;
    }
  }

  onFilterTypeChange(): void {
    this.updateControlTypeOptions();
    if (this.controlTypeOptions.length > 0) {
      this.filterDialogControl = this.controlTypeOptions[0].value;
    }
  }

  updateControlTypeOptions(): void {
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

  saveFilterDialog(): void {
    if (!this.filterDialogColumn || !this.filterDialogType || !this.filterDialogControl) return;

    const columnName = this.filterDialogColumn.columnName || this.filterDialogColumn.columnToView;
    const name = this.filterDialogName || this.filterDialogColumn.columnToView;

    this.save.emit({
      name,
      columnName,
      filterType: this.filterDialogType,
      controlType: this.filterDialogControl,
      isEnabled: this.filterDialogEnabled,
      isMandatory: this.filterDialogMandatory,
    });

    this.visibleChange.emit(false);
  }

  cancelFilterDialog(): void {
    this.cancel.emit();
    this.visibleChange.emit(false);
  }
}
