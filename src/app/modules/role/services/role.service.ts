import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { GROUP, ROLE } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  constructor(private http: HttpClient) {}

  listRoles(params: IParams) {
    return this.http
      .get(
        ROLE.LIST + `/${params.orgId}` + `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addRole(categoryForm: FormGroup) {
    const { name, description, organisation, environments, users } =
      categoryForm.value;
    return this.http
      .post(ROLE.ADD, {
        name,
        description,
        organisation,
        environments,
        users,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteRole(orgId: string, id: string) {
    return this.http
      .delete(ROLE.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewRole(orgId: string, categoryId: string) {
    return this.http
      .get(ROLE.VIEW + `${orgId}/${categoryId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editRole(groupForm: FormGroup) {
    const { id, name, description, status, users, organisation } =
      groupForm.getRawValue();
    return this.http
      .put(ROLE.UPDATE, {
        id,
        name,
        description,
        status: status ? 1 : 0,
        users,
        organisation,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listPermissions(orgId: string, type: string) {
    return this.http
      .get(ROLE.LIST_PERMISSIONS + `${orgId}/${type}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
