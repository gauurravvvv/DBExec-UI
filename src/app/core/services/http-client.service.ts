import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HttpClientService {

  constructor(private http: HttpClient) {}

  // API Server methods
  apiGet<T = any>(url: string, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('api', options?.headers)
    };
    return this.http.get<T>(url, requestOptions) as Observable<T>;
  }

  apiPost<T = any>(url: string, body: any, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('api', options?.headers)
    };
    return this.http.post<T>(url, body, requestOptions) as Observable<T>;
  }

  apiPut<T = any>(url: string, body: any, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('api', options?.headers)
    };
    return this.http.put<T>(url, body, requestOptions) as Observable<T>;
  }

  apiDelete<T = any>(url: string, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('api', options?.headers)
    };
    return this.http.delete<T>(url, requestOptions) as Observable<T>;
  }

  // Query Server methods
  queryGet<T = any>(url: string, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('query', options?.headers)
    };
    return this.http.get<T>(url, requestOptions) as Observable<T>;
  }

  queryPost<T = any>(url: string, body: any, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('query', options?.headers)
    };
    return this.http.post<T>(url, body, requestOptions) as Observable<T>;
  }
  
  // Query Server method with no loader
  queryPostNoLoader<T = any>(url: string, body: any, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('query', options?.headers, true)
    };
    return this.http.post<T>(url, body, requestOptions) as Observable<T>;
  }

  queryPut<T = any>(url: string, body: any, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('query', options?.headers)
    };
    return this.http.put<T>(url, body, requestOptions) as Observable<T>;
  }

  queryDelete<T = any>(url: string, options?: any): Observable<T> {
    const requestOptions = {
      ...options,
      headers: this.addServerTypeHeader('query', options?.headers)
    };
    return this.http.delete<T>(url, requestOptions) as Observable<T>;
  }

  private addServerTypeHeader(serverType: 'api' | 'query', existingHeaders?: HttpHeaders, skipLoader?: boolean): HttpHeaders {
    let headers = existingHeaders || new HttpHeaders();
    headers = headers.set('X-Server-Type', serverType);
    
    if (skipLoader) {
      headers = headers.set('X-Skip-Loader', 'true');
    }
    
    return headers;
  }
}