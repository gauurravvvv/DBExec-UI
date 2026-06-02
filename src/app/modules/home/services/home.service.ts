import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { HOME } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class HomeService {
  private _dashboard = signal<any>(null);
  private _loading = signal(false);

  // Reads pipe through this Subject so callers (home ngOnDestroy)
  // can cancel in-flight GETs when the user navigates away.
  private _cancelReads$ = new Subject<void>();

  readonly dashboard = this._dashboard.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadSystemAdminDashboard() {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(HOME.SYSTEM_ADMIN)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._dashboard.set(res.data);
      return res;
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
      return undefined;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  resetDashboard() {
    this._dashboard.set(null);
  }

  // Legacy — kept for external compatibility
  getSystemAdminDashboard() {
    return this.http.apiGet(HOME.SYSTEM_ADMIN);
  }
}
