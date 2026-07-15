import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  inject,
  Input,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import type { ValueType } from '../../utils/field-type.util';

/**
 * TypedValueInput — one control that renders the right editor for a value
 * based on its `valueType`. This is the single place the analysis surface
 * (filters + parameters) maps a field's data type to an input control, so
 * the mapping never drifts:
 *
 *   number  → <app-custom-number>
 *   date    → <app-custom-calendar>
 *   string  → <app-custom-dropdown> (distinct values when supplied) with a
 *             free-text fallback so values outside the sampled distincts can
 *             still be entered
 *   boolean → <app-custom-toggle>
 *
 * Deliberately decoupled from any module's i18n namespace — labels use
 * `COMMON.*` keys only — so it can be reused across surfaces (and later
 * promoted to shared/ alongside the alerts copy without a rename).
 *
 * Implemented as a ControlValueAccessor so it binds via `[(ngModel)]` /
 * `formControlName` like the other shared controls. For range mode the
 * value is a two-element tuple [lo, hi] rendered as two side-by-side typed
 * inputs (used by numeric_range parameters and between operators).
 */
@Component({
  selector: 'app-analysis-typed-value-input',
  templateUrl: './typed-value-input.component.html',
  styleUrls: ['./typed-value-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TypedValueInputComponent),
      multi: true,
    },
  ],
})
export class TypedValueInputComponent implements ControlValueAccessor {
  private cdr = inject(ChangeDetectorRef);

  /** Value type — drives which editor is rendered. */
  @Input() valueType: ValueType = 'string';

  /** Two-input range mode ([lo, hi]). */
  @Input() range = false;

  /** Distinct string options (label/value) for the dropdown editor. */
  @Input() options: { label: string; value: any }[] = [];

  /** Whether the string dropdown is editable (free-text) so a value not in
   *  the sampled distincts / allowed list can still be typed. */
  @Input() allowCustomString = true;

  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() showError = false;
  @Input() errorMessage = '';

  /** Single-value model (number | string | boolean | ISO date string). */
  value: any = null;
  /** Range tuple model. */
  rangeValue: [any, any] = [null, null];

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: any): void {
    if (this.range) {
      this.rangeValue = Array.isArray(v)
        ? [v[0] ?? null, v[1] ?? null]
        : [null, null];
    } else {
      this.value = v ?? null;
    }
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (v: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  /* ── single-value handlers ─────────────────────────────────────── */

  onSingleChange(v: any): void {
    // Calendar emits a Date; store an ISO string so the payload is portable.
    this.value = v instanceof Date ? v.toISOString() : v;
    this.onChange(this.value);
    this.onTouched();
  }

  /* ── range handlers ────────────────────────────────────────────── */

  onRangeChange(index: 0 | 1, v: any): void {
    const coerced = v instanceof Date ? v.toISOString() : v;
    this.rangeValue =
      index === 0
        ? [coerced, this.rangeValue[1]]
        : [this.rangeValue[0], coerced];
    this.onChange(this.rangeValue);
    this.onTouched();
  }

  /** Calendar needs a Date object; convert the stored ISO string back. */
  asDate(v: any): Date | null {
    if (v instanceof Date) return v;
    if (typeof v === 'string' && v) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
}
