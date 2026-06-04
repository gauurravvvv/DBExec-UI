import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';

import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, from, Observable, of, throwError } from 'rxjs';
import { catchError, filter, finalize, switchMap, take } from 'rxjs/operators';
import { AUTH } from 'src/app/core/constants/api.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { environment } from 'src/environments/environment';
import { LoadingService } from '../services/loading.service';
import { LoginService } from '../services/login.service';
import { SessionExpiredService } from '../services/session-expired.service';
import { StorageService } from '../services/storage.service';
import { BrandingService } from '../services/branding.service';
import { ThemeService } from '../services/theme.service';

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  /**
   * Both `LoginService` and `TranslateService` are resolved lazily
   * through `Injector` instead of being constructor-injected. Direct
   * injection used to create a circular DI cycle (NG0200): this
   * interceptor sits inside the `HTTP_INTERCEPTORS` multi-provider,
   * and each of these services has a transitive dependency on
   * `HttpClient` — which itself can't finish constructing until
   * `HTTP_INTERCEPTORS` is fully resolved.
   *
   *   LoginService     -> HttpClientService -> HttpClient -> HTTP_INTERCEPTORS
   *   TranslateService -> TranslateLoader   -> HttpClient -> HTTP_INTERCEPTORS
   *                       (factory deps)
   *
   * Deferring the lookup to method-call time lets Angular finish
   * constructing the interceptor chain first; by the time
   * `intercept()` fires for a real request, both services are
   * materialised and `HttpClient` is fully built.
   *
   * Note: the TranslateLoader factory in `app.module.ts` is *also*
   * fixed to use `HttpBackend` directly, which is the canonical
   * ngx-translate workaround. Either fix on its own resolves the
   * cycle; we apply both to be defensive against future changes to
   * either side.
   *
   * Reference: https://angular.dev/errors/NG0200
   */
  private get loginService(): LoginService {
    return this.injector.get(LoginService);
  }

  private get translate(): TranslateService {
    return this.injector.get(TranslateService);
  }

  private get themeService(): ThemeService {
    return this.injector.get(ThemeService);
  }

  private get brandingService(): BrandingService {
    return this.injector.get(BrandingService);
  }

  constructor(
    private loadingService: LoadingService,
    private router: Router,
    private injector: Injector,
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

    // Skip auth for asset requests and absolute URLs (external/CDN)
    const isExternal =
      req.url.startsWith('http://') || req.url.startsWith('https://');
    if (req.url.includes('assets') || isExternal) {
      if (!skipLoader) {
        this.loadingService.hideLoader();
      }
      return next.handle(req);
    }

    // Build the full URL — all requests go to the single API server
    const serverUrl = environment.apiServer || 'http://localhost:3000/api/v1';

    const URL = serverUrl + req.url;

    // Attach auth headers only to API requests. We do NOT send
    // x-organization-id — the BE derives the caller's org id from
    // the signed JWT (AuthMiddleware.res.locals.organisationId). The
    // FE has no say in which org a request targets.
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN) || '';

    // Send the language the user is actually seeing right now —
    // either the persisted locale (from the JWT / storage) or a
    // temporary locale set via the ?locale= URL param. We read it
    // from TranslateService because that's the in-memory source of
    // truth maintained by LocaleService. Falls back to storage and
    // then 'en' to cover edge cases (pre-bootstrap requests, etc.).
    const locale =
      this.translate.currentLang ||
      StorageService.get(StorageType.LOCALE) ||
      'en';
    let headers = req.headers
      .set('x-auth-token', accessToken)
      .set('Accept-Language', locale);
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
        StorageService.clear();
        this.router.navigateByUrl('/login');
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

    // Envelope-carrying HTTP errors (BE now sets the real HTTP status
    // code; the body still ships `{ status, code, message, data }`).
    // Re-emit as a success so existing callers that read
    // `response.code !== 200` in a `.then(res => ...)` block keep
    // working. Network errors (status 0) and crashes that didn't
    // produce our envelope still flow to the global error
    // interceptor's toast path.
    if (this.isEnvelopeError(error)) {
      return of(
        new HttpResponse({
          body: error.error,
          status: 200,
          statusText: 'OK',
          url: req.url,
        }),
      );
    }

    return throwError(error);
  }

  /**
   * True when the HttpErrorResponse body matches our standard
   * envelope shape. Used to convert real HTTP error responses back
   * into success-channel emissions so the FE's existing handlers
   * (`if (response.code === 200) ... else ...`) keep working
   * unchanged after the BE switched from always-200 to real HTTP
   * status codes.
   */
  private isEnvelopeError(error: any): boolean {
    if (!(error instanceof HttpErrorResponse)) return false;
    const body = error.error;
    if (!body || typeof body !== 'object') return false;
    // Code must be present and numeric — distinguishes our envelope
    // from non-API error bodies (e.g. plain-text, HTML, network
    // failure with empty body).
    return typeof body.code === 'number' && typeof body.status === 'boolean';
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
            // Keep the injected CSS variables and watermark in sync
            // with what the BE resolved at refresh time. `null` on
            // either clears that domain.
            this.themeService.applyFromLogin(response.data?.theme);
            this.brandingService.applyFromLogin(response.data?.branding);
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
