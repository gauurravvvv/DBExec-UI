import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import {
  ANALYSES,
  ANALYSES_VISUAL,
  ANALYSIS_FILTER,
  ANALYSIS_PARAMETER,
  DATASET,
  DATASOURCE,
  SYSTEM_ADMIN,
} from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * AnalysesService — list/view/CUD for analyses + visuals + filters,
 * plus a stack of helpers used by the analysis editor (datasource
 * schema lookups, dataset mapping updates, distinct-value popups,
 * run-query, etc.).
 *
 * Loading-state for the migrated list/view methods follows the
 * rollout convention: `loading` for reads, `saving` for writes,
 * `_deleting` per-id record so each row's delete spins
 * independently. Signal-driven CUD calls all pass
 * `{ skipLoader: true }`.
 *
 * The schema/table/column lookups + dataset-mapping helpers + most
 * of the editor's secondary endpoints still hit the global blocker
 * because the editor is large and migration would be its own pass.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalysesService {
  private _analyses = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _running = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/edit/list/add
  // analyses ngOnDestroy) can cancel in-flight GETs. Mutations,
  // runAnalysisQuery, schema/table/column lookups, and the legacy
  // alias methods don't pipe through.
  private _cancelReads$ = new Subject<void>();

  readonly analyses = this._analyses.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly running = this._running.asReadonly();
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

  // Signal-based list + view used by list-analyses / view-analyses
  // for the skeleton-aware load. Lives alongside the legacy
  // listAnalyses / viewAnalyses below which other callers still use.
  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ANALYSES.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._analyses.set(res.data?.analyses ?? res.data ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ANALYSES.GET + id, { skipLoader: true })
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

  listDatasets(params: any) {
    return lastValueFrom(this.http.apiGet(DATASET.LIST, { params }));
  }

  deleteDataset(datasetId: string) {
    return lastValueFrom(this.http.apiDelete(DATASET.DELETE + datasetId));
  }

  async addAnalyses(payload: any) {
    const { name, description, datasetId, datasource } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.ADD,
          {
            name,
            description,
            datasetId,
            datasource,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  // Legacy list — list-analyses now uses the signal-based load above,
  // but other callers (dashboard, etc.) still expect the global blocker.
  listAnalyses(params: any) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES.LIST, { params, skipLoader: true }),
    );
  }

  /**
   * Duplicate an analysis. Mirrors the dataset duplicate flow.
   * POST /analyses/:analysisId/duplicate
   */
  async duplicate(id: string) {
    this._saving.set(true);
    try {
      // ANALYSES.GET is the `/analyses/` prefix; append id + `/duplicate`.
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.GET + id + '/duplicate',
          {},
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async deleteAnalyses(analysisId: string, justification?: string) {
    this.setDeleting(analysisId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ANALYSES.DELETE + analysisId, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(analysisId, false);
    }
  }

  async bulkDeleteAnalyses(ids: string[], justification?: string) {
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  viewAnalyses(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES.GET + analysisId, { skipLoader: true }),
    );
  }

  /**
   * Single-call bootstrap for the Edit Analysis page. Returns the
   * minimal projection of analysis metadata + dataset name +
   * dataset/analysis field lists in one round trip. Replaces three
   * legacy calls (viewAnalyses, getDataset, getAnalysisFields) for
   * this surface only — the legacy endpoints stay alive for other
   * callers that need fuller payloads.
   *
   * GET /analyses/:analysisId/bootstrap
   */
  getBootstrap(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(
        ANALYSES.BOOTSTRAP_PREFIX + analysisId + ANALYSES.BOOTSTRAP_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  /**
   * List all visuals for an analysis (skeleton data only).
   * GET /visuals/:analysisId
   */
  listVisuals(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES_VISUAL.LIST + analysisId, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Hydrated list — every visual ships with its visualConfig
   * already populated. Replaces the N+1 listVisuals + getVisual
   * loop on Edit Analysis first load.
   * GET /visuals/:analysisId?include=config
   */
  listVisualsWithConfig(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES_VISUAL.LIST + analysisId + '?include=config', {
        skipLoader: true,
      }),
    );
  }

  // ── Visual CRUD (Slice 3) ─────────────────────────────────────────
  // Dedicated per-visual endpoints. The bulk `updateAnalyses` path
  // (which spawns a new analysis version and rewrites every visual)
  // stays for the Save-analysis flow; these are for surgical single-
  // visual mutations from the builder. Each maps one-to-one to a BE
  // controller under src/modules/visuals/.
  //
  // A visual payload carries the Visual + VisualConfig fields flattened:
  //   { title, colSpan, rowSpan, widthRatio, heightRatio, xRatio, yRatio,
  //     chartType, xAxisColumn, yAxisColumn, zAxisColumn, config,
  //     crossFilterEnabled?, drillDimensions?, sequence? }
  // The BE splits these across the two 1:1 tables transactionally.

  /**
   * Create a single visual on an analysis.
   * POST /visuals/:analysisId
   */
  async addVisual(analysisId: string, visual: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ANALYSES_VISUAL.ADD + analysisId, visual, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Update a single visual (+ its config) in place.
   * PUT /visuals/:analysisId/:visualId
   */
  async updateVisual(analysisId: string, visualId: string, visual: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          ANALYSES_VISUAL.UPDATE + analysisId + '/' + visualId,
          visual,
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Delete a single visual. Justification flows to the BE audit log,
   * mirroring the analysis/filter delete pattern.
   * DELETE /visuals/:analysisId/:visualId
   */
  async deleteVisual(
    analysisId: string,
    visualId: string,
    justification?: string,
  ) {
    this.setDeleting(visualId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(
          ANALYSES_VISUAL.DELETE + analysisId + '/' + visualId,
          { body: { justification }, skipLoader: true },
        ),
      );
    } finally {
      this.setDeleting(visualId, false);
    }
  }

  /**
   * Persist a new visual ordering. `order` is the ordered list of
   * { id, sequence } — the BE updates each Visual.sequence in one
   * transaction. Used after drag-reorder on the canvas / visual list.
   * PUT /visuals/:analysisId/reorder
   */
  async reorderVisuals(
    analysisId: string,
    order: Array<{ id: string; sequence: number }>,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          ANALYSES_VISUAL.REORDER_PREFIX +
            analysisId +
            ANALYSES_VISUAL.REORDER_SUFFIX,
          { order },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateAnalyses(payload: any, justification?: string) {
    const { id, name, description, datasetId, datasource, visuals } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        // PUT /analyses/:analysisId — id moves to path.
        this.http.apiPut(
          ANALYSES.UPDATE + id,
          {
            id,
            name,
            description,
            datasetId,
            datasource,
            visuals,
            justification,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewSystemAdmin(id: string) {
    return lastValueFrom(
      this.http.apiGet(SYSTEM_ADMIN.GET + `${id}`, { skipLoader: true }),
    );
  }

  updateSystemAdmin(systemAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      systemAdminForm.value;
    return lastValueFrom(
      this.http.apiPut(
        SYSTEM_ADMIN.UPDATE + id,
        {
          id,
          firstName,
          lastName,
          username,
          email,
          mobile,
          status: status ? 1 : 0,
        },
        { skipLoader: true },
      ),
    );
  }

  viewDataset(id: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.GET + id, { skipLoader: true }),
    );
  }

  updateDatasetMapping(payload: any) {
    const { mappingId, datasetId, columnNameToView } = payload;
    // PUT /datasets/:datasetId/fields/:fieldId
    return lastValueFrom(
      this.http.apiPut(
        DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + mappingId,
        {
          mappingId,
          datasetId,
          columnNameToView,
        },
        { skipLoader: true },
      ),
    );
  }

  updateDatasource(payload: any) {
    const {
      id,
      name,
      description,
      type,
      host,
      port,
      datasource,
      username,
      password,
      isMasterDB,
      status,
    } = payload;
    return lastValueFrom(
      this.http.apiPut(
        DATASOURCE.UPDATE + id,
        {
          id,
          name,
          description,
          type,
          host,
          port,
          datasource,
          username,
          password,
          isMasterDB,
          status,
        },
        { skipLoader: true },
      ),
    );
  }

  listDatasourceSchemas(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.LIST_SCHEMAS_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  listSchemaTables(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT.replace(/\/$/, ''),
        { skipLoader: true },
      ),
    );
  }

  listTableColumns(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT +
          params.tableName +
          DATASOURCE.COLUMNS_SEGMENT,
        { skipLoader: true },
      ),
    );
  }

  getDataset(datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.GET + datasetId, { skipLoader: true }),
    );
  }

  /**
   * Get combined fields for an analysis (dataset-level + analysis-level)
   * GET /analyses/:analysisId/fields
   */
  getAnalysisFields(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(
        ANALYSES.FIELDS_PREFIX + analysisId + ANALYSES.FIELDS_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  /**
   * Distinct values for any field on an analysis — raw dataset column
   * OR custom field at the dataset/analysis level. The BE decides
   * which path to take based on whether the field has customLogic.
   *
   * POST /analyses/:analysisId/distinct-values
   * body: { fieldName, search?, page?, pageSize? }
   *
   * Replaces the dataset-scoped getDistinctColumnValues for callers
   * that have an analysis context. RLS rule editor still uses the
   * old dataset-scoped endpoint — RLS conditions can't reference
   * analysis-level fields anyway, so the split is intentional.
   */
  getDistinctFieldValues(
    analysisId: string,
    fieldName: string,
    options?: { search?: string; page?: number; pageSize?: number },
  ) {
    return lastValueFrom(
      this.http.apiPost(
        ANALYSES.DISTINCT_VALUES_PREFIX +
          analysisId +
          ANALYSES.DISTINCT_VALUES_SUFFIX,
        {
          fieldName,
          ...(options?.search !== undefined ? { search: options.search } : {}),
          ...(options?.page !== undefined ? { page: options.page } : {}),
          ...(options?.pageSize !== undefined
            ? { pageSize: options.pageSize }
            : {}),
        },
        { skipLoader: true },
      ),
    );
  }

  updateDataset(payload: any) {
    const { id, name, description, datasource, sql } = payload;
    return lastValueFrom(
      this.http.apiPut(
        DATASET.UPDATE + id,
        {
          id,
          name,
          description,
          datasource,
          sql,
        },
        { skipLoader: true },
      ),
    );
  }

  async addFilters(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ANALYSIS_FILTER.ADD, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateFilter(payload: any) {
    this._saving.set(true);
    try {
      // PUT /analysis-filters/:filterId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(
          ANALYSIS_FILTER.UPDATE + payload.id,
          payload,
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFilter(filterId: string, justification?: string) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ANALYSIS_FILTER.DELETE + filterId, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  listFilters(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSIS_FILTER.LIST + analysisId, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Batched dropdown-values fetch. Returns options for any number of
   * filters in one round trip. Per-filter errors don't fail the
   * batch — each filterId in the response carries its own ok/error.
   *
   * Body shape:
   *   { analysisId, requests: [{ filterId, search?, page?, pageSize?, parentSelections? }, ...] }
   * Response shape:
   *   { status: true, data: { results: { [filterId]: FilterValuesResult } } }
   */
  getFilterValuesBatch(payload: {
    analysisId: string;
    // 'open' tells the BE to list + fetch values in one trip;
    // 'fetch' (default) is the lazy per-dropdown form.
    mode?: 'open' | 'fetch';
    requests: Array<{
      filterId: string;
      search?: string;
      page?: number;
      pageSize?: number;
      // Cascading filters (Slice D, item 3): parent filter selections
      // used to constrain this filter's distinct values. Keyed by
      // parent filterId → selected value(s). Accepted by the BE Joi
      // schema today; honoured once the BE cascade query support lands.
      parentSelections?: Record<string, (string | number)[]>;
    }>;
  }) {
    return lastValueFrom(
      this.http.apiPost(ANALYSIS_FILTER.VALUES_BATCH, payload, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Run a dataset query in the context of an analysis.
   * Returns data enriched with both dataset-level and analysis-level custom fields.
   * POST /analyses/:analysisId/run
   *
   * `parameters` (spec §4.1/§6): resolved `{ key, value }` pairs for the
   * analysis's typed parameters. The BE substitutes them into the dataset
   * SQL as `{{param.<key>}}` at compile time (parameterized, not
   * string-concatenated). Omitted when empty so an analysis with no
   * parameters sends the same payload as before.
   */
  async runAnalysisQuery(payload: {
    datasetId: string;
    analysisId: string;
    filters?: any[];
    parameters?: Array<{ key: string; value: any }>;
    limit?: number;
    // Force a live re-run + cache re-store, bypassing any fresh cached
    // entry. Wired to the "refresh cached data" action; omitted (falsy)
    // for a normal run so a cache hit is served when available.
    refresh?: boolean;
    // Pivot totals config (Feature 5): asks the BE to append grand-total
    // + per-group subtotal rows, returned at response.meta.pivotTotals.
    // Shape validated by shared/validators/pivotTotals.ts. Omitted (and
    // thus a byte-identical payload) when no table visual requests totals.
    pivotTotals?: any;
  }) {
    const { datasetId, analysisId, filters, parameters, limit, refresh, pivotTotals } =
      payload;
    const body: any = { datasetId, analysisId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    if (parameters && parameters.length > 0) {
      body.parameters = parameters;
    }
    if (limit !== undefined) {
      body.limit = limit;
    }
    if (refresh) {
      body.refresh = true;
    }
    if (pivotTotals) {
      body.pivotTotals = pivotTotals;
    }
    this._running.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.RUN_QUERY_PREFIX + analysisId + ANALYSES.RUN_QUERY_SUFFIX,
          body,
          { skipLoader: true },
        ),
      );
    } finally {
      this._running.set(false);
    }
  }

  // ── Analysis parameters (Slice 4) ─────────────────────────────────
  // Typed reusable inputs on an analysis. CRUD mirrors the analysis-
  // filter methods above; the BE module lives at
  // src/modules/analysis-parameters/ and the shared Zod contract at
  // src/app/shared/validators/analysis-parameters.ts.

  /**
   * List an analysis's parameters (ordered by sequence).
   * GET /analysis-parameters/:analysisId
   */
  listParameters(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSIS_PARAMETER.LIST + analysisId, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Create a parameter on an analysis.
   * POST /analysis-parameters
   */
  async addParameter(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ANALYSIS_PARAMETER.ADD, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Update a parameter.
   * PUT /analysis-parameters/:parameterId
   */
  async updateParameter(parameterId: string, payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(ANALYSIS_PARAMETER.UPDATE + parameterId, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Delete a parameter. Justification flows to the BE audit log.
   * DELETE /analysis-parameters/:parameterId
   */
  async deleteParameter(parameterId: string, justification?: string) {
    this.setDeleting(parameterId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ANALYSIS_PARAMETER.DELETE + parameterId, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(parameterId, false);
    }
  }
}
