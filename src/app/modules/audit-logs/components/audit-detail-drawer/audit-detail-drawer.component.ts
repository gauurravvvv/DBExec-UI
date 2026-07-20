import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  ACTION_CLASS,
  ACTION_LABEL_KEY,
  MODULE_FALLBACK,
  MODULE_META,
} from '../../audit-meta.constant';
import { AuditChangedField, AuditLog } from '../../models/audit-log.model';

/**
 * Right-side slide-in detail drawer — the enrichment layer over the audit
 * list. Answers the six audit questions (Who / What / When / Where / Why /
 * Outcome) in a labelled grid, then renders the before → after diff
 * (`changedFields`, values already NAMES not ids) or, for CREATE / DELETE, a
 * flat key/value snapshot of the after / before state. A request-context block
 * closes it out (IP · user agent · correlation).
 *
 * Purely presentational: it takes the row via `@Input log` and emits `close`.
 * NO raw actorId / entityId is ever rendered — names only, with an
 * "Unknown user" fallback and "System Admin" for the sentinel actor.
 */
@Component({
  selector: 'app-audit-detail-drawer',
  templateUrl: './audit-detail-drawer.component.html',
  styleUrls: ['./audit-detail-drawer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditDetailDrawerComponent {
  /** The row to show. When set, the drawer is open. */
  @Input() log: AuditLog | null = null;
  /** Whether the drawer is visible (two-way friendly). */
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  /** Emitted when the user closes the drawer (close button / backdrop / Esc). */
  @Output() closed = new EventEmitter<void>();
  /** Emitted when the user asks to see this asset's full version history —
   *  the parent scopes the list to the row's rootId. */
  @Output() viewHistory = new EventEmitter<AuditLog>();

  constructor(private translate: TranslateService) {}

  /* ── asset-history jump ───────────────────────────────── */

  /** A row can jump to its asset timeline only when it carries a rootId. */
  canJump(log: AuditLog | null | undefined): boolean {
    return !!log?.rootId;
  }

  /** Version badge text, e.g. "v4". Empty when no version on the row. */
  versionLabel(log: AuditLog): string {
    return log.assetVersion != null
      ? `${this.translate.instant('AUDIT.VERSION_PREFIX')}${log.assetVersion}`
      : '';
  }

  onViewHistory(): void {
    if (this.log?.rootId) this.viewHistory.emit(this.log);
  }

  /* ── presentation helpers ─────────────────────────────── */

  moduleIcon(module: string | null | undefined): string {
    return (module && MODULE_META[module]?.icon) || MODULE_FALLBACK.icon;
  }

  moduleLabel(module: string | null | undefined): string {
    const key = (module && MODULE_META[module]?.labelKey) || MODULE_FALLBACK.labelKey;
    return this.translate.instant(key);
  }

  actionClass(action: string | null | undefined): string {
    return (action && ACTION_CLASS[action]) || 'act-default';
  }

  actionLabel(action: string | null | undefined): string {
    if (!action) return '';
    const key = ACTION_LABEL_KEY[action];
    return key ? this.translate.instant(key) : action;
  }

  /** Actor display — never an id. Null → "Unknown user". */
  actorDisplay(log: AuditLog): string {
    if (log.actorName && log.actorName.trim()) return log.actorName;
    return this.translate.instant('AUDIT.UNKNOWN_USER');
  }

  /** Human-readable actor type sub-label. */
  actorTypeLabel(type: string | null | undefined): string {
    switch (type) {
      case 'system-admin':
        return this.translate.instant('AUDIT.ACTOR_TYPE.SYSTEM_ADMIN');
      case 'system':
        return this.translate.instant('AUDIT.ACTOR_TYPE.SYSTEM');
      case 'user':
      default:
        return this.translate.instant('AUDIT.ACTOR_TYPE.USER');
    }
  }

  /** Up-to-two-letter initials for the avatar. Falls back to a glyph. */
  initials(log: AuditLog): string {
    const name = log.actorName?.trim();
    if (!name) return '?';
    if (log.actorType === 'system-admin') return 'SA';
    if (log.actorType === 'system') return 'SY';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  isSystemActor(log: AuditLog): boolean {
    return log.actorType === 'system-admin' || log.actorType === 'system';
  }

  /** "What" summary — "{action} {entityType} {entityName}", all names. */
  whatSummary(log: AuditLog): string {
    const action = this.actionLabel(log.action);
    const entity = log.entityType
      ? this.translate.instant(
          MODULE_META[log.entityType]?.labelKey ??
            MODULE_META[log.module]?.labelKey ??
            MODULE_FALLBACK.labelKey,
        )
      : '';
    const name = log.entityName ? ` "${log.entityName}"` : '';
    return `${action} ${entity}${name}`.trim();
  }

  entityName(log: AuditLog): string {
    return log.entityName?.trim() || '—';
  }

  /**
   * "Where" — a readable endpoint, not the raw developer URL. Keeps the HTTP
   * method + resource path but strips the trailing id segment (uuid / numeric)
   * and any query string, so it reads e.g. "DELETE /api/v1/users" instead of
   * "DELETE /api/v1/users/f0b6e3a8-…?foo=bar". Rendered as plain text (no code
   * chip) so the row matches the others.
   */
  whereSummary(log: AuditLog): string {
    const method = log.requestMethod ?? '';
    let path = log.requestPath ?? '';
    if (path) {
      // Drop query string.
      path = path.split('?')[0];
      // Drop a trailing id segment (uuid or numeric) — the noisy part.
      path = path.replace(
        /\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)\/?$/i,
        '',
      );
    }
    return `${method} ${path}`.trim();
  }

  /* ── diff / snapshot rows ─────────────────────────────── */

  /** True when there's a precomputed diff to show. */
  hasDiff(log: AuditLog): boolean {
    return !!log.changedFields && log.changedFields.length > 0;
  }

  diffRows(log: AuditLog): AuditChangedField[] {
    return log.changedFields ?? [];
  }

  /** Render a from/to value — arrays joined, objects JSON-ified, null → ''. */
  displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) return value.map(v => this.displayValue(v)).join(', ');
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  /**
   * When there's no diff, fall back to a flat key/value snapshot:
   * afterState for a CREATE, beforeState for a DELETE. All values are already
   * names — rendered as-is.
   */
  snapshotRows(log: AuditLog): { key: string; value: string }[] {
    const src = log.afterState ?? log.beforeState;
    if (!src || typeof src !== 'object') return [];
    return Object.keys(src).map(k => ({
      key: this.humanizeKey(k),
      value: this.displayValue((src as Record<string, unknown>)[k]),
    }));
  }

  snapshotLabelKey(log: AuditLog): string {
    if (log.afterState) return 'AUDIT.AFTER_SNAPSHOT';
    return 'AUDIT.BEFORE_SNAPSHOT';
  }

  hasSnapshot(log: AuditLog): boolean {
    return !this.hasDiff(log) && this.snapshotRows(log).length > 0;
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  trackByIndex(i: number): number {
    return i;
  }

  /* ── open / close ─────────────────────────────────────── */

  onClose(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.closed.emit();
  }

  /** Backdrop click closes. The panel itself stops propagation (see template)
   *  so clicks inside never bubble here. */
  onBackdrop(_event: MouseEvent): void {
    this.onClose();
  }
}
