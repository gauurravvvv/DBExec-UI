import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AUDIT } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  constructor(private http: HttpClient) {}

  listAuditLogs(params: any) {
    return this.http
      .get(AUDIT.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  listLoginActivity(params: any) {
    return this.http
      .get(AUDIT.LOGIN_ACTIVITY, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
