/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/formBuilder.ts
 *   FE: src/app/shared/validators/formBuilder.ts
 *
 * Prompt Builder — form family + runtime compose validators. Skeleton for
 * Phase 0; later phases (2 create/update form, 7 compose/preview/execute)
 * fill in the schemas. Messages are i18n keys validation.formBuilder.<field>.<rule>.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

export const FORM_BUILDER_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 160,
  DESCRIPTION_MAX: 2000,
  DEFAULT_LIMIT: 1000,
  MAX_LIMIT: 50000,
} as const;

// ─── Phase 2: form family CRUD schemas ───────────────────────────────
// Only the columns FbForm actually stores (name/description/connectorId/
// iconKey). The builder-meta fields (baseSchema/baseTable/baseAlias/limits/
// forceDistinct) that 04-api §3.1 lists live on QueryBuilder, NOT FbForm —
// they are a Phase-3 concern and are intentionally NOT accepted here. `code`
// (the machine slug) is derived by the controller from the name, not client-
// supplied.

export const createFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(FORM_BUILDER_LIMITS.NAME_MIN, { message: 'validation.formBuilder.name.required' })
    .max(FORM_BUILDER_LIMITS.NAME_MAX, { message: 'validation.formBuilder.name.max' }),
  description: z
    .string()
    .trim()
    .max(FORM_BUILDER_LIMITS.DESCRIPTION_MAX, { message: 'validation.formBuilder.description.max' })
    .optional(),
  connectorId: z
    .string()
    .uuid({ message: 'validation.formBuilder.connectorId.invalid' }),
  iconKey: z.string().trim().max(64, { message: 'validation.formBuilder.iconKey.max' }).optional(),
});
export type CreateFormBody = z.infer<typeof createFormSchema>;

// PATCH — every field optional; connectorId is accepted but the controller
// rejects a change once any version is published (DATASOURCE_LOCKED).
export const updateFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(FORM_BUILDER_LIMITS.NAME_MIN, { message: 'validation.formBuilder.name.required' })
      .max(FORM_BUILDER_LIMITS.NAME_MAX, { message: 'validation.formBuilder.name.max' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(FORM_BUILDER_LIMITS.DESCRIPTION_MAX, { message: 'validation.formBuilder.description.max' })
      .nullable()
      .optional(),
    connectorId: z
      .string()
      .uuid({ message: 'validation.formBuilder.connectorId.invalid' })
      .optional(),
    iconKey: z
      .string()
      .trim()
      .max(64, { message: 'validation.formBuilder.iconKey.max' })
      .nullable()
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'validation.formBuilder.update.empty',
  });
export type UpdateFormBody = z.infer<typeof updateFormSchema>;

// GET / — query-string filters. Coerce numeric page/limit from strings.
export const listFormsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FORM_BUILDER_LIMITS.MAX_LIMIT)
    .optional()
    .default(25),
  search: z.string().trim().max(FORM_BUILDER_LIMITS.NAME_MAX).optional(),
  connectorId: z.string().uuid({ message: 'validation.formBuilder.connectorId.invalid' }).optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});
export type ListFormsQuery = z.infer<typeof listFormsSchema>;

export const bulkDeleteFormsSchema = z.object({
  ids: z
    .array(z.string().uuid({ message: 'validation.formBuilder.ids.invalid' }))
    .min(1, { message: 'validation.formBuilder.ids.required' })
    .max(200, { message: 'validation.formBuilder.ids.max' }),
  justification: z.string().trim().max(1000).optional(),
});
export type BulkDeleteFormsBody = z.infer<typeof bulkDeleteFormsSchema>;
