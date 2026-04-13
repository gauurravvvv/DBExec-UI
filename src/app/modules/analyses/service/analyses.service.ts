import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import {
  DATASOURCE,
  DATASET,
  SUPER_ADMIN,
  ANALYSES,
  ANALYSES_VISUAL,
  ANALYSIS_FILTER,
} from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class AnalysesService {
  constructor(private http: HttpClient) {}

  listDatasets(params: any) {
    return this.http
      .get(
        DATASET.LIST +
          `/${params.orgId}` +
          `/${params.datasourceId}` +
          `/${params.pageNumber}/${params.limit}`,
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

  addAnalyses(payload: any) {
    const { name, description, datasetId, organisation, datasource } = payload;

    return this.http
      .post(ANALYSES.ADD, {
        name,
        description,
        datasetId,
        organisation,
        datasource,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listAnalyses(params: any) {
    return this.http
      .get(ANALYSES.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteAnalyses(orgId: string, analysisId: string, justification?: string) {
    return this.http
      .request('DELETE', ANALYSES.DELETE + `${orgId}` + `/${analysisId}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  bulkDeleteAnalyses(ids: string[], justification: string | undefined, orgId: string) {
    return this.http
      .request('DELETE', ANALYSES.BULK_DELETE + orgId, {
        body: { ids, justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewAnalyses(orgId: string, analysisId: string) {
    return this.http
      .get(ANALYSES.VIEW + `${orgId}/${analysisId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewVisuals(orgId: string, analysisId: string) {
    return this.http
      .get(ANALYSES.VIEW_VISUAL + `${orgId}/${analysisId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  /**
   * List all visuals for an analysis (skeleton data only)
   * GET /visual/list/:orgId/:analysisId
   */
  listVisuals(orgId: string, analysisId: string) {
    return this.http
      .get(ANALYSES_VISUAL.LIST + `/${orgId}/${analysisId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  /**
   * Get individual visual data with full configuration
   * GET /visual/get/:orgId/:analysisId/:visualId
   */
  getVisual(orgId: string, analysisId: string, visualId: string | number) {
    return this.http
      .get(ANALYSES_VISUAL.VIEW + `${orgId}/${analysisId}/${visualId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateAnalyses(payload: any, justification?: string) {
    const {
      id,
      name,
      description,
      datasetId,
      organisation,
      datasource,
      visuals,
    } = payload;

    return this.http
      .put(ANALYSES.UPDATE, {
        id,
        name,
        description,
        datasetId,
        organisation,
        datasource,
        visuals,
        justification,
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

  updateDatasetMapping(payload: any) {
    const { mappingId, datasetId, organisation, columnNameToView } = payload;

    return this.http
      .put(DATASET.UPDATE_FIELD, {
        mappingId,
        datasetId,
        organisation,
        columnNameToView,
      })
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

  /**
   * Get combined fields for an analysis (dataset-level + analysis-level)
   * GET /analyses/get/fields/:orgId/:analysisId
   */
  getAnalysisFields(orgId: string, analysisId: string) {
    return this.http
      .get(ANALYSES.GET_FIELDS + `${orgId}/${analysisId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateDataset(payload: any) {
    const { id, name, description, organisation, datasource, sql } = payload;

    return this.http
      .put(DATASET.UPDATE, {
        id,
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

  addFilters(payload: any) {
    return this.http
      .post(ANALYSIS_FILTER.ADD, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateFilter(payload: any) {
    return this.http
      .put(ANALYSIS_FILTER.UPDATE, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteFilter(orgId: string, filterId: string) {
    return this.http
      .delete(ANALYSIS_FILTER.DELETE + `${orgId}/${filterId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listFilters(orgId: string, analysisId: string) {
    return this.http
      .get(ANALYSIS_FILTER.LIST + `${orgId}/${analysisId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getFilterValues(orgId: string, filterId: string) {
    return this.http
      .get(ANALYSIS_FILTER.VALUES + `${orgId}/${filterId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  /**
   * Run a dataset query in the context of an analysis.
   * Returns data enriched with both dataset-level and analysis-level custom fields.
   * POST /analyses/run
   */
  runAnalysisQuery(payload: {
    datasetId: string;
    analysisId: string;
    organisation: string;
    filters?: any[];
    limit?: number;
  }) {
    const { datasetId, analysisId, organisation, filters, limit } = payload;
    const body: any = { organisation, datasetId, analysisId };
    if (filters && filters.length > 0) {
      body.filters = filters;
    }
    if (limit !== undefined) {
      body.limit = limit;
    }
    return this.http
      .post(ANALYSES.RUN_QUERY, body)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
