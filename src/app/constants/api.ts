export const AUTH = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH_TOKEN: '/auth/refresh',
  GENERATE_OTP: '/auth/generateOTP',
  RESET_PASSWORD: '/auth/reset',
  SET_PASSWORD: '/auth/set-password',
  VERIFY_SETUP_TOKEN: '/auth/verify-setup-token',
  RESEND_SETUP_LINK: '/auth/resend-setup-link',
};

export const HOME = {
  SUPER_ADMIN: '/dashboard/super-admin/',
};

export const SUPER_ADMIN = {
  LIST: '/super-admin/list',
  DELETE: '/super-admin/delete/',
  ADD: '/super-admin/add',
  VIEW: '/super-admin/get/',
  UPDATE: '/super-admin/update',
  UPDATE_PASSWORD: '/super-admin/update/password',
  UNLOCK: '/super-admin/unlock/',
};

export const ORG_ADMIN = {
  LIST: '/org-admin/list',
  DELETE: '/org-admin/delete/',
  ADD: '/org-admin/add',
  VIEW: '/org-admin/get/',
  UPDATE: '/org-admin/update',
  UPDATE_PASSWORD: '/org-admin/update/password',
  UNLOCK: '/org-admin/unlock/',
};

export const ORGANISATION = {
  LIST: '/org/list',
  ADD: '/org/add',
  DELETE: '/org/delete/',
  VIEW: '/org/get/',
  EDIT: '/org/update',
  REFRESH_MASTER_DB: '/org/refresh-master-db/',
};

export const USER = {
  LIST: '/user/list',
  DELETE: '/user/delete/',
  ADD: '/user/add',
  VIEW: '/user/get/',
  UPDATE: '/user/update',
  UPDATE_PASSWORD: '/user/update/password',
  UNLOCK: '/user/unlock/',
};

export const DATASOURCE = {
  LIST: '/datasource/list',
  DELETE: '/datasource/delete/',
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
  VIEW: '/dataset/get/',
  VIEW_FIELD: '/dataset/get/field/',
  UPDATE: '/dataset/update',
  UPDATE_VIA_BUILDER: '/dataset/update/builder',
  UPDATE_FIELD: '/dataset/update/field',
  DELETE_FIELD: '/dataset/delete/field/',
  VALIDATE_FIELD: '/dataset/validate/field',
  ADD_FIELD: '/dataset/add/field',
  RUN_QUERY: '/dataset/run',
  DUPLICATE: '/dataset/duplicate/',
};

export const TAB = {
  ADD: '/tab/add',
  LIST: '/tab/list',
  DELETE: '/tab/delete/',
  VIEW: '/tab/get/',
  UPDATE: '/tab/update',
  GET_ALL: '/tab/listAll',
  GET_SECTIONS: '/tab/getSections/',
};

export const SECTION = {
  ADD: '/section/add',
  LIST: '/section/list',
  DELETE: '/section/delete/',
  VIEW: '/section/get/',
  UPDATE: '/section/update',
  GET_PROMPTS: '/section/getPrompts/',
};

export const PROMPT = {
  ADD: '/prompt/add',
  LIST: '/prompt/list',
  DELETE: '/prompt/delete/',
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
  VIEW: '/role/get/',
  UPDATE: '/role/update',
  LIST_PERMISSIONS: '/role/get-permissions/',
};

export const ACCESS = {
  GET: '/access/get',
  GRANT: '/access/grant',
};

export const CONNECTIONS = {
  ADD: '/connections/add',
  LIST: '/connections/list',
  DELETE: '/connections/delete/',
  VIEW: '/connections/get/',
  UPDATE: '/connections/update',
};

export const ANALYSES = {
  ADD: '/analyses/add',
  LIST: '/analyses/list',
  DELETE: '/analyses/delete/',
  VIEW: '/analyses/get/',
  UPDATE: '/analyses/update',
  VIEW_VISUAL: '/analyses/visual/',
  GET_FIELDS: '/analyses/get/fields/',
  RUN_QUERY: '/analyses/run',
};

export const ANALYSES_VISUAL = {
  LIST: '/visual/list',
  VIEW: '/visual/get/',
};

export const ANALYSIS_FILTER = {
  ADD: '/analysis-filter/add',
  UPDATE: '/analysis-filter/update',
  DELETE: '/analysis-filter/delete/',
  LIST: '/analysis-filter/list/',
  VALUES: '/analysis-filter/values/',
};

export const GLOBAL_SEARCH = {
  SEARCH: '/search/global',
};

export const ANNOUNCEMENT = {
  CONFIGURE: '/announcement/configure',
  GET: '/announcement/get/',
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
};

export const DASHBOARD = {
  ADD: '/dashboard/add',
  GET: '/dashboard/get/',
  LIST: '/dashboard/list',
  DELETE: '/dashboard/delete/',
};
