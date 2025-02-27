import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { ORGANISATION } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class OrganisationService {
  constructor(private http: HttpClient) {}

  listOrganisation(params: IParams) {
    return this.http
      .get(ORGANISATION.LIST + `/${params.pageNumber}/${params.limit}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  addOrganisation(orgForm: FormGroup) {
    const {
      name,
      description,
      maxUsers,
      maxEnvironments,
      maxDatabases,
      maxAdmins,
      maxCategories,
      maxGroups,
      encryptionAlgorithm,
      pepperKey,
    } = orgForm.value;
    return this.http
      .post(ORGANISATION.ADD, {
        name,
        description,
        maxUsers,
        maxEnvironments,
        maxDatabases,
        maxAdmins,
        maxCategories,
        maxGroups,
        encryptionAlgorithm,
        pepperKey,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  editOrganisation(orgForm: FormGroup) {
    const {
      id,
      name,
      maxUsers,
      maxEnvironment,
      maxDatabases,
      maxAdmins,
      maxCategories,
      maxGroups,
      status,
    } = orgForm.getRawValue();
    return this.http
      .put(ORGANISATION.EDIT, {
        id,
        name,
        maxUsers,
        maxEnvironment,
        maxDatabases,
        maxAdmins,
        maxCategories,
        maxGroups,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteOrganisation(orgId: string) {
    return this.http.delete(ORGANISATION.DELETE + `${orgId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  viewOrganisation(id: string) {
    return this.http.get(ORGANISATION.VIEW + `${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }
}
