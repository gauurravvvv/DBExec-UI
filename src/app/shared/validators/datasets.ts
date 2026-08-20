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
  // Custom-field formula cap. Bounds the JS formula engine so a
  // pathologically deep/long expression cannot hang the enrichment
  // pass (which evaluates the formula once per row). Matches the SQL
  // calculated-field compiler's MAX_EXPRESSION_LENGTH.
  CUSTOM_LOGIC_MAX: 4000,
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

// ── Rich column metadata (slice 1) ─────────────────────────────────
// Per-column display hints persisted on DatasetField. All optional on
// the wire and additive — a caller that doesn't manage metadata sends
// the same field payload as before. None of these change the SQL
// result; they are downstream-picker / rendering hints only.

/** Semantic role of a column. */
export const DATASET_FIELD_ROLE_VALUES = ['dimension', 'measure'] as const;
export type DatasetFieldRole = (typeof DATASET_FIELD_ROLE_VALUES)[number];

/** Default aggregation applied to a measure downstream. */
export const DATASET_FIELD_AGGREGATION_VALUES = [
  'sum',
  'avg',
  'count',
  'countDistinct',
  'min',
  'max',
  'none',
] as const;
export type DatasetFieldAggregation =
  (typeof DATASET_FIELD_AGGREGATION_VALUES)[number];

/** Format-hint kinds. */
export const DATASET_FIELD_FORMAT_KIND_VALUES = [
  'number',
  'currency',
  'percent',
  'date',
  'datetime',
  'text',
] as const;
export type DatasetFieldFormatKind =
  (typeof DATASET_FIELD_FORMAT_KIND_VALUES)[number];

export const datasetFieldDescriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DATASET_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.datasets.field.description.tooLong',
    })
    .optional(),
);

export const datasetFieldRoleSchema = z.preprocess(
  blankToUndefined,
  z
    .enum(DATASET_FIELD_ROLE_VALUES, {
      message: 'validation.datasets.field.role.invalid',
    })
    .optional(),
);

export const datasetFieldAggregationSchema = z.preprocess(
  blankToUndefined,
  z
    .enum(DATASET_FIELD_AGGREGATION_VALUES, {
      message: 'validation.datasets.field.aggregation.invalid',
    })
    .optional(),
);

/**
 * Format hint object. Kept permissive on the numeric / string extras
 * (decimals / currencyCode / dateFormat / thousands) — the FE renders
 * whatever it recognises and ignores the rest. `kind` is the only
 * constrained key.
 */
export const datasetFieldFormatHintSchema = z
  .object({
    kind: z.enum(DATASET_FIELD_FORMAT_KIND_VALUES, {
      message: 'validation.datasets.field.formatHint.kind.invalid',
    }),
    decimals: z.number().int().min(0).max(10).optional(),
    currencyCode: z.string().max(8).optional(),
    dateFormat: z.string().max(64).optional(),
    thousands: z.boolean().optional(),
  })
  .nullable()
  .optional();

export const datasetFieldVisibleSchema = z.boolean().optional();

export const datasetFieldTypeOverrideSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(64, { message: 'validation.datasets.field.typeOverride.tooLong' })
    .optional(),
);

// ── Query parameters ({{name}} tokens) — slice 2 ───────────────────
// Declared on the dataset (Dataset.paramsConfig). Mirrors the entity
// jsonb shape. `options` is a discriminated-ish union of a static list
// OR a query-based source (another dataset's value/label columns).

/** Parameter control types for {{name}} tokens. */
export const DATASET_PARAM_TYPE_VALUES = [
  'text',
  'number',
  'date',
  'daterange',
  'dropdown',
] as const;
export type DatasetParamType = (typeof DATASET_PARAM_TYPE_VALUES)[number];

/** {{name}} tokens are SQL identifiers — same shape the BE tokenizer accepts. */
export const DATASET_PARAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const datasetParamStaticOptionsSchema = z.object({
  static: z.array(z.string()).optional(),
});

const datasetParamQueryOptionsSchema = z.object({
  datasetId: z.string().optional(),
  valueColumn: z.string().optional(),
  labelColumn: z.string().optional(),
});

/** A single declared parameter. */
export const datasetParamSchema = z.object({
  name: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.datasets.param.name.required' })
      .regex(DATASET_PARAM_NAME_PATTERN, {
        message: 'validation.datasets.param.name.invalid',
      }),
  ),
  type: z.enum(DATASET_PARAM_TYPE_VALUES, {
    message: 'validation.datasets.param.type.invalid',
  }),
  label: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  // default / required / options are free-form-ish; the run path binds
  // the value regardless of declared type.
  default: z.any().optional(),
  required: z.boolean().optional(),
  options: z
    .union([datasetParamStaticOptionsSchema, datasetParamQueryOptionsSchema])
    .optional(),
});
export type DatasetParamInput = z.infer<typeof datasetParamSchema>;

/**
 * paramsConfig on add/update dataset. Accepts null / '' to clear.
 * Optional on the wire so a caller that doesn't manage params sends the
 * same payload as before.
 */
export const datasetParamsConfigSchema = z.preprocess(
  (v: unknown) => (v === '' || v === null ? undefined : v),
  z.array(datasetParamSchema).optional(),
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
  paramsConfig: datasetParamsConfigSchema,
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
  paramsConfig: datasetParamsConfigSchema,
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

/**
 * Custom-field formula. Allowed empty on the wire — the controller
 * treats null as "no expression yet" (the formula UI saves drafts).
 * Capped at CUSTOM_LOGIC_MAX so a pathologically long/deep formula
 * cannot hang the per-row JS enrichment engine.
 */
export const customLogicSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DATASET_LIMITS.CUSTOM_LOGIC_MAX, {
      message: 'validation.datasets.field.customLogic.tooLong',
    })
    .optional(),
);

/** Add custom calculated field. */
export const addDatasetFieldSchema = z.object({
  datasetId: datasetIdSchema,
  name: datasetFieldNameSchema,
  customLogic: customLogicSchema,
  dataType: z.preprocess(blankToUndefined, z.string().optional()),
  analysisId: z.preprocess(blankToUndefined, z.string().optional()),
  used_field_ids: z.array(z.string()).optional(),
  // Rich column metadata (slice 1) — all optional + additive.
  description: datasetFieldDescriptionSchema,
  role: datasetFieldRoleSchema,
  defaultAggregation: datasetFieldAggregationSchema,
  formatHint: datasetFieldFormatHintSchema,
  isVisible: datasetFieldVisibleSchema,
  typeOverride: datasetFieldTypeOverrideSchema,
});

/** Update custom calculated field. */
export const updateDatasetFieldSchema = z.object({
  fieldId: datasetIdSchema,
  datasetId: datasetIdSchema,
  columnNameToView: datasetFieldNameSchema,
  used_field_ids: z.array(z.string()).optional(),
  customLogic: customLogicSchema,
  dataType: z.preprocess(blankToUndefined, z.string().optional()),
  justification: datasetJustificationSchema,
  // Rich column metadata (slice 1) — all optional + additive.
  description: datasetFieldDescriptionSchema,
  role: datasetFieldRoleSchema,
  defaultAggregation: datasetFieldAggregationSchema,
  formatHint: datasetFieldFormatHintSchema,
  isVisible: datasetFieldVisibleSchema,
  typeOverride: datasetFieldTypeOverrideSchema,
});

// ── List dataset query schema ──────────────────────────────────────────

import { buildSortZod } from '../utility/listSort';

export const DATASET_LIST_SORT_FIELDS = [
  'name',
  'status',
  'createdOn',
] as const;
export type DatasetListSortField = (typeof DATASET_LIST_SORT_FIELDS)[number];

export const listDatasetSchema = z
  .object({
    connectorId: z
      .string()
      .optional()
      .or(z.literal(null).transform(() => undefined)),
    page: z.coerce
      .number({ message: 'validation.datasets.page.invalid' })
      .int()
      .min(1, { message: 'validation.datasets.page.invalid' })
      .optional(),
    limit: z.coerce
      .number({ message: 'validation.datasets.limit.invalid' })
      .int()
      .min(1, { message: 'validation.datasets.limit.invalid' })
      .max(1000, { message: 'validation.datasets.limit.tooLarge' })
      .optional(),
    filter: z.string().optional(),
    sort: buildSortZod(DATASET_LIST_SORT_FIELDS),
  })
  .strict();
