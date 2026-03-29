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

  deleteSuperAdmin(id: string, justification?: string) {
    return this.http
      .request('DELETE', SUPER_ADMIN.DELETE + `${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addSuperAdmin(superAdminForm: FormGroup) {
    const { firstName, lastName, username, email } = superAdminForm.value;
    return this.http
      .post(SUPER_ADMIN.ADD, {
        firstName,
        lastName,
        username,
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

  updateSuperAdmin(superAdminForm: FormGroup, justification?: string) {
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
        justification,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  unlockSuperAdmin(id: string) {
    return this.http
      .put(SUPER_ADMIN.UNLOCK + `${id}`, {})
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
