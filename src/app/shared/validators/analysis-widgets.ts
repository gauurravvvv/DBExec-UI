/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/analysis-widgets.ts
 *   FE: src/app/shared/validators/analysis-widgets.ts
 *
 * See organisation.ts / analyses.ts for the convention overview.
 *
 * Single source of truth for the analysis-widget surface (Dashboard &
 * Analysis v2, Track E3): add / update / delete a non-visual content
 * block (rich-text note or KPI metric) on an analysis. Both the FE
 * widget editor and the BE zodValidate middleware consume these schemas
 * so the contract can never drift between client and server.
 *
 * Validation messages are i18n KEYS (`validation.analysisWidgets.*`),
 * resolved by the locale layer — never literal strings.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Limits / allowed values ────────────────────────────────────────

export const WIDGET_LIMITS = {
  LABEL_MAX: 255,
  MARKDOWN_MAX: 20000,
  MEASURE_MAX: 255,
  FORMAT_MAX: 64,
  COMPARE_PERIOD_MAX: 64,
  JUSTIFICATION_MAX: 500,
} as const;

/** Widget kinds the BE controller branches on. */
export const WIDGET_TYPE_VALUES = ['text', 'kpi'] as const;
export type WidgetType = (typeof WIDGET_TYPE_VALUES)[number];

/** KPI aggregate functions. */
export const WIDGET_AGGREGATE_VALUES = [
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_distinct',
] as const;
export type WidgetAggregate = (typeof WIDGET_AGGREGATE_VALUES)[number];

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
  z.preprocess(
    trimOrUndefined,
    z.string({ message: msg }).min(1, { message: msg }),
  );

// ── Shared field schemas ───────────────────────────────────────────

export const widgetTypeSchema = z.preprocess(
  trimOrUndefined,
  z.enum(WIDGET_TYPE_VALUES, {
    message: 'validation.analysisWidgets.type.invalid',
  }),
);

/** Ratio strings ("0", "0.5", …) — stored verbatim, so keep loose. */
const ratioSchema = z.preprocess(
  blankToUndefined,
  z.string().max(32, { message: 'validation.analysisWidgets.ratio.invalid' }),
);

const sequenceSchema = z
  .number()
  .int({ message: 'validation.analysisWidgets.sequence.invalid' })
  .min(0, { message: 'validation.analysisWidgets.sequence.invalid' });

export const widgetJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(WIDGET_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.analysisWidgets.justification.tooLong',
    })
    .optional(),
);

// ── Config schemas (per widgetType) ─────────────────────────────────

/** text widget → { markdown } */
export const textWidgetConfigSchema = z.object({
  markdown: z.preprocess(
    blankToUndefined,
    z
      .string({ message: 'validation.analysisWidgets.text.markdown.required' })
      .min(1, {
        message: 'validation.analysisWidgets.text.markdown.required',
      })
      .max(WIDGET_LIMITS.MARKDOWN_MAX, {
        message: 'validation.analysisWidgets.text.markdown.tooLong',
      }),
  ),
});

/**
 * kpi widget → { measure, aggregate, label, format, comparePeriod?,
 * targetValue? }
 */
export const kpiWidgetConfigSchema = z.object({
  measure: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.analysisWidgets.kpi.measure.required' })
      .min(1, {
        message: 'validation.analysisWidgets.kpi.measure.required',
      })
      .max(WIDGET_LIMITS.MEASURE_MAX, {
        message: 'validation.analysisWidgets.kpi.measure.tooLong',
      }),
  ),
  aggregate: z.preprocess(
    trimOrUndefined,
    z.enum(WIDGET_AGGREGATE_VALUES, {
      message: 'validation.analysisWidgets.kpi.aggregate.invalid',
    }),
  ),
  label: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.analysisWidgets.kpi.label.required' })
      .min(1, { message: 'validation.analysisWidgets.kpi.label.required' })
      .max(WIDGET_LIMITS.LABEL_MAX, {
        message: 'validation.analysisWidgets.kpi.label.tooLong',
      }),
  ),
  format: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.analysisWidgets.kpi.format.required' })
      .min(1, { message: 'validation.analysisWidgets.kpi.format.required' })
      .max(WIDGET_LIMITS.FORMAT_MAX, {
        message: 'validation.analysisWidgets.kpi.format.tooLong',
      }),
  ),
  comparePeriod: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(WIDGET_LIMITS.COMPARE_PERIOD_MAX, {
        message: 'validation.analysisWidgets.kpi.comparePeriod.tooLong',
      })
      .optional(),
  ),
  targetValue: z
    .number({ message: 'validation.analysisWidgets.kpi.targetValue.invalid' })
    .optional(),
});

// ── Composite layout fields (shared by add + update) ────────────────

const layoutFields = {
  tabId: idSchema('validation.analysisWidgets.tabId.required').optional(),
  widthRatio: ratioSchema.optional(),
  heightRatio: ratioSchema.optional(),
  xRatio: ratioSchema.optional(),
  yRatio: ratioSchema.optional(),
  sequence: sequenceSchema.optional(),
};

// ── Add ─────────────────────────────────────────────────────────────

/**
 * Discriminated on `widgetType` so `config` is validated against the
 * right shape: a `text` widget must carry `{ markdown }`, a `kpi`
 * widget must carry the KPI config. This is stricter than a free-form
 * `z.record` and catches malformed widgets at the gate.
 */
const addTextWidgetSchema = z.object({
  analysisId: idSchema('validation.analysisWidgets.analysisId.required'),
  widgetType: z.literal('text'),
  config: textWidgetConfigSchema,
  ...layoutFields,
});

const addKpiWidgetSchema = z.object({
  analysisId: idSchema('validation.analysisWidgets.analysisId.required'),
  widgetType: z.literal('kpi'),
  config: kpiWidgetConfigSchema,
  ...layoutFields,
});

export const addAnalysisWidgetSchema = z.discriminatedUnion('widgetType', [
  addTextWidgetSchema,
  addKpiWidgetSchema,
]);
export type AddAnalysisWidgetInput = z.infer<typeof addAnalysisWidgetSchema>;

// ── Update ──────────────────────────────────────────────────────────

/**
 * PATCH semantics — every field optional; the controller applies only
 * the fields present. `config` is intentionally a loose record here:
 * partial config edits (e.g. bumping just `targetValue`) shouldn't be
 * forced to resend the whole typed shape. The controller merges into
 * the existing config, and a full re-validation of a specific shape
 * only happens on add / a full replace via widgetType change.
 */
export const updateAnalysisWidgetSchema = z.object({
  id: idSchema('validation.analysisWidgets.id.required'),
  widgetType: widgetTypeSchema.optional(),
  config: z.record(z.string(), z.any()).optional(),
  ...layoutFields,
  justification: widgetJustificationSchema,
});
export type UpdateAnalysisWidgetInput = z.infer<
  typeof updateAnalysisWidgetSchema
>;
