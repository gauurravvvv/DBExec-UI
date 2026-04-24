import { Injectable, signal } from '@angular/core';
import { lastValueFrom, Observable } from 'rxjs';
import { AUDIT } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private _logs          = signal<any[]>([]);
  private _activity      = signal<any[]>([]);
  private _logsTotal     = signal(0);
  private _activityTotal = signal(0);
  private _logsLoading     = signal(false);
  private _activityLoading = signal(false);

  readonly logs            = this._logs.asReadonly();
  readonly activity        = this._activity.asReadonly();
  readonly logsTotal       = this._logsTotal.asReadonly();
  readonly activityTotal   = this._activityTotal.asReadonly();
  readonly logsLoading     = this._logsLoading.asReadonly();
  readonly activityLoading = this._activityLoading.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadAuditLogs(params: any) {
    this._logsLoading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(AUDIT.LIST, { params }));
      if (res?.status) {
        this._logs.set(res.data.logs ?? []);
        this._logsTotal.set(res.data.count ?? 0);
      }
    } finally {
      this._logsLoading.set(false);
    }
  }

  async loadLoginActivity(params: any) {
    this._activityLoading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(AUDIT.LOGIN_ACTIVITY, { params }));
      if (res?.status) {
        this._activity.set(res.data.activities ?? []);
        this._activityTotal.set(res.data.count ?? 0);
      }
    } finally {
      this._activityLoading.set(false);
    }
  }

  exportAuditLogs(params: any): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGS, { params, responseType: 'blob' });
  }

  exportLoginActivity(params: any): Observable<Blob> {
    return this.http.apiGet<Blob>(AUDIT.EXPORT_LOGIN_ACTIVITY, { params, responseType: 'blob' });
  }
}
