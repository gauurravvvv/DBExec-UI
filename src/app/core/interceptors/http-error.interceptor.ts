import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * HttpErrorInterceptor — surfaces low-level transport failures only.
 *
 * Application-level errors (BAD_REQUEST / NOT_FOUND / FORBIDDEN /
 * ALREADY_EXISTS / SERVER_ERROR) that carry our standard envelope
 * are converted back to success emissions by HttpRequestInterceptor
 * so component-level handlers keep using
 * `if (response.code === 200) ... else { ... }` unchanged. Anything
 * that reaches this catchError is therefore either:
 *
 *   - status === 0      — network failure (CORS, server down)
 *   - status === 440    — session expired (HttpRequestInterceptor
 *                         owns the refresh-token dance; we silence
 *                         the toast here so the modal can speak)
 *   - status >= 500
 *     without an envelope — BE crashed before the response writer
 *                           ran (uncaught throw, OOM, dead worker)
 *   - non-HTTP errors   — RxJS / JS exceptions inside operators
 */
@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  constructor(private messageService: MessageService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse | any) => {
        // 440 is handled by HttpRequestInterceptor (session refresh)
        // Don't show toast for it — the session expired dialog handles that
        if (error instanceof HttpErrorResponse && error.status === 440) {
          return throwError(error);
        }

        if (error instanceof HttpErrorResponse) {
          if (error.status === 0) {
            this.show(
              'error',
              'Network Error',
              'Cannot reach the server. Check your connection.',
            );
          } else if (error.status >= 500) {
            this.show(
              'error',
              'Server Error',
              `Something went wrong (${error.status}). Please try again.`,
            );
          }
          // 4xx errors are business-logic errors handled at component level
        } else {
          // Non-HTTP errors (e.g., RxJS errors, JS exceptions)
          this.show(
            'error',
            'Unexpected Error',
            'An unexpected error occurred.',
          );
        }

        return throwError(error);
      }),
    );
  }

  private show(severity: string, summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 5000 });
  }
}
