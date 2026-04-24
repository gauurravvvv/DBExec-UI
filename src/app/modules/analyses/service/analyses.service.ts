import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import {
  DATASOURCE,
  DATASET,
  SUPER_ADMIN,
  ANALYSES,
  ANALYSES_VISUAL,
  ANALYSIS_FILTER,
} from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class AnalysesService {
  constructor(private http: HttpClientService) {}

  listDatasets(params: any) {
    return lastValueFrom(this.http.apiGet(
      DATASET.LIST + `/${params.orgId}/${params.datasourceId}/${params.pageNumber}/${params.limit}`,
    ));
  }

  deleteDataset(orgId: string, datasetId: string) {
    return lastValueFrom(this.http.apiDelete(DATASET.DELETE + `${orgId}/${datasetId}`));
  }

  addAnalyses(payload: any) {
    const { name, description, datasetId, organisation, datasource } = payload;
    return lastValueFrom(this.http.apiPost(ANALYSES.ADD, {
      name, description, datasetId, organisation, datasource,
    }));
  }

  listAnalyses(params: any) {
    return lastValueFrom(this.http.apiGet(ANALYSES.LIST, { params }));
  }

  deleteAnalyses(orgId: string, analysisId: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(
      ANALYSES.DELETE + `${orgId}/${analysisId}`,
      { body: { justification } },
    ));
  }

  bulkDeleteAnalyses(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(ANALYSES.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  viewAnalyses(orgId: string, analysisId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSES.VIEW + `${orgId}/${analysisId}`));
  }

  viewVisuals(orgId: string, analysisId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSES.VIEW_VISUAL + `${orgId}/${analysisId}`));
  }

  /**
   * List all visuals for an analysis (skeleton data only)
   * GET /visual/list/:orgId/:analysisId
   */
  listVisuals(orgId: string, analysisId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSES_VISUAL.LIST + `/${orgId}/${analysisId}`));
  }

  /**
   * Get individual visual data with full configuration
   * GET /visual/get/:orgId/:analysisId/:visualId
   */
  getVisual(orgId: string, analysisId: string, visualId: string | number) {
    return lastValueFrom(this.http.apiGet(ANALYSES_VISUAL.VIEW + `${orgId}/${analysisId}/${visualId}`));
  }

  updateAnalyses(payload: any, justification?: string) {
    const { id, name, description, datasetId, organisation, datasource, visuals } = payload;
    return lastValueFrom(this.http.apiPut(ANALYSES.UPDATE, {
      id, name, description, datasetId, organisation, datasource, visuals, justification,
    }));
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

  updateDatasetMapping(payload: any) {
    const { mappingId, datasetId, organisation, columnNameToView } = payload;
    return lastValueFrom(this.http.apiPut(DATASET.UPDATE_FIELD, {
      mappingId, datasetId, organisation, columnNameToView,
    }));
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

  /**
   * Get combined fields for an analysis (dataset-level + analysis-level)
   * GET /analyses/get/fields/:orgId/:analysisId
   */
  getAnalysisFields(orgId: string, analysisId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSES.GET_FIELDS + `${orgId}/${analysisId}`));
  }

  updateDataset(payload: any) {
    const { id, name, description, organisation, datasource, sql } = payload;
    return lastValueFrom(this.http.apiPut(DATASET.UPDATE, {
      id, name, description, organisation, datasource, sql,
    }));
  }

  addFilters(payload: any) {
    return lastValueFrom(this.http.apiPost(ANALYSIS_FILTER.ADD, payload));
  }

  updateFilter(payload: any) {
    return lastValueFrom(this.http.apiPut(ANALYSIS_FILTER.UPDATE, payload));
  }

  deleteFilter(orgId: string, filterId: string) {
    return lastValueFrom(this.http.apiDelete(ANALYSIS_FILTER.DELETE + `${orgId}/${filterId}`));
  }

  listFilters(orgId: string, analysisId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSIS_FILTER.LIST + `${orgId}/${analysisId}`));
  }

  getFilterValues(orgId: string, filterId: string) {
    return lastValueFrom(this.http.apiGet(ANALYSIS_FILTER.VALUES + `${orgId}/${filterId}`));
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
    return lastValueFrom(this.http.apiPost(ANALYSES.RUN_QUERY, body));
  }
}
