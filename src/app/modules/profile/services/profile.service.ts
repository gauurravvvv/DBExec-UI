import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private _profile = signal<any>(null);
  private _loading = signal(false);

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadProfile() {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(PROFILE.GET));
      if (res?.status) this._profile.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  changePassword(newPassword: string) {
    return lastValueFrom(
      this.http.apiPut(PROFILE.CHANGE_PASSWORD, { newPassword }),
    );
  }
}
