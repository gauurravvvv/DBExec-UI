import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  Input,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * app-custom-color — the shared colour picker.
 *
 * Consolidates the hand-rolled "native <input type=color> + hex text field +
 * swatch" bridge that was duplicated in announcement (bg/text), theme, and
 * branding. A ControlValueAccessor, so it binds with formControlName / ngModel
 * and always normalises to a 6-char #rrggbb string.
 *
 *   <app-custom-color formControlName="bgColor"
 *     [label]="'ANNOUNCEMENT.BACKGROUND' | translate"></app-custom-color>
 */
@Component({
  selector: 'app-custom-color',
  templateUrl: './custom-color.component.html',
  styleUrls: ['./custom-color.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomColorComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomColorComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  @Input() placeholder = '#000000';

  value = '#000000';
  disabled = false;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(v: string): void {
    this.value = this.normalize(v) || '#000000';
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /** The native <input type=color> always emits a valid #rrggbb. */
  onNativePick(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.commit(v);
  }

  /** The hex text field — accept partial typing, commit on a valid value. */
  onHexInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value = raw; // let the user keep typing
    const norm = this.normalize(raw);
    if (norm) this.onChange(norm);
  }

  onHexBlur(): void {
    // Snap to a valid value on blur, or fall back to the last good one.
    const norm = this.normalize(this.value);
    this.value = norm || '#000000';
    this.onChange(this.value);
    this.onTouched();
  }

  private commit(v: string): void {
    this.value = v;
    this.onChange(v);
    this.onTouched();
    this.cdr.markForCheck();
  }

  /** The swatch shown next to the field; always a paintable colour. */
  get swatch(): string {
    return this.normalize(this.value) || '#cccccc';
  }

  /** Return a #rrggbb string for any 3/6-digit hex, else '' (invalid). */
  private normalize(raw: string | null | undefined): string {
    const s = String(raw ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const m = s.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '';
  }
}
