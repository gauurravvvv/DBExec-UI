/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/access.ts
 *   FE: src/app/shared/validators/access.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Access Manager has a single mutation endpoint: POST /access/grant.
 * The payload picks a (datasource, connection) pair and assigns it to
 * a set of users and/or groups. Either array may be empty — that's
 * the "revoke" path. Both being empty/missing is also valid and
 * means "clear all assignments".
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

/**
 * Treat null / undefined as an empty array so the controller's
 * "no entries means revoke all" semantics still apply when the FE
 * omits the field. We don't deduplicate here — duplicates are the
 * controller's concern (and harmless: it just re-inserts the same row).
 */
const arrayOrEmpty = (v: unknown): unknown => {
  if (v === null || v === undefined) return [];
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

/** Datasource id picked on the form. UUID check is at the param layer. */
export const accessDatasourceSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.access.datasource.required' })
    .min(1, { message: 'validation.access.datasource.required' }),
);

/** Connection id picked on the form. */
export const accessConnectionSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.access.connection.required' })
    .min(1, { message: 'validation.access.connection.required' }),
);

/** Subject array — strings only, empty allowed, null/undefined → []. */
const subjectArraySchema = z.preprocess(
  arrayOrEmpty,
  z.array(
    z.string().min(1, { message: 'validation.access.subject.invalid' }),
  ),
);

// ── Composite schema ───────────────────────────────────────────────

export const grantAccessSchema = z.object({
  datasource: accessDatasourceSchema,
  connection: accessConnectionSchema,
  users: subjectArraySchema.optional(),
  groups: subjectArraySchema.optional(),
});
export type GrantAccessInput = z.infer<typeof grantAccessSchema>;
