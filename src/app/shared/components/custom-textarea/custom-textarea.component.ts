import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-textarea',
  templateUrl: './custom-textarea.component.html',
  styleUrls: ['./custom-textarea.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomTextareaComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomTextareaComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() required = false;
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() rows = 4;
  /** Optional hard character cap (mirrors the native maxlength attribute). */
  @Input() maxLength: number | null = null;
  /** Optional id for the inner <textarea> (label `for` targeting / tests). */
  @Input() inputId = '';
  /** CSS resize behavior. Default 'none' — the textarea is a fixed-size box
   *  that scrolls internally, so users can't drag its height/width and skew
   *  the form/popup layout. Pass 'vertical' to opt a specific field back in. */
  @Input() resize: 'vertical' | 'none' | 'both' | 'horizontal' = 'none';

  value = '';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: string): void {
    this.value = value || '';
    // OnPush: a programmatic form write (patchValue/setValue) does not by
    // itself schedule a change-detection pass, so the <textarea> keeps
    // showing the old value until the user focuses it. markForCheck makes
    // programmatic updates — e.g. prefilling the masked SSO cert on load —
    // render immediately. (Mirrors CustomInputComponent.writeValue.)
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInputChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.value = textarea.value;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
