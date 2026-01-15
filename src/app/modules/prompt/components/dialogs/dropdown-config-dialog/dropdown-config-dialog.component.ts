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
  filter: boolean;
  filterPlaceholder: string;
  showClear: boolean;
  editable: boolean;
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

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DropdownConfig>();

  // Configuration options with defaults
  config: DropdownConfig = {
    placeholder: 'Select an option',
    defaultValue: null,
    filter: true,
    filterPlaceholder: 'Search...',
    showClear: true,
    editable: false,
  };

  // Preview state
  selectedValue: any = null;

  /**
   * Transform promptValues (strings) to dropdown options format
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
        placeholder: 'Select an option',
        defaultValue: null,
        filter: true,
        filterPlaceholder: 'Search...',
        showClear: true,
        editable: false,
        ...this.currentConfig,
      };
      // Set preview to default value if exists
      this.selectedValue = this.config.defaultValue;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  /**
   * Set selected value as default
   */
  setAsDefault(): void {
    if (this.selectedValue) {
      this.config.defaultValue = this.selectedValue;
    }
  }

  /**
   * Clear default value
   */
  clearDefault(): void {
    this.config.defaultValue = null;
    this.selectedValue = null;
  }
}
