import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { SCREEN, TAB } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class ScreenService {
  constructor(private http: HttpClient) {}

  listScreen(params: any) {
    return this.http
      .get(
        SCREEN.LIST +
          `/${params.orgId}/${params.databaseId}/${params.pageNumber}/${params.limit}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteScreen(orgId: string, id: string) {
    return this.http.delete(SCREEN.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  addScreen(screenForm: FormGroup) {
    const { organisation, database, name, description } = screenForm.value;
    return this.http
      .post(SCREEN.ADD, {
        organisation,
        database,
        name,
        description,
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
}
