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
  // A PG "user" and "role" are the same object; login users and group
  // roles are managed on one screen gated by DB_ROLES.
  SETUP_DB: 'setupDB',
  DB_ROLES: 'dbRoles',
  DB_PRIVILEGES: 'dbPrivileges',

  // DBExec Studio
  CONNECTION_MANAGER: 'connectionManager',
  QUERY_RUNNER: 'queryRunner',
  QB_PROMPT: 'queryBuilderPrompt',
  QB_SCREEN: 'queryBuilderScreen',

  // Visualizations
  DATASET: 'datasetManager',
  ANALYSES: 'analyses',
  DASHBOARD: 'dashboard',
  RLS_RULES: 'rlsRules',
  ALERTS: 'alertManagement',
  AI_WORKSPACE: 'aiWorkspace',

  // Audit & Activity
  AUDIT_LOGS: 'auditLogs',
  LOGIN_ACTIVITY: 'loginActivity',

  // App Settings — org look & feel (one tabbed hub, gated on APP_SETTINGS;
  // the child values remain for the role-editor grid + back-compat).
  APP_SETTINGS: 'appSettings',
  THEME_MANAGEMENT: 'themeManagement',
  BRANDING_MANAGEMENT: 'brandingManagement',
  ANNOUNCEMENT_MANAGEMENT: 'announcementManagement',

  // System Settings — platform/security config (one tabbed hub, gated on
  // SYSTEM_SETTINGS; child values for the role-editor grid + back-compat).
  SYSTEM_SETTINGS: 'systemSettings',
  SSO_CONFIGURATION: 'ssoConfiguration',
  EMAIL_CONFIGURATION: 'emailConfiguration',
  SECURITY_POLICY: 'securityPolicy',
  AI_FEATURES: 'aiFeatures',
} as const;

export type PermissionValue = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
