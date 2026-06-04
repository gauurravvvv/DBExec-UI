import { Injectable, Injector, OnDestroy } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { lastValueFrom, Observable } from 'rxjs';
import { AUTH } from 'src/app/core/constants/api.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { BrandingService } from 'src/app/core/services/branding.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { LocaleService } from 'src/app/core/services/locale.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { ThemeService } from 'src/app/core/services/theme.service';

/**
 * LoginService — entry point for the two-phase login flow.
 *
 *   phase 1 — `login(form)` → POST /auth/login
 *     Verifies credentials, returns access + refresh tokens and the
 *     minimal payload the relay screen needs (first/last name,
 *     locale, isFirstLogin). Persists the relay-only fields in
 *     storage so the relay component can read them synchronously
 *     on mount, and applies the user's locale immediately so the
 *     relay's "Welcome" copy is localised on first paint.
 *
 *   phase 2 — `bootstrapSession()` → GET /auth/session
 *     Returns the full session payload (permissions, role, theme,
 *     branding, announcements, sessionInactivityTimeout, full user
 *     profile). Called by the relay component once it's mounted,
 *     and by the bootstrap-on-refresh path so a hard reload also
 *     re-hydrates the session without going through the relay
 *     screen.
 *
 * Token refresh (proactive + reactive) keeps shipping theme + branding
 * inline so a mid-session refresh repaints without an extra /session
 * round-trip. Permissions are not re-shipped on refresh — the JWT
 * itself carries them and a permission change requires a fresh login.
 */
@Injectable({
  providedIn: 'root',
})
export class LoginService implements OnDestroy {
  isForgetPasswordForm = false;
  private refreshTimer: any = null;

  constructor(
    private http: HttpClientService,
    private themeService: ThemeService,
    private brandingService: BrandingService,
    // LocaleService depends on LoginService (it reads the JWT and
    // calls logout on bad locale switches), so a direct constructor
    // injection here would form a cycle. Resolve it lazily via the
    // root injector — same pattern the HTTP interceptor uses for
    // ThemeService.
    private injector: Injector,
  ) {}

  private get localeService(): LocaleService {
    return this.injector.get(LocaleService);
  }

  /**
   * Phase 1 — verify credentials, stash tokens, prep the relay
   * screen. On success the caller routes to /auth/relay; on
   * failure the caller renders the inline error on the login form.
   */
  async login(loginForm: UntypedFormGroup): Promise<any> {
    const { organisation, username, password } = loginForm.value;
    // skipLoader: true — each auth page drives its own button-level
    // spinner (loading = signal(false) in the component), so the
    // legacy global blocker would just flash on top.
    const result: any = await lastValueFrom(
      this.http.apiPost(
        AUTH.LOGIN,
        { organisation, username, password },
        { skipLoader: true },
      ),
    );
    if (result.status) {
      // Tokens — needed for the phase-2 /auth/session call.
      this.setAccessToken(result.data.accessToken);
      this.setRefreshToken(result.data.refreshToken);

      // Org name is still needed for the refresh-token endpoint
      // (which is unauthenticated and uses org+refreshToken as the
      // bootstrap pair). The user typed it on the form.
      StorageService.set(StorageType.ORGANISATION, organisation);

      // Relay-only fields — read once by the relay component and
      // cleared when phase 2 completes. Kept out of the main user
      // blob to make their short lifecycle obvious.
      const u = result.data.user || {};
      StorageService.set(StorageType.RELAY_FIRST_NAME, u.firstName || '');
      StorageService.set(StorageType.RELAY_LAST_NAME, u.lastName || '');
      StorageService.set(
        StorageType.RELAY_IS_FIRST_LOGIN,
        u.isFirstLogin ? 'true' : 'false',
      );

      // Apply the user's saved locale immediately so the relay's
      // greeting and status copy render in the right language from
      // the first paint, before phase 2 returns.
      if (u.locale) {
        this.localeService.applyTempLocale(u.locale);
      }
    }
    return result;
  }

  /**
   * Phase 2 — fetch the full session payload. Owns all the storage
   * + signal writes that the old monolithic login used to do
   * (permissions, role, theme, branding, announcements, full user,
   * sessionInactivityTimeout).
   *
   * Returns a small discriminated outcome the relay component can
   * route on:
   *   - { ok: true, data }                       → bootstrap succeeded
   *   - { ok: false, kind: 'app', message }      → BE returned status:false
   *   - { ok: false, kind: 'transient', status, message }
   *                                              → network down OR 5xx
   *   - { ok: false, kind: 'fatal', status, message }
   *                                              → any other HTTP error
   *
   * The `kind` field is what drives auto-retry (only `transient`
   * qualifies). The raw server `message` is kept on the outcome
   * for the relay's "Details" line; the user-facing copy is the
   * friendly i18n string in every case.
   */
  async bootstrapSession(): Promise<{
    ok: boolean;
    kind?: 'app' | 'transient' | 'fatal';
    status?: number;
    data?: any;
    message?: string;
  }> {
    try {
      const result: any = await lastValueFrom(
        this.http.apiGet(AUTH.SESSION, { skipLoader: true }),
      );
      if (result?.status) {
        this.applyBootstrap(result.data || {});
        return { ok: true, data: result.data };
      }
      // BE returned a structured failure (status: false). That's
      // never transient — it's a business-level rejection
      // (session-expired, org-not-found, etc.). Don't retry.
      return { ok: false, kind: 'app', message: result?.message };
    } catch (err: any) {
      // HttpErrorResponse — status === 0 means the request never
      // reached the server (offline / CORS / DNS / mid-flight
      // abort). 5xx means the server tried and failed. Both are
      // worth one silent retry. Everything else (4xx) is fatal
      // for the bootstrap — a fresh attempt won't help.
      const status: number =
        typeof err?.status === 'number' ? err.status : -1;
      const isTransient = status === 0 || (status >= 500 && status < 600);
      return {
        ok: false,
        kind: isTransient ? 'transient' : 'fatal',
        status,
        message: err?.error?.message || err?.message,
      };
    }
  }

  /**
   * Apply a successful bootstrap payload. Pulled out of
   * `bootstrapSession` so the success path stays linear and the
   * outcome wrapper above can stay declarative.
   */
  private applyBootstrap(d: any): void {
    const user = d.user || {};

    StorageService.set(StorageType.ROLE, d.role || user.role || '');
    StorageService.set(
      StorageType.ORGANISATION_ID,
      user.organisationId || '',
    );
    StorageService.set(
      StorageType.ORGANISATION,
      user.organisationName || StorageService.get(StorageType.ORGANISATION),
    );

    if (d.sessionInactivityTimeout) {
      StorageService.set(
        StorageType.SESSION_INACTIVITY_TIMEOUT,
        d.sessionInactivityTimeout.toString(),
      );
    }

    // Same announcements-on-mount contract as the old monolithic
    // login — empty array default so downstream reads don't need
    // a null guard.
    StorageService.set(
      StorageType.ANNOUNCEMENTS,
      JSON.stringify(d.announcements ?? []),
    );

    // Apply theme + branding. `null` (system-admin path) clears
    // any previously injected style and reverts to the SCSS
    // defaults.
    this.themeService.applyFromLogin(d.theme);
    this.brandingService.applyFromLogin(d.branding);

    // Phase-2 ships the user's locale too — reapply (idempotent
    // if phase 1 already set it; matters when bootstrapSession
    // is invoked from the refresh path without a prior login).
    if (user.locale) {
      this.localeService.applyTempLocale(user.locale);
    }

    // Drop the short-lived relay fields now that the bootstrap is
    // complete.
    StorageService.remove(StorageType.RELAY_FIRST_NAME);
    StorageService.remove(StorageType.RELAY_LAST_NAME);
    StorageService.remove(StorageType.RELAY_IS_FIRST_LOGIN);
  }

  generateOTP(forgotPasswordForm: UntypedFormGroup) {
    const { organisation, username, email } = forgotPasswordForm.value;
    return lastValueFrom(
      this.http.apiPost(
        AUTH.GENERATE_OTP,
        {
          organisation,
          username,
          email,
        },
        { skipLoader: true },
      ),
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
      this.http.apiPost(
        AUTH.RESET_PASSWORD,
        {
          id,
          orgId,
          otp: otp || formOtp,
          password: newPassword,
        },
        { skipLoader: true },
      ),
    );
  }

  setPassword(password: string, id: string, orgId: string, token: string) {
    return lastValueFrom(
      this.http.apiPost(
        AUTH.SET_PASSWORD,
        { id, orgId, token, password },
        { skipLoader: true },
      ),
    );
  }

  verifySetupToken(id: string, orgId: string, token: string) {
    return lastValueFrom(
      this.http.apiPost(
        AUTH.VERIFY_SETUP_TOKEN,
        { id, orgId, token },
        { skipLoader: true },
      ),
    );
  }

  resendSetupLink(id: string, orgId: string) {
    return lastValueFrom(
      this.http.apiPost(
        AUTH.RESEND_SETUP_LINK,
        { id, orgId },
        { skipLoader: true },
      ),
    );
  }

  logout(): Observable<any> {
    return this.http.apiPost(AUTH.LOGOUT, {}, { skipLoader: true });
  }

  refreshAccessToken(): Observable<any> {
    const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
    const organisation = StorageService.get(StorageType.ORGANISATION);
    // refreshAccessToken is invoked silently by the interceptor and
    // by the proactive timer below — it must never trigger the global
    // blocker. skipLoader stays true here regardless of caller.
    return this.http.apiPost(
      AUTH.REFRESH_TOKEN,
      {
        refreshToken,
        organisation,
      },
      { skipLoader: true },
    );
  }

  public setAccessToken(accessToken: string) {
    StorageService.set(StorageType.ACCESS_TOKEN, accessToken);
    this.scheduleTokenRefresh(accessToken);
  }

  /**
   * Fire a single refresh-token call at app bootstrap (tab refresh,
   * direct URL entry) when an access token already exists. After
   * the token refreshes successfully, immediately re-fetch the
   * session payload so permissions / theme / branding /
   * announcements re-hydrate without going through the relay
   * screen (which is reserved for the post-login transition only).
   *
   * If no access token is present (unauthenticated landing on /login)
   * this is a no-op. If either call fails, the reactive 440 path
   * picks it up on the next request.
   */
  public bootstrapTokenRefresh(): void {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    const refreshToken = StorageService.get(StorageType.REFRESH_TOKEN);
    if (!accessToken || !refreshToken) return;

    this.refreshAccessToken().subscribe({
      next: (response: any) => {
        if (response.status && response.data?.accessToken) {
          this.setAccessToken(response.data.accessToken);
          this.themeService.applyFromLogin(response.data?.theme);
          this.brandingService.applyFromLogin(response.data?.branding);
          // Re-hydrate the rest of the session in the background.
          // Errors are swallowed here — the user is already on
          // their previous URL and reactive 440 will recover if
          // the token genuinely is bad.
          this.bootstrapSession().catch(() => {});
        }
      },
      error: () => {
        // Silent — the reactive 440 handler will pick this up on the
        // next outbound request.
      },
    });
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
              // Keep the injected CSS variables and the watermark in
              // sync with whatever the BE resolved at refresh time
              // (the org admin may have changed either between sessions).
              // `null` on either clears.
              this.themeService.applyFromLogin(response.data?.theme);
              this.brandingService.applyFromLogin(response.data?.branding);
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
