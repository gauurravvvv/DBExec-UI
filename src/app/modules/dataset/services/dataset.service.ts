import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DATASET, DATASOURCE, SUPER_ADMIN } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  private _saving = signal(false);
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  listDatasets(params: any) {
    return lastValueFrom(this.http.apiGet(DATASET.LIST, { params }));
  }

  async deleteDataset(
    orgId: string,
    datasetId: string,
    justification?: string,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DATASET.DELETE + `${orgId}/${datasetId}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDeleteDataset(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DATASET.BULK_DELETE + `${orgId}`, {
          body: { ids, justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addDataset(payload: any) {
    const { name, description, organisation, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.ADD, {
          name,
          description,
          organisation,
          datasource,
          sql,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addDatasetViaBuilder(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.ADD_VIA_BUILDER, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async updateDatasetViaBuilder(payload: any) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASET.UPDATE_VIA_BUILDER, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewSuperAdmin(id: string) {
    return lastValueFrom(this.http.apiGet(SUPER_ADMIN.VIEW + `${id}`));
  }

  async updateSuperAdmin(superAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      superAdminForm.value;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(SUPER_ADMIN.UPDATE, {
          id,
          firstName,
          lastName,
          username,
          email,
          mobile,
          status: status ? 1 : 0,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewDataset(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASET.VIEW + `${orgId}/${id}`));
  }

  viewDatasetField(orgId: string, datasetId: string, fieldId: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.VIEW_FIELD + `${orgId}/${datasetId}/${fieldId}`),
    );
  }

  async updateDatasetMapping(payload: any) {
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

    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASET.UPDATE_FIELD, requestBody),
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
      organisation,
      isMasterDB,
      status,
    } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASOURCE.UPDATE, {
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
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  listDatasourceSchemas(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS + `${params.orgId}/${params.datasourceId}`,
      ),
    );
  }

  listSchemaTables(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMA_TABLES +
          `${params.orgId}/${params.datasourceId}/${params.schemaName}`,
      ),
    );
  }

  listTableColumns(params: any) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_TABLE_COLUMNS +
          `${params.orgId}/${params.datasourceId}/${params.schemaName}/${params.tableName}`,
      ),
    );
  }

  getDataset(orgId: string, datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.VIEW + `${orgId}/${datasetId}`),
    );
  }

  async updateDataset(payload: any, justification?: string) {
    const { id, name, description, organisation, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASET.UPDATE, {
          id,
          name,
          description,
          organisation,
          datasource,
          sql,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async validateCustomField(payload: any) {
    const { datasetId, organisation, customLogic } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.VALIDATE_FIELD, {
          organisation,
          datasetId,
          customLogic,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addCustomField(payload: any) {
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

    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.ADD_FIELD, requestBody),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async duplicateDataset(
    orgId: string,
    datasetId: string,
    name: string,
    description: string,
  ) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.DUPLICATE + `${orgId}/${datasetId}`, {
          name,
          description,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  runDatasetQuery(payload: any) {
    const { datasetId, organisation, filters } = payload;
    const body: any = { organisation, datasetId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    return lastValueFrom(this.http.apiPost(DATASET.RUN_QUERY, body));
  }

  getDistinctColumnValues(
    orgId: string,
    datasetId: string,
    columnName: string,
  ) {
    return lastValueFrom(
      this.http.apiPost(DATASET.DISTINCT_VALUES + `${orgId}/${datasetId}`, {
        columnName,
      }),
    );
  }

  async deleteDatasetField(orgId: string, datasetId: string, fieldId: string) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(
          DATASET.DELETE_FIELD + `${orgId}/${datasetId}/${fieldId}`,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
