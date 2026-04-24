import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ROLE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private _roles       = signal<any[]>([]);
  private _total       = signal(0);
  private _current     = signal<any>(null);
  private _permissions = signal<any[]>([]);
  private _loading     = signal(false);
  private _saving      = signal(false);

  readonly roles       = this._roles.asReadonly();
  readonly total       = this._total.asReadonly();
  readonly current     = this._current.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly loading     = this._loading.asReadonly();
  readonly saving      = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(ROLE.LIST, { params }));
      if (res?.status) {
        this._roles.set(res.data.roles ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, roleId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(ROLE.VIEW + `${orgId}/${roleId}`));
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async loadPermissions() {
    const res: any = await lastValueFrom(this.http.apiGet(ROLE.LIST_PERMISSIONS));
    if (res?.status) this._permissions.set(res.data?.permissions ?? []);
  }

  async add(data: any): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPost(ROLE.ADD, data)); }
    finally { this._saving.set(false); }
  }

  async edit(data: any, justification?: string): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPut(ROLE.UPDATE, { ...data, justification })); }
    finally { this._saving.set(false); }
  }

  async delete(orgId: string, id: string, justification?: string): Promise<any> {
    return await lastValueFrom(this.http.apiDelete(ROLE.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  async bulkDelete(ids: string[], justification: string | undefined, orgId: string): Promise<any> {
    return await lastValueFrom(this.http.apiDelete(ROLE.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  resetCurrent() { this._current.set(null); }

  // ── Legacy aliases kept for external callers (groups module) ──────────────
  listRoles(orgId: string, params?: { page?: number; limit?: number; filter?: any }) {
    const queryParams: any = { orgId };
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return lastValueFrom(this.http.apiGet(ROLE.LIST, { params: queryParams }));
  }

  listPermissions() {
    return lastValueFrom(this.http.apiGet(ROLE.LIST_PERMISSIONS));
  }

  viewRole(orgId: string, roleId: string) {
    return lastValueFrom(this.http.apiGet(ROLE.VIEW + `${orgId}/${roleId}`));
  }

  addRole(data: {
    name: string;
    description?: string;
    organisation: string;
    selectedPermissions: any[];
  }) {
    return lastValueFrom(this.http.apiPost(ROLE.ADD, data));
  }

  editRole(
    data: {
      id: string;
      name: string;
      description?: string;
      organisation: string;
      selectedPermissions: any[];
      status: number;
    },
    justification?: string,
  ) {
    return lastValueFrom(this.http.apiPut(ROLE.UPDATE, { ...data, justification }));
  }

  deleteRole(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(ROLE.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteRole(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(ROLE.BULK_DELETE + orgId, { body: { ids, justification } }));
  }
}
