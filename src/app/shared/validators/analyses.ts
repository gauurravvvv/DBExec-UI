/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/analyses.ts
 *   FE: src/app/shared/validators/analyses.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Covers every form on the analysis surface:
 *   - Save / Edit analysis (top-level metadata)
 *   - Add / Update analysis filter (the right-side filter bar)
 *   - Add / Update RLS rule (row-level security on a dataset)
 *   - Publish dashboard (snapshot the analysis)
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { pivotTotalsConfigSchema } from './pivotTotals';

// ── Standard patterns ──────────────────────────────────────────────

/** Display-name shape — same as orgName / groupName / datasetName. */
export const ANALYSIS_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

export const ANALYSIS_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 100,
  DESCRIPTION_MAX: 500,
  JUSTIFICATION_MAX: 500,
  COLUMN_NAME_MAX: 255,
  DASHBOARD_NAME_MAX: 255,
} as const;

/** Allowed filter types (BE controller branches on these). */
export const FILTER_TYPE_VALUES = [
  'category',
  'numeric_equality',
  'numeric_range',
  'time_equality',
  'time_range',
] as const;
export type FilterType = (typeof FILTER_TYPE_VALUES)[number];

/** Allowed FE control types for a filter. */
export const FILTER_CONTROL_VALUES = [
  'dropdown',
  'list',
  'slider',
  'text',
  'textarea',
  'datepicker',
] as const;
export type FilterControl = (typeof FILTER_CONTROL_VALUES)[number];

/** Allowed null-handling options on a filter. */
export const FILTER_NULL_OPTION_VALUES = [
  'ALL_VALUES',
  'NULLS_ONLY',
  'NON_NULLS_ONLY',
] as const;

/** Filter scope (Track B) — which visuals a filter re-runs when applied. */
export const FILTER_SCOPE_VALUES = ['dashboard', 'tab', 'visual'] as const;
export type FilterScope = (typeof FILTER_SCOPE_VALUES)[number];

/**
 * Relative-date presets for a time filter (Slice D). The preset name is
 * persisted in the filter's `config.relativePreset`; the BE resolves it
 * to concrete dates at query time (see relativeDateRange.ts). 'custom'
 * means "use the explicit start/end the user picked" — no resolution.
 * Kept in lock-step with `RelativeDatePreset` in
 * shared/utility/relativeDateRange.ts.
 */
export const RELATIVE_DATE_PRESET_VALUES = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'wtd',
  'mtd',
  'qtd',
  'ytd',
  'previous_week',
  'previous_month',
  'previous_quarter',
  'previous_year',
  'custom',
] as const;
export type RelativeDatePresetValue =
  (typeof RELATIVE_DATE_PRESET_VALUES)[number];

/** RLS rule subject scope. */
export const RLS_SCOPE_VALUES = ['user', 'group'] as const;
export type RlsScope = (typeof RLS_SCOPE_VALUES)[number];

/** RLS rule operator. */
export const RLS_OPERATOR_VALUES = [
  'IN',
  'NOT_IN',
  'EQUALS',
  'BETWEEN',
] as const;
export type RlsOperator = (typeof RLS_OPERATOR_VALUES)[number];

/**
 * RLS security kind. `row` filters which rows a subject sees (WHERE
 * predicates); `column` hides / masks which columns a subject sees.
 */
export const RLS_SECURITY_TYPE_VALUES = ['row', 'column'] as const;
export type RlsSecurityType = (typeof RLS_SECURITY_TYPE_VALUES)[number];

/**
 * Column-masking strategy for `securityType='column'` rules.
 * - `hide`   → drop the column key from every result row.
 * - `null`   → keep the key but replace the value with null.
 * - `redact` → replace the value with `maskValue` (default '***').
 */
export const RLS_MASK_STRATEGY_VALUES = ['hide', 'null', 'redact'] as const;
export type RlsMaskStrategy = (typeof RLS_MASK_STRATEGY_VALUES)[number];

/** Publish-dashboard mode. */
export const DASHBOARD_PUBLISH_MODES = ['new', 'existing'] as const;
export type DashboardPublishMode = (typeof DASHBOARD_PUBLISH_MODES)[number];

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

export const analysisNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.name.required' })
    .min(ANALYSIS_LIMITS.NAME_MIN, {
      message: 'validation.analyses.name.tooShort',
    })
    .max(ANALYSIS_LIMITS.NAME_MAX, {
      message: 'validation.analyses.name.tooLong',
    })
    .regex(ANALYSIS_NAME_PATTERN, {
      message: 'validation.analyses.name.invalid',
    }),
);

export const analysisDescriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(ANALYSIS_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.analyses.description.tooLong',
    })
    .optional(),
);

export const analysisJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(ANALYSIS_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.analyses.justification.tooLong',
    })
    .optional(),
);

const idSchema = (msg: string) =>
  z.preprocess(
    trimOrUndefined,
    z
      .string({ message: msg })
      .min(1, { message: msg }),
  );

export const analysisIdSchema = idSchema('validation.analyses.id.required');
export const analysisDatasourceSchema = idSchema(
  'validation.analyses.datasource.required',
);
export const analysisDatasetSchema = idSchema(
  'validation.analyses.dataset.required',
);

const statusSchema = z.union([z.literal(0), z.literal(1)]).optional();

// ── Filter field / composite schemas ───────────────────────────────

export const filterNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.filter.name.required' })
    .min(1, { message: 'validation.analyses.filter.name.required' })
    .max(ANALYSIS_LIMITS.NAME_MAX, {
      message: 'validation.analyses.filter.name.tooLong',
    }),
);

export const filterColumnSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.filter.column.required' })
    .min(1, { message: 'validation.analyses.filter.column.required' })
    .max(ANALYSIS_LIMITS.COLUMN_NAME_MAX, {
      message: 'validation.analyses.filter.column.tooLong',
    }),
);

/**
 * Scoped-filter fields (Track B). scope='tab' requires targetTabId; scope=
 * 'visual' requires a non-empty targetVisualIds. Enforced by
 * refineFilterScope, applied to both the create + update shapes.
 */
export const filterScopeSchema = z
  .preprocess(
    blankToUndefined,
    z.enum(FILTER_SCOPE_VALUES, {
      message: 'validation.analyses.filter.scope.invalid',
    }),
  )
  .optional()
  .default('dashboard');

const filterTargetTabIdSchema = z
  .preprocess(
    blankToUndefined,
    z.string().uuid({ message: 'validation.analyses.filter.targetTabId.invalid' }),
  )
  .nullable()
  .optional();

const filterTargetVisualIdsSchema = z
  .array(
    z.string().uuid({
      message: 'validation.analyses.filter.targetVisualIds.invalid',
    }),
  )
  .nullable()
  .optional();

const refineFilterScope = (
  data: {
    scope?: string;
    targetTabId?: string | null;
    targetVisualIds?: string[] | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (data.scope === undefined) return; // update: scope unchanged
  if (data.scope === 'tab') {
    if (!data.targetTabId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetTabId'],
        message: 'validation.analyses.filter.targetTabId.required',
      });
    }
  } else if (data.scope === 'visual') {
    if (!Array.isArray(data.targetVisualIds) || data.targetVisualIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetVisualIds'],
        message: 'validation.analyses.filter.targetVisualIds.required',
      });
    }
  }
};

/**
 * Filter UI config (JSONB). Historically free-form; Slice D introduces
 * three fields the BE now reads, so those are validated while every
 * other key still passes through untouched (the visual layer owns the
 * rest of the shape). `.passthrough()` keeps unknown keys; only the
 * typed fields are constrained:
 *
 *   categoryValues     — curated allow-list for a category filter. When
 *                        set, the applied selection is intersected with
 *                        it at run time (out-of-list values are denied).
 *                        Accepts string | number entries.
 *   relativePreset     — a time filter's relative-date preset. The BE
 *                        resolves it server-side at query time.
 *   dependsOnFilterId  — parent filter id for a cascading (linked)
 *                        filter. The child's option list is narrowed by
 *                        the parent's selection.
 */
const filterConfigSchema = z
  .object({
    categoryValues: z
      .array(z.union([z.string(), z.number()]), {
        message: 'validation.analyses.filter.categoryValues.invalid',
      })
      .optional(),
    relativePreset: z
      .enum(RELATIVE_DATE_PRESET_VALUES, {
        message: 'validation.analyses.filter.relativePreset.invalid',
      })
      .optional(),
    dependsOnFilterId: z
      .string({ message: 'validation.analyses.filter.dependsOnFilterId.invalid' })
      .uuid({ message: 'validation.analyses.filter.dependsOnFilterId.invalid' })
      .optional(),
  })
  .passthrough();

const filterShape = z
  .object({
    name: filterNameSchema,
    filterType: z.preprocess(
      trimOrUndefined,
      z.enum(FILTER_TYPE_VALUES, {
        message: 'validation.analyses.filter.type.invalid',
      }),
    ),
    columnName: filterColumnSchema,
    controlType: z.preprocess(
      trimOrUndefined,
      z.enum(FILTER_CONTROL_VALUES, {
        message: 'validation.analyses.filter.control.invalid',
      }),
    ),
    // Filter UI config — Slice-D fields validated, rest passes through.
    config: filterConfigSchema.optional().default({}),
    nullOption: z
      .preprocess(
        blankToUndefined,
        z.enum(FILTER_NULL_OPTION_VALUES, {
          message: 'validation.analyses.filter.null.invalid',
        }),
      )
      .optional()
      .default('ALL_VALUES'),
    isEnabled: z.boolean().optional().default(true),
    isMandatory: z.boolean().optional().default(false),
    // Track B: scoped-filter targeting.
    scope: filterScopeSchema,
    targetTabId: filterTargetTabIdSchema,
    targetVisualIds: filterTargetVisualIdsSchema,
    sequence: z
      .number()
      .int({ message: 'validation.analyses.filter.sequence.invalid' })
      .min(0, { message: 'validation.analyses.filter.sequence.invalid' })
      .optional()
      .default(0),
  })
  .superRefine(refineFilterScope);

export const addAnalysisFilterSchema = z.object({
  analysisId: idSchema('validation.analyses.id.required'),
  filters: z.array(filterShape).min(1, {
    message: 'validation.analyses.filter.atLeastOne',
  }),
});

export const updateAnalysisFilterSchema = z
  .object({
    id: idSchema('validation.analyses.filter.id.required'),
    name: filterNameSchema.optional(),
    filterType: z
      .preprocess(
        trimOrUndefined,
        z.enum(FILTER_TYPE_VALUES, {
          message: 'validation.analyses.filter.type.invalid',
        }),
      )
      .optional(),
    columnName: filterColumnSchema.optional(),
    controlType: z
      .preprocess(
        trimOrUndefined,
        z.enum(FILTER_CONTROL_VALUES, {
          message: 'validation.analyses.filter.control.invalid',
        }),
      )
      .optional(),
    config: filterConfigSchema.optional(),
    nullOption: z
      .preprocess(
        blankToUndefined,
        z.enum(FILTER_NULL_OPTION_VALUES, {
          message: 'validation.analyses.filter.null.invalid',
        }),
      )
      .optional(),
    isEnabled: z.boolean().optional(),
    isMandatory: z.boolean().optional(),
    // Track B: scoped-filter targeting (all optional on update).
    scope: z
      .preprocess(
        blankToUndefined,
        z.enum(FILTER_SCOPE_VALUES, {
          message: 'validation.analyses.filter.scope.invalid',
        }),
      )
      .optional(),
    targetTabId: filterTargetTabIdSchema,
    targetVisualIds: filterTargetVisualIdsSchema,
    sequence: z
      .number()
      .int({ message: 'validation.analyses.filter.sequence.invalid' })
      .min(0, { message: 'validation.analyses.filter.sequence.invalid' })
      .optional(),
    justification: analysisJustificationSchema,
  })
  .superRefine(refineFilterScope);

// ── Analysis composite schemas ─────────────────────────────────────

export const addAnalysisSchema = z.object({
  name: analysisNameSchema,
  description: analysisDescriptionSchema,
  datasource: analysisDatasourceSchema,
  datasetId: analysisDatasetSchema,
});
export type AddAnalysisInput = z.infer<typeof addAnalysisSchema>;

export const updateAnalysisSchema = z.object({
  id: analysisIdSchema,
  name: analysisNameSchema,
  description: analysisDescriptionSchema,
  datasource: analysisDatasourceSchema,
  datasetId: analysisDatasetSchema,
  status: statusSchema,
  // Visuals, filters, tabs and parameters are domain objects owned by
  // the analysis builder. Their shapes are validated downstream by the
  // visual / filter / tab / parameter modules; here we only ensure
  // they're arrays of objects so the controller can reconcile them.
  // tabs / parameters carry client-side temp ids (prefixed tmp_) until
  // this save persists them; the controller maps temp -> real ids.
  visuals: z.array(z.record(z.string(), z.any())).optional(),
  filters: z.array(z.record(z.string(), z.any())).optional(),
  tabs: z.array(z.record(z.string(), z.any())).optional(),
  parameters: z.array(z.record(z.string(), z.any())).optional(),
  // Real tabs deleted during this draft, each with its audit justification
  // ({ id, justification }). The tabs array above is authoritative (an absent
  // tab is deleted); tabDeletes only carries the deletion reason for the audit.
  tabDeletes: z.array(z.record(z.string(), z.any())).optional(),
  // Advanced-analytics specs (Wave 1) persisted on the analysis: table
  // calculations, time-intelligence transforms and the date-spine config.
  // Their shapes are validated downstream by the analytics engine; here we
  // only ensure they're arrays of objects so the controller can persist them.
  tableCalcs: z.array(z.record(z.string(), z.any())).optional(),
  timeIntel: z.array(z.record(z.string(), z.any())).optional(),
  dateSpine: z.array(z.record(z.string(), z.any())).optional(),
  justification: analysisJustificationSchema,
});
export type UpdateAnalysisInput = z.infer<typeof updateAnalysisSchema>;

/**
 * Deep-duplicate an analysis. The source id arrives on the URL path
 * (POST /:analysisId/duplicate → idFromParam copies it into body.id),
 * so `id` is required here. No name field: the controller derives
 * `<name> (copy)`.
 */
export const duplicateAnalysisSchema = z.object({
  id: analysisIdSchema,
});
export type DuplicateAnalysisInput = z.infer<typeof duplicateAnalysisSchema>;

// ── Run-query (filter payload) schemas ─────────────────────────────

/**
 * Shape of a single filter applied at query time. Mirrors the BE
 * `AppliedFilter` interface (filterEngine.service.ts) but expressed
 * as a Zod schema so the run-query endpoint can reject malformed
 * filters at the gate rather than letting the SQL compiler discover
 * them at runtime.
 *
 * Column-name pattern matches `VALID_IDENTIFIER` inside the filter
 * engine (^[a-zA-Z_][a-zA-Z0-9_]*$) — anything else is rejected here
 * so the engine's `throw new Error(invalid column name)` path is
 * never reached by a normal request.
 */
export const APPLIED_FILTER_COLUMN_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const appliedFilterSchema = z.object({
  filterId: z.string().optional(),
  columnName: z
    .string({ message: 'validation.analyses.run.column.required' })
    .regex(APPLIED_FILTER_COLUMN_PATTERN, {
      message: 'validation.analyses.run.column.invalid',
    }),
  filterType: z
    .string({ message: 'validation.analyses.run.filterType.required' })
    .min(1, { message: 'validation.analyses.run.filterType.required' }),
  operator: z.string().optional(),
  values: z.array(z.any()).optional(),
  rangeMin: z.number().optional(),
  rangeMax: z.number().optional(),
  includeMin: z.boolean().optional(),
  includeMax: z.boolean().optional(),
  dateRangeStart: z.string().optional(),
  dateRangeEnd: z.string().optional(),
  nullOption: z.string().optional(),
  // Slice D: the run-time payload may carry the same config fields the
  // saved filter does — `relativePreset` (resolved server-side to
  // concrete dates) and `categoryValues` (curated allow-list enforced
  // defensively at run time). Reuses filterConfigSchema so the run path
  // and the save path validate the config identically.
  config: filterConfigSchema.optional(),
});
export type AppliedFilterInput = z.infer<typeof appliedFilterSchema>;

/**
 * POST /api/v1/analyses/:analysisId/run — body schema. Limit is
 * either a positive int or -1 (the sentinel for "no row cap"); the
 * controller checks `parsedLimit !== -1` to skip the LIMIT wrap.
 */
/**
 * Optional server-side aggregation encoding sent on a run (Track D). When
 * present with a non-null `aggregate`, the run wraps the (post-filter) SQL in a
 * GROUP BY. Identifiers are re-validated + double-quoted server-side
 * (buildAggregationWrap); the columns are held to the same identifier shape as
 * axis columns so a bad column is rejected at the gate.
 */
export const AGGREGATE_VALUES = [
  'sum',
  'avg',
  'count',
  'min',
  'max',
  'count_distinct',
  'median',
  'percentile',
  'stddev',
  'variance',
] as const;
export type AggregateFn = (typeof AGGREGATE_VALUES)[number];

const aggregationColumnSchema = z.preprocess(
  blankToUndefined,
  z.string().regex(APPLIED_FILTER_COLUMN_PATTERN, {
    message: 'validation.analyses.run.aggregation.columnInvalid',
  }),
);

/**
 * Percentile P for aggregate='percentile' — the 0..100 rank the dialect-aware
 * percentile aggregate resolves (e.g. PERCENTILE_CONT). Open interval (0,100);
 * optional (ignored by every other aggregate). Present on the top-level
 * aggregation and on each extraMeasures entry so a multi-measure combo can mix
 * percentiles at different ranks.
 */
const percentileSchema = z
  .number()
  .gt(0)
  .lt(100)
  .optional();

export const runAggregationSchema = z.object({
  aggregate: z.enum(AGGREGATE_VALUES, {
    message: 'validation.analyses.run.aggregation.invalid',
  }),
  dimensionColumn: aggregationColumnSchema,
  measureColumn: aggregationColumnSchema,
  percentile: percentileSchema,
  extraMeasures: z
    .array(
      z.object({
        column: aggregationColumnSchema,
        aggregate: z.enum(AGGREGATE_VALUES, {
          message: 'validation.analyses.run.aggregation.invalid',
        }),
        alias: aggregationColumnSchema,
        percentile: percentileSchema,
      }),
    )
    .optional(),
});

export const runAnalysisQuerySchema = z.object({
  datasetId: idSchema('validation.analyses.run.datasetId.required'),
  analysisId: idSchema('validation.analyses.run.analysisId.required'),
  filters: z.array(appliedFilterSchema).optional(),
  // Run-time values for the analysis's declared parameters, keyed by parameter
  // `key`. Substituted into {{param.<key>}} tokens by parameterSubstitution.
  // Free-form record — each value is coerced + validated against its declared
  // parameter type on the BE, so the shape here is intentionally permissive.
  paramValues: z.record(z.string(), z.any()).optional(),
  // Track D: optional server-side aggregation for the visual being previewed.
  aggregation: runAggregationSchema.optional(),
  // Feature B: optional pivot totals / subtotals config a table / pivot visual
  // attaches so the run appends grand-total + per-group subtotal rows.
  pivotTotals: pivotTotalsConfigSchema.optional(),
  // Advanced-analytics run specs (Wave 1): table calculations, time-
  // intelligence transforms and the date-spine config applied to this run.
  // Free-form arrays of objects here; the analytics engine validates their
  // shapes when it compiles the SQL.
  tableCalcs: z.array(z.record(z.string(), z.any())).optional(),
  timeIntel: z.array(z.record(z.string(), z.any())).optional(),
  dateSpine: z.array(z.record(z.string(), z.any())).optional(),
  limit: z
    .union([z.number().int(), z.string().regex(/^-?\d+$/)])
    .optional()
    .default(-1)
    .transform(v => (typeof v === 'string' ? parseInt(v, 10) : v))
    .refine(n => n === -1 || n > 0, {
      message: 'validation.analyses.run.limit.invalid',
    }),
});
export type RunAnalysisQueryInput = z.infer<typeof runAnalysisQuerySchema>;

// ── RLS rule schemas ───────────────────────────────────────────────

export const rlsRuleNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.rls.name.required' })
    .min(1, { message: 'validation.analyses.rls.name.required' })
    .max(ANALYSIS_LIMITS.NAME_MAX, {
      message: 'validation.analyses.rls.name.tooLong',
    }),
);

export const rlsColumnNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.rls.column.required' })
    .min(1, { message: 'validation.analyses.rls.column.required' })
    .max(ANALYSIS_LIMITS.COLUMN_NAME_MAX, {
      message: 'validation.analyses.rls.column.tooLong',
    }),
);

/**
 * Cross-field rule for RLS payloads — keeps operator and values in sync
 * so the BE resolver never has to guess at intent. Used by both
 * `addRlsRuleSchema` and `updateRlsRuleSchema` via `.superRefine`.
 *
 * Why this lives here, not in the resolver: the resolver compiles
 * `BETWEEN` with non-numeric or wrong-arity values into a silent
 * fallback (which historically routed through the `EQUALS`/IN code
 * path). Refusing the payload at the gate is the only way to stop
 * that class of misconfiguration; the resolver still has a defensive
 * guard but should never need it for newly-created rules.
 */
const refineRlsOperatorValues = (
  data: { operator?: string; values?: unknown[] },
  ctx: z.RefinementCtx,
): void => {
  // `values` is optional on the update schema; nothing to validate if
  // the caller didn't touch it.
  if (data.values === undefined) return;
  const op = data.operator ?? 'IN';

  if (op === 'BETWEEN') {
    if (data.values.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['values'],
        message: 'validation.analyses.rls.values.betweenExactlyTwo',
      });
      return;
    }
    for (let i = 0; i < 2; i++) {
      const v = data.values[i];
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', i],
          message: 'validation.analyses.rls.values.betweenNumeric',
        });
      }
    }
  } else if (op === 'EQUALS' && data.values.length !== 1) {
    // EQUALS is a single-value operator. Multi-value EQUALS would
    // either silently collapse to the first value or expand to an
    // IN — both are surprising. Force IN for multi-value intent.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'validation.analyses.rls.values.equalsExactlyOne',
    });
  }
};

/**
 * A single row predicate inside `conditions[]`. Mirrors the legacy flat
 * (columnName, operator, values) triple; the same operator/value
 * invariants are enforced by `refineRlsOperatorValues` applied per row.
 */
export const rlsConditionSchema = z
  .object({
    columnName: rlsColumnNameSchema,
    operator: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_OPERATOR_VALUES, {
          message: 'validation.analyses.rls.operator.invalid',
        }),
      )
      .optional()
      .default('IN'),
    values: z
      .array(z.any())
      .min(1, { message: 'validation.analyses.rls.values.atLeastOne' }),
  })
  .superRefine(refineRlsOperatorValues);

/** A single subject binding inside `assignments[]`. */
export const rlsAssignmentSchema = z.object({
  scope: z.preprocess(
    trimOrUndefined,
    z.enum(RLS_SCOPE_VALUES, {
      message: 'validation.analyses.rls.scope.invalid',
    }),
  ),
  scopeId: idSchema('validation.analyses.rls.scopeId.required'),
});

/** A single column-masking directive inside `maskedColumns[]`. */
export const rlsMaskedColumnSchema = z.object({
  columnName: rlsColumnNameSchema,
  strategy: z
    .preprocess(
      trimOrUndefined,
      z.enum(RLS_MASK_STRATEGY_VALUES, {
        message: 'validation.analyses.rls.mask.strategyInvalid',
      }),
    )
    .optional()
    .default('hide'),
  // Only meaningful for strategy='redact'; free-form short token.
  maskValue: z.preprocess(
    trimOrUndefined,
    z
      .string()
      .max(50, { message: 'validation.analyses.rls.mask.maskValueTooLong' })
      .optional(),
  ),
});

const rlsSecurityTypeSchema = z
  .preprocess(
    trimOrUndefined,
    z.enum(RLS_SECURITY_TYPE_VALUES, {
      message: 'validation.analyses.rls.securityType.invalid',
    }),
  )
  .optional()
  .default('row');

/**
 * Cross-shape rule for the array-model RLS payload. Enforces:
 * - row rules → at least one condition;
 * - column rules → at least one masked column;
 * - every rule → at least one subject, taken from `assignments[]` or
 *   the legacy flat scope/scopeId pair.
 *
 * The legacy flat single-predicate path (bare columnName/operator/
 * values with no `conditions[]`) is still accepted so older FE builds
 * and API clients keep working.
 */
const refineRlsRule = (
  data: {
    securityType?: string;
    conditions?: unknown[];
    maskedColumns?: unknown[];
    assignments?: unknown[];
    scope?: string;
    scopeId?: string;
    columnName?: string;
  },
  ctx: z.RefinementCtx,
): void => {
  const type = data.securityType ?? 'row';
  const hasConditions = (data.conditions?.length ?? 0) > 0;
  const hasLegacyPredicate = !!data.columnName;
  const hasMasked = (data.maskedColumns?.length ?? 0) > 0;
  const hasAssignments = (data.assignments?.length ?? 0) > 0;
  const hasLegacySubject = !!data.scope && !!data.scopeId;

  if (type === 'column') {
    if (!hasMasked) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maskedColumns'],
        message: 'validation.analyses.rls.mask.atLeastOne',
      });
    }
  } else {
    // row
    if (!hasConditions && !hasLegacyPredicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditions'],
        message: 'validation.analyses.rls.conditions.atLeastOne',
      });
    }
  }

  if (!hasAssignments && !hasLegacySubject) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assignments'],
      message: 'validation.analyses.rls.assignments.atLeastOne',
    });
  }
};

export const addRlsRuleSchema = z
  .object({
    name: rlsRuleNameSchema,
    description: analysisDescriptionSchema,
    datasetId: idSchema('validation.analyses.rls.dataset.required'),
    securityType: rlsSecurityTypeSchema,

    // Array model (preferred).
    conditions: z.array(rlsConditionSchema).optional().default([]),
    assignments: z.array(rlsAssignmentSchema).optional().default([]),
    maskedColumns: z.array(rlsMaskedColumnSchema).optional().default([]),

    // Legacy flat single-predicate / single-subject (still accepted).
    scope: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_SCOPE_VALUES, {
          message: 'validation.analyses.rls.scope.invalid',
        }),
      )
      .optional(),
    scopeId: idSchema('validation.analyses.rls.scopeId.required').optional(),
    columnName: rlsColumnNameSchema.optional(),
    operator: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_OPERATOR_VALUES, {
          message: 'validation.analyses.rls.operator.invalid',
        }),
      )
      .optional()
      .default('IN'),
    values: z.array(z.any()).optional(),
    isEnabled: z.boolean().optional().default(true),
  })
  .superRefine(refineRlsRule)
  .superRefine(refineRlsOperatorValues);
export type AddRlsRuleInput = z.infer<typeof addRlsRuleSchema>;

export const updateRlsRuleSchema = z
  .object({
    id: idSchema('validation.analyses.rls.id.required'),
    name: rlsRuleNameSchema.optional(),
    description: analysisDescriptionSchema,
    securityType: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_SECURITY_TYPE_VALUES, {
          message: 'validation.analyses.rls.securityType.invalid',
        }),
      )
      .optional(),

    conditions: z.array(rlsConditionSchema).optional(),
    assignments: z.array(rlsAssignmentSchema).optional(),
    maskedColumns: z.array(rlsMaskedColumnSchema).optional(),

    scope: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_SCOPE_VALUES, {
          message: 'validation.analyses.rls.scope.invalid',
        }),
      )
      .optional(),
    scopeId: idSchema('validation.analyses.rls.scopeId.required').optional(),
    columnName: rlsColumnNameSchema.optional(),
    operator: z
      .preprocess(
        trimOrUndefined,
        z.enum(RLS_OPERATOR_VALUES, {
          message: 'validation.analyses.rls.operator.invalid',
        }),
      )
      .optional(),
    values: z
      .array(z.any())
      .min(1, { message: 'validation.analyses.rls.values.atLeastOne' })
      .optional(),
    isEnabled: z.boolean().optional(),
    justification: analysisJustificationSchema,
  })
  .superRefine(refineRlsOperatorValues);
export type UpdateRlsRuleInput = z.infer<typeof updateRlsRuleSchema>;

// ── Dashboard publish field schemas (used directly by FE form) ─────

/** Required dashboard name — used on the 'new' publish branch. */
export const dashboardNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analyses.dashboard.name.required' })
    .min(1, { message: 'validation.analyses.dashboard.name.required' })
    .max(ANALYSIS_LIMITS.DASHBOARD_NAME_MAX, {
      message: 'validation.analyses.dashboard.name.tooLong',
    }),
);

/** Optional dashboard name — used on the 'existing' republish branch. */
export const dashboardNameOptionalSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(ANALYSIS_LIMITS.DASHBOARD_NAME_MAX, {
      message: 'validation.analyses.dashboard.name.tooLong',
    })
    .optional(),
);

/** Dashboard target id — required on 'existing' republish. */
export const dashboardIdRequiredSchema = idSchema(
  'validation.analyses.dashboard.id.required',
);

// ── Publish-dashboard schema ───────────────────────────────────────

/**
 * Discriminated by `mode`. `new` requires `name` and forbids
 * `dashboardId`; `existing` requires `dashboardId` and makes `name`
 * optional (a rename on republish is allowed).
 */
const publishNewSchema = z.object({
  analysisId: idSchema('validation.analyses.dashboard.analysisId.required'),
  mode: z.literal('new'),
  name: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.analyses.dashboard.name.required' })
      .min(1, { message: 'validation.analyses.dashboard.name.required' })
      .max(ANALYSIS_LIMITS.DASHBOARD_NAME_MAX, {
        message: 'validation.analyses.dashboard.name.tooLong',
      }),
  ),
  description: analysisDescriptionSchema,
  status: statusSchema,
});

const publishExistingSchema = z.object({
  analysisId: idSchema('validation.analyses.dashboard.analysisId.required'),
  mode: z.literal('existing'),
  dashboardId: idSchema(
    'validation.analyses.dashboard.id.required',
  ),
  name: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(ANALYSIS_LIMITS.DASHBOARD_NAME_MAX, {
        message: 'validation.analyses.dashboard.name.tooLong',
      })
      .optional(),
  ),
  description: analysisDescriptionSchema,
  status: statusSchema,
});

export const publishDashboardSchema = z.discriminatedUnion('mode', [
  publishNewSchema,
  publishExistingSchema,
]);
export type PublishDashboardInput = z.infer<typeof publishDashboardSchema>;

/**
 * Deep-duplicate a dashboard. The source id arrives on the URL path
 * (POST /:dashboardId/duplicate → idFromParam copies it into body.id),
 * so `id` is required here. No name field: the controller derives
 * `<name> (copy)`.
 */
export const duplicateDashboardSchema = z.object({
  id: idSchema('validation.analyses.dashboard.id.required'),
});
export type DuplicateDashboardInput = z.infer<typeof duplicateDashboardSchema>;
