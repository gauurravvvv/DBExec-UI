import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { AUTH } from 'src/app/constants/api';
import { StorageType } from 'src/app/constants/storageType';
import { ROLES } from 'src/app/constants/user.constant';
import { StorageService } from 'src/app/core/services/storage.service';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  isForgetPasswordForm = false;
  constructor(private http: HttpClient) {}

  login(loginForm: UntypedFormGroup) {
    const { organisation, username, password } = loginForm.value;
    return this.http
      .post(AUTH.LOGIN, {
        organisation,
        username,
        password,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        if (result.status) {
          // Store access token and refresh token
          this.setAccessToken(result.data.accessToken);
          this.setRefreshToken(result.data.refreshToken);

          // Store other details
          StorageService.set(StorageType.ROLE, result.data.user.role);

          StorageService.set(
            StorageType.ORGANISATION_ID,
            result.data.user.organisationId,
          );

          StorageService.set(
            StorageType.ORGANISATION,
            result.data.user.organisationName,
          );
        }
        return result;
      });
  }

  generateOTP(forgotPasswordForm: UntypedFormGroup) {
    const { organisation, username, email } = forgotPasswordForm.value;
    return this.http
      .post(AUTH.GENERATE_OTP, {
        organisation: organisation,
        username: username,
        email: email,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  resetPassword(loginForm: UntypedFormGroup, id: number) {
    const { otp, newPassword } = loginForm.value;
    return this.http
      .post(AUTH.RESET_PASSWORD, {
        id: id,
        otp: +otp,
        password: newPassword,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  logout(): Observable<any> {
    return this.http.post(AUTH.LOGOUT, {});
  }

  refreshAccessToken(): Observable<any> {
    const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
    const organisation = StorageService.get(StorageType.ORGANISATION);
    return this.http.post(AUTH.REFRESH_TOKEN, {
      refreshToken,
      organisation,
    });
  }

  public setAccessToken(accessToken: string) {
    StorageService.set(StorageType.ACCESS_TOKEN, accessToken);
  }

  public setRefreshToken(refreshToken: string) {
    StorageService.set(StorageType.REFRESH_TOKEN, refreshToken);
  }

  public isLoggedIn() {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    return accessToken;
  }
}
