import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import {
  ANALYSES,
  ANALYSES_VISUAL,
  ANALYSIS_FILTER,
  DATASET,
  DATASOURCE,
  SYSTEM_ADMIN,
} from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class AnalysesService {
  private _saving = signal(false);
  private _running = signal(false);

  readonly saving = this._saving.asReadonly();
  readonly running = this._running.asReadonly();

  constructor(private http: HttpClientService) {}

  listDatasets(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASET.LIST +
          `/${params.orgId}/${params.datasourceId}/${params.pageNumber}/${params.limit}`,
      ),
    );
  }

  deleteDataset(orgId: string, datasetId: string) {
    return lastValueFrom(
      this.http.apiDelete(DATASET.DELETE + `${orgId}/${datasetId}`),
    );
  }

  async addAnalyses(payload: any) {
    const { name, description, datasetId, organisation, datasource } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ANALYSES.ADD, {
          name,
          description,
          datasetId,
          organisation,
          datasource,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  listAnalyses(params: any) {
    return lastValueFrom(this.http.apiGet(ANALYSES.LIST, { params }));
  }

  async deleteAnalyses(
    orgId: string,
    analysisId: string,
    justification?: string,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ANALYSES.DELETE + `${orgId}/${analysisId}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDeleteAnalyses(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.BULK_DELETE_PREFIX + orgId + ANALYSES.BULK_DELETE_SUFFIX,
          { ids, justification },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewAnalyses(orgId: string, analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES.GET + `${orgId}/${analysisId}`),
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
   * GET /analyses/:orgId/:analysisId/bootstrap
   */
  getBootstrap(orgId: string, analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(
        ANALYSES.BOOTSTRAP_PREFIX +
          `${orgId}/${analysisId}` +
          ANALYSES.BOOTSTRAP_SUFFIX,
      ),
    );
  }

  /**
   * List all visuals for an analysis (skeleton data only).
   * GET /visuals/:orgId/:analysisId
   */
  listVisuals(orgId: string, analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSES_VISUAL.LIST + `${orgId}/${analysisId}`),
    );
  }

  /**
   * Hydrated list — every visual ships with its visualConfig
   * already populated. Replaces the N+1 listVisuals + getVisual
   * loop on Edit Analysis first load.
   * GET /visuals/:orgId/:analysisId?include=config
   */
  listVisualsWithConfig(orgId: string, analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(
        ANALYSES_VISUAL.LIST + `${orgId}/${analysisId}?include=config`,
      ),
    );
  }

  async updateAnalyses(payload: any, justification?: string) {
    const {
      id,
      name,
      description,
      datasetId,
      organisation,
      datasource,
      visuals,
    } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        // PUT /analyses/:orgId/:analysisId — id moves to path.
        this.http.apiPut(ANALYSES.UPDATE + `${organisation}/${id}`, {
          id,
          name,
          description,
          datasetId,
          organisation,
          datasource,
          visuals,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewSystemAdmin(id: string) {
    return lastValueFrom(this.http.apiGet(SYSTEM_ADMIN.GET + `${id}`));
  }

  updateSystemAdmin(systemAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      systemAdminForm.value;
    return lastValueFrom(
      this.http.apiPut(SYSTEM_ADMIN.UPDATE + id, {
        id,
        firstName,
        lastName,
        username,
        email,
        mobile,
        status: status ? 1 : 0,
      }),
    );
  }

  viewDataset(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASET.GET + `${orgId}/${id}`));
  }

  updateDatasetMapping(payload: any) {
    const { mappingId, datasetId, organisation, columnNameToView } = payload;
    // PUT /datasets/:orgId/:datasetId/fields/:fieldId
    return lastValueFrom(
      this.http.apiPut(
        DATASET.GET +
          `${organisation}/${datasetId}` +
          DATASET.FIELD_SEGMENT +
          mappingId,
        {
          mappingId,
          datasetId,
          organisation,
          columnNameToView,
        },
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
      organisation,
      isMasterDB,
      status,
    } = payload;
    return lastValueFrom(
      this.http.apiPut(DATASOURCE.UPDATE + `${organisation}/${id}`, {
        id,
        name,
        description,
        type,
        host,
        port,
        datasource,
        username,
        password,
        organisation,
        isMasterDB,
        status,
      }),
    );
  }

  listDatasourceSchemas(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.LIST_SCHEMAS_SUFFIX,
      ),
    );
  }

  listSchemaTables(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT.replace(/\/$/, ''),
      ),
    );
  }

  listTableColumns(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT +
          params.tableName +
          DATASOURCE.COLUMNS_SEGMENT,
      ),
    );
  }

  getDataset(orgId: string, datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.GET + `${orgId}/${datasetId}`),
    );
  }

  /**
   * Get combined fields for an analysis (dataset-level + analysis-level)
   * GET /analyses/get/fields/:orgId/:analysisId
   */
  getAnalysisFields(orgId: string, analysisId: string) {
    // GET /analyses/:orgId/:analysisId/fields
    return lastValueFrom(
      this.http.apiGet(
        ANALYSES.FIELDS_PREFIX +
          `${orgId}/${analysisId}` +
          ANALYSES.FIELDS_SUFFIX,
      ),
    );
  }

  /**
   * Distinct values for any field on an analysis — raw dataset column
   * OR custom field at the dataset/analysis level. The BE decides
   * which path to take based on whether the field has customLogic.
   *
   * POST /analyses/distinct-values/:orgId/:analysisId
   * body: { fieldName, search?, page?, pageSize? }
   *
   * Replaces the dataset-scoped getDistinctColumnValues for callers
   * that have an analysis context. RLS rule editor still uses the
   * old dataset-scoped endpoint — RLS conditions can't reference
   * analysis-level fields anyway, so the split is intentional.
   */
  getDistinctFieldValues(
    orgId: string,
    analysisId: string,
    fieldName: string,
    options?: { search?: string; page?: number; pageSize?: number },
  ) {
    return lastValueFrom(
      this.http.apiPost(
        ANALYSES.DISTINCT_VALUES_PREFIX +
          `${orgId}/${analysisId}` +
          ANALYSES.DISTINCT_VALUES_SUFFIX,
        {
          fieldName,
          ...(options?.search !== undefined ? { search: options.search } : {}),
          ...(options?.page !== undefined ? { page: options.page } : {}),
          ...(options?.pageSize !== undefined
            ? { pageSize: options.pageSize }
            : {}),
        },
      ),
    );
  }

  updateDataset(payload: any) {
    const { id, name, description, organisation, datasource, sql } = payload;
    return lastValueFrom(
      this.http.apiPut(DATASET.UPDATE + `${organisation}/${id}`, {
        id,
        name,
        description,
        organisation,
        datasource,
        sql,
      }),
    );
  }

  async addFilters(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ANALYSIS_FILTER.ADD, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateFilter(payload: any) {
    this._saving.set(true);
    try {
      // PUT /analysis-filters/:orgId/:filterId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(
          ANALYSIS_FILTER.UPDATE + `${payload.organisation}/${payload.id}`,
          payload,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFilter(orgId: string, filterId: string, justification?: string) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ANALYSIS_FILTER.DELETE + `${orgId}/${filterId}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  listFilters(orgId: string, analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSIS_FILTER.LIST + `${orgId}/${analysisId}`),
    );
  }

  /**
   * Batched dropdown-values fetch. Returns options for any number of
   * filters in one round trip. Per-filter errors don't fail the
   * batch — each filterId in the response carries its own ok/error.
   *
   * Body shape:
   *   { analysisId, requests: [{ filterId, search?, page?, pageSize? }, ...] }
   * Response shape:
   *   { status: true, data: { results: { [filterId]: FilterValuesResult } } }
   */
  getFilterValuesBatch(payload: {
    // `organisation` is REQUIRED — every other analysis-filter call
    // sends it (see addFilters, updateFilter, deleteFilter). The BE
    // VerifyMasterDatabaseMiddleware reads it to resolve the org's
    // shared-DB connection. Omitting it causes the middleware to fall
    // through to the loggedInOrgId fallback, which for system admins
    // on the default org leaves master_db_connection undefined and
    // crashes the controller.
    organisation: string;
    analysisId: string;
    // 'open' tells the BE to list + fetch values in one trip;
    // 'fetch' (default) is the lazy per-dropdown form.
    mode?: 'open' | 'fetch';
    requests: Array<{
      filterId: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }>;
  }) {
    return lastValueFrom(
      this.http.apiPost(ANALYSIS_FILTER.VALUES_BATCH, payload),
    );
  }

  /**
   * Run a dataset query in the context of an analysis.
   * Returns data enriched with both dataset-level and analysis-level custom fields.
   * POST /analyses/run
   */
  async runAnalysisQuery(payload: {
    datasetId: string;
    analysisId: string;
    organisation: string;
    filters?: any[];
    limit?: number;
  }) {
    const { datasetId, analysisId, organisation, filters, limit } = payload;
    const body: any = { organisation, datasetId, analysisId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    if (limit !== undefined) {
      body.limit = limit;
    }
    this._running.set(true);
    try {
      // POST /analyses/:orgId/:analysisId/run
      return await lastValueFrom(
        this.http.apiPost(
          ANALYSES.RUN_QUERY_PREFIX +
            `${organisation}/${analysisId}` +
            ANALYSES.RUN_QUERY_SUFFIX,
          body,
        ),
      );
    } finally {
      this._running.set(false);
    }
  }
}
