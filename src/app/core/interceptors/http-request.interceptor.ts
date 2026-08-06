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
    // Global-overlay policy. Reads (GET) show the full-screen loader — a
    // page/section load should block. Writes (POST/PUT/PATCH/DELETE) do NOT:
    // they surface as a button-level spinner on the control that fired them
    // (see app-button [loading] + the FormBusy convention), so the rest of
    // the form stays interactive and a second submit is impossible because
    // the button disables itself. Making this method-aware means a write can
    // never accidentally re-introduce the global overlay by forgetting to
    // pass skipLoader — the old opt-out footgun that left Announcement, etc.
    // blocking the screen. Escape hatches:
    //   - 'X-Skip-Loader'  : force-skip a read (search-as-POST, polling GETs)
    //   - 'X-Force-Loader' : opt a write back INTO the global block (rare,
    //                        e.g. a destructive long-op with no button anchor)
    const isWrite = /^(POST|PUT|PATCH|DELETE)$/i.test(req.method);
    const skipLoader =
      req.headers.has('X-Skip-Loader') ||
      (isWrite && !req.headers.has('X-Force-Loader'));

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
    const serverUrl = environment.apiServer || 'http://localhost:9058/api/v1';

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
    // Strip the client-only loader-control headers so they never hit the wire.
    if (headers.has('X-Skip-Loader')) {
      headers = headers.delete('X-Skip-Loader');
    }
    if (headers.has('X-Force-Loader')) {
      headers = headers.delete('X-Force-Loader');
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
      // A blob request can get a JSON body two ways:
      //   1. a genuine file download the caller asked for as a Blob (e.g. the
      //      migration export streams the bundle as application/json), OR
      //   2. our standard envelope carrying an actionable code — most importantly
      //      a 440 session-expiry — returned even though a Blob was requested.
      // We must detect (2) so auth-refresh still fires, WITHOUT clobbering (1):
      // if we parsed every JSON blob into an object, legitimate downloads would
      // reach the caller as a plain object instead of a Blob and never download.
      // So: parse, and ONLY swap the body to the parsed object when it's an
      // actionable envelope (session/maintenance code). Otherwise pass the
      // ORIGINAL Blob through untouched so the download path works.
      return from(evt.body.text()).pipe(
        switchMap(text => {
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            return of(evt as HttpEvent<any>);
          }
          const code = json?.code;
          const actionable = code === 440 || code === 501 || code === 503;
          if (!actionable) {
            // Genuine file download (or any non-actionable JSON blob) — leave
            // the Blob intact for the caller to save.
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
            // Route through the LoginService chokepoint so theme +
            // branding always apply via the same path.
            this.loginService.applyAuthArtefacts(
              response.data?.theme,
              response.data?.branding,
            );
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
