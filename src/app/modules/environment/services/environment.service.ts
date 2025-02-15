import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { ENVIRONMENT, ORG_ADMIN, ORGANISATION } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class EnvironmentService {
  constructor(private http: HttpClient) {}

  listEnvironments(params: IParams) {
    return this.http
      .get(
        ENVIRONMENT.LIST +
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

  addEnvironment(envForm: FormGroup) {
    const { name, description, organisation } = envForm.value;
    return this.http
      .post(ENVIRONMENT.ADD, {
        name,
        description,
        organisation,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteEnvironment(envId: string) {
    return this.http.delete(ENVIRONMENT.DELETE + `${envId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  viewEnvironment(envId: string) {
    return this.http.get(ENVIRONMENT.VIEW + `${envId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  editEnvironment(envForm: FormGroup) {
    const { id, name, description, status } = envForm.getRawValue();
    return this.http
      .put(ENVIRONMENT.EDIT, {
        id,
        name,
        description,
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
