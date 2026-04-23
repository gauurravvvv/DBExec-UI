import { ChangeDetectionStrategy, Component,
  EventEmitter,
  forwardRef,
  Input,
  Output,
  ViewEncapsulation, } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-daterange',
  templateUrl: './custom-daterange.component.html',
  styleUrls: ['./custom-daterange.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomDaterangeComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomDaterangeComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Select date range';
  @Input() required = false;
  @Input() dateFormat = 'dd/mm/yy';
  @Input() showIcon = true;
  @Input() showButtonBar = false;
  @Input() showWeek = false;
  @Input() numberOfMonths = 2;
  @Input() showOtherMonths = true;
  @Input() selectOtherMonths = false;
  @Input() yearNavigator = false;
  @Input() monthNavigator = false;
  @Input() yearRange = '2000:2030';
  @Input() firstDayOfWeek = 0;
  @Input() readonlyInput = true;
  @Input() touchUI = false;
  @Input() showTime = false;
  @Input() hourFormat = '12';
  @Input() showSeconds = false;
  @Input() inline = false;
  @Input() minDate: Date | null = null;
  @Input() maxDate: Date | null = null;
  @Input() disabledDays: number[] = [];
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo = 'body';
  @Output() onChangeEvent = new EventEmitter<any>();

  value: Date[] | null = null;
  disabled = false;
  inputId = `daterange-${Math.random().toString(36).substring(2, 11)}`;

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
