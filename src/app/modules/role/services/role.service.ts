import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ROLE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  constructor(private http: HttpClientService) {}

  listRoles(orgId: string, params?: { page?: number; limit?: number; filter?: any }) {
    const queryParams: any = { orgId };
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return lastValueFrom(this.http.apiGet(ROLE.LIST, { params: queryParams }));
  }

  addRole(data: {
    name: string;
    description?: string;
    organisation: string;
    selectedPermissions: any[];
  }) {
    return lastValueFrom(this.http.apiPost(ROLE.ADD, data));
  }

  bulkDeleteRole(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(ROLE.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  deleteRole(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(ROLE.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  viewRole(orgId: string, roleId: string) {
    return lastValueFrom(this.http.apiGet(ROLE.VIEW + `${orgId}/${roleId}`));
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

  listPermissions() {
    return lastValueFrom(this.http.apiGet(ROLE.LIST_PERMISSIONS));
  }
}
