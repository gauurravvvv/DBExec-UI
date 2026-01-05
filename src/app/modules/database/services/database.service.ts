import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DATABASE } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  constructor(private http: HttpClient) {}

  listDatabase(params: any) {
    return this.http
      .get(
        DATABASE.LIST +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listAllDatabase(params: any) {
    return this.http
      .get(
        DATABASE.LIST_ALL +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDatabase(
    orgId: string,
    id: string,
    isMasterDb: string,
    deleteConfiguration: boolean
  ) {
    return this.http
      .post(DATABASE.DELETE + `${orgId}/${id}/${isMasterDb}`, {
        deleteConfiguration,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addDatabase(payload: any) {
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
      isMasterDB,
      adminCredentials,
    } = payload;

    const requestBody: any = {
      name,
      description,
      type,
      host,
      port,
      database,
      username,
      password,
      organisation,
      isMasterDB,
    };

    if (adminCredentials) {
      requestBody.adminCredentials = {
        email: adminCredentials.email,
        phone: adminCredentials.phone,
        password: adminCredentials.password,
      };
    }

    return this.http
      .post(DATABASE.ADD, requestBody)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewDatabase(orgId: string, id: string, isMasterDb: string) {
    return this.http
      .get(DATABASE.VIEW + `${orgId}/${id}/${isMasterDb}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDatabase(payload: any) {
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
      isMasterDB,
      status,
    } = payload;
    return this.http
      .put(DATABASE.UPDATE, {
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
        isMasterDB,
        status,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listDatabaseSchemas(params: any) {
    return this.http
      .get(DATABASE.LIST_SCHEMAS + `${params.orgId}` + `/${params.databaseId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listSchemaTables(params: any) {
    return this.http
      .get(
        DATABASE.LIST_SCHEMA_TABLES +
          `${params.orgId}` +
          `/${params.databaseId}` +
          `/${params.schemaName}`
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
        DATABASE.LIST_TABLE_COLUMNS +
          `${params.orgId}` +
          `/${params.databaseId}` +
          `/${params.schemaName}` +
          `/${params.tableName}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  runQuery(params: any) {
    return this.http
      .post(DATABASE.RUN_QUERY, {
        orgId: params.orgId,
        databaseId: params.databaseId,
        query: params.query,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
