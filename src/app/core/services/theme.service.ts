import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';

/**
 * Theme payload — what the BE sends alongside the auth token (login
 * response + token-refresh response) and what the settings GET / save
 * endpoints return.
 *
 * `isDefault === true` (when present) means no row exists in DB for
 * this org yet; the settings form uses it to decide whether the next
 * save is the first-time INSERT or an UPDATE on an existing row.
 *
 * The login-embedded version omits `isDefault` and the id/timestamps
 * — the FE only needs the four brand colours to inject CSS variables.
 */
export interface ThemePayload {
  id?: string;
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryText: string;
  createdOn?: string;
  updatedOn?: string;
  isDefault?: boolean;
}

/**
 * Resolved CSS variables block, derived from the persisted brand
 * fields. The keys map 1:1 to the CSS variable names in
 * `_theme-variables.scss`; we inject a single <style> tag whose body
 * is built from these key/value pairs.
 *
 * Twelve variables move with the primary brand colour:
 *  - --primary-color, --primary-color-rgb, --primary-color-transparent
 *  - --primary-light, --primary-hover, --primary-text
 *  - --info-color, --info-bg
 *  - --chip-bg, --chip-text
 *  - --table-row-hover, --menu-icon-color, --fk-color
 */
type CssVars = Record<string, string>;

/**
 * The `<style>` tag we inject is keyed by this id so a subsequent
 * theme refresh replaces it in place rather than stacking up.
 */
const STYLE_TAG_ID = 'theme-vars';

/**
 * ThemeService — owns the injected CSS variables for org branding.
 *
 * Single contract: callers hand the service a `ThemePayload | null`
 * (typically from the login or refresh-token response). When the
 * payload is non-null the resolved variables are injected into <head>;
 * when null the injected tag is removed and the app paints with the
 * SCSS defaults. There is no role check here — the BE is the only
 * place that decides whether a session has a theme, and the FE just
 * applies whatever it's given.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Exposed for the settings UI so it can read the persisted values
  // without making its own GET. `null` until the first apply lands.
  private readonly _theme = signal<ThemePayload | null>(null);
  readonly theme = this._theme.asReadonly();

  constructor(@Inject(DOCUMENT) private readonly doc: Document) {}

  /**
   * Apply (or clear) the theme that arrived with an auth response.
   * Called by the login component on a successful sign-in and by the
   * token-refresh path so a refresh keeps the FE in sync if the org
   * admin changed branding between sign-in and refresh.
   *
   * Passing `null` (or anything missing the required fields) removes
   * the injected style and reverts to the SCSS defaults — that's the
   * system-admin path and also the "no row yet" path.
   *
   * The BE is the single source of truth: every auth response carries
   * the resolved payload, so a tab refresh re-acquires it by firing
   * the existing refresh-token call from app bootstrap. No
   * localStorage copy to keep in sync.
   */
  applyFromLogin(theme: ThemePayload | null | undefined): void {
    if (!theme || !this.isValidHex(theme.primary)) {
      // Reject the payload entirely if the brand colour is missing
      // or malformed. The BE Joi validator already enforces the hex
      // shape on save, but the FE re-checks here as defence-in-depth
      // — `tag.textContent` is parsed as CSS, so an attacker who
      // controls the response body could otherwise smuggle in
      // additional declarations (e.g. `}body{display:none}`).
      this._theme.set(null);
      this.removeInjectedStyle();
      return;
    }
    this._theme.set(theme);
    this.injectCssVars(this.resolveVars(theme));
  }

  /** Clear injected styles. Called on logout / auth-shell mount so
   *  unauthenticated screens render with the SCSS defaults. */
  clear(): void {
    this._theme.set(null);
    this.removeInjectedStyle();
  }

  // ── Internals ────────────────────────────────────────────────

  /**
   * Resolve the 13 CSS variable values from the brand fields. The
   * comment in the interface lists which variables move; everything
   * else stays at the SCSS default.
   */
  private resolveVars(t: ThemePayload): CssVars {
    // Each sibling brand field is validated independently — a
    // malformed hover/light/text doesn't poison the whole payload,
    // it just falls back to the primary so the variable still
    // resolves to a safe CSS value.
    const primary = t.primary;
    const primaryRgb = this.hexToRgb(primary);
    const rgbStr = primaryRgb
      ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`
      : '33, 150, 243';
    const hover = this.isValidHex(t.primaryHover) ? t.primaryHover : primary;
    const light = this.isValidHex(t.primaryLight) ? t.primaryLight : primary;
    const text = this.resolvePrimaryText(t.primaryText, primaryRgb);

    return {
      '--primary-color': primary,
      '--primary-color-rgb': rgbStr,
      '--primary-color-transparent': `rgba(${rgbStr}, 0.15)`,
      '--primary-light': light,
      '--primary-hover': hover,
      '--primary-text': text,
      // Info palette typically mirrors brand on internal SaaS — only
      // the persisted brand value changes here.
      '--info-color': primary,
      '--info-bg': `rgba(${rgbStr}, 0.08)`,
      // Chip + table hover + menu icon all use primary tints.
      '--chip-bg': `rgba(${rgbStr}, 0.10)`,
      '--chip-text': hover,
      '--table-row-hover': `rgba(${rgbStr}, 0.04)`,
      '--menu-icon-color': primary,
      // FK markers in the schema explorer use brand blue today.
      '--fk-color': primary,
    };
  }

  /** Type guard: true iff the value matches `#rgb` or `#rrggbb`. */
  private isValidHex(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);
  }

  /** Convert a #rgb / #rrggbb hex string into an {r,g,b} triplet. */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    if (!hex) return null;
    let h = hex.replace('#', '').trim();
    if (h.length === 3) {
      h = h
        .split('')
        .map(c => c + c)
        .join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  /** Resolve the configured `primaryText` value to a CSS colour.
   *  Accepts 'white' / 'black' shortcuts or a literal hex. Falls back
   *  to whichever of white / black has the better contrast against
   *  the brand colour, so a forgotten value still renders legibly. */
  private resolvePrimaryText(
    configured: string,
    primaryRgb: { r: number; g: number; b: number } | null,
  ): string {
    if (configured === 'white') return '#ffffff';
    if (configured === 'black') return '#000000';
    if (configured && configured.startsWith('#')) return configured;
    if (!primaryRgb) return '#ffffff';
    // Relative luminance (sRGB) — same formula CSS Color Module 4 uses.
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const L =
      0.2126 * lin(primaryRgb.r) +
      0.7152 * lin(primaryRgb.g) +
      0.0722 * lin(primaryRgb.b);
    return L > 0.5 ? '#000000' : '#ffffff';
  }

  private injectCssVars(vars: CssVars): void {
    const head = this.doc.head;
    if (!head) return;
    let tag = this.doc.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = this.doc.createElement('style');
      tag.id = STYLE_TAG_ID;
      head.appendChild(tag);
    }
    const body = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
    tag.textContent = `:root { ${body} }`;
  }

  private removeInjectedStyle(): void {
    const tag = this.doc.getElementById(STYLE_TAG_ID);
    if (tag?.parentNode) tag.parentNode.removeChild(tag);
  }
}
