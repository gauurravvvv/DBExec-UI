import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/** One statement in the preview — the exact (masked) SQL + its danger. */
export interface PreviewStatement {
  sql: string;
  isDestructive: boolean;
  dangerClass: 'none' | 'destructive' | 'critical';
  /** i18n key for the reason line, e.g. DB_ACCESS.DANGER.DROP_ROLE. */
  dangerReason?: string;
}

/**
 * ChangeSummaryDialogComponent — the shared "Review SQL before running"
 * gate that fronts every mutation in the module (PDM A1/A2). It shows:
 *   1. a plain-language summary of what will happen (describeChange), and
 *   2. the EXACT SQL that will run (masked), one statement per row, with a
 *      DANGER badge + reason on destructive/critical statements.
 *
 * The confirm button is gated: neutral changes need a single click;
 * destructive changes need the "I understand" checkbox; CRITICAL changes
 * (DROP / REASSIGN / SUPERUSER / CASCADE / self-lockout) require typing the
 * exact `confirmPhrase` (the role/object name) to enable Run. The BE
 * re-checks the phrase server-side, so the gate can't be bypassed.
 *
 * Backward-compatible: callers that only pass `summaries` still work (the
 * SQL block simply renders nothing when `statements` is empty).
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
  /** Plain-language summary lines (from describeChange). */
  @Input() summaries: string[] = [];
  /** The exact SQL statements that will run, with per-statement danger. */
  @Input() statements: PreviewStatement[] = [];
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

  /** Emits the typed confirm phrase (empty string when none required). */
  @Output() confirmed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  ackChecked = false;
  typedPhrase = '';
  /** SQL panel starts expanded — showing the query is the whole point. */
  showSql = true;

  get canConfirm(): boolean {
    if (this.executing || this.loading) return false;
    if (this.readOnly) return false;
    if (!this.summaries?.length && !this.statements?.length) return false;
    if (this.confirmPhrase) {
      return this.typedPhrase.trim() === this.confirmPhrase;
    }
    if (this.hasDanger) return this.ackChecked;
    return true;
  }

  /** True when any statement is flagged destructive/critical. */
  get hasDanger(): boolean {
    return (
      this.destructive ||
      this.statements.some(s => s.dangerClass !== 'none')
    );
  }

  toggleSql(): void {
    this.showSql = !this.showSql;
  }

  dangerTone(cls: string): 'error' | 'warning' | 'neutral' {
    if (cls === 'critical') return 'error';
    if (cls === 'destructive') return 'warning';
    return 'neutral';
  }

  onConfirm(): void {
    if (!this.canConfirm) return;
    this.confirmed.emit(this.typedPhrase.trim());
  }

  onCancel(): void {
    this.ackChecked = false;
    this.typedPhrase = '';
    this.cancelled.emit();
  }
}
