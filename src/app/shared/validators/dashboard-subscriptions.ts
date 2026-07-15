/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/dashboard-subscriptions.ts
 *   FE: src/app/shared/validators/dashboard-subscriptions.ts
 *
 * Single source of truth for the dashboard-subscription surface:
 * create / update / toggle a scheduled email delivery of a dashboard.
 * Both the FE form and the BE zodValidate middleware consume these
 * schemas so the contract can never drift between client and server.
 *
 * The recipients shape ({ userIds, emails }) and the cron + timezone
 * schedule fields mirror the alerts surface (see alerts.ts) so the two
 * scheduled-delivery features share one recipient/schedule contract.
 *
 * The cron regex here is deliberately lenient — cron-parser does the
 * authoritative parse in the controller and is what computes
 * nextRunAt. This file only rejects obviously-malformed input early so
 * the form can highlight the field client-side.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Enums ───────────────────────────────────────────────────────────

/** Output format. v1 emits pdf; png is reserved for a later slice. */
export const DASHBOARD_SUBSCRIPTION_FORMATS = ['pdf', 'png'] as const;
export type DashboardSubscriptionFormat =
  (typeof DASHBOARD_SUBSCRIPTION_FORMATS)[number];

// ── Limits ──────────────────────────────────────────────────────────

export const DASHBOARD_SUBSCRIPTION_LIMITS = {
  CRON_MAX: 120,
  TIMEZONE_MAX: 100,
  MAX_RECIPIENTS: 200,
} as const;

// ── Field schemas ───────────────────────────────────────────────────

/** 5-field cron. Lenient regex here; cron-parser does authoritative parse in the controller. */
export const CRON_FIELD = '(\\*|([0-9,\\-*/]+))';
export const CRON_PATTERN = new RegExp(
  `^\\s*${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s*$`,
);

export const dashboardSubscriptionCronSchema = z
  .string({ message: 'validation.dashboardSubscriptions.cronExpression.required' })
  .max(DASHBOARD_SUBSCRIPTION_LIMITS.CRON_MAX, {
    message: 'validation.dashboardSubscriptions.cronExpression.tooLong',
  })
  .regex(CRON_PATTERN, {
    message: 'validation.dashboardSubscriptions.cronExpression.invalid',
  });

export const dashboardSubscriptionTimezoneSchema = z
  .string({ message: 'validation.dashboardSubscriptions.timezone.required' })
  .min(1, { message: 'validation.dashboardSubscriptions.timezone.required' })
  .max(DASHBOARD_SUBSCRIPTION_LIMITS.TIMEZONE_MAX, {
    message: 'validation.dashboardSubscriptions.timezone.tooLong',
  });

/** Delivery targets — mirrors the alerts recipients contract. */
export const dashboardSubscriptionRecipientsSchema = z.object({
  userIds: z
    .array(
      z.string().uuid({
        message: 'validation.dashboardSubscriptions.recipients.userIdInvalid',
      }),
    )
    .max(DASHBOARD_SUBSCRIPTION_LIMITS.MAX_RECIPIENTS)
    .default([]),
  emails: z
    .array(
      z.string().email({
        message: 'validation.dashboardSubscriptions.recipients.emailInvalid',
      }),
    )
    .max(DASHBOARD_SUBSCRIPTION_LIMITS.MAX_RECIPIENTS)
    .default([]),
});

// ── Payload schemas ─────────────────────────────────────────────────

/**
 * At least one recipient (user or email) must be present — a
 * subscription with nobody to deliver to is meaningless.
 */
const recipientsRefinement = (
  val: { recipients: { userIds: string[]; emails: string[] } },
  ctx: z.RefinementCtx,
): void => {
  if (
    val.recipients.userIds.length === 0 &&
    val.recipients.emails.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipients'],
      message: 'validation.dashboardSubscriptions.recipients.empty',
    });
  }
};

/** Create payload. `dashboardId` comes in the body on create. */
export const addDashboardSubscriptionSchema = z
  .object({
    dashboardId: z.string().uuid({
      message: 'validation.dashboardSubscriptions.dashboardId.invalid',
    }),
    cronExpression: dashboardSubscriptionCronSchema,
    timezone: dashboardSubscriptionTimezoneSchema,
    format: z
      .enum(DASHBOARD_SUBSCRIPTION_FORMATS, {
        message: 'validation.dashboardSubscriptions.format.invalid',
      })
      .default('pdf'),
    recipients: dashboardSubscriptionRecipientsSchema,
    filtersSnapshot: z.array(z.any()).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine(recipientsRefinement);
export type AddDashboardSubscriptionInput = z.infer<
  typeof addDashboardSubscriptionSchema
>;

/**
 * Update payload — same shape as create minus dashboardId (a
 * subscription can't be re-pointed at another dashboard; delete and
 * recreate). The id comes from the URL param, not the body.
 */
export const updateDashboardSubscriptionSchema = z
  .object({
    cronExpression: dashboardSubscriptionCronSchema,
    timezone: dashboardSubscriptionTimezoneSchema,
    format: z
      .enum(DASHBOARD_SUBSCRIPTION_FORMATS, {
        message: 'validation.dashboardSubscriptions.format.invalid',
      })
      .default('pdf'),
    recipients: dashboardSubscriptionRecipientsSchema,
    filtersSnapshot: z.array(z.any()).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine(recipientsRefinement);
export type UpdateDashboardSubscriptionInput = z.infer<
  typeof updateDashboardSubscriptionSchema
>;

/** Toggle payload — flip enabled on/off without touching the schedule. */
export const toggleDashboardSubscriptionSchema = z.object({
  enabled: z.boolean({
    message: 'validation.dashboardSubscriptions.enabled.invalid',
  }),
});
export type ToggleDashboardSubscriptionInput = z.infer<
  typeof toggleDashboardSubscriptionSchema
>;
