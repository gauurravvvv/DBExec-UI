/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/datasets.ts
 *   FE: src/app/shared/validators/datasets.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Covers every form on the dataset surface:
 *   - Save / Edit dataset (SQL-authored)
 *   - Save / Edit dataset (query-builder-authored)
 *   - Add / Edit custom calculated field
 *   - Save-as / duplicate
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

/** Display-name shape, same as orgName / groupName / connectionName. */
export const DATASET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

export const DATASET_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 100,
  FIELD_NAME_MIN: 1,
  FIELD_NAME_MAX: 128,
  DESCRIPTION_MAX: 500,
  JUSTIFICATION_MAX: 500,
  SQL_MAX: 10000,
} as const;

/**
 * Prompt control types used on query-builder datasets. The list
 * mirrors the BE Joi enum (`fields.promptType`) one-to-one so the
 * two layers can never disagree about which control types are
 * accepted on the wire.
 */
export const PROMPT_TYPE_VALUES = [
  'calendar',
  'checkbox',
  'daterange',
  'dropdown',
  'multiselect',
  'number',
  'radio',
  'rangeslider',
  'text',
] as const;
export type PromptType = (typeof PROMPT_TYPE_VALUES)[number];

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

export const datasetNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.name.required' })
    .min(DATASET_LIMITS.NAME_MIN, {
      message: 'validation.datasets.name.tooShort',
    })
    .max(DATASET_LIMITS.NAME_MAX, {
      message: 'validation.datasets.name.tooLong',
    })
    .regex(DATASET_NAME_PATTERN, {
      message: 'validation.datasets.name.invalid',
    }),
);

export const datasetDescriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DATASET_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.datasets.description.tooLong',
    })
    .optional(),
);

export const datasetJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DATASET_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.datasets.justification.tooLong',
    })
    .optional(),
);

/**
 * Required justification — used on update flows when the FE shows the
 * "why are you changing this?" textarea (audit log requirement).
 */
export const datasetJustificationRequiredSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.justification.required' })
    .min(1, { message: 'validation.datasets.justification.required' })
    .max(DATASET_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.datasets.justification.tooLong',
    }),
);

export const datasourceIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.datasource.required' })
    .min(1, { message: 'validation.datasets.datasource.required' }),
);

export const sqlSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.sql.required' })
    .min(1, { message: 'validation.datasets.sql.required' })
    .max(DATASET_LIMITS.SQL_MAX, {
      message: 'validation.datasets.sql.tooLong',
    }),
);

export const queryBuilderIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.queryBuilder.required' })
    .min(1, { message: 'validation.datasets.queryBuilder.required' }),
);

export const datasetIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.id.required' })
    .min(1, { message: 'validation.datasets.id.required' }),
);

/** Custom calculated-field name. */
export const datasetFieldNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasets.field.name.required' })
    .min(DATASET_LIMITS.FIELD_NAME_MIN, {
      message: 'validation.datasets.field.name.required',
    })
    .max(DATASET_LIMITS.FIELD_NAME_MAX, {
      message: 'validation.datasets.field.name.tooLong',
    }),
);

/** Status flag — 0 inactive, 1 active. */
const statusSchema = z.union([z.literal(0), z.literal(1)]).optional();

// ── Result-cache config ────────────────────────────────────────────
// Opt-in per-dataset result caching. Both fields are optional on the
// wire so a caller that doesn't manage caching sends the same payload
// as before; the controller only mutates a field that was actually
// present. TTL bounds mirror the BE config (DATASET_CACHE_MIN/MAX_TTL_
// SECONDS) so the FE can reject an out-of-range value before the round
// trip — the BE clamps rather than rejects, so these are advisory.
export const DATASET_CACHE_TTL_LIMITS = {
  MIN_SECONDS: 10,
  MAX_SECONDS: 86_400,
} as const;

/** Cache on/off toggle. */
export const datasetCacheEnabledSchema = z.boolean().optional();

/**
 * Per-dataset TTL in seconds. Accepts null / '' to clear the override
 * (server falls back to its default TTL). A provided number must be a
 * positive integer within the advisory bounds.
 */
export const datasetCacheTtlSecondsSchema = z.preprocess(
  (v: unknown) => (v === '' || v === null ? undefined : v),
  z
    .number({ message: 'validation.datasets.cacheTtl.invalid' })
    .int({ message: 'validation.datasets.cacheTtl.invalid' })
    .min(DATASET_CACHE_TTL_LIMITS.MIN_SECONDS, {
      message: 'validation.datasets.cacheTtl.tooShort',
    })
    .max(DATASET_CACHE_TTL_LIMITS.MAX_SECONDS, {
      message: 'validation.datasets.cacheTtl.tooLong',
    })
    .optional(),
);

// ── Composite schemas ──────────────────────────────────────────────

/** SQL-authored Save dataset. */
export const addDatasetSchema = z.object({
  name: datasetNameSchema,
  description: datasetDescriptionSchema,
  datasource: datasourceIdSchema,
  sql: sqlSchema,
  cacheEnabled: datasetCacheEnabledSchema,
  cacheTtlSeconds: datasetCacheTtlSecondsSchema,
});
export type AddDatasetInput = z.infer<typeof addDatasetSchema>;

/** SQL-authored Update dataset. */
export const updateDatasetSchema = z.object({
  id: datasetIdSchema,
  name: datasetNameSchema,
  description: datasetDescriptionSchema,
  datasource: datasourceIdSchema,
  sql: sqlSchema,
  status: statusSchema,
  justification: datasetJustificationSchema,
  cacheEnabled: datasetCacheEnabledSchema,
  cacheTtlSeconds: datasetCacheTtlSecondsSchema,
});
export type UpdateDatasetInput = z.infer<typeof updateDatasetSchema>;

/** Duplicate / Save-As dataset. */
export const duplicateDatasetSchema = z.object({
  name: datasetNameSchema,
  description: datasetDescriptionSchema,
});

const promptValueSchema = z.object({
  promptId: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.datasets.prompt.id.required' })
      .min(1, { message: 'validation.datasets.prompt.id.required' }),
  ),
  type: z.preprocess(
    trimOrUndefined,
    z.enum(PROMPT_TYPE_VALUES, {
      message: 'validation.datasets.prompt.type.invalid',
    }),
  ),
});

/** Query-builder-authored Save dataset. */
export const addDatasetViaBuilderSchema = z.object({
  name: datasetNameSchema,
  description: datasetDescriptionSchema,
  datasource: datasourceIdSchema,
  queryBuilderId: queryBuilderIdSchema,
  prompts: z.array(promptValueSchema),
  // Free-form prompt config — shape is owned by the query-builder
  // module. Any object is accepted on the wire.
  promptConfig: z.any().optional(),
});

/** Query-builder-authored Update dataset. */
export const updateDatasetViaBuilderSchema = z.object({
  id: datasetIdSchema,
  name: datasetNameSchema,
  description: datasetDescriptionSchema,
  status: statusSchema,
  datasource: datasourceIdSchema,
  queryBuilderId: queryBuilderIdSchema,
  prompts: z.array(promptValueSchema),
  promptConfig: z.any().optional(),
  justification: datasetJustificationSchema,
});

/** Add custom calculated field. */
export const addDatasetFieldSchema = z.object({
  datasetId: datasetIdSchema,
  name: datasetFieldNameSchema,
  // customLogic is allowed empty on the wire — controller treats null
  // as "no expression yet" (the formula UI saves drafts).
  customLogic: z.preprocess(blankToUndefined, z.string().optional()),
  dataType: z.preprocess(blankToUndefined, z.string().optional()),
  analysisId: z.preprocess(blankToUndefined, z.string().optional()),
  used_field_ids: z.array(z.string()).optional(),
});

/** Update custom calculated field. */
export const updateDatasetFieldSchema = z.object({
  fieldId: datasetIdSchema,
  datasetId: datasetIdSchema,
  columnNameToView: datasetFieldNameSchema,
  used_field_ids: z.array(z.string()).optional(),
  customLogic: z.preprocess(blankToUndefined, z.string().optional()),
  dataType: z.preprocess(blankToUndefined, z.string().optional()),
  justification: datasetJustificationSchema,
});
