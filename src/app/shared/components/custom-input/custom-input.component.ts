import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-custom-input',
  templateUrl: './custom-input.component.html',
  styleUrls: ['./custom-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomInputComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() icon = '';
  @Input() required = false;
  @Input() errorMessage = '';
  @Input() type = 'text';
  @Input() inputMode: 'input' | 'textarea' = 'input';
  @Input() maxLength: number | null = null;
  @Input() minLength: number | null = null;
  @Input() readonly = false;
  @Input() rows = 3;
  @Input() autoResize = false;
  @Input() inputDisabled = false;
  @Input() showError = false;
  @Input() showPasswordToggle = false;
  @Input() styleClass = '';
  @Input() hint = '';
  @Input() tooltip = '';
  // Native attributes forwarded to the underlying <input>. Default '' so
  // existing call sites are unaffected.
  @Input() autocomplete = '';
  @Input() inputId = '';
  @Input() ariaLabel = '';

  /**
   * Dimensional-string constraint. When set, the input accepts ECharts
   * dimension strings of the form:
   *   - `auto` (only if `allowAuto: true`)
   *   - `<n>px`  (only if `allowPx: true`)
   *   - `<n>%`   (only if `allowPercent: true`)
   *   - `<n>`    (bare number, only if `allowBareNumber: true` — e.g. pictorialSymbolMargin)
   *   - empty string (always allowed; means "default")
   *
   * Numeric bounds are checked against the parsed number (per unit).
   * Shape+range validation completely replaces the char-count check
   * when this is set, so the user gets a meaningful message ("Value
   * must be auto, 1–200px, or 1–100%") instead of "0 / 8".
   *
   * Each unit may declare its own [min, max]. Omit a unit's bounds to
   * apply only shape checking for that unit.
   */
  @Input() dimension: {
    allowAuto?: boolean;
    allowPx?: boolean;
    allowPercent?: boolean;
    allowBareNumber?: boolean;
    pxMin?: number;
    pxMax?: number;
    percentMin?: number;
    percentMax?: number;
    bareMin?: number;
    bareMax?: number;
  } | null = null;

  value = '';
  disabled = false;
  passwordVisible = false;

  /**
   * Inline length-validation state. Native HTML `maxlength` already
   * stops further keystrokes once the cap is hit, but a paste of an
   * over-long string lands as a single input event with the full text.
   * We don't truncate silently — we keep the over-long text visible
   * (so the user can see/fix it) and propagate the raw value to the
   * parent ngModel so its own `Validators.maxLength` / `minLength`
   * mark the form control invalid. The inline lengthError below is
   * just a hint for the user; the source of truth for "is this
   * form submittable?" is the reactive validator on the parent.
   *
   * Dimension constraints (echarts dimension strings) still BLOCK
   * propagation, because the shape rejection can't be expressed as
   * a built-in Angular validator the consumer would set — see
   * `validateDimension` for the carve-out.
   */
  lengthError = '';

  /** Cached validation context so language changes re-translate the
   *  visible error without re-running validateLength/validateDimension. */
  private lastErrorContext: { key: string; params: Record<string, any> } | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.translate.onLangChange.subscribe(() => {
      if (this.lengthError && this.lastErrorContext) {
        this.lengthError = this.translate.instant(
          `VALIDATION.${this.lastErrorContext.key}`,
          this.lastErrorContext.params,
        );
        this.cdr.markForCheck();
      }
    });
  }

  private translateError(key: string, params: Record<string, any> = {}): string {
    this.lastErrorContext = { key, params };
    return this.translate.instant(`VALIDATION.${key}`, params);
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private validateLength(value: string): string {
    if (this.maxLength != null && (value || '').length > this.maxLength) {
      return this.translateError('MAX_CHARACTERS', { max: this.maxLength });
    }
    if (
      this.minLength != null &&
      (value || '').length > 0 &&
      value.length < this.minLength
    ) {
      return this.translateError('MIN_CHARACTERS', { min: this.minLength });
    }
    this.lastErrorContext = null;
    return '';
  }

  /**
   * Shape-aware validator for ECharts dimension strings.
   * Returns '' when the value matches one of the allowed shapes with
   * an in-range numeric component. Empty string is always valid (means
   * "use the ECharts default").
   */
  private validateDimension(raw: string): string {
    const d = this.dimension;
    if (!d) return '';
    const v = (raw || '').trim();
    if (v === '') {
      this.lastErrorContext = null;
      return '';
    }
    if (d.allowAuto && v.toLowerCase() === 'auto') {
      this.lastErrorContext = null;
      return '';
    }
    const pxMatch = /^(-?\d+(?:\.\d+)?)\s*px$/i.exec(v);
    if (pxMatch) {
      if (!d.allowPx) return this.shapeMessage();
      const n = Number(pxMatch[1]);
      if (d.pxMin != null && n < d.pxMin)
        return this.translateError('PX_GTE', { min: d.pxMin });
      if (d.pxMax != null && n > d.pxMax)
        return this.translateError('PX_LTE', { max: d.pxMax });
      this.lastErrorContext = null;
      return '';
    }
    const pctMatch = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(v);
    if (pctMatch) {
      if (!d.allowPercent) return this.shapeMessage();
      const n = Number(pctMatch[1]);
      if (d.percentMin != null && n < d.percentMin)
        return this.translateError('PERCENT_GTE', { min: d.percentMin });
      if (d.percentMax != null && n > d.percentMax)
        return this.translateError('PERCENT_LTE', { max: d.percentMax });
      this.lastErrorContext = null;
      return '';
    }
    const bareMatch = /^-?\d+(?:\.\d+)?$/.exec(v);
    if (bareMatch) {
      if (!d.allowBareNumber) return this.shapeMessage();
      const n = Number(v);
      if (d.bareMin != null && n < d.bareMin)
        return this.translateError('VALUE_GTE', { min: d.bareMin });
      if (d.bareMax != null && n > d.bareMax)
        return this.translateError('VALUE_LTE', { max: d.bareMax });
      this.lastErrorContext = null;
      return '';
    }
    return this.shapeMessage();
  }

  /**
   * Human-readable list of allowed shapes for the inline error.
   * Built from the constraint so it adapts per-field automatically.
   */
  private shapeMessage(): string {
    const d = this.dimension!;
    const parts: string[] = [];
    if (d.allowAuto) parts.push(`"auto"`);
    if (d.allowPx) {
      const min = d.pxMin != null ? d.pxMin : 1;
      const max = d.pxMax != null ? d.pxMax : 200;
      parts.push(`${min}–${max}px`);
    }
    if (d.allowPercent) {
      const min = d.percentMin != null ? d.percentMin : 0;
      const max = d.percentMax != null ? d.percentMax : 100;
      parts.push(`${min}–${max}%`);
    }
    if (d.allowBareNumber) {
      const min = d.bareMin != null ? d.bareMin : 0;
      const max = d.bareMax != null ? d.bareMax : 100;
      parts.push(`${min}–${max}`);
    }
    // 'or' joiner stays English-only because every locale renders the list
    // with its own conjunction inside DIMENSION_SHAPE; keep parts joined by
    // a neutral separator and let the translation supply the verb.
    const shapes = parts.join(' / ');
    return this.translateError('DIMENSION_SHAPE', { shapes });
  }

  /**
   * Reactive-forms writes (formControl.setValue / patchValue) land here.
   * Because the component is OnPush, simply assigning `this.value` does
   * not schedule a CD pass — the DOM <input> keeps showing the old value
   * until the user interacts (focus + blur, or a typed keystroke) and
   * forces a check. markForCheck schedules a re-check on the next
   * Angular tick so programmatic updates render immediately.
   */
  writeValue(value: string): void {
    this.value = value || '';
    this.lengthError = '';
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
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    this.value = raw; // keep the bad text on screen so the user can fix it

    if (this.dimension) {
      // Dimension constraint can't be expressed as a built-in
      // Angular validator the consumer can wire, so we BLOCK on
      // out-of-shape values — same legacy behaviour. Parent keeps
      // its last in-shape value until the user fixes the input.
      const err = this.validateDimension(raw);
      this.lengthError = err;
      if (!err) this.onChange(raw);
      this.cdr.markForCheck();
      return;
    }

    // Length errors are still surfaced inline as a hint, but we
    // ALWAYS propagate the raw value so the parent reactive form
    // (with Validators.maxLength / minLength) can mark its own
    // control invalid and disable submit buttons. Silently
    // blocking would defeat the parent's validator.
    this.lengthError = this.validateLength(raw);
    this.onChange(raw);
    this.cdr.markForCheck();
  }

  onBlur(): void {
    this.onTouched();
  }

  get isInvalid(): boolean {
    return !!this.lengthError || (this.showError && !!this.errorMessage);
  }

  get visibleError(): string {
    return this.lengthError || (this.showError ? this.errorMessage : '');
  }

  get charCounter(): string {
    // Hide the char counter when a dimension constraint is active —
    // counting characters of "30%" against an 8-char budget is
    // meaningless to the user. The shape message (in the placeholder
    // / inline error) is the right hint for dimension fields.
    if (this.dimension || this.maxLength == null) return '';
    return `${(this.value || '').length} / ${this.maxLength}`;
  }

  get inputType(): string {
    if (this.showPasswordToggle) {
      return this.passwordVisible ? 'text' : 'password';
    }
    return this.type;
  }

  togglePasswordVisibility(event: Event): void {
    event.stopPropagation();
    this.passwordVisible = !this.passwordVisible;
  }
}
