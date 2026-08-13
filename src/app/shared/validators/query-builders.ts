/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/query-builders.ts
 *   FE: src/app/shared/validators/query-builders.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

export const ORG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
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

export const queryBuilderNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.queryBuilders.name.required' })
    .min(2, { message: 'validation.queryBuilders.name.tooShort' })
    .max(64, { message: 'validation.queryBuilders.name.tooLong' })
    .regex(ORG_NAME_PATTERN, {
      message: 'validation.queryBuilders.name.invalid',
    }),
);

export const queryBuilderDescriptionSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .min(2, { message: 'validation.queryBuilders.description.tooShort' })
    .max(500, { message: 'validation.queryBuilders.description.tooLong' })
    .optional(),
);

export const datasourceSchema = z
  .string({ message: 'validation.queryBuilders.datasource.required' })
  .trim()
  .uuid({ message: 'validation.queryBuilders.datasource.invalid' });

export const statusSchema = z
  .number({ message: 'validation.queryBuilders.status.invalid' })
  .int()
  .refine((v) => v === 0 || v === 1, {
    message: 'validation.queryBuilders.status.invalid',
  });

export const justificationSchema = z.preprocess(
  nullableTrim,
  z.string().max(500).optional(),
);

export const idSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.common.id.required' })
    .uuid({ message: 'validation.common.id.invalid' }),
);

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/query-builders body — create a new query builder. */
export const addQueryBuilderSchema = z.object({
  name: queryBuilderNameSchema,
  description: queryBuilderDescriptionSchema,
  datasource: datasourceSchema,
});

export type AddQueryBuilderInput = z.infer<typeof addQueryBuilderSchema>;

/** DELETE /api/v1/query-builders/bulk body — delete multiple query builders by id. */
export const deleteQueryBuildersBulkSchema = z.object({
  ids: z
    .array(
      z
        .string({ message: 'validation.common.id.required' })
        .uuid({ message: 'validation.common.id.invalid' }),
    )
    .min(1, { message: 'validation.queryBuilders.ids.required' }),
  justification: justificationSchema,
});

export type DeleteQueryBuildersBulkInput = z.infer<
  typeof deleteQueryBuildersBulkSchema
>;

/** PUT /api/v1/query-builders/:id body — update a query builder. */
export const updateQueryBuilderSchema = z.object({
  id: idSchema,
  name: queryBuilderNameSchema,
  description: queryBuilderDescriptionSchema,
  datasource: datasourceSchema,
  status: statusSchema,
  justification: justificationSchema,
});

export type UpdateQueryBuilderInput = z.infer<typeof updateQueryBuilderSchema>;
