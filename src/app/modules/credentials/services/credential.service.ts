import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';
import { SECRET } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class CredentialService {
  constructor(private http: HttpClient) {}

  listCredentials(params: IParams) {
    return this.http
      .get(
        SECRET.LIST +
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
      .post(SECRET.ADD, {
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
    return this.http.delete(SECRET.DELETE + `${orgId}/${credentialId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  deleteAllCredential(orgId: string, categoryId: string) {
    return this.http.delete(SECRET.DELETE_ALL + `${orgId}/${categoryId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  getCredential(orgId: string, categoryId: string) {
    return this.http.get(SECRET.VIEW + `${orgId}/${categoryId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  editCredential(credentialData: any) {
    const { credentialId, values, organisationId } = credentialData;
    return this.http
      .put(SECRET.EDIT, {
        credentialId,
        values,
        organisationId,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  downloadCredentials(orgId: string, categoryId: string) {
    return this.http.get(SECRET.DOWNLOAD + `${orgId}/${categoryId}`, {
      responseType: 'blob',
    });
  }

  changeVisibility(orgId: string, credentialId: string) {
    return this.http
      .get(SECRET.CHANGE_VISIBILITY + `${orgId}/${credentialId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
