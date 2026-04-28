import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/constants/api';
import { HttpClientService } from './http-client.service';
import { GlobalService } from './global.service';
import { LoginService } from './login.service';

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

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locales = SUPPORTED_LOCALES;

  constructor(
    private translate: TranslateService,
    private http: HttpClientService,
    private globalService: GlobalService,
    private loginService: LoginService,
  ) {
    this.translate.addLangs(SUPPORTED_LOCALES.map(l => l.code));
    this.translate.setDefaultLang('en');
  }

  /** Read locale from JWT and apply it. Call after login / token refresh. */
  initFromToken(): void {
    const locale = this.globalService.getTokenDetails('locale') || 'en';
    this.translate.use(locale);
  }

  get currentLocale(): string {
    return this.translate.currentLang || 'en';
  }

  /** Change language: apply immediately → persist via PATCH → refresh token */
  async changeLocale(locale: string): Promise<boolean> {
    // Apply immediately so UI updates regardless of backend
    this.translate.use(locale);

    try {
      const res: any = await lastValueFrom(
        this.http.apiPatch(PROFILE.UPDATE_LOCALE, { locale }),
      );
      if (res?.status) {
        // Refresh token to get new JWT with updated locale
        const refreshRes: any = await lastValueFrom(
          this.loginService.refreshAccessToken(),
        );
        if (refreshRes?.status && refreshRes.data?.accessToken) {
          this.loginService.setAccessToken(refreshRes.data.accessToken);
        }
      }
    } catch {
      // Persistence failed but UI already updated
    }

    return true;
  }
}
