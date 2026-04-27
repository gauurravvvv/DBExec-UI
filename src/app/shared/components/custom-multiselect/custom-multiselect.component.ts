import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-multiselect',
  templateUrl: './custom-multiselect.component.html',
  styleUrls: ['./custom-multiselect.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomMultiselectComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomMultiselectComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: any[] = [];
  @Input() optionLabel = 'label';
  @Input() optionValue: string | null = '';
  @Input() required = false;
  @Input() filter = true;
  @Input() filterBy = '';
  @Input() filterMatchMode:
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'equals'
    | 'notEquals'
    | 'in'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte' = 'contains';
  @Input() resetFilterOnHide = false;
  @Input() display: 'chip' | 'comma' = 'chip';
  @Input() showToggleAll = true;
  @Input() showHeader = true;
  @Input() maxSelectedLabels: number = 3;
  @Input() selectedItemsLabel = '{0} items selected';
  @Input() selectionLimit!: number;
  @Input() scrollHeight = '200px';
  @Input() emptyMessage = 'No results found';
  @Input() emptyFilterMessage = 'No results found';
  @Input() virtualScroll = false;
  @Input() virtualScrollItemSize = 38;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo: any = null;

  value: any[] = [];
  disabled = false;
  inputId = `multiselect-${Math.random().toString(36).substring(2, 11)}`;

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

  onValueChange(value: any[]): void {
    this.value = value;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
