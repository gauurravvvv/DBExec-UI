import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { ACCESS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * AccessService — read/grant access for a connection.
 *
 * Both endpoints pass `{ skipLoader: true }` so the legacy global
 * blocker stays out of the access-manager page. The single component
 * (grant-access) renders skeleton placeholders for the user/group
 * checkbox lists while `loading` is true, and the Grant button shows
 * a spinner while `saving` is true.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private _accessDetails = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  // Reads pipe through this Subject so callers (grant-access
  // ngOnDestroy) can cancel in-flight GETs.
  private _cancelReads$ = new Subject<void>();

  readonly accessDetails = this._accessDetails.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadAccessDetails(connectionId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ACCESS.GET + `/${connectionId}`, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._accessDetails.set(res.data);
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

  async grantAccess(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      const { datasource, users, groups, connection } = payload;
      return await lastValueFrom(
        this.http.apiPost(
          ACCESS.GRANT,
          {
            datasource,
            users,
            groups,
            connection,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
