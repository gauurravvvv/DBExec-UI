import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { USER } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(private http: HttpClient) {}

  listUser(params: IParams) {
    return this.http
      .get(
        USER.LIST + `/${params.orgId}` + `/${params.pageNumber}/${params.limit}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteUser(id: string, orgId: string) {
    return this.http.delete(USER.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  addUser(userForm: FormGroup) {
    const {
      firstName,
      lastName,
      username,
      password,
      email,
      mobile,
      organisation,
    } = userForm.value;
    return this.http
      .post(USER.ADD, {
        firstName,
        lastName,
        username,
        password,
        email,
        mobile,
        organisation,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  viewOrgUser(orgId: string, id: string) {
    return this.http.get(USER.VIEW + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  updateUser(userForm: FormGroup) {
    const {
      id,
      firstName,
      lastName,
      username,
      email,
      mobile,
      status,
      organisation,
    } = userForm.getRawValue();
    return this.http
      .put(USER.UPDATE, {
        id,
        firstName,
        lastName,
        username,
        email,
        mobile,
        organisation,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  updateUserPassword(id: string, password: string) {
    return this.http
      .put(USER.UPDATE_PASSWORD, { id, newPassword: password })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
