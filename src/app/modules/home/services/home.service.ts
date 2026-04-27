import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { HOME } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class HomeService {
  private _dashboard = signal<any>(null);
  private _loading = signal(false);

  readonly dashboard = this._dashboard.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadSuperAdminDashboard(orgId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(HOME.SUPER_ADMIN + `${orgId}`),
      );
      if (res?.status) this._dashboard.set(res.data);
      return res;
    } finally {
      this._loading.set(false);
    }
  }

  resetDashboard() {
    this._dashboard.set(null);
  }

  // Legacy — kept for external compatibility
  getSuperAdminDashboard(orgId: string) {
    return this.http.apiGet(HOME.SUPER_ADMIN + `${orgId}`);
  }
}
