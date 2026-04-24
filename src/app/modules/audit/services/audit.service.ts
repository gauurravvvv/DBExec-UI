import { Injectable } from '@angular/core';
import { lastValueFrom, Observable } from 'rxjs';
import { AUDIT } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  constructor(private http: HttpClientService) {}

  listAuditLogs(params: any) {
    return lastValueFrom(this.http.apiGet(AUDIT.LIST, { params }));
  }

  listLoginActivity(params: any) {
    return lastValueFrom(this.http.apiGet(AUDIT.LOGIN_ACTIVITY, { params }));
  }

  exportAuditLogs(params: any): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGS, { params, responseType: 'blob' });
  }

  exportLoginActivity(params: any): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGIN_ACTIVITY, { params, responseType: 'blob' });
  }
}
