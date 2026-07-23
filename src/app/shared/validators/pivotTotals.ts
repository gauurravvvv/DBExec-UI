/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/pivotTotals.ts
 *   FE: src/app/shared/validators/pivotTotals.ts
 *
 * Pivot totals / subtotals config (Feature B). This is the shape a
 * table / pivot visual sends on an analysis-run request to ask the server
 * to append grand-total and per-group subtotal rows. It lives in its OWN
 * file (not the analyses validator) so it can be composed into whichever
 * run-request schema needs it without a cross-slice edit; the analyses
 * run-request schema can `.extend({ pivotTotals: pivotTotalsConfigSchema })`
 * when integrated.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** Result-row keys are SQL-ish identifiers / aliases. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const PIVOT_AGGREGATE_VALUES = [
  'sum',
  'count',
  'count_distinct',
  'countDistinct',
  'min',
  'max',
  'avg',
] as const;
export type PivotAggregateValue = (typeof PIVOT_AGGREGATE_VALUES)[number];

const keySchema = z
  .string({ message: 'validation.pivotTotals.key.required' })
  .regex(KEY_PATTERN, { message: 'validation.pivotTotals.key.invalid' });

/** One measure column to total, with the aggregate it was produced with. */
export const pivotMeasureConfigSchema = z.object({
  key: keySchema,
  aggregate: z.enum(PIVOT_AGGREGATE_VALUES, {
    message: 'validation.pivotTotals.aggregate.invalid',
  }),
  // Required only for a correct weighted AVG total; optional otherwise.
  countKey: z
    .string()
    .regex(KEY_PATTERN, { message: 'validation.pivotTotals.countKey.invalid' })
    .optional(),
});
export type PivotMeasureConfigInput = z.infer<typeof pivotMeasureConfigSchema>;

/** The totals config a pivot/table visual attaches to a run request. */
export const pivotTotalsConfigSchema = z.object({
  grandTotal: z.boolean().optional(),
  subtotals: z.boolean().optional(),
  dimensionKeys: z
    .array(keySchema, {
      message: 'validation.pivotTotals.dimensionKeys.required',
    })
    .min(1, { message: 'validation.pivotTotals.dimensionKeys.required' })
    .max(16, { message: 'validation.pivotTotals.dimensionKeys.tooMany' }),
  measures: z
    .array(pivotMeasureConfigSchema, {
      message: 'validation.pivotTotals.measures.required',
    })
    .min(1, { message: 'validation.pivotTotals.measures.required' })
    .max(64, { message: 'validation.pivotTotals.measures.tooMany' }),
  grandTotalLabel: z.string().max(64).optional(),
  subtotalLabel: z.string().max(64).optional(),
  rowTypeKey: z.string().max(64).optional(),
});
export type PivotTotalsConfigInput = z.infer<typeof pivotTotalsConfigSchema>;
