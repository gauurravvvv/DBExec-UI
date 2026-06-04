// Sidebar navigation map — drives the left rail.
// Every entry maps a permission `value` (from the JWT) to its
// registered route in app-routing.module.ts. Keep this file in sync
// with routes.constant.ts + app-routing.module.ts when renaming.
//
// Earlier iterations of this file shipped 7 placeholder entries
// (userMapper, dbExecStudio, datasetBinder, dbSchema, dbRole, dbTable,
// qExecutor) that pointed at unregistered routes — never rendered
// because the current permission seeds don't include those keys, but
// they would 404 if anyone added them. Removed.
export const SIDEBAR_ITEMS_ROUTES = [
  { value: 'home', route: '/app/home' },
  { value: 'systemAdmin', route: '/app/admins' },
  { value: 'orgManagement', route: '/app/organisations' },
  { value: 'userManagement', route: '/app/users' },
  { value: 'groupManagement', route: '/app/groups' },
  { value: 'roleManagement', route: '/app/roles' },
  { value: 'accessManagement', route: '/app/access' },
  { value: 'setupDB', route: '/app/datasources' },
  { value: 'dbConnections', route: '/app/connections' },
  { value: 'datasetManager', route: '/app/datasets' },
  { value: 'analyses', route: '/app/analyses' },
  { value: 'queryBuilderTab', route: '/app/tabs' },
  { value: 'queryBuilderSection', route: '/app/sections' },
  { value: 'queryBuilderPrompt', route: '/app/prompts' },
  { value: 'queryBuilderScreen', route: '/app/query-builders' },
  { value: 'myProfile', route: '/app/profile' },
  { value: 'auditLogs', route: '/app/audit' },
  { value: 'loginActivity', route: '/app/audit/logins' },
  { value: 'dashboard', route: '/app/dashboards' },
  { value: 'rlsRules', route: '/app/rls-rules' },
  { value: 'announcementManagement', route: '/app/settings/announcements' },
  { value: 'themeManagement', route: '/app/settings/theme' },
  { value: 'brandingManagement', route: '/app/settings/branding' },
];

export const HOME_ROUTES = {
  SYSTEM_ADMIN: '/app/home/system-admin',
  ORG_ADMIN: '/app/home/org',
  ORG_USER: '/app/home/org',
};

export const AUTH_ROUTES = {
  LOGIN: '/login',
};
