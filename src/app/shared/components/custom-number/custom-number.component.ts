import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  Output,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

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
  /**
   * PrimeNG layout: 'stacked' renders large vertical +/- arrows on the
   * right (~80px tall, dominates the input); 'horizontal' puts the +/-
   * inline on each side at normal input height. Default to 'horizontal'
   * since most callsites use this component in compact form contexts
   * (config sidebar, filter dialog). Override per-callsite if needed.
   */
  @Input() buttonLayout: 'stacked' | 'horizontal' | 'vertical' = 'horizontal';
  @Input() prefix = '';
  @Input() suffix = '';
  @Input() useGrouping = false;
  @Input() readonly = false;
  @Input() numberDisabled = false;
  /**
   * Caller-supplied error (e.g. server validation). The component ALSO
   * shows an internal range error when the typed value is outside
   * [min, max] — see boundsError below.
   */
  @Input() errorMessage = '';
  @Input() showError = false;
  @Input() floatingLabel = false;
  @Input() appendTo: any = null;
  @Output() onChangeEvent = new EventEmitter<any>();

  value: number | null = null;
  disabled = false;
  inputId = `number-${Math.random().toString(36).substring(2, 11)}`;

  /**
   * Live in-range validation state. When the user types a value outside
   * [min, max], we keep the bad value visible in the textfield (so the
   * cursor doesn't fight the user) but BLOCK propagation to the parent
   * ngModel — the chart never sees an out-of-range value. As soon as
   * the user corrects it, the suppressed value flows.
   */
  boundsError = '';

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    // Re-translate the inline error when the user changes language so a
    // stale "Value must be between..." doesn't linger in English.
    this.translate.onLangChange.subscribe(() => {
      if (this.boundsError && this.lastErrorContext) {
        this.boundsError = this.translateBoundsError(this.lastErrorContext);
        this.cdr.markForCheck();
      }
    });
  }

  /** Snapshot of the last validation failure so we can re-translate on
   *  language change without re-running the validation logic. */
  private lastErrorContext: { key: string; params: Record<string, any> } | null = null;

  /** Resolve a validation key from `VALIDATION.*` with interpolation. */
  private translateBoundsError(ctx: { key: string; params: Record<string, any> }): string {
    return this.translate.instant(`VALIDATION.${ctx.key}`, ctx.params);
  }

  /**
   * Returns the bounds violation for a raw value, or '' if in range.
   * Numeric-only — strings / NaN / null / '' all return '' (let the
   * caller decide whether empty is valid via [required]).
   */
  private validateBounds(value: any): string {
    if (value == null || value === '') {
      this.lastErrorContext = null;
      return '';
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFinite(num)) {
      this.lastErrorContext = null;
      return '';
    }
    if (this.min != null && num < this.min) {
      const ctx = this.max != null
        ? { key: 'VALUE_BETWEEN', params: { min: this.min, max: this.max } }
        : { key: 'VALUE_GTE', params: { min: this.min } };
      this.lastErrorContext = ctx;
      return this.translateBoundsError(ctx);
    }
    if (this.max != null && num > this.max) {
      const ctx = this.min != null
        ? { key: 'VALUE_BETWEEN', params: { min: this.min, max: this.max } }
        : { key: 'VALUE_LTE', params: { max: this.max } };
      this.lastErrorContext = ctx;
      return this.translateBoundsError(ctx);
    }
    this.lastErrorContext = null;
    return '';
  }

  /**
   * Clamp ONLY when accepting an externally-written value (writeValue).
   * Typed values are handled by validate-and-block (see onValueChange).
   * Clamping on writeValue protects against stale config that already
   * holds an out-of-range number from before this validation existed.
   */
  private clamp(value: any): any {
    if (value == null || value === '') return value;
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFinite(num)) return value;
    let out = num;
    if (this.min != null && out < this.min) out = this.min;
    if (this.max != null && out > this.max) out = this.max;
    return out;
  }

  writeValue(value: any): void {
    this.value = this.clamp(value);
    this.boundsError = '';
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

  /**
   * Fires on every keystroke (PrimeNG's onInput) AND on blur/step
   * (onValueChange). Strategy:
   *   - If the value is in range → propagate to parent and clear error.
   *   - If the value is OUT of range → KEEP the bad text visible (so
   *     the user's cursor isn't yanked) but DO NOT propagate. The
   *     parent ngModel — and therefore the chart — still holds the
   *     last good value. Show an inline error beneath the control.
   *
   * This is intentionally stricter than the prior silent-clamp because
   * a silent clamp made the chart accept partial typed values
   * (e.g. typing "90" toward "900" rendered 90, snapped, then 900
   * snapped back to max), which felt unpredictable.
   */
  onValueChange(value: any): void {
    const err = this.validateBounds(value);
    this.value = value;
    if (err) {
      this.boundsError = err;
      // Block propagation: the parent keeps the last-good value.
    } else {
      this.boundsError = '';
      this.onChange(value);
      this.onChangeEvent.emit(value);
    }
    this.cdr.markForCheck();
  }

  onBlur(): void {
    this.onTouched();
  }

  /**
   * True when EITHER a caller-supplied error OR an internal bounds
   * error is active. Drives the .ng-invalid class on p-inputNumber and
   * the small error message rendered below.
   */
  get isInvalid(): boolean {
    return !!this.boundsError || (this.showError && !!this.errorMessage);
  }

  get visibleError(): string {
    return this.boundsError || (this.showError ? this.errorMessage : '');
  }
}
