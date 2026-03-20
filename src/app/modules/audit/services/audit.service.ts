import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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

  exportAuditLogs(params: any): Observable<Blob> {
    return this.http.get(AUDIT.EXPORT_LOGS, { params, responseType: 'blob' });
  }

  exportLoginActivity(params: any): Observable<Blob> {
    return this.http.get(AUDIT.EXPORT_LOGIN_ACTIVITY, { params, responseType: 'blob' });
  }
}
