export const SIDEBAR_ITEMS_ROUTES = [
  {
    value: 'dashboard',
    route: '/app/dashboard',
  },
  {
    value: 'superAdmin',
    route: '/app/super-admin',
  },
  {
    value: 'orgManagement',
    route: '/app/organisation',
  },
  {
    value: 'orgAdmin',
    route: '/app/org-admin',
  },
  {
    value: 'userManagement',
    route: '/app/users',
  },
  {
    value: 'userMapper',
    route: '/home/users',
  },
  {
    value: 'setupDB',
    route: '/app/database',
  },
  {
    value: 'dbSchema',
    route: '/home/system/configureDB',
  },
  {
    value: 'dbRole',
    route: '/home/system/dbRole',
  },
  {
    value: 'dbTable',
    route: '/home/system/dbTable',
  },
  {
    value: 'qExecutor',
    route: '/home/system/qExecutor',
  },
  {
    value: 'secretsEnvironment',
    route: '/app/environment',
  },
  {
    value: 'secretsCredentials',
    route: '/home/system/secretsCreds',
  },
  {
    value: 'secretsCategory',
    route: '/app/category',
  },
  {
    value: 'myProfile',
    route: '/home/system/myProfile',
  },
  { value: 'dbColumn', route: '/home/system/dbColumn' },
  { value: 'dbView', route: '/home/system/dbView' },
  { value: 'dbMaterializedView', route: '/home/system/dbMaterializedView' },
  { value: 'dbIndex', route: '/home/system/dbIndex' },
  { value: 'dbSequence', route: '/home/system/dbSequence' },
  { value: 'dbFunction', route: '/home/system/dbFunction' },
  { value: 'dbStoredProcedure', route: '/home/system/dbStoredProcedure' },
  { value: 'dbTrigger', route: '/home/system/dbTrigger' },
];

export const DASHBOARD_ROUTES = {
  SUPER_ADMIN: '/app/dashboard/super-admin',
  ORG_ADMIN: '/app/dashboard/org-admin',
  ORG_USER: '/app/dashboard/org-user',
};

export const AUTH_ROUTES = {
  LOGIN: '/login',
};
