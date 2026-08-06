import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/**
 * app-justification-dialog — the shared confirm-with-reason popup.
 *
 * Replaces the ~26 hand-copied `.confirmation-popup` + justification-textarea
 * blocks that lived in every list/view/edit screen (delete + save flows). It
 * owns the overlay chrome, the required justification textarea (via
 * app-custom-textarea, resize locked), the char-count, and the Cancel/Confirm
 * actions — including the busy spinner + double-submit guard on Confirm.
 *
 * The parts that legitimately vary per screen are inputs or projected content:
 *   - `mode` picks the delete (trash icon, danger confirm) vs save (save icon)
 *     preset for the icon + default title/confirm-label.
 *   - `title` / `message` / `confirmLabel` override the presets.
 *   - Project extra context (e.g. a delete-info bullet list) between the tags;
 *     it renders under the message.
 *
 * Two-way bind the reason with `[(justification)]`, or just read it off the
 * `confirm` event. The host keeps owning the actual mutation + `busy` signal.
 *
 *   <app-justification-dialog
 *     *ngIf="showDelete"
 *     mode="delete"
 *     [message]="'USER.CONFIRM_DELETE_SINGLE' | translate"
 *     [busy]="deleting()"
 *     [(justification)]="deleteJustification"
 *     (confirm)="proceedDelete()"
 *     (cancel)="cancelDelete()">
 *     <ul class="delete-info-list">…bullets…</ul>
 *   </app-justification-dialog>
 */
@Component({
  selector: 'app-justification-dialog',
  templateUrl: './justification-dialog.component.html',
  styleUrls: ['./justification-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JustificationDialogComponent {
  /** delete = trash icon + danger confirm; save = save icon. Sets presets. */
  @Input() mode: 'delete' | 'save' = 'save';
  /** Header title (translated string). Falls back to a mode-based key label. */
  @Input() title = '';
  /** Intro/body line above the textarea (translated string). */
  @Input() message = '';
  /** Confirm button label (translated string). Falls back by mode. */
  @Input() confirmLabel = '';
  /** PrimeIcon for the header (overrides the mode preset). */
  @Input() icon = '';
  /** Placeholder for the justification textarea (translated). */
  @Input() placeholder = '';
  /** Require a non-empty justification before Confirm enables. Default true. */
  @Input() requireJustification = true;
  /** Max chars for the reason. */
  @Input() maxLength = 500;
  /** True while the host's mutation is in flight — spins + disables Confirm. */
  @Input() busy = false;

  /** The reason text — two-way bindable via [(justification)]. */
  @Input() justification = '';
  @Output() justificationChange = new EventEmitter<string>();

  /** Fired when Confirm is pressed (guarded: only when enabled + not busy). */
  @Output() confirm = new EventEmitter<string>();
  /** Fired when Cancel / backdrop is pressed. */
  @Output() cancel = new EventEmitter<void>();

  get headerIcon(): string {
    if (this.icon) return this.icon;
    return this.mode === 'delete' ? 'pi pi-trash' : 'pi pi-save';
  }

  get confirmDisabled(): boolean {
    if (this.busy) return true;
    if (this.requireJustification && !this.justification.trim()) return true;
    return false;
  }

  onJustificationChange(v: string): void {
    this.justification = v;
    this.justificationChange.emit(v);
  }

  onConfirm(): void {
    if (this.confirmDisabled) return; // guard double-fire + invalid
    this.confirm.emit(this.justification);
  }

  onCancel(): void {
    if (this.busy) return; // don't let a backdrop click abort mid-write
    this.cancel.emit();
  }
}
