import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { SYSTEM_ADMIN } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * SystemAdminService — list/view/CUD for the master-DB system admins.
 *
 * Loading-state signals follow the convention shared with
 * OrganisationService (and every other module in the skeleton-loading
 * rollout): `loading` for READ traffic, `saving` for WRITE traffic,
 * `deleting` as a per-id map so each row's delete button can spin
 * independently. Every API call passes `{ skipLoader: true }` so the
 * legacy global blocker stays out of this module — the templates show
 * a localised skeleton (table rows / form fields / detail card) while
 * the signals are true.
 */
@Injectable({ providedIn: 'root' })
export class SystemAdminService {
  private _admins = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  // Per-row delete state. A single boolean would freeze every delete
  // button in the list while one row is in flight, which feels wrong
  // for bulk delete (where we WANT each selected row to spin).
  private _deleting = signal<Record<string, boolean>>({});
  // Per-action flags that map onto specific buttons (unlock / change
  // password). Kept off `_saving` so the form's Save button doesn't
  // think a side-action is the form submit.
  private _unlocking = signal<Record<string, boolean>>({});
  private _changingPassword = signal(false);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // system-admin ngOnDestroy) can cancel in-flight GETs.
  private _cancelReads$ = new Subject<void>();

  readonly admins = this._admins.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly deleting = this._deleting.asReadonly();
  readonly unlocking = this._unlocking.asReadonly();
  readonly changingPassword = this._changingPassword.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  isUnlocking(id: string): boolean {
    return !!this._unlocking()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }
  private setUnlocking(id: string, on: boolean): void {
    const map = { ...this._unlocking() };
    if (on) map[id] = true;
    else delete map[id];
    this._unlocking.set(map);
  }

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(SYSTEM_ADMIN.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._admins.set(res.data.systemAdmins ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(SYSTEM_ADMIN.GET + id, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
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

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email } = form.value;
      return await lastValueFrom(
        this.http.apiPost(
          SYSTEM_ADMIN.ADD,
          { firstName, lastName, username, email },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const { id, firstName, lastName, username, email, status } =
        form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(
          SYSTEM_ADMIN.UPDATE + id,
          {
            id,
            firstName,
            lastName,
            username,
            email,
            status: status ? 1 : 0,
            justification,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(SYSTEM_ADMIN.DELETE + id, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(id, false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          SYSTEM_ADMIN.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  async unlock(id: string): Promise<any> {
    // POST /system-admins/:id/unlock — action, not update.
    this.setUnlocking(id, true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          SYSTEM_ADMIN.UNLOCK_PREFIX + id + SYSTEM_ADMIN.UNLOCK_SUFFIX,
          {},
          { skipLoader: true },
        ),
      );
    } finally {
      this.setUnlocking(id, false);
    }
  }

  async updatePassword(id: string, password: string): Promise<any> {
    // PUT /system-admins/:id/password
    this._changingPassword.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          SYSTEM_ADMIN.UPDATE_PASSWORD_PREFIX +
            id +
            SYSTEM_ADMIN.UPDATE_PASSWORD_SUFFIX,
          { id, newPassword: password },
          { skipLoader: true },
        ),
      );
    } finally {
      this._changingPassword.set(false);
    }
  }

  resetCurrent() {
    this._current.set(null);
  }
}
