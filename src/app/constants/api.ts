export const AUTH = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH_TOKEN: '/auth/refresh',
  GENERATE_OTP: '/auth/generateOTP',
  RESET_PASSWORD: '/auth/reset',
  SET_PASSWORD: '/auth/set-password',
  VERIFY_SETUP_TOKEN: '/auth/verify-setup-token',
  RESEND_SETUP_LINK: '/auth/resend-setup-link',
  CLI_AUTHORIZE: '/auth/cli/authorize',
};

export const HOME = {
  SYSTEM_ADMIN: '/dashboard/system-admin/',
};

export const SYSTEM_ADMIN = {
  LIST: '/system-admin/list',
  DELETE: '/system-admin/delete/',
  BULK_DELETE: '/system-admin/delete/bulk',
  ADD: '/system-admin/add',
  VIEW: '/system-admin/get/',
  UPDATE: '/system-admin/update',
  UPDATE_PASSWORD: '/system-admin/update/password',
  UNLOCK: '/system-admin/unlock/',
};

export const ORGANISATION = {
  LIST: '/org/list',
  ADD: '/org/add',
  DELETE: '/org/delete/',
  BULK_DELETE: '/org/delete/bulk',
  VIEW: '/org/get/',
  EDIT: '/org/update',
  REFRESH_MASTER_DB: '/org/refresh-master-db/',
};

export const USER = {
  LIST: '/user/list',
  DELETE: '/user/delete/',
  BULK_DELETE: '/user/delete/bulk/',
  ADD: '/user/add',
  BULK_ADD_VALIDATE: '/user/bulk-add/validate',
  BULK_ADD_COMMIT: '/user/bulk-add/commit',
  VIEW: '/user/get/',
  UPDATE: '/user/update',
  UPDATE_PASSWORD: '/user/update/password',
  UNLOCK: '/user/unlock/',
};

export const DATASOURCE = {
  LIST: '/datasource/list',
  DELETE: '/datasource/delete/',
  BULK_DELETE: '/datasource/delete/bulk/',
  ADD: '/datasource/add',
  VIEW: '/datasource/get/',
  UPDATE: '/datasource/update',
  LIST_SCHEMAS: '/datasource/schema/list/',
  LIST_SCHEMA_TABLES: '/datasource/table/list/',
  LIST_TABLE_COLUMNS: '/datasource/table/columns/list/',
  RUN_QUERY: '/datasource/runQuery',
  VALIDATE: '/datasource/validate',
};

export const ENVIRONMENT = {
  LIST: '/environment/list',
  DELETE: '/environment/delete/',
  ADD: '/environment/add',
  VIEW: '/environment/get/',
  EDIT: '/environment/update',
};

export const CATEGORY = {
  LIST: '/category/list',
  DELETE: '/category/delete/',
  ADD: '/category/add',
  VIEW: '/category/get/',
  EDIT: '/category/update',
};

export const GROUP = {
  LIST: '/group/list',
  DELETE: '/group/delete/',
  BULK_DELETE: '/group/delete/bulk/',
  ADD: '/group/add',
  VIEW: '/group/get/',
  EDIT: '/group/update',
};

export const SECRET = {
  LIST: '/secret/list',
  DELETE: '/secret/delete/',
  DELETE_ALL: '/secret/deleteAll/',
  ADD: '/secret/add',
  VIEW: '/secret/get/',
  EDIT: '/secret/update',
  DOWNLOAD: '/secret/download/',
  CHANGE_VISIBILITY: '/secret/changeVisibility/',
};

export const DATASET = {
  ADD: '/dataset/add',
  ADD_VIA_BUILDER: '/dataset/add/builder',
  LIST: '/dataset/list',
  DELETE: '/dataset/delete/',
  BULK_DELETE: '/dataset/delete/bulk/',
  VIEW: '/dataset/get/',
  VIEW_FIELD: '/dataset/get/field/',
  UPDATE: '/dataset/update',
  UPDATE_VIA_BUILDER: '/dataset/update/builder',
  UPDATE_FIELD: '/dataset/update/field',
  DELETE_FIELD: '/dataset/delete/field/',
  VALIDATE_FIELD: '/dataset/validate/field',
  ADD_FIELD: '/dataset/add/field',
  RUN_QUERY: '/dataset/run',
  DISTINCT_VALUES: '/dataset/distinct-values/', // POST /:orgId/:datasetId, body: { columnName }
  DUPLICATE: '/dataset/duplicate/',
};

export const TAB = {
  ADD: '/tab/add',
  LIST: '/tab/list',
  DELETE: '/tab/delete/',
  BULK_DELETE: '/tab/delete/bulk/',
  VIEW: '/tab/get/',
  UPDATE: '/tab/update',
  GET_ALL: '/tab/listAll',
  GET_SECTIONS: '/tab/getSections/',
};

export const SECTION = {
  ADD: '/section/add',
  LIST: '/section/list',
  DELETE: '/section/delete/',
  BULK_DELETE: '/section/delete/bulk/',
  VIEW: '/section/get/',
  UPDATE: '/section/update',
  GET_PROMPTS: '/section/getPrompts/',
};

export const PROMPT = {
  ADD: '/prompt/add',
  LIST: '/prompt/list',
  DELETE: '/prompt/delete/',
  BULK_DELETE: '/prompt/delete/bulk/',
  VIEW: '/prompt/get/',
  UPDATE: '/prompt/update',
  CONFIG: '/prompt/config',
  GET_CONFIG: '/prompt/getConfig/',
  GET_PROMPT_VALUES_BY_SQL: '/prompt/getValues',
  REFRSH_PROMPT_VALUES_BY_SQL: '/prompt/refreshValues',
  UPDATE_APPEARANCE: '/prompt/customise',
  GET_APPEARANCE: '/prompt/getAppearance/',
};

export const QUERY_BUILDER = {
  ADD: '/query-builder/add',
  LIST: '/query-builder/list',
  DELETE: '/query-builder/delete/',
  BULK_DELETE: '/query-builder/delete/bulk/',
  VIEW: '/query-builder/get/',
  UPDATE: '/query-builder/update',
  SAVE_CONFIGURATION: '/query-builder/config',
  GET_QUERY_BUILDER_CONFIGURATION: '/query-builder/getConfig/',
  GET_TABS: '/query-builder/getTabs/',
  GET_STRUCTURE: '/query-builder/getStructure/',
  EXECUTE: '/query-builder/execute',
};

export const QUERY = {
  EXECUTE: '/query/execute',
  SAVE: '/query/save',
  LIST: '/query/list',
  DELETE: '/query/delete/',
  VIEW: '/query/get/',
  HISTORY: '/query/history',
  VALIDATE: '/query/validate',
  EXPLAIN: '/query/explain',
  EXPORT: '/query/export',
};

export const ROLE = {
  ADD: '/role/add',
  LIST: '/role/list',
  DELETE: '/role/delete/',
  BULK_DELETE: '/role/delete/bulk/',
  VIEW: '/role/get/',
  UPDATE: '/role/update',
  LIST_PERMISSIONS: '/role/permissions',
};

export const ACCESS = {
  GET: '/access/get',
  GRANT: '/access/grant',
};

export const CONNECTIONS = {
  ADD: '/connections/add',
  LIST: '/connections/list',
  DELETE: '/connections/delete/',
  BULK_DELETE: '/connections/delete/bulk/',
  VIEW: '/connections/get/',
  UPDATE: '/connections/update',
};

export const ANALYSES = {
  ADD: '/analyses/add',
  LIST: '/analyses/list',
  DELETE: '/analyses/delete/',
  BULK_DELETE: '/analyses/delete/bulk/',
  VIEW: '/analyses/get/',
  UPDATE: '/analyses/update',
  VIEW_VISUAL: '/analyses/visual/',
  GET_FIELDS: '/analyses/get/fields/',
  RUN_QUERY: '/analyses/run',
  // Unified distinct-values lookup — handles raw dataset columns AND
  // custom fields (dataset-level + analysis-level). Path:
  // POST /analyses/distinct-values/:orgId/:analysisId  body: { fieldName, search?, page?, pageSize? }
  DISTINCT_VALUES: '/analyses/distinct-values/',
  // Single-call bootstrap for the Edit Analysis page — replaces the
  // legacy VIEW + dataset/get + GET_FIELDS trio. Returns:
  // { analysis: {id, name, description, datasetId, datasourceId, datasetName},
  //   datasetFields: [], analysisFields: [] }
  BOOTSTRAP: '/analyses/bootstrap/',
};

export const ANALYSES_VISUAL = {
  LIST: '/visual/list',
  // Hydrated list — same as LIST but every visual ships with its
  // visualConfig already populated. Replaces the legacy /visual/get
  // single-visual endpoint that was used in the now-removed
  // fetchVisualsIndependently N+1 pattern.
  LIST_WITH_CONFIG: '/visual/list-with-config/',
};

export const ANALYSIS_FILTER = {
  ADD: '/analysis-filter/add',
  UPDATE: '/analysis-filter/update',
  DELETE: '/analysis-filter/delete/',
  LIST: '/analysis-filter/list/',
  // Batched values endpoint — one request returns options for any
  // number of filters, with pagination + search support. The legacy
  // single-filter VALUES endpoint was removed (zero FE callers).
  VALUES_BATCH: '/analysis-filter/values',
};

export const GLOBAL_SEARCH = {
  SEARCH: '/search/global',
};

export const ANNOUNCEMENT = {
  ADD: '/announcement/add',
  UPDATE: '/announcement/update/',
  DELETE: '/announcement/delete/',
  LIST: '/announcement/list',
  GET: '/announcement/get',
  DETAILS: '/announcement/details/',
  DISMISS: '/announcement/dismiss/',
};

export const AUDIT = {
  LIST: '/audit/list',
  LOGIN_ACTIVITY: '/audit/login-activity',
  EXPORT_LOGS: '/audit/export/logs',
  EXPORT_LOGIN_ACTIVITY: '/audit/export/login-activity',
};

export const PROFILE = {
  GET: '/profile/get',
  CHANGE_PASSWORD: '/profile/change-password',
  UPDATE_LOCALE: '/profile/locale',
};

export const DASHBOARD = {
  // ADD is deprecated server-side — kept here only for legacy callers
  // that haven't migrated to PUBLISH yet. Hitting it returns 400.
  ADD: '/dashboard/add',
  PUBLISH: '/dashboard/publish',
  GET: '/dashboard/get/',
  RENDER: '/dashboard/render/',
  LIST: '/dashboard/list',
  DELETE: '/dashboard/delete/',
  BULK_DELETE: '/dashboard/delete/bulk/',
  RUN_QUERY: '/dashboard/run',
  DISTINCT_VALUES: '/dashboard/distinct-values/',
};

export const RLS_RULE = {
  ADD: '/rls-rule/add',
  UPDATE: '/rls-rule/update',
  DELETE: '/rls-rule/delete/',
  LIST: '/rls-rule/list',
  VIEW: '/rls-rule/get/',
  LIST_ASSIGNMENTS: '/rls-rule/assignment/list/',
  ADD_ASSIGNMENT: '/rls-rule/assignment/add',
  DELETE_ASSIGNMENT: '/rls-rule/assignment/delete/',
};
