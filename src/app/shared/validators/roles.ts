/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/roles.ts
 *   FE: src/app/shared/validators/roles.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

/**
 * Role / Group / Connection display name. Letters, digits, spaces,
 * dots, underscores, hyphens. Must start with a letter or digit.
 * Same pattern as organisation.ts ORG_NAME_PATTERN — kept duplicated
 * so the file is self-contained.
 */
export const ROLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/** UUID — for selectedPermissions[].permissionId. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

const nullableTrim = (v: unknown): unknown => {
  if (v === null) return undefined;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

export const roleNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.roles.name.required' })
    .min(2, { message: 'validation.roles.name.tooShort' })
    .max(64, { message: 'validation.roles.name.tooLong' })
    .regex(ROLE_NAME_PATTERN, { message: 'validation.roles.name.invalid' }),
);

export const roleDescriptionSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .min(2, { message: 'validation.roles.description.tooShort' })
    .max(500, { message: 'validation.roles.description.tooLong' })
    .optional(),
);

/**
 * Permission grants — each entry pairs a permission UUID with a
 * numeric access level. Level 0 (NONE) is allowed at the wire layer;
 * the controller strips zeros before persisting (so storing an
 * "ungranted" permission is impossible).
 */
const selectedPermissionEntry = z.object({
  permissionId: z
    .string({ message: 'validation.roles.permissions.entryInvalid' })
    .regex(UUID_PATTERN, {
      message: 'validation.roles.permissions.entryInvalid',
    }),
  level: z
    .number({ message: 'validation.roles.permissions.entryInvalid' })
    .int({ message: 'validation.roles.permissions.entryInvalid' })
    .min(0, { message: 'validation.roles.permissions.entryInvalid' })
    .max(3, { message: 'validation.roles.permissions.entryInvalid' }),
});

export const selectedPermissionsSchema = z
  .array(selectedPermissionEntry, {
    message: 'validation.roles.permissions.required',
  })
  .min(1, { message: 'validation.roles.permissions.required' });

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/roles body. */
export const addRoleSchema = z.object({
  name: roleNameSchema,
  description: roleDescriptionSchema,
  selectedPermissions: selectedPermissionsSchema,
});

export type AddRoleInput = z.infer<typeof addRoleSchema>;

/**
 * PUT /api/v1/roles/:id body.
 *
 * Name is editable post-create — roles aren't tenant identifiers the
 * way organisation names are. Permissions still required: a role with
 * no grants is a dead role.
 */
export const updateRoleSchema = z.object({
  name: roleNameSchema,
  description: roleDescriptionSchema,
  selectedPermissions: selectedPermissionsSchema,
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
