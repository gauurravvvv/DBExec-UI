import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ORGANISATION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class OrganisationService {
  constructor(
    private http: HttpClient,
    private httpClientService: HttpClientService,
  ) {}

  listOrganisation(params: any) {
    return this.http
      .get(ORGANISATION.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addOrganisation(orgForm: FormGroup) {
    const { name, description, encryptionAlgorithm, pepperKey } = orgForm.value;
    return this.httpClientService
      .apiPost(ORGANISATION.ADD, {
        name,
        description,
        encryptionAlgorithm,
        pepperKey,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editOrganisation(orgForm: FormGroup) {
    const { id, name, status, description } = orgForm.getRawValue();
    return this.httpClientService
      .apiPut(ORGANISATION.EDIT, {
        id,
        name,
        status: status ? 1 : 0,
        description,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteOrganisation(orgId: string) {
    return this.httpClientService
      .apiDelete(ORGANISATION.DELETE + `${orgId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewOrganisation(id: string) {
    return this.httpClientService
      .apiGet(ORGANISATION.VIEW + `${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
