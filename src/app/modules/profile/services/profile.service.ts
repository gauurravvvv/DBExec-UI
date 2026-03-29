import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { PROFILE } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  constructor(private http: HttpClient) {}

  getProfile() {
    return this.http
      .get(PROFILE.GET)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  changePassword(newPassword: string) {
    return this.http
      .put(PROFILE.CHANGE_PASSWORD, { newPassword })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
