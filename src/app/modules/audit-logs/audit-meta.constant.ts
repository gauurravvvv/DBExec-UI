/**
 * Presentation metadata for the audit list — mirrors the BE
 * `AUDIT_MODULES` / `AUDIT_ACTIONS` enums (see
 * DBExec-API/src/shared/constants/audit.constants.ts). Kept as data so the
 * list + drawer stay declarative: a module → { icon, labelKey }, an action →
 * a semantic CSS class (colour is driven by tokens in the component SCSS, NOT
 * hard-coded here). No raw strings — labels are i18n keys.
 */

/** Module → PrimeNG icon + i18n label key. */
export interface ModuleMeta {
  icon: string;
  labelKey: string;
}

/** Fallback for any module not explicitly mapped (future BE additions). */
export const MODULE_FALLBACK: ModuleMeta = {
  icon: 'pi pi-box',
  labelKey: 'AUDIT.MODULE.GENERIC',
};

export const MODULE_META: Record<string, ModuleMeta> = {
  auth: { icon: 'pi pi-shield', labelKey: 'AUDIT.MODULE.AUTH' },
  organisation: { icon: 'pi pi-building', labelKey: 'AUDIT.MODULE.ORGANISATION' },
  'system-admin': { icon: 'pi pi-verified', labelKey: 'AUDIT.MODULE.SYSTEM_ADMIN' },
  'org-admin': { icon: 'pi pi-user-edit', labelKey: 'AUDIT.MODULE.ORG_ADMIN' },
  user: { icon: 'pi pi-user', labelKey: 'AUDIT.MODULE.USER' },
  datasource: { icon: 'pi pi-database', labelKey: 'AUDIT.MODULE.DATASOURCE' },
  group: { icon: 'pi pi-users', labelKey: 'AUDIT.MODULE.GROUP' },
  notification: { icon: 'pi pi-bell', labelKey: 'AUDIT.MODULE.NOTIFICATION' },
  connection: { icon: 'pi pi-link', labelKey: 'AUDIT.MODULE.CONNECTION' },
  environment: { icon: 'pi pi-cog', labelKey: 'AUDIT.MODULE.ENVIRONMENT' },
  category: { icon: 'pi pi-tags', labelKey: 'AUDIT.MODULE.CATEGORY' },
  credential: { icon: 'pi pi-key', labelKey: 'AUDIT.MODULE.CREDENTIAL' },
  dataset: { icon: 'pi pi-table', labelKey: 'AUDIT.MODULE.DATASET' },
  'calculated-field': { icon: 'pi pi-calculator', labelKey: 'AUDIT.MODULE.CALCULATED_FIELD' },
  tab: { icon: 'pi pi-clone', labelKey: 'AUDIT.MODULE.TAB' },
  section: { icon: 'pi pi-th-large', labelKey: 'AUDIT.MODULE.SECTION' },
  prompt: { icon: 'pi pi-comment', labelKey: 'AUDIT.MODULE.PROMPT' },
  'query-builder': { icon: 'pi pi-sitemap', labelKey: 'AUDIT.MODULE.QUERY_BUILDER' },
  query: { icon: 'pi pi-code', labelKey: 'AUDIT.MODULE.QUERY' },
  'saved-query': { icon: 'pi pi-bookmark', labelKey: 'AUDIT.MODULE.SAVED_QUERY' },
  role: { icon: 'pi pi-id-card', labelKey: 'AUDIT.MODULE.ROLE' },
  access: { icon: 'pi pi-lock', labelKey: 'AUDIT.MODULE.ACCESS' },
  analyses: { icon: 'pi pi-chart-line', labelKey: 'AUDIT.MODULE.ANALYSES' },
  'analysis-filter': { icon: 'pi pi-filter', labelKey: 'AUDIT.MODULE.ANALYSIS_FILTER' },
  'analysis-parameter': { icon: 'pi pi-sliders-h', labelKey: 'AUDIT.MODULE.ANALYSIS_PARAMETER' },
  'analysis-widget': { icon: 'pi pi-chart-bar', labelKey: 'AUDIT.MODULE.ANALYSIS_WIDGET' },
  'analysis-tab': { icon: 'pi pi-clone', labelKey: 'AUDIT.MODULE.ANALYSIS_TAB' },
  visual: { icon: 'pi pi-chart-pie', labelKey: 'AUDIT.MODULE.VISUAL' },
  search: { icon: 'pi pi-search', labelKey: 'AUDIT.MODULE.SEARCH' },
  announcement: { icon: 'pi pi-megaphone', labelKey: 'AUDIT.MODULE.ANNOUNCEMENT' },
  home: { icon: 'pi pi-home', labelKey: 'AUDIT.MODULE.HOME' },
  dashboard: { icon: 'pi pi-th-large', labelKey: 'AUDIT.MODULE.DASHBOARD' },
  'rls-rule': { icon: 'pi pi-shield', labelKey: 'AUDIT.MODULE.RLS_RULE' },
  alert: { icon: 'pi pi-bell', labelKey: 'AUDIT.MODULE.ALERT' },
  theme: { icon: 'pi pi-palette', labelKey: 'AUDIT.MODULE.THEME' },
  branding: { icon: 'pi pi-image', labelKey: 'AUDIT.MODULE.BRANDING' },
  folder: { icon: 'pi pi-folder', labelKey: 'AUDIT.MODULE.FOLDER' },
  favourite: { icon: 'pi pi-star', labelKey: 'AUDIT.MODULE.FAVOURITE' },
  'asset-share': { icon: 'pi pi-share-alt', labelKey: 'AUDIT.MODULE.ASSET_SHARE' },
  migration: { icon: 'pi pi-sync', labelKey: 'AUDIT.MODULE.MIGRATION' },
};

/**
 * Semantic action → CSS class. The class drives colour in the component SCSS
 * from theme tokens — CREATE green, UPDATE blue (primary), DELETE red,
 * EXECUTE/EXPORT/IMPORT amber, GRANT/REVOKE purple, LOGIN/LOGOUT/UNLOCK slate.
 * Deliberately semantic, NOT the accent colour.
 */
export const ACTION_CLASS: Record<string, string> = {
  CREATE: 'act-create',
  UPDATE: 'act-update',
  CONFIG: 'act-update',
  REFRESH: 'act-update',
  DELETE: 'act-delete',
  EXECUTE: 'act-egress',
  EXPORT: 'act-egress',
  IMPORT: 'act-egress',
  GRANT: 'act-grant',
  REVOKE: 'act-grant',
  LOGIN: 'act-auth',
  LOGOUT: 'act-auth',
  UNLOCK_ACCOUNT: 'act-auth',
  RESET_PASSWORD: 'act-warning',
  READ: 'act-default',
};

/** i18n label key for an action badge. */
export const ACTION_LABEL_KEY: Record<string, string> = {
  CREATE: 'AUDIT.ACTION_LABEL.CREATE',
  READ: 'AUDIT.ACTION_LABEL.READ',
  UPDATE: 'AUDIT.ACTION_LABEL.UPDATE',
  DELETE: 'AUDIT.ACTION_LABEL.DELETE',
  EXECUTE: 'AUDIT.ACTION_LABEL.EXECUTE',
  GRANT: 'AUDIT.ACTION_LABEL.GRANT',
  REVOKE: 'AUDIT.ACTION_LABEL.REVOKE',
  EXPORT: 'AUDIT.ACTION_LABEL.EXPORT',
  IMPORT: 'AUDIT.ACTION_LABEL.IMPORT',
  CONFIG: 'AUDIT.ACTION_LABEL.CONFIG',
  LOGIN: 'AUDIT.ACTION_LABEL.LOGIN',
  LOGOUT: 'AUDIT.ACTION_LABEL.LOGOUT',
  REFRESH: 'AUDIT.ACTION_LABEL.REFRESH',
  RESET_PASSWORD: 'AUDIT.ACTION_LABEL.RESET_PASSWORD',
  UNLOCK_ACCOUNT: 'AUDIT.ACTION_LABEL.UNLOCK_ACCOUNT',
};

/** Options for the Action filter dropdown (value = BE action, label = i18n). */
export const ACTION_FILTER_OPTIONS = Object.keys(ACTION_LABEL_KEY).map(value => ({
  value,
  labelKey: ACTION_LABEL_KEY[value],
}));

/**
 * Options for the Module multiselect filter. Ordered roughly by how often a
 * reviewer reaches for them. Value = BE module string; label = i18n key.
 */
export const MODULE_FILTER_ORDER: string[] = [
  'user',
  'group',
  'role',
  'dataset',
  'dashboard',
  'analyses',
  'datasource',
  'access',
  'query',
  'saved-query',
  'query-builder',
  'alert',
  'rls-rule',
  'migration',
  'asset-share',
  'announcement',
  'auth',
  'organisation',
  'theme',
  'branding',
];

export const MODULE_FILTER_OPTIONS = MODULE_FILTER_ORDER.map(value => ({
  value,
  labelKey: MODULE_META[value]?.labelKey ?? MODULE_FALLBACK.labelKey,
}));

/** The three modules that make up the User-Management Activity scope. */
export const USER_MGMT_MODULE_SCOPE = ['user', 'group', 'role'];
