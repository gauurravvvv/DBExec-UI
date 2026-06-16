/**
 * Shared types for the relational RBAC role-management screens.
 *
 * The BE serves two read endpoints we shape against here:
 *   - GET /api/v1/permissions  → modules[] + (optional) orphans[]. Each
 *     leaf carries a `level` only when the caller passes ?roleId=.
 *   - GET /api/v1/access-levels → four canonical rows used to render
 *     the column headers + radio values in the role permission grid.
 *
 * The write payload (POST /roles, PUT /roles/:id) is a flat array of
 * { permissionId, level } entries. Entries with level < 1 are stripped
 * client-side before send — BE strips too, but keeping the wire small
 * helps when a role has hundreds of leaves and only a handful granted.
 */

/** A single permission node — module or leaf. */
export interface PermissionRow {
  id: string;
  value: string;
  name: string;
  icon?: string;
  sequence: number;
  status: number;
  scope: string;
  /**
   * Effective level the queried role has on this leaf. Present only on
   * leaves and only when GET /permissions was called with ?roleId=.
   * 0 means no current grant (renders as the "None" radio selected).
   */
  level?: number;
}

/** A module with its leaves nested under `submodules`. */
export interface PermissionModule extends PermissionRow {
  submodules: PermissionRow[];
}

/** One row of the canonical access-level table. */
export interface AccessLevelEntry {
  id: string;
  value: number;
  code: string;
  label: string;
  description?: string;
  sequence: number;
  status: number;
}

/** Wire shape for one grant in the create/update payload. */
export interface SelectedPermissionEntry {
  permissionId: string;
  level: number;
}

/** POST /api/v1/roles body. */
export interface AddRolePayload {
  name: string;
  description?: string;
  selectedPermissions: SelectedPermissionEntry[];
}

/** PUT /api/v1/roles/:id body. Wholesale-replaces the role's mappings. */
export interface UpdateRolePayload {
  id: string;
  name: string;
  description?: string;
  selectedPermissions: SelectedPermissionEntry[];
  status?: number;
}

/** Response shape for GET /api/v1/permissions. */
export interface PermissionsListResponse {
  count: number;
  modules: PermissionModule[];
  orphans?: PermissionRow[];
}

/** Response shape for GET /api/v1/access-levels. */
export interface AccessLevelsResponse {
  count: number;
  levels: AccessLevelEntry[];
}
