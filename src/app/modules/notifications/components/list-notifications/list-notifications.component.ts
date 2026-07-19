import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { notificationRoute } from 'src/app/core/constants/routes.constant';
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
  NOTIFICATION_TYPE_KEYS,
} from 'src/app/shared/helpers/notification-presentation.helper';

/** The status facet the segmented control filters by. */
type StatusFilter = 'all' | 'unread';

/** How many rows are revealed per infinite-scroll step. */
const PAGE_SIZE = 20;

/**
 * Full notifications page — the "See all" destination behind the bell
 * panel. A page-level view of the same NotificationService feed the
 * panel reads, with:
 *   - a status segmented control (All / Unread),
 *   - a per-type dropdown filter,
 *   - bulk actions (Mark all read, Clear read),
 *   - client-side infinite reveal (the feed is the last-30-days set the
 *     service already holds; we page it in the client rather than force
 *     a server adapter onto an endpoint that returns the whole window),
 *   - per-row deep-link click via the shared notificationRoute() map.
 *
 * Presentation (icon / accent / i18n keys / body params) is delegated
 * to the shared notification-presentation helper so this page and the
 * panel render every type identically.
 */
@Component({
  selector: 'app-list-notifications',
  templateUrl: './list-notifications.component.html',
  styleUrls: ['./list-notifications.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListNotificationsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Loading state for the initial feed fetch. */
  readonly loading = signal(false);

  /** Active status facet. */
  readonly statusFilter = signal<StatusFilter>('all');
  /** Active type facet — null means "all types". */
  readonly typeFilter = signal<string | null>(null);
  /** How many rows are currently revealed (infinite scroll). */
  private readonly visibleCount = signal(PAGE_SIZE);

  /** Type-filter dropdown options, translated at construction. */
  readonly typeOptions = NOTIFICATION_TYPE_KEYS.map(type => ({
    label: this.translate.instant(notificationTitleKey({ type } as NotificationRow)),
    value: type as string,
  }));

  constructor(public notificationService: NotificationService) {}

  /** The full feed filtered by the active status + type facets. */
  private readonly filtered = computed<NotificationRow[]>(() => {
    const status = this.statusFilter();
    const type = this.typeFilter();
    return this.notificationService.items().filter(n => {
      if (status === 'unread' && n.readAt) return false;
      if (type && n.type !== type) return false;
      return true;
    });
  });

  /** Total rows matching the current filters (before the reveal slice). */
  readonly filteredTotal = computed(() => this.filtered().length);

  /** The revealed slice, grouped by date bucket for the template. */
  readonly groups = computed<NotificationGroup[]>(() => {
    const slice = this.filtered().slice(0, this.visibleCount());
    return groupByDateBucket(slice);
  });

  /** Whether more rows exist beyond the current reveal window. */
  readonly hasMore = computed(
    () => this.visibleCount() < this.filteredTotal(),
  );

  readonly hasAnyUnread = computed(
    () => this.notificationService.unreadCount() > 0,
  );

  readonly hasAnyRead = computed(() =>
    this.notificationService.items().some(n => !!n.readAt),
  );

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.cdr.markForCheck();
    try {
      await this.notificationService.refreshList();
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Filters ──────────────────────────────────────────────────────

  setStatus(status: StatusFilter): void {
    if (this.statusFilter() === status) return;
    this.statusFilter.set(status);
    this.visibleCount.set(PAGE_SIZE);
  }

  onTypeChange(value: string | null): void {
    this.typeFilter.set(value || null);
    this.visibleCount.set(PAGE_SIZE);
  }

  isStatus(status: StatusFilter): boolean {
    return this.statusFilter() === status;
  }

  // ── Infinite reveal ──────────────────────────────────────────────

  /** Reveal the next page. Bound to the scroll sentinel + a manual
   *  "Load more" fallback button. */
  loadMore(): void {
    if (!this.hasMore()) return;
    this.visibleCount.update(n => n + PAGE_SIZE);
  }

  /** IntersectionObserver-free infinite scroll: the template calls this
   *  on the scroll container; when the user nears the bottom we reveal
   *  the next page. */
  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (nearBottom) this.loadMore();
  }

  // ── Bulk actions ─────────────────────────────────────────────────

  onMarkAllRead(): void {
    this.notificationService.markAllRead();
  }

  onClearRead(): void {
    this.notificationService.clear();
  }

  // ── Row actions ──────────────────────────────────────────────────

  onRowClick(n: NotificationRow): void {
    this.notificationService.markOne(n.id);
    const route = notificationRoute({ type: n.type, meta: n.meta });
    if (route) this.router.navigateByUrl(route);
  }

  onMarkRead(event: Event, n: NotificationRow): void {
    event.stopPropagation();
    this.notificationService.markOne(n.id);
  }

  onDelete(event: Event, n: NotificationRow): void {
    event.stopPropagation();
    this.notificationService.deleteOne(n.id);
  }

  // ── Presentation (shared helper) ─────────────────────────────────

  iconFor(type: string): string {
    return notificationIcon(type);
  }

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
