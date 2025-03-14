import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { DATABASE, DATASET, SUPER_ADMIN } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  constructor(private http: HttpClient) {}

  listDatasets(params: IParams) {
    return this.http
      .get(
        DATASET.LIST +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteDataset(orgId: string, datasetId: string) {
    return this.http.delete(DATASET.DELETE + `${orgId}` + `/${datasetId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  addDataset(payload: any) {
    const { name, description, organisation, database, columnMappings } =
      payload;

    return this.http
      .post(DATASET.ADD, {
        name,
        description,
        organisation,
        database,
        columnMappings,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  viewSuperAdmin(id: string) {
    return this.http.get(SUPER_ADMIN.VIEW + `${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  updateSuperAdmin(superAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      superAdminForm.value;
    return this.http
      .put(SUPER_ADMIN.UPDATE, {
        id,
        firstName,
        lastName,
        username,
        email,
        mobile,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  viewDatabase(id: string) {
    return this.http.get(DATABASE.VIEW + `${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  listDatabaseSchemas(params: any) {
    return this.http
      .get(DATABASE.LIST_SCHEMAS + `${params.orgId}` + `/${params.databaseId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  listSchemaTables(params: any) {
    return this.http
      .get(
        DATABASE.LIST_SCHEMA_TABLES +
          `${params.orgId}` +
          `/${params.databaseId}` +
          `/${params.schemaName}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
