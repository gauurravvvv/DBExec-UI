import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/constants/api';
import { StorageService } from './storage.service';
import { StorageType } from 'src/app/constants/storageType';
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

  /** Read locale from JWT (primary) or localStorage fallback, then apply. */
  initFromToken(): void {
    const fromToken = this.globalService.getTokenDetails('locale');
    const fromStorage = StorageService.get(StorageType.LOCALE);
    const locale = fromToken || fromStorage || 'en';
    this.translate.use(locale);
  }

  get currentLocale(): string {
    return this.translate.currentLang || 'en';
  }

  /** Change language: apply immediately → persist to storage → persist via PATCH → refresh token */
  async changeLocale(locale: string): Promise<boolean> {
    this.translate.use(locale);
    StorageService.set(StorageType.LOCALE, locale);

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
