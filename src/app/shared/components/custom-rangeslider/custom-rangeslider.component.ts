import { ChangeDetectionStrategy, Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-rangeslider',
  templateUrl: './custom-rangeslider.component.html',
  styleUrls: ['./custom-rangeslider.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomRangesliderComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomRangesliderComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() orientation: 'horizontal' | 'vertical' = 'horizontal';
  @Input() animate = false;
  @Input() sliderDisabled = false;
  @Input() showValueLabels = false;
  @Input() showBoundLabels = false;
  @Input() errorMessage = '';
  @Input() showError = false;

  value: number[] = [0, 100];
  disabled = false;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value || [this.min, this.max];
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

  onValueChange(): void {
    this.onChange(this.value);
  }
}
