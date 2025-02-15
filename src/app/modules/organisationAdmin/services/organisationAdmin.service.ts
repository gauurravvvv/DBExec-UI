import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteAdminOrganisation(orgId: string) {
    return this.http.delete(ORG_ADMIN.DELETE + `${orgId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  viewOrganisationAdmin(id: string) {
    return this.http.get(ORG_ADMIN.VIEW + `${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  updateOrgAdmin(orgAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      orgAdminForm.getRawValue();
    return this.http
      .put(ORG_ADMIN.UPDATE, {
        id,
        firstName,
        lastName,
        username,
        email,
        mobile,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  updateOrgAdminPassword(id: string, password: string) {
    return this.http
      .put(ORG_ADMIN.UPDATE_PASSWORD, { id, newPassword: password })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
