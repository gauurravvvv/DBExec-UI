import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { USER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private _users = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly users = this._users.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(USER.LIST, { params }),
      );
      if (res?.status) {
        this._users.set(res.data.users ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(USER.GET + id));
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Bulk-add validate — uploads a CSV and gets back a split of valid + invalid
   * rows. No users are created at this stage. The FE shows the breakdown to
   * the admin and then calls bulkAddCommit() with the valid rows.
   */
  async bulkAddValidate(file: File): Promise<any> {
    const form = new FormData();
    form.append('file', file);
    return lastValueFrom(this.http.apiPost(USER.BULK_ADD_VALIDATE, form));
  }

  /**
   * Bulk-add commit — creates the previously-validated users. Pass the
   * `valid[]` array from the validate response verbatim.
   */
  async bulkAddCommit(users: any[]): Promise<any> {
    return lastValueFrom(this.http.apiPost(USER.BULK_ADD_COMMIT, { users }));
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email, groupIds, locale } =
        form.value;
      return await lastValueFrom(
        this.http.apiPost(USER.ADD, {
          firstName,
          lastName,
          username,
          email,
          groupIds,
          locale,
        }),
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
        this.http.apiPut(USER.UPDATE + id, {
          id,
          firstName,
          lastName,
          username,
          email,
          status: status ? 1 : 0,
          groupIds: groupIds || [],
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiDelete(USER.DELETE + id, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiPost(USER.BULK_DELETE, { ids, justification }),
    );
  }

  async unlock(id: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiPost(USER.UNLOCK_PREFIX + id + USER.UNLOCK_SUFFIX, {}),
    );
  }

  async updatePassword(id: string, password: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiPut(
        USER.UPDATE_PASSWORD_PREFIX + id + USER.UPDATE_PASSWORD_SUFFIX,
        { newPassword: password },
      ),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }

  // Legacy methods for external callers
  listUser(params: any) {
    return lastValueFrom(this.http.apiGet(USER.LIST, { params }));
  }

  viewOrgUser(id: string) {
    return lastValueFrom(this.http.apiGet(USER.GET + id));
  }
}
