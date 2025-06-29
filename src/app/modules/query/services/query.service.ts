import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class QueryService {
  constructor(private httpClientService: HttpClientService) {}

  // Query execution - use Query Server
  executeQuery(queryData: {
    orgId: number;
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/execute', queryData);
  }
  getDatabaseStructure(databaseId: number, orgId: number): Observable<any> {
    return this.httpClientService.queryPostNoLoader(`/query/getStructure`, {
      databaseId,
      orgId,
    });
  }

  // Save query metadata - use API Server
  saveQuery(queryData: {
    orgId: number;
    databaseId: number;
    name: string;
    query: string;
    description?: string;
  }): Observable<any> {
    return this.httpClientService.apiPost('/query/save', queryData);
  }

  // Get saved queries - use API Server
  getSavedQueries(params: {
    orgId?: number;
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
  deleteQuery(queryId: number): Observable<any> {
    return this.httpClientService.apiDelete(`/query/${queryId}`);
  }

  // Get query history - use Query Server
  getQueryHistory(params: {
    orgId?: number;
    databaseId?: number;
    pageNumber?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.orgId)
      httpParams = httpParams.set('orgId', params.orgId.toString());
    if (params.databaseId)
      httpParams = httpParams.set('databaseId', params.databaseId.toString());
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
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/validate', queryData);
  }

  // Get query explain - use Query Server
  getQueryExplain(queryData: {
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost('/query/explain', queryData);
  }

  // Export query results - use Query Server
  exportQueryResults(queryData: {
    orgId: number;
    databaseId: number;
    query: string;
    format: 'csv' | 'json' | 'xlsx';
  }): Observable<Blob> {
    return this.httpClientService.queryPost('/query/export', queryData, {
      responseType: 'blob',
    });
  }

  // New methods demonstrating database schema operations on Query Server
  getDatabaseSchema(databaseId: number): Observable<any> {
    return this.httpClientService.queryGet(`/database/schema/${databaseId}`);
  }

  getDatabaseTables(databaseId: number): Observable<any> {
    return this.httpClientService.queryGet(`/database/tables/${databaseId}`);
  }

  getTableColumns(databaseId: number, tableName: string): Observable<any> {
    return this.httpClientService.queryGet(
      `/database/columns/${databaseId}/${tableName}`
    );
  }
}
