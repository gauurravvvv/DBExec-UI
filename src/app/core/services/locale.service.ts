import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/core/constants/api.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { GlobalService } from './global.service';
import { HttpClientService } from './http-client.service';
import { LoginService } from './login.service';
import { StorageService } from './storage.service';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'ko', label: '한국어' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ja', label: '日本語' },
] as const;

const SUPPORTED_LOCALE_CODES: ReadonlySet<string> = new Set(
  SUPPORTED_LOCALES.map(l => l.code),
);

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locales = SUPPORTED_LOCALES;

  /**
   * True while a temporary locale (from a `?locale=` URL param) is
   * overriding the user's persisted preference. Driven by
   * applyTempLocale / restorePersistedLocale.
   *
   * AppComponent uses this to decide whether to clean up after the
   * query param disappears.
   */
  private _tempLocaleActive = false;

  constructor(
    private translate: TranslateService,
    private http: HttpClientService,
    private globalService: GlobalService,
    private loginService: LoginService,
  ) {
    this.translate.addLangs(SUPPORTED_LOCALES.map(l => l.code));
    this.translate.setDefaultLang('en');
  }

  /** Whether the given code is one we support. Used by AppComponent
   *  to validate the `?locale=` query param before applying it. */
  isSupported(code: string | null | undefined): boolean {
    return !!code && SUPPORTED_LOCALE_CODES.has(code);
  }

  /**
   * Read locale from JWT (primary) or localStorage fallback, then
   * apply. No-ops if a temporary locale (from a `?locale=` URL
   * param) is currently active — the URL param wins until the user
   * either picks a new language explicitly, logs out, or calls
   * `clearTempLocale()` directly. This makes initFromToken safe to
   * call on every header (re)construction without clobbering an
   * in-progress temp locale.
   */
  initFromToken(): void {
    if (this._tempLocaleActive) return;

    const fromToken = this.globalService.getTokenDetails('locale');
    const fromStorage = StorageService.get(StorageType.LOCALE);
    const locale = fromToken || fromStorage || 'en';
    this.translate.use(locale);
  }

  /**
   * Drop any active temp-locale state. Called from the logout flow so
   * the NEXT login picks up the user's persisted preference cleanly,
   * even if the URL no longer carries `?locale=`.
   *
   * Doesn't change the currently-displayed language — the user is
   * being navigated to /login anyway, where AppComponent's existing
   * `translate.use(savedLocale)` constructor logic will redraw with
   * the persisted preference.
   */
  clearTempLocale(): void {
    this._tempLocaleActive = false;
  }

  get currentLocale(): string {
    return this.translate.currentLang || 'en';
  }

  /** True iff a `?locale=` URL param is currently overriding the
   *  user's saved preference. */
  get tempLocaleActive(): boolean {
    return this._tempLocaleActive;
  }

  /** Returns the locale the user has actually persisted (JWT or
   *  localStorage), independent of any temporary URL override. */
  get persistedLocale(): string {
    const fromToken = this.globalService.getTokenDetails('locale');
    const fromStorage = StorageService.get(StorageType.LOCALE);
    return fromToken || fromStorage || 'en';
  }

  /**
   * Apply a locale temporarily — for the current session only.
   *
   * Does NOT touch localStorage, does NOT PATCH the user profile, does
   * NOT refresh the JWT. The intent is "show the UI in this language
   * for this browsing session because a `?locale=` URL param said so."
   * Logging out and back in returns to the user's saved preference.
   *
   * Returns false (and does nothing) if the locale isn't supported.
   */
  applyTempLocale(locale: string): boolean {
    if (!this.isSupported(locale)) return false;
    if (this.translate.currentLang === locale && this._tempLocaleActive) {
      return true; // already applied; no-op
    }
    this.translate.use(locale);
    this._tempLocaleActive = true;
    return true;
  }

  /**
   * Undo a previous applyTempLocale() and snap back to whatever
   * locale the user has persisted (JWT claim or localStorage). Called
   * by AppComponent when the `?locale=` query param is removed from
   * the URL.
   */
  restorePersistedLocale(): void {
    if (!this._tempLocaleActive) return;
    const target = this.persistedLocale;
    this.translate.use(target);
    this._tempLocaleActive = false;
  }

  /**
   * Change language permanently: apply immediately → persist to
   * storage → PATCH the profile → refresh the JWT so the new claim
   * is visible to BE.
   *
   * Called by the header dropdown. Clears the temp-locale flag — the
   * user just made an explicit, durable choice.
   */
  async changeLocale(locale: string): Promise<boolean> {
    if (!this.isSupported(locale)) return false;

    this.translate.use(locale);
    StorageService.set(StorageType.LOCALE, locale);
    this._tempLocaleActive = false;

    try {
      const res: any = await lastValueFrom(
        this.http.apiPatch(PROFILE.UPDATE_LOCALE, { locale }),
      );
      if (res?.status) {
        const refreshRes: any = await lastValueFrom(
          this.loginService.refreshAccessToken(),
        );
        if (refreshRes?.status && refreshRes.data?.accessToken) {
          this.loginService.setAccessToken(refreshRes.data.accessToken);
        }
      }
    } catch {
      // Persistence failed but UI and storage already updated
    }

    return true;
  }
}
