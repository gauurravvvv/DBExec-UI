import {
  Component,
  EventEmitter,
  forwardRef,
  Input,
  Output,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-dropdown',
  templateUrl: './custom-dropdown.component.html',
  styleUrls: ['./custom-dropdown.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomDropdownComponent),
      multi: true,
    },
  ],
})
export class CustomDropdownComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue = 'value';
  @Input() required = false;
  @Input() filter = true;
  @Input() filterBy = '';
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Output() onChangeEvent = new EventEmitter<any>();

  value: any = null;
  disabled = false;
  inputId = `dropdown-${Math.random().toString(36).substring(2, 11)}`;

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
