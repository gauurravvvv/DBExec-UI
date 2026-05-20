import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SYSTEM_ADMIN } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class SystemAdminService {
  private _admins = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly admins = this._admins.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(SYSTEM_ADMIN.LIST, { params }),
      );
      if (res?.status) {
        this._admins.set(res.data.systemAdmins ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(SYSTEM_ADMIN.GET + id),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email } = form.value;
      return await lastValueFrom(
        this.http.apiPost(SYSTEM_ADMIN.ADD, {
          firstName,
          lastName,
          username,
          email,
        }),
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
        this.http.apiPut(SYSTEM_ADMIN.UPDATE + id, {
          id,
          firstName,
          lastName,
          username,
          email,
          status: status ? 1 : 0,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(SYSTEM_ADMIN.DELETE + id, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    // POST /system-admins/bulk-delete
    return lastValueFrom(
      this.http.apiPost(SYSTEM_ADMIN.BULK_DELETE, { ids, justification }),
    );
  }

  async unlock(id: string): Promise<any> {
    // POST /system-admins/:id/unlock — action, not update.
    return lastValueFrom(
      this.http.apiPost(
        SYSTEM_ADMIN.UNLOCK_PREFIX + id + SYSTEM_ADMIN.UNLOCK_SUFFIX,
        {},
      ),
    );
  }

  async updatePassword(id: string, password: string): Promise<any> {
    // PUT /system-admins/:id/password
    return lastValueFrom(
      this.http.apiPut(
        SYSTEM_ADMIN.UPDATE_PASSWORD_PREFIX +
          id +
          SYSTEM_ADMIN.UPDATE_PASSWORD_SUFFIX,
        { id, newPassword: password },
      ),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }
}
