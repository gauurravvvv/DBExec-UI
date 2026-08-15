/**
 * Field-level RBAC wire + view types for the Form Builder (Prompt Builder F11).
 *
 * The grant store is the per-placement role×access grid; the editor upserts
 * grants (write/read/none) or deletes them (revert to the permissive default).
 * The FE has no reusable Role {id,name} interface (RoleService types rows as
 * any), so a minimal one lives here for the role picker.
 */

export type FieldAccess = 'none' | 'read' | 'write';

/** A minimal org role for the picker (RoleService rows are untyped). */
export interface Role {
  id: string;
  name: string;
}

/** One persisted grant, role name joined in (GET/POST/DELETE response). */
export interface FieldGrant {
  roleId: string;
  roleName: string;
  access: FieldAccess;
}

/** The current role×access grid for one placement. */
export interface FieldPermissionData {
  formFieldId: string;
  grants: FieldGrant[];
}

/**
 * A grid row — one org role plus its current access. '' is the permissive
 * default (no grant): a blank row deletes any grant and reverts the role to
 * fully writable.
 */
export interface RbacRow {
  roleId: string;
  roleName: string;
  access: '' | FieldAccess;
}

/** A flattened "Tab › Section › Field" picker option keyed by placement id. */
export interface FieldPathOption {
  formFieldId: string;
  path: string;
}
