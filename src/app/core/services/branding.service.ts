import { Injectable, signal } from '@angular/core';

/**
 * Branding payload — the watermark configuration the BE ships
 * alongside the auth token (login + refresh-token responses) and
 * what the /branding settings endpoints return.
 *
 * Two valid states (BE Joi enforces):
 *  - showWatermark: false → the other three fields may be null.
 *  - showWatermark: true  → all three text/colour fields populated
 *    (BE preserves them on disable, so re-enabling restores the last
 *    configuration without the admin retyping).
 */
export interface BrandingPayload {
  id?: string;
  showWatermark: boolean;
  watermarkText: string | null;
  watermarkBgColor: string | null;
  watermarkTextColor: string | null;
  createdOn?: string;
  updatedOn?: string;
}

/**
 * BrandingService — owns the watermark configuration for the
 * current session.
 *
 * Sits next to ThemeService but is intentionally separate: branding
 * is its own DB row, its own settings page, its own permission. The
 * watermark overlay component reads `branding()` and either renders
 * the pill or short-circuits — there's no role check on the FE, the
 * BE is the single source of truth for whether a session has
 * branding at all (system-admin sessions get null).
 *
 * No CSS variable injection here — the overlay component scopes
 * the bg/text colours to its own pill via `[style.background]` /
 * `[style.color]`. Keeping the colours out of `<style>` means
 * disabling branding requires no DOM cleanup beyond clearing the
 * signal.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly _branding = signal<BrandingPayload | null>(null);
  readonly branding = this._branding.asReadonly();

  /**
   * Apply (or clear) the branding payload that arrived with an auth
   * response. Called by LoginService on a successful sign-in and by
   * the token-refresh path so the watermark stays in sync if the
   * org admin edited it between sign-in and refresh.
   *
   * Passing `null` (system-admin path, no-row path) removes the
   * watermark. The BE is the single source of truth; the FE just
   * applies whatever it's given.
   */
  applyFromLogin(branding: BrandingPayload | null | undefined): void {
    if (!branding) {
      this._branding.set(null);
      return;
    }
    this._branding.set({ ...branding });
  }

  /** Push a freshly saved payload from the settings page so the
   *  watermark updates without a full reload. */
  setLocal(branding: BrandingPayload): void {
    this._branding.set({ ...branding });
  }

  /** Clear on logout / auth-shell mount. */
  clear(): void {
    this._branding.set(null);
  }
}
