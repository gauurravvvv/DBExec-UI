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

const nullableTrim = (v: unknown): unknown => {
  // lastName + similar optional human fields: '' → undefined so the
  // schema's optional() takes over and accepts the absence. null is
  // also normalised to undefined so JSON `null` doesn't trip the
  // type guard.
  if (v === null) return undefined;
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
    .regex(EMAIL_PATTERN, { message: 'validation.users.email.invalid' }),
);

export const usernameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.users.username.required' })
    .min(6, { message: 'validation.users.username.tooShort' })
    .max(30, { message: 'validation.users.username.tooLong' })
    .regex(USERNAME_PATTERN, { message: 'validation.users.username.invalid' }),
);

export const firstNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.users.firstName.required' })
    .min(2, { message: 'validation.users.firstName.tooShort' })
    .max(30, { message: 'validation.users.firstName.tooLong' })
    .regex(NAME_PATTERN, { message: 'validation.users.firstName.invalid' }),
);

/**
 * lastName is OPTIONAL by product policy (some cultures use mononyms).
 * When supplied it has to match the same rules as firstName.
 */
export const lastNameSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .max(30, { message: 'validation.users.lastName.tooLong' })
    .regex(NAME_PATTERN, { message: 'validation.users.lastName.invalid' })
    .optional(),
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
  firstName: firstNameSchema,
  lastName: lastNameSchema,
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
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  locale: localeSchema.optional(),
  groupIds: groupIdsSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
