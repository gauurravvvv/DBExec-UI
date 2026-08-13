/**
 * Canonical theme-token registry — the ONE source of truth for every
 * organisation-configurable colour in the app.
 *
 * MIRRORED byte-for-byte with the FE at
 * `dbexec-ui/src/app/shared/theme/theme-tokens.ts`. Edit both together.
 *
 * Each entry maps a stable storage `key` (what we persist in the Theme
 * row's `colors` JSON) to the CSS custom property it drives, its default
 * value (mirroring `_theme-variables.scss`), and the settings-UI group.
 *
 * Only solid `#rrggbb` colours are configurable — per the requirement,
 * "every possible theme styling in terms of COLOUR only". Derived
 * companions (`--primary-color-rgb`, `--primary-color-transparent`,
 * `--info-bg`, `--chip-bg`, `--table-row-hover`, …) are NOT stored: the
 * FE `resolveVars` computes them from the base colour so an admin sets
 * one colour and its alpha/rgb variants track automatically.
 *
 * Adding a configurable colour = ONE entry here (+ its mirror). Nothing
 * else in the theme pipeline changes.
 */

export type ThemeTokenGroup =
  | 'brand'
  | 'backgrounds'
  | 'text'
  | 'borders'
  | 'semantic'
  | 'surfaces'
  | 'tables'
  | 'menus';

export interface ThemeToken {
  /** Stable storage key persisted in Theme.colors JSON. */
  key: string;
  /** CSS custom property this token drives. */
  cssVar: string;
  /** Platform default (#rrggbb) — mirrors _theme-variables.scss. */
  default: string;
  /** Settings-UI section. */
  group: ThemeTokenGroup;
  /** i18n label key suffix (THEME_SETTINGS.TOKENS.<labelKey>). */
  labelKey: string;
}

/**
 * The registry. Order here is the display order within each group.
 * `key` values are stable — never rename one without a data migration.
 */
export const THEME_TOKENS: ThemeToken[] = [
  // ── Brand / Primary ───────────────────────────────────────────
  { key: 'primary', cssVar: '--primary-color', default: '#2196f3', group: 'brand', labelKey: 'PRIMARY' },
  { key: 'primaryHover', cssVar: '--primary-hover', default: '#1976d2', group: 'brand', labelKey: 'PRIMARY_HOVER' },
  { key: 'primaryLight', cssVar: '--primary-light', default: '#42a5f5', group: 'brand', labelKey: 'PRIMARY_LIGHT' },
  { key: 'primaryText', cssVar: '--primary-text', default: '#ffffff', group: 'brand', labelKey: 'PRIMARY_TEXT' },

  // ── Backgrounds ───────────────────────────────────────────────
  { key: 'homeBackground', cssVar: '--home-background-color', default: '#f5f6fa', group: 'backgrounds', labelKey: 'HOME_BG' },
  { key: 'background', cssVar: '--background-color', default: '#ffffff', group: 'backgrounds', labelKey: 'BACKGROUND' },
  { key: 'cardBackground', cssVar: '--card-background', default: '#ffffff', group: 'backgrounds', labelKey: 'CARD_BG' },
  { key: 'inputBackground', cssVar: '--input-background', default: '#ffffff', group: 'backgrounds', labelKey: 'INPUT_BG' },
  { key: 'hoverBackground', cssVar: '--hover-background', default: '#f5f5f5', group: 'backgrounds', labelKey: 'HOVER_BG' },
  { key: 'secondaryBackground', cssVar: '--secondary-background', default: '#f8fafc', group: 'backgrounds', labelKey: 'SECONDARY_BG' },

  // ── Text ──────────────────────────────────────────────────────
  { key: 'textColor', cssVar: '--text-color', default: '#333333', group: 'text', labelKey: 'TEXT' },
  { key: 'textMuted', cssVar: '--text-muted', default: '#6b7280', group: 'text', labelKey: 'TEXT_MUTED' },
  { key: 'textSubtle', cssVar: '--text-subtle', default: '#9ca3af', group: 'text', labelKey: 'TEXT_SUBTLE' },
  { key: 'secondaryColor', cssVar: '--secondary-color', default: '#757575', group: 'text', labelKey: 'SECONDARY' },
  { key: 'disabledColor', cssVar: '--disabled-color', default: '#9e9e9e', group: 'text', labelKey: 'DISABLED' },

  // ── Borders ───────────────────────────────────────────────────
  { key: 'borderColor', cssVar: '--border-color', default: '#e0e0e0', group: 'borders', labelKey: 'BORDER' },
  { key: 'borderStrong', cssVar: '--border-strong', default: '#c7c7c7', group: 'borders', labelKey: 'BORDER_STRONG' },

  // ── Semantic (base colours; alpha backgrounds are derived) ─────
  { key: 'errorColor', cssVar: '--error-color', default: '#f44336', group: 'semantic', labelKey: 'ERROR' },
  { key: 'errorHover', cssVar: '--error-hover', default: '#e53935', group: 'semantic', labelKey: 'ERROR_HOVER' },
  { key: 'successColor', cssVar: '--success-color', default: '#4caf50', group: 'semantic', labelKey: 'SUCCESS' },
  { key: 'successDark', cssVar: '--success-dark', default: '#388e3c', group: 'semantic', labelKey: 'SUCCESS_DARK' },
  { key: 'warningColor', cssVar: '--warning-color', default: '#ff9800', group: 'semantic', labelKey: 'WARNING' },
  { key: 'warningHover', cssVar: '--warning-hover', default: '#e65100', group: 'semantic', labelKey: 'WARNING_HOVER' },
  { key: 'infoColor', cssVar: '--info-color', default: '#2196f3', group: 'semantic', labelKey: 'INFO' },

  // ── Surfaces (toast / menu / skeleton bases) ──────────────────
  { key: 'toastBackground', cssVar: '--toast-background', default: '#ffffff', group: 'surfaces', labelKey: 'TOAST_BG' },
  { key: 'toastTextColor', cssVar: '--toast-text-color', default: '#333333', group: 'surfaces', labelKey: 'TOAST_TEXT' },
  { key: 'toastSuccess', cssVar: '--toast-success-background', default: '#4caf50', group: 'surfaces', labelKey: 'TOAST_SUCCESS' },
  { key: 'toastError', cssVar: '--toast-error-background', default: '#f44336', group: 'surfaces', labelKey: 'TOAST_ERROR' },
  { key: 'toastWarning', cssVar: '--toast-warning-background', default: '#ff9800', group: 'surfaces', labelKey: 'TOAST_WARNING' },
  { key: 'toastInfo', cssVar: '--toast-info-background', default: '#2196f3', group: 'surfaces', labelKey: 'TOAST_INFO' },
  { key: 'skeletonBg', cssVar: '--skeleton-bg', default: '#e9ecef', group: 'surfaces', labelKey: 'SKELETON_BG' },
  { key: 'codeBg', cssVar: '--code-bg', default: '#f8fafc', group: 'surfaces', labelKey: 'CODE_BG' },
  { key: 'codeBorder', cssVar: '--code-border', default: '#e0e0e0', group: 'surfaces', labelKey: 'CODE_BORDER' },

  // ── Tables & chips / status / schema markers ──────────────────
  { key: 'tableHeaderBg', cssVar: '--table-header-bg', default: '#f8fafc', group: 'tables', labelKey: 'TABLE_HEADER_BG' },
  { key: 'tableHeaderText', cssVar: '--table-header-text', default: '#374151', group: 'tables', labelKey: 'TABLE_HEADER_TEXT' },
  { key: 'chipText', cssVar: '--chip-text', default: '#1976d2', group: 'tables', labelKey: 'CHIP_TEXT' },
  { key: 'statusActiveText', cssVar: '--status-active-text', default: '#2e7d32', group: 'tables', labelKey: 'STATUS_ACTIVE' },
  { key: 'statusInactiveText', cssVar: '--status-inactive-text', default: '#c62828', group: 'tables', labelKey: 'STATUS_INACTIVE' },
  { key: 'pkColor', cssVar: '--pk-color', default: '#ffc107', group: 'tables', labelKey: 'PK_COLOR' },
  { key: 'fkColor', cssVar: '--fk-color', default: '#2196f3', group: 'tables', labelKey: 'FK_COLOR' },

  // ── Menus / popovers ──────────────────────────────────────────
  { key: 'menuBackground', cssVar: '--menu-background', default: '#ffffff', group: 'menus', labelKey: 'MENU_BG' },
  { key: 'menuTextColor', cssVar: '--menu-text-color', default: '#333333', group: 'menus', labelKey: 'MENU_TEXT' },
  { key: 'menuBorderColor', cssVar: '--menu-border-color', default: '#e0e0e0', group: 'menus', labelKey: 'MENU_BORDER' },
  { key: 'menuHoverBackground', cssVar: '--menu-hover-background', default: '#f5f5f5', group: 'menus', labelKey: 'MENU_HOVER' },
];

/** Ordered group ids for the settings UI (section order). */
export const THEME_TOKEN_GROUPS: ThemeTokenGroup[] = [
  'brand',
  'backgrounds',
  'text',
  'borders',
  'semantic',
  'surfaces',
  'tables',
  'menus',
];

/** Fast lookup: storage key → token. */
export const THEME_TOKEN_BY_KEY: Record<string, ThemeToken> = THEME_TOKENS.reduce(
  (acc, t) => {
    acc[t.key] = t;
    return acc;
  },
  {} as Record<string, ThemeToken>,
);

/** True iff `value` is a known token group. */
export function isThemeTokenGroup(value: unknown): value is ThemeTokenGroup {
  return (
    typeof value === 'string' &&
    (THEME_TOKEN_GROUPS as string[]).includes(value)
  );
}

/** The storage keys belonging to a group (in registry order). */
export function groupKeys(group: ThemeTokenGroup): string[] {
  return THEME_TOKENS.filter(t => t.group === group).map(t => t.key);
}

/** The full default colour map — every key present. */
export function defaultColorMap(): Record<string, string> {
  return THEME_TOKENS.reduce(
    (acc, t) => {
      acc[t.key] = t.default;
      return acc;
    },
    {} as Record<string, string>,
  );
}

/** True iff `value` is a valid #rgb or #rrggbb hex string. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * Merge a partial override map over the defaults, keeping only known
 * keys with valid hex values. Unknown keys and malformed values are
 * dropped so a bad payload can never poison the map.
 */
export function mergeColorMap(
  overrides: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out = defaultColorMap();
  if (!overrides || typeof overrides !== 'object') return out;
  for (const t of THEME_TOKENS) {
    const v = (overrides as Record<string, unknown>)[t.key];
    if (isHexColor(v)) out[t.key] = v;
  }
  return out;
}
