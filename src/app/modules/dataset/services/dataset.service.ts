import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DATABASE, DATASET, SUPER_ADMIN } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  constructor(private http: HttpClient) {}

  listDatasets(params: any) {
    return this.http
      .get(
        DATASET.LIST +
          `/${params.orgId}` +
          `/${params.databaseId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDataset(orgId: string, datasetId: string) {
    return this.http
      .delete(DATASET.DELETE + `${orgId}` + `/${datasetId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addDataset(payload: any) {
    const { name, description, organisation, database, sql } = payload;

    return this.http
      .post(DATASET.ADD, {
        name,
        description,
        organisation,
        database,
        sql,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewSuperAdmin(id: string) {
    return this.http
      .get(SUPER_ADMIN.VIEW + `${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewDataset(orgId: string, id: string) {
    return this.http
      .get(DATASET.VIEW + `${orgId}` + `/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewDatasetField(orgId: string, datasetId: string, fieldId: string) {
    return this.http
      .get(DATASET.VIEW_FIELD + `${orgId}` + `/${datasetId}` + `/${fieldId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDatasetMapping(payload: any) {
    const { fieldId, datasetId, organisation, columnNameToView, customLogic } =
      payload;

    const requestBody: any = {
      fieldId,
      datasetId,
      organisation,
      columnNameToView,
    };

    // Include customLogic only if provided (for custom fields)
    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }

    return this.http
      .put(DATASET.UPDATE_FIELD, requestBody)
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

  getDataset(orgId: string, datasetId: string) {
    return this.http
      .get(DATASET.VIEW + `${orgId}/${datasetId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDataset(payload: any) {
    const { id, name, description, organisation, database, sql } = payload;

    return this.http
      .put(DATASET.UPDATE, {
        id,
        name,
        description,
        organisation,
        database,
        sql,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  validateCustomField(payload: any) {
    const { datasetId, organisation, customLogic } = payload;
    return this.http
      .post(DATASET.VALIDATE_FIELD, {
        organisation,
        datasetId,
        customLogic,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addCustomField(payload: any) {
    const { organisation, datasetId, name, customLogic } = payload;
    return this.http
      .post(DATASET.ADD_FIELD, {
        organisation,
        datasetId,
        name,
        customLogic,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
