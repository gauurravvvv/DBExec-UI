import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  constructor(private http: HttpClientService) {}

  getProfile() {
    return lastValueFrom(this.http.apiGet(PROFILE.GET));
  }

  changePassword(newPassword: string) {
    return lastValueFrom(this.http.apiPut(PROFILE.CHANGE_PASSWORD, { newPassword }));
  }
}
