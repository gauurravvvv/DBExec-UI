import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ACCESS } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class AccessService {
  private _accessDetails = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly accessDetails = this._accessDetails.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadAccessDetails(orgId: string, connectionId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(ACCESS.GET + `/${orgId}/${connectionId}`),
      );
      if (res?.status) this._accessDetails.set(res.data);
      return res;
    } finally {
      this._loading.set(false);
    }
  }

  async grantAccess(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      const { organisation, datasource, users, groups, connection } = payload;
      return await lastValueFrom(
        this.http.apiPost(ACCESS.GRANT, {
          organisation,
          datasource,
          users,
          groups,
          connection,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }
}
