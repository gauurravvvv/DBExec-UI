import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { CREDENTIAL, ENVIRONMENT } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class CredentialService {
  constructor(private http: HttpClient) {}

  listCredentials(params: IParams) {
    return this.http
      .get(
        CREDENTIAL.LIST +
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

  addCredential(credentialForm: FormGroup) {
    const { name, description, organisation, environments, config } =
      credentialForm.value;
    return this.http
      .post(CREDENTIAL.ADD, {
        name,
        description,
        organisation,
        environments,
        config,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteCategory(orgId: string, id: string) {
    return this.http.delete(CREDENTIAL.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  viewCategory(orgId: string, categoryId: string) {
    return this.http.get(CREDENTIAL.VIEW + `${orgId}/${categoryId}`).pipe(
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

  editCategory(categoryData: any) {
    const {
      id,
      name,
      description,
      environments,
      status,
      config,
      organisation,
    } = categoryData;
    return this.http
      .put(CREDENTIAL.EDIT, {
        id,
        name,
        description,
        environments,
        status,
        config,
        organisation,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
