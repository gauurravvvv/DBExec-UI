/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/analysis-parameters.ts
 *   FE: src/app/shared/validators/analysis-parameters.ts
 *
 * Single source of truth for the analysis-parameter surface: create /
 * update / delete a typed reusable input. Both the FE parameter editor and
 * the BE zodValidate middleware consume these schemas so the contract can
 * never drift between client and server.
 *
 * The parameter `key` is the identifier substituted into dataset SQL as
 * `{{param.<key>}}`, so it is held to the same `VALID_IDENTIFIER` shape the
 * filter engine enforces — a key can never carry SQL metacharacters.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Enums / limits / patterns ──────────────────────────────────────

/** Parameter value type — drives the FE control pick + run-time coercion. */
export const PARAMETER_DATA_TYPES = [
  'string',
  'number',
  'date',
  'boolean',
  'enum',
] as const;
export type ParameterDataType = (typeof PARAMETER_DATA_TYPES)[number];

export const PARAMETER_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 150,
  KEY_MIN: 1,
  KEY_MAX: 100,
  BIND_COLUMN_MAX: 255,
  MAX_ALLOWED_VALUES: 500,
  JUSTIFICATION_MAX: 500,
} as const;

/** Display name — same shape family as analysis / filter names. */
export const PARAMETER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/**
 * Key / bindColumn identifier shape — identical to the filter engine's
 * `VALID_IDENTIFIER`. The key lands in `{{param.<key>}}` and bindColumn is a
 * raw dataset column, so both must be plain identifiers.
 */
export const PARAMETER_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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

const idSchema = (msg: string) =>
  z.string({ message: msg }).uuid({ message: msg });

// ── Field schemas ──────────────────────────────────────────────────

export const parameterNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.parameters.name.required' })
    .min(PARAMETER_LIMITS.NAME_MIN, {
      message: 'validation.parameters.name.required',
    })
    .max(PARAMETER_LIMITS.NAME_MAX, {
      message: 'validation.parameters.name.tooLong',
    })
    .regex(PARAMETER_NAME_PATTERN, {
      message: 'validation.parameters.name.invalid',
    }),
);

export const parameterKeySchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.parameters.key.required' })
    .min(PARAMETER_LIMITS.KEY_MIN, {
      message: 'validation.parameters.key.required',
    })
    .max(PARAMETER_LIMITS.KEY_MAX, {
      message: 'validation.parameters.key.tooLong',
    })
    .regex(PARAMETER_KEY_PATTERN, {
      message: 'validation.parameters.key.invalid',
    }),
);

export const parameterDataTypeSchema = z.preprocess(
  trimOrUndefined,
  z.enum(PARAMETER_DATA_TYPES, {
    message: 'validation.parameters.dataType.invalid',
  }),
);

export const parameterBindColumnSchema = z
  .preprocess(
    blankToUndefined,
    z
      .string()
      .max(PARAMETER_LIMITS.BIND_COLUMN_MAX, {
        message: 'validation.parameters.bindColumn.tooLong',
      })
      .regex(PARAMETER_KEY_PATTERN, {
        message: 'validation.parameters.bindColumn.invalid',
      }),
  )
  .nullable()
  .optional();

const allowedValuesSchema = z
  .array(z.any())
  .max(PARAMETER_LIMITS.MAX_ALLOWED_VALUES, {
    message: 'validation.parameters.allowedValues.tooMany',
  });

export const parameterJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(PARAMETER_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.parameters.justification.tooLong',
    })
    .optional(),
);

/**
 * Enforce enum ↔ allowedValues coherence: an `enum` parameter must ship a
 * non-empty allowedValues list; a non-enum parameter must not. Applied to both
 * create + update via `.superRefine`. `allowedValues === undefined` on update
 * means "not being changed" and is left alone.
 */
const refineEnumAllowedValues = (
  data: { dataType?: string; allowedValues?: unknown[] },
  ctx: z.RefinementCtx,
): void => {
  if (data.dataType === undefined) return; // update: type unchanged
  if (data.dataType === 'enum') {
    if (data.allowedValues !== undefined && data.allowedValues.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedValues'],
        message: 'validation.parameters.allowedValues.enumRequired',
      });
    }
  } else if (data.allowedValues !== undefined && data.allowedValues.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allowedValues'],
      message: 'validation.parameters.allowedValues.nonEnumEmpty',
    });
  }
};

// ── Payload schemas ────────────────────────────────────────────────

/**
 * Create a parameter. `analysisId` scopes it; the BE re-verifies the analysis
 * exists org-scoped and derives org fields. defaultValue is any JSON scalar
 * (its type coherence with dataType is coerced at run time, not enforced here —
 * a string default for a number param is tolerated and cast).
 */
export const addAnalysisParameterSchema = z
  .object({
    analysisId: idSchema('validation.parameters.analysisId.required'),
    name: parameterNameSchema,
    key: parameterKeySchema,
    dataType: parameterDataTypeSchema,
    defaultValue: z.any().optional(),
    allowedValues: allowedValuesSchema.optional().default([]),
    bindColumn: parameterBindColumnSchema,
    isRequired: z.boolean().optional().default(false),
    sequence: z
      .number()
      .int({ message: 'validation.parameters.sequence.invalid' })
      .min(0, { message: 'validation.parameters.sequence.invalid' })
      .optional(),
  })
  .superRefine(refineEnumAllowedValues);
export type AddAnalysisParameterInput = z.infer<
  typeof addAnalysisParameterSchema
>;

/**
 * Update a parameter. PATCH semantics — every domain field optional; `id`
 * comes from the `:parameterId` path param (copied in by idFromParam).
 */
export const updateAnalysisParameterSchema = z
  .object({
    id: idSchema('validation.parameters.id.required'),
    name: parameterNameSchema.optional(),
    key: parameterKeySchema.optional(),
    dataType: parameterDataTypeSchema.optional(),
    defaultValue: z.any().optional(),
    allowedValues: allowedValuesSchema.optional(),
    bindColumn: parameterBindColumnSchema,
    isRequired: z.boolean().optional(),
    sequence: z
      .number()
      .int({ message: 'validation.parameters.sequence.invalid' })
      .min(0, { message: 'validation.parameters.sequence.invalid' })
      .optional(),
    justification: parameterJustificationSchema,
  })
  .superRefine(refineEnumAllowedValues);
export type UpdateAnalysisParameterInput = z.infer<
  typeof updateAnalysisParameterSchema
>;
