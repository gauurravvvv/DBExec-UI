import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface DateRangeConfig {
  placeholder: string;
  defaultStartDate: Date | null;
  defaultEndDate: Date | null;
  dateFormat: string;
  showIcon: boolean;
  numberOfMonths: number;
}

@Component({
  selector: 'app-daterange-config-dialog',
  templateUrl: './daterange-config-dialog.component.html',
  styleUrls: ['./daterange-config-dialog.component.scss'],
})
export class DateRangeConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<DateRangeConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DateRangeConfig>();

  // Date format options
  dateFormatOptions = [
    { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
    { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
    { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
  ];

  // Configuration options with defaults
  config: DateRangeConfig = {
    placeholder: 'Select date range',
    defaultStartDate: null,
    defaultEndDate: null,
    dateFormat: 'mm/dd/yy',
    showIcon: true,
    numberOfMonths: 2,
  };

  // Preview state
  previewRange: Date[] | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        placeholder: 'Select date range',
        defaultStartDate: null,
        defaultEndDate: null,
        dateFormat: 'mm/dd/yy',
        showIcon: true,
        numberOfMonths: 2,
        ...this.currentConfig,
      };
      if (this.config.defaultStartDate && this.config.defaultEndDate) {
        this.previewRange = [
          this.config.defaultStartDate,
          this.config.defaultEndDate,
        ];
      }
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  setAsDefault(): void {
    if (this.previewRange && this.previewRange.length === 2) {
      this.config.defaultStartDate = this.previewRange[0];
      this.config.defaultEndDate = this.previewRange[1];
    }
  }

  clearDefault(): void {
    this.config.defaultStartDate = null;
    this.config.defaultEndDate = null;
    this.previewRange = null;
  }
}
