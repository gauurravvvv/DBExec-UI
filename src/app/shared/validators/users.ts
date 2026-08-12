/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/users.ts
 *   FE: src/app/shared/validators/users.ts
 *
 * Workflow when changing a rule:
 *   - Edit BOTH files (BE and FE) in the SAME feature PR. Code
 *     review on both repos catches drift.
 *
 * See organisation.ts for the convention overview (mirrored vs BE-only
 * vs FE-only file naming, translation-key contract).
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

/** Email — WHATWG HTML5 spec (TLD ≥ 2 chars required). */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Username — starts with a letter, then letters / digits / dot /
 * underscore / hyphen. Matches the historical BE rule.
 */
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

/**
 * Human name — Unicode-aware. Supports accented chars (José),
 * apostrophes (O'Brien), hyphens (Mary-Jane), spaces.
 * `\p{L}` is the Unicode letter class.
 */
export const NAME_PATTERN = /^[\p{L}][\p{L}'\- ]*$/u;

/** UUID v1-v8 — used to validate group / role ids the client sends. */
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

// ── Field schemas ──────────────────────────────────────────────────

export const emailSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.users.email.required' })
    .max(254, { message: 'validation.users.email.tooLong' })
    .regex(EMAIL_PATTERN, { message: 'validation.users.email.invalid' })
    // Canonicalise to lowercase so email uniqueness + the email-based
    // password-reset lookup are consistent. Email addresses are effectively
    // case-insensitive for delivery; storing a single canonical case prevents
    // "A@x.com" and "a@x.com" coexisting in one org and prevents a case
    // mismatch from breaking the forgot-password lookup. (Username stays
    // case-sensitive by design — see user.entity.ts.)
    .transform(v => v.toLowerCase()),
);

export const usernameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.users.username.required' })
    .min(6, { message: 'validation.users.username.tooShort' })
    .max(30, { message: 'validation.users.username.tooLong' })
    .regex(USERNAME_PATTERN, { message: 'validation.users.username.invalid' }),
);

/**
 * Full name — a single required field (no separate first/last).
 * Unicode-aware, allows spaces so a complete name like "María José García"
 * passes. Max widened to 60 to accommodate full names.
 */
export const fullNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.users.fullName.required' })
    .min(2, { message: 'validation.users.fullName.tooShort' })
    .max(60, { message: 'validation.users.fullName.tooLong' })
    .regex(NAME_PATTERN, { message: 'validation.users.fullName.invalid' }),
);

/** Supported locale codes — mirror src/shared/utility/i18n.ts. */
export const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'pt-BR',
  'zh-CN',
  'ko',
  'it',
  'nl',
  'ja',
] as const;

export const localeSchema = z
  .enum(SUPPORTED_LOCALES, { message: 'validation.users.locale.invalid' })
  .default('en');

/** Group id list — at least one entry, each a UUID. */
export const groupIdsSchema = z
  .array(
    z
      .string({ message: 'validation.users.groupIds.idInvalid' })
      .regex(UUID_PATTERN, { message: 'validation.users.groupIds.idInvalid' }),
    { message: 'validation.users.groupIds.required' },
  )
  .min(1, { message: 'validation.users.groupIds.required' });

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/users body. */
export const addUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  fullName: fullNameSchema,
  locale: localeSchema,
  groupIds: groupIdsSchema,
});

export type AddUserInput = z.infer<typeof addUserSchema>;

/**
 * PUT /api/v1/users/:id body.
 *
 * Same identity fields as add. groupIds is optional on update because
 * an admin may want to change profile fields only; when omitted, the
 * controller skips the membership replace step.
 */
export const updateUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  fullName: fullNameSchema,
  locale: localeSchema.optional(),
  groupIds: groupIdsSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ── Bulk user import/CSV schemas ──────────────────────────────────────────

/**
 * BulkAddUserValidate — per-row schema from CSV upload.
 * groupNames is a pipe-separated string (user input), resolved to groupIds
 * after validation. Both the users and system-users modules reuse this.
 */
export const bulkUserRowSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    fullName: fullNameSchema,
    groupNames: z
      .string({ message: 'validation.users.groupNames.required' })
      .trim()
      .min(1, { message: 'validation.users.groupNames.required' }),
    locale: localeSchema,
  })
  .strict();

export type BulkUserRow = z.infer<typeof bulkUserRowSchema>;

/**
 * BulkAddUserCommit — the list of fully-resolved users to create.
 * Each entry has groupIds (not groupNames) resolved from the validate step.
 * The schema trusts the shape so the controller can proceed to DB writes.
 */
export const bulkUserEntrySchema = z
  .object({
    row: z.number({ message: 'validation.users.row.required' }).int().min(1),
    email: emailSchema,
    username: usernameSchema,
    fullName: fullNameSchema,
    groupIds: z
      .array(
        z
          .string({ message: 'validation.users.groupIds.idInvalid' })
          .regex(UUID_PATTERN, { message: 'validation.users.groupIds.idInvalid' }),
        { message: 'validation.users.groupIds.required' },
      )
      .min(1, { message: 'validation.users.groupIds.required' }),
    groupNames: z.array(z.string()).optional(),
    locale: localeSchema,
  })
  .strict();

export type BulkUserEntry = z.infer<typeof bulkUserEntrySchema>;

export const bulkAddUserCommitSchema = z.object({
  users: z
    .array(bulkUserEntrySchema, { message: 'validation.users.users.required' })
    .min(1, { message: 'validation.users.users.min' })
    .max(500, { message: 'validation.users.users.max' }),
});

export type BulkAddUserCommitInput = z.infer<typeof bulkAddUserCommitSchema>;

// ── List user query schema ──────────────────────────────────────────────

export const listUserQuerySchema = z.object({
  groupId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  filter: z.string().optional(),
  sort: z.string().optional(),
  excludeSelf: z.coerce.boolean().default(false),
});

export type ListUserQuery = z.infer<typeof listUserQuerySchema>;

// ── Update password schema ──────────────────────────────────────────────

export const updatePasswordSchema = z.object({
  id: z
    .string({ message: 'validation.common.id.required' })
    .trim()
    .regex(UUID_PATTERN, { message: 'validation.common.id.invalid' }),
  newPassword: z.string({ message: 'validation.users.newPassword.required' }).min(1),
});

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
