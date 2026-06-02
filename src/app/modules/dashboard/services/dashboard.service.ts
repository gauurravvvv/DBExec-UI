import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { DASHBOARD } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DashboardService — list/view/render/publish for dashboards plus
 * the runQuery + distinct-values helpers used by view-dashboard's
 * filter bar.
 *
 * Loading-state follows the rollout convention: `loading` for reads,
 * `saving` for writes (publish + delete), `_deleting` per-id record
 * so each row's delete spins independently. `_rendering` covers the
 * heavier render endpoint used by view-dashboard. Every signal-based
 * call passes `{ skipLoader: true }` so the legacy global blocker
 * stays out of this module.
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private _dashboards = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _rendered = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _rendering = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/list dashboard
  // ngOnDestroy) can cancel in-flight GETs. Mutations + runQuery +
  // distinct-values + listForAnalysis don't pipe through.
  private _cancelReads$ = new Subject<void>();

  readonly dashboards = this._dashboards.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly rendered = this._rendered.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly rendering = this._rendering.asReadonly();
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

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DASHBOARD.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._dashboards.set(res.data.dashboards ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._dashboards.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DASHBOARD.GET + id, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async render(id: string): Promise<void> {
    // render() is the expensive call on view-dashboard. Tracked by
    // its own `_rendering` signal so the skeleton on the page can
    // tell apart "loading metadata" from "rendering charts".
    this._rendering.set(true);
    try {
      const res: any = await lastValueFrom(
        // GET /dashboards/:id/render
        this.http
          .apiGet(
            DASHBOARD.RENDER_PREFIX + id + DASHBOARD.RENDER_SUFFIX,
            { skipLoader: true },
          )
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._rendered.set(res.data);
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._rendered.set(null);
    } finally {
      this._rendering.set(false);
    }
  }

  /**
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  /**
   * Publish — snapshot the source analysis into a dashboard.
   *
   * `mode === 'new'` creates a fresh dashboard; `name` is required.
   * `mode === 'existing'` overwrites the children of an existing
   * dashboard (destructive); `dashboardId` is required and `name`
   * is optional (rename on republish). Caller is responsible for
   * showing a confirmation before invoking 'existing'.
   */
  async publish(payload: {
    analysisId: string;
    mode: 'new' | 'existing';
    dashboardId?: string;
    name?: string;
    description?: string;
    status?: 0 | 1;
  }): Promise<any> {
    this._saving.set(true);
    try {
      // POST /dashboards/publish
      return await lastValueFrom(
        this.http.apiPost(DASHBOARD.PUBLISH, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * List dashboards that were published from a given analysis. Used
   * by the publish dialog to populate the "Publish into existing"
   * dropdown. The list endpoint accepts a `sourceAnalysisId` query
   * param, so we get pre-filtered rows from the server — no client
   * fan-out, no silent miss past the page cap.
   */
  async listForAnalysis(params: {
    datasourceId: string;
    analysisId: string;
  }): Promise<any[]> {
    const res: any = await lastValueFrom(
      this.http.apiGet(DASHBOARD.LIST, {
        params: {
          datasourceId: params.datasourceId,
          sourceAnalysisId: params.analysisId,
          limit: 100,
          page: 1,
        },
        skipLoader: true,
      }),
    );
    return res?.data?.dashboards ?? [];
  }

  /**
   * Run the dashboard's snapshotted SQL with user-applied filters.
   * Returns the full enriched row set (server caps with LIMIT).
   */
  async runQuery(payload: {
    dashboardId: string;
    filters?: any[];
    limit?: number;
  }): Promise<any> {
    // POST /dashboards/:id/run
    return lastValueFrom(
      this.http.apiPost(
        DASHBOARD.RUN_PREFIX + payload.dashboardId + DASHBOARD.RUN_SUFFIX,
        payload,
        { skipLoader: true },
      ),
    );
  }

  /**
   * Distinct values for a single field on a dashboard. Mirrors
   * analysesService.getDistinctFieldValues so the shared
   * analysis-filter-bar fetcher-factory plugs straight in.
   */
  async getDistinctFieldValues(
    dashboardId: string,
    body: {
      fieldName: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<any> {
    // POST /dashboards/:dashboardId/distinct-values
    return lastValueFrom(
      this.http.apiPost(
        DASHBOARD.DISTINCT_VALUES_PREFIX +
          dashboardId +
          DASHBOARD.DISTINCT_VALUES_SUFFIX,
        body,
        { skipLoader: true },
      ),
    );
  }

  async delete(id: string, justification: string): Promise<any> {
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DASHBOARD.DELETE + id, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(id, false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          DASHBOARD.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  resetCurrent(): void {
    this._current.set(null);
    this._rendered.set(null);
  }
}
