/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/organisation.ts
 *   FE: src/app/shared/validators/organisation.ts
 *
 * Workflow when changing a rule:
 *   - Edit BOTH files (BE and FE) in the SAME feature PR. Code
 *     review on both repos catches drift.
 *
 * Files in the same folder that are NOT mirrored:
 *   - `_*.ts`              → BE-only (e.g. transport-layer fields)
 *   - `*-validator.ts`     → FE-only (Angular adapter convention)
 *
 * Why a copy and not a shared package: the rules stabilise after the
 * first release, and a shared package adds infrastructure for a
 * problem that surfaces loudly in dev (FE rejects what BE accepts,
 * or vice versa).
 *
 * Contract:
 *   - All error messages are TRANSLATION KEYS, never user-facing
 *     strings. Both BE (i18n.ts) and FE (@ngx-translate) resolve the
 *     key from the matching locale JSON.
 *   - Keys follow `validation.<module>.<field>.<rule>` so the locale
 *     files can group them.
 *
 * Reference patterns (industry standard):
 *   - email:   simplified RFC 5322 — accepted by browsers' built-in
 *              validator, used by html5 type=email
 *   - host:    RFC 952 / 1123 hostname OR IPv4 dotted-quad
 *   - dbName:  PostgreSQL identifier rules (Postgres is the only
 *              supported tenant engine today — extend if/when MySQL,
 *              MSSQL etc. land)
 *   - schema:  PostgreSQL identifier rules (lowercase-only — Postgres
 *              folds unquoted identifiers to lowercase, so accepting
 *              upper-case would create a footgun where "Acme_Prod"
 *              becomes "acme_prod")
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns (industry conventions) ────────────────────────

/**
 * Email. Mirrors the HTML5 `type=email` regex from the WHATWG spec —
 * what every modern browser checks against. Local part: letters,
 * digits, plus a small symbol set. Domain: dotted labels, TLD >= 2.
 */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Hostname OR IPv4 — same shape Postgres / MySQL / Redis CLI accept.
 * RFC 1123: labels of letters/digits/hyphen, dots between labels.
 * Rejects schemes (`https://`), ports inside host, spaces, anything
 * with `:` or `/`.
 */
export const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

/**
 * Postgres-style identifier (database name, table name). Letters,
 * digits, underscores, hyphens. First char must be a letter or
 * underscore. Max 63 = Postgres NAMEDATALEN - 1.
 *
 * NOTE: MySQL / MSSQL allow a wider charset (@, #, longer names).
 * If a non-Postgres tenant engine is ever supported, branch the
 * pattern per dialect.
 */
export const DB_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;

/**
 * Schema name — same as identifier but lowercase only.
 */
export const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Organisation display name. Letters, digits, spaces, dots,
 * underscores, hyphens. Must start with a letter or digit.
 */
export const ORG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Treats empty strings / null / undefined as "field not present" so
 * Zod returns the `.required` error instead of forcing the schema's
 * subsequent rules (regex, max, etc.) to fire on a blank value.
 *
 * Used as a `.preprocess` step on every string field. Without this,
 * a blank input on the FE form would show e.g. "must be at least 2
 * characters" the moment the page renders.
 */
const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

export const orgNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.name.required' })
    .min(2, { message: 'validation.organisation.name.tooShort' })
    .max(64, { message: 'validation.organisation.name.tooLong' })
    .regex(ORG_NAME_PATTERN, {
      message: 'validation.organisation.name.invalid',
    }),
);

export const orgDescriptionSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.description.required' })
    .min(2, { message: 'validation.organisation.description.tooShort' })
    .max(500, { message: 'validation.organisation.description.tooLong' }),
);

export const dbHostSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.dbHost.required' })
    .max(255, { message: 'validation.organisation.dbHost.tooLong' })
    .regex(HOST_PATTERN, {
      message: 'validation.organisation.dbHost.invalid',
    }),
);

/**
 * Port accepts string ('5432' from a text input) OR number ('5432'
 * from a JSON body). Empty / null / undefined are normalised to
 * undefined so the `required` error surfaces correctly. Anything
 * else has to pass int + range checks.
 */
export const dbPortSchema = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return undefined;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : trimmed; // pass non-numeric through so .number() rejects it
    }
    return v;
  },
  z
    .number({ message: 'validation.organisation.dbPort.required' })
    .int({ message: 'validation.organisation.dbPort.notInteger' })
    .min(1, { message: 'validation.organisation.dbPort.outOfRange' })
    .max(65535, { message: 'validation.organisation.dbPort.outOfRange' }),
);

export const dbNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.dbName.required' })
    .max(63, { message: 'validation.organisation.dbName.tooLong' })
    .regex(DB_IDENTIFIER_PATTERN, {
      message: 'validation.organisation.dbName.invalid',
    }),
);

export const dbSchemaSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.dbSchema.required' })
    .max(63, { message: 'validation.organisation.dbSchema.tooLong' })
    .regex(SCHEMA_PATTERN, {
      message: 'validation.organisation.dbSchema.invalid',
    }),
);

export const dbUsernameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.dbUsername.required' })
    .max(128, { message: 'validation.organisation.dbUsername.tooLong' })
    .regex(DB_IDENTIFIER_PATTERN, {
      message: 'validation.organisation.dbUsername.invalid',
    }),
);

/**
 * Passwords are never trimmed (leading / trailing whitespace can be
 * intentional) and never regex-checked at this layer — the
 * underlying DB is what decides what's a valid password. Required +
 * length only.
 */
export const dbPasswordSchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string({ message: 'validation.organisation.dbPassword.required' })
    .min(1, { message: 'validation.organisation.dbPassword.required' })
    .max(256, { message: 'validation.organisation.dbPassword.tooLong' }),
);

export const adminEmailSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.organisation.adminEmail.required' })
    .max(320, { message: 'validation.organisation.adminEmail.tooLong' })
    .regex(EMAIL_PATTERN, {
      message: 'validation.organisation.adminEmail.invalid',
    }),
);

/**
 * Supported locale codes — keep in sync with shared/utility/i18n.ts on
 * BE and assets/i18n/*.json on FE.
 */
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

export const adminLocaleSchema = z
  .enum(SUPPORTED_LOCALES, {
    message: 'validation.organisation.adminLocale.invalid',
  })
  .default('en');

// ── Composite schemas ──────────────────────────────────────────────

/** Body shape POST /api/v1/orgs accepts. */
export const addOrganisationSchema = z.object({
  name: orgNameSchema,
  description: orgDescriptionSchema,
  dbHost: dbHostSchema,
  dbPort: dbPortSchema,
  dbName: dbNameSchema,
  dbSchema: dbSchemaSchema,
  dbUsername: dbUsernameSchema,
  dbPassword: dbPasswordSchema,
  adminEmail: adminEmailSchema,
  adminLocale: adminLocaleSchema,
});

export type AddOrganisationInput = z.infer<typeof addOrganisationSchema>;

/**
 * Body shape PUT /api/v1/orgs/:id accepts.
 *
 * `name` is intentionally absent — organisation names are tenant
 * identifiers stamped into audit logs and connection strings and
 * cannot be renamed after creation. The BE update controller would
 * ignore a `name` in the body even if Zod allowed it; keeping it out
 * of the schema documents the rule.
 *
 * Every field is optional because the FE sends only the fields the
 * admin actually changed.
 */
export const updateOrganisationSchema = z.object({
  description: orgDescriptionSchema.optional(),
  dbHost: dbHostSchema.optional(),
  dbPort: dbPortSchema.optional(),
  dbName: dbNameSchema.optional(),
  dbSchema: dbSchemaSchema.optional(),
  dbUsername: dbUsernameSchema.optional(),
  dbPassword: dbPasswordSchema.optional(),
});

export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
