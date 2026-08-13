/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/org-policy.ts
 *   FE: src/app/shared/validators/org-policy.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Internal helpers ───────────────────────────────────────────────

const nullableTrim = (v: unknown): unknown => {
  if (v === null) return undefined;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

/** SMTP host — up to 255 chars, nullable/clearable. */
export const smtpHostSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.smtpHost.invalid' })
    .max(255, { message: 'validation.org-policy.smtpHost.tooLong' })
    .optional()
    .nullable(),
);

/** SMTP port — integer 1–65535, nullable. */
export const smtpPortSchema = z
  .union([
    z.coerce
      .number({ message: 'validation.org-policy.smtpPort.invalid' })
      .int({ message: 'validation.org-policy.smtpPort.invalid' })
      .min(1, { message: 'validation.org-policy.smtpPort.invalid' })
      .max(65535, { message: 'validation.org-policy.smtpPort.invalid' }),
    z.null(),
  ])
  .optional();

/** SMTP user — up to 255 chars, nullable/clearable. */
export const smtpUserSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.smtpUser.invalid' })
    .max(255, { message: 'validation.org-policy.smtpUser.tooLong' })
    .optional()
    .nullable(),
);

/** SMTP password — up to 1024 chars, nullable/clearable. */
export const smtpPasswordSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.smtpPassword.invalid' })
    .max(1024, { message: 'validation.org-policy.smtpPassword.tooLong' })
    .optional()
    .nullable(),
);

/** SMTP from address — valid email, nullable/clearable. */
export const smtpFromSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.smtpFrom.invalid' })
    .email({ message: 'validation.org-policy.smtpFrom.invalid' })
    .optional()
    .nullable(),
);

/** SES region — pattern [a-z]{2}-[a-z]+-\d{1,2}, nullable/clearable. */
export const sesRegionSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.sesRegion.invalid' })
    .max(50, { message: 'validation.org-policy.sesRegion.tooLong' })
    .regex(/^[a-z]{2}-[a-z]+-\d{1,2}$/, {
      message: 'validation.org-policy.sesRegion.invalid',
    })
    .optional()
    .nullable(),
);

/** SES access key ID — 16–128 chars, nullable/clearable. */
export const sesAccessKeyIdSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.sesAccessKeyId.invalid' })
    .min(16, { message: 'validation.org-policy.sesAccessKeyId.tooShort' })
    .max(128, { message: 'validation.org-policy.sesAccessKeyId.tooLong' })
    .optional()
    .nullable(),
);

/** SES secret access key — up to 1024 chars, nullable/clearable. */
export const sesSecretAccessKeySchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.sesSecretAccessKey.invalid' })
    .max(1024, { message: 'validation.org-policy.sesSecretAccessKey.tooLong' })
    .optional()
    .nullable(),
);

/** SES from address — valid email, nullable/clearable. */
export const sesFromSchema = z.preprocess(
  nullableTrim,
  z
    .string({ message: 'validation.org-policy.sesFrom.invalid' })
    .email({ message: 'validation.org-policy.sesFrom.invalid' })
    .optional()
    .nullable(),
);

/** Email provider — 'SMTP', 'SES', or null to clear. */
export const emailProviderSchema = z
  .enum(['SMTP', 'SES'], {
    message: 'validation.org-policy.emailProvider.invalid',
  })
  .nullable()
  .optional();

// ── Composite schemas ──────────────────────────────────────────────

/** PATCH /api/v1/org-policy/email-config body. */
export const updateEmailConfigSchema = z.object({
  emailProvider: emailProviderSchema,
  smtpHost: smtpHostSchema,
  smtpPort: smtpPortSchema,
  smtpUser: smtpUserSchema,
  smtpPassword: smtpPasswordSchema,
  smtpFrom: smtpFromSchema,
  sesRegion: sesRegionSchema,
  sesAccessKeyId: sesAccessKeyIdSchema,
  sesSecretAccessKey: sesSecretAccessKeySchema,
  sesFrom: sesFromSchema,
});

export type UpdateEmailConfigInput = z.infer<typeof updateEmailConfigSchema>;

/** PATCH /api/v1/org-policy/security-policy body. */
export const updateSecurityPolicySchema = z.object({
  maxLoginAttempts: z
    .coerce.number({ message: 'validation.org-policy.maxLoginAttempts.invalid' })
    .int({ message: 'validation.org-policy.maxLoginAttempts.invalid' })
    .min(3, { message: 'validation.org-policy.maxLoginAttempts.invalid' })
    .max(10, { message: 'validation.org-policy.maxLoginAttempts.invalid' }),
  accountLockDurationHours: z
    .coerce
    .number({ message: 'validation.org-policy.accountLockDurationHours.invalid' })
    .min(0, { message: 'validation.org-policy.accountLockDurationHours.invalid' })
    .max(24, { message: 'validation.org-policy.accountLockDurationHours.invalid' }),
  passwordHistoryLimit: z
    .coerce
    .number({ message: 'validation.org-policy.passwordHistoryLimit.invalid' })
    .int({ message: 'validation.org-policy.passwordHistoryLimit.invalid' })
    .min(1, { message: 'validation.org-policy.passwordHistoryLimit.invalid' })
    .max(24, { message: 'validation.org-policy.passwordHistoryLimit.invalid' }),
  sessionInactivityTimeout: z
    .coerce
    .number({
      message: 'validation.org-policy.sessionInactivityTimeout.invalid',
    })
    .int({ message: 'validation.org-policy.sessionInactivityTimeout.invalid' })
    .min(5, { message: 'validation.org-policy.sessionInactivityTimeout.invalid' })
    .max(1440, {
      message: 'validation.org-policy.sessionInactivityTimeout.invalid',
    }),
});

export type UpdateSecurityPolicyInput = z.infer<
  typeof updateSecurityPolicySchema
>;

/** PATCH /api/v1/org-policy/sso-config body. All fields optional. */
export const updateSsoConfigSchema = z
  .object({
    ssoEnabled: z
      .boolean({ message: 'validation.org-policy.ssoEnabled.invalid' })
      .optional(),
    ssoIssuer: z.preprocess(
      nullableTrim,
      z
        .string({ message: 'validation.org-policy.ssoIssuer.invalid' })
        .max(255, { message: 'validation.org-policy.ssoIssuer.tooLong' })
        .optional(),
    ),
    ssoEntryPoint: z.preprocess(
      nullableTrim,
      z
        .string({ message: 'validation.org-policy.ssoEntryPoint.invalid' })
        .url({ message: 'validation.org-policy.ssoEntryPoint.invalid' })
        .max(2048, { message: 'validation.org-policy.ssoEntryPoint.tooLong' })
        .optional(),
    ),
    ssoCertificate: z.preprocess(
      nullableTrim,
      z
        .string({ message: 'validation.org-policy.ssoCertificate.invalid' })
        .max(16384, { message: 'validation.org-policy.ssoCertificate.tooLong' })
        .optional(),
    ),
  })
  .strict()
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'validation.org-policy.ssoConfig.atLeastOne',
  });

export type UpdateSsoConfigInput = z.infer<typeof updateSsoConfigSchema>;
