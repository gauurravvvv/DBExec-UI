import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DATASOURCE } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DatasourceService {
  constructor(private http: HttpClient) {}

  listDatasource(params: any) {
    return this.http
      .get(DATASOURCE.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDatasource(orgId: string, id: string, justification?: string) {
    return this.http
      .post(DATASOURCE.DELETE + `${orgId}/${id}`, { justification })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addDatasource(payload: any) {
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

    return this.http
      .post(DATASOURCE.ADD, {
        name,
        description,
        type,
        host,
        port,
        database,
        username,
        password,
        organisation,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewDatasource(orgId: string, id: string) {
    return this.http
      .get(DATASOURCE.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDatasource(payload: any, justification?: string) {
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
    return this.http
      .put(DATASOURCE.UPDATE, {
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
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listDatasourceSchemas(params: any) {
    return this.http
      .get(
        DATASOURCE.LIST_SCHEMAS + `${params.orgId}` + `/${params.datasourceId}`,
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listSchemaTables(params: any) {
    return this.http
      .get(
        DATASOURCE.LIST_SCHEMA_TABLES +
          `${params.orgId}` +
          `/${params.datasourceId}` +
          `/${params.schemaName}`,
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listTableColumns(params: any) {
    return this.http
      .get(
        DATASOURCE.LIST_TABLE_COLUMNS +
          `${params.orgId}` +
          `/${params.datasourceId}` +
          `/${params.schemaName}` +
          `/${params.tableName}`,
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  runQuery(params: any) {
    return this.http
      .post(DATASOURCE.RUN_QUERY, {
        orgId: params.orgId,
        datasourceId: params.datasourceId,
        query: params.query,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
