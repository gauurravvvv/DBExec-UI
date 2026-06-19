/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/groups.ts
 *   FE: src/app/shared/validators/groups.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

export const GROUP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

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

export const groupNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.groups.name.required' })
    .min(2, { message: 'validation.groups.name.tooShort' })
    .max(64, { message: 'validation.groups.name.tooLong' })
    .regex(GROUP_NAME_PATTERN, { message: 'validation.groups.name.invalid' }),
);

export const groupDescriptionSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .min(2, { message: 'validation.groups.description.tooShort' })
    .max(500, { message: 'validation.groups.description.tooLong' })
    .optional(),
);

export const roleIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.groups.roleId.required' })
    .regex(UUID_PATTERN, { message: 'validation.groups.roleId.invalid' }),
);

/**
 * Member list — empty array is valid at create time (group with no
 * members is a legitimate state). Each entry must be a UUID. Default
 * to [] so the controller can iterate without a null guard.
 */
export const userIdsSchema = z
  .array(
    z
      .string({ message: 'validation.groups.users.idInvalid' })
      .regex(UUID_PATTERN, { message: 'validation.groups.users.idInvalid' }),
  )
  .default([]);

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/groups body. */
export const addGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
  roleId: roleIdSchema,
  users: userIdsSchema,
});

export type AddGroupInput = z.infer<typeof addGroupSchema>;

/**
 * PUT /api/v1/groups/:id body. Same fields as add — group renames
 * are allowed (no audit-log tenant binding the way org names have).
 */
export const updateGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
  roleId: roleIdSchema,
  users: userIdsSchema,
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
