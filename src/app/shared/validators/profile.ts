/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/profile.ts
 *   FE: src/app/shared/validators/profile.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// Supported locales — keep in sync with src/shared/utility/i18n.ts (BE)
// and src/app/core/services/locale.service.ts (FE). Adding a locale
// to i18n automatically validates it here without touching this file.
const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'pt-BR',
  'zh-CN',
  'ko',
  'it',
  'nl',
  'ja',
] as const;

// ── Field schemas ──────────────────────────────────────────────────

/**
 * New password — full complexity rules enforced (same as auth module).
 * Used for self-service password change by authenticated user.
 */
export const newPasswordSchema = z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  z
    .string({ message: 'validation.profile.newPassword.required' })
    .min(8, { message: 'validation.profile.newPassword.tooShort' })
    .max(128, { message: 'validation.profile.newPassword.tooLong' })
    .refine(v => !/\s/.test(v), {
      message: 'validation.profile.newPassword.noSpaces',
    })
    .refine(v => /[a-z]/.test(v), {
      message: 'validation.profile.newPassword.lowercase',
    })
    .refine(v => /[A-Z]/.test(v), {
      message: 'validation.profile.newPassword.uppercase',
    })
    .refine(v => /\d/.test(v), {
      message: 'validation.profile.newPassword.digit',
    })
    .refine(v => /[@$!%*?&]/.test(v), {
      message: 'validation.profile.newPassword.special',
    }),
);

/**
 * Locale — derived from SUPPORTED_LOCALES constant to ensure any new
 * locale added to i18n automatically becomes valid here without file changes.
 */
export const localeSchema = z.preprocess(
  trimOrUndefined,
  z
    .enum(SUPPORTED_LOCALES, {
      message: 'validation.profile.locale.invalid',
    })
    .refine(
      locale => SUPPORTED_LOCALES.includes(locale),
      { message: 'validation.profile.locale.invalid' },
    ),
);

/** Tour preference — required boolean. */
export const showTourSchema = z.boolean({
  message: 'validation.profile.showTour.invalid',
});

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/profile/change-password body. */
export const changePasswordSchema = z.object({
  newPassword: newPasswordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** PATCH /api/v1/profile/locale body. */
export const updateLocaleSchema = z.object({
  locale: localeSchema,
});

export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;

/** PATCH /api/v1/profile/show-tour body. */
export const updateShowTourSchema = z.object({
  showTour: showTourSchema,
});

export type UpdateShowTourInput = z.infer<typeof updateShowTourSchema>;
