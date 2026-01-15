import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface CalendarConfig {
  placeholder: string;
  defaultValue: Date | null;
  showTime: boolean;
  hourFormat: '12' | '24';
  dateFormat: string;
  inline: boolean;
}

@Component({
  selector: 'app-calendar-config-dialog',
  templateUrl: './calendar-config-dialog.component.html',
  styleUrls: ['./calendar-config-dialog.component.scss'],
})
export class CalendarConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<CalendarConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CalendarConfig>();

  // Date format options
  dateFormatOptions = [
    { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
    { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
    { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
  ];

  // Hour format options
  hourFormatOptions = [
    { label: '12 Hour', value: '12' },
    { label: '24 Hour', value: '24' },
  ];

  // Configuration options with defaults
  config: CalendarConfig = {
    placeholder: 'Select date/time',
    defaultValue: null,
    showTime: false,
    hourFormat: '12',
    dateFormat: 'mm/dd/yy',
    inline: false,
  };

  // Preview state
  previewValue: Date | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        placeholder: 'Select date/time',
        defaultValue: null,
        showTime: false,
        hourFormat: '12',
        dateFormat: 'mm/dd/yy',
        inline: false,
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
