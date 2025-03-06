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

  addCredential(credentialForm: any) {
    const { organisation, categoryId, credentials } = credentialForm;
    return this.http
      .post(CREDENTIAL.ADD, {
        organisation,
        categoryId,
        credentials,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteCredential(orgId: string, credentialId: string) {
    return this.http
      .delete(CREDENTIAL.DELETE + `${orgId}/${credentialId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteAllCredential(orgId: string, categoryId: string) {
    return this.http
      .delete(CREDENTIAL.DELETE_ALL + `${orgId}/${categoryId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  getCredential(orgId: string, categoryId: string) {
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

  downloadCredentials(orgId: string, categoryId: string) {
    return this.http.get(CREDENTIAL.DOWNLOAD + `${orgId}/${categoryId}`, {
      responseType: 'blob',
    });
  }

  changeVisibility(orgId: string, credentialId: string) {
    return this.http
      .get(CREDENTIAL.CHANGE_VISIBILITY + `${orgId}/${credentialId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
