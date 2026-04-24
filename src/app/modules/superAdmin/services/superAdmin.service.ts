import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { SUPER_ADMIN } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private _admins  = signal<any[]>([]);
  private _total   = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving  = signal(false);

  readonly admins  = this._admins.asReadonly();
  readonly total   = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving  = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(SUPER_ADMIN.LIST, { params }));
      if (res?.status) {
        this._admins.set(res.data.superAdmins ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(SUPER_ADMIN.VIEW + id));
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { firstName, lastName, username, email } = form.value;
      return await lastValueFrom(this.http.apiPost(SUPER_ADMIN.ADD, { firstName, lastName, username, email }));
    } finally {
      this._saving.set(false);
    }
  }

  async update(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const { id, firstName, lastName, username, email, status } = form.getRawValue();
      return await lastValueFrom(this.http.apiPut(SUPER_ADMIN.UPDATE, {
        id, firstName, lastName, username, email, status: status ? 1 : 0, justification,
      }));
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    return lastValueFrom(this.http.apiDelete(SUPER_ADMIN.DELETE + id, { body: { justification } }));
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    return lastValueFrom(this.http.apiDelete(SUPER_ADMIN.BULK_DELETE, { body: { ids, justification } }));
  }

  async unlock(id: string): Promise<any> {
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UNLOCK + id, {}));
  }

  async updatePassword(id: string, password: string): Promise<any> {
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UPDATE_PASSWORD, { id, newPassword: password }));
  }

  resetCurrent() { this._current.set(null); }
}
