import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface RadioConfig {
  defaultValue: string | null;
  layout: 'horizontal' | 'vertical';
}

@Component({
  selector: 'app-radio-config-dialog',
  templateUrl: './radio-config-dialog.component.html',
  styleUrls: ['./radio-config-dialog.component.scss'],
})
export class RadioConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() promptValues: any[] = [];
  @Input() currentConfig: Partial<RadioConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<RadioConfig>();

  // Layout options
  layoutOptions = [
    { label: 'Vertical', value: 'vertical' },
    { label: 'Horizontal', value: 'horizontal' },
  ];

  // Configuration options with defaults
  config: RadioConfig = {
    defaultValue: null,
    layout: 'vertical',
  };

  // Preview state
  selectedValue: any = null;

  get formattedOptions(): any[] {
    if (!this.promptValues || this.promptValues.length === 0) {
      return [];
    }
    if (
      typeof this.promptValues[0] === 'object' &&
      this.promptValues[0]?.label
    ) {
      return this.promptValues;
    }
    return this.promptValues.map(val => ({ label: val, value: val }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        defaultValue: null,
        layout: 'vertical',
        ...this.currentConfig,
      };
      this.selectedValue = this.config.defaultValue;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  setAsDefault(): void {
    if (this.selectedValue) {
      this.config.defaultValue = this.selectedValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.selectedValue = null;
  }
}
