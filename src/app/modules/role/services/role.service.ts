import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ROLE } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  constructor(private http: HttpClient) {}

  listRoles(orgId: string, params?: { page?: number; limit?: number; filter?: any }) {
    const queryParams: any = { orgId };
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return this.http
      .get(ROLE.LIST, { params: queryParams })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addRole(data: {
    name: string;
    description?: string;
    organisation: string;
    selectedPermissions: any[];
  }) {
    return this.http
      .post(ROLE.ADD, data)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  bulkDeleteRole(ids: string[], justification: string | undefined, orgId: string) {
    return this.http
      .request('DELETE', ROLE.BULK_DELETE + orgId, {
        body: { ids, justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteRole(orgId: string, id: string, justification?: string) {
    return this.http
      .request('DELETE', ROLE.DELETE + `${orgId}/${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewRole(orgId: string, roleId: string) {
    return this.http
      .get(ROLE.VIEW + `${orgId}/${roleId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
    return this.http
      .put(ROLE.UPDATE, { ...data, justification })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listPermissions() {
    return this.http
      .get(ROLE.LIST_PERMISSIONS)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
