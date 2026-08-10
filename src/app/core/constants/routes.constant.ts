// Type-only import — erased at compile time, so the constants file
// takes no runtime dependency on the service (and no import cycle).
import type { NotificationMeta } from 'src/app/core/services/notification.service';

// Centralised navigation paths used by routerLink and router.navigate
// across the app. Paths follow REST conventions:
//   LIST – list / index page
//   NEW  – create page  ('new' replaces the older 'add' verb)
//   view / edit – helper FUNCTIONS that produce the full nested URL.
//
// Per-org features used to interleave :orgId/:id in the URL because the
// FE was the org-scoping authority. The BE now derives the org id from
// the JWT, so the URL needs only :id:
//   ROLE.view(id)   -> '/app/roles/<id>'
//   ROLE.edit(id)   -> '/app/roles/<id>/edit'
//
// SYSTEM_ADMIN and ORGANISATION still take a single id but represent the
// system-admin browse-other-org screens; they're unrelated to per-org
// scoping.
//
// `ADD`, `VIEW`, `EDIT` are kept as string aliases pointing at the
// list base so any leftover callers using `router.navigate([X.LIST])`
// continue to work; pair-segment callers must migrate to the helpers.
//
// API endpoint paths live in src/app/core/constants/api.constant.ts, NOT here.

export const AUTH = {
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
};

// Helper that produces the standard navigation-constant shape for a
// feature whose detail URL uses only :id. With the BE deriving org id
// from the JWT, every per-org feature falls into this shape.
function feature(base: string) {
  return {
    LIST: base,
    NEW: `${base}/new`,
    // Legacy aliases — `.ADD` used to point at `${base}/add`. With the
    // REST shape the create page lives at `${base}/new`. Keep the alias
    // pointing to the new path so callers using `router.navigate([X.ADD])`
    // continue to land on the create form.
    ADD: `${base}/new`,
    // These three intentionally just point at the list base. Callers
    // that currently use router.navigate([X.EDIT, id]) must
    // migrate to router.navigate([X.edit(id)]). The bare
    // string is preserved so accidental usage doesn't compile-fail.
    VIEW: base,
    EDIT: base,
    // Helpers — preferred form going forward.
    view: (id: string | number) => `${base}/${id}`,
    edit: (id: string | number) => `${base}/${id}/edit`,
  };
}

export const ORGANISATION = feature('/app/organisations');

// System (master-DB) RBAC screens — platform equivalents of the per-org
// Roles/Groups/Users, under /app/system-*.
export const SYSTEM_ROLE = feature('/app/system-roles');
export const SYSTEM_GROUP = feature('/app/system-groups');
export const SYSTEM_USER = {
  ...feature('/app/system-users'),
  BULK_ADD: '/app/system-users/bulk-add',
};

export const GROUP = feature('/app/groups');

export const USER = {
  ...feature('/app/users'),
  BULK_ADD: '/app/users/bulk-add',
  // User-Management → Activity: the audit trail scoped to user/group/role.
  ACTIVITY: '/app/users/activity',
};

export const DATASOURCE = feature('/app/datasources');

// Database Access Management — split into THREE sidebar sections
// (Database Users / Database Roles / Privileges & Access), each its own
// list → add/edit/view module like `datasource`. The selected datasource
// is carried across sections via the `?ds=<id>` query param (owned by the
// shared datasource-picker + DbAccessContextService), NOT in the path.
// Callers pass the datasource id as a queryParams object where needed.
export const DB_ACCESS = {
  // Database Users & Roles — a PG "user" and "role" are the same object
  // (they differ only by canLogin), so login users and group roles are
  // managed on ONE screen at /app/db-roles.
  ROLES_LIST: '/app/db-roles',
  roleNew: () => '/app/db-roles/new',
  roleView: (roleName: string) => `/app/db-roles/${roleName}`,
  roleEdit: (roleName: string) => `/app/db-roles/${roleName}/edit`,

  // Privileges & Access (composer + effective + saved sets)
  PRIVILEGES_LIST: '/app/db-privileges',
  privilegeView: (id: string | number) => `/app/db-privileges/${id}`,

  // Role/privilege templates (PDM D10) — hosted under the Privileges section
  // (no new sidebar entry). Reusable recipes managed here, applied in the
  // create-role form + composer.
  TEMPLATES_LIST: '/app/db-privileges/templates',
  templateNew: () => '/app/db-privileges/templates/new',
  templateEdit: (id: string) => `/app/db-privileges/templates/${id}/edit`,
};

export const QUERY_RUNNER = {
  // Launcher (datasource → connection → open) — retired as the landing;
  // the module root now lands on the saved-queries list. Kept for callers.
  LAUNCHER: '/app/query-runner',
  // Saved queries (owner-scoped CRUD) — the new Query Executor home.
  SAVED_QUERIES_LIST: '/app/query-runner',
  savedQueryNew: () => '/app/query-runner/saved-queries/new',
  savedQueryView: (id: string) => `/app/query-runner/saved-queries/${id}`,
  savedQueryEdit: (id: string) => `/app/query-runner/saved-queries/${id}/edit`,
  // Connection profiles (owner-scoped CRUD)
  CONNECTIONS_LIST: '/app/query-runner/connections',
  connectionNew: () => '/app/query-runner/connections/new',
  connectionEdit: (id: string) => `/app/query-runner/connections/${id}/edit`,
  // Standalone executor tab (outside the app shell)
  EXEC: '/query-runner/exec',
  // Executor opened FROM a saved query — SQL + rowLimit preloaded via ?query=.
  EXEC_SAVED: (connId: string, queryId: string) =>
    `/query-runner/exec?conn=${encodeURIComponent(connId)}&query=${encodeURIComponent(queryId)}`,
};
export const DATASET = feature('/app/datasets');

export const TAB = feature('/app/tabs');
export const SECTION = feature('/app/sections');
export const ROLE = feature('/app/roles');
export const RLS_RULE = feature('/app/rls-rules');
export const ALERT = feature('/app/alerts');

// Analyses has no /new page (created from a dataset).
export const ANALYSES = {
  LIST: '/app/analyses',
  VIEW: '/app/analyses',
  EDIT: '/app/analyses',
  view: (id: string | number) => `/app/analyses/${id}`,
  edit: (id: string | number) => `/app/analyses/${id}/edit`,
};

export const PROMPT = {
  ...feature('/app/prompts'),
  // Configure callers: prefer PROMPT.configure(id).
  CONFIG: '/app/prompts',
  CONFIGURE: '/app/prompts',
  configure: (id: string | number) => `/app/prompts/${id}/configure`,
};

export const QUERY_BUILDER = {
  ...feature('/app/query-builders'),
  CONFIG: '/app/query-builders',
  CONFIGURE: '/app/query-builders',
  RUN: '/app/query-builders',
  configure: (dbId: string | number, id: string | number) =>
    `/app/query-builders/${dbId}/${id}/configure`,
  run: (dbId: string | number, queryBuilderId: string | number) =>
    `/app/query-builders/${dbId}/${queryBuilderId}/run`,
  // Query Builder v2 — the business-user composer. Only needs the QB id;
  // the datasource is resolved from the hydrated schema server-side.
  compose: (id: string | number) => `/app/query-builders/${id}/compose`,
  // Query Builder v2 — the admin design shell (form / joins / columns / settings).
  design: (id: string | number) => `/app/query-builders/${id}/design`,
};

// Dashboards are view-only.
export const DASHBOARD = {
  LIST: '/app/dashboards',
  VIEW: '/app/dashboards',
  view: (id: string | number) => `/app/dashboards/${id}`,
};

export const ANNOUNCEMENT = feature('/app/settings/announcements');

// Theme presets — add/edit live as routed pages under the App Settings
// hub, same shape as announcements (list stays a tab).
export const THEME_PRESET = feature('/app/settings/themes');

// Branding presets — same shape as themes (list stays a tab; add/edit
// are routed pages).
export const BRANDING_PRESET = feature('/app/settings/branding-presets');

// Per-user notifications feed — the full-page view behind the bell
// panel's "See all". Auth-gated only (not permission-gated), like the
// profile screen.
export const NOTIFICATIONS = {
  LIST: '/app/notifications',
};

// Legacy aliases — never wired to a real module.
export const ENVIRONMENT = {
  ADD: '/app/environment/add',
  LIST: '/app/environment',
  EDIT: '/app/environment/edit',
  VIEW: '/app/environment/view',
};

export const CATEGORY = {
  ADD: '/app/category/add',
  LIST: '/app/category',
  EDIT: '/app/category/edit',
  VIEW: '/app/category/view',
};

export const CREDENTIAL = {
  ADD: '/app/secrets/add',
  LIST: '/app/secrets',
  EDIT: '/app/secrets/edit',
  VIEW: '/app/secrets/view',
};

// ── Notification deep-link map ──────────────────────────────────────
// Maps a notification's `type` + `meta` to the routerLink a click
// should navigate to, using the builders above (never hand-built
// paths). Returns null when a row isn't navigable (unknown type or
// missing target id) — the caller then just marks it read without
// navigating. `meta` reuses the single exported NotificationMeta type
// (see notification.service.ts) so the deep-link shape can't drift from
// the wire shape the service consumes.
export interface NotificationRouteInput {
  type: string;
  meta?: NotificationMeta | null;
}

/** assetType → the matching view-builder for asset_shared/unshared. */
function assetView(
  assetType: string | undefined,
  assetId: string,
): string | null {
  switch (assetType) {
    case 'dataset':
      return DATASET.view(assetId);
    case 'analysis':
      return ANALYSES.view(assetId);
    case 'dashboard':
      return DASHBOARD.view(assetId);
    default:
      return null;
  }
}

export function notificationRoute(n: NotificationRouteInput): string | null {
  const meta = n.meta ?? {};
  switch (n.type) {
    case 'asset_shared':
    case 'asset_unshared': {
      if (!meta.assetId) return null;
      return assetView(meta.assetType, meta.assetId);
    }
    case 'alert_fired': {
      // Prefer the alert rule view; fall back to the source analysis.
      if (meta.alertId) return ALERT.view(meta.alertId);
      if (meta.analysisId) return ANALYSES.view(meta.analysisId);
      return null;
    }
    case 'dashboard_delivered': {
      return meta.dashboardId ? DASHBOARD.view(meta.dashboardId) : null;
    }
    case 'group_added':
    case 'group_removed': {
      return meta.groupId ? GROUP.view(meta.groupId) : null;
    }
    default:
      return null;
  }
}
