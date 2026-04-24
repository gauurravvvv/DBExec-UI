import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MessageService } from 'primeng/api';

@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  constructor(private messageService: MessageService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse | any) => {
        // 440 is handled by HttpRequestInterceptor (session refresh)
        // Don't show toast for it — the session expired dialog handles that
        if (error instanceof HttpErrorResponse && error.status === 440) {
          return throwError(error);
        }

        if (error instanceof HttpErrorResponse) {
          if (error.status === 0) {
            this.show('error', 'Network Error', 'Cannot reach the server. Check your connection.');
          } else if (error.status >= 500) {
            this.show('error', 'Server Error', `Something went wrong (${error.status}). Please try again.`);
          }
          // 4xx errors are business-logic errors handled at component level
        } else {
          // Non-HTTP errors (e.g., RxJS errors, JS exceptions)
          this.show('error', 'Unexpected Error', 'An unexpected error occurred.');
        }

        return throwError(error);
      }),
    );
  }

  private show(severity: string, summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 5000 });
  }
}
