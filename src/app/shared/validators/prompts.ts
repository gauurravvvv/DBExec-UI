/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/prompts.ts
 *   FE: src/app/shared/validators/prompts.ts
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

export const promptNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.prompts.name.required' })
    .min(2, { message: 'validation.prompts.name.tooShort' })
    .max(64, { message: 'validation.prompts.name.tooLong' })
    .regex(ORG_NAME_PATTERN, { message: 'validation.prompts.name.invalid' }),
);

export const promptTypeSchema = z.preprocess(
  (v) => {
    if (typeof v === 'string') return v.trim().toLowerCase();
    return v;
  },
  z.enum(
    [
      'calendar',
      'checkbox',
      'daterange',
      'dropdown',
      'multiselect',
      'number',
      'radio',
      'rangeslider',
      'text',
    ],
    { message: 'validation.prompts.type.invalid' },
  ),
);

export const promptDescriptionSchema = z.preprocess(
  nullableTrim,
  z
    .string()
    .min(2, { message: 'validation.prompts.description.tooShort' })
    .max(500, { message: 'validation.prompts.description.tooLong' })
    .optional(),
);

export const promptGroupNameSchema = z.preprocess(
  nullableTrim,
  z.string().max(255).optional(),
);

/**
 * The seven CANONICAL logical data types the filter_operator catalog's
 * `meta.dataTypes` is keyed on. This is a reference/mapping set, NOT a
 * whitelist — a prompt's dataType may be any string (a datasource column can be
 * json, array, interval, bytea, …). Operator filtering maps anything outside
 * this set to the `text` default (see the FE operator catalog + BE
 * applicableOperatorCodes). Kept exported so the FE Add screen can offer these
 * as suggested options while still accepting a free value.
 */
export const PROMPT_DATA_TYPES = [
  'text',
  'number',
  'date',
  'datetime',
  'bool',
  'enum',
  'uuid',
] as const;

/**
 * dataType is optional and free-form (accept data in any form). Trimmed +
 * lower-cased when present; empty → undefined. No enum gate — operator
 * applicability degrades unknown types to `text` rather than rejecting a save.
 */
export const promptDataTypeSchema = z.preprocess(
  (v) => {
    if (v === null) return undefined;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      return t.length === 0 ? undefined : t;
    }
    return v;
  },
  z.string().max(255).optional(),
);

export const datasourceSchema = z
  .string({ message: 'validation.prompts.datasource.required' })
  .trim()
  .uuid({ message: 'validation.prompts.datasource.invalid' });

export const statusSchema = z
  .number({ message: 'validation.prompts.status.invalid' })
  .int()
  .refine((v) => v === 0 || v === 1, {
    message: 'validation.prompts.status.invalid',
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

/**
 * Single prompt item for batch add. Each prompt carries optional groupName,
 * dataType, and display flags (isSelectable, isFilterable, isSortable).
 */
export const promptItemSchema = z.object({
  name: promptNameSchema,
  description: promptDescriptionSchema,
  type: promptTypeSchema,
  dataType: promptDataTypeSchema,
  isSelectable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isSortable: z.boolean().optional(),
});

/** POST /api/v1/prompts/add body — batch add prompts scoped to a datasource. */
export const addPromptsSchema = z.object({
  prompts: z
    .array(promptItemSchema)
    .min(1, { message: 'validation.prompts.prompts.required' }),
  datasource: datasourceSchema,
});

export type AddPromptsInput = z.infer<typeof addPromptsSchema>;

/** DELETE /api/v1/prompts/bulk body — delete multiple prompts by id. */
export const deletePromptsBulkSchema = z.object({
  ids: z
    .array(
      z
        .string({ message: 'validation.common.id.required' })
        .uuid({ message: 'validation.common.id.invalid' }),
    )
    .min(1, { message: 'validation.prompts.ids.required' }),
  justification: justificationSchema,
});

export type DeletePromptsBulkInput = z.infer<typeof deletePromptsBulkSchema>;

/** PUT /api/v1/prompts/:id body — update a single prompt. */
export const updatePromptSchema = z.object({
  id: idSchema,
  name: promptNameSchema,
  description: promptDescriptionSchema,
  datasource: datasourceSchema,
  status: statusSchema,
  dataType: promptDataTypeSchema,
  isSelectable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isSortable: z.boolean().optional(),
  justification: justificationSchema,
});

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
