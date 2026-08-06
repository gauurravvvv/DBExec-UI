import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface RequestOptions {
  skipLoader?: boolean; // true = suppress global loader, use button spinner instead
  forceLoader?: boolean; // true = force the global overlay ON for a write (rare)
  params?: any;
  headers?: HttpHeaders;
  responseType?: any;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class HttpClientService {
  constructor(private http: HttpClient) {}

  apiGet<T = any>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  apiPost<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.post<T>(
      url,
      body,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  apiPut<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.put<T>(
      url,
      body,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  apiPatch<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.patch<T>(
      url,
      body,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  apiDelete<T = any>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(
      url,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  // Query methods — same server as API (query server merged into main server)
  queryGet<T = any>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(url, this.buildOptions(options)) as Observable<T>;
  }

  queryPost<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.post<T>(
      url,
      body,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  queryPostNoLoader<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.post<T>(
      url,
      body,
      this.buildOptions({ ...options, skipLoader: true }),
    ) as Observable<T>;
  }

  queryPut<T = any>(
    url: string,
    body: any,
    options?: RequestOptions,
  ): Observable<T> {
    return this.http.put<T>(
      url,
      body,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  queryDelete<T = any>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(
      url,
      this.buildOptions(options),
    ) as Observable<T>;
  }

  private buildOptions(options?: RequestOptions): any {
    const { skipLoader, forceLoader, ...httpOptions } = options || {};
    if (!skipLoader && !forceLoader)
      return Object.keys(httpOptions).length ? httpOptions : undefined;
    let headers = httpOptions.headers || new HttpHeaders();
    // Writes skip the global overlay by default (interceptor is method-aware);
    // GET shows it. These headers only override that default: skipLoader on a
    // read, forceLoader on a write.
    if (skipLoader) headers = headers.set('X-Skip-Loader', 'true');
    if (forceLoader) headers = headers.set('X-Force-Loader', 'true');
    return { ...httpOptions, headers };
  }
}
