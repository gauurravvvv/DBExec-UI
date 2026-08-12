import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  NOTIFICATIONS,
  notificationRoute,
} from 'src/app/core/constants/routes.constant';
import {
  NotificationRow,
  NotificationService,
} from 'src/app/core/services/notification.service';
import {
  groupByDateBucket,
  NotificationGroup,
} from 'src/app/shared/helpers/notification-grouping.helper';
import {
  notificationAccent,
  notificationBodyKey,
  notificationBodyParams,
  notificationIcon,
  notificationTitleKey,
} from 'src/app/shared/helpers/notification-presentation.helper';
import { NotificationModalService } from 'src/app/shared/services/notification-modal.service';

/**
 * Notification modal — command-palette-style overlay bell panel.
 *
 * Opens via NotificationModalService.open() (called by the sidebar
 * bell). On open we fetch the last-30-days feed (openBell), but no
 * longer bulk-mark-read — per-row click drives read state, "Mark all
 * read" covers the bulk case, so unread dots survive an open.
 *
 * Row actions:
 *   - click a row → mark it read + navigate to its deep link (if any)
 *     + close the panel.
 *   - trash icon → delete (soft) that row.
 *   - "Mark all read" header action.
 *   - "Clear" footer action → soft-delete all READ rows.
 *
 * Rows are grouped into calendar buckets (Today / Yesterday /
 * This week / This month / Older) via groupByDateBucket().
 */
@Component({
  selector: 'app-notification-modal',
  templateUrl: './notification-modal.component.html',
  styleUrls: ['./notification-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationModalComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  readonly isOpen = signal(false);
  /** Re-bucketed every time `items()` changes (signal-driven). */
  readonly groupedItems = computed<NotificationGroup[]>(() =>
    groupByDateBucket(this.notificationService.items()),
  );

  constructor(
    public notificationService: NotificationService,
    private notificationModalService: NotificationModalService,
  ) {}

  ngOnInit(): void {
    this.notificationModalService.open$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.open());
    // Programmatic close (guided tour ending its notifications step).
    this.notificationModalService.close$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.close();
        this.cdr.markForCheck();
      });
  }

  get hasNotifications(): boolean {
    return this.notificationService.items().length > 0;
  }

  get hasUnread(): boolean {
    return this.notificationService.unreadCount() > 0;
  }

  get hasRead(): boolean {
    return this.notificationService.items().some(n => !!n.readAt);
  }

  open(): void {
    this.isOpen.set(true);
    // Fetch the feed (no bulk mark-read — per-row click drives it).
    this.notificationService.openBell();
    this.cdr.markForCheck();
  }

  close(): void {
    this.isOpen.set(false);
  }

  onMarkAllRead(): void {
    this.notificationService.markAllRead();
  }

  onClear(): void {
    this.notificationService.clear();
  }

  /** Per-row click: mark read, then navigate to the deep link (if the
   *  type+meta resolves to one) and close the panel. A row with no
   *  route is still marked read; the panel stays open so the user can
   *  keep triaging. */
  onRowClick(n: NotificationRow): void {
    this.notificationService.markOne(n.id);
    const route = notificationRoute({ type: n.type, meta: n.meta });
    if (route) {
      this.close();
      this.router.navigateByUrl(route);
    }
  }

  /** Trash icon: delete the row. Stop propagation so the row click
   *  (mark-read + navigate) doesn't also fire. */
  onDelete(event: Event, n: NotificationRow): void {
    event.stopPropagation();
    this.notificationService.deleteOne(n.id);
  }

  iconFor(type: string): string {
    return notificationIcon(type);
  }

  /** `var(--token)` for the per-type coloured icon chip. */
  accentFor(type: string): string {
    return notificationAccent(type);
  }

  titleKeyFor(n: NotificationRow): string {
    return notificationTitleKey(n);
  }

  bodyKeyFor(n: NotificationRow): string {
    return notificationBodyKey(n);
  }

  bodyParams(n: NotificationRow): Record<string, string> {
    return notificationBodyParams(n);
  }

  /** Footer "See all" → the full notifications page. Closes the panel
   *  first so the overlay doesn't linger over the routed page. */
  seeAll(): void {
    this.close();
    this.router.navigateByUrl(NOTIFICATIONS.LIST);
  }

  hasRoute(n: NotificationRow): boolean {
    return notificationRoute({ type: n.type, meta: n.meta }) !== null;
  }

  trackById(_index: number, item: NotificationRow): string {
    return item.id;
  }

  trackByBucket(_index: number, group: NotificationGroup): string {
    return group.bucket;
  }
}
