import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ACCESS } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class AccessService {
  constructor(private http: HttpClient) {}

  listAccessDetails(params: any) {
    return this.http
      .get(ACCESS.GET + `/${params.orgId}/${params.connectionId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  grantAccess(payload: any) {
    const { organisation, datasource, users, groups, connection } = payload;
    const requestBody: any = {
      organisation,
      datasource,
      users,
      groups,
      connection,
    };
    return this.http
      .post(ACCESS.GRANT, requestBody)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
