/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/visuals.ts
 *   FE: src/app/shared/validators/visuals.ts
 *
 * Single source of truth for the visual builder write surface:
 * create / update / delete / reorder a chart (Visual + its 1:1
 * VisualConfig). Both the FE builder sidebars and the BE zodValidate
 * middleware consume these schemas so the create/update contract can
 * never drift between client and server.
 *
 * The read endpoints (GET /visuals/:analysisId) are unvalidated body-wise
 * (their only input is a path param) so they are not covered here.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Limits / patterns ──────────────────────────────────────────────

export const VISUAL_LIMITS = {
  TITLE_MIN: 1,
  TITLE_MAX: 150,
  COLUMN_NAME_MAX: 255,
  CHART_TYPE_MAX: 60,
  MAX_REORDER_ITEMS: 500,
} as const;

/**
 * Axis columns are raw dataset/derived column identifiers. They land in
 * ECharts encodings and (for some chart types) may be echoed into SQL by
 * downstream aggregation, so hold them to the same identifier shape the
 * filter engine enforces (`VALID_IDENTIFIER`). Nullable — many chart
 * types (pie, gauge, single-value) bind neither axis, and the config blob
 * carries the real encoding.
 */
export const VISUAL_COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Grid ratio — a stringified 0..1 float. Stored as string on the entity to
 * preserve FE precision; validated here as a numeric-looking string within
 * range so a malformed ratio can't slip into the layout math.
 */
export const RATIO_PATTERN = /^(0(\.\d+)?|1(\.0+)?)$/;

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

export const visualTitleSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.visuals.title.required' })
    .min(VISUAL_LIMITS.TITLE_MIN, { message: 'validation.visuals.title.required' })
    .max(VISUAL_LIMITS.TITLE_MAX, { message: 'validation.visuals.title.tooLong' }),
);

export const chartTypeSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.visuals.chartType.required' })
    .min(1, { message: 'validation.visuals.chartType.required' })
    .max(VISUAL_LIMITS.CHART_TYPE_MAX, {
      message: 'validation.visuals.chartType.tooLong',
    }),
);

/** Nullable axis column — absent / blank collapses to undefined (→ stored null). */
export const axisColumnSchema = z
  .preprocess(
    blankToUndefined,
    z
      .string()
      .max(VISUAL_LIMITS.COLUMN_NAME_MAX, {
        message: 'validation.visuals.axis.tooLong',
      })
      .regex(VISUAL_COLUMN_PATTERN, {
        message: 'validation.visuals.axis.invalid',
      }),
  )
  .optional();

const ratioSchema = z
  .preprocess(
    v => (typeof v === 'number' ? String(v) : v),
    z
      .string({ message: 'validation.visuals.ratio.invalid' })
      .regex(RATIO_PATTERN, { message: 'validation.visuals.ratio.invalid' }),
  )
  .optional();

const idSchema = (msg: string) =>
  z.string({ message: msg }).uuid({ message: msg });

// ── Server-side aggregation encoding (Track D) ──────────────────────

/** Aggregate functions supported by buildAggregationWrap. */
export const AGGREGATE_VALUES = [
  'sum',
  'avg',
  'count',
  'min',
  'max',
  'count_distinct',
] as const;
export type AggregateFn = (typeof AGGREGATE_VALUES)[number];

/** Optional aggregate — blank / null collapses to undefined (→ stored null). */
const aggregateSchema = z
  .preprocess(
    blankToUndefined,
    z.enum(AGGREGATE_VALUES, {
      message: 'validation.visuals.aggregate.invalid',
    }),
  )
  .nullable()
  .optional();

/** dimension / measure columns — same identifier shape as axis columns. */
const aggregationColumnSchema = z
  .preprocess(
    blankToUndefined,
    z
      .string()
      .max(VISUAL_LIMITS.COLUMN_NAME_MAX, {
        message: 'validation.visuals.axis.tooLong',
      })
      .regex(VISUAL_COLUMN_PATTERN, {
        message: 'validation.visuals.axis.invalid',
      }),
  )
  .nullable()
  .optional();

/**
 * Config blob — 40+ ECharts tunables. Shape is owned by the FE chart layer;
 * we only guarantee it is an object so the JSONB column never receives a
 * scalar / array that would break the config reader.
 */
const configSchema = z
  .record(z.string(), z.any())
  .refine(v => v !== null && typeof v === 'object' && !Array.isArray(v), {
    message: 'validation.visuals.config.invalid',
  });

// ── Payload schemas ────────────────────────────────────────────────

/**
 * Create a visual. `analysisId` scopes it; `datasetId` / `datasourceId` are
 * re-derived from the parent analysis on the BE (never trusted from the body)
 * but accepted here for a symmetric contract with update. The grid ratios are
 * optional — the builder may drop a chart with a default placement and let the
 * layout engine assign a slot.
 */
export const addVisualSchema = z.object({
  analysisId: idSchema('validation.visuals.analysisId.required'),
  title: visualTitleSchema,
  chartType: chartTypeSchema,
  xAxisColumn: axisColumnSchema,
  yAxisColumn: axisColumnSchema,
  config: configSchema.optional().default({}),
  // Track D: server-side aggregation encoding. dimensionColumn/measureColumn
  // default to xAxisColumn/yAxisColumn on the BE when unset; null aggregate =
  // no server aggregation (raw rows, back-compat). Multi-measure combos live
  // in config.aggregations[] (part of the free-form config blob).
  dimensionColumn: aggregationColumnSchema,
  measureColumn: aggregationColumnSchema,
  aggregate: aggregateSchema,
  widthRatio: ratioSchema,
  heightRatio: ratioSchema,
  xRatio: ratioSchema,
  yRatio: ratioSchema,
  sequence: z
    .number()
    .int({ message: 'validation.visuals.sequence.invalid' })
    .min(0, { message: 'validation.visuals.sequence.invalid' })
    .optional(),
});
export type AddVisualInput = z.infer<typeof addVisualSchema>;

/**
 * Update a visual. PATCH semantics — every field optional; `id` from the
 * `:visualId` path param (copied in by idFromParam). Only present keys are
 * applied by the controller so a partial save leaves untouched fields intact.
 */
export const updateVisualSchema = z.object({
  id: idSchema('validation.visuals.id.required'),
  title: visualTitleSchema.optional(),
  chartType: chartTypeSchema.optional(),
  xAxisColumn: axisColumnSchema,
  yAxisColumn: axisColumnSchema,
  config: configSchema.optional(),
  // Track D: server-side aggregation encoding (all optional on update).
  dimensionColumn: aggregationColumnSchema,
  measureColumn: aggregationColumnSchema,
  aggregate: aggregateSchema,
  widthRatio: ratioSchema,
  heightRatio: ratioSchema,
  xRatio: ratioSchema,
  yRatio: ratioSchema,
  sequence: z
    .number()
    .int({ message: 'validation.visuals.sequence.invalid' })
    .min(0, { message: 'validation.visuals.sequence.invalid' })
    .optional(),
});
export type UpdateVisualInput = z.infer<typeof updateVisualSchema>;

/**
 * Reorder — an ordered list of { id, sequence } assignments applied in one
 * transaction. The FE sends the full new ordering after a drag; the BE
 * verifies every id belongs to the analysis before persisting so a foreign
 * visual id can't be smuggled in to bump another analysis's sequence.
 */
export const reorderVisualsSchema = z.object({
  analysisId: idSchema('validation.visuals.analysisId.required'),
  order: z
    .array(
      z.object({
        id: idSchema('validation.visuals.id.required'),
        sequence: z
          .number()
          .int({ message: 'validation.visuals.sequence.invalid' })
          .min(0, { message: 'validation.visuals.sequence.invalid' }),
      }),
    )
    .min(1, { message: 'validation.visuals.reorder.atLeastOne' })
    .max(VISUAL_LIMITS.MAX_REORDER_ITEMS, {
      message: 'validation.visuals.reorder.tooMany',
    }),
});
export type ReorderVisualsInput = z.infer<typeof reorderVisualsSchema>;
