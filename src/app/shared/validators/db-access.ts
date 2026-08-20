/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/db-access.ts
 *   FE: src/app/shared/validators/db-access.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

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

/**
 * A Postgres identifier: non-empty, ≤ 63 chars. Quoted by the builder.
 */
export const dbIdentSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.dbAccess.dbIdent.required' })
    .min(1, { message: 'validation.dbAccess.dbIdent.required' })
    .max(63, { message: 'validation.dbAccess.dbIdent.tooLong' }),
);

/**
 * One-or-many identifiers (bulk membership ops accept arrays).
 */
export const dbIdentOrArraySchema = z.union([
  dbIdentSchema,
  z
    .array(dbIdentSchema)
    .min(1, { message: 'validation.dbAccess.dbIdent.required' }),
]);

export const previewOnlySchema = z.boolean().optional();
export const confirmSchema = z.boolean().optional();

/**
 * VALID UNTIL: an ISO-ish timestamp or the literal "infinity". We only
 * shape-check here (a Date-parseable string) so an obviously bad value
 * is rejected with a clean 400 instead of reaching Postgres and 500ing.
 * pgSqlBuilder.quoteLiteral still escapes it before it hits SQL.
 */
const validUntilSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .max(64, { message: 'validation.dbAccess.validUntil.tooLong' })
    .refine(
      (value) => {
        if (value.toLowerCase() === 'infinity') return true;
        return !Number.isNaN(Date.parse(value));
      },
      { message: 'validation.dbAccess.validUntil.invalid' },
    )
    .nullable()
    .optional(),
);

/**
 * A role password. Postgres has no hard length cap, but we bound it to
 * a sane 512 chars and forbid control characters (NUL, newline, etc.)
 * so a malformed value fails validation rather than at execution time.
 */
const rolePasswordSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .max(512, { message: 'validation.dbAccess.rolePassword.tooLong' })
    .refine(
      (value) => !/[\x00-\x1F\x7F]/.test(value),
      { message: 'validation.dbAccess.rolePassword.invalid' },
    )
    .nullable()
    .optional(),
);

/**
 * RoleAttributes accepted by buildCreateRole / buildAlterRole.
 */
export const roleAttributesSchema = z.object({
  login: z.boolean().optional(),
  superuser: z.boolean().optional(),
  createdb: z.boolean().optional(),
  createrole: z.boolean().optional(),
  replication: z.boolean().optional(),
  bypassrls: z.boolean().optional(),
  inherit: z.boolean().optional(),
  // PG CONNECTION LIMIT is a 32-bit int: -1 (unlimited) .. INT_MAX.
  connectionLimit: z
    .number()
    .int()
    .min(-1, { message: 'validation.dbAccess.connectionLimit.invalid' })
    .max(2147483647, { message: 'validation.dbAccess.connectionLimit.invalid' })
    .nullable()
    .optional(),
  validUntil: validUntilSchema,
  password: rolePasswordSchema,
});

/**
 * A Postgres backend pid: a positive 32-bit integer (session routes).
 */
export const backendPidSchema = z
  .number()
  .int()
  .positive({ message: 'validation.dbAccess.backendPid.invalid' })
  .max(2147483647, { message: 'validation.dbAccess.backendPid.invalid' });

/**
 * pgSqlBuilder ObjectRef.
 */
export const objectRefSchema = z
  .object({
    parts: z.array(dbIdentSchema).min(1).optional(),
    allInSchema: dbIdentSchema.optional(),
    columns: z
      .array(
        z.object({
          privilege: z
            .string({ message: 'validation.dbAccess.privilege.required' })
            .min(1, { message: 'validation.dbAccess.privilege.required' }),
          columns: z
            .array(dbIdentSchema)
            .min(1, { message: 'validation.dbAccess.columns.required' }),
        }),
      )
      .optional(),
  })
  .refine(
    (obj) => obj.parts || obj.allInSchema || obj.columns,
    { message: 'validation.dbAccess.objectRef.required' },
  );

export const objTypeSchema = z.enum(['DATABASE', 'SCHEMA', 'TABLE', 'SEQUENCE', 'FUNCTION'], {
  message: 'validation.dbAccess.objType.invalid',
});

export const privilegesSchema = z
  .array(
    z
      .string({ message: 'validation.dbAccess.privileges.invalid' })
      .min(1, { message: 'validation.dbAccess.privileges.invalid' }),
  )
  .min(1, { message: 'validation.dbAccess.privileges.required' });

// ── Composite schemas ──────────────────────────────────────────────

/**
 * POST /api/v1/db-access/roles/:connectorId body (alter-role).
 */
export const alterRoleSchema = z.object({
  attributes: roleAttributesSchema,
  previewOnly: previewOnlySchema,
});

export type AlterRoleInput = z.infer<typeof alterRoleSchema>;

/**
 * POST /api/v1/db-access/change-set/:connectorId body (apply-change-set).
 */
const grantIntentSchema = z.object({
  kind: z.literal('grant', {
    message: 'validation.dbAccess.kind.invalid',
  }),
  objType: objTypeSchema,
  privileges: privilegesSchema,
  toRole: dbIdentSchema,
  object: objectRefSchema,
  withGrantOption: z.boolean().optional(),
});

const revokeIntentSchema = z.object({
  kind: z.literal('revoke', {
    message: 'validation.dbAccess.kind.invalid',
  }),
  objType: objTypeSchema,
  privileges: privilegesSchema,
  fromRole: dbIdentSchema,
  object: objectRefSchema,
  behavior: z.enum(['RESTRICT', 'CASCADE'], {
    message: 'validation.dbAccess.behavior.invalid',
  }).optional(),
  grantOptionFor: z.boolean().optional(),
});

const revokePublicIntentSchema = z.object({
  kind: z.literal('revokePublic', {
    message: 'validation.dbAccess.kind.invalid',
  }),
  objType: objTypeSchema,
  privileges: privilegesSchema,
  object: objectRefSchema,
});

const defaultPrivIntentSchema = z.object({
  kind: z.literal('defaultPriv', {
    message: 'validation.dbAccess.kind.invalid',
  }),
  forRole: dbIdentSchema,
  inSchema: dbIdentSchema.optional(),
  action: z.enum(['GRANT', 'REVOKE'], {
    message: 'validation.dbAccess.action.invalid',
  }),
  onObjectType: z.enum(['TABLES', 'SEQUENCES', 'FUNCTIONS', 'TYPES', 'SCHEMAS'], {
    message: 'validation.dbAccess.onObjectType.invalid',
  }),
  privileges: privilegesSchema,
  targetRole: dbIdentSchema,
});

export const applyChangeSetSchema = z.object({
  statements: z
    .array(
      z.union([
        grantIntentSchema,
        revokeIntentSchema,
        revokePublicIntentSchema,
        defaultPrivIntentSchema,
      ]),
    )
    .min(1, { message: 'validation.dbAccess.statements.required' }),
  previewOnly: previewOnlySchema,
  confirm: confirmSchema,
});

export type ApplyChangeSetInput = z.infer<typeof applyChangeSetSchema>;

/**
 * POST /api/v1/db-access/roles/:connectorId body (create-role).
 */
export const createRoleSchema = z.object({
  name: dbIdentSchema,
  attributes: roleAttributesSchema.optional(),
  previewOnly: previewOnlySchema,
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/**
 * DELETE /api/v1/db-access/roles/:connectorId/:role body (delete-role).
 */
export const deleteRoleSchema = z
  .object({
    reassignTo: dbIdentSchema.optional(),
    dropOwned: z.boolean().optional(),
    confirm: confirmSchema,
    previewOnly: previewOnlySchema,
  })
  .refine(
    (obj) => !(obj.reassignTo && obj.dropOwned),
    { message: 'validation.dbAccess.reassignTo.conflict' },
  );

export type DeleteRoleInput = z.infer<typeof deleteRoleSchema>;

/**
 * POST /api/v1/db-access/member/:connectorId body (grant-role).
 */
export const grantRoleSchema = z.object({
  role: dbIdentOrArraySchema,
  toRole: dbIdentOrArraySchema,
  adminOption: z.boolean().optional(),
  previewOnly: previewOnlySchema,
});

export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

/**
 * PUT /api/v1/db-access/roles/:connectorId/:role body (rename-role).
 */
export const renameRoleSchema = z.object({
  newName: dbIdentSchema,
  previewOnly: previewOnlySchema,
});

export type RenameRoleInput = z.infer<typeof renameRoleSchema>;

/**
 * DELETE /api/v1/db-access/member/:connectorId body (revoke-role).
 */
export const revokeRoleSchema = z.object({
  role: dbIdentOrArraySchema,
  fromRole: dbIdentOrArraySchema,
  confirm: confirmSchema,
  previewOnly: previewOnlySchema,
});

export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>;

/**
 * :connectorId param schema for path validation.
 */
// `.passthrough()` so sibling path params (e.g. :roleName) and query params
// survive validation — zodValidate replaces req.params/req.query with the
// parsed result, and a strict object would STRIP :roleName, leaving the
// effective-privilege controllers reading `undefined` (they then matched only
// PUBLIC grants). Only connectorId is validated; the rest passes through.
export const datasourceIdParamSchema = z
  .object({
    connectorId: z
      .string({ message: 'validation.common.id.required' })
      .uuid({ message: 'validation.common.id.invalid' }),
  })
  .passthrough();

export type DatasourceIdParamInput = z.infer<typeof datasourceIdParamSchema>;

/**
 * :connectorId + :pid params schema for session route validation.
 */
export const sessionPidParamSchema = z.object({
  connectorId: z
    .string({ message: 'validation.common.id.required' })
    .uuid({ message: 'validation.common.id.invalid' }),
  pid: backendPidSchema,
});

export type SessionPidParamInput = z.infer<typeof sessionPidParamSchema>;
