import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { DATASOURCE, DATASET, SUPER_ADMIN } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  constructor(private http: HttpClientService) {}

  listDatasets(params: any) {
    return lastValueFrom(this.http.apiGet(DATASET.LIST, { params }));
  }

  deleteDataset(orgId: string, datasetId: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(
      DATASET.DELETE + `${orgId}/${datasetId}`,
      { body: { justification } },
    ));
  }

  bulkDeleteDataset(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(
      DATASET.BULK_DELETE + `${orgId}`,
      { body: { ids, justification } },
    ));
  }

  addDataset(payload: any) {
    const { name, description, organisation, datasource, sql } = payload;
    return lastValueFrom(this.http.apiPost(DATASET.ADD, {
      name, description, organisation, datasource, sql,
    }));
  }

  addDatasetViaBuilder(payload: any) {
    return lastValueFrom(this.http.apiPost(DATASET.ADD_VIA_BUILDER, payload));
  }

  updateDatasetViaBuilder(payload: any) {
    return lastValueFrom(this.http.apiPut(DATASET.UPDATE_VIA_BUILDER, payload));
  }

  viewSuperAdmin(id: string) {
    return lastValueFrom(this.http.apiGet(SUPER_ADMIN.VIEW + `${id}`));
  }

  updateSuperAdmin(superAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } = superAdminForm.value;
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UPDATE, {
      id, firstName, lastName, username, email, mobile,
      status: status ? 1 : 0,
    }));
  }

  viewDataset(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASET.VIEW + `${orgId}/${id}`));
  }

  viewDatasetField(orgId: string, datasetId: string, fieldId: string) {
    return lastValueFrom(this.http.apiGet(DATASET.VIEW_FIELD + `${orgId}/${datasetId}/${fieldId}`));
  }

  updateDatasetMapping(payload: any) {
    const {
      fieldId, datasetId, organisation, columnNameToView,
      customLogic, used_field_ids, dataType,
    } = payload;

    const requestBody: any = {
      fieldId, datasetId, organisation, columnNameToView, used_field_ids,
    };

    // Include customLogic only if provided (for custom fields)
    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }

    // Include dataType if provided
    if (dataType !== undefined) {
      requestBody.dataType = dataType;
    }

    return lastValueFrom(this.http.apiPut(DATASET.UPDATE_FIELD, requestBody));
  }

  updateDatasource(payload: any) {
    const {
      id, name, description, type, host, port, datasource,
      username, password, organisation, isMasterDB, status,
    } = payload;
    return lastValueFrom(this.http.apiPut(DATASOURCE.UPDATE, {
      id, name, description, type, host, port, datasource,
      username, password, organisation, isMasterDB, status,
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

  getDataset(orgId: string, datasetId: string) {
    return lastValueFrom(this.http.apiGet(DATASET.VIEW + `${orgId}/${datasetId}`));
  }

  updateDataset(payload: any, justification?: string) {
    const { id, name, description, organisation, datasource, sql } = payload;
    return lastValueFrom(this.http.apiPut(DATASET.UPDATE, {
      id, name, description, organisation, datasource, sql, justification,
    }));
  }

  validateCustomField(payload: any) {
    const { datasetId, organisation, customLogic } = payload;
    return lastValueFrom(this.http.apiPost(DATASET.VALIDATE_FIELD, {
      organisation, datasetId, customLogic,
    }));
  }

  addCustomField(payload: any) {
    const {
      organisation, datasetId, name, customLogic, used_field_ids, dataType, analysisId,
    } = payload;
    const requestBody: any = {
      organisation, datasetId, name, customLogic, used_field_ids,
    };

    // Include dataType if provided
    if (dataType) {
      requestBody.dataType = dataType;
    }

    // Include analysisId for analysis-level custom fields
    if (analysisId) {
      requestBody.analysisId = analysisId;
    }

    return lastValueFrom(this.http.apiPost(DATASET.ADD_FIELD, requestBody));
  }

  duplicateDataset(orgId: string, datasetId: string, name: string, description: string) {
    return lastValueFrom(this.http.apiPost(DATASET.DUPLICATE + `${orgId}/${datasetId}`, { name, description }));
  }

  runDatasetQuery(payload: any) {
    const { datasetId, organisation, filters } = payload;
    const body: any = { organisation, datasetId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    return lastValueFrom(this.http.apiPost(DATASET.RUN_QUERY, body));
  }

  getDistinctColumnValues(orgId: string, datasetId: string, columnName: string) {
    return lastValueFrom(this.http.apiPost(DATASET.DISTINCT_VALUES + `${orgId}/${datasetId}`, { columnName }));
  }

  deleteDatasetField(orgId: string, datasetId: string, fieldId: string) {
    return lastValueFrom(this.http.apiDelete(DATASET.DELETE_FIELD + `${orgId}/${datasetId}/${fieldId}`));
  }
}
