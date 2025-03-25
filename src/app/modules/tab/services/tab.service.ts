import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { SUPER_ADMIN, TAB } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class TabService {
  constructor(private http: HttpClient) {}

  listTab(params: any) {
    return this.http
      .get(
        TAB.LIST +
          `/${params.orgId}/${params.databaseId}/${params.pageNumber}/${params.limit}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteTab(orgId: string, id: string) {
    return this.http.delete(TAB.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  addTab(tabForm: FormGroup) {
    const { name, description, organisation, database } = tabForm.value;
    return this.http
      .post(TAB.ADD, {
        name,
        description,
        organisation,
        database,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  viewTab(orgId: string, id: string) {
    return this.http.get(TAB.VIEW + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  updateTab(tabForm: FormGroup) {
    const { id, name, description, organisation, database, status } =
      tabForm.getRawValue();
    return this.http
      .put(TAB.UPDATE, {
        id,
        name,
        description,
        organisation,
        database,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  updateSuperAdminPassword(id: string, password: string) {
    return this.http
      .put(SUPER_ADMIN.UPDATE_PASSWORD, { id, newPassword: password })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
