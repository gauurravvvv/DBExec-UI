import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Inject,
  Injectable,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { NOTIFICATION } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/** Known event types. Kept in sync with the BE NOTIFICATION_TYPES
 *  enum; the union accepts `string` so an unknown type from a newer
 *  BE renders as a generic fallback row instead of crashing the
 *  dropdown. */
export type NotificationType = 'group_added' | 'group_removed' | string;

export interface NotificationMeta {
  groupId?: string;
  groupName?: string;
  actorId?: string;
  actorName?: string;
}

/**
 * Wire shape returned by the BE list endpoint. `meta` is the
 * structured event data the FE uses to localise the row at render
 * time — for group_added/group_removed it carries { groupId,
 * groupName, actorId }.
 */
export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  meta: NotificationMeta | null;
  readAt: string | null;
  createdOn: string;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * NotificationService — single source of truth for the bell.
 *
 * Owns:
 *  - `unreadCount` signal that the bell badge reads.
 *  - `items` signal that the dropdown reads.
 *  - The polling lifecycle: 60s interval while the tab is
 *    `visible`, paused when hidden, one immediate poll on
 *    visibility-return to catch up.
 *
 * Convention matches the rest of the app: read state stays
 * in-service, components subscribe via signals rather than RxJS.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly http = inject(HttpClientService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _unreadCount = signal(0);
  private readonly _items = signal<NotificationRow[]>([]);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly items = this._items.asReadonly();

  /** Convenience for the badge — "99+" once we exceed two digits. */
  readonly badgeLabel = computed(() => {
    const n = this._unreadCount();
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return String(n);
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private readonly onVisibilityChange = () => this.handleVisibilityChange();

  // Race guard. The bell-click path optimistically zeroes the badge
  // and fires read-all, but a 60s poll started seconds earlier may
  // still be in flight with a stale count. We stamp the time of the
  // most recent local write (markAllRead or openBell) and any poll
  // response older than that is discarded — its data is known stale.
  private lastLocalMutationAt = 0;

  constructor(@Inject(DOCUMENT) private readonly doc: Document) {
    this.destroyRef.onDestroy(() => this.stop());
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Called once from the app shell on first authenticated paint.
   *  Fires an immediate count fetch, then schedules the poll loop
   *  and wires the visibility listener. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.doc.addEventListener('visibilitychange', this.onVisibilityChange);
    this.refreshUnreadCount();
    this.scheduleNextPoll();
  }

  /** Tear down — clears the timer + visibility listener. Called
   *  on logout / app teardown. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.clearPollTimer();
    this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    this._unreadCount.set(0);
    this._items.set([]);
  }

  /** Bell-open path: fetch the last-30-days feed AND mark every
   *  unread row read in a single round-trip pair. Optimistic
   *  badge update so the user sees the dot disappear immediately. */
  async openBell(): Promise<void> {
    // Optimistic: clear the badge before the network round-trip.
    // Stamp the local-mutation clock so any in-flight poll started
    // before this click can't stomp the zero back to a stale value.
    this.lastLocalMutationAt = Date.now();
    this._unreadCount.set(0);
    await Promise.all([this.refreshList(), this.markAllRead()]);
  }

  /** Fetch the list (no read-all). Used on bell-open and as a
   *  re-sync after a failed markAllRead. */
  async refreshList(): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(NOTIFICATION.LIST, { skipLoader: true }),
      );
      if (res?.status) {
        this._items.set(res.data?.items ?? []);
      }
    } catch {
      // Swallow — the bell can show a stale list rather than crash.
    }
  }

  /** Single-shot unread count check. Cheap; safe to fire-and-forget. */
  async refreshUnreadCount(): Promise<void> {
    // Snapshot the local-mutation clock at request start. If a more
    // recent local mutation lands while we wait, the response is
    // stale and must be discarded — otherwise a poll that left the
    // wire before openBell() can re-paint the badge with non-zero.
    const startedAt = Date.now();
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(NOTIFICATION.UNREAD_COUNT, { skipLoader: true }),
      );
      if (this.lastLocalMutationAt > startedAt) return;
      if (res?.status && typeof res.data?.count === 'number') {
        this._unreadCount.set(res.data.count);
      }
    } catch {
      // Swallow — keep the previous badge value rather than zero it
      // on a transient network blip.
    }
  }

  /** POST /read-all. The dropdown's row-styling reads `readAt`,
   *  so once this returns we also update the in-memory list so
   *  rows lose their unread dot without another GET.
   *
   *  Optimistic policy: caller (openBell) has already set the badge
   *  to 0. On SUCCESS we update in-memory readAt timestamps. On
   *  FAILURE we re-sync from the server so the badge and rows match
   *  whatever the BE actually thinks is unread. */
  async markAllRead(): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(NOTIFICATION.READ_ALL, {}, { skipLoader: true }),
      );
      if (res?.status) {
        const now = new Date().toISOString();
        this._items.update(rows =>
          rows.map(r => (r.readAt ? r : { ...r, readAt: now })),
        );
        this._unreadCount.set(0);
        return;
      }
      // BE returned status:false — re-sync from server truth.
      await this.refreshUnreadCount();
    } catch {
      // Network failed — re-sync. If that ALSO fails, the next 60s
      // poll will eventually catch up.
      await this.refreshUnreadCount();
    }
  }

  // ── Polling lifecycle ─────────────────────────────────────────

  private scheduleNextPoll(): void {
    this.clearPollTimer();
    // Don't run a timer while the tab is hidden. Visibility listener
    // resumes us with an immediate refresh on tab-return.
    if (this.doc.visibilityState !== 'visible') return;
    this.pollTimer = setInterval(() => {
      // Double-check visibility — visibility can change between
      // setInterval registrations on some browsers.
      if (this.doc.visibilityState === 'visible') {
        this.refreshUnreadCount();
      }
    }, POLL_INTERVAL_MS);
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private handleVisibilityChange(): void {
    if (this.doc.visibilityState === 'visible') {
      // Catch-up poll — we may have missed events while hidden.
      this.refreshUnreadCount();
      this.scheduleNextPoll();
    } else {
      this.clearPollTimer();
    }
  }
}
