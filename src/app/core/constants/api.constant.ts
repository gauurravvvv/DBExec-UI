/**
 * API endpoint constants — single source of truth for every BE path
 * the FE talks to. All paths are relative to `environment.apiServer`
 * (which already includes the `/api/v1` prefix), so values here start
 * with the resource segment.
 *
 * Convention (matches BE ROUTING.md):
 *   - Plural resource names (/users, /orgs, /dashboards, ...).
 *   - Singletons stay singular (/auth, /home, /profile, /search).
 *   - Constants ending in `/` are meant to be concatenated with id(s).
 *     Example: `apiGet(USER.GET + orgId + '/' + id)` →
 *       GET /api/v1/users/<orgId>/<id>
 *   - Constants without a trailing `/` are full paths.
 *
 * Path-vs-body migration: PUT/DELETE used to carry id in body. They
 * now take id in the path, e.g. `UPDATE: '/users/'` is the prefix
 * for `PUT /users/:orgId/:id`. Service methods now build the path
 * with concatenation.
 */

export const AUTH = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH_TOKEN: '/auth/refresh',
  GENERATE_OTP: '/auth/generate-otp',
  RESET_PASSWORD: '/auth/reset',
  SET_PASSWORD: '/auth/set-password',
  VERIFY_SETUP_TOKEN: '/auth/verify-setup-token',
  RESEND_SETUP_LINK: '/auth/resend-setup-link',
  CLI_AUTHORIZE: '/auth/cli/authorize',
};

export const HOME = {
  // /home is a singleton route, not nested under /dashboards.
  SYSTEM_ADMIN: '/home/system-admin/',
};

export const SYSTEM_ADMIN = {
  BASE: '/system-admins',
  LIST: '/system-admins',
  ADD: '/system-admins',
  // Templated single-resource paths
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
};

export const USER = {
  LIST: '/users',
  ADD: '/users',
  GET: '/users/', // GET /users/:orgId/:id
  UPDATE: '/users/', // PUT /users/:orgId/:id
  DELETE: '/users/', // DELETE /users/:orgId/:id
  BULK_DELETE_PREFIX: '/users/', // POST /users/:orgId/bulk-delete
  BULK_DELETE_SUFFIX: '/bulk-delete',
  BULK_ADD_VALIDATE: '/users/bulk/validate',
  BULK_ADD_COMMIT: '/users/bulk/commit',
  UPDATE_PASSWORD_PREFIX: '/users/', // PUT /users/:orgId/:id/password
  UPDATE_PASSWORD_SUFFIX: '/password',
  UNLOCK_PREFIX: '/users/', // POST /users/:orgId/:id/unlock
  UNLOCK_SUFFIX: '/unlock',
};

export const DATASOURCE = {
  LIST: '/datasources',
  ADD: '/datasources',
  GET: '/datasources/', // GET /datasources/:orgId/:id
  UPDATE: '/datasources/', // PUT /datasources/:orgId/:id
  DELETE: '/datasources/', // DELETE /datasources/:orgId/:id
  BULK_DELETE_PREFIX: '/datasources/', // POST /datasources/:orgId/bulk-delete
  BULK_DELETE_SUFFIX: '/bulk-delete',
  VALIDATE: '/datasources/validate',
  // Introspection — operate on the live target DB
  LIST_SCHEMAS_PREFIX: '/datasources/', // GET /datasources/:orgId/:datasourceId/schemas
  LIST_SCHEMAS_SUFFIX: '/schemas',
  // Schema tables/columns are built inline by services:
  // GET /datasources/:orgId/:datasourceId/schemas/:schema/tables
  // GET /datasources/:orgId/:datasourceId/schemas/:schema/tables/:table/columns
  SCHEMAS_SEGMENT: '/schemas/',
  TABLES_SEGMENT: '/tables/',
  COLUMNS_SEGMENT: '/columns',
  // POST /datasources/:orgId/:datasourceId/query
  RUN_QUERY_PREFIX: '/datasources/',
  RUN_QUERY_SUFFIX: '/query',
  // GET /datasources/:orgId/:datasourceId/activity
  ACTIVITY_PREFIX: '/datasources/',
  ACTIVITY_SUFFIX: '/activity',
  // POST /datasources/:orgId/:datasourceId/activity/cancel-query
  ACTIVITY_CANCEL_SUFFIX: '/activity/cancel-query',
  // POST /datasources/:orgId/:datasourceId/activity/terminate
  ACTIVITY_TERMINATE_SUFFIX: '/activity/terminate',
};

export const GROUP = {
  LIST: '/groups',
  ADD: '/groups',
  GET: '/groups/',
  UPDATE: '/groups/',
  DELETE: '/groups/',
  BULK_DELETE_PREFIX: '/groups/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
};

export const DATASET = {
  LIST: '/datasets',
  ADD: '/datasets',
  ADD_VIA_BUILDER: '/datasets/from-builder',
  GET: '/datasets/', // GET /datasets/:orgId/:datasetId
  UPDATE: '/datasets/', // PUT /datasets/:orgId/:datasetId
  UPDATE_VIA_BUILDER_PREFIX: '/datasets/', // PUT /datasets/:orgId/:datasetId/from-builder
  UPDATE_VIA_BUILDER_SUFFIX: '/from-builder',
  DELETE: '/datasets/', // DELETE /datasets/:orgId/:datasetId
  BULK_DELETE_PREFIX: '/datasets/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // POST /datasets/:datasetId/run
  RUN_QUERY_PREFIX: '/datasets/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /datasets/:orgId/:datasetId/duplicate
  DUPLICATE_PREFIX: '/datasets/',
  DUPLICATE_SUFFIX: '/duplicate',
  // POST /datasets/:orgId/:datasetId/distinct-values
  DISTINCT_VALUES_PREFIX: '/datasets/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
  // Field subresource
  // POST /datasets/:datasetId/fields
  ADD_FIELD_PREFIX: '/datasets/',
  ADD_FIELD_SUFFIX: '/fields',
  // POST /datasets/:datasetId/fields/validate
  VALIDATE_FIELD_SUFFIX: '/fields/validate',
  // GET /datasets/:orgId/:datasetId/fields/:fieldId
  // PUT /datasets/:orgId/:datasetId/fields/:fieldId
  // DELETE /datasets/:orgId/:datasetId/fields/:fieldId
  FIELD_SEGMENT: '/fields/',
};

export const TAB = {
  LIST: '/tabs',
  ADD: '/tabs',
  TREE: '/tabs/tree',
  GET: '/tabs/', // GET /tabs/:orgId/:tabId
  UPDATE: '/tabs/', // PUT /tabs/:orgId/:tabId
  DELETE: '/tabs/', // DELETE /tabs/:orgId/:tabId
  BULK_DELETE_PREFIX: '/tabs/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // GET /tabs/:orgId/:tabId/sections?queryBuilderId=
  SECTIONS_PREFIX: '/tabs/',
  SECTIONS_SUFFIX: '/sections',
};

export const SECTION = {
  LIST: '/sections',
  ADD: '/sections',
  GET: '/sections/',
  UPDATE: '/sections/',
  DELETE: '/sections/',
  BULK_DELETE_PREFIX: '/sections/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // GET /sections/:orgId/:sectionId/prompts?queryBuilderId=&tabId=
  PROMPTS_PREFIX: '/sections/',
  PROMPTS_SUFFIX: '/prompts',
};

export const PROMPT = {
  LIST: '/prompts',
  ADD: '/prompts',
  GET: '/prompts/',
  UPDATE: '/prompts/',
  DELETE: '/prompts/',
  BULK_DELETE_PREFIX: '/prompts/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // POST/GET /prompts/:orgId/:promptId/config
  CONFIG_PREFIX: '/prompts/',
  CONFIG_SUFFIX: '/config',
  // POST /prompts/:orgId/:promptId/values
  VALUES_SUFFIX: '/values',
  // POST /prompts/:orgId/:promptId/refresh-values
  REFRESH_VALUES_SUFFIX: '/refresh-values',
  // PUT/GET /prompts/:orgId/:promptId/appearance
  APPEARANCE_SUFFIX: '/appearance',
};

export const QUERY_BUILDER = {
  LIST: '/query-builders',
  ADD: '/query-builders',
  GET: '/query-builders/',
  UPDATE: '/query-builders/',
  DELETE: '/query-builders/',
  BULK_DELETE_PREFIX: '/query-builders/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // GET /query-builders/:orgId/:queryBuilderId/tabs
  TABS_PREFIX: '/query-builders/',
  TABS_SUFFIX: '/tabs',
  // POST/GET /query-builders/:orgId/:queryBuilderId/config
  CONFIG_SUFFIX: '/config',
  // GET /query-builders/:orgId/:queryBuilderId/structure
  STRUCTURE_SUFFIX: '/structure',
  // POST /query-builders/:orgId/:queryBuilderId/execute
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
  BULK_DELETE_PREFIX: '/roles/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  LIST_PERMISSIONS: '/roles/permissions',
};

export const ACCESS = {
  GET: '/access/', // GET /access/:orgId/:connectionId
  GRANT: '/access/grant',
};

export const CONNECTIONS = {
  LIST: '/connections',
  ADD: '/connections',
  GET: '/connections/',
  UPDATE: '/connections/',
  DELETE: '/connections/',
  BULK_DELETE_PREFIX: '/connections/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
};

export const ANALYSES = {
  LIST: '/analyses',
  ADD: '/analyses',
  GET: '/analyses/', // GET /analyses/:orgId/:analysisId
  UPDATE: '/analyses/', // PUT /analyses/:orgId/:analysisId
  DELETE: '/analyses/', // DELETE /analyses/:orgId/:analysisId
  BULK_DELETE_PREFIX: '/analyses/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // GET /analyses/:orgId/:analysisId/fields
  FIELDS_PREFIX: '/analyses/',
  FIELDS_SUFFIX: '/fields',
  // GET /analyses/:orgId/:analysisId/bootstrap
  BOOTSTRAP_PREFIX: '/analyses/',
  BOOTSTRAP_SUFFIX: '/bootstrap',
  // POST /analyses/:orgId/:analysisId/run
  RUN_QUERY_PREFIX: '/analyses/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /analyses/:orgId/:analysisId/distinct-values
  DISTINCT_VALUES_PREFIX: '/analyses/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
};

export const ANALYSES_VISUAL = {
  // GET /visuals/:orgId/:analysisId           skeleton list
  // GET /visuals/:orgId/:analysisId?include=config   hydrated list
  LIST: '/visuals/',
};

export const ANALYSIS_FILTER = {
  ADD: '/analysis-filters',
  LIST: '/analysis-filters/', // GET /analysis-filters/:orgId/:analysisId
  UPDATE: '/analysis-filters/', // PUT /analysis-filters/:orgId/:filterId
  DELETE: '/analysis-filters/', // DELETE /analysis-filters/:orgId/:filterId
  VALUES_BATCH: '/analysis-filters/values',
};

export const GLOBAL_SEARCH = {
  SEARCH: '/search',
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
  GET: '/dashboards/', // GET /dashboards/:orgId/:id
  DELETE: '/dashboards/', // DELETE /dashboards/:orgId/:id
  BULK_DELETE_PREFIX: '/dashboards/',
  BULK_DELETE_SUFFIX: '/bulk-delete',
  // GET /dashboards/:orgId/:id/render
  RENDER_PREFIX: '/dashboards/',
  RENDER_SUFFIX: '/render',
  // POST /dashboards/:orgId/publish
  PUBLISH_PREFIX: '/dashboards/',
  PUBLISH_SUFFIX: '/publish',
  // POST /dashboards/:orgId/:id/run
  RUN_PREFIX: '/dashboards/',
  RUN_SUFFIX: '/run',
  // POST /dashboards/:orgId/:dashboardId/distinct-values
  DISTINCT_VALUES_PREFIX: '/dashboards/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
};

export const RLS_RULE = {
  ADD: '/rls-rules',
  GET: '/rls-rules/', // GET /rls-rules/:orgId/:ruleId
  UPDATE: '/rls-rules/', // PUT /rls-rules/:orgId/:ruleId
  DELETE: '/rls-rules/', // DELETE /rls-rules/:orgId/:ruleId
  // GET /rls-rules/:orgId/datasets/:datasetId
  LIST_FOR_DATASET_PREFIX: '/rls-rules/',
  LIST_FOR_DATASET_INFIX: '/datasets/',
};
