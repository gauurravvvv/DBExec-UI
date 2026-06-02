import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import {
  DATASET,
  DATASOURCE,
  SYSTEM_ADMIN,
} from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DatasetService — list/view/CUD for datasets + their custom fields +
 * the schema/table/column lookups the SQL editor uses.
 *
 * Loading-state for the migrated methods follows the rollout
 * convention: `loading` for list/view, `saving` for writes,
 * `_deleting` as a per-id record so each row's delete button can
 * spin independently. Signal-driven methods all pass
 * `{ skipLoader: true }`.
 *
 * Several methods on this service are still consumed by the old
 * dataset editor (and by analyses) which depends on the global
 * blocker for the schema/table/column fetches + the validate field
 * + the formula validation. Those keep the legacy behavior until
 * each consumer is migrated.
 */
@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  private _datasets = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/edit/list/add
  // dataset ngOnDestroy) can cancel in-flight GETs. Mutations,
  // runDatasetQuery, and schema/table/column lookups don't pipe through.
  private _cancelReads$ = new Subject<void>();

  readonly datasets = this._datasets.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
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

  // ── Signal-based list/view (skeleton-aware) ───────────────────────────
  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DATASET.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._datasets.set(res.data.datasets ?? res.data ?? []);
        this._total.set(res.data.count ?? 0);
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
          .apiGet(DATASET.GET + id, { skipLoader: true })
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

  // ── Legacy methods (still used by some callers) ──────────────────────
  // The list-dataset component still calls listDatasets but wraps it
  // in its own loadingList flag → so we pass skipLoader here too.
  // Other modules that consume listDatasets (analyses dataset picker,
  // etc.) similarly drive their own spinners.
  listDatasets(params: any) {
    return lastValueFrom(
      this.http.apiGet(DATASET.LIST, { params, skipLoader: true }),
    );
  }

  async deleteDataset(datasetId: string, justification?: string) {
    this.setDeleting(datasetId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DATASET.DELETE + datasetId, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(datasetId, false);
    }
  }

  async bulkDeleteDataset(ids: string[], justification?: string) {
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  async addDataset(payload: any) {
    const { name, description, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD,
          {
            name,
            description,
            datasource,
            sql,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addDatasetViaBuilder(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.ADD_VIA_BUILDER, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateDatasetViaBuilder(payload: any) {
    this._saving.set(true);
    try {
      // PUT /datasets/:datasetId/from-builder
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.UPDATE_VIA_BUILDER_PREFIX +
            payload.id +
            DATASET.UPDATE_VIA_BUILDER_SUFFIX,
          payload,
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

  async updateSystemAdmin(systemAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      systemAdminForm.value;
    this._saving.set(true);
    try {
      return await lastValueFrom(
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
    } finally {
      this._saving.set(false);
    }
  }

  viewDataset(id: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.GET + id, { skipLoader: true }),
    );
  }

  viewDatasetField(datasetId: string, fieldId: string) {
    // GET /datasets/:datasetId/fields/:fieldId
    return lastValueFrom(
      this.http.apiGet(
        DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
        { skipLoader: true },
      ),
    );
  }

  async updateDatasetMapping(payload: any) {
    const {
      fieldId,
      datasetId,
      columnNameToView,
      customLogic,
      used_field_ids,
      dataType,
    } = payload;

    const requestBody: any = {
      fieldId,
      datasetId,
      columnNameToView,
      used_field_ids,
    };

    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }
    if (dataType !== undefined) {
      requestBody.dataType = dataType;
    }

    this._saving.set(true);
    try {
      // PUT /datasets/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
          requestBody,
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateDatasource(payload: any) {
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
    this._saving.set(true);
    try {
      return await lastValueFrom(
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
    } finally {
      this._saving.set(false);
    }
  }

  listDatasourceSchemas(params: any) {
    // GET /datasources/:datasourceId/schemas
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
    // GET /datasources/:datasourceId/schemas/:schema/tables
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
    // GET /datasources/:datasourceId/schemas/:schema/tables/:table/columns
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

  async updateDataset(payload: any, justification?: string) {
    const { id, name, description, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.UPDATE + id,
          {
            id,
            name,
            description,
            datasource,
            sql,
            justification,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async validateCustomField(payload: any) {
    const { datasetId, customLogic } = payload;
    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/fields/validate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD_FIELD_PREFIX + datasetId + DATASET.VALIDATE_FIELD_SUFFIX,
          {
            datasetId,
            customLogic,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addCustomField(payload: any) {
    const {
      datasetId,
      name,
      customLogic,
      used_field_ids,
      dataType,
      analysisId,
    } = payload;
    const requestBody: any = {
      datasetId,
      name,
      customLogic,
      used_field_ids,
    };
    if (dataType) requestBody.dataType = dataType;
    if (analysisId) requestBody.analysisId = analysisId;

    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/fields
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD_FIELD_PREFIX + datasetId + DATASET.ADD_FIELD_SUFFIX,
          requestBody,
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async duplicateDataset(datasetId: string, name: string, description: string) {
    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/duplicate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.DUPLICATE_PREFIX + datasetId + DATASET.DUPLICATE_SUFFIX,
          { name, description },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  runDatasetQuery(payload: any) {
    const { datasetId, filters } = payload;
    const body: any = { datasetId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    // POST /datasets/:datasetId/run
    return lastValueFrom(
      this.http.apiPost(
        DATASET.RUN_QUERY_PREFIX + datasetId + DATASET.RUN_QUERY_SUFFIX,
        body,
        { skipLoader: true },
      ),
    );
  }

  getDistinctColumnValues(datasetId: string, columnName: string) {
    // POST /datasets/:datasetId/distinct-values
    return lastValueFrom(
      this.http.apiPost(
        DATASET.DISTINCT_VALUES_PREFIX +
          datasetId +
          DATASET.DISTINCT_VALUES_SUFFIX,
        { columnName },
        { skipLoader: true },
      ),
    );
  }

  async deleteDatasetField(datasetId: string, fieldId: string) {
    this._saving.set(true);
    try {
      // DELETE /datasets/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiDelete(
          DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
