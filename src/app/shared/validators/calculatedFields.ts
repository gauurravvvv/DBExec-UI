/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/calculatedFields.ts
 *   FE: src/app/shared/validators/calculatedFields.ts
 *
 * See datasets.ts / organisation.ts for the convention overview.
 *
 * Covers the calculated-field (derived formula column) forms:
 *   - Add calculated field
 *   - Update calculated field
 *   - Validate formula (no persistence)
 *
 * The `expression` is only shape-checked here (present, within a sane
 * length). The heavy lifting — parsing the formula against the safe
 * whitelist and rejecting anything dangerous — happens server-side in the
 * controller via compileCalculatedFieldExpression(); it cannot be done in
 * Zod because it needs the dataset's known column list.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** Calculated-field alias — VALID_IDENTIFIER shape (letters/digits/_). */
export const CALC_FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Declared result data types. */
export const CALC_FIELD_DATA_TYPE_VALUES = [
  'numeric',
  'text',
  'date',
  'boolean',
] as const;
export type CalcFieldDataType = (typeof CALC_FIELD_DATA_TYPE_VALUES)[number];

export const CALC_FIELD_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 128,
  EXPRESSION_MIN: 1,
  EXPRESSION_MAX: 4000,
} as const;

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

export const calcFieldNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.calculatedFields.name.required' })
    .min(CALC_FIELD_LIMITS.NAME_MIN, {
      message: 'validation.calculatedFields.name.required',
    })
    .max(CALC_FIELD_LIMITS.NAME_MAX, {
      message: 'validation.calculatedFields.name.tooLong',
    })
    .regex(CALC_FIELD_NAME_PATTERN, {
      message: 'validation.calculatedFields.name.invalid',
    }),
);

export const calcFieldExpressionSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.calculatedFields.expression.required' })
    .min(CALC_FIELD_LIMITS.EXPRESSION_MIN, {
      message: 'validation.calculatedFields.expression.required',
    })
    .max(CALC_FIELD_LIMITS.EXPRESSION_MAX, {
      message: 'validation.calculatedFields.expression.tooLong',
    }),
);

export const calcFieldDataTypeSchema = z.preprocess(
  blankToUndefined,
  z
    .enum(CALC_FIELD_DATA_TYPE_VALUES, {
      message: 'validation.calculatedFields.dataType.invalid',
    })
    .optional(),
);

export const calcFieldDatasetIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.calculatedFields.datasetId.required' })
    .min(1, { message: 'validation.calculatedFields.datasetId.required' }),
);

export const calcFieldIdSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.calculatedFields.id.required' })
    .min(1, { message: 'validation.calculatedFields.id.required' }),
);

/** Add a calculated field. */
export const addCalculatedFieldSchema = z.object({
  datasetId: calcFieldDatasetIdSchema,
  name: calcFieldNameSchema,
  expression: calcFieldExpressionSchema,
  dataType: calcFieldDataTypeSchema,
});
export type AddCalculatedFieldInput = z.infer<typeof addCalculatedFieldSchema>;

/** Update a calculated field. */
export const updateCalculatedFieldSchema = z.object({
  id: calcFieldIdSchema,
  datasetId: calcFieldDatasetIdSchema,
  name: calcFieldNameSchema,
  expression: calcFieldExpressionSchema,
  dataType: calcFieldDataTypeSchema,
});
export type UpdateCalculatedFieldInput = z.infer<
  typeof updateCalculatedFieldSchema
>;

/** Validate a formula without persisting it (preview). */
export const validateCalculatedFieldSchema = z.object({
  datasetId: calcFieldDatasetIdSchema,
  expression: calcFieldExpressionSchema,
});
export type ValidateCalculatedFieldInput = z.infer<
  typeof validateCalculatedFieldSchema
>;
