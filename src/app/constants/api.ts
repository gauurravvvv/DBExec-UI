export const AUTH = {
  LOGIN: '/auth/login',
  GENERATE_OTP: '/auth/generateOTP',
  RESET_PASSWORD: '/auth/reset',
};

export const DASHBOARD = {
  SUPER_ADMIN: '/dashboard/super-admin/',
};

export const SUPER_ADMIN = {
  LIST: '/super-admin/list',
  DELETE: '/super-admin/delete/',
  ADD: '/super-admin/add',
  VIEW: '/super-admin/get/',
  UPDATE: '/super-admin/update',
  UPDATE_PASSWORD: '/super-admin/update/password',
};

export const ORG_ADMIN = {
  LIST: '/org-admin/list',
  DELETE: '/org-admin/delete/',
  ADD: '/org-admin/add',
  VIEW: '/org-admin/get/',
  UPDATE: '/org-admin/update',
  UPDATE_PASSWORD: '/org-admin/update/password',
};

export const ORGANISATION = {
  LIST: '/org/list',
  ADD: '/org/add',
  DELETE: '/org/delete/',
  VIEW: '/org/get/',
  EDIT: '/org/update',
};

export const USER = {
  LIST: '/user/list',
  DELETE: '/user/delete/',
  ADD: '/user/add',
  VIEW: '/user/get/',
  UPDATE: '/user/update',
  UPDATE_PASSWORD: '/user/update/password',
};

export const DATABASE = {
  LIST: '/database/list',
  LIST_ALL: '/database/listAll',
  DELETE: '/database/delete/',
  ADD: '/database/add',
  VIEW: '/database/get/',
  UPDATE: '/database/update',
  LIST_SCHEMAS: '/database/schema/list/',
  LIST_SCHEMA_TABLES: '/database/table/list/',
  LIST_TABLE_COLUMNS: '/database/table/columns/list/',
  RUN_QUERY: '/database/runQuery',
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
  LIST: '/dataset/list',
  DELETE: '/dataset/delete/',
  VIEW: '/dataset/get/',
  VIEW_FIELD: '/dataset/get/field/',
  UPDATE: '/dataset/update',
  UPDATE_FIELD: '/dataset/update/field',
  DELETE_FIELD: '/dataset/delete/field/',
  VALIDATE_FIELD: '/dataset/validate/field',
  ADD_FIELD: '/dataset/add/field',
  RUN_QUERY: '/dataset/run',
};

export const TAB = {
  ADD: '/tab/add',
  LIST: '/tab/list',
  DELETE: '/tab/delete/',
  VIEW: '/tab/get/',
  UPDATE: '/tab/update',
  GET_ALL: '/tab/listAll',
};

export const SECTION = {
  ADD: '/section/add',
  LIST: '/section/list',
  DELETE: '/section/delete/',
  VIEW: '/section/get/',
  UPDATE: '/section/update',
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
};

export const SCREEN = {
  ADD: '/screen/add',
  LIST: '/screen/list',
  DELETE: '/screen/delete/',
  VIEW: '/screen/get/',
  UPDATE: '/screen/update',
  SAVE_CONFIGURATION: '/screen/config',
  GET_SCREEN_CONFIGURATION: '/screen/getConfig/',
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
};
