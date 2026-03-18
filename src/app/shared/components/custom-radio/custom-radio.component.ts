import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-radio',
  templateUrl: './custom-radio.component.html',
  styleUrls: ['./custom-radio.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomRadioComponent),
      multi: true,
    },
  ],
})
export class CustomRadioComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue = 'value';
  @Input() layout: 'horizontal' | 'vertical' = 'horizontal';
  @Input() columns = 0;
  @Input() gap: 'small' | 'medium' | 'large' = 'medium';
  @Input() labelPosition: 'right' | 'left' = 'right';
  @Input() errorMessage = '';
  @Input() showError = false;

  value: any = null;
  disabled = false;
  name = `radio-${Math.random().toString(36).substring(2, 11)}`;

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
    if (this.value === value) {
      this.value = null;
    } else {
      this.value = value;
    }
    this.onChange(this.value);
  }

  get gapValue(): string {
    switch (this.gap) {
      case 'small':
        return '0.5rem';
      case 'large':
        return '1.5rem';
      default:
        return '1rem';
    }
  }

  get gridColumns(): string | null {
    return this.columns > 1 ? `repeat(${this.columns}, 1fr)` : null;
  }
}
