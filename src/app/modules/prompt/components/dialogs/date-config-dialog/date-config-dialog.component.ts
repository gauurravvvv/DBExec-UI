import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface DateConfig {
  placeholder: string;
  defaultValue: Date | null;
  dateFormat: string;
  showIcon: boolean;
  showButtonBar: boolean;
  minDate: Date | null;
  maxDate: Date | null;
}

@Component({
  selector: 'app-date-config-dialog',
  templateUrl: './date-config-dialog.component.html',
  styleUrls: ['./date-config-dialog.component.scss'],
})
export class DateConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<DateConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DateConfig>();

  // Date format options
  dateFormatOptions = [
    { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
    { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
    { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
  ];

  // Configuration options with defaults
  config: DateConfig = {
    placeholder: 'Select date',
    defaultValue: null,
    dateFormat: 'mm/dd/yy',
    showIcon: true,
    showButtonBar: true,
    minDate: null,
    maxDate: null,
  };

  // Preview state
  previewValue: Date | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        placeholder: 'Select date',
        defaultValue: null,
        dateFormat: 'mm/dd/yy',
        showIcon: true,
        showButtonBar: true,
        minDate: null,
        maxDate: null,
        ...this.currentConfig,
      };
      this.previewValue = this.config.defaultValue;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  setAsDefault(): void {
    if (this.previewValue) {
      this.config.defaultValue = this.previewValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }
}
