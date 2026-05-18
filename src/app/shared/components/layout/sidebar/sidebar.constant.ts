// Sidebar navigation map — drives the left rail.
// Routes mirror src/app/constants/routes.ts and the registered paths in
// app-routing.module.ts. Keep these two files in sync when renaming.
export const SIDEBAR_ITEMS_ROUTES = [
  { value: 'home', route: '/app/home' },
  { value: 'systemAdmin', route: '/app/admins' },
  { value: 'orgManagement', route: '/app/organisations' },
  { value: 'userManagement', route: '/app/users' },
  { value: 'groupManagement', route: '/app/groups' },
  { value: 'roleManagement', route: '/app/roles' },
  { value: 'accessManagement', route: '/app/access' },
  // Legacy/placeholder sidebar entries — not currently wired to a
  // registered module. Left as-is so the sidebar layout doesn't break,
  // but clicking them would 404. Wire or remove as appropriate.
  { value: 'userMapper', route: '/home/users' },
  { value: 'setupDB', route: '/app/datasources' },
  { value: 'dbConnections', route: '/app/connections' },
  { value: 'dbExecStudio', route: '/app/studio' },
  { value: 'datasetManager', route: '/app/datasets' },
  { value: 'analyses', route: '/app/analyses' },
  { value: 'datasetBinder', route: '/app/datasetBinder' },
  { value: 'queryBuilderTab', route: '/app/tabs' },
  { value: 'queryBuilderSection', route: '/app/sections' },
  { value: 'queryBuilderPrompt', route: '/app/prompts' },
  { value: 'queryBuilderScreen', route: '/app/query-builders' },
  { value: 'dbSchema', route: '/home/system/configureDB' },
  { value: 'dbRole', route: '/home/system/dbRole' },
  { value: 'dbTable', route: '/home/system/dbTable' },
  { value: 'qExecutor', route: '/home/system/qExecutor' },
  { value: 'myProfile', route: '/app/profile' },
  { value: 'auditLogs', route: '/app/audit' },
  { value: 'loginActivity', route: '/app/audit/logins' },
  { value: 'dashboard', route: '/app/dashboards' },
  { value: 'rlsRules', route: '/app/rls-rules' },
  { value: 'announcementManagement', route: '/app/settings/announcements' },
];

export const HOME_ROUTES = {
  SYSTEM_ADMIN: '/app/home/system-admin',
  ORG_ADMIN: '/app/home/org',
  ORG_USER: '/app/home/org',
};

export const AUTH_ROUTES = {
  LOGIN: '/login',
};
