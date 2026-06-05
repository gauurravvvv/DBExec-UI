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

/**
 * Wire shape returned by the BE list endpoint. `meta` is the
 * structured event data the FE uses to localise the row at render
 * time — for group_added/group_removed it carries { groupId,
 * groupName, actorId }.
 */
export interface NotificationRow {
  id: string;
  type: 'group_added' | 'group_removed' | string;
  title: string;
  body: string | null;
  meta: { groupId?: string; groupName?: string; actorId?: string } | null;
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
  private readonly _loading = signal(false);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Convenience for the badge — "9+" once we exceed two digits. */
  readonly badgeLabel = computed(() => {
    const n = this._unreadCount();
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return String(n);
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private readonly onVisibilityChange = () => this.handleVisibilityChange();

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
    // If read-all fails the next poll re-syncs.
    this._unreadCount.set(0);
    await Promise.all([this.refreshList(), this.markAllRead()]);
  }

  /** Fetch the list (no read-all). Used by the dropdown when the
   *  user pulls to refresh, if ever wired. */
  async refreshList(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(NOTIFICATION.LIST, { skipLoader: true }),
      );
      if (res?.status) {
        this._items.set(res.data?.items ?? []);
      }
    } catch {
      // Swallow — the bell can show a stale list rather than crash.
    } finally {
      this._loading.set(false);
    }
  }

  /** Single-shot unread count check. Cheap; safe to fire-and-forget. */
  async refreshUnreadCount(): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(NOTIFICATION.UNREAD_COUNT, { skipLoader: true }),
      );
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
   *  rows lose their unread dot without another GET. */
  async markAllRead(): Promise<void> {
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
      }
    } catch {
      // Swallow — badge stays optimistically 0; next poll re-syncs.
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
