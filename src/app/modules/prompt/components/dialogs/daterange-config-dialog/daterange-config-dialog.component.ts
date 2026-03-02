import {
  Component,
  DoCheck,
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
  // Format
  dateFormat: string;
  // Display
  showIcon: boolean;
  showButtonBar: boolean;
  showWeek: boolean;
  numberOfMonths: number;
  inline: boolean;
  readonlyInput: boolean;
  // Navigation
  firstDayOfWeek: number;
  showOtherMonths: boolean;
  selectOtherMonths: boolean;
  // Time
  showTime: boolean;
  hourFormat: '12' | '24';
  showSeconds: boolean;
  // Constraints
  minDate: Date | null;
  maxDate: Date | null;
  disabledDays: number[];
}

@Component({
  selector: 'app-daterange-config-dialog',
  templateUrl: './daterange-config-dialog.component.html',
  styleUrls: ['./daterange-config-dialog.component.scss'],
})
export class DateRangeConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() currentConfig: Partial<DateRangeConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DateRangeConfig>();

  readonly defaultConfig: DateRangeConfig = {
    placeholder: 'Select date range',
    defaultStartDate: null,
    defaultEndDate: null,
    dateFormat: 'mm/dd/yy',
    showIcon: true,
    showButtonBar: false,
    showWeek: false,
    numberOfMonths: 2,
    inline: false,
    readonlyInput: false,
    firstDayOfWeek: 0,
    showOtherMonths: true,
    selectOtherMonths: false,
    showTime: false,
    hourFormat: '12',
    showSeconds: false,
    minDate: null,
    maxDate: null,
    disabledDays: [],
  };

  config: DateRangeConfig = { ...this.defaultConfig };

  // Preview state
  previewRange: Date[] | null = null;

  readonly dateFormatOptions = [
    { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
    { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
    { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
    { label: 'DD-MM-YYYY', value: 'dd-mm-yy' },
    { label: 'DD.MM.YYYY', value: 'dd.mm.yy' },
    { label: 'MMM DD, YYYY', value: 'M dd, yy' },
    { label: 'DD MMM YYYY', value: 'dd M yy' },
  ];

  readonly hourFormatOptions = [
    { label: '12 Hour (AM/PM)', value: '12' },
    { label: '24 Hour', value: '24' },
  ];

  readonly numberOfMonthsOptions = [
    { label: '1', value: 1 },
    { label: '2 (default)', value: 2 },
    { label: '3', value: 3 },
  ];

  readonly firstDayOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  readonly weekDays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;
  private _lastConfigStr = '';

  ngDoCheck(): void {
    const s = JSON.stringify(this.config);
    if (s !== this._lastConfigStr) {
      this._lastConfigStr = s;
      this._previewArr = [this._previewArr[0] + 1];
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      if (this.config.defaultStartDate && this.config.defaultEndDate) {
        this.previewRange = [
          this.config.defaultStartDate,
          this.config.defaultEndDate,
        ];
      } else {
        this.previewRange = null;
      }
    }
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

  onShowTimeChange(value: boolean): void {
    if (!value) this.config.showSeconds = false;
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

  isDisabledDay(day: number): boolean {
    return this.config.disabledDays.includes(day);
  }

  toggleDisabledDay(day: number): void {
    const idx = this.config.disabledDays.indexOf(day);
    if (idx > -1) {
      this.config.disabledDays = this.config.disabledDays.filter(
        d => d !== day,
      );
    } else {
      this.config.disabledDays = [...this.config.disabledDays, day];
    }
  }
}
