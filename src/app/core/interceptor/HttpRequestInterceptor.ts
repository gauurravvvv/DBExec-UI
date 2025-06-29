import { Injectable } from "@angular/core";
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
  HttpResponse,
} from "@angular/common/http";

import { Observable, throwError } from "rxjs";
import { catchError, retry, map, finalize } from "rxjs/operators";
import { environment } from "src/environments/environment";
import { LoadingService } from "../services/loading.service";
import { Router } from "@angular/router";
import { StorageType } from "src/app/constants/storageType";
import { StorageService } from "../services/storage.service";

@Injectable()
export class HttpRequestInterceptor implements HttpInterceptor {
  accessToken!: string;
  appAccessToken!: string | null;

  constructor(private loadingService: LoadingService, private router: Router) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Check if we should skip the loader for this request
    const skipLoader = req.headers.has('X-Skip-Loader');
    
    if (!skipLoader) {
      this.loadingService.showLoader();
    }
    
    this.accessToken = StorageService.get(StorageType.ACCESS_TOKEN) || "";

    if (req.url.includes("assets")) {
      if (!skipLoader) {
        this.loadingService.hideLoader();
      }
      return next.handle(req);
    }

    // Determine server based on custom header
    const serverType = req.headers.get('X-Server-Type');
    let serverUrl: string;
    
    if (serverType === 'query') {
      serverUrl = environment.queryServer || 'http://localhost:3001/api/v1';
    } else {
      serverUrl = environment.apiServer || 'http://localhost:3000/api/v1';
    }

    const URL = serverUrl + req.url;

    // Remove the custom headers before sending the request
    let headers = req.headers.set("token", this.accessToken);
    if (headers.has('X-Server-Type')) {
      headers = headers.delete('X-Server-Type');
    }
    if (headers.has('X-Skip-Loader')) {
      headers = headers.delete('X-Skip-Loader');
    }

    req = req.clone({
      url: URL,
      headers: headers,
    });

    return next.handle(req).pipe(
      retry(2),
      map((evt) => this.handleSuccess(req, evt)),
      catchError((error) => this.handleError(error)),
      finalize(() => {
        if (!skipLoader) {
          this.loadingService.hideLoader();
        }
      })
    );
  }

  private handleSuccess(
    req: HttpRequest<any>,
    evt: HttpEvent<any>
  ): HttpEvent<any> {
    if (evt instanceof HttpResponse) {
      if (evt.body.code === 501 || evt.body.code === 503) {
        window.location.href = "";
        StorageService.remove(StorageType.ACCESS_TOKEN);
        return evt;
      }
    }
    return evt;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    return throwError(error);
  }
}
