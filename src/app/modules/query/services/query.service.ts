import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class QueryService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  executeQuery(queryData: {
    orgId: number;
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/query/execute`, queryData);
  }

  saveQuery(queryData: {
    orgId: number;
    databaseId: number;
    name: string;
    query: string;
    description?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/query/save`, queryData);
  }

  getSavedQueries(params: {
    orgId?: number;
    pageNumber?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.orgId) httpParams = httpParams.set('orgId', params.orgId.toString());
    if (params.pageNumber) httpParams = httpParams.set('pageNumber', params.pageNumber.toString());
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    
    return this.http.get(`${this.baseUrl}/query/saved`, { params: httpParams });
  }

  deleteQuery(queryId: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/query/${queryId}`);
  }

  getQueryHistory(params: {
    orgId?: number;
    databaseId?: number;
    pageNumber?: number;
    limit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.orgId) httpParams = httpParams.set('orgId', params.orgId.toString());
    if (params.databaseId) httpParams = httpParams.set('databaseId', params.databaseId.toString());
    if (params.pageNumber) httpParams = httpParams.set('pageNumber', params.pageNumber.toString());
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    
    return this.http.get(`${this.baseUrl}/query/history`, { params: httpParams });
  }

  validateQuery(queryData: {
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/query/validate`, queryData);
  }

  getQueryExplain(queryData: {
    databaseId: number;
    query: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/query/explain`, queryData);
  }

  exportQueryResults(queryData: {
    orgId: number;
    databaseId: number;
    query: string;
    format: 'csv' | 'json' | 'xlsx';
  }): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/query/export`, queryData, {
      responseType: 'blob'
    });
  }
}