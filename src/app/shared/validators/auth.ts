/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/auth.ts
 *   FE: src/app/shared/validators/auth.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Covers every auth endpoint that takes a body the FE can validate
 * client-side: login, refresh, OTP request, password reset, set-
 * password (welcome / break-glass), setup-token verify, resend-
 * setup-link.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

/** WHATWG HTML5 email shape (TLD ≥ 2). */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** UUID v1-v8. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 6-character OTP, uppercase letters + digits. */
export const OTP_PATTERN = /^[A-Z0-9]{6}$/;

/** 64-char hex setup token (generated server-side, never user-typed). */
export const SETUP_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/** Opaque refresh token — bounded length, no shape check. */
const REFRESH_TOKEN_MAX = 512;

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

const upperTrimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim().toUpperCase();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

/** Organisation name on the login form — display string, not a UUID. */
export const organisationSchema = z.preprocess(
  trimOrUndefined,
  z.string({ message: 'validation.auth.organisation.required' }),
);

/**
 * Username for sign-in / OTP / forgot-password forms — required only.
 * No length / pattern check because tightening would block legacy
 * accounts whose usernames predate the current rule. Strict username
 * validation applies on user CREATION (see users.ts usernameSchema),
 * not at identification time.
 */
export const usernameSchema = z.preprocess(
  trimOrUndefined,
  z.string({ message: 'validation.auth.username.required' }),
);

export const emailSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.auth.email.required' })
    .max(254, { message: 'validation.auth.email.tooLong' })
    .regex(EMAIL_PATTERN, { message: 'validation.auth.email.invalid' }),
);

/**
 * Login password — required, no complexity check (we don't tell an
 * attacker which complexity rule their guess hit). Length-bounded so
 * a malformed huge body is rejected at the edge.
 */
export const loginPasswordSchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string({ message: 'validation.auth.password.required' })
    .min(1, { message: 'validation.auth.password.required' })
    .max(128, { message: 'validation.auth.password.tooLong' }),
);

/**
 * New / set password — full complexity rules enforced. Used on the
 * reset-password and set-password (welcome / setup-link) flows.
 */
export const newPasswordSchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string({ message: 'validation.auth.password.required' })
    .min(8, { message: 'validation.auth.password.tooShort' })
    .max(128, { message: 'validation.auth.password.tooLong' })
    .refine((v) => !/\s/.test(v), {
      message: 'validation.auth.password.noSpaces',
    })
    .refine((v) => /[a-z]/.test(v), {
      message: 'validation.auth.password.lowercase',
    })
    .refine((v) => /[A-Z]/.test(v), {
      message: 'validation.auth.password.uppercase',
    })
    .refine((v) => /\d/.test(v), { message: 'validation.auth.password.digit' })
    .refine((v) => /[@$!%*?&]/.test(v), {
      message: 'validation.auth.password.special',
    }),
);

export const otpSchema = z.preprocess(
  upperTrimOrUndefined,
  z
    .string({ message: 'validation.auth.otp.required' })
    .length(6, { message: 'validation.auth.otp.invalid' })
    .regex(OTP_PATTERN, { message: 'validation.auth.otp.invalid' }),
);

/**
 * Setup token (64-char hex). Server-issued in the welcome email; the
 * user never types it but the link can be malformed (truncated /
 * pasted incorrectly).
 */
export const setupTokenSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.auth.setupToken.required' })
    .regex(SETUP_TOKEN_PATTERN, {
      message: 'validation.auth.setupToken.invalid',
    }),
);

export const refreshTokenSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.auth.refreshToken.required' })
    .max(REFRESH_TOKEN_MAX, {
      message: 'validation.auth.refreshToken.invalid',
    }),
);

/** UUID body field (user id, org id). */
export const idSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.auth.id.required' })
    .regex(UUID_PATTERN, { message: 'validation.auth.id.invalid' }),
);

// ── Composite schemas ──────────────────────────────────────────────

export const loginSchema = z.object({
  organisation: organisationSchema,
  username: usernameSchema,
  password: loginPasswordSchema,
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenBodySchema = z.object({
  refreshToken: refreshTokenSchema,
  organisation: organisationSchema,
});

export const generateOTPSchema = z.object({
  organisation: organisationSchema,
  username: usernameSchema,
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  otp: otpSchema,
  password: newPasswordSchema,
});

export const setPasswordSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  token: setupTokenSchema,
  password: newPasswordSchema,
});

export const verifySetupTokenSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  token: setupTokenSchema,
});

export const resendSetupLinkSchema = z.object({
  id: idSchema,
  orgId: idSchema,
});
