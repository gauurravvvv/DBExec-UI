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
  filter: boolean;
  filterPlaceholder: string;
  showToggleAll: boolean;
  displayMode: 'comma' | 'chip';
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

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<MultiselectConfig>();

  // Display mode options
  displayModes = [
    { label: 'Chips', value: 'chip' },
    { label: 'Comma Separated', value: 'comma' },
  ];

  // Configuration options with defaults
  config: MultiselectConfig = {
    placeholder: 'Select options',
    defaultValues: [],
    filter: true,
    filterPlaceholder: 'Search...',
    showToggleAll: true,
    displayMode: 'chip',
  };

  // Preview state
  selectedValues: any[] = [];

  /**
   * Transform promptValues (strings) to multiselect options format
   */
  get formattedOptions(): any[] {
    if (!this.promptValues || this.promptValues.length === 0) {
      return [];
    }
    // If values are already objects with label/value, return as-is
    if (
      typeof this.promptValues[0] === 'object' &&
      this.promptValues[0]?.label
    ) {
      return this.promptValues;
    }
    // Transform strings to {label, value} objects
    return this.promptValues.map(val => ({ label: val, value: val }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      // Reset config to defaults merged with current config
      this.config = {
        placeholder: 'Select options',
        defaultValues: [],
        filter: true,
        filterPlaceholder: 'Search...',
        showToggleAll: true,
        displayMode: 'chip',
        ...this.currentConfig,
      };
      // Set preview to default values if exists
      this.selectedValues = [...(this.config.defaultValues || [])];
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  /**
   * Set selected values as defaults
   */
  setAsDefaults(): void {
    if (this.selectedValues && this.selectedValues.length > 0) {
      this.config.defaultValues = [...this.selectedValues];
    }
  }

  /**
   * Clear default values
   */
  clearDefaults(): void {
    this.config.defaultValues = [];
    this.selectedValues = [];
  }
}
