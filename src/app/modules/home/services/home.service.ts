import { Injectable, signal } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import { HOME } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  ActivityRow,
  AdminOrgRow,
  AdminSummary,
  AdminTrendPoint,
  DateWindow,
  LoginHealth,
  LoginTrendPoint,
  ModuleExecution,
  OrgsCreatedPoint,
  OrgSummary,
  QueryTrendPoint,
} from '../models/dashboard.models';

/** Bucketing granularity for trend endpoints. */
export type TrendBucket = 'day' | 'week' | 'month';

/**
 * HomeService — data access for the landing dashboards.
 *
 * Every widget method returns its OWN Observable so the dashboard can
 * fire them all in parallel and let each paint the moment its response
 * lands (fastest-first). The service intentionally does NOT hold a
 * single aggregated dashboard signal for the new widgets — each widget
 * owns its loading/empty/error state in the component.
 *
 * All reads pipe through `_cancelReads$` so the host component can
 * abort in-flight GETs from ngOnDestroy. Reads pass `{ skipLoader:
 * true }` so they never trigger the legacy global blocking overlay —
 * the dashboard shows per-widget skeletons instead.
 */
@Injectable({ providedIn: 'root' })
export class HomeService {
  private _dashboard = signal<any>(null);
  private _loading = signal(false);
  private _cancelReads$ = new Subject<void>();

  readonly dashboard = this._dashboard.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  /** Unwrap the `{ status, data }` envelope to `data`. */
  private unwrap<T>(url: string, params?: Record<string, string>): Observable<T> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.http
      .apiGet<any>(url + qs, { skipLoader: true })
      .pipe(map(res => (res?.data ?? null) as T));
  }

  /**
   * Some endpoints wrap their array under a named key
   * (`data: { trend: [...] }`, `data: { series: [...] }`). Unwrap the
   * envelope, then pull that key, always returning an array so the
   * component's `.map` never sees a non-array (which would throw inside
   * a `next` handler and leave the widget stuck on its skeleton).
   */
  private unwrapArray<T>(
    url: string,
    key: string,
    params?: Record<string, string>,
  ): Observable<T[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.http.apiGet<any>(url + qs, { skipLoader: true }).pipe(
      map(res => {
        const data = res?.data;
        // Accept either a bare array or a { key: [...] } wrapper.
        const arr = Array.isArray(data) ? data : data?.[key];
        return (Array.isArray(arr) ? arr : []) as T[];
      }),
    );
  }

  private windowParams(
    w: DateWindow | null,
    bucket?: TrendBucket,
  ): Record<string, string> {
    const p: Record<string, string> = {};
    // null window = all-time: send no from/to so the BE returns complete data.
    if (w) {
      p['from'] = w.from;
      p['to'] = w.to;
    }
    if (bucket) p['bucket'] = bucket;
    return p;
  }

  /* ---------------- ORG dashboard ---------------- */

  getOrgSummary(w: DateWindow | null): Observable<OrgSummary> {
    return this.unwrap<OrgSummary>(HOME.SUMMARY, this.windowParams(w));
  }

  getQueryTrend(w: DateWindow | null, bucket: TrendBucket = 'day'): Observable<QueryTrendPoint[]> {
    // BE returns a bare array; unwrapArray guarantees an array regardless.
    return this.unwrapArray<QueryTrendPoint>(
      HOME.TRENDS_QUERIES,
      'trend',
      this.windowParams(w, bucket),
    );
  }

  getLoginTrend(w: DateWindow | null, bucket: TrendBucket = 'day'): Observable<LoginTrendPoint[]> {
    return this.unwrapArray<LoginTrendPoint>(
      HOME.TRENDS_LOGINS,
      'trend',
      this.windowParams(w, bucket),
    );
  }

  getActivity(limit = 8): Observable<ActivityRow[]> {
    return this.unwrapArray<ActivityRow>(HOME.ACTIVITY, 'activity', {
      limit: String(limit),
    });
  }

  getExecutionsByModule(w: DateWindow | null): Observable<ModuleExecution[]> {
    return this.unwrapArray<ModuleExecution>(
      HOME.EXECUTIONS_BY_MODULE,
      'executions',
      this.windowParams(w),
    );
  }

  /* ---------------- SYSTEM-ADMIN dashboard ---------------- */

  getAdminSummary(w: DateWindow | null): Observable<AdminSummary> {
    return this.unwrap<AdminSummary>(HOME.SA_SUMMARY, this.windowParams(w));
  }

  getAdminTrends(w: DateWindow | null, bucket: TrendBucket = 'day'): Observable<AdminTrendPoint[]> {
    // BE returns `data: { window, bucket, trend: [...] }`.
    return this.unwrapArray<AdminTrendPoint>(
      HOME.SA_TRENDS,
      'trend',
      this.windowParams(w, bucket),
    );
  }

  getOrgsCreated(w: DateWindow | null, bucket: TrendBucket = 'day'): Observable<OrgsCreatedPoint[]> {
    // BE returns `data: { window, bucket, series: [...] }`.
    return this.unwrapArray<OrgsCreatedPoint>(
      HOME.SA_ORGS_CREATED,
      'series',
      this.windowParams(w, bucket),
    );
  }

  /** Master-DB organisation list (no per-org internals). */
  getAdminOrganisations(limit = 50): Observable<AdminOrgRow[]> {
    return this.unwrapArray<AdminOrgRow>(HOME.SA_ORGANISATIONS, 'organisations', {
      limit: String(limit),
    });
  }

  /** Master-DB platform-operator activity feed. */
  getAdminActivity(limit = 8): Observable<ActivityRow[]> {
    return this.unwrapArray<ActivityRow>(HOME.SA_ACTIVITY, 'activity', {
      limit: String(limit),
    });
  }

  /** Master-DB system-user login health (series + summary). */
  getAdminLoginHealth(
    w: DateWindow | null,
    bucket: TrendBucket = 'day',
  ): Observable<LoginHealth> {
    return this.unwrap<LoginHealth>(
      HOME.SA_LOGIN_HEALTH,
      this.windowParams(w, bucket),
    );
  }

  /* ---------------- lifecycle ---------------- */

  /** Abort in-flight read GETs (call from ngOnDestroy). */
  cancelReads(): void {
    this._cancelReads$.next();
  }

  /** Cancel Subject for callers that want to takeUntil it. */
  get cancelReads$(): Observable<void> {
    return this._cancelReads$.asObservable();
  }

  // Legacy — kept for external compatibility.
  getSystemAdminDashboard() {
    return this.http.apiGet(HOME.SYSTEM_ADMIN);
  }
}
