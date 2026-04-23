/**
 * Permission values — must match the `value` field in the permissions tree
 * stored in Role.permissions and returned in the JWT payload.
 * These same strings are used by VerifyPermissionMiddleware on the backend.
 */
export const PERMISSIONS = {
  // User Management
  USER_MANAGEMENT: 'userManagement',
  ROLE_MANAGEMENT: 'roleManagement',
  USER_GROUP: 'userGroupManagement',

  // Data Management
  SETUP_DB: 'setupDB',
  DB_CONNECTIONS: 'dbConnections',
  ACCESS_MANAGEMENT: 'accessManagement',

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
} as const;

export type PermissionValue = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
