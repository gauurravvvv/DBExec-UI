import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { PROFILE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private _profile = signal<any>(null);
  private _loading = signal(false);

  // Reads pipe through this Subject so callers (profile ngOnDestroy)
  // can cancel in-flight GETs when the user navigates away.
  private _cancelReads$ = new Subject<void>();

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadProfile() {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(PROFILE.GET)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._profile.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
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

  changePassword(newPassword: string) {
    return lastValueFrom(
      this.http.apiPut(PROFILE.CHANGE_PASSWORD, { newPassword }),
    );
  }
}
