import { Injectable, inject, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { THEME } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { ThemePayload } from 'src/app/core/services/theme.service';

/**
 * ThemeSettingsService — settings-form-facing CRUD for the org's
 * branding row.
 *
 * Reads pipe through _cancelReads$ so the settings component can
 * cancel an in-flight GET on ngOnDestroy. Save and reset don't pipe
 * — half-applied branding writes leave the row in a weird state and
 * are worse than letting the request finish.
 *
 * Save / reset persist to the DB and update the local `current()`
 * signal so the form re-binds to the new values, but they do NOT
 * re-inject CSS variables for the current session. The editing
 * admin sees the new theme on their next sign-in, the same as every
 * other user in the org. The "Changes apply on next sign-in" hint
 * under the form communicates this contract to the admin.
 */
@Injectable({ providedIn: 'root' })
export class ThemeSettingsService {
  private readonly http = inject(HttpClientService);

  private _current = signal<ThemePayload | null>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _resetting = signal(false);

  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly resetting = this._resetting.asReadonly();

  private _cancelReads$ = new Subject<void>();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(THEME.GET, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async save(payload: Partial<ThemePayload>): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(THEME.SAVE, payload, { skipLoader: true }),
      );
      // Persist the returned row in the settings-form signal so the
      // form re-binds (e.g. the "Reset to default" button updates
      // its hidden state via isDefault). The visible theme does NOT
      // change here — the editing admin sees the new colours after
      // their next sign-in, same as everyone else.
      if (res?.status && res?.data) {
        this._current.set(res.data);
      }
      return res;
    } finally {
      this._saving.set(false);
    }
  }

  async reset(): Promise<any> {
    this._resetting.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(THEME.RESET, {}, { skipLoader: true }),
      );
      // Same contract as save: persist the row but don't repaint
      // the current session.
      if (res?.status && res?.data) {
        this._current.set(res.data);
      }
      return res;
    } finally {
      this._resetting.set(false);
    }
  }

  cancelReads(): void {
    this._cancelReads$.next();
  }
}
