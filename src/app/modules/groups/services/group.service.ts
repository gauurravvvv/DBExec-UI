import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { GROUP } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private _groups = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly groups = this._groups.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(GROUP.LIST, { params }),
      );
      if (res?.status) {
        this._groups.set(res.data.groups ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(groupId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(GROUP.GET + groupId),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { name, description, roleId, users } = form.value;
      return await lastValueFrom(
        this.http.apiPost(GROUP.ADD, { name, description, roleId, users }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async edit(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const { id, name, description, status, users, roleId } =
        form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(GROUP.UPDATE + id, {
          id,
          name,
          description,
          status: status ? 1 : 0,
          users,
          roleId,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiDelete(GROUP.DELETE + id, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(
    ids: string[],
    justification?: string,
  ): Promise<any> {
    return await lastValueFrom(
      this.http.apiPost(GROUP.BULK_DELETE, { ids, justification }),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }

  // Legacy methods kept for external module compatibility
  listGroups(params: any) {
    return lastValueFrom(this.http.apiGet(GROUP.LIST, { params }));
  }

  viewGroup(groupId: string) {
    return lastValueFrom(this.http.apiGet(GROUP.GET + groupId));
  }
}
