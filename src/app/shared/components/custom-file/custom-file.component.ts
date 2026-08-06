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

/**
 * app-custom-file — the shared file picker.
 *
 * Replaces the ad-hoc native `<input type=file>` styling used by bulk-add
 * (CSV), branding (logo), SSO (cert), and import (.sql/.twbx). A drag-drop
 * zone + click-to-browse, with accept / max-size validation, a selected-file
 * chip, and a clear button. It is a ControlValueAccessor whose value is the
 * selected `File` (or null); it also emits `fileSelected` for hosts that
 * prefer an event over a form control.
 *
 *   <app-custom-file accept=".csv" [maxSizeMb]="5"
 *     [label]="'USER.BULK_UPLOAD' | translate"
 *     (fileSelected)="onFile($event)"></app-custom-file>
 */
@Component({
  selector: 'app-custom-file',
  templateUrl: './custom-file.component.html',
  styleUrls: ['./custom-file.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomFileComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomFileComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  /** Native accept string, e.g. ".csv" or "image/*". */
  @Input() accept = '';
  /** Max size in MB (0 = unlimited). */
  @Input() maxSizeMb = 0;
  /** Hint line under the drop zone (translated). */
  @Input() hint = '';

  /** Emits the chosen File (or null on clear). Complements the CVA value. */
  @Output() fileSelected = new EventEmitter<File | null>();

  file: File | null = null;
  disabled = false;
  dragging = false;
  error = '';

  private onChange: (v: File | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(v: File | null): void {
    this.file = v ?? null;
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (v: File | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onBrowse(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files[0];
    this.accept_(f || null);
    // Reset so selecting the SAME file again still fires change.
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (this.disabled) return;
    const f = event.dataTransfer?.files?.[0] || null;
    this.accept_(f);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled) this.dragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
  }

  clear(event?: Event): void {
    event?.stopPropagation();
    this.file = null;
    this.error = '';
    this.onChange(null);
    this.fileSelected.emit(null);
    this.onTouched();
    this.cdr.markForCheck();
  }

  get sizeLabel(): string {
    if (!this.file) return '';
    const kb = this.file.size / 1024;
    return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  /** Validate accept + size, then commit. */
  private accept_(f: File | null): void {
    this.error = '';
    if (!f) return;
    if (this.accept && !this.matchesAccept(f)) {
      this.error = `Only ${this.accept} files are allowed.`;
      this.cdr.markForCheck();
      return;
    }
    if (this.maxSizeMb > 0 && f.size > this.maxSizeMb * 1024 * 1024) {
      this.error = `File exceeds ${this.maxSizeMb} MB.`;
      this.cdr.markForCheck();
      return;
    }
    this.file = f;
    this.onChange(f);
    this.fileSelected.emit(f);
    this.onTouched();
    this.cdr.markForCheck();
  }

  private matchesAccept(f: File): boolean {
    const rules = this.accept
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    if (!rules.length) return true;
    const name = f.name.toLowerCase();
    const type = (f.type || '').toLowerCase();
    return rules.some(rule => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
  }
}
