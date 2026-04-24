import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpClientService {
  constructor(private http: HttpClient) {}

  apiGet<T = any>(url: string, options?: any): Observable<T> {
    return this.http.get<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  apiPost<T = any>(url: string, body: any, options?: any): Observable<T> {
    return this.http.post<T>(url, body, this.buildOptions(options)) as Observable<T>;
  }

  apiPut<T = any>(url: string, body: any, options?: any): Observable<T> {
    return this.http.put<T>(url, body, this.buildOptions(options)) as Observable<T>;
  }

  apiDelete<T = any>(url: string, options?: any): Observable<T> {
    return this.http.delete<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  // Query methods — same server as API (query server merged into main server)
  queryGet<T = any>(url: string, options?: any): Observable<T> {
    return this.http.get<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  queryPost<T = any>(url: string, body: any, options?: any): Observable<T> {
    return this.http.post<T>(url, body, this.buildOptions(options)) as Observable<T>;
  }

  queryPostNoLoader<T = any>(url: string, body: any, options?: any): Observable<T> {
    return this.http.post<T>(url, body, this.buildOptions(options, true)) as Observable<T>;
  }

  queryPut<T = any>(url: string, body: any, options?: any): Observable<T> {
    return this.http.put<T>(url, body, this.buildOptions(options)) as Observable<T>;
  }

  queryDelete<T = any>(url: string, options?: any): Observable<T> {
    return this.http.delete<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  private buildOptions(options?: any, skipLoader?: boolean): any {
    if (!skipLoader) return options;
    const headers = (options?.headers || new HttpHeaders()).set('X-Skip-Loader', 'true');
    return { ...options, headers };
  }
}
