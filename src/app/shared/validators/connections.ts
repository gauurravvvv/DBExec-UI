/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/connections.ts
 *   FE: src/app/shared/validators/connections.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Connections wrap end-user credentials for a datasource. The shape
 * is small — a display name, a parent datasource id, a username, and
 * a password — but the same fields are reused on add and update.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

import {
  DB_LIMITS,
  dbPasswordSchema,
  dbUsernameSchema,
  descriptionSchema,
} from './datasources';

// ── Standard patterns ──────────────────────────────────────────────

/** Same display-name shape as organisation / group / datasource names. */
export const CONNECTION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

export const CONNECTION_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 64,
  DESCRIPTION_MAX: DB_LIMITS.DESCRIPTION_MAX,
  JUSTIFICATION_MAX: DB_LIMITS.JUSTIFICATION_MAX,
} as const;

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

// ── Field schemas ──────────────────────────────────────────────────

export const connectionNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.connections.name.required' })
    .min(CONNECTION_LIMITS.NAME_MIN, {
      message: 'validation.connections.name.tooShort',
    })
    .max(CONNECTION_LIMITS.NAME_MAX, {
      message: 'validation.connections.name.tooLong',
    })
    .regex(CONNECTION_NAME_PATTERN, {
      message: 'validation.connections.name.invalid',
    }),
);

/** Parent datasource id — opaque string here, UUID check on BE param layer. */
export const datasourceIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.connections.datasource.required' })
    .min(1, { message: 'validation.connections.datasource.required' }),
);

/** Same description rule as datasources — optional, ≤ 500 chars. */
export const connectionDescriptionSchema = descriptionSchema;

// Connection-username / -password reuse the datasource field rules
// (same underlying DB-user credentials, same length bounds).
export { dbUsernameSchema as connectionDbUsernameSchema };
export { dbPasswordSchema as connectionDbPasswordSchema };

// ── Composite schemas ──────────────────────────────────────────────

export const addConnectionSchema = z.object({
  name: connectionNameSchema,
  description: connectionDescriptionSchema,
  datasource: datasourceIdSchema,
  dbUsername: dbUsernameSchema,
  dbPassword: dbPasswordSchema,
});
export type AddConnectionInput = z.infer<typeof addConnectionSchema>;

export const updateConnectionSchema = z.object({
  id: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.connections.id.required' })
      .min(1, { message: 'validation.connections.id.required' }),
  ),
  name: connectionNameSchema,
  description: connectionDescriptionSchema,
  datasource: datasourceIdSchema,
  dbUsername: dbUsernameSchema,
  dbPassword: dbPasswordSchema,
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  justification: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(CONNECTION_LIMITS.JUSTIFICATION_MAX, {
        message: 'validation.connections.justification.tooLong',
      })
      .optional(),
  ),
});
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
