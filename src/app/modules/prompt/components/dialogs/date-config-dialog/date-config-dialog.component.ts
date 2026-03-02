import {
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface DateConfig {
  placeholder: string;
  defaultValue: Date | null;
  // Format
  dateFormat: string;
  view: 'date' | 'month' | 'year';
  // Display
  showIcon: boolean;
  showButtonBar: boolean;
  showWeek: boolean;
  numberOfMonths: number;
  inline: boolean;
  readonlyInput: boolean;
  touchUI: boolean;
  keepInvalid: boolean;
  // Navigation
  firstDayOfWeek: number;
  showOtherMonths: boolean;
  selectOtherMonths: boolean;
  // Time
  showTime: boolean;
  timeOnly: boolean;
  hourFormat: '12' | '24';
  showSeconds: boolean;
  stepHour: number;
  stepMinute: number;
  stepSecond: number;
  // Constraints
  minDate: Date | null;
  maxDate: Date | null;
  disabledDays: number[];
}

@Component({
  selector: 'app-date-config-dialog',
  templateUrl: './date-config-dialog.component.html',
  styleUrls: ['./date-config-dialog.component.scss'],
})
export class DateConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() currentConfig: Partial<DateConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<DateConfig>();

  readonly defaultConfig: DateConfig = {
    placeholder: 'Select date',
    defaultValue: null,
    dateFormat: 'mm/dd/yy',
    view: 'date',
    showIcon: true,
    showButtonBar: true,
    showWeek: false,
    numberOfMonths: 1,
    inline: false,
    readonlyInput: false,
    touchUI: false,
    keepInvalid: false,
    firstDayOfWeek: 0,
    showOtherMonths: true,
    selectOtherMonths: false,
    showTime: false,
    timeOnly: false,
    hourFormat: '12',
    showSeconds: false,
    stepHour: 1,
    stepMinute: 1,
    stepSecond: 1,
    minDate: null,
    maxDate: null,
    disabledDays: [],
  };

  config: DateConfig = { ...this.defaultConfig };
  previewValue: Date | null = null;

  readonly dateFormatOptions = [
    { label: 'MM/DD/YYYY', value: 'mm/dd/yy' },
    { label: 'DD/MM/YYYY', value: 'dd/mm/yy' },
    { label: 'YYYY-MM-DD', value: 'yy-mm-dd' },
    { label: 'DD-MM-YYYY', value: 'dd-mm-yy' },
    { label: 'DD.MM.YYYY', value: 'dd.mm.yy' },
    { label: 'MMM DD, YYYY', value: 'M dd, yy' },
    { label: 'DD MMM YYYY', value: 'dd M yy' },
  ];

  readonly viewOptions = [
    { label: 'Date', value: 'date' },
    { label: 'Month', value: 'month' },
    { label: 'Year', value: 'year' },
  ];

  readonly hourFormatOptions = [
    { label: '12 Hour (AM/PM)', value: '12' },
    { label: '24 Hour', value: '24' },
  ];

  readonly numberOfMonthsOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
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

  readonly stepOptions = [
    { label: '1', value: 1 },
    { label: '5', value: 5 },
    { label: '10', value: 10 },
    { label: '15', value: 15 },
    { label: '30', value: 30 },
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
      this.previewValue = this.config.defaultValue;
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
    if (!value) {
      this.config.timeOnly = false;
      this.config.showSeconds = false;
    }
  }

  onTimeOnlyChange(value: boolean): void {
    if (value) this.config.showTime = true;
  }

  setAsDefault(): void {
    if (this.previewValue != null) this.config.defaultValue = this.previewValue;
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }

  isDisabledDay(day: number): boolean {
    return this.config.disabledDays.includes(day);
  }

  toggleDisabledDay(day: number): void {
    const idx = this.config.disabledDays.indexOf(day);
    this.config.disabledDays =
      idx > -1
        ? this.config.disabledDays.filter(d => d !== day)
        : [...this.config.disabledDays, day];
  }

  get defaultDisplayValue(): string {
    if (!this.config.defaultValue) return '';
    return this.config.showTime
      ? this.config.defaultValue.toLocaleString()
      : this.config.defaultValue.toLocaleDateString();
  }
}
