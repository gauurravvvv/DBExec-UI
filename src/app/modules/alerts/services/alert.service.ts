import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { ALERT } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * AlertService — list / view / CUD for alert rules plus the alert-specific
 * lifecycle actions (toggle, snooze, test) and the immutable evaluation
 * history. Backed by the BE alerts routes (spec §5.5):
 *
 *   GET    /alerts                    listAlerts        (server-paged)
 *   POST   /alerts                    addAlert
 *   GET    /alerts/:alertId           getAlert
 *   PUT    /alerts/:alertId           updateAlert
 *   DELETE /alerts/:alertId           deleteAlert
 *   POST   /alerts/:alertId/toggle    toggleAlert       (enable / disable)
 *   POST   /alerts/:alertId/snooze    snoozeAlert
 *   POST   /alerts/:alertId/test      testAlert         (evaluate now, no persist)
 *   GET    /alerts/:alertId/events    listAlertEvents   (history, server-paged)
 *
 * Loading state follows the house convention: `loading` for reads,
 * `saving` for writes, per-id `_deleting` so each list row's delete
 * spinner is independent. Signal-driven calls all pass `{ skipLoader: true }`
 * so the button spinner drives the UI, not the global blocker.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private _alerts = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _events = signal<any[]>([]);
  private _eventsTotal = signal(0);
  private _loading = signal(false);
  private _saving = signal(false);
  private _testing = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so components can cancel in-flight
  // GETs from ngOnDestroy. Mutations + lifecycle actions don't pipe.
  private _cancelReads$ = new Subject<void>();

  readonly alerts = this._alerts.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly events = this._events.asReadonly();
  readonly eventsTotal = this._eventsTotal.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly testing = this._testing.asReadonly();
  readonly deleting = this._deleting.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }

  constructor(private http: HttpClientService) {}

  /* ── reads (signal-driven) ─────────────────────────────────────── */

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ALERT.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._alerts.set(res.data?.alerts ?? res.data ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(alertId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ALERT.GET + alertId, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
      return res;
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
      return undefined;
    } finally {
      this._loading.set(false);
    }
  }

  async loadEvents(alertId: string, params?: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ALERT.EVENTS_PREFIX + alertId + ALERT.EVENTS_SUFFIX, {
            params,
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._events.set(res.data?.events ?? res.data ?? []);
        this._eventsTotal.set(res.data?.count ?? 0);
      }
      return res;
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
      return undefined;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  resetCurrent() {
    this._current.set(null);
  }
  resetEvents() {
    this._events.set([]);
    this._eventsTotal.set(0);
  }

  /* ── writes ─────────────────────────────────────────────────────── */

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ALERT.ADD, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      // PUT /alerts/:alertId — id moves to the path.
      return await lastValueFrom(
        this.http.apiPut(ALERT.UPDATE + payload.id, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(alertId: string, justification?: string): Promise<any> {
    this.setDeleting(alertId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ALERT.DELETE + alertId, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(alertId, false);
    }
  }

  /**
   * Duplicate an alert rule. POST /alerts/:alertId/duplicate.
   * Mirrors dataset.service.duplicateDataset.
   */
  async duplicate(alertId: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ALERT.DUPLICATE_PREFIX + alertId + ALERT.DUPLICATE_SUFFIX,
          {},
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /* ── lifecycle actions ──────────────────────────────────────────── */

  /** Enable / disable an alert. Body: { enabled }. */
  async toggle(alertId: string, enabled: boolean): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ALERT.TOGGLE_PREFIX + alertId + ALERT.TOGGLE_SUFFIX,
          { enabled },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /** Mute an alert until now() + snoozeMinutes. Body: { snoozeMinutes }. */
  async snooze(alertId: string, snoozeMinutes: number): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ALERT.SNOOZE_PREFIX + alertId + ALERT.SNOOZE_SUFFIX,
          { snoozeMinutes },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Evaluate the alert condition right now and return the observed value +
   * whether it would breach — WITHOUT persisting the state machine. Used by
   * the "Test now" action on the builder / view pages. Accepts either an
   * alertId (test a saved rule) or a full unsaved payload (preview while
   * authoring); the BE branches on which is present.
   */
  async test(alertId: string | null, payload?: any): Promise<any> {
    this._testing.set(true);
    try {
      const url = alertId
        ? ALERT.TEST_PREFIX + alertId + ALERT.TEST_SUFFIX
        : ALERT.LIST + '/test';
      return await lastValueFrom(
        this.http.apiPost(url, payload ?? {}, { skipLoader: true }),
      );
    } finally {
      this._testing.set(false);
    }
  }
}
