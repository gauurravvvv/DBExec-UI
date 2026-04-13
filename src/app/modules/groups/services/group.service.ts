import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { GROUP } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  constructor(private http: HttpClient) {}

  listGroups(params: any) {
    return this.http
      .get(GROUP.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addGroup(categoryForm: FormGroup) {
    const { name, description, organisation, roleId, users } =
      categoryForm.value;
    return this.http
      .post(GROUP.ADD, {
        name,
        description,
        organisation,
        roleId,
        users,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  bulkDeleteGroup(ids: string[], justification: string | undefined, orgId: string) {
    return this.http
      .request('DELETE', GROUP.BULK_DELETE + orgId, {
        body: { ids, justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteGroup(orgId: string, id: string, justification?: string) {
    return this.http
      .request('DELETE', GROUP.DELETE + `${orgId}/${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewGroup(orgId: string, categoryId: string) {
    return this.http
      .get(GROUP.VIEW + `${orgId}/${categoryId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editGroup(groupForm: FormGroup, justification?: string) {
    const { id, name, description, status, users, organisation, roleId } =
      groupForm.getRawValue();
    return this.http
      .put(GROUP.EDIT, {
        id,
        name,
        description,
        status: status ? 1 : 0,
        users,
        organisation,
        roleId,
        justification,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
