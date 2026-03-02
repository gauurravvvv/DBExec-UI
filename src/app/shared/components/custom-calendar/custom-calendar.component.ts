import {
  Component,
  EventEmitter,
  forwardRef,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-calendar',
  templateUrl: './custom-calendar.component.html',
  styleUrls: ['./custom-calendar.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomCalendarComponent),
      multi: true,
    },
  ],
})
export class CustomCalendarComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Select date & time';
  @Input() required = false;
  @Input() showTime = true;
  @Input() showIcon = true;
  @Input() dateFormat = 'dd/mm/yy';
  @Input() minDate: Date | null = null;
  @Input() maxDate: Date | null = null;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo = 'body';
  @Output() onChangeEvent = new EventEmitter<any>();

  value: Date | null = null;
  disabled = false;
  inputId = `calendar-${Math.random().toString(36).substring(2, 11)}`;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: any): void {
    this.value = value;
    this.onChange(this.value);
    this.onChangeEvent.emit(value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
