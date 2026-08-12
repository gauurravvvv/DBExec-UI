/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/savedQueries.ts
 *   FE: src/app/shared/validators/savedQueries.ts
 *
 * Single source of truth for the Query Runner saved-queries surface:
 * create / update a saved query. Both the FE form and the BE zodValidate
 * middleware consume these schemas so the contract can never drift
 * between client and server.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

export const SAVED_QUERY_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 150,
  DESCRIPTION_MAX: 500,
  SQL_MAX: 50000,
} as const;

export const SAVED_QUERY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

// ── Field preprocessors ─────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown =>
  typeof v === 'string' ? (v.trim().length === 0 ? undefined : v.trim()) : v;
const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

// ── Field schemas ───────────────────────────────────────────────────

export const savedQueryNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.savedQueries.name.required' })
    .min(SAVED_QUERY_LIMITS.NAME_MIN, {
      message: 'validation.savedQueries.name.tooShort',
    })
    .max(SAVED_QUERY_LIMITS.NAME_MAX, {
      message: 'validation.savedQueries.name.tooLong',
    })
    .regex(SAVED_QUERY_NAME_PATTERN, {
      message: 'validation.savedQueries.name.invalid',
    }),
);

export const savedQueryDescriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(SAVED_QUERY_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.savedQueries.description.tooLong',
    })
    .optional(),
);

export const savedQuerySqlSchema = z
  .string({ message: 'validation.savedQueries.sql.required' })
  .min(1, { message: 'validation.savedQueries.sql.required' })
  .max(SAVED_QUERY_LIMITS.SQL_MAX, {
    message: 'validation.savedQueries.sql.tooLong',
  });

// ── Payload schemas ─────────────────────────────────────────────────

/** Shared shape for create + update. */
export const addSavedQuerySchema = z.object({
  name: savedQueryNameSchema,
  description: savedQueryDescriptionSchema,
  sql: savedQuerySqlSchema,
  datasourceId: z
    .string()
    .uuid({ message: 'validation.savedQueries.datasourceId.invalid' }),
  connectionId: z
    .string()
    .uuid({ message: 'validation.savedQueries.connectionId.invalid' }),
  rowLimit: z
    .number()
    .int({ message: 'validation.savedQueries.rowLimit.invalid' })
    .positive({ message: 'validation.savedQueries.rowLimit.invalid' })
    .optional(),
});

/** Update = same shape; id comes from the URL param, not the body. */
export const updateSavedQuerySchema = addSavedQuerySchema;

export type AddSavedQueryInput = z.infer<typeof addSavedQuerySchema>;
export type UpdateSavedQueryInput = z.infer<typeof updateSavedQuerySchema>;

// ── List schemas (query params) ──────────────────────────────────────

export const listSavedQueriesSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  filter: z.string().trim().optional(),
  sort: z.string().optional(),
});

export type ListSavedQueriesInput = z.infer<typeof listSavedQueriesSchema>;
