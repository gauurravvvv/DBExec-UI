import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DATASOURCE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class DatasourceService {
  private _datasources = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _schemas = signal<any[]>([]);
  private _queryLoading = signal(false);

  readonly datasources = this._datasources.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly schemas = this._schemas.asReadonly();
  readonly queryLoading = this._queryLoading.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DATASOURCE.LIST, { params }),
      );
      if (res?.status) {
        this._datasources.set(res.data.datasources ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DATASOURCE.GET + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      const {
        name,
        description,
        type,
        host,
        port,
        database,
        username,
        password,
        organisation,
      } = payload;
      return await lastValueFrom(
        this.http.apiPost(DATASOURCE.ADD, {
          name,
          description,
          type,
          host,
          port,
          database,
          username,
          password,
          organisation,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const {
        id,
        name,
        description,
        type,
        host,
        port,
        database,
        username,
        password,
        organisation,
        status,
      } = payload;
      return await lastValueFrom(
        // PUT /datasources/:orgId/:id
        this.http.apiPut(DATASOURCE.UPDATE + `${organisation}/${id}`, {
          id,
          name,
          description,
          type,
          host,
          port,
          database,
          username,
          password,
          organisation,
          status,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(
    orgId: string,
    id: string,
    justification?: string,
  ): Promise<any> {
    // DELETE /datasources/:orgId/:id — body carries justification.
    return await lastValueFrom(
      this.http.apiDelete(DATASOURCE.DELETE + `${orgId}/${id}`, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    // POST /datasources/:orgId/bulk-delete
    return await lastValueFrom(
      this.http.apiPost(
        DATASOURCE.BULK_DELETE_PREFIX + orgId + DATASOURCE.BULK_DELETE_SUFFIX,
        { ids, justification },
      ),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }

  async loadSchemas(orgId: string, datasourceId: string) {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(
          DATASOURCE.LIST_SCHEMAS_PREFIX +
            `${orgId}/${datasourceId}` +
            DATASOURCE.LIST_SCHEMAS_SUFFIX,
        ),
      );
      if (res?.status) this._schemas.set(res.data ?? []);
    } catch {
      this._schemas.set([]);
    }
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

  async runQuery(params: any): Promise<any> {
    this._queryLoading.set(true);
    try {
      // POST /datasources/:orgId/:datasourceId/query
      return await lastValueFrom(
        this.http.apiPost(
          DATASOURCE.RUN_QUERY_PREFIX +
            `${params.orgId}/${params.datasourceId}` +
            DATASOURCE.RUN_QUERY_SUFFIX,
          {
            orgId: params.orgId,
            datasourceId: params.datasourceId,
            query: params.query,
          },
        ),
      );
    } finally {
      this._queryLoading.set(false);
    }
  }

  // Legacy methods for external callers
  listDatasource(params: any) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.LIST, { params }));
  }

  viewDatasource(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.GET + `${orgId}/${id}`));
  }
}
