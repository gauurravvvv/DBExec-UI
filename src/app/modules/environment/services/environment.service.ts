import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { ENVIRONMENT } from 'src/app/constants/api';
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
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addEnvironment(envForm: FormGroup) {
    const { name, description, organisation } = envForm.value;
    return this.http
      .post(ENVIRONMENT.ADD, {
        name,
        description,
        organisation,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteEnvironment(orgId: string, envId: string) {
    return this.http
      .delete(ENVIRONMENT.DELETE + `${orgId}/${envId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewEnvironment(orgId: string, envId: string) {
    return this.http
      .get(ENVIRONMENT.VIEW + `${orgId}/${envId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editEnvironment(envForm: FormGroup) {
    const { id, name, description, status, organisation } =
      envForm.getRawValue();
    return this.http
      .put(ENVIRONMENT.EDIT, {
        id,
        name,
        description,
        status: status ? 1 : 0,
        organisation,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
