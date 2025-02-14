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
    route: '/home/users',
  },
  {
    value: 'userMapper',
    route: '/home/users',
  },
  {
    value: 'setupDB',
    route: '/home/database/setup',
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
    route: '/home/secrets/environments',
  },
  {
    value: 'secretsCredentials',
    route: '/home/system/secretsCreds',
  },
  {
    value: 'secretsCategory',
    route: '/home/secrets/categories',
  },
  {
    value: 'myProfile',
    route: '/home/system/myProfile',
  },
];

export const DASHBOARD_ROUTES = {
  SUPER_ADMIN: '/app/dashboard/super-admin',
  ORG_ADMIN: '/app/dashboard/org-admin',
  ORG_USER: '/app/dashboard/org-user',
};

export const AUTH_ROUTES = {
  LOGIN: '/login',
};
