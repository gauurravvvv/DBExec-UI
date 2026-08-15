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
  // System (master-DB) RBAC — replaces the retired single 'systemAdmin'
  // (/app/admins) entry with the three platform RBAC screens.
  { value: 'systemRoleManagement', route: '/app/system-roles' },
  { value: 'systemGroupManagement', route: '/app/system-groups' },
  { value: 'systemUserManagement', route: '/app/system-users' },
  { value: 'orgManagement', route: '/app/organisations' },
  { value: 'userManagement', route: '/app/users' },
  { value: 'groupManagement', route: '/app/groups' },
  { value: 'roleManagement', route: '/app/roles' },
  { value: 'setupDB', route: '/app/datasources' },
  { value: 'dbRoles', route: '/app/db-roles' },
  { value: 'dbPrivileges', route: '/app/db-privileges' },
  { value: 'datasetManager', route: '/app/datasets' },
  { value: 'analyses', route: '/app/analyses' },
  { value: 'connectionManager', route: '/app/query-runner/connections' },
  // exact: this route ('/app/query-runner') is a PREFIX of connectionManager's
  // and of the saved-query subpaths, so without exact matching it lights up
  // whenever any query-runner child route is active. Match only the exact URL.
  { value: 'queryRunner', route: '/app/query-runner', exact: true },
  { value: 'queryBuilderTab', route: '/app/tabs' },
  { value: 'queryBuilderSection', route: '/app/sections' },
  { value: 'queryBuilderPrompt', route: '/app/prompts' },
  { value: 'queryBuilderScreen', route: '/app/query-builders' },
  { value: 'formBuilderScreen', route: '/app/form-builder' },
  { value: 'myProfile', route: '/app/profile' },
  // exact: '/app/audit' is a prefix of loginActivity's '/app/audit/logins',
  // so it would also highlight on the Login Activity screen without exact match.
  { value: 'auditLogs', route: '/app/audit', exact: true },
  { value: 'loginActivity', route: '/app/audit/logins' },
  { value: 'dashboard', route: '/app/dashboards' },
  { value: 'rlsRules', route: '/app/rls-rules' },
  { value: 'alertManagement', route: '/app/alerts' },
  // AI Assistant has NO sidebar row — it's reached solely via the floating
  // launcher bubble (shared app-ai-launcher). The /app/ai-workspace route
  // still exists (the launcher's "Open full workspace" link navigates to it),
  // it's just not a nav item.
  // Settings is two tabbed hubs, each ONE route behind ONE permission.
  // The former per-screen entries (announcementManagement, themeManagement,
  // brandingManagement, securityPolicy, emailConfiguration) are now TABS
  // inside these hubs, not standalone sidebar rows — so they are not mapped
  // here. Holding the parent permission (appSettings / systemSettings) shows
  // the hub with every tab.
  { value: 'appSettings', route: '/app/settings/app' },
  { value: 'systemSettings', route: '/app/settings/system' },
];

export const HOME_ROUTES = {
  SYSTEM_ADMIN: '/app/home/system-admin',
  ORG_ADMIN: '/app/home/org',
  ORG_USER: '/app/home/org',
};

export const AUTH_ROUTES = {
  LOGIN: '/login',
};
