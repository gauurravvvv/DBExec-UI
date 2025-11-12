import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CONNECTIONS, TAB } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {
  constructor(private http: HttpClient) {}

  listConnection(params: any) {
    return this.http
      .get(
        CONNECTIONS.LIST +
          `/${params.orgId}/${params.databaseId}/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listAllTabData(params: any) {
    return this.http
      .get(
        TAB.GET_ALL +
          `/${params.orgId}/${params.databaseId}/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteConnection(orgId: string, databaseId: string, id: string) {
    return this.http
      .delete(CONNECTIONS.DELETE + `${orgId}/${databaseId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addConnection(connectionForm: FormGroup) {
    const {
      organisation,
      database,
      name,
      description,
      dbUsername,
      dbPassword,
    } = connectionForm.value;
    return this.http
      .post(CONNECTIONS.ADD, {
        organisation,
        database,
        name,
        description,
        dbUsername,
        dbPassword,
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
