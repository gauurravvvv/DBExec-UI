// Centralised navigation paths used by routerLink and router.navigate
// across the app. Paths follow REST conventions:
//   LIST – list / index page
//   NEW  – create page  ('new' replaces the older 'add' verb)
//   view / edit – helper FUNCTIONS that produce the full nested URL.
//
// Why helpers? Old code did router.navigate([USER.EDIT, orgId, id])
// which assumed the path shape `<base>/edit/<orgId>/<id>`. Under REST
// the path is `<base>/<orgId>/<id>/edit` — the segments interleave
// differently. Rather than have every caller assemble strings,
// each feature exposes typed helpers:
//   ROLE.view(orgId, id)   -> '/app/roles/<orgId>/<id>'
//   ROLE.edit(orgId, id)   -> '/app/roles/<orgId>/<id>/edit'
//
// `ADD`, `VIEW`, `EDIT` are kept as string aliases pointing at the
// list base so any leftover callers using `router.navigate([X.LIST])`
// continue to work; pair-segment callers must migrate to the helpers.
//
// API endpoint paths live in src/app/constants/api.ts, NOT here.

export const AUTH = {
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
};

// Helper that produces the standard navigation-constant shape for an
// org-scoped feature. base is e.g. '/app/users'.
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
    // that currently use router.navigate([X.EDIT, orgId, id]) must
    // migrate to router.navigate([X.edit(orgId, id)]). The bare
    // string is preserved so accidental usage doesn't compile-fail.
    VIEW: base,
    EDIT: base,
    // Helpers — preferred form going forward.
    view: (orgId: string | number, id: string | number) =>
      `${base}/${orgId}/${id}`,
    edit: (orgId: string | number, id: string | number) =>
      `${base}/${orgId}/${id}/edit`,
  };
}

// Variant for features whose URL uses only :id (no :orgId).
function singleIdFeature(base: string) {
  return {
    LIST: base,
    NEW: `${base}/new`,
    ADD: `${base}/new`,
    VIEW: base,
    EDIT: base,
    view: (id: string | number) => `${base}/${id}`,
    edit: (id: string | number) => `${base}/${id}/edit`,
  };
}

export const SYSTEM_ADMIN = singleIdFeature('/app/admins');
export const ORGANISATION = singleIdFeature('/app/organisations');

export const GROUP = feature('/app/groups');

export const USER = {
  ...feature('/app/users'),
  BULK_ADD: '/app/users/bulk-add',
};

export const DATASOURCE = feature('/app/datasources');
export const DATASET = feature('/app/datasets');
export const TAB = feature('/app/tabs');
export const SECTION = feature('/app/sections');
export const ROLE = feature('/app/roles');
export const CONNECTION = feature('/app/connections');
export const RLS_RULE = feature('/app/rls-rules');

// Analyses has no /new page (created from a dataset).
export const ANALYSES = {
  LIST: '/app/analyses',
  VIEW: '/app/analyses',
  EDIT: '/app/analyses',
  view: (orgId: string | number, id: string | number) =>
    `/app/analyses/${orgId}/${id}`,
  edit: (orgId: string | number, id: string | number) =>
    `/app/analyses/${orgId}/${id}/edit`,
};

export const PROMPT = {
  ...feature('/app/prompts'),
  // Configure callers: prefer PROMPT.configure(orgId, id).
  CONFIG: '/app/prompts',
  CONFIGURE: '/app/prompts',
  configure: (orgId: string | number, id: string | number) =>
    `/app/prompts/${orgId}/${id}/configure`,
};

export const QUERY_BUILDER = {
  ...feature('/app/query-builders'),
  CONFIG: '/app/query-builders',
  CONFIGURE: '/app/query-builders',
  RUN: '/app/query-builders',
  configure: (
    orgId: string | number,
    dbId: string | number,
    id: string | number,
  ) => `/app/query-builders/${orgId}/${dbId}/${id}/configure`,
  run: (
    orgId: string | number,
    dbId: string | number,
    queryBuilderId: string | number,
  ) => `/app/query-builders/${orgId}/${dbId}/${queryBuilderId}/run`,
};

// Dashboards are view-only.
export const DASHBOARD = {
  LIST: '/app/dashboards',
  VIEW: '/app/dashboards',
  view: (orgId: string | number, id: string | number) =>
    `/app/dashboards/${orgId}/${id}`,
};

export const ANNOUNCEMENT = feature('/app/settings/announcements');

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
