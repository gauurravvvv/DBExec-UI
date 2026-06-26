/**
 * API endpoint constants — single source of truth for every BE path
 * the FE talks to. All paths are relative to `environment.apiServer`
 * (which already includes the `/api/v1` prefix), so values here start
 * with the resource segment.
 *
 * Convention (matches BE ROUTING.md):
 *   - Plural resource names (/users, /orgs, /dashboards, ...).
 *   - Singletons stay singular (/auth, /home, /profile, /search).
 *   - Constants ending in `/` are meant to be concatenated with the
 *     resource id. The org id is NEVER in the URL — the BE derives
 *     it from the JWT.
 *     Example: `apiGet(USER.GET + id)` → `GET /api/v1/users/<id>`.
 *   - Constants without a trailing `/` are full paths.
 */

export const AUTH = {
  LOGIN: '/auth/login',
  // Phase-2 session bootstrap — returns the full payload the relay
  // screen and the bootstrap-on-refresh path need to render the
  // authenticated app shell.
  SESSION: '/auth/session',
  LOGOUT: '/auth/logout',
  REFRESH_TOKEN: '/auth/refresh',
  GENERATE_OTP: '/auth/generate-otp',
  RESET_PASSWORD: '/auth/reset',
  SET_PASSWORD: '/auth/set-password',
  VERIFY_SETUP_TOKEN: '/auth/verify-setup-token',
  RESEND_SETUP_LINK: '/auth/resend-setup-link',
};

export const HOME = {
  SYSTEM_ADMIN: '/home/system-admin',
};

export const SYSTEM_ADMIN = {
  BASE: '/system-admins',
  LIST: '/system-admins',
  ADD: '/system-admins',
  GET: '/system-admins/', // GET /system-admins/:id
  UPDATE: '/system-admins/', // PUT /system-admins/:id
  DELETE: '/system-admins/', // DELETE /system-admins/:id
  BULK_DELETE: '/system-admins/bulk-delete',
  UPDATE_PASSWORD_PREFIX: '/system-admins/', // PUT /system-admins/:id/password
  UPDATE_PASSWORD_SUFFIX: '/password',
  UNLOCK_PREFIX: '/system-admins/', // POST /system-admins/:id/unlock
  UNLOCK_SUFFIX: '/unlock',
};

export const ORGANISATION = {
  LIST: '/orgs',
  ADD: '/orgs',
  GET: '/orgs/', // GET /orgs/:id
  UPDATE: '/orgs/', // PUT /orgs/:id
  DELETE: '/orgs/', // DELETE /orgs/:id
  BULK_DELETE: '/orgs/bulk-delete',
  REFRESH_MASTER_DB_PREFIX: '/orgs/', // POST /orgs/:id/refresh-master-db
  REFRESH_MASTER_DB_SUFFIX: '/refresh-master-db',
  VALIDATE_MASTER_DB: '/orgs/validate-master-db',
};

export const USER = {
  LIST: '/users',
  ADD: '/users',
  GET: '/users/', // GET /users/:id
  UPDATE: '/users/', // PUT /users/:id
  DELETE: '/users/', // DELETE /users/:id
  BULK_DELETE: '/users/bulk-delete',
  BULK_ADD_VALIDATE: '/users/bulk/validate',
  BULK_ADD_COMMIT: '/users/bulk/commit',
  UPDATE_PASSWORD_PREFIX: '/users/', // PUT /users/:id/password
  UPDATE_PASSWORD_SUFFIX: '/password',
  UNLOCK_PREFIX: '/users/', // POST /users/:id/unlock
  UNLOCK_SUFFIX: '/unlock',
};

export const DATASOURCE = {
  LIST: '/datasources',
  ADD: '/datasources',
  GET: '/datasources/', // GET /datasources/:id
  UPDATE: '/datasources/', // PUT /datasources/:id
  DELETE: '/datasources/', // DELETE /datasources/:id
  BULK_DELETE: '/datasources/bulk-delete',
  VALIDATE: '/datasources/validate',
  // GET /datasources/:datasourceId/schemas
  LIST_SCHEMAS_PREFIX: '/datasources/',
  LIST_SCHEMAS_SUFFIX: '/schemas',
  // GET /datasources/:datasourceId/schemas/:schema/tables
  // GET /datasources/:datasourceId/schemas/:schema/tables/:table/columns
  SCHEMAS_SEGMENT: '/schemas/',
  TABLES_SEGMENT: '/tables/',
  COLUMNS_SEGMENT: '/columns',
  // POST /datasources/:datasourceId/query
  RUN_QUERY_PREFIX: '/datasources/',
  RUN_QUERY_SUFFIX: '/query',
  // GET /datasources/:id/usage — counts of dependent datasets/analyses/dashboards
  USAGE_PREFIX: '/datasources/',
  USAGE_SUFFIX: '/usage',
  // GET /datasources/:id/activity — last 20 audit-log events for this datasource
  ACTIVITY_PREFIX: '/datasources/',
  ACTIVITY_SUFFIX: '/activity',
};

export const GROUP = {
  LIST: '/groups',
  ADD: '/groups',
  GET: '/groups/',
  UPDATE: '/groups/',
  DELETE: '/groups/',
  BULK_DELETE: '/groups/bulk-delete',
};

export const DATASET = {
  LIST: '/datasets',
  ADD: '/datasets',
  ADD_VIA_BUILDER: '/datasets/from-builder',
  GET: '/datasets/', // GET /datasets/:datasetId
  UPDATE: '/datasets/', // PUT /datasets/:datasetId
  UPDATE_VIA_BUILDER_PREFIX: '/datasets/', // PUT /datasets/:datasetId/from-builder
  UPDATE_VIA_BUILDER_SUFFIX: '/from-builder',
  DELETE: '/datasets/', // DELETE /datasets/:datasetId
  BULK_DELETE: '/datasets/bulk-delete',
  // POST /datasets/:datasetId/run
  RUN_QUERY_PREFIX: '/datasets/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /datasets/:datasetId/duplicate
  DUPLICATE_PREFIX: '/datasets/',
  DUPLICATE_SUFFIX: '/duplicate',
  // POST /datasets/:datasetId/distinct-values
  DISTINCT_VALUES_PREFIX: '/datasets/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
  // Field subresource
  ADD_FIELD_PREFIX: '/datasets/',
  ADD_FIELD_SUFFIX: '/fields',
  VALIDATE_FIELD_SUFFIX: '/fields/validate',
  // GET/PUT/DELETE /datasets/:datasetId/fields/:fieldId
  FIELD_SEGMENT: '/fields/',
};

export const TAB = {
  LIST: '/tabs',
  ADD: '/tabs',
  TREE: '/tabs/tree',
  GET: '/tabs/', // GET /tabs/:tabId
  UPDATE: '/tabs/', // PUT /tabs/:tabId
  DELETE: '/tabs/', // DELETE /tabs/:tabId
  BULK_DELETE: '/tabs/bulk-delete',
  // GET /tabs/:tabId/sections?queryBuilderId=
  SECTIONS_PREFIX: '/tabs/',
  SECTIONS_SUFFIX: '/sections',
};

export const SECTION = {
  LIST: '/sections',
  ADD: '/sections',
  GET: '/sections/',
  UPDATE: '/sections/',
  DELETE: '/sections/',
  BULK_DELETE: '/sections/bulk-delete',
  // GET /sections/:sectionId/prompts?queryBuilderId=&tabId=
  PROMPTS_PREFIX: '/sections/',
  PROMPTS_SUFFIX: '/prompts',
};

export const PROMPT = {
  LIST: '/prompts',
  ADD: '/prompts',
  GET: '/prompts/',
  UPDATE: '/prompts/',
  DELETE: '/prompts/',
  BULK_DELETE: '/prompts/bulk-delete',
  // POST/GET /prompts/:promptId/config
  CONFIG_PREFIX: '/prompts/',
  CONFIG_SUFFIX: '/config',
  // POST /prompts/:promptId/values
  VALUES_SUFFIX: '/values',
  // POST /prompts/:promptId/refresh-values
  REFRESH_VALUES_SUFFIX: '/refresh-values',
  // PUT/GET /prompts/:promptId/appearance
  APPEARANCE_SUFFIX: '/appearance',
};

export const QUERY_BUILDER = {
  LIST: '/query-builders',
  ADD: '/query-builders',
  GET: '/query-builders/',
  UPDATE: '/query-builders/',
  DELETE: '/query-builders/',
  BULK_DELETE: '/query-builders/bulk-delete',
  // GET /query-builders/:queryBuilderId/tabs
  TABS_PREFIX: '/query-builders/',
  TABS_SUFFIX: '/tabs',
  // POST/GET /query-builders/:queryBuilderId/config
  CONFIG_SUFFIX: '/config',
  // GET /query-builders/:queryBuilderId/structure
  STRUCTURE_SUFFIX: '/structure',
  // POST /query-builders/:queryBuilderId/execute
  EXECUTE_SUFFIX: '/execute',
};

export const QUERY = {
  EXECUTE: '/queries/execute',
  STRUCTURE: '/queries/structure',
  EXPORT: '/queries/export',
};

export const ROLE = {
  LIST: '/roles',
  ADD: '/roles',
  GET: '/roles/',
  UPDATE: '/roles/',
  DELETE: '/roles/',
  BULK_DELETE: '/roles/bulk-delete',
  LIST_PERMISSIONS: '/roles/permissions',
};

// Relational RBAC — replaces the legacy permission-tree shape served
// via /roles/permissions. New leaves can carry an effective level when
// the caller passes a roleId.
export const PERMISSIONS = {
  LIST: '/permissions',
};

// Canonical four-row access-level table. The `value` column (0..3) is
// the radio value; `label` is the column header in the role grid.
export const ACCESS_LEVELS = {
  LIST: '/access-levels',
};

export const ANALYSES = {
  LIST: '/analyses',
  ADD: '/analyses',
  GET: '/analyses/', // GET /analyses/:analysisId
  UPDATE: '/analyses/', // PUT /analyses/:analysisId
  DELETE: '/analyses/', // DELETE /analyses/:analysisId
  BULK_DELETE: '/analyses/bulk-delete',
  // GET /analyses/:analysisId/fields
  FIELDS_PREFIX: '/analyses/',
  FIELDS_SUFFIX: '/fields',
  // GET /analyses/:analysisId/bootstrap
  BOOTSTRAP_PREFIX: '/analyses/',
  BOOTSTRAP_SUFFIX: '/bootstrap',
  // POST /analyses/:analysisId/run
  RUN_QUERY_PREFIX: '/analyses/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /analyses/:analysisId/distinct-values
  DISTINCT_VALUES_PREFIX: '/analyses/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
};

export const ANALYSES_VISUAL = {
  // GET /visuals/:analysisId
  // GET /visuals/:analysisId?include=config
  LIST: '/visuals/',
};

export const ANALYSIS_FILTER = {
  ADD: '/analysis-filters',
  LIST: '/analysis-filters/', // GET /analysis-filters/:analysisId
  UPDATE: '/analysis-filters/', // PUT /analysis-filters/:filterId
  DELETE: '/analysis-filters/', // DELETE /analysis-filters/:filterId
  VALUES_BATCH: '/analysis-filters/values',
};

export const GLOBAL_SEARCH = {
  SEARCH: '/search',
};

export const THEME = {
  GET: '/theme',
  SAVE: '/theme',
  RESET: '/theme/reset',
};

export const BRANDING = {
  GET: '/branding',
  SAVE: '/branding',
};

export const ANNOUNCEMENT = {
  LIST: '/announcements',
  ADD: '/announcements',
  CURRENT: '/announcements/current',
  GET: '/announcements/', // GET /announcements/:id
  UPDATE: '/announcements/', // PUT /announcements/:id
  DELETE: '/announcements/', // DELETE /announcements/:id
  DISMISS_PREFIX: '/announcements/', // POST /announcements/:id/dismiss
  DISMISS_SUFFIX: '/dismiss',
};

export const AUDIT = {
  LIST: '/audit-logs',
  LOGIN_ACTIVITY: '/audit-logs/login-activity',
  EXPORT_LOGS: '/audit-logs/export',
  EXPORT_LOGIN_ACTIVITY: '/audit-logs/login-activity/export',
};

export const PROFILE = {
  GET: '/profile',
  CHANGE_PASSWORD: '/profile/password',
  UPDATE_LOCALE: '/profile/locale',
};

export const DASHBOARD = {
  LIST: '/dashboards',
  GET: '/dashboards/', // GET /dashboards/:id
  DELETE: '/dashboards/', // DELETE /dashboards/:id
  BULK_DELETE: '/dashboards/bulk-delete',
  // GET /dashboards/:id/render
  RENDER_PREFIX: '/dashboards/',
  RENDER_SUFFIX: '/render',
  // POST /dashboards/publish
  PUBLISH: '/dashboards/publish',
  // POST /dashboards/:id/run
  RUN_PREFIX: '/dashboards/',
  RUN_SUFFIX: '/run',
  // POST /dashboards/:dashboardId/distinct-values
  DISTINCT_VALUES_PREFIX: '/dashboards/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
};

export const RLS_RULE = {
  ADD: '/rls-rules',
  GET: '/rls-rules/', // GET /rls-rules/:ruleId
  UPDATE: '/rls-rules/', // PUT /rls-rules/:ruleId
  DELETE: '/rls-rules/', // DELETE /rls-rules/:ruleId
  // GET /rls-rules/datasets/:datasetId
  LIST_FOR_DATASET_PREFIX: '/rls-rules/datasets/',
};

export const ORG_POLICY = {
  GET: '/api/v1/org-policy',
  UPDATE_SECURITY: '/api/v1/org-policy/security',
  UPDATE_EMAIL: '/api/v1/org-policy/email',
};

export const NOTIFICATION = {
  // GET — last 30 days for the logged-in user
  LIST: '/notifications',
  // GET — { count } for the bell badge
  UNREAD_COUNT: '/notifications/unread-count',
  // POST — mark every unread row read for the logged-in user
  READ_ALL: '/notifications/read-all',
};
