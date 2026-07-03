import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/**
 * ChangeSummaryDialogComponent — the shared confirmation gate that fronts
 * every mutation in the module (FR-5.7 / FR-7.3). It shows a PLAIN-LANGUAGE
 * summary of what will happen (built FE-side by describeChange from the
 * structured intent) — NEVER any SQL. The backend keeps the SQL server-side
 * and in the audit log.
 *
 * Destructive operations flip `destructive` on: the accent goes to the
 * error palette and an explicit acknowledgement is required — either the
 * confirm checkbox, or (when `confirmPhrase` is set, e.g. the role name)
 * typing the phrase to match. `executing` drives the confirm spinner.
 * A `previewOnly:true` backend dry-run may run before this opens, but only
 * its success/validation is surfaced — its returned SQL is never shown.
 */
@Component({
  selector: 'app-change-summary-dialog',
  templateUrl: './change-summary-dialog.component.html',
  styleUrls: ['./change-summary-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeSummaryDialogComponent {
  @Input() visible = false;
  @Input() title = '';
  /** Plain-language summary lines (from describeChange). No SQL. */
  @Input() summaries: string[] = [];
  @Input() destructive = false;
  /** When set, the user must type this exact phrase to enable confirm. */
  @Input() confirmPhrase: string | null = null;
  @Input() confirmLabel = '';
  /** True while the executing (confirm) call is in flight. */
  @Input() executing = false;
  /** True while a backend dry-run / validation is in flight. */
  @Input() loading = false;
  /** Read-only mode when capability.canManage is false — confirm hidden. */
  @Input() readOnly = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  ackChecked = false;
  typedPhrase = '';

  get canConfirm(): boolean {
    if (this.executing || this.loading) return false;
    if (this.readOnly) return false;
    if (!this.summaries?.length) return false;
    if (this.confirmPhrase) {
      return this.typedPhrase.trim() === this.confirmPhrase;
    }
    if (this.destructive) return this.ackChecked;
    return true;
  }

  onConfirm(): void {
    if (!this.canConfirm) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    this.ackChecked = false;
    this.typedPhrase = '';
    this.cancelled.emit();
  }
}
