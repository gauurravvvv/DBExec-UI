import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DASHBOARD } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private http: HttpClient) {}

  addDashboard(payload: any) {
    return this.http
      .post(DASHBOARD.ADD, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getDashboard(orgId: string, id: string) {
    return this.http
      .get(DASHBOARD.GET + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listDashboards(params: any) {
    return this.http
      .get(DASHBOARD.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteDashboard(orgId: string, id: string, justification: string) {
    return this.http
      .request('DELETE', DASHBOARD.DELETE + `${orgId}/${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
