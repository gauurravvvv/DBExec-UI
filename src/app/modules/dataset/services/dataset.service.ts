import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import {
  DATASET,
  DATASOURCE,
  SYSTEM_ADMIN,
} from 'src/app/core/constants/api.constant';
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

  async deleteDataset(datasetId: string, justification?: string) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DATASET.DELETE + datasetId, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDeleteDataset(ids: string[], justification?: string) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.BULK_DELETE, { ids, justification }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addDataset(payload: any) {
    const { name, description, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASET.ADD, {
          name,
          description,
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
      // PUT /datasets/:datasetId/from-builder
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.UPDATE_VIA_BUILDER_PREFIX +
            payload.id +
            DATASET.UPDATE_VIA_BUILDER_SUFFIX,
          payload,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  viewSystemAdmin(id: string) {
    return lastValueFrom(this.http.apiGet(SYSTEM_ADMIN.GET + `${id}`));
  }

  async updateSystemAdmin(systemAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      systemAdminForm.value;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(SYSTEM_ADMIN.UPDATE + id, {
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

  viewDataset(id: string) {
    return lastValueFrom(this.http.apiGet(DATASET.GET + id));
  }

  viewDatasetField(datasetId: string, fieldId: string) {
    // GET /datasets/:datasetId/fields/:fieldId
    return lastValueFrom(
      this.http.apiGet(
        DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
      ),
    );
  }

  async updateDatasetMapping(payload: any) {
    const {
      fieldId,
      datasetId,
      columnNameToView,
      customLogic,
      used_field_ids,
      dataType,
    } = payload;

    const requestBody: any = {
      fieldId,
      datasetId,
      columnNameToView,
      used_field_ids,
    };

    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }
    if (dataType !== undefined) {
      requestBody.dataType = dataType;
    }

    this._saving.set(true);
    try {
      // PUT /datasets/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
          requestBody,
        ),
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
      isMasterDB,
      status,
    } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASOURCE.UPDATE + id, {
          id,
          name,
          description,
          type,
          host,
          port,
          datasource,
          username,
          password,
          isMasterDB,
          status,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  listDatasourceSchemas(params: any) {
    // GET /datasources/:datasourceId/schemas
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.LIST_SCHEMAS_SUFFIX,
      ),
    );
  }

  listSchemaTables(params: any) {
    // GET /datasources/:datasourceId/schemas/:schema/tables
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT.replace(/\/$/, ''),
      ),
    );
  }

  listTableColumns(params: any) {
    // GET /datasources/:datasourceId/schemas/:schema/tables/:table/columns
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT +
          params.tableName +
          DATASOURCE.COLUMNS_SEGMENT,
      ),
    );
  }

  getDataset(datasetId: string) {
    return lastValueFrom(this.http.apiGet(DATASET.GET + datasetId));
  }

  async updateDataset(payload: any, justification?: string) {
    const { id, name, description, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASET.UPDATE + id, {
          id,
          name,
          description,
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
    const { datasetId, customLogic } = payload;
    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/fields/validate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD_FIELD_PREFIX + datasetId + DATASET.VALIDATE_FIELD_SUFFIX,
          {
            datasetId,
            customLogic,
          },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async addCustomField(payload: any) {
    const {
      datasetId,
      name,
      customLogic,
      used_field_ids,
      dataType,
      analysisId,
    } = payload;
    const requestBody: any = {
      datasetId,
      name,
      customLogic,
      used_field_ids,
    };
    if (dataType) requestBody.dataType = dataType;
    if (analysisId) requestBody.analysisId = analysisId;

    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/fields
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD_FIELD_PREFIX + datasetId + DATASET.ADD_FIELD_SUFFIX,
          requestBody,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async duplicateDataset(
    datasetId: string,
    name: string,
    description: string,
  ) {
    this._saving.set(true);
    try {
      // POST /datasets/:datasetId/duplicate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.DUPLICATE_PREFIX + datasetId + DATASET.DUPLICATE_SUFFIX,
          { name, description },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  runDatasetQuery(payload: any) {
    const { datasetId, filters } = payload;
    const body: any = { datasetId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    // POST /datasets/:datasetId/run
    return lastValueFrom(
      this.http.apiPost(
        DATASET.RUN_QUERY_PREFIX + datasetId + DATASET.RUN_QUERY_SUFFIX,
        body,
      ),
    );
  }

  getDistinctColumnValues(datasetId: string, columnName: string) {
    // POST /datasets/:datasetId/distinct-values
    return lastValueFrom(
      this.http.apiPost(
        DATASET.DISTINCT_VALUES_PREFIX +
          datasetId +
          DATASET.DISTINCT_VALUES_SUFFIX,
        { columnName },
      ),
    );
  }

  async deleteDatasetField(datasetId: string, fieldId: string) {
    this._saving.set(true);
    try {
      // DELETE /datasets/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiDelete(
          DATASET.GET + datasetId + DATASET.FIELD_SEGMENT + fieldId,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
