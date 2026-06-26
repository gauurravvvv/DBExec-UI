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
import {
  NotificationRow,
  NotificationService,
} from 'src/app/core/services/notification.service';
import {
  groupByDateBucket,
  NotificationGroup,
} from 'src/app/shared/helpers/notification-grouping.helper';
import { NotificationModalService } from 'src/app/shared/services/notification-modal.service';

/**
 * Notification modal — full-screen command-palette-style overlay.
 *
 * Opens via NotificationModalService.open() (called by the sidebar
 * bell). On open we also call NotificationService.openBell() exactly
 * once per open, which fetches the last-30-days feed AND marks every
 * unread row read in a single round-trip (existing service contract).
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
  }

  get hasNotifications(): boolean {
    return this.notificationService.items().length > 0;
  }

  get hasUnread(): boolean {
    return this.notificationService.unreadCount() > 0;
  }

  open(): void {
    this.isOpen.set(true);
    // Same round-trip behaviour as the old in-sidebar bell click:
    // fetch the feed AND mark unread rows read. Service is
    // race-guarded internally so re-entry is safe.
    this.notificationService.openBell();
    this.cdr.markForCheck();
  }

  close(): void {
    this.isOpen.set(false);
  }

  onMarkAllRead(): void {
    this.notificationService.markAllRead();
  }

  iconFor(type: string): string {
    return type === 'group_removed' ? 'pi-user-minus' : 'pi-user-plus';
  }

  titleKeyFor(n: NotificationRow): string {
    return n.type === 'group_removed'
      ? 'NOTIFICATION.GROUP_REMOVED_TITLE'
      : 'NOTIFICATION.GROUP_ADDED_TITLE';
  }

  bodyKeyFor(n: NotificationRow): string {
    return n.type === 'group_removed'
      ? 'NOTIFICATION.GROUP_REMOVED_BODY'
      : 'NOTIFICATION.GROUP_ADDED_BODY';
  }

  trackById(_index: number, item: NotificationRow): string {
    return item.id;
  }

  trackByBucket(_index: number, group: NotificationGroup): string {
    return group.bucket;
  }
}
