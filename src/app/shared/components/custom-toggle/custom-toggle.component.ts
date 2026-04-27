import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  Output,
} from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomToggleComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() trueValue: any = true;
  @Input() falseValue: any = false;
  @Input() trueLabel = 'Active';
  @Input() falseLabel = 'Inactive';
  @Input() showStatusLabel = true;
  @Output() onChange = new EventEmitter<{ checked: boolean }>();

  value: any = false;
  disabled = false;

  private _onChange: (value: any) => void = () => {};
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
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onToggleChange(checked: boolean): void {
    this.value = checked ? this.trueValue : this.falseValue;
    this._onChange(this.value);
    this.onTouched();
    this.onChange.emit({ checked });
  }
}
