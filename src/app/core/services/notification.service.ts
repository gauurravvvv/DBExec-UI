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
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { environment } from 'src/environments/environment';

/** Known event types. Kept in sync with the BE NOTIFICATION_TYPES
 *  enum; the union accepts `string` so an unknown type from a newer
 *  BE renders as a generic fallback row instead of crashing the
 *  dropdown. */
export type NotificationType =
  | 'group_added'
  | 'group_removed'
  | 'dashboard_delivered'
  | 'asset_shared'
  | 'asset_unshared'
  | 'alert_fired'
  | string;

/** Mirrors the BE NotificationMeta interface (scalar deep-link fields). */
export interface NotificationMeta {
  groupId?: string;
  groupName?: string;
  actorId?: string;
  actorName?: string;
  dashboardId?: string;
  dashboardName?: string;
  subscriptionId?: string;
  // asset share/unshare
  assetType?: string;
  assetId?: string;
  assetName?: string;
  analysisId?: string;
  datasetId?: string;
  permission?: string;
  shareId?: string;
  // alert fire
  alertId?: string;
  alertName?: string;
  [key: string]: unknown;
}

/**
 * Wire shape returned by the BE list endpoint. `meta` is the
 * structured event data the FE uses to localise the row at render
 * time.
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

/** SSE data-frame shape pushed by the BE notificationHub. */
interface NotificationPushPayload extends NotificationRow {
  event: 'notification';
}

const POLL_INTERVAL_MS = 60_000;

/** SSE reconnect backoff: start 2s, double each failure, cap 60s. */
const SSE_BACKOFF_MIN_MS = 2_000;
const SSE_BACKOFF_MAX_MS = 60_000;

/**
 * NotificationService — single source of truth for the bell.
 *
 * Owns:
 *  - `unreadCount` signal that the bell badge reads.
 *  - `items` signal that the dropdown reads.
 *  - A live **SSE** stream (primary): the BE pushes each new
 *    notification the instant it's created, so the bell updates in
 *    real time without waiting for a poll. On a message we prepend the
 *    row and bump the badge. The stream reconnects with exponential
 *    backoff on drop.
 *  - A 60s **poll** (catch-up safety net): covers the window between
 *    an SSE drop and reconnect, and any push missed while the socket
 *    was down. Paused when the tab is hidden.
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

  // ── SSE state ──────────────────────────────────────────────────
  private eventSource: EventSource | null = null;
  private sseBackoffMs = SSE_BACKOFF_MIN_MS;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sseClosedByUs = false;

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
   *  Fires an immediate count fetch, opens the SSE stream, then
   *  schedules the poll loop and wires the visibility listener.
   *  Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.doc.addEventListener('visibilitychange', this.onVisibilityChange);
    this.refreshUnreadCount();
    this.openStream();
    this.scheduleNextPoll();
  }

  /** Tear down — closes the SSE stream, clears the timer + visibility
   *  listener. Called on logout / app teardown. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.closeStream();
    this.clearPollTimer();
    this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    this._unreadCount.set(0);
    this._items.set([]);
  }

  // ── SSE lifecycle ──────────────────────────────────────────────

  /** Open the live stream. EventSource can't set headers, so the JWT
   *  rides as ?token=; the BE validates it like AuthMiddleware and
   *  scopes the stream to this user. Reconnects with backoff on drop. */
  private openStream(): void {
    // Tear down the previous socket WITHOUT tripping the "closed by us"
    // guard — a (re)open is not a user-initiated stop, so the backoff
    // reconnect path must stay armed.
    this.teardownEventSource();
    this.sseClosedByUs = false;

    const token = StorageService.get(StorageType.ACCESS_TOKEN);
    if (!token) {
      // No token yet — poll-only until a token exists / next start().
      return;
    }

    const url = `${environment.apiServer}${NOTIFICATION.STREAM}?token=${encodeURIComponent(
      token,
    )}`;

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      this.scheduleStreamReconnect();
      return;
    }
    this.eventSource = es;

    es.onopen = () => {
      // Healthy connection — reset the backoff and re-sync the count
      // in case a push landed during the (re)connect gap.
      this.sseBackoffMs = SSE_BACKOFF_MIN_MS;
      this.refreshUnreadCount();
    };

    es.onmessage = (evt: MessageEvent) => this.handleStreamMessage(evt);

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors, but a 401
      // (expired token) or a hard drop leaves it CLOSED — handle that
      // ourselves with backoff so a rotated token is picked up.
      if (this.sseClosedByUs) return;
      if (es.readyState === EventSource.CLOSED) {
        this.scheduleStreamReconnect();
      }
    };
  }

  /** Parse + apply one SSE data frame. Heartbeats are SSE comments
   *  (`: ping`), never data frames, so they don't reach onmessage. */
  private handleStreamMessage(evt: MessageEvent): void {
    let payload: NotificationPushPayload;
    try {
      payload = JSON.parse(evt.data);
    } catch {
      return; // ignore malformed frames
    }
    if (!payload || payload.event !== 'notification' || !payload.id) return;

    const row: NotificationRow = {
      id: payload.id,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      meta: payload.meta ?? null,
      readAt: payload.readAt ?? null,
      createdOn: payload.createdOn,
    };

    // Prepend (dedupe by id so a poll + push race can't double-insert).
    this._items.update(rows => {
      if (rows.some(r => r.id === row.id)) return rows;
      return [row, ...rows];
    });
    // A pushed row is unread by definition — bump the badge.
    if (!row.readAt) {
      this._unreadCount.update(n => n + 1);
    }
  }

  private scheduleStreamReconnect(): void {
    // Transient error → reconnect. Close the dead socket but DON'T set
    // `sseClosedByUs` — that flag means "the user stopped us" and must
    // stay false here so the backoff timer below actually arms. (This
    // was the bug: routing through closeStream() set the guard and the
    // very next early-return killed every reconnect.)
    this.teardownEventSource();
    if (!this.started || this.sseClosedByUs) return;
    const delay = this.sseBackoffMs;
    this.sseBackoffMs = Math.min(this.sseBackoffMs * 2, SSE_BACKOFF_MAX_MS);
    this.sseReconnectTimer = setTimeout(() => {
      if (this.started && !this.sseClosedByUs) this.openStream();
    }, delay);
  }

  /** User-initiated stop: close the socket AND latch the "closed by us"
   *  guard so no reconnect is scheduled. Called from stop() / logout. */
  private closeStream(): void {
    this.sseClosedByUs = true;
    this.teardownEventSource();
  }

  /** Tear down the current EventSource + any pending reconnect timer.
   *  Does NOT touch `sseClosedByUs` — callers decide whether this is a
   *  transient reconnect (guard stays false) or a real stop (closeStream
   *  latches the guard first). */
  private teardownEventSource(): void {
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        /* noop */
      }
      this.eventSource = null;
    }
  }

  /** Bell-open path: fetch the last-30-days feed. Does NOT mark
   *  everything read anymore — per-row click drives read state and
   *  the explicit "Mark all read" button covers the bulk case, so
   *  unread dots survive an open. */
  async openBell(): Promise<void> {
    await this.refreshList();
  }

  /** Fetch the list. Used on bell-open and as a re-sync after a
   *  failed mutation. */
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
    // wire before a mutation can re-paint the badge with a stale count.
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

  /** POST /read-all. Optimistic: badge → 0 + in-memory readAt stamped;
   *  re-syncs from server truth on failure. */
  async markAllRead(): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this._unreadCount.set(0);
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
      await this.refreshUnreadCount();
    } catch {
      await this.refreshUnreadCount();
    }
  }

  /** PATCH /:id/read — mark ONE row read. Optimistic: stamps readAt on
   *  the in-memory row and decrements the badge if it was unread. */
  async markOne(id: string): Promise<void> {
    const row = this._items().find(r => r.id === id);
    const wasUnread = !!row && !row.readAt;
    this.lastLocalMutationAt = Date.now();
    const now = new Date().toISOString();
    this._items.update(rows =>
      rows.map(r => (r.id === id && !r.readAt ? { ...r, readAt: now } : r)),
    );
    if (wasUnread) this._unreadCount.update(n => Math.max(0, n - 1));
    try {
      const res: any = await lastValueFrom(
        this.http.apiPatch(NOTIFICATION.readOne(id), {}, { skipLoader: true }),
      );
      if (!res?.status) await this.refreshUnreadCount();
    } catch {
      await this.refreshUnreadCount();
    }
  }

  /** DELETE /:id — remove ONE row. Optimistic: drops it from the list
   *  and decrements the badge if it was unread. */
  async deleteOne(id: string): Promise<void> {
    const row = this._items().find(r => r.id === id);
    const wasUnread = !!row && !row.readAt;
    this.lastLocalMutationAt = Date.now();
    this._items.update(rows => rows.filter(r => r.id !== id));
    if (wasUnread) this._unreadCount.update(n => Math.max(0, n - 1));
    try {
      const res: any = await lastValueFrom(
        this.http.apiDelete(NOTIFICATION.remove(id), { skipLoader: true }),
      );
      if (!res?.status) await this.refreshAll();
    } catch {
      await this.refreshAll();
    }
  }

  /** DELETE / — clear all READ rows. Optimistic: drops read rows from
   *  the list (unread rows and the badge are untouched). */
  async clear(): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this._items.update(rows => rows.filter(r => !r.readAt));
    try {
      const res: any = await lastValueFrom(
        this.http.apiDelete(NOTIFICATION.CLEAR, { skipLoader: true }),
      );
      if (!res?.status) await this.refreshList();
    } catch {
      await this.refreshList();
    }
  }

  /** Re-sync both list + count from the server. */
  private async refreshAll(): Promise<void> {
    await Promise.all([this.refreshList(), this.refreshUnreadCount()]);
  }

  // ── Polling lifecycle (catch-up safety net) ───────────────────

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
      // Catch-up poll — we may have missed events while hidden. Also
      // nudge the SSE stream back open if it dropped while hidden.
      this.refreshUnreadCount();
      this.scheduleNextPoll();
      if (
        !this.eventSource ||
        this.eventSource.readyState === EventSource.CLOSED
      ) {
        this.openStream();
      }
    } else {
      this.clearPollTimer();
    }
  }
}
