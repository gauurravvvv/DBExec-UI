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

  deleteUser(id: string) {
    return this.http.delete(USER.DELETE + `${id}`).pipe(
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

  viewOrgUser(id: string) {
    return this.http.get(USER.VIEW + `${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  updateUser(userForm: FormGroup) {
    const { id, firstName, lastName, username, email, mobile, status } =
      userForm.getRawValue();
    return this.http
      .put(USER.UPDATE, {
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
}
