import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface DropdownConfig {
  placeholder: string;
  defaultValue: string | null;
  // Filter
  filter: boolean;
  filterPlaceholder: string;
  filterMatchMode: 'contains' | 'startsWith' | 'endsWith' | 'equals';
  resetFilterOnHide: boolean;
  // Behaviour
  showClear: boolean;
  editable: boolean;
  autoDisplayFirst: boolean;
  // Panel
  scrollHeight: string;
  emptyMessage: string;
  emptyFilterMessage: string;
  // Performance
  virtualScroll: boolean;
  virtualScrollItemSize: number;
}

@Component({
  selector: 'app-dropdown-config-dialog',
  templateUrl: './dropdown-config-dialog.component.html',
  styleUrls: ['./dropdown-config-dialog.component.scss'],
})
export class DropdownConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() promptValues: any[] = [];
  @Input() currentConfig: Partial<DropdownConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DropdownConfig>();

  readonly defaultConfig: DropdownConfig = {
    placeholder: 'Select an option',
    defaultValue: null,
    filter: true,
    filterPlaceholder: 'Search...',
    filterMatchMode: 'contains',
    resetFilterOnHide: false,
    showClear: true,
    editable: false,
    autoDisplayFirst: false,
    scrollHeight: '200px',
    emptyMessage: 'No results found',
    emptyFilterMessage: 'No results found',
    virtualScroll: false,
    virtualScrollItemSize: 38,
  };

  config: DropdownConfig = { ...this.defaultConfig };
  previewConfig: DropdownConfig = { ...this.defaultConfig };

  // Preview state
  selectedValue: any = null;

  readonly filterMatchModeOptions = [
    { label: 'Contains', value: 'contains' },
    { label: 'Starts With', value: 'startsWith' },
    { label: 'Ends With', value: 'endsWith' },
    { label: 'Equals', value: 'equals' },
  ];

  readonly scrollHeightOptions = [
    { label: '150px', value: '150px' },
    { label: '200px (default)', value: '200px' },
    { label: '300px', value: '300px' },
    { label: '400px', value: '400px' },
  ];

  get formattedOptions(): any[] {
    if (!this.promptValues || this.promptValues.length === 0) return [];
    if (
      typeof this.promptValues[0] === 'object' &&
      this.promptValues[0]?.label
    ) {
      return this.promptValues;
    }
    return this.promptValues.map(val => ({ label: String(val), value: val }));
  }

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };

      // Validate that defaultValue still exists in options
      if (!this.isValueInOptions(this.config.defaultValue)) {
        this.config.defaultValue = null;
      }
      this.selectedValue = this.config.defaultValue;
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
    }
  }

  applyPreview(): void {
    this.previewConfig = { ...this.config };
    this._previewArr = [this._previewArr[0] + 1];
  }

  onClose(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
    this.onClose();
  }

  setAsDefault(): void {
    if (this.selectedValue != null) {
      this.config.defaultValue = this.selectedValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.selectedValue = null;
  }

  private isValueInOptions(value: any): boolean {
    if (value == null) return false;
    return this.formattedOptions.some(opt => opt.value === value);
  }
}
