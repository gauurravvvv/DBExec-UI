import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
  HttpResponse,
} from '@angular/common/http';

import { Observable, throwError, BehaviorSubject, of, from } from 'rxjs';
import {
  catchError,
  filter,
  take,
  switchMap,
  map,
  finalize,
} from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LoadingService } from '../services/loading.service';
import { Router } from '@angular/router';
import { StorageType } from 'src/app/constants/storageType';
import { StorageService } from '../services/storage.service';
import { LoginService } from '../services/login.service';
import { AUTH } from 'src/app/constants/api';
import { SessionExpiredService } from '../services/session-expired.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  constructor(
    private loadingService: LoadingService,
    private router: Router,
    private loginService: LoginService,
    private sessionExpiredService: SessionExpiredService,
  ) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    // Check if we should skip the loader for this request
    const skipLoader = req.headers.has('X-Skip-Loader');

    if (!skipLoader) {
      this.loadingService.showLoader();
    }

    if (req.url.includes('assets')) {
      if (!skipLoader) {
        this.loadingService.hideLoader();
      }
      return next.handle(req);
    }

    // Build the full URL — all requests go to the single API server
    const serverUrl = environment.apiServer || 'http://localhost:3000/api/v1';

    const URL = serverUrl + req.url;

    // Attach auth headers
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN) || '';
    const organisationId =
      StorageService.get(StorageType.ORGANISATION_ID) || '';

    let headers = req.headers
      .set('x-auth-token', accessToken)
      .set('x-organization-id', organisationId);
    if (headers.has('X-Skip-Loader')) {
      headers = headers.delete('X-Skip-Loader');
    }

    req = req.clone({ url: URL, headers });

    return next.handle(req).pipe(
      switchMap(evt => this.handleSuccessAsync(req, evt, next)),
      catchError(error => this.handleError(req, error, next)),
      finalize(() => {
        if (!skipLoader) {
          this.loadingService.hideLoader();
        }
      }),
    );
  }

  /**
   * Async wrapper that unwraps Blob responses containing JSON errors
   * (e.g., when a blob request gets a 440 auth error from the server).
   */
  private handleSuccessAsync(
    req: HttpRequest<any>,
    evt: HttpEvent<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (
      evt instanceof HttpResponse &&
      evt.body instanceof Blob &&
      (evt.headers.get('content-type') || '').includes('application/json')
    ) {
      // Server returned JSON for a blob request — parse it so error codes are detected
      return from(evt.body.text()).pipe(
        switchMap(text => {
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            return of(evt as HttpEvent<any>);
          }
          // handleSuccess may throw (e.g., HttpErrorResponse for 440) — let it propagate
          return of(this.handleSuccess(req, evt.clone({ body: json }), next));
        }),
      );
    }
    return of(this.handleSuccess(req, evt, next));
  }

  private handleSuccess(
    req: HttpRequest<any>,
    evt: HttpEvent<any>,
    next: HttpHandler,
  ): HttpEvent<any> {
    if (evt instanceof HttpResponse) {
      // Session expired returned as 200 with code 440 in body
      if (evt.body?.code === 440) {
        // Already logged out — ignore stale 440 responses
        if (!StorageService.get(StorageType.ACCESS_TOKEN)) {
          return evt;
        }
        // Don't attempt refresh for the refresh endpoint itself
        if (req.url.includes(AUTH.REFRESH_TOKEN)) {
          this.handleSessionExpired();
          return evt;
        }
        // Trigger token refresh — handled via catchError path by throwing
        throw new HttpErrorResponse({ status: 440, url: req.url });
      }
      if (evt.body?.code === 501 || evt.body?.code === 503) {
        window.location.href = '';
        StorageService.remove(StorageType.ACCESS_TOKEN);
        return evt;
      }
    }
    return evt;
  }

  private handleError(
    req: HttpRequest<any>,
    error: HttpErrorResponse | any,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (error instanceof HttpErrorResponse && error.status === 440) {
      // Already logged out — ignore stale 440 responses
      if (!StorageService.get(StorageType.ACCESS_TOKEN)) {
        return throwError(error);
      }
      // Don't attempt refresh for the refresh endpoint itself
      if (req.url.includes(AUTH.REFRESH_TOKEN)) {
        this.handleSessionExpired();
        return throwError(error);
      }
      return this.handle440Error(req, next);
    }
    return throwError(error);
  }

  private handle440Error(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.loginService.refreshAccessToken().pipe(
        switchMap((response: any) => {
          this.isRefreshing = false;

          if (response.status && response.data?.accessToken) {
            const newToken = response.data.accessToken;
            this.loginService.setAccessToken(newToken);
            this.refreshTokenSubject.next(newToken);
            // Retry the original request with the new token
            return next.handle(this.addToken(req, newToken));
          } else {
            // Refresh failed — let catchError handle logout
            return throwError('Refresh token failed');
          }
        }),
        catchError(err => {
          this.isRefreshing = false;
          this.handleSessionExpired();
          return throwError(err);
        }),
      );
    } else {
      // Another request is already refreshing — wait for the new token
      return this.refreshTokenSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap(token => next.handle(this.addToken(req, token!))),
      );
    }
  }

  private addToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
    return req.clone({
      headers: req.headers.set('x-auth-token', token),
    });
  }

  private handleSessionExpired(): void {
    this.isRefreshing = false;
    StorageService.clear();
    this.sessionExpiredService.trigger();
  }
}
