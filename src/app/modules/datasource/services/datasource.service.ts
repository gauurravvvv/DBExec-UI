import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DATASOURCE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class DatasourceService {
  private _datasources  = signal<any[]>([]);
  private _total        = signal(0);
  private _current      = signal<any>(null);
  private _loading      = signal(false);
  private _saving       = signal(false);
  private _schemas      = signal<any[]>([]);
  private _queryLoading = signal(false);

  readonly datasources  = this._datasources.asReadonly();
  readonly total        = this._total.asReadonly();
  readonly current      = this._current.asReadonly();
  readonly loading      = this._loading.asReadonly();
  readonly saving       = this._saving.asReadonly();
  readonly schemas      = this._schemas.asReadonly();
  readonly queryLoading = this._queryLoading.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(DATASOURCE.LIST, { params }));
      if (res?.status) {
        this._datasources.set(res.data.datasources ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally { this._loading.set(false); }
  }

  async loadOne(orgId: string, id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(DATASOURCE.VIEW + `${orgId}/${id}`));
      if (res?.status) this._current.set(res.data);
    } finally { this._loading.set(false); }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      const { name, description, type, host, port, database, username, password, organisation } = payload;
      return await lastValueFrom(this.http.apiPost(DATASOURCE.ADD, {
        name, description, type, host, port, database, username, password, organisation,
      }));
    } finally { this._saving.set(false); }
  }

  async update(payload: any, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const { id, name, description, type, host, port, database, username, password, organisation, status } = payload;
      return await lastValueFrom(this.http.apiPut(DATASOURCE.UPDATE, {
        id, name, description, type, host, port, database, username, password, organisation, status, justification,
      }));
    } finally { this._saving.set(false); }
  }

  async delete(orgId: string, id: string, justification?: string): Promise<any> {
    // NOTE: API uses POST for delete (intentional)
    return await lastValueFrom(this.http.apiPost(DATASOURCE.DELETE + `${orgId}/${id}`, { justification }));
  }

  async bulkDelete(ids: string[], justification: string | undefined, orgId: string): Promise<any> {
    // NOTE: API uses POST for bulk delete (intentional)
    return await lastValueFrom(this.http.apiPost(DATASOURCE.BULK_DELETE + `${orgId}`, { ids, justification }));
  }

  resetCurrent() { this._current.set(null); }

  async loadSchemas(orgId: string, datasourceId: string) {
    try {
      const res: any = await lastValueFrom(this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS + `${orgId}/${datasourceId}`,
      ));
      if (res?.status) this._schemas.set(res.data ?? []);
    } catch {
      this._schemas.set([]);
    }
  }

  // These methods are used by other modules and view — keep as-is
  listDatasourceSchemas(params: any) {
    return lastValueFrom(this.http.apiGet(
      DATASOURCE.LIST_SCHEMAS + `${params.orgId}/${params.datasourceId}`,
    ));
  }

  listSchemaTables(params: any) {
    return lastValueFrom(this.http.apiGet(
      DATASOURCE.LIST_SCHEMA_TABLES + `${params.orgId}/${params.datasourceId}/${params.schemaName}`,
    ));
  }

  listTableColumns(params: any) {
    return lastValueFrom(this.http.apiGet(
      DATASOURCE.LIST_TABLE_COLUMNS + `${params.orgId}/${params.datasourceId}/${params.schemaName}/${params.tableName}`,
    ));
  }

  async runQuery(params: any): Promise<any> {
    this._queryLoading.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(DATASOURCE.RUN_QUERY, {
        orgId: params.orgId,
        datasourceId: params.datasourceId,
        query: params.query,
      }));
    } finally { this._queryLoading.set(false); }
  }

  // Legacy methods for external callers
  listDatasource(params: any) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.LIST, { params }));
  }

  viewDatasource(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.VIEW + `${orgId}/${id}`));
  }
}
