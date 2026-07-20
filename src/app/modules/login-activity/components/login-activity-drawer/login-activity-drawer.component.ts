import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EVENT_FALLBACK,
  EVENT_META,
} from '../../login-activity-meta.constant';
import { LoginActivity } from '../../models/login-activity.model';

/**
 * Right-side slide-in detail drawer for a login-activity event — the same
 * enrichment idiom as the audit drawer. Answers the auth-event questions
 * (Who / Event / When / Origin / Outcome / Reason) in a labelled grid, then a
 * device/session context block (user agent, org). Presentational: takes the
 * row via `@Input log`, emits `closed`. NAMES ONLY — no internal id shown.
 */
@Component({
  selector: 'app-login-activity-drawer',
  templateUrl: './login-activity-drawer.component.html',
  styleUrls: ['./login-activity-drawer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginActivityDrawerComponent {
  @Input() log: LoginActivity | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();

  constructor(private translate: TranslateService) {}

  eventIcon(eventType: string | null | undefined): string {
    return (eventType && EVENT_META[eventType]?.icon) || EVENT_FALLBACK.icon;
  }

  eventClass(eventType: string | null | undefined): string {
    return (eventType && EVENT_META[eventType]?.cssClass) || EVENT_FALLBACK.cssClass;
  }

  eventLabel(eventType: string | null | undefined): string {
    const key = (eventType && EVENT_META[eventType]?.labelKey) || EVENT_FALLBACK.labelKey;
    return this.translate.instant(key);
  }

  actorDisplay(log: LoginActivity): string {
    return log.username?.trim() || this.translate.instant('LOGIN_ACTIVITY.UNKNOWN_USER');
  }

  /** Up-to-two-letter initials for the avatar. */
  initials(log: LoginActivity): string {
    const name = log.username?.trim();
    if (!name) return '?';
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  onClose(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.closed.emit();
  }

  onVisibleChange(v: boolean): void {
    this.visible = v;
    this.visibleChange.emit(v);
    if (!v) this.closed.emit();
  }
}
