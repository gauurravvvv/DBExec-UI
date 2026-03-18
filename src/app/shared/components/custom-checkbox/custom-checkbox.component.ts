import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-checkbox',
  templateUrl: './custom-checkbox.component.html',
  styleUrls: ['./custom-checkbox.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomCheckboxComponent),
      multi: true,
    },
  ],
})
export class CustomCheckboxComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue = 'value';
  @Input() layout: 'horizontal' | 'vertical' = 'horizontal';
  @Input() columns = 0;
  @Input() gap: 'small' | 'medium' | 'large' = 'medium';
  @Input() labelPosition: 'right' | 'left' = 'right';
  @Input() checkboxDisabled = false;
  @Input() checkboxIcon = 'pi pi-check';
  @Input() errorMessage = '';
  @Input() showError = false;

  value: any[] = [];
  disabled = false;

  private onChange: (value: any[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any[]): void {
    this.value = value || [];
  }

  registerOnChange(fn: (value: any[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(): void {
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
