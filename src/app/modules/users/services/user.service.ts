import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { USER } from 'src/app/constants/api';
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

  async loadOne(orgId: string, id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(USER.VIEW + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email, organisation, groupIds, locale } =
        form.value;
      return await lastValueFrom(
        this.http.apiPost(USER.ADD, {
          firstName,
          lastName,
          username,
          email,
          organisation,
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
      const {
        id,
        firstName,
        lastName,
        username,
        email,
        status,
        organisation,
        groupIds,
      } = form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(USER.UPDATE, {
          id,
          firstName,
          lastName,
          username,
          email,
          organisation,
          status: status ? 1 : 0,
          groupIds: groupIds || [],
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(
    id: string,
    orgId: string,
    justification?: string,
  ): Promise<any> {
    return await lastValueFrom(
      this.http.apiDelete(USER.DELETE + `${orgId}/${id}`, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    return await lastValueFrom(
      this.http.apiDelete(USER.BULK_DELETE + orgId, {
        body: { ids, justification },
      }),
    );
  }

  async unlock(orgId: string, id: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiPut(USER.UNLOCK + `${orgId}/${id}`, {}),
    );
  }

  async updatePassword(id: string, password: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiPut(USER.UPDATE_PASSWORD, { id, newPassword: password }),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }

  // Legacy methods for external callers
  listUser(params: any) {
    return lastValueFrom(this.http.apiGet(USER.LIST, { params }));
  }

  viewOrgUser(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(USER.VIEW + `${orgId}/${id}`));
  }
}
