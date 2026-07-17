import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  QueryList,
  ViewChildren,
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
 * (+ its `::ng-deep` overrides) used for recipient-email and free-form tag
 * fields. Implements ControlValueAccessor so it drops straight onto the same
 * `formControlName` the BE payload expects — the value stays a `string[]`.
 *
 * A new entry is committed on Enter / comma / semicolon / blur. In `email` mode
 * each entry is validated against a basic email shape; invalid or duplicate
 * entries are rejected (the text is kept so the user can fix it). In `tag` mode
 * any non-empty, non-duplicate token is accepted.
 *
 * Inline edit (Gmail/mailbox style): clicking an existing chip turns it into a
 * text input pre-filled with the current address. Enter or blur saves the edit;
 * Esc cancels. An empty or (in email mode) invalid edit reverts to the original
 * value. Edits mutate the array in place and emit the new value.
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
export class EmailChipsInputComponent
  implements ControlValueAccessor, AfterViewInit
{
  private cdr = inject(ChangeDetectorRef);

  /** The inline-edit input(s); at most one is rendered at a time. Used to
   *  auto-focus the field the moment a chip enters edit mode. */
  @ViewChildren('editInput') private editInputs!: QueryList<
    ElementRef<HTMLInputElement>
  >;

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

  /** Index of the chip currently being inline-edited, or `null`. */
  editingIndex: number | null = null;

  /** Buffer holding the in-progress inline edit text. */
  editDraft = '';

  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  /* ── ControlValueAccessor ───────────────────────────────────────── */

  writeValue(value: string[] | null): void {
    this.chips = Array.isArray(value) ? [...value] : [];
    this.cancelEdit();
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

  /* ── focus management ───────────────────────────────────────────── */

  ngAfterViewInit(): void {
    // When the inline-edit input is rendered (chip clicked), focus it and put
    // the caret at the end so the user can immediately edit the address.
    this.editInputs.changes.subscribe(() => {
      const el = this.editInputs.first?.nativeElement;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
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

  /* ── inline edit (Gmail-style) ──────────────────────────────────── */

  /** Enter inline-edit mode for the chip at `index`, seeding the buffer. */
  startEdit(index: number): void {
    if (this.disabled) return;
    this.editingIndex = index;
    this.editDraft = this.chips[index];
    this.cdr.markForCheck();
  }

  onEditInput(event: Event): void {
    this.editDraft = (event.target as HTMLInputElement).value;
  }

  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  /** Blur saves the edit (mailbox behaviour). */
  onEditBlur(): void {
    this.commitEdit();
    this.onTouched();
  }

  /**
   * Save the in-progress inline edit. An empty or (in email mode) invalid
   * value reverts the chip to its original text. A duplicate collapses onto
   * the existing entry by removing the edited one.
   */
  private commitEdit(): void {
    const index = this.editingIndex;
    if (index === null) return;
    const original = this.chips[index];
    const next = this.editDraft.trim();

    // Empty or invalid → revert (no change to the array).
    if (!next || !this.isValid(next)) {
      this.cancelEdit();
      return;
    }
    // Unchanged → just leave edit mode.
    if (next === original) {
      this.cancelEdit();
      return;
    }
    // Collides with another existing chip → drop the edited one.
    if (this.chips.includes(next)) {
      this.chips = this.chips.filter((_, i) => i !== index);
    } else {
      const updated = [...this.chips];
      updated[index] = next;
      this.chips = updated;
    }
    this.editingIndex = null;
    this.editDraft = '';
    this.onChange(this.chips);
    this.cdr.markForCheck();
  }

  /** Leave inline-edit mode without touching the array. */
  private cancelEdit(): void {
    this.editingIndex = null;
    this.editDraft = '';
    this.cdr.markForCheck();
  }

  private isValid(token: string): boolean {
    if (this.mode === 'tag') return token.length > 0;
    return EmailChipsInputComponent.EMAIL_RE.test(token);
  }

  trackByChip(index: number, chip: string): string {
    return `${index}:${chip}`;
  }
}
