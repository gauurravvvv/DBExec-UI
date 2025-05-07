import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ORG_ADMIN } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class OrganisationAdminService {
  constructor(private http: HttpClient) {}

  listOrganisationAdmin(params: IParams) {
    return this.http
      .get(
        ORG_ADMIN.LIST +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addOrganisationAdmin(orgAdminForm: FormGroup) {
    const {
      firstName,
      lastName,
      email,
      password,
      organisation,
      username,
      mobile,
    } = orgAdminForm.value;
    return this.http
      .post(ORG_ADMIN.ADD, {
        firstName,
        lastName,
        email,
        password,
        organisation,
        username,
        mobile,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteAdminOrganisation(orgId: string, id: string) {
    return this.http
      .delete(ORG_ADMIN.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewOrganisationAdmin(orgId: string, id: string) {
    return this.http
      .get(ORG_ADMIN.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateOrgAdmin(orgAdminForm: FormGroup) {
    const {
      id,
      firstName,
      lastName,
      username,
      email,
      mobile,
      status,
      organisation,
    } = orgAdminForm.getRawValue();
    return this.http
      .put(ORG_ADMIN.UPDATE, {
        id,
        firstName,
        lastName,
        username,
        email,
        mobile,
        organisation,
        status: status ? 1 : 0,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateOrgAdminPassword(id: string, password: string) {
    return this.http
      .put(ORG_ADMIN.UPDATE_PASSWORD, { id, newPassword: password })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
