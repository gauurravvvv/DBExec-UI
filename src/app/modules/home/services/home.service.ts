import { Injectable, signal } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import { HOME } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  ActivityRow,
  AdminSummary,
  AdminTrendPoint,
  DateWindow,
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

  private windowParams(w: DateWindow, bucket?: TrendBucket): Record<string, string> {
    const p: Record<string, string> = { from: w.from, to: w.to };
    if (bucket) p['bucket'] = bucket;
    return p;
  }

  /* ---------------- ORG dashboard ---------------- */

  getOrgSummary(w: DateWindow): Observable<OrgSummary> {
    return this.unwrap<OrgSummary>(HOME.SUMMARY, this.windowParams(w));
  }

  getQueryTrend(w: DateWindow, bucket: TrendBucket = 'day'): Observable<QueryTrendPoint[]> {
    return this.unwrap<QueryTrendPoint[]>(
      HOME.TRENDS_QUERIES,
      this.windowParams(w, bucket),
    );
  }

  getLoginTrend(w: DateWindow, bucket: TrendBucket = 'day'): Observable<LoginTrendPoint[]> {
    return this.unwrap<LoginTrendPoint[]>(
      HOME.TRENDS_LOGINS,
      this.windowParams(w, bucket),
    );
  }

  getActivity(limit = 8): Observable<ActivityRow[]> {
    return this.unwrap<ActivityRow[]>(HOME.ACTIVITY, { limit: String(limit) });
  }

  getExecutionsByModule(w: DateWindow): Observable<ModuleExecution[]> {
    return this.unwrap<ModuleExecution[]>(
      HOME.EXECUTIONS_BY_MODULE,
      this.windowParams(w),
    );
  }

  /* ---------------- SYSTEM-ADMIN dashboard ---------------- */

  getAdminSummary(w: DateWindow): Observable<AdminSummary> {
    return this.unwrap<AdminSummary>(HOME.SA_SUMMARY, this.windowParams(w));
  }

  getAdminTrends(w: DateWindow, bucket: TrendBucket = 'day'): Observable<AdminTrendPoint[]> {
    return this.unwrap<AdminTrendPoint[]>(
      HOME.SA_TRENDS,
      this.windowParams(w, bucket),
    );
  }

  getOrgsCreated(w: DateWindow, bucket: TrendBucket = 'day'): Observable<OrgsCreatedPoint[]> {
    return this.unwrap<OrgsCreatedPoint[]>(
      HOME.SA_ORGS_CREATED,
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
