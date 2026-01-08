import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-toggle',
  templateUrl: './custom-toggle.component.html',
  styleUrls: ['./custom-toggle.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomToggleComponent),
      multi: true,
    },
  ],
})
export class CustomToggleComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() trueValue: any = true;
  @Input() falseValue: any = false;
  @Input() trueLabel = 'Active';
  @Input() falseLabel = 'Inactive';
  @Input() showStatusLabel = true;

  value: any = false;
  disabled = false;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  get isChecked(): boolean {
    return this.value === this.trueValue;
  }

  get statusLabel(): string {
    return this.isChecked ? this.trueLabel : this.falseLabel;
  }

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

  onToggleChange(checked: boolean): void {
    this.value = checked ? this.trueValue : this.falseValue;
    this.onChange(this.value);
    this.onTouched();
  }
}
