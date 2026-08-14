import { Injectable, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/core/constants/api.constant';
import { ThemePreset } from 'src/app/modules/app-settings/services/theme-settings.service';
import { GlobalService } from './global.service';
import { HttpClientService } from './http-client.service';
import { LoginService } from './login.service';
import { ThemeService } from './theme.service';

/**
 * ThemePickerService — the per-user theme picker's data layer (the
 * sidebar theme flyout). The USER-scoped counterpart to LocaleService:
 * every authenticated org user may choose their own theme from the org's
 * shared preset library, exactly as they choose a language.
 *
 * `changeTheme` mirrors `LocaleService.changeLocale` step-for-step:
 *   1. apply immediately (ThemeService injects the CSS variables now);
 *   2. persist server-side (PUT /profile/theme);
 *   3. refresh the JWT so the new `themePresetId` claim is visible and
 *      every subsequent auth response resolves to the chosen theme.
 *
 * The org DEFAULT is the preset with `isActive: true` in the list; a
 * user who has never picked (or whose pick was deleted) resolves to it
 * server-side. `currentThemeId` prefers the JWT claim, then the active
 * (default) preset.
 */
@Injectable({ providedIn: 'root' })
export class ThemePickerService {
  private readonly http = inject(HttpClientService);
  private readonly globalService = inject(GlobalService);
  private readonly loginService = inject(LoginService);
  private readonly themeInjector = inject(ThemeService);

  private readonly _themes = signal<ThemePreset[]>([]);
  private readonly _loading = signal(false);
  private readonly _changing = signal(false);
  /** Id the user is currently on — JWT claim first, else the default. */
  private readonly _currentThemeId = signal<string | null>(null);

  readonly themes = this._themes.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly changing = this._changing.asReadonly();
  readonly currentThemeId = this._currentThemeId.asReadonly();

  /**
   * Load the org's active preset library for the picker. Returns [] for
   * the System-Admin path (no org theme storage). Best-effort — a
   * failure just leaves the picker empty, never throws to the caller.
   */
  async loadThemes(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(PROFILE.AVAILABLE_THEMES, { skipLoader: true }),
      );
      const list: ThemePreset[] = res?.status ? res.data?.themes ?? [] : [];
      this._themes.set(list);
      this._currentThemeId.set(this.resolveCurrentId(list));
    } catch {
      // Leave whatever we had; picker simply shows no options.
    } finally {
      this._loading.set(false);
    }
  }

  /** Current pick: JWT `themePresetId` claim, else the active (default). */
  private resolveCurrentId(list: ThemePreset[]): string | null {
    const fromToken = this.globalService.getTokenDetails('themePresetId');
    if (fromToken && list.some(t => t.id === fromToken)) return fromToken;
    const active = list.find(t => t.isActive);
    return active?.id ?? null;
  }

  /**
   * Change the user's theme permanently: apply immediately → persist →
   * refresh the JWT so the new claim propagates. Mirrors
   * LocaleService.changeLocale. No-ops if the id is unknown or already
   * current.
   */
  async changeTheme(presetId: string): Promise<boolean> {
    if (this._changing() || presetId === this._currentThemeId()) return false;
    const preset = this._themes().find(t => t.id === presetId);
    if (!preset) return false;

    this._changing.set(true);

    // 1. apply instantly for this tab (same call the login path uses).
    this.themeInjector.applyFromLogin({ colors: preset.colors } as any);
    this._currentThemeId.set(presetId);

    try {
      // 2. persist the choice.
      const res: any = await lastValueFrom(
        this.http.apiPut(PROFILE.UPDATE_THEME, { themePresetId: presetId }),
      );
      if (res?.status) {
        // 3. refresh the JWT so the themePresetId claim updates.
        const refreshRes: any = await lastValueFrom(
          this.loginService.refreshAccessToken(),
        );
        if (refreshRes?.status && refreshRes.data?.accessToken) {
          this.loginService.setAccessToken(refreshRes.data.accessToken);
        }
      }
    } catch {
      // UI already updated; persistence will retry on the next pick.
    } finally {
      this._changing.set(false);
    }
    return true;
  }
}
