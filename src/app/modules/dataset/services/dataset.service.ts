import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DATASOURCE, DATASET, SUPER_ADMIN } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  constructor(private http: HttpClient) {}

  listDatasets(params: any) {
    return this.http
      .get(DATASET.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDataset(orgId: string, datasetId: string, justification?: string) {
    const url = DATASET.DELETE + `${orgId}` + `/${datasetId}`;
    return this.http
      .request('DELETE', url, { body: { justification } })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addDataset(payload: any) {
    const { name, description, organisation, datasource, sql } = payload;

    return this.http
      .post(DATASET.ADD, {
        name,
        description,
        organisation,
        datasource,
        sql,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addDatasetViaBuilder(payload: any) {
    return this.http
      .post(DATASET.ADD_VIA_BUILDER, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDatasetViaBuilder(payload: any) {
    return this.http
      .put(DATASET.UPDATE_VIA_BUILDER, payload)
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
    const {
      fieldId,
      datasetId,
      organisation,
      columnNameToView,
      customLogic,
      used_field_ids,
      dataType,
    } = payload;

    const requestBody: any = {
      fieldId,
      datasetId,
      organisation,
      columnNameToView,
      used_field_ids,
    };

    // Include customLogic only if provided (for custom fields)
    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }

    // Include dataType if provided
    if (dataType !== undefined) {
      requestBody.dataType = dataType;
    }

    return this.http
      .put(DATASET.UPDATE_FIELD, requestBody)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
    return this.http
      .put(DATASOURCE.UPDATE, {
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

  getDataset(orgId: string, datasetId: string) {
    return this.http
      .get(DATASET.VIEW + `${orgId}/${datasetId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDataset(payload: any, justification?: string) {
    const { id, name, description, organisation, datasource, sql } = payload;

    return this.http
      .put(DATASET.UPDATE, {
        id,
        name,
        description,
        organisation,
        datasource,
        sql,
        justification,
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
    const {
      organisation,
      datasetId,
      name,
      customLogic,
      used_field_ids,
      dataType,
      analysisId,
    } = payload;
    const requestBody: any = {
      organisation,
      datasetId,
      name,
      customLogic,
      used_field_ids,
    };

    // Include dataType if provided
    if (dataType) {
      requestBody.dataType = dataType;
    }

    // Include analysisId for analysis-level custom fields
    if (analysisId) {
      requestBody.analysisId = analysisId;
    }

    return this.http
      .post(DATASET.ADD_FIELD, requestBody)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  duplicateDataset(
    orgId: string,
    datasetId: string,
    name: string,
    description: string,
  ) {
    return this.http
      .post(DATASET.DUPLICATE + `${orgId}/${datasetId}`, { name, description })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  runDatasetQuery(payload: any) {
    const { datasetId, organisation, filters } = payload;
    const body: any = { organisation, datasetId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    return this.http
      .post(DATASET.RUN_QUERY, body)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getDistinctColumnValues(orgId: string, datasetId: string, columnName: string) {
    return this.http
      .post(DATASET.DISTINCT_VALUES + `${orgId}/${datasetId}`, { columnName })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDatasetField(orgId: string, datasetId: string, fieldId: string) {
    return this.http
      .delete(DATASET.DELETE_FIELD + `${orgId}/${datasetId}/${fieldId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
