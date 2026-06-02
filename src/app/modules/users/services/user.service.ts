import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { USER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * UserService — list/view/CUD for org users + unlock + password update
 * + bulk add (CSV validate → commit).
 *
 * Loading-state follows the rollout convention (see OrganisationService
 * docblock for the full story): `loading` for reads, `saving` for
 * writes, `_deleting`/`_unlocking` as per-id records so each row's
 * action button can spin independently. Every signal-based call passes
 * `{ skipLoader: true }` so the legacy global blocker stays out of
 * this module — templates render skeleton placeholders + button-level
 * spinners while the signals are true.
 *
 * Legacy methods `listUser` / `viewOrgUser` keep the global blocker
 * because external modules (groups add/edit, access manager, etc.)
 * still consume them.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private _users = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _deleting = signal<Record<string, boolean>>({});
  private _unlocking = signal<Record<string, boolean>>({});
  private _changingPassword = signal(false);
  private _bulkValidating = signal(false);
  private _bulkCommitting = signal(false);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // user ngOnDestroy) can cancel in-flight GETs. Mutations don't.
  private _cancelReads$ = new Subject<void>();

  readonly users = this._users.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly deleting = this._deleting.asReadonly();
  readonly unlocking = this._unlocking.asReadonly();
  readonly changingPassword = this._changingPassword.asReadonly();
  readonly bulkValidating = this._bulkValidating.asReadonly();
  readonly bulkCommitting = this._bulkCommitting.asReadonly();

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
          .apiGet(USER.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._users.set(res.data.users ?? []);
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
          .apiGet(USER.GET + id, { skipLoader: true })
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

  /**
   * Bulk-add validate — uploads a CSV and gets back a split of valid +
   * invalid rows. No users are created at this stage. The FE shows the
   * breakdown to the admin and then calls bulkAddCommit() with the
   * valid rows. CSV uploads can take a while; track via bulkValidating
   * so the dropzone can show a spinner without the global blocker.
   */
  async bulkAddValidate(file: File): Promise<any> {
    this._bulkValidating.set(true);
    try {
      const form = new FormData();
      form.append('file', file);
      return await lastValueFrom(
        this.http.apiPost(USER.BULK_ADD_VALIDATE, form, { skipLoader: true }),
      );
    } finally {
      this._bulkValidating.set(false);
    }
  }

  /**
   * Bulk-add commit — creates the previously-validated users. Pass the
   * `valid[]` array from the validate response verbatim.
   */
  async bulkAddCommit(users: any[]): Promise<any> {
    this._bulkCommitting.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          USER.BULK_ADD_COMMIT,
          { users },
          { skipLoader: true },
        ),
      );
    } finally {
      this._bulkCommitting.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email, groupIds, locale } =
        form.value;
      return await lastValueFrom(
        this.http.apiPost(
          USER.ADD,
          {
            firstName,
            lastName,
            username,
            email,
            groupIds,
            locale,
          },
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
      const { id, firstName, lastName, username, email, status, groupIds } =
        form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(
          USER.UPDATE + id,
          {
            id,
            firstName,
            lastName,
            username,
            email,
            status: status ? 1 : 0,
            groupIds: groupIds || [],
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
        this.http.apiDelete(USER.DELETE + id, {
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
          USER.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  async unlock(id: string): Promise<any> {
    this.setUnlocking(id, true);
    try {
      return await lastValueFrom(
        this.http.apiPost(
          USER.UNLOCK_PREFIX + id + USER.UNLOCK_SUFFIX,
          {},
          { skipLoader: true },
        ),
      );
    } finally {
      this.setUnlocking(id, false);
    }
  }

  async updatePassword(id: string, password: string): Promise<any> {
    this._changingPassword.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          USER.UPDATE_PASSWORD_PREFIX + id + USER.UPDATE_PASSWORD_SUFFIX,
          { newPassword: password },
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

  // Legacy methods for external callers — both pass skipLoader so
  // they don't kick the global blocker. Callers (groups add/edit
  // users multiselect, access manager dropdowns, etc.) drive their
  // own loading state.
  listUser(params: any) {
    return lastValueFrom(
      this.http.apiGet(USER.LIST, { params, skipLoader: true }),
    );
  }

  viewOrgUser(id: string) {
    return lastValueFrom(
      this.http.apiGet(USER.GET + id, { skipLoader: true }),
    );
  }
}
