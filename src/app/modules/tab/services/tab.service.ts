import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TAB } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class TabService {
  constructor(private http: HttpClient) {}

  listTab(params: any) {
    return this.http
      .get(TAB.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listAllTabData(params: any) {
    return this.http
      .get(TAB.GET_ALL, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteTab(orgId: string, id: string) {
    return this.http
      .delete(TAB.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addTab(tabForm: FormGroup) {
    const { organisation, database, tabs } = tabForm.value;
    return this.http
      .post(TAB.ADD, {
        organisation,
        database,
        tabs,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewTab(orgId: string, id: string) {
    return this.http
      .get(TAB.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
