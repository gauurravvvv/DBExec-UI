/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/theme.ts
 *   FE: src/app/shared/validators/theme.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { THEME_TOKENS } from '../theme/theme-tokens';

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

const nullableTrim = (v: unknown): unknown => {
  if (v === null) return undefined;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// ── Hex colour pattern ─────────────────────────────────────────────

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ── Build colour map from THEME_TOKENS ─────────────────────────────

const buildColorsShape = (): Record<string, z.ZodSchema> => {
  const shape: Record<string, z.ZodSchema> = {};
  THEME_TOKENS.forEach((token) => {
    shape[token.key] = z
      .string()
      .regex(HEX_COLOR, {
        message: `validation.theme.colors.${token.key}.invalid`,
      })
      .optional();
  });
  return shape;
};

const colorsShape = buildColorsShape();

// ── Primary text alternatives ─────────────────────────────────────

const primaryTextSchema = z
  .union([z.literal('white'), z.literal('black')])
  .or(z.string().regex(HEX_COLOR, { message: 'validation.theme.primaryText.invalid' }));

// ── Schemas ────────────────────────────────────────────────────────

/**
 * SaveThemeValidation — body validator for POST /api/v1/theme.
 *
 * Hex-colour fields accept #rgb or #rrggbb. `primaryText` is more
 * permissive because the UI offers "white" / "black" shortcuts.
 *
 * Fields are optional on the wire: a save with `{ primary: '#...' }`
 * keeps the other fields at their current persisted (or default) value
 * via the controller's merge logic.
 */
export const saveThemeSchema = z
  .object({
    colors: z.object(colorsShape).optional(),
    primary: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.theme.primary.invalid',
      })
      .optional(),
    primaryHover: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.theme.primaryHover.invalid',
      })
      .optional(),
    primaryLight: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.theme.primaryLight.invalid',
      })
      .optional(),
    primaryText: primaryTextSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'validation.theme.atLeastOneField',
  });

export type SaveThemeInput = z.infer<typeof saveThemeSchema>;

/**
 * Theme preset create/update body.
 * Adds name/description on top of the colour map.
 * `name` is required on create (POST) and optional on rename (PUT);
 * we keep it optional here and let the create controller reject an
 * empty name, so one schema serves both routes.
 * `colors` is required (a preset must carry a full or partial palette).
 */
export const saveThemePresetSchema = z
  .object({
    name: z
      .preprocess(
        trimOrUndefined,
        z
          .string()
          .min(1, { message: 'validation.theme.preset.name.required' })
          .max(80, { message: 'validation.theme.preset.name.tooLong' }),
      )
      .optional(),
    description: z
      .preprocess(
        nullableTrim,
        z
          .string()
          .max(200, {
            message: 'validation.theme.preset.description.tooLong',
          })
          .optional(),
      )
      .optional(),
    colors: z
      .object(colorsShape)
      .refine((obj) => Object.keys(obj).length > 0, {
        message: 'validation.theme.preset.colors.required',
      }),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'validation.theme.preset.atLeastOneField',
  });

export type SaveThemePresetInput = z.infer<typeof saveThemePresetSchema>;
