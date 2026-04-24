import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DATASOURCE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class DatasourceService {
  constructor(private http: HttpClientService) {}

  listDatasource(params: any) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.LIST, { params }));
  }

  deleteDatasource(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiPost(DATASOURCE.DELETE + `${orgId}/${id}`, { justification }));
  }

  addDatasource(payload: any) {
    const { name, description, type, host, port, database, username, password, organisation } = payload;
    return lastValueFrom(this.http.apiPost(DATASOURCE.ADD, {
      name, description, type, host, port, database, username, password, organisation,
    }));
  }

  viewDatasource(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASOURCE.VIEW + `${orgId}/${id}`));
  }

  updateDatasource(payload: any, justification?: string) {
    const { id, name, description, type, host, port, database, username, password, organisation, status } = payload;
    return lastValueFrom(this.http.apiPut(DATASOURCE.UPDATE, {
      id, name, description, type, host, port, database, username, password, organisation, status, justification,
    }));
  }

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

  bulkDeleteDatasource(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiPost(DATASOURCE.BULK_DELETE + `${orgId}`, { ids, justification }));
  }

  runQuery(params: any) {
    return lastValueFrom(this.http.apiPost(DATASOURCE.RUN_QUERY, {
      orgId: params.orgId,
      datasourceId: params.datasourceId,
      query: params.query,
    }));
  }
}
