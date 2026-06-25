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

const filterShape = z.object({
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
  // Free-form filter UI config; shape is owned by the visual layer.
  config: z.record(z.string(), z.any()).optional().default({}),
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
  sequence: z
    .number()
    .int({ message: 'validation.analyses.filter.sequence.invalid' })
    .min(0, { message: 'validation.analyses.filter.sequence.invalid' })
    .optional()
    .default(0),
});

export const addAnalysisFilterSchema = z.object({
  analysisId: idSchema('validation.analyses.id.required'),
  filters: z.array(filterShape).min(1, {
    message: 'validation.analyses.filter.atLeastOne',
  }),
});

export const updateAnalysisFilterSchema = z.object({
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
  config: z.record(z.string(), z.any()).optional(),
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
  sequence: z
    .number()
    .int({ message: 'validation.analyses.filter.sequence.invalid' })
    .min(0, { message: 'validation.analyses.filter.sequence.invalid' })
    .optional(),
  justification: analysisJustificationSchema,
});

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
  // Visuals and filters are domain objects owned by the analysis
  // builder. Their shapes are validated downstream by the visual /
  // filter modules; here we only ensure they're arrays of objects.
  visuals: z.array(z.record(z.string(), z.any())).optional(),
  filters: z.array(z.record(z.string(), z.any())).optional(),
  justification: analysisJustificationSchema,
});
export type UpdateAnalysisInput = z.infer<typeof updateAnalysisSchema>;

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
});
export type AppliedFilterInput = z.infer<typeof appliedFilterSchema>;

/**
 * POST /api/v1/analyses/:analysisId/run — body schema. Limit is
 * either a positive int or -1 (the sentinel for "no row cap"); the
 * controller checks `parsedLimit !== -1` to skip the LIMIT wrap.
 */
export const runAnalysisQuerySchema = z.object({
  datasetId: idSchema('validation.analyses.run.datasetId.required'),
  analysisId: idSchema('validation.analyses.run.analysisId.required'),
  filters: z.array(appliedFilterSchema).optional(),
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

export const addRlsRuleSchema = z
  .object({
    name: rlsRuleNameSchema,
    description: analysisDescriptionSchema,
    datasetId: idSchema('validation.analyses.rls.dataset.required'),
    scope: z.preprocess(
      trimOrUndefined,
      z.enum(RLS_SCOPE_VALUES, {
        message: 'validation.analyses.rls.scope.invalid',
      }),
    ),
    scopeId: idSchema('validation.analyses.rls.scopeId.required'),
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
    isEnabled: z.boolean().optional().default(true),
  })
  .superRefine(refineRlsOperatorValues);
export type AddRlsRuleInput = z.infer<typeof addRlsRuleSchema>;

export const updateRlsRuleSchema = z
  .object({
    id: idSchema('validation.analyses.rls.id.required'),
    name: rlsRuleNameSchema.optional(),
    description: analysisDescriptionSchema,
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
