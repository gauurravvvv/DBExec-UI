/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/alerts.ts
 *   FE: src/app/shared/validators/alerts.ts
 *
 * Single source of truth for the alerts surface: create / update alert,
 * the typed condition builder, schedule, and delivery. Both the FE form and
 * the BE zodValidate middleware consume these schemas so the contract can
 * never drift between client and server.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Enums (BE controller + evaluator branch on these) ──────────────

/** How the condition was authored. */
export const ALERT_CONDITION_MODES = ['builder', 'expression'] as const;
export type AlertConditionMode = (typeof ALERT_CONDITION_MODES)[number];

/** Aggregate applied to a field before comparison (none = raw first row). */
export const ALERT_AGGREGATES = [
  'none',
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_distinct',
] as const;
export type AlertAggregate = (typeof ALERT_AGGREGATES)[number];

/** Comparison operators. Typed inputs pick the RHS control per valueType. */
export const ALERT_OPERATORS = [
  'gt', // >
  'gte', // >=
  'lt', // <
  'lte', // <=
  'eq', // =
  'neq', // !=
  'between', // value is [lo, hi]
  'not_between',
  'is_null',
  'is_not_null',
  'changes_by_pct', // |Δ%| vs previous evaluation exceeds value
] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

/** RHS value type — drives which typed input the FE renders. */
export const ALERT_VALUE_TYPES = [
  'string',
  'number',
  'date',
  'boolean',
] as const;
export type AlertValueType = (typeof ALERT_VALUE_TYPES)[number];

/** Predicate group join. */
export const ALERT_JOINS = ['AND', 'OR'] as const;
export type AlertJoin = (typeof ALERT_JOINS)[number];

export const ALERT_SOURCE_TYPES = ['analysis', 'dataset'] as const;
export type AlertSourceType = (typeof ALERT_SOURCE_TYPES)[number];

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 150,
  DESCRIPTION_MAX: 500,
  EXPRESSION_MAX: 2000,
  MAX_PREDICATES: 20,
  MAX_RECIPIENTS: 100,
  COOLDOWN_MIN: 0,
  COOLDOWN_MAX: 10080, // 1 week
  CONSECUTIVE_MIN: 1,
  CONSECUTIVE_MAX: 100,
} as const;

export const ALERT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

// ── Condition sub-schemas ───────────────────────────────────────────

/** Left-hand side: a source field or a formula, with optional aggregate. */
export const alertOperandSchema = z.object({
  kind: z.enum(['field', 'formula']),
  ref: z
    .string({ message: 'validation.alerts.condition.ref.required' })
    .min(1, { message: 'validation.alerts.condition.ref.required' })
    .max(500),
  aggregate: z.enum(ALERT_AGGREGATES).default('none'),
});

/** Right-hand side value, typed. Optional for is_null / is_not_null. */
export const alertValueSchema = z.object({
  value: z.any().optional(),
  valueType: z.enum(ALERT_VALUE_TYPES),
});

export const alertPredicateSchema = z.object({
  left: alertOperandSchema,
  operator: z.enum(ALERT_OPERATORS),
  right: alertValueSchema,
});

export const alertConditionGroupSchema = z.object({
  join: z.enum(ALERT_JOINS).default('AND'),
  predicates: z
    .array(alertPredicateSchema)
    .min(1, { message: 'validation.alerts.condition.predicates.required' })
    .max(ALERT_LIMITS.MAX_PREDICATES),
});

export const alertConditionBuilderSchema = z.object({
  groups: z
    .array(alertConditionGroupSchema)
    .min(1, { message: 'validation.alerts.condition.groups.required' }),
});

// ── Field schemas ──────────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown =>
  typeof v === 'string' ? (v.trim().length === 0 ? undefined : v.trim()) : v;
const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

export const alertNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.alerts.name.required' })
    .min(ALERT_LIMITS.NAME_MIN, { message: 'validation.alerts.name.tooShort' })
    .max(ALERT_LIMITS.NAME_MAX, { message: 'validation.alerts.name.tooLong' })
    .regex(ALERT_NAME_PATTERN, { message: 'validation.alerts.name.invalid' }),
);

export const alertDescriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(ALERT_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.alerts.description.tooLong',
    })
    .optional(),
);

/** 5-field cron. Lenient regex here; cron-parser does authoritative parse in the controller. */
export const CRON_FIELD = '(\\*|([0-9,\\-*/]+))';
export const CRON_PATTERN = new RegExp(
  `^\\s*${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s*$`,
);

export const alertCronSchema = z
  .string({ message: 'validation.alerts.cron.required' })
  .regex(CRON_PATTERN, { message: 'validation.alerts.cron.invalid' });

export const alertRecipientsSchema = z.object({
  userIds: z
    .array(z.string().uuid())
    .max(ALERT_LIMITS.MAX_RECIPIENTS)
    .default([]),
  emails: z
    .array(
      z
        .string()
        .email({ message: 'validation.alerts.recipients.emailInvalid' }),
    )
    .max(ALERT_LIMITS.MAX_RECIPIENTS)
    .default([]),
});

// ── Payload schemas ────────────────────────────────────────────────

/** Shared shape for create + update; refined below to enforce the active mode. */
const alertBase = z.object({
  name: alertNameSchema,
  description: alertDescriptionSchema,
  sourceType: z.enum(ALERT_SOURCE_TYPES),
  sourceId: z.string().uuid({ message: 'validation.alerts.sourceId.invalid' }),
  connectorId: z
    .string()
    .uuid({ message: 'validation.alerts.connectorId.invalid' }),

  conditionMode: z.enum(ALERT_CONDITION_MODES).default('builder'),
  conditionBuilder: alertConditionBuilderSchema.optional(),
  conditionExpression: z.preprocess(
    blankToUndefined,
    z.string().max(ALERT_LIMITS.EXPRESSION_MAX).optional(),
  ),
  filterState: z.record(z.string(), z.any()).nullable().optional(),

  cronExpression: alertCronSchema,
  timezone: z.string().min(1).max(64).default('UTC'),

  cooldownMinutes: z
    .number()
    .int()
    .min(ALERT_LIMITS.COOLDOWN_MIN)
    .max(ALERT_LIMITS.COOLDOWN_MAX)
    .default(60),
  consecutiveBreachesRequired: z
    .number()
    .int()
    .min(ALERT_LIMITS.CONSECUTIVE_MIN)
    .max(ALERT_LIMITS.CONSECUTIVE_MAX)
    .default(1),

  severity: z.enum(ALERT_SEVERITIES).default('warning'),
  recipients: alertRecipientsSchema,
  notifyInApp: z.boolean().default(true),
  notifyEmail: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

/**
 * Cross-field rules applied to both create + update: the active authoring mode
 * must carry its payload, at least one delivery channel must be on, and email
 * delivery needs a recipient.
 */
const alertConditionRefinement = (
  val: z.infer<typeof alertBase>,
  ctx: z.RefinementCtx,
): void => {
  if (val.conditionMode === 'builder' && !val.conditionBuilder) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conditionBuilder'],
      message: 'validation.alerts.condition.builderRequired',
    });
  }
  if (
    val.conditionMode === 'expression' &&
    (!val.conditionExpression || val.conditionExpression.trim().length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conditionExpression'],
      message: 'validation.alerts.condition.expressionRequired',
    });
  }
  if (!val.notifyInApp && !val.notifyEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['notifyEmail'],
      message: 'validation.alerts.delivery.channelRequired',
    });
  }
  if (
    val.notifyEmail &&
    val.recipients.userIds.length === 0 &&
    val.recipients.emails.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipients'],
      message: 'validation.alerts.recipients.required',
    });
  }
};

export const addAlertSchema = alertBase.superRefine(alertConditionRefinement);

/** Update = same shape; id comes from the URL param, not the body. */
export const updateAlertSchema = alertBase.superRefine(
  alertConditionRefinement,
);

/** Snooze payload. */
export const snoozeAlertSchema = z.object({
  snoozeMinutes: z.number().int().min(1).max(ALERT_LIMITS.COOLDOWN_MAX),
});

/** Toggle payload. */
export const toggleAlertSchema = z.object({
  enabled: z.boolean(),
});

export type AddAlertInput = z.infer<typeof addAlertSchema>;
export type AlertConditionBuilder = z.infer<typeof alertConditionBuilderSchema>;
export type AlertPredicate = z.infer<typeof alertPredicateSchema>;

// ── List schemas (query params) ──────────────────────────────────────

export const listAlertsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  filter: z.string().trim().optional(),
  sort: z.string().optional(),
});

export type ListAlertsInput = z.infer<typeof listAlertsSchema>;

export const listAlertEventsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  filter: z.string().trim().optional(),
  sort: z.string().optional(),
});

export type ListAlertEventsInput = z.infer<typeof listAlertEventsSchema>;
