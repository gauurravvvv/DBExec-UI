import { ChangeDetectionStrategy, Component,
  EventEmitter,
  forwardRef,
  Input,
  Output, } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-number',
  templateUrl: './custom-number.component.html',
  styleUrls: ['./custom-number.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomNumberComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomNumberComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() required = false;
  @Input() min: number | null = null;
  @Input() max: number | null = null;
  @Input() step = 1;
  @Input() showButtons = false;
  @Input() prefix = '';
  @Input() suffix = '';
  @Input() useGrouping = false;
  @Input() readonly = false;
  @Input() numberDisabled = false;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo: any = null;
  @Output() onChangeEvent = new EventEmitter<any>();

  value: number | null = null;
  disabled = false;
  inputId = `number-${Math.random().toString(36).substring(2, 11)}`;

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
