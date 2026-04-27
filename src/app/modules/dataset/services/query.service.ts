import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class QueryService {
  constructor(private httpClientService: HttpClientService) {}

  // Query execution - use Query Server
  executeQuery(queryData: {
    orgId: string;
    datasourceId: string;
    query: string;
    page?: number;
    limit?: number;
    filter?: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/execute', queryData);
  }
  getDatasourceStructure(datasourceId: string, orgId: string): Observable<any> {
    return this.httpClientService.queryPostNoLoader(`/query/getStructure`, {
      datasourceId,
      orgId,
    });
  }

  // Save query metadata - use API Server
  saveQuery(queryData: {
    orgId: string;
    datasourceId: string;
    name: string;
    query: string;
    description?: string;
  }): Observable<any> {
    return this.httpClientService.apiPost('/query/save', queryData);
  }

  // Get saved queries - use API Server
  getSavedQueries(params: {
    orgId?: string;
    pageNumber?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.orgId)
      httpParams = httpParams.set('orgId', params.orgId.toString());
    if (params.pageNumber)
      httpParams = httpParams.set('pageNumber', params.pageNumber.toString());
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());

    return this.httpClientService.apiGet('/query/saved', {
      params: httpParams,
    });
  }

  // Delete query - use API Server
  deleteQuery(queryId: string): Observable<any> {
    return this.httpClientService.apiDelete(`/query/${queryId}`);
  }

  // Get query history - use Query Server
  getQueryHistory(params: {
    orgId?: string;
    datasourceId?: string;
    pageNumber?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.orgId)
      httpParams = httpParams.set('orgId', params.orgId.toString());
    if (params.datasourceId)
      httpParams = httpParams.set(
        'datasourceId',
        params.datasourceId.toString(),
      );
    if (params.pageNumber)
      httpParams = httpParams.set('pageNumber', params.pageNumber.toString());
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());

    return this.httpClientService.queryGet('/query/history', {
      params: httpParams,
    });
  }

  // Validate query - use Query Server
  validateQuery(queryData: {
    datasourceId: string;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/validate', queryData);
  }

  // Get query explain - use Query Server
  getQueryExplain(queryData: {
    datasourceId: string;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/explain', queryData);
  }

  // Export query results as CSV - use Query Server
  exportQueryResults(queryData: {
    orgId: string;
    datasourceId: string;
    query: string;
    filter?: string;
  }): Observable<Blob> {
    return this.httpClientService.queryPost('/query/export', queryData, {
      responseType: 'blob',
    });
  }

  // New methods demonstrating datasource schema operations on Query Server
  getDatasourceSchema(datasourceId: string): Observable<any> {
    return this.httpClientService.queryGet(
      `/datasource/schema/${datasourceId}`,
    );
  }

  getDatasourceTables(datasourceId: string): Observable<any> {
    return this.httpClientService.queryGet(
      `/datasource/tables/${datasourceId}`,
    );
  }

  getTableColumns(datasourceId: string, tableName: string): Observable<any> {
    return this.httpClientService.queryGet(
      `/datasource/columns/${datasourceId}/${tableName}`,
    );
  }
}
