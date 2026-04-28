import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface CalendarConfig {
  // Basic
  placeholder: string;
  defaultValue: Date | null;
  dateFormat: string;

  // Display
  inline: boolean;
  showIcon: boolean;
  showButtonBar: boolean;
  showWeek: boolean;
  numberOfMonths: number;
  view: 'date' | 'month' | 'year';

  // Navigation
  showOtherMonths: boolean;
  selectOtherMonths: boolean;
  firstDayOfWeek: number;

  // Time
  showTime: boolean;
  timeOnly: boolean;
  hourFormat: '12' | '24';
  showSeconds: boolean;
  stepHour: number;
  stepMinute: number;
  stepSecond: number;

  // Selection
  selectionMode: 'single' | 'multiple';
  readonlyInput: boolean;

  // Constraints
  minDate: Date | null;
  maxDate: Date | null;
  disabledDays: number[];

  // UX
  keepInvalid: boolean;
}

@Component({
  selector: 'app-calendar-config-dialog',
  templateUrl: './calendar-config-dialog.component.html',
  styleUrls: ['./calendar-config-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<CalendarConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CalendarConfig>();

  readonly defaultConfig: CalendarConfig = {
    placeholder: 'Select a date',
    defaultValue: null,
    dateFormat: 'mm/dd/yy',
    inline: false,
    showIcon: true,
    showButtonBar: false,
    showWeek: false,
    numberOfMonths: 1,
    view: 'date',
    showOtherMonths: true,
    selectOtherMonths: false,
    firstDayOfWeek: 0,
    showTime: false,
    timeOnly: false,
    hourFormat: '12',
    showSeconds: false,
    stepHour: 1,
    stepMinute: 1,
    stepSecond: 1,
    selectionMode: 'single',
    readonlyInput: false,
    minDate: null,
    maxDate: null,
    disabledDays: [],
    keepInvalid: false,
  };

  config: CalendarConfig = { ...this.defaultConfig };
  previewConfig: CalendarConfig = { ...this.defaultConfig };

  // Preview state
  previewValue: Date | Date[] | null = null;

  // Dropdown option lists
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

  readonly viewOptions = [
    { label: 'Date (day picker)', value: 'date' },
    { label: 'Month (month picker)', value: 'month' },
    { label: 'Year (year picker)', value: 'year' },
  ];

  readonly selectionModeOptions = [
    { label: 'Single', value: 'single' },
    { label: 'Multiple', value: 'multiple' },
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

  readonly numberOfMonthsOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
  ];

  // Disabled days checkboxes (0=Sun ... 6=Sat)
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

  trackByIndex(index: number): number {
    return index;
  }

  private toDate(val: any): Date | null {
    if (val == null) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        ...this.defaultConfig,
        ...this.currentConfig,
      };
      // Parse date strings to Date objects
      this.config.minDate = this.toDate(this.config.minDate);
      this.config.maxDate = this.toDate(this.config.maxDate);
      this.config.defaultValue = this.toDate(this.config.defaultValue);
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
      this.previewValue = this.config.defaultValue;
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
    if (this.previewValue != null) {
      this.config.defaultValue = Array.isArray(this.previewValue)
        ? this.previewValue[0]
        : this.previewValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }

  // Reset time fields when showTime is toggled off
  onShowTimeChange(value: boolean): void {
    if (!value) {
      this.config.timeOnly = false;
      this.config.showSeconds = false;
    }
  }

  // Reset time-only when showTime is disabled
  onTimeOnlyChange(value: boolean): void {
    if (value) {
      this.config.showTime = true;
    }
  }

  // Reset selectionMode-dependent UI state
  onSelectionModeChange(): void {
    this.previewValue = null;
    this.config.defaultValue = null;
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

  get defaultDisplayValue(): string {
    if (!this.config.defaultValue) return '';
    const d = this.config.defaultValue;
    if (this.config.showTime) {
      return d.toLocaleString();
    }
    return d.toLocaleDateString();
  }
}
