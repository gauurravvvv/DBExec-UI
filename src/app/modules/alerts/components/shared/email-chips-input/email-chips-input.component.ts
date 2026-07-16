import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  forwardRef,
  inject,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';

/**
 * email-chips-input — a small, tokenised `string[]` chip editor built on the
 * canonical `<app-chip variant="tag">`. Replaces the fragile PrimeNG `<p-chips>`
 * (+ its `::ng-deep` overrides) used for the alert recipient-email and free-form
 * tag fields. Implements ControlValueAccessor so it drops straight onto the same
 * `formControlName` the BE payload expects — the value stays a `string[]`.
 *
 * A new entry is committed on Enter / comma / semicolon / blur. In `email` mode
 * each entry is validated against a basic email shape; invalid or duplicate
 * entries are rejected (the text is kept so the user can fix it). In `tag` mode
 * any non-empty, non-duplicate token is accepted.
 */
@Component({
  selector: 'app-email-chips-input',
  standalone: true,
  imports: [CommonModule, TranslateModule, ChipComponent],
  templateUrl: './email-chips-input.component.html',
  styleUrls: ['./email-chips-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EmailChipsInputComponent),
      multi: true,
    },
  ],
})
export class EmailChipsInputComponent implements ControlValueAccessor {
  private cdr = inject(ChangeDetectorRef);

  /** Validation mode: 'email' enforces a basic email shape, 'tag' accepts any
   *  non-empty token. */
  @Input() mode: 'email' | 'tag' = 'email';

  /** Placeholder for the text entry. */
  @Input() placeholder = '';

  /** Applied entries (the control value). */
  chips: string[] = [];

  /** Current text-entry buffer. */
  draft = '';

  /** Set true briefly when a rejected (invalid/duplicate) entry is attempted,
   *  so the field can flag the error visually. */
  invalid = false;

  disabled = false;

  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  /* ── ControlValueAccessor ───────────────────────────────────────── */

  writeValue(value: string[] | null): void {
    this.chips = Array.isArray(value) ? [...value] : [];
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  /* ── entry handling ─────────────────────────────────────────────── */

  onKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'Enter' || key === ',' || key === ';') {
      event.preventDefault();
      this.commitDraft();
      return;
    }
    if (key === 'Backspace' && !this.draft && this.chips.length) {
      // Quick-remove the last chip when the buffer is empty.
      this.removeChip(this.chips[this.chips.length - 1]);
    }
  }

  onInput(event: Event): void {
    this.draft = (event.target as HTMLInputElement).value;
    if (this.invalid) {
      this.invalid = false;
      this.cdr.markForCheck();
    }
  }

  onBlur(): void {
    this.commitDraft();
    this.onTouched();
  }

  private commitDraft(): void {
    const raw = this.draft.trim();
    if (!raw) {
      this.draft = '';
      return;
    }
    // A paste may include several separated tokens.
    const tokens = raw
      .split(/[,;\s]+/)
      .map(t => t.trim())
      .filter(Boolean);
    let rejected = false;
    let added = false;
    for (const token of tokens) {
      if (!this.isValid(token) || this.chips.includes(token)) {
        rejected = true;
        continue;
      }
      this.chips = [...this.chips, token];
      added = true;
    }
    if (added) this.onChange(this.chips);
    // Keep the buffer only when everything failed, so the user can fix it.
    this.draft = rejected && !added ? raw : '';
    this.invalid = rejected && !added;
    this.cdr.markForCheck();
  }

  removeChip(chip: string): void {
    this.chips = this.chips.filter(c => c !== chip);
    this.onChange(this.chips);
    this.cdr.markForCheck();
  }

  private isValid(token: string): boolean {
    if (this.mode === 'tag') return token.length > 0;
    return EmailChipsInputComponent.EMAIL_RE.test(token);
  }

  trackByChip(_i: number, chip: string): string {
    return chip;
  }
}
