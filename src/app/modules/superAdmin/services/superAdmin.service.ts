import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { SUPER_ADMIN } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class SuperAdminService {
  constructor(private http: HttpClient) {}

  listSuperAdmin(params: any) {
    return this.http
      .get(SUPER_ADMIN.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteSuperAdmin(id: number) {
    return this.http
      .delete(SUPER_ADMIN.DELETE + `${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addSuperAdmin(superAdminForm: FormGroup) {
    const { firstName, lastName, username, password, email } =
      superAdminForm.value;
    return this.http
      .post(SUPER_ADMIN.ADD, {
        firstName,
        lastName,
        username,
        password,
        email,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewSuperAdmin(id: string) {
    return this.http
      .get(SUPER_ADMIN.VIEW + `${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateSuperAdmin(superAdminForm: FormGroup) {
    const { id, firstName, lastName, username, email, status } =
      superAdminForm.getRawValue();
    return this.http
      .put(SUPER_ADMIN.UPDATE, {
        id,
        firstName,
        lastName,
        username,
        email,
        status: status ? 1 : 0,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateSuperAdminPassword(id: string, password: string) {
    return this.http
      .put(SUPER_ADMIN.UPDATE_PASSWORD, { id, newPassword: password })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
