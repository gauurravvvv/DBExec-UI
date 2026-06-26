/**
 * Permission values — must match the `value` field in the permissions tree
 * stored in Role.permissions and returned in the JWT payload.
 * These same strings are used by VerifyPermissionMiddleware on the backend.
 */
export const PERMISSIONS = {
  // Platform / System Admin (V2 set — see BE systemAdminV2.ts)
  SYSTEM_ADMIN: 'systemAdmin',
  ORG_MANAGEMENT: 'orgManagement',

  // User Management (per-org)
  USER_MANAGEMENT: 'userManagement',
  ROLE_MANAGEMENT: 'roleManagement',
  USER_GROUP: 'groupManagement',

  // Data Management
  SETUP_DB: 'setupDB',

  // DBExec Studio
  QB_TAB: 'queryBuilderTab',
  QB_SECTION: 'queryBuilderSection',
  QB_PROMPT: 'queryBuilderPrompt',
  QB_SCREEN: 'queryBuilderScreen',

  // Visualizations
  DATASET: 'datasetManager',
  ANALYSES: 'analyses',
  DASHBOARD: 'dashboard',
  RLS_RULES: 'rlsRules',

  // Audit & Activity
  AUDIT_LOGS: 'auditLogs',
  LOGIN_ACTIVITY: 'loginActivity',

  // App Settings
  APP_SETTINGS: 'appSettings',
  ANNOUNCEMENT_MANAGEMENT: 'announcementManagement',
  THEME_MANAGEMENT: 'themeManagement',
  BRANDING_MANAGEMENT: 'brandingManagement',
  SECURITY_POLICY: 'securityPolicy',
  EMAIL_CONFIGURATION: 'emailConfiguration',
} as const;

export type PermissionValue = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
