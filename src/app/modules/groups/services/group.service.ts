import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { GROUP } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  constructor(private http: HttpClient) {}

  listGroupps(params: IParams) {
    return this.http
      .get(
        GROUP.LIST +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addGroup(categoryForm: FormGroup) {
    const { name, description, organisation, environments, users } =
      categoryForm.value;
    return this.http
      .post(GROUP.ADD, {
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

  deleteGroup(orgId: string, id: string) {
    return this.http
      .delete(GROUP.DELETE + `${orgId}/${id}`)
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

  editGroup(groupForm: FormGroup) {
    const { id, name, description, status, users, organisation } =
      groupForm.getRawValue();
    return this.http
      .put(GROUP.EDIT, {
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
}
