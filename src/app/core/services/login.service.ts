import { Injectable, OnDestroy } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { UntypedFormGroup } from '@angular/forms';
import { Observable } from 'rxjs';
import { AUTH } from 'src/app/constants/api';
import { StorageType } from 'src/app/constants/storageType';
import { ROLES } from 'src/app/constants/user.constant';
import { StorageService } from 'src/app/core/services/storage.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class LoginService implements OnDestroy {
  isForgetPasswordForm = false;
  private refreshTimer: any = null;

  constructor(private http: HttpClientService) {}

  async login(loginForm: UntypedFormGroup): Promise<any> {
    const { organisation, username, password } = loginForm.value;
    const result: any = await lastValueFrom(
      this.http.apiPost(AUTH.LOGIN, { organisation, username, password }),
    );
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

      if (result.data.sessionInactivityTimeout) {
        StorageService.set(
          StorageType.SESSION_INACTIVITY_TIMEOUT,
          result.data.sessionInactivityTimeout.toString(),
        );
      }
    }
    return result;
  }

  generateOTP(forgotPasswordForm: UntypedFormGroup) {
    const { organisation, username, email } = forgotPasswordForm.value;
    return lastValueFrom(
      this.http.apiPost(AUTH.GENERATE_OTP, {
        organisation,
        username,
        email,
      }),
    );
  }

  resetPassword(
    loginForm: UntypedFormGroup,
    id: string,
    orgId: string,
    otp?: string,
  ) {
    const { otp: formOtp, newPassword } = loginForm.value;
    return lastValueFrom(
      this.http.apiPost(AUTH.RESET_PASSWORD, {
        id,
        orgId,
        otp: otp || formOtp,
        password: newPassword,
      }),
    );
  }

  setPassword(password: string, id: string, orgId: string, token: string) {
    return lastValueFrom(
      this.http.apiPost(AUTH.SET_PASSWORD, { id, orgId, token, password }),
    );
  }

  verifySetupToken(id: string, orgId: string, token: string) {
    return lastValueFrom(
      this.http.apiPost(AUTH.VERIFY_SETUP_TOKEN, { id, orgId, token }),
    );
  }

  resendSetupLink(id: string, orgId: string) {
    return lastValueFrom(
      this.http.apiPost(AUTH.RESEND_SETUP_LINK, { id, orgId }),
    );
  }

  cliAuthorize(code: string, action: 'authorize' | 'deny'): Observable<any> {
    return this.http.apiPost(AUTH.CLI_AUTHORIZE, { code, action });
  }

  logout(): Observable<any> {
    return this.http.apiPost(AUTH.LOGOUT, {});
  }

  refreshAccessToken(): Observable<any> {
    const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
    const organisation = StorageService.get(StorageType.ORGANISATION);
    return this.http.apiPost(AUTH.REFRESH_TOKEN, {
      refreshToken,
      organisation,
    });
  }

  public setAccessToken(accessToken: string) {
    StorageService.set(StorageType.ACCESS_TOKEN, accessToken);
    this.scheduleTokenRefresh(accessToken);
  }

  public setRefreshToken(refreshToken: string) {
    StorageService.set(StorageType.REFRESH_TOKEN, refreshToken);
  }

  /**
   * Schedule a proactive token refresh at 80% of the access token's lifetime.
   * This prevents the token from actually expiring during active use,
   * avoiding the 440 → refresh → retry cycle.
   */
  public scheduleTokenRefresh(accessToken?: string): void {
    this.clearRefreshTimer();

    const token = accessToken || StorageService.get(StorageType.ACCESS_TOKEN);
    if (!token) return;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return;

      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp || !payload.iat) return;

      const issuedAt = payload.iat * 1000;
      const expiresAt = payload.exp * 1000;
      const lifetime = expiresAt - issuedAt;
      // Refresh at 80% of lifetime (e.g., 12 min for a 15-min token)
      const refreshAt = issuedAt + lifetime * 0.8;
      const delay = refreshAt - Date.now();

      if (delay <= 0) return; // Already past refresh point

      this.refreshTimer = setTimeout(() => {
        const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
        if (!refreshToken) return;

        // Use X-Skip-Loader to avoid showing the loading spinner
        this.refreshAccessToken().subscribe({
          next: (response: any) => {
            if (response.status && response.data?.accessToken) {
              this.setAccessToken(response.data.accessToken);
            }
          },
          error: () => {
            // Proactive refresh failed — the reactive interceptor will handle it
          },
        });
      }, delay);
    } catch {
      // Token parsing failed — skip scheduling
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearRefreshTimer();
  }

  public isLoggedIn(): boolean {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    if (!accessToken) return false;

    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      // Check token expiry (exp is in seconds)
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        // Access token expired — but if refresh token exists, user can still recover
        // The HTTP interceptor will handle the 440 → refresh flow automatically
        const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
        if (refreshToken) {
          return true; // Still "logged in" — interceptor will refresh on next API call
        }
        // Both tokens gone — fully clear and logout
        StorageService.clear();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
