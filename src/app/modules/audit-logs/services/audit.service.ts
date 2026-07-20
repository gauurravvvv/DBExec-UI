import { Injectable, signal } from '@angular/core';
import { EmptyError, Observable, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { AUDIT } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { AuditLog } from '../models/audit-log.model';

/**
 * Audit-log data access — signal-based state on top of the name-denormalized
 * `/audit-logs` contract. The list screen drives an `app-custom-table` through
 * `UsServerListAdapter` via the raw `listAuditLogs()` call (the adapter owns its
 * own loading state); `loadAuditLogs()` is the signal-driven variant kept for
 * any consumer that wants to read straight off the exposed signals.
 *
 * NO raw ids are ever surfaced for display — the BE already denormalizes
 * `actorName` / `entityName` onto each row, so this layer just passes rows
 * through untouched.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private _logs = signal<AuditLog[]>([]);
  private _count = signal(0);
  private _loading = signal(false);
  private _selected = signal<AuditLog | null>(null);

  // Reads pipe through this Subject so the list component's ngOnDestroy can
  // cancel in-flight GETs when the user navigates away.
  private _cancelReads$ = new Subject<void>();

  readonly logs = this._logs.asReadonly();
  readonly count = this._count.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selected = this._selected.asReadonly();

  constructor(private http: HttpClientService) {}

  /**
   * Raw list call — returns the unwrapped BE response so the
   * `UsServerListAdapter` can pull `{ logs, count }` straight off `res.data`.
   * Skips the signal-driven `loadAuditLogs()` flow so the table owns its own
   * loading state.
   */
  listAuditLogs(params: Record<string, unknown>) {
    return lastValueFrom(
      this.http.apiGet(AUDIT.LIST, { params, skipLoader: true }),
    );
  }

  /**
   * Signal-driven list — sets `logs`/`count`/`loading` for any consumer that
   * prefers reactive reads over the adapter. Cancelled by `cancelReads()`.
   */
  async loadAuditLogs(params: Record<string, unknown>) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(AUDIT.LIST, { params })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._logs.set(res.data?.logs ?? []);
        this._count.set(res.data?.count ?? 0);
      }
    } catch (err) {
      // EmptyError is thrown when the observable completes without emitting
      // (i.e. we cancelled it). Re-throw real errors.
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Fetch one row's full detail for the drawer. The list already carries the
   * heavy before/after payload, but this lazy call guarantees the drawer has a
   * complete, fresh row even if a caller trimmed the list projection. Returns
   * the mapped row (names only) or null.
   */
  async getAuditLog(id: string): Promise<AuditLog | null> {
    const res: any = await lastValueFrom(
      this.http.apiGet(`${AUDIT.DETAIL}${id}`, { skipLoader: true }),
    );
    return res?.status ? (res.data as AuditLog) : null;
  }

  setSelected(log: AuditLog | null) {
    this._selected.set(log);
  }

  /* ── login-activity sibling (separate screen; left intact) ───────────── */

  /**
   * Raw login-activity list call — the sibling Login Activity screen drives
   * its own `app-custom-table` adapter off `res.data.{activities,count}`.
   * Kept on this service so both audit views share one HTTP surface.
   */
  listLoginActivity(params: Record<string, unknown>) {
    return lastValueFrom(
      this.http.apiGet(AUDIT.LOGIN_ACTIVITY, { params, skipLoader: true }),
    );
  }

  /** Export the login-activity set as a file blob. */
  exportLoginActivity(params: Record<string, unknown>): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGIN_ACTIVITY, {
      params,
      responseType: 'blob',
    });
  }

  /**
   * Cancel any in-flight read GETs. The list component calls this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  /**
   * Export the full filtered set as a file blob. The http interceptor only
   * unwraps 440/501/503 JSON blobs, so a genuine file download passes through
   * untouched.
   */
  exportAuditLogs(params: Record<string, unknown>): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGS, {
      params,
      responseType: 'blob',
    });
  }
}
