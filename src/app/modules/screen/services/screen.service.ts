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
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteScreen(orgId: string, id: string) {
    return this.http
      .delete(SCREEN.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewScreen(orgId: string, id: string) {
    return this.http
      .get(SCREEN.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateScreen(screenForm: FormGroup) {
    const { id, name, description, organisation, database, status } =
      screenForm.getRawValue();
    return this.http
      .put(SCREEN.UPDATE, {
        id,
        name,
        description,
        organisation,
        database,
        status: status ? 1 : 0,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  saveScreenConfiguration(
    configuration: any,
    organisationId: string,
    databaseId: string,
    screenId: string
  ) {
    return this.http
      .post(SCREEN.SAVE_CONFIGURATION, {
        configuration,
        organisationId,
        databaseId,
        screenId,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getScreenConfiguration(orgId: string, id: string) {
    return this.http
      .get(SCREEN.GET_SCREEN_CONFIGURATION + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
