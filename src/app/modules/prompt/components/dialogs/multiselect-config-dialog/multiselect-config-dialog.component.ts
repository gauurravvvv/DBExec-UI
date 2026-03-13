import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface MultiselectConfig {
  placeholder: string;
  defaultValues: string[];
  // Filter
  filter: boolean;
  filterMatchMode: 'contains' | 'startsWith' | 'endsWith' | 'equals';
  resetFilterOnHide: boolean;
  // Display
  displayMode: 'comma' | 'chip';
  showToggleAll: boolean;
  showHeader: boolean;
  maxSelectedLabels: number;
  selectedItemsLabel: string;
  // Selection
  selectionLimit: number | null;
  // Panel
  scrollHeight: string;
  emptyMessage: string;
  emptyFilterMessage: string;
  // Performance
  virtualScroll: boolean;
  virtualScrollItemSize: number;
}

@Component({
  selector: 'app-multiselect-config-dialog',
  templateUrl: './multiselect-config-dialog.component.html',
  styleUrls: ['./multiselect-config-dialog.component.scss'],
})
export class MultiselectConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() promptValues: any[] = [];
  @Input() currentConfig: Partial<MultiselectConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<MultiselectConfig>();

  readonly defaultConfig: MultiselectConfig = {
    placeholder: 'Select options',
    defaultValues: [],
    filter: true,
    filterMatchMode: 'contains',
    resetFilterOnHide: false,
    displayMode: 'chip',
    showToggleAll: true,
    showHeader: true,
    maxSelectedLabels: 3,
    selectedItemsLabel: '{0} items selected',
    selectionLimit: null,
    scrollHeight: '200px',
    emptyMessage: 'No results found',
    emptyFilterMessage: 'No results found',
    virtualScroll: false,
    virtualScrollItemSize: 38,
  };

  config: MultiselectConfig = { ...this.defaultConfig };
  previewConfig: MultiselectConfig = { ...this.defaultConfig };

  // Preview state
  selectedValues: any[] = [];

  // Whether selectionLimit is enabled (null = unlimited)
  limitEnabled = false;

  readonly displayModes = [
    { label: 'Chips', value: 'chip' },
    { label: 'Comma Separated', value: 'comma' },
  ];

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
      this.limitEnabled = this.config.selectionLimit != null;
      this.selectedValues = [...(this.config.defaultValues || [])];
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

  onLimitToggle(enabled: boolean): void {
    this.config.selectionLimit = enabled ? 5 : null;
  }

  setAsDefaults(): void {
    if (this.selectedValues && this.selectedValues.length > 0) {
      this.config.defaultValues = [...this.selectedValues];
    }
  }

  clearDefaults(): void {
    this.config.defaultValues = [];
    this.selectedValues = [];
  }
}
