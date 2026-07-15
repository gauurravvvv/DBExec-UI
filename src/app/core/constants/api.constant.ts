/**
 * API endpoint constants — single source of truth for every BE path
 * the FE talks to. All paths are relative to `environment.apiServer`
 * (which already includes the `/api/v1` prefix), so values here start
 * with the resource segment.
 *
 * Convention (matches BE ROUTING.md):
 *   - Plural resource names (/users, /orgs, /dashboards, ...).
 *   - Singletons stay singular (/auth, /home, /profile, /search).
 *   - Constants ending in `/` are meant to be concatenated with the
 *     resource id. The org id is NEVER in the URL — the BE derives
 *     it from the JWT.
 *     Example: `apiGet(USER.GET + id)` → `GET /api/v1/users/<id>`.
 *   - Constants without a trailing `/` are full paths.
 */

export const AUTH = {
  LOGIN: '/auth/login',
  // Phase-2 session bootstrap — returns the full payload the relay
  // screen and the bootstrap-on-refresh path need to render the
  // authenticated app shell.
  SESSION: '/auth/session',
  LOGOUT: '/auth/logout',
  REFRESH_TOKEN: '/auth/refresh',
  GENERATE_OTP: '/auth/generate-otp',
  RESET_PASSWORD: '/auth/reset',
  SET_PASSWORD: '/auth/set-password',
  VERIFY_SETUP_TOKEN: '/auth/verify-setup-token',
  RESEND_SETUP_LINK: '/auth/resend-setup-link',
};

export const HOME = {
  SYSTEM_ADMIN: '/home/system-admin',
};

export const SYSTEM_ADMIN = {
  BASE: '/system-admins',
  LIST: '/system-admins',
  ADD: '/system-admins',
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
  VALIDATE_MASTER_DB: '/orgs/validate-master-db',
};

export const USER = {
  LIST: '/users',
  ADD: '/users',
  GET: '/users/', // GET /users/:id
  UPDATE: '/users/', // PUT /users/:id
  DELETE: '/users/', // DELETE /users/:id
  BULK_DELETE: '/users/bulk-delete',
  BULK_ADD_VALIDATE: '/users/bulk/validate',
  BULK_ADD_COMMIT: '/users/bulk/commit',
  UPDATE_PASSWORD_PREFIX: '/users/', // PUT /users/:id/password
  UPDATE_PASSWORD_SUFFIX: '/password',
  UNLOCK_PREFIX: '/users/', // POST /users/:id/unlock
  UNLOCK_SUFFIX: '/unlock',
};

export const DATASOURCE = {
  LIST: '/datasources',
  ADD: '/datasources',
  GET: '/datasources/', // GET /datasources/:id
  UPDATE: '/datasources/', // PUT /datasources/:id
  DELETE: '/datasources/', // DELETE /datasources/:id
  BULK_DELETE: '/datasources/bulk-delete',
  VALIDATE: '/datasources/validate',
  // GET /datasources/:datasourceId/schemas
  LIST_SCHEMAS_PREFIX: '/datasources/',
  LIST_SCHEMAS_SUFFIX: '/schemas',
  // GET /datasources/:datasourceId/schemas/:schema/tables
  // GET /datasources/:datasourceId/schemas/:schema/tables/:table/columns
  SCHEMAS_SEGMENT: '/schemas/',
  TABLES_SEGMENT: '/tables/',
  COLUMNS_SEGMENT: '/columns',
  // POST /datasources/:datasourceId/query
  RUN_QUERY_PREFIX: '/datasources/',
  RUN_QUERY_SUFFIX: '/query',
  // GET /datasources/:id/usage — counts of dependent datasets/analyses/dashboards
  USAGE_PREFIX: '/datasources/',
  USAGE_SUFFIX: '/usage',
  // GET /datasources/:id/activity — last 20 audit-log events for this datasource
  ACTIVITY_PREFIX: '/datasources/',
  ACTIVITY_SUFFIX: '/activity',
};

export const QUERY_RUNNER = {
  // Connection CRUD (owner-scoped)
  CONNECTIONS: '/query-runner/connections',
  CONNECTION: '/query-runner/connections/', // + :id  (GET/PUT/DELETE)
  // POST /query-runner/connections/:id/test  → verify creds
  TEST_SUFFIX: '/test',
  // POST /query-runner/connections/:id/default  → set default for its datasource
  DEFAULT_SUFFIX: '/default',
  // POST /query-runner/connections/:id/enabled  → enable / disable
  ENABLED_SUFFIX: '/enabled',
  // GET  /query-runner/connections/:id/catalog       → schemas only (fast)
  // GET  /query-runner/connections/:id/catalog?full=true → full catalog
  CATALOG_SUFFIX: '/catalog',
  // GET  /query-runner/connections/:id/tables?schema=   → lazy: tables in a schema
  TABLES_SUFFIX: '/tables',
  // GET  /query-runner/connections/:id/columns?schema=&table= → lazy: columns
  COLUMNS_SUFFIX: '/columns',
  // Object explorer (read-only inspection)
  OBJECTS_SUFFIX: '/objects', // ?schema=  → grouped object list
  OBJECT_TABLE_SUFFIX: '/object/table', // ?schema=&name=
  OBJECT_VIEW_SUFFIX: '/object/view', // ?schema=&name=&materialized=
  OBJECT_FUNCTION_SUFFIX: '/object/function', // ?schema=&name=
  OBJECT_SEQUENCE_SUFFIX: '/object/sequence', // ?schema=&name=
  OBJECT_TRIGGER_SUFFIX: '/object/trigger', // ?schema=&table=&name=
  OBJECT_MATVIEW_REFRESH_SUFFIX: '/object/matview/refresh', // ?schema=&name=
  // POST /query-runner/connections/:id/execute  → run SQL
  EXECUTE_SUFFIX: '/execute',
  // POST /query-runner/connections/:id/cancel   → cancel a running run
  CANCEL_SUFFIX: '/cancel',
};

export const GROUP = {
  LIST: '/groups',
  ADD: '/groups',
  GET: '/groups/',
  UPDATE: '/groups/',
  DELETE: '/groups/',
  BULK_DELETE: '/groups/bulk-delete',
};

export const DATASET = {
  LIST: '/datasets',
  ADD: '/datasets',
  ADD_VIA_BUILDER: '/datasets/from-builder',
  GET: '/datasets/', // GET /datasets/:datasetId
  UPDATE: '/datasets/', // PUT /datasets/:datasetId
  UPDATE_VIA_BUILDER_PREFIX: '/datasets/', // PUT /datasets/:datasetId/from-builder
  UPDATE_VIA_BUILDER_SUFFIX: '/from-builder',
  DELETE: '/datasets/', // DELETE /datasets/:datasetId
  BULK_DELETE: '/datasets/bulk-delete',
  // POST /datasets/:datasetId/run
  RUN_QUERY_PREFIX: '/datasets/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /datasets/:datasetId/duplicate
  DUPLICATE_PREFIX: '/datasets/',
  DUPLICATE_SUFFIX: '/duplicate',
  // POST /datasets/:datasetId/distinct-values
  DISTINCT_VALUES_PREFIX: '/datasets/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
  // Field subresource
  ADD_FIELD_PREFIX: '/datasets/',
  ADD_FIELD_SUFFIX: '/fields',
  VALIDATE_FIELD_SUFFIX: '/fields/validate',
  // GET/PUT/DELETE /datasets/:datasetId/fields/:fieldId
  FIELD_SEGMENT: '/fields/',
  // GET /datasets/:datasetId/lineage — downstream consumers
  LINEAGE_PREFIX: '/datasets/',
  LINEAGE_SUFFIX: '/lineage',
  // GET /datasets/:datasetId/usage — 30-day stats for the usage tab
  USAGE_PREFIX: '/datasets/',
  USAGE_SUFFIX: '/usage',
};

export const TAB = {
  LIST: '/tabs',
  ADD: '/tabs',
  TREE: '/tabs/tree',
  GET: '/tabs/', // GET /tabs/:tabId
  UPDATE: '/tabs/', // PUT /tabs/:tabId
  DELETE: '/tabs/', // DELETE /tabs/:tabId
  BULK_DELETE: '/tabs/bulk-delete',
  // GET /tabs/:tabId/sections?queryBuilderId=
  SECTIONS_PREFIX: '/tabs/',
  SECTIONS_SUFFIX: '/sections',
};

export const SECTION = {
  LIST: '/sections',
  ADD: '/sections',
  GET: '/sections/',
  UPDATE: '/sections/',
  DELETE: '/sections/',
  BULK_DELETE: '/sections/bulk-delete',
  // GET /sections/:sectionId/prompts?queryBuilderId=&tabId=
  PROMPTS_PREFIX: '/sections/',
  PROMPTS_SUFFIX: '/prompts',
};

export const PROMPT = {
  LIST: '/prompts',
  ADD: '/prompts',
  GET: '/prompts/',
  UPDATE: '/prompts/',
  DELETE: '/prompts/',
  BULK_DELETE: '/prompts/bulk-delete',
  // POST/GET /prompts/:promptId/config
  CONFIG_PREFIX: '/prompts/',
  CONFIG_SUFFIX: '/config',
  // POST /prompts/:promptId/values
  VALUES_SUFFIX: '/values',
  // POST /prompts/:promptId/refresh-values
  REFRESH_VALUES_SUFFIX: '/refresh-values',
  // PUT/GET /prompts/:promptId/appearance
  APPEARANCE_SUFFIX: '/appearance',
};

export const QUERY_BUILDER = {
  LIST: '/query-builders',
  ADD: '/query-builders',
  GET: '/query-builders/',
  UPDATE: '/query-builders/',
  DELETE: '/query-builders/',
  BULK_DELETE: '/query-builders/bulk-delete',
  // GET /query-builders/:queryBuilderId/tabs
  TABS_PREFIX: '/query-builders/',
  TABS_SUFFIX: '/tabs',
  // POST/GET /query-builders/:queryBuilderId/config
  CONFIG_SUFFIX: '/config',
  // GET /query-builders/:queryBuilderId/structure
  STRUCTURE_SUFFIX: '/structure',
  // POST /query-builders/:queryBuilderId/execute
  EXECUTE_SUFFIX: '/execute',
};

export const QUERY = {
  EXECUTE: '/queries/execute',
  STRUCTURE: '/queries/structure',
  EXPORT: '/queries/export',
  CANCEL: '/queries/cancel',
  EXPLAIN: '/queries/explain',
};

export const ROLE = {
  LIST: '/roles',
  ADD: '/roles',
  GET: '/roles/',
  UPDATE: '/roles/',
  DELETE: '/roles/',
  BULK_DELETE: '/roles/bulk-delete',
  LIST_PERMISSIONS: '/roles/permissions',
};

// Relational RBAC — replaces the legacy permission-tree shape served
// via /roles/permissions. New leaves can carry an effective level when
// the caller passes a roleId.
export const PERMISSIONS = {
  LIST: '/permissions',
};

// Canonical four-row access-level table. The `value` column (0..3) is
// the radio value; `label` is the column header in the role grid.
export const ACCESS_LEVELS = {
  LIST: '/access-levels',
};

export const ANALYSES = {
  LIST: '/analyses',
  ADD: '/analyses',
  GET: '/analyses/', // GET /analyses/:analysisId
  UPDATE: '/analyses/', // PUT /analyses/:analysisId
  DELETE: '/analyses/', // DELETE /analyses/:analysisId
  BULK_DELETE: '/analyses/bulk-delete',
  // GET /analyses/:analysisId/fields
  FIELDS_PREFIX: '/analyses/',
  FIELDS_SUFFIX: '/fields',
  // GET /analyses/:analysisId/bootstrap
  BOOTSTRAP_PREFIX: '/analyses/',
  BOOTSTRAP_SUFFIX: '/bootstrap',
  // POST /analyses/:analysisId/run
  RUN_QUERY_PREFIX: '/analyses/',
  RUN_QUERY_SUFFIX: '/run',
  // POST /analyses/:analysisId/distinct-values
  DISTINCT_VALUES_PREFIX: '/analyses/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
};

export const ANALYSES_VISUAL = {
  // GET /visuals/:analysisId
  // GET /visuals/:analysisId?include=config
  LIST: '/visuals/',
  // POST /visuals/:analysisId — create a single visual + its config
  ADD: '/visuals/', // POST /visuals/:analysisId
  UPDATE: '/visuals/', // PUT /visuals/:analysisId/:visualId
  DELETE: '/visuals/', // DELETE /visuals/:analysisId/:visualId
  // PUT /visuals/:analysisId/reorder — body: { order: [{ id, sequence }] }
  REORDER_PREFIX: '/visuals/',
  REORDER_SUFFIX: '/reorder',
};

export const ANALYSIS_PARAMETER = {
  // GET /analysis-parameters/:analysisId — list an analysis's parameters
  LIST: '/analysis-parameters/', // GET /analysis-parameters/:analysisId
  ADD: '/analysis-parameters', // POST /analysis-parameters
  UPDATE: '/analysis-parameters/', // PUT /analysis-parameters/:parameterId
  DELETE: '/analysis-parameters/', // DELETE /analysis-parameters/:parameterId
};

export const ANALYSIS_FILTER = {
  ADD: '/analysis-filters',
  LIST: '/analysis-filters/', // GET /analysis-filters/:analysisId
  UPDATE: '/analysis-filters/', // PUT /analysis-filters/:filterId
  DELETE: '/analysis-filters/', // DELETE /analysis-filters/:filterId
  VALUES_BATCH: '/analysis-filters/values',
};

// Analysis tabs (Dashboard & Analysis v2, Track A) - named pages inside
// an analysis. All under `/api/v1/analysis-tabs`; the request interceptor
// prepends the server base. Prefixes ending in `/` are concatenated with
// the tab id. Gated server-side by `analyses` WRITE (READ for list).
export const ANALYSIS_TAB = {
  // GET /analysis-tabs/:analysisId - list an analysis's tabs (path param)
  LIST: '/analysis-tabs/',
  ADD: '/analysis-tabs', // POST /analysis-tabs
  UPDATE: '/analysis-tabs/', // PUT /analysis-tabs/:tabId
  DELETE: '/analysis-tabs/', // DELETE /analysis-tabs/:tabId
  REORDER: '/analysis-tabs/reorder', // PUT /analysis-tabs/reorder
};

// Analysis widgets (Dashboard & Analysis v2, Track E3) - non-visual
// content blocks (text/markdown notes + KPI tiles) on an analysis canvas.
export const ANALYSIS_WIDGET = {
  // GET /analysis-widgets?analysisId=:analysisId - list widgets
  LIST: '/analysis-widgets',
  ADD: '/analysis-widgets', // POST /analysis-widgets
  UPDATE: '/analysis-widgets/', // PUT /analysis-widgets/:widgetId
  DELETE: '/analysis-widgets/', // DELETE /analysis-widgets/:widgetId
};

export const GLOBAL_SEARCH = {
  SEARCH: '/search',
};

export const THEME = {
  GET: '/theme',
  SAVE: '/theme',
  RESET: '/theme/reset',
};

export const BRANDING = {
  GET: '/branding',
  SAVE: '/branding',
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
  GET: '/dashboards/', // GET /dashboards/:id
  DELETE: '/dashboards/', // DELETE /dashboards/:id
  BULK_DELETE: '/dashboards/bulk-delete',
  // GET /dashboards/:id/render
  RENDER_PREFIX: '/dashboards/',
  RENDER_SUFFIX: '/render',
  // POST /dashboards/publish
  PUBLISH: '/dashboards/publish',
  // POST /dashboards/:id/run
  RUN_PREFIX: '/dashboards/',
  RUN_SUFFIX: '/run',
  // POST /dashboards/:dashboardId/distinct-values
  DISTINCT_VALUES_PREFIX: '/dashboards/',
  DISTINCT_VALUES_SUFFIX: '/distinct-values',
  // Share links (authed management) — /dashboards/:dashboardId/share-tokens
  //   GET  list · POST create · DELETE /:tokenId revoke
  SHARE_TOKENS_PREFIX: '/dashboards/',
  SHARE_TOKENS_SUFFIX: '/share-tokens',
};

// Public dashboard embed — UNAUTHENTICATED, token-guarded. Called only by
// the standalone /embed viewer (no x-auth-token). Base is deliberately the
// /public/dashboards mount that sits outside the auth middleware chain.
export const PUBLIC_DASHBOARD = {
  RENDER_PREFIX: '/public/dashboards/', // GET  /public/dashboards/:token
  RUN_PREFIX: '/public/dashboards/', // POST /public/dashboards/:token/run
  RUN_SUFFIX: '/run',
};

// Dashboard subscriptions — per-dashboard scheduled email delivery
// (PNG/PDF). All under `/api/v1/dashboard-subscriptions`; the request
// interceptor prepends the server base. Prefixes ending in `/` are
// concatenated with the subscription id; suffixes complete the
// sub-resource. Gated server-side by `dashboard` WRITE + ownership.
export const DASHBOARD_SUBSCRIPTION = {
  LIST: '/dashboard-subscriptions', // GET  /dashboard-subscriptions?dashboardId=
  ADD: '/dashboard-subscriptions', // POST /dashboard-subscriptions
  GET: '/dashboard-subscriptions/', // GET  /dashboard-subscriptions/:id
  UPDATE: '/dashboard-subscriptions/', // PUT  /dashboard-subscriptions/:id
  DELETE: '/dashboard-subscriptions/', // DELETE /dashboard-subscriptions/:id
  // POST /dashboard-subscriptions/:id/toggle  → enable / disable
  TOGGLE_PREFIX: '/dashboard-subscriptions/',
  TOGGLE_SUFFIX: '/toggle',
};

export const RLS_RULE = {
  ADD: '/rls-rules',
  GET: '/rls-rules/', // GET /rls-rules/:ruleId
  UPDATE: '/rls-rules/', // PUT /rls-rules/:ruleId
  DELETE: '/rls-rules/', // DELETE /rls-rules/:ruleId
  // GET /rls-rules/datasets/:datasetId
  LIST_FOR_DATASET_PREFIX: '/rls-rules/datasets/',
};

/**
 * Alerts — a scheduled condition on a dataset/analysis that emails +
 * in-app-notifies recipients on breach. All under `/api/v1/alerts`;
 * the request interceptor prepends the server base. Prefixes ending in
 * `/` are concatenated with the alert id; suffixes complete the
 * sub-resource. Contract mirrors the BE alerts controller (spec §5.5).
 */
export const ALERT = {
  LIST: '/alerts', // GET  /alerts (server-paged)
  ADD: '/alerts', // POST /alerts
  GET: '/alerts/', // GET  /alerts/:alertId
  UPDATE: '/alerts/', // PUT  /alerts/:alertId
  DELETE: '/alerts/', // DELETE /alerts/:alertId
  // POST /alerts/:alertId/toggle  → enable / disable
  TOGGLE_PREFIX: '/alerts/',
  TOGGLE_SUFFIX: '/toggle',
  // POST /alerts/:alertId/snooze  → mute until now()+snoozeMinutes
  SNOOZE_PREFIX: '/alerts/',
  SNOOZE_SUFFIX: '/snooze',
  // POST /alerts/:alertId/test  → evaluate now, don't persist state
  TEST_PREFIX: '/alerts/',
  TEST_SUFFIX: '/test',
  // GET  /alerts/:alertId/events  → immutable evaluation history (server-paged)
  EVENTS_PREFIX: '/alerts/',
  EVENTS_SUFFIX: '/events',
};

export const ORG_POLICY = {
  GET: '/api/v1/org-policy',
  UPDATE_SECURITY: '/api/v1/org-policy/security',
  UPDATE_EMAIL: '/api/v1/org-policy/email',
};

/**
 * Database Access Management — UI over PostgreSQL native roles / users /
 * grants for a chosen datasource. Every path is scoped by :datasourceId
 * (except the org-wide /templates group). Prefixes ending in `/` are
 * concatenated with the datasource id; suffixes complete the sub-resource.
 * All under `/api/v1/db-access`.
 */
export const DB_ACCESS = {
  // GET /db-access/:datasourceId/capability
  BASE: '/db-access/',
  CAPABILITY_SUFFIX: '/capability',
  // GET /db-access/:datasourceId/roles  (users [canLogin] + roles split FE-side)
  ROLES_SUFFIX: '/roles',
  // GET /db-access/:datasourceId/memberships
  MEMBERSHIPS_SUFFIX: '/memberships',
  // POST /db-access/:datasourceId/memberships/remove
  MEMBERSHIPS_REMOVE_SUFFIX: '/memberships/remove',
  // GET /db-access/:datasourceId/schemas
  SCHEMAS_SUFFIX: '/schemas',
  // GET /db-access/:datasourceId/objects/sequences?schema=
  OBJECTS_SEQUENCES_SUFFIX: '/objects/sequences',
  // GET /db-access/:datasourceId/objects/functions?schema=
  OBJECTS_FUNCTIONS_SUFFIX: '/objects/functions',
  // GET /db-access/:datasourceId/grants/tables?schema=
  GRANTS_TABLES_SUFFIX: '/grants/tables',
  // GET /db-access/:datasourceId/grants/columns?schema=&table=
  GRANTS_COLUMNS_SUFFIX: '/grants/columns',
  // GET /db-access/:datasourceId/grants/export
  GRANTS_EXPORT_SUFFIX: '/grants/export',
  // GET /db-access/:datasourceId/default-privileges
  DEFAULT_PRIVILEGES_SUFFIX: '/default-privileges',
  // GET /db-access/:datasourceId/effective/:roleName
  EFFECTIVE_SEGMENT: '/effective/',
  // GET /db-access/:datasourceId/roles/:roleName/owned
  ROLE_SEGMENT: '/roles/',
  OWNED_SUFFIX: '/owned',
  // GET /db-access/:datasourceId/roles/:roleName/export → full access profile
  ACCESS_EXPORT_SUFFIX: '/export',
  RENAME_SUFFIX: '/rename',
  DELETE_SUFFIX: '/delete',
  // POST /db-access/:datasourceId/change-set
  CHANGE_SET_SUFFIX: '/change-set',
  // GET /db-access/:datasourceId/sessions → { sessions, selfPid }
  SESSIONS_SUFFIX: '/sessions',
  // POST /db-access/:datasourceId/sessions/:pid/cancel
  // POST /db-access/:datasourceId/sessions/:pid/terminate
  SESSIONS_SEGMENT: '/sessions/',
  CANCEL_SUFFIX: '/cancel',
  TERMINATE_SUFFIX: '/terminate',
};

export const NOTIFICATION = {
  // GET — last 30 days for the logged-in user
  LIST: '/notifications',
  // GET — { count } for the bell badge
  UNREAD_COUNT: '/notifications/unread-count',
  // POST — mark every unread row read for the logged-in user
  READ_ALL: '/notifications/read-all',
};

/**
 * Folders — a nested organizational tree for viz objects (Track F). One tree
 * per `objectType` (dataset / analysis / dashboard / alert), scoped to the
 * caller's org. Prefixes ending in `/` are concatenated with the folder id.
 * Contract mirrors the BE folders controller (spec §5.6).
 */
export const FOLDER = {
  // POST /folders                     createFolder    (body: name, objectType, parentId?)
  CREATE: '/folders',
  // GET  /folders/tree?objectType=    listFolderTree  (the whole tree for one family)
  TREE: '/folders/tree',
  // PUT  /folders/:folderId/rename    renameFolder    (body: name)
  RENAME_PREFIX: '/folders/',
  RENAME_SUFFIX: '/rename',
  // PUT  /folders/:folderId/move      moveFolder      (body: parentId | null)
  MOVE_PREFIX: '/folders/',
  MOVE_SUFFIX: '/move',
  // DELETE /folders/:folderId         deleteFolder    (detaches its objects → folderId null)
  DELETE: '/folders/',
  // PUT  /folders/move-object         move an object into a folder (or to root)
  MOVE_OBJECT: '/folders/move-object',
};

/**
 * Favourites — a per-user star on a viz object (Track F). Strictly personal:
 * keyed on the logged-in user, invisible to others, never snapshotted.
 * Contract mirrors the BE favourites controller (spec §5.6).
 */
export const FAVOURITE = {
  // POST /favourites/toggle           toggleFavourite (body: objectType, objectId) → { favourited }
  TOGGLE: '/favourites/toggle',
  // GET  /favourites?objectType=      listFavourites  (the caller's favourited object ids)
  LIST: '/favourites',
};
