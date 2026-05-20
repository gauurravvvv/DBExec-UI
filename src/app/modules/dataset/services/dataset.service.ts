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
        this.http.apiPost(
          DATASET.BULK_DELETE_PREFIX + orgId + DATASET.BULK_DELETE_SUFFIX,
          { ids, justification },
        ),
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
      // PUT /datasets/:orgId/:datasetId/from-builder
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.UPDATE_VIA_BUILDER_PREFIX +
            `${payload.organisation}/${payload.id}` +
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

  viewDataset(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DATASET.GET + `${orgId}/${id}`));
  }

  viewDatasetField(orgId: string, datasetId: string, fieldId: string) {
    // GET /datasets/:orgId/:datasetId/fields/:fieldId
    return lastValueFrom(
      this.http.apiGet(
        DATASET.GET + `${orgId}/${datasetId}` + DATASET.FIELD_SEGMENT + fieldId,
      ),
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

    if (customLogic !== undefined) {
      requestBody.customLogic = customLogic;
    }
    if (dataType !== undefined) {
      requestBody.dataType = dataType;
    }

    this._saving.set(true);
    try {
      // PUT /datasets/:orgId/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiPut(
          DATASET.GET +
            `${organisation}/${datasetId}` +
            DATASET.FIELD_SEGMENT +
            fieldId,
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
      organisation,
      isMasterDB,
      status,
    } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASOURCE.UPDATE + `${organisation}/${id}`, {
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
    // GET /datasources/:orgId/:datasourceId/schemas
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.LIST_SCHEMAS_SUFFIX,
      ),
    );
  }

  listSchemaTables(params: any) {
    // GET /datasources/:orgId/:datasourceId/schemas/:schema/tables
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT.replace(/\/$/, ''),
      ),
    );
  }

  listTableColumns(params: any) {
    // GET /datasources/:orgId/:datasourceId/schemas/:schema/tables/:table/columns
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          `${params.orgId}/${params.datasourceId}` +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT +
          params.tableName +
          DATASOURCE.COLUMNS_SEGMENT,
      ),
    );
  }

  getDataset(orgId: string, datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(DATASET.GET + `${orgId}/${datasetId}`),
    );
  }

  async updateDataset(payload: any, justification?: string) {
    const { id, name, description, organisation, datasource, sql } = payload;
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(DATASET.UPDATE + `${organisation}/${id}`, {
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
      // POST /datasets/:datasetId/fields/validate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.ADD_FIELD_PREFIX + datasetId + DATASET.VALIDATE_FIELD_SUFFIX,
          {
            organisation,
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
    orgId: string,
    datasetId: string,
    name: string,
    description: string,
  ) {
    this._saving.set(true);
    try {
      // POST /datasets/:orgId/:datasetId/duplicate
      return await lastValueFrom(
        this.http.apiPost(
          DATASET.DUPLICATE_PREFIX +
            `${orgId}/${datasetId}` +
            DATASET.DUPLICATE_SUFFIX,
          { name, description },
        ),
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
    // POST /datasets/:datasetId/run
    return lastValueFrom(
      this.http.apiPost(
        DATASET.RUN_QUERY_PREFIX + datasetId + DATASET.RUN_QUERY_SUFFIX,
        body,
      ),
    );
  }

  getDistinctColumnValues(
    orgId: string,
    datasetId: string,
    columnName: string,
  ) {
    // POST /datasets/:orgId/:datasetId/distinct-values
    return lastValueFrom(
      this.http.apiPost(
        DATASET.DISTINCT_VALUES_PREFIX +
          `${orgId}/${datasetId}` +
          DATASET.DISTINCT_VALUES_SUFFIX,
        { columnName },
      ),
    );
  }

  async deleteDatasetField(orgId: string, datasetId: string, fieldId: string) {
    this._saving.set(true);
    try {
      // DELETE /datasets/:orgId/:datasetId/fields/:fieldId
      return await lastValueFrom(
        this.http.apiDelete(
          DATASET.GET +
            `${orgId}/${datasetId}` +
            DATASET.FIELD_SEGMENT +
            fieldId,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
