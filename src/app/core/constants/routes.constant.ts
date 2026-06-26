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

export const SYSTEM_ADMIN = feature('/app/admins');
export const ORGANISATION = feature('/app/organisations');

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
export const RLS_RULE = feature('/app/rls-rules');

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
};

// Dashboards are view-only.
export const DASHBOARD = {
  LIST: '/app/dashboards',
  VIEW: '/app/dashboards',
  view: (id: string | number) => `/app/dashboards/${id}`,
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
