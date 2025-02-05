export const LOGIN = {
  LOGIN_API: '/login/auth',
  FORGET_PASSWORD: '/login/forgot-password',
  RESET_PASSWORD: '/login/reset-password',
  LOGI_LOGOUT: '/login/logiLogout',
};

export const SITE = {
  LIST: '/site/list',
  ADD: '/site/add',
  UPDATE: '/site/update',
  DELETE: '/site/delete/',
  VIEW: '/site/view/',
  REPORTS: '/site/reports',
};

export const CLIENT = {
  LIST: '/client/list',
  ADD: '/client/add',
  UPDATE: '/client/update',
  DELETE: '/client/delete/',
  VIEW: '/client/view/',
  LIST_ENTERPRISE: '/client/enterprise/',
  AIRFLOW_CONFIG: '/client/config/airflow',
  MEDRA_CONFIG: '/client/config/medra',
  SETTING_MEDRA: '/client/setting/medra/',
  SNOWFLAKE_CONFIG: '/client/config/snowflake',
  POSTGRES_CONFIG: '/client/config/dwh',
  GET_WHO_SETTINGS: '/client/setting/WHO/',
  SAVE_WHO_SETTINGS: '/client/setting/WHO/',
  GET_AIRFLOW: '/client/setting/airflow/',
};

export const USER = {
  LIST: '/user/list',
  LIST_CLIENT_USERS: '/user/clientUsersList',
  ADD: '/user/add',
  UPDATE: '/user/update',
  DELETE: '/user/delete/',
  VIEW: '/user/view/',
  GET_ASSIGNED_FOLDERS: '/user/assignedFolders',
  LIST_USERS: '/user/listUsers/',
  UNLOCK_USERS: '/user/unlock',
  GET_QUICKSIGHT_URL: '/user/quickSightToken/',
};

export const ROLE = {
  LIST: '/role/list/',
  ADD: '/role/add',
  FOLDERS: '/role/folders',
  UPDATE: '/role/update',
  DELETE: '/role/delete/',
  VIEW: '/role/view/',
  LIST_CATALOGS: '/role/listCatalogs',
  TEST_CONNECTION: '/role/testConnection',
  // GET_ASSIGNED_FOLDERS: '/user/assignedFolders',
};

export const SUPER_ADMIN = {
  LIST: '/super-admin/list',
  ADD: '/super-admin/add',
  UPDATE: '/super-admin/update',
  DELETE: '/super-admin/delete/',
  VIEW: '/super-admin/view/',
};

export const SETTINGS = {
  ADD: '/banner/add',
  UPDATE: '/banner/update',
  VIEW: '/banner/view/',
  DELETE: '/banner/delete/',
};

export const ADMIN = {
  LIST: '/admin/list',
  ADD: '/admin/add',
  UPDATE: '/admin/update',
  DELETE: '/admin/delete/',
  VIEW: '/admin/view/',
  ROLE_ADMIN: '/role/admin/',
};

export const DASHBOARD = {
  DASHBOARD_DATA: '/dashboard/data',
  AUDIT_LOGS: '/dashboard/audit',
  EXPORT_LOGS: '/dashboard/exportLogs',
  ADMIN_DATA: '/dashboard/adminDashboard',
  KILL_QUERY: '/dashboard/killSession',
  BANNER_DATA: '/dashboard/bannerData',
  LANG: '/dashboard/langPref',
};

export const BANNER = {
  ADD: '/banner/add',
  GET: '/banner/get/',
  LIST_BANNER: '/banner/list',
  SHOW_BANNER: '/banner/showBanner',
  INFO_BANNER: '/info-banner/add',
  DELETE_BANNER: '/banner/delete',
  EDIT_BANNER: '/banner/update',
};

export const PROFILE = {
  VIEW: '/user/profile/',
  UPDATE: '/user/profile',
  UPDATE_PASSWORD: '/user/change-password',
};

export const CASE_SERIES = {
  SAVE: '/caseSeries/add',
  LIST: '/caseSeries/getSeriesList',
  VIEW: '/caseSeries/getSeriesCases/',
  DELETE: '/caseSeries/delete',
  DOWNLOAD: '/caseSeries/download',
  UPDATE: '/caseSeries/update',
  SHARE: '/caseSeries/share',
  SHARE_LIST: '/caseSeries/shareList/',
  OPERATION: '/caseSeries/operation',
  MARK_AS_FAV: '/user/markFavourite',
};

export const GROUP = {
  LIST: '/group/listGroup/',
};

export const USER_GROUPS = {
  ADD: '/group/add',
  LIST: '/group/listGroup',
  DELETE: '/group/delete',
  UPDATE: '/group/updateGroup',
  VIEW: '/group/groupDetails/',
};

export const QUERY = {
  ADD: '/query/add',
  UPDATE: '/query/update',
  LIST: '/query/list',
  DELETE: '/query/delete',
  SHARE: '/query/shareQuery',
  SHARE_LIST: '/query/queryData/',
  REFRESH: '/query/refresh',
  DOWNLOAD: '/query/download',
  VIEW: '/query/getData/',
  SCHEDULE: '/query/schedule',
  MARK_AS_FAV: '/user/markFavourite',
};

export const QBE = {
  LIST: '/qbe/list',
  SCREEN_PROMPTS: '/qbe/listPrompts/',
  SEARCH_PROMPTS: '/qbe/screenPrompts/',
  SAVE: '/qbe/add',
  UPDATE: '/qbe/updateQBE',
  VIEW: '/qbe/getData/',
  MEDDRA_SEARCH: '/qbe/getMeddraInfo',
  WHO_SEARCH: '/qbe/getWHOInfo',
  PRODUCT_SEARCH: '/qbe/getProductInfo',
  PROD_COUNTRIES: '/qbe/getCountries',
  SMQ_CMQ_LIST: '/qbe/getSmqCmq',
  TAB_LIST: '/qbe/listTabs/',
  TAB_SECTION_LIST: '/qbe/listTabSections/',
  VALIDATE_MEDDREA_TERMS: '/qbe/validate',
};

export const NOTIFICATION = {
  LIST: '/notification/get',
  CHANGE_STATUS: '/notification/read',
};

export const REPORT_LIBRARY = {
  GET_BREADCRUMB: '/report/getData',
  REFRESH: '/report/refresh',
  SHARE: '/report/share',
  GET_REPORT_SCHEDULES: '/report/getSchedule',
  GET_ADD_SCHEDULE_URL: '/report/addSchedule',
  GET_REPORT_URL: '/report/getURL',
  GET_URL: '/report/url',
  SEARCH_REPORTS: '/user/search',
  MARK_FAV: '/user/markFavourite',
  LIST_FAV: '/user/listFav/',
  LIST_RECENTS: '/report/listModified',
  LIST_VISITED: '/report/getMostAccessed',
  DELETE_REPORT: '/report/delete',
  GET_REPORT_SHARED_DATA: '/report/getShared',
};

export const TAGGING = {
  ADD_TAG: '/tag/addTag',
  DELETE_TAG: '/tag/delete/',
  REMOVE_TAG: '/tag/remove',
  LIST_TAG: '/tag/list',
  ASSIGN_TAG: '/tag/assign',
  GET_TAGS: '/tag/get/',
  GET_TAGS_DETAILS: '/tag/getDetails/',
  VIEW_TAG: '/tag/view/',
  UPDATE: '/tag/update',
};
