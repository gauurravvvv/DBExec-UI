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
import { environment } from "src/environments/environment.prod";
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
    this.loadingService.showLoader();
    this.accessToken = StorageService.get(StorageType.ACCESS_TOKEN) || "";

    const URL = environment.apiServer + req.url;

    if (req.url.includes("assets")) {
      this.loadingService.hideLoader();
      return next.handle(req);
    }

    req = req.clone({
      url: URL,
      headers: req.headers.set("token", this.accessToken),
    });

    return next.handle(req).pipe(
      retry(2),
      map((evt) => this.handleSuccess(req, evt)),
      catchError((error) => this.handleError(error)),
      finalize(() => this.loadingService.hideLoader())
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
