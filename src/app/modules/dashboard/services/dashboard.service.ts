import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DASHBOARD } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

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

  readonly dashboards = this._dashboards.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly rendered = this._rendered.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DASHBOARD.LIST, { params }),
      );
      if (res?.status) {
        this._dashboards.set(res.data.dashboards ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch {
      this._dashboards.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DASHBOARD.GET + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async render(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        // GET /dashboards/:orgId/:id/render
        this.http.apiGet(
          DASHBOARD.RENDER_PREFIX + `${orgId}/${id}` + DASHBOARD.RENDER_SUFFIX,
        ),
      );
      if (res?.status) this._rendered.set(res.data);
    } catch {
      this._rendered.set(null);
    } finally {
      this._loading.set(false);
    }
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
    orgId: string;
    analysisId: string;
    mode: 'new' | 'existing';
    dashboardId?: string;
    name?: string;
    description?: string;
    status?: 0 | 1;
  }): Promise<any> {
    this._saving.set(true);
    try {
      // POST /dashboards/:orgId/publish
      return await lastValueFrom(
        this.http.apiPost(
          DASHBOARD.PUBLISH_PREFIX + payload.orgId + DASHBOARD.PUBLISH_SUFFIX,
          payload,
        ),
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
    orgId: string;
    datasourceId: string;
    analysisId: string;
  }): Promise<any[]> {
    const res: any = await lastValueFrom(
      this.http.apiGet(DASHBOARD.LIST, {
        params: {
          orgId: params.orgId,
          datasourceId: params.datasourceId,
          sourceAnalysisId: params.analysisId,
          limit: 100,
          page: 1,
        },
      }),
    );
    return res?.data?.dashboards ?? [];
  }

  /**
   * Run the dashboard's snapshotted SQL with user-applied filters.
   * Returns the full enriched row set (server caps with LIMIT).
   */
  async runQuery(payload: {
    orgId: string;
    dashboardId: string;
    filters?: any[];
    limit?: number;
  }): Promise<any> {
    // POST /dashboards/:orgId/:id/run
    return lastValueFrom(
      this.http.apiPost(
        DASHBOARD.RUN_PREFIX +
          `${payload.orgId}/${payload.dashboardId}` +
          DASHBOARD.RUN_SUFFIX,
        payload,
      ),
    );
  }

  /**
   * Distinct values for a single field on a dashboard. Mirrors
   * analysesService.getDistinctFieldValues so the shared
   * analysis-filter-bar fetcher-factory plugs straight in.
   */
  async getDistinctFieldValues(
    orgId: string,
    dashboardId: string,
    body: {
      fieldName: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<any> {
    // POST /dashboards/:orgId/:dashboardId/distinct-values
    return lastValueFrom(
      this.http.apiPost(
        DASHBOARD.DISTINCT_VALUES_PREFIX +
          `${orgId}/${dashboardId}` +
          DASHBOARD.DISTINCT_VALUES_SUFFIX,
        body,
      ),
    );
  }

  async delete(orgId: string, id: string, justification: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DASHBOARD.DELETE + `${orgId}/${id}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          DASHBOARD.BULK_DELETE_PREFIX + orgId + DASHBOARD.BULK_DELETE_SUFFIX,
          { ids, justification },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent(): void {
    this._current.set(null);
    this._rendered.set(null);
  }
}
