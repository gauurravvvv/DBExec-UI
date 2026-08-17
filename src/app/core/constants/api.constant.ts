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
  // SAML SSO. Paths are relative to environment.apiServer (which
  // already ends in /api/v1) — the HTTP interceptor prepends it — so
  // they follow the sibling `/auth/*` convention above, NOT a literal
  // `/api/v1/...` (that would double the prefix).
  SAML_URL: '/auth/saml/url',
  SAML_LOGIN: '/auth/saml/login',
};

export const HOME = {
  SYSTEM_ADMIN: '/home/system-admin',
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
  // GET /datasources/:datasourceId/foreign-keys (no-SQL join picker)
  FOREIGN_KEYS_SUFFIX: '/foreign-keys',
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
  // Saved queries (owner-scoped CRUD)
  // GET/POST /query-runner/saved-queries
  SAVED_QUERIES: '/query-runner/saved-queries',
  // GET/PUT/DELETE /query-runner/saved-queries/:id
  SAVED_QUERY: '/query-runner/saved-queries/', // + :id
};

export const AI_WORKSPACE = {
  // Persistent WebSocket chat transport (primary). ws(s)://host/api/v1/ai/ws?token=
  WS: '/ai/ws',
  // POST /ai/chat  → SSE fallback stream (used only if the WS can't connect)
  CHAT: '/ai/chat',
  // GET/PUT /ai/config  → provider config (key masked on GET)
  CONFIG: '/ai/config',
  // POST /ai/confirm  → guarded execute of a write proposal. Re-validates the
  // payload against the proposing tool's schema, re-checks RBAC for the acting
  // user, runs the real guarded endpoint in-process, and audit-logs (source:'ai').
  CONFIRM: '/ai/confirm',
  // GET /ai/health  → { enabled, configured } — gates the launcher
  HEALTH: '/ai/health',
  // GET /ai/conversations(/:id)  → owner-private history
  CONVERSATIONS: '/ai/conversations',
  CONVERSATION: '/ai/conversations/', // + :id
  // POST /config/test (BFF) — pre-flight the provider (reachable + key) without
  // running a turn. BFF path is bare (base already /ai/v1); on the embedded
  // main API it would be /ai/config/test.
  CONFIG_TEST_BFF: '/config/test',
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
  /** Formula function catalog — drives the editor palette + IntelliSense. */
  FORMULA_CATALOG: '/datasets/formula/catalog',
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
  // POST /datasets/:datasetId/preview-columns — introspect arbitrary SQL
  // (body { sql }) → { columns: [{ name, dataType }] } without saving
  PREVIEW_COLUMNS_PREFIX: '/datasets/',
  PREVIEW_COLUMNS_SUFFIX: '/preview-columns',
  // POST /datasets/:datasetId/param-options — options for query-based
  // dropdown params (runs the SOURCE dataset, projects value/label cols)
  PARAM_OPTIONS_PREFIX: '/datasets/',
  PARAM_OPTIONS_SUFFIX: '/param-options',
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
  // GET /datasets/:datasetId/freshness — last-run timestamp/by/rows
  FRESHNESS_PREFIX: '/datasets/',
  FRESHNESS_SUFFIX: '/freshness',
};

/**
 * Calculated fields (derived formula columns) — the safe-expression
 * REST surface. Distinct from the dataset `/fields` custom-field
 * subresource: these compile a whitelisted expression grammar against
 * the dataset's known columns and surface back as usable dataset fields.
 *   - POST   /calculated-fields                 add
 *   - POST   /calculated-fields/validate        compile-only preview
 *   - GET    /calculated-fields/dataset/:id     list for a dataset
 *   - PUT    /calculated-fields/:id             update
 *   - DELETE /calculated-fields/:id             delete
 */
export const CALCULATED_FIELD = {
  ADD: '/calculated-fields',
  VALIDATE: '/calculated-fields/validate',
  // GET /calculated-fields/dataset/:datasetId
  LIST_FOR_DATASET_PREFIX: '/calculated-fields/dataset/',
  // PUT/DELETE /calculated-fields/:id
  UPDATE: '/calculated-fields/', // PUT /calculated-fields/:id
  DELETE: '/calculated-fields/', // DELETE /calculated-fields/:id
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
  // Query Builder v2 — value-source config + runtime value lookup (spec 6.6)
  VALUE_SOURCE_SUFFIX: '/value-source', // GET/PUT /prompts/:id/value-source
  VALUES_PREVIEW_SUFFIX: '/values/preview', // POST -> sample rows before saving
  VALUES_SEARCH_SUFFIX: '/values/search', // POST -> paged typeahead + cascade
  VALUES_RESOLVE_SUFFIX: '/values/resolve', // POST -> bulk-paste { matched, unmatched }
  VALUES_UPLOAD_SUFFIX: '/values/upload', // POST multipart -> parse + cache as static
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
  // Query Builder v2 — runtime + admin surface
  SCHEMA_SUFFIX: '/schema', // GET /query-builders/:id/schema
  PREVIEW: '/query-builders/preview', // POST tree -> { sql, paramCount, joinsUsed, warnings }
  VALIDATE: '/query-builders/validate', // POST tree -> { errors }
  RUN: '/query-builders/execute', // POST tree -> { columns, rows, ... }
  COUNT: '/query-builders/count', // POST tree -> { total }
  SETTINGS_SUFFIX: '/settings',
  DEFAULT_TREE_SUFFIX: '/default-tree',
  OUTPUT_COLUMNS_SUFFIX: '/output-columns',
  JOINS_SUFFIX: '/joins',
};

export const FORM_BUILDER = {
  BASE: 'forms/', // list + create (POST/GET /api/v1/forms)
  GET: 'forms/', // + id (GET /forms/:id — family header + version list)
  // runtime composer hydration — published version; ?preview=1 falls back to latest draft
  schema: (id: string) => `forms/${id}/schema`,
  // runtime compose → SQL (all ACCESS.READ)
  preview: (id: string) => `forms/${id}/preview`,
  validate: (id: string) => `forms/${id}/validate`,
  execute: (id: string) => `forms/${id}/execute`,
  count: (id: string) => `forms/${id}/count`,
  // version-scoped structure writes (DRAFT-ONLY → 422 NOT_DRAFT otherwise)
  tabs: (id: string, v: number) => `forms/${id}/versions/${v}/tabs`, // + `/${tabId}` PATCH/DELETE
  sections: (id: string, v: number) => `forms/${id}/versions/${v}/sections`, // + `/${sectionId}`
  fields: (id: string, v: number) => `forms/${id}/versions/${v}/fields`, // + `/${formFieldId}`
  reorder: (id: string, v: number) => `forms/${id}/versions/${v}/reorder`,
  rules: (id: string, v: number) => `forms/${id}/versions/${v}/rules`, // + `/${ruleId}`; `/validate`
  fieldPerms: (id: string, v: number, formFieldId: string) =>
    `forms/${id}/versions/${v}/fields/${formFieldId}/permissions`, // + `/${roleId}` DELETE
  // lifecycle (version-scoped)
  publish: (id: string, v: number) => `forms/${id}/versions/${v}/publish`,
  retire: (id: string, v: number) => `forms/${id}/versions/${v}/retire`,
  fork: (id: string, v: number) => `forms/${id}/versions/${v}/fork`,
  // full resolved design tree for a version (designer + preview)
  version: (id: string, v: number) => `forms/${id}/versions/${v}`,
  // ── Portability (Phase 8) ────────────────────────────────────────────
  // Export streams a file (blob). Import + save-as-template + clone are WRITE.
  exportVersion: (id: string, v: number) =>
    `forms/${id}/versions/${v}/export`,
  saveAsTemplate: (id: string, v: number) =>
    `forms/${id}/versions/${v}/save-as-template`,
  cloneVersion: (id: string, v: number) =>
    `forms/${id}/versions/${v}/clone`,
  IMPORT: 'forms/import',
  TEMPLATES: 'forms/templates',
  template: (id: string) => `forms/templates/${id}`,
  cloneTemplate: (id: string) => `forms/templates/${id}/clone`,
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

// ── System (master-DB) RBAC — platform equivalents of ROLE/GROUP/USER.
// Same endpoint shapes, /system-* base paths. The permission grid still
// reads the shared PERMISSIONS.LIST (/permissions?scope=SYSTEM) +
// ACCESS_LEVELS.LIST.
export const SYSTEM_ROLE = {
  LIST: '/system-roles',
  ADD: '/system-roles',
  GET: '/system-roles/',
  UPDATE: '/system-roles/',
  DELETE: '/system-roles/',
  BULK_DELETE: '/system-roles/bulk-delete',
  LIST_PERMISSIONS: '/system-roles/permissions',
};

export const SYSTEM_GROUP = {
  LIST: '/system-groups',
  ADD: '/system-groups',
  GET: '/system-groups/',
  UPDATE: '/system-groups/',
  DELETE: '/system-groups/',
  BULK_DELETE: '/system-groups/bulk-delete',
};

export const SYSTEM_USER = {
  LIST: '/system-users',
  ADD: '/system-users',
  GET: '/system-users/',
  UPDATE: '/system-users/',
  DELETE: '/system-users/',
  BULK_DELETE: '/system-users/bulk-delete',
  BULK_ADD_VALIDATE: '/system-users/bulk/validate',
  BULK_ADD_COMMIT: '/system-users/bulk/commit',
  UPDATE_PASSWORD_PREFIX: '/system-users/',
  UPDATE_PASSWORD_SUFFIX: '/password',
  UNLOCK_PREFIX: '/system-users/',
  UNLOCK_SUFFIX: '/unlock',
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
  // Unauthenticated colour-only lookup by org name — used by the login
  // + relay pages to paint the org theme before a session exists.
  PUBLIC: '/theme/public',
  // Theme preset library
  PRESETS: '/theme/presets',
  preset: (id: string) => `/theme/presets/${id}`,
  activatePreset: (id: string) => `/theme/presets/${id}/activate`,
};

export const BRANDING = {
  GET: '/branding',
  SAVE: '/branding',
  // Branding preset library
  PRESETS: '/branding/presets',
  preset: (id: string) => `/branding/presets/${id}`,
  activatePreset: (id: string) => `/branding/presets/${id}/activate`,
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
  // Single-row detail (drawer enrichment): GET /audit-logs/:id — append the id.
  DETAIL: '/audit-logs/', // GET /audit-logs/:id
  LOGIN_ACTIVITY: '/audit-logs/login-activity',
  // Single login-activity row (drawer detail): GET /audit-logs/login-activity/:id.
  LOGIN_ACTIVITY_DETAIL: '/audit-logs/login-activity/', // + id
  EXPORT_LOGS: '/audit-logs/export',
  EXPORT_LOGIN_ACTIVITY: '/audit-logs/login-activity/export',
  // Tamper-evidence: verify the org's HMAC hash chain.
  VERIFY: '/audit-logs/verify',
  VERIFY_LOGIN_ACTIVITY: '/audit-logs/login-activity/verify',
};

export const PROFILE = {
  GET: '/profile',
  CHANGE_PASSWORD: '/profile/password',
  UPDATE_LOCALE: '/profile/locale',
  UPDATE_TOUR: '/profile/tour',
  AVAILABLE_THEMES: '/profile/available-themes',
  UPDATE_THEME: '/profile/theme',
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
  // POST /dashboards/:id/duplicate
  DUPLICATE_PREFIX: '/dashboards/',
  DUPLICATE_SUFFIX: '/duplicate',
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

// Asset sharing — grant a dataset / analysis / dashboard to users + groups at
// edit or view. One generic surface for all three families.
//   GET/POST  /asset-shares/:assetType/:assetId/shares            list / grant one
//   POST      /asset-shares/:assetType/:assetId/shares/bulk       grant many
//   PUT       /asset-shares/shares/:shareId                       change level
//   DELETE    /asset-shares/shares/:shareId                       revoke
export const ASSET_SHARE = {
  // `/asset-shares/${assetType}/${assetId}/shares`
  SHARES_PREFIX: '/asset-shares/',
  SHARES_SUFFIX: '/shares',
  // `/asset-shares/${assetType}/${assetId}/shares/bulk`
  BULK_SUFFIX: '/shares/bulk',
  // `/asset-shares/shares/${shareId}`
  SHARE_BY_ID: '/asset-shares/shares/',
};

// Seamless asset migration — one-click export of datasets / analyses /
// dashboards to a portable JSON bundle, and near-zero-click import into any
// org / environment. Both paths under `/api/v1/migration`; the request
// interceptor prepends the server base.
//   POST /migration/export   → streams a `.dbexec.json` file download
//   POST /migration/import   → applies a validated bundle (all-or-nothing)
export const MIGRATION = {
  EXPORT: '/migration/export',
  IMPORT: '/migration/import',
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
  // GET /rls-rules → all org rules, each enriched with datasetName + datasourceName
  LIST_ALL: '/rls-rules',
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
  // POST /alerts/:alertId/duplicate  → copy rule
  DUPLICATE_PREFIX: '/alerts/',
  DUPLICATE_SUFFIX: '/duplicate',
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

/**
 * Reference data (DB-driven enums) — the operator / value-type / severity /
 * filter-type / cron-preset option lists the forms render. Loaded once and
 * cached by ReferenceDataService.
 *   GET /reference-data          → { …, data: { [family]: Row[] } }
 *   GET /reference-data/:family  → { …, data: Row[] }
 */
export const REFERENCE_DATA = {
  LIST: '/reference-data', // GET /reference-data (all families)
  FAMILY: '/reference-data/', // GET /reference-data/:family
};

// Paths are relative to environment.apiServer (which already ends in
// /api/v1); the http interceptor prepends it. Do NOT include /api/v1 here or
// the URL doubles to /api/v1/api/v1/... and 404s.
export const ORG_POLICY = {
  GET: '/org-policy',
  UPDATE_SECURITY: '/org-policy/security',
  UPDATE_EMAIL: '/org-policy/email',
  UPDATE_SSO: '/org-policy/sso',
  BACKFILL_SETTINGS: '/org-policy/backfill-settings',
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
  // GET /db-access/:datasourceId/effective/:roleName/tree — lazy privilege tree
  EFFECTIVE_TREE_SUFFIX: '/tree',
  // GET /db-access/:datasourceId/roles/:roleName/owned
  ROLE_SEGMENT: '/roles/',
  OWNED_SUFFIX: '/owned',
  // GET /db-access/:datasourceId/roles/:roleName/grants — role's direct grants
  ROLE_GRANTS_SUFFIX: '/grants',
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
  // POST /db-access/:datasourceId/roles/:roleName/reassign
  REASSIGN_SUFFIX: '/reassign',
  // GET /db-access/:datasourceId/public-grants
  PUBLIC_GRANTS_SUFFIX: '/public-grants',
  // GET /db-access/:datasourceId/database-privileges
  DATABASE_PRIVILEGES_SUFFIX: '/database-privileges',
  // GET /db-access/:datasourceId/rls?schema=&table=
  RLS_SUFFIX: '/rls',
  // GET /db-access/:datasourceId/objects/who-can-access?schema=&table=
  WHO_CAN_ACCESS_SUFFIX: '/objects/who-can-access',
  // Templates (org DB): /db-access/templates[/:id], /templates/bulk-delete
  TEMPLATES_BASE: '/db-access/templates',
  TEMPLATES_BULK_DELETE: '/db-access/templates/bulk-delete',
};

export const NOTIFICATION = {
  // GET — last 30 days for the logged-in user
  LIST: '/notifications',
  // GET — { count } for the bell badge
  UNREAD_COUNT: '/notifications/unread-count',
  // POST — mark every unread row read for the logged-in user
  READ_ALL: '/notifications/read-all',
  // GET (SSE) — real-time stream. EventSource can't set headers, so the JWT
  // rides as ?token=<jwt>; the BE validates it exactly like AuthMiddleware.
  STREAM: '/notifications/stream',
  // PATCH — mark ONE row read (id appended: `${READ_ONE(id)}`)
  readOne: (id: string) => `/notifications/${id}/read`,
  // DELETE — soft-delete ONE row
  remove: (id: string) => `/notifications/${id}`,
  // DELETE — clear all READ rows
  CLEAR: '/notifications',
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
