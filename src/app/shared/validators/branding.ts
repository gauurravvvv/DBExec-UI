/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/branding.ts
 *   FE: src/app/shared/validators/branding.ts
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

// ── Schemas ────────────────────────────────────────────────────────

/**
 * Branding watermark shape.
 * Two valid states:
 *  - { showWatermark: false } — disable; other fields ignored
 *  - { showWatermark: true, watermarkText, watermarkBgColor,
 *      watermarkTextColor } — enable; text 3-30 chars, colours are hex
 */
export const saveBrandingSchema = z
  .object({
    showWatermark: z.boolean({
      message: 'validation.branding.showWatermark.required',
    }),
    watermarkText: z
      .preprocess(
        trimOrUndefined,
        z
          .string({
            message: 'validation.branding.watermarkText.required',
          })
          .min(3, { message: 'validation.branding.watermarkText.tooShort' })
          .max(30, { message: 'validation.branding.watermarkText.tooLong' }),
      )
      .optional(),
    watermarkBgColor: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.branding.watermarkBgColor.invalid',
      })
      .optional(),
    watermarkTextColor: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.branding.watermarkTextColor.invalid',
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.showWatermark) {
      if (!data.watermarkText) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkText'],
          message: 'validation.branding.watermarkText.required',
        });
      }
      if (!data.watermarkBgColor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkBgColor'],
          message: 'validation.branding.watermarkBgColor.required',
        });
      }
      if (!data.watermarkTextColor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkTextColor'],
          message: 'validation.branding.watermarkTextColor.required',
        });
      }
    }
  });

export type SaveBrandingInput = z.infer<typeof saveBrandingSchema>;

/**
 * Branding preset create/update body.
 * Same watermark shape as above + name/description.
 * `name` is optional here (create controller rejects an empty name)
 * so one schema serves both POST and PUT.
 */
export const saveBrandingPresetSchema = z
  .object({
    name: z
      .preprocess(
        trimOrUndefined,
        z
          .string()
          .min(1, { message: 'validation.branding.preset.name.required' })
          .max(80, { message: 'validation.branding.preset.name.tooLong' }),
      )
      .optional(),
    description: z
      .preprocess(
        nullableTrim,
        z
          .string()
          .max(200, {
            message: 'validation.branding.preset.description.tooLong',
          })
          .optional(),
      )
      .optional(),
    showWatermark: z.boolean({
      message: 'validation.branding.preset.showWatermark.required',
    }),
    watermarkText: z
      .preprocess(
        trimOrUndefined,
        z
          .string({
            message: 'validation.branding.preset.watermarkText.required',
          })
          .min(3, {
            message: 'validation.branding.preset.watermarkText.tooShort',
          })
          .max(30, {
            message: 'validation.branding.preset.watermarkText.tooLong',
          }),
      )
      .optional(),
    watermarkBgColor: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.branding.preset.watermarkBgColor.invalid',
      })
      .optional(),
    watermarkTextColor: z
      .string()
      .regex(HEX_COLOR, {
        message: 'validation.branding.preset.watermarkTextColor.invalid',
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.showWatermark) {
      if (!data.watermarkText) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkText'],
          message: 'validation.branding.preset.watermarkText.required',
        });
      }
      if (!data.watermarkBgColor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkBgColor'],
          message: 'validation.branding.preset.watermarkBgColor.required',
        });
      }
      if (!data.watermarkTextColor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['watermarkTextColor'],
          message: 'validation.branding.preset.watermarkTextColor.required',
        });
      }
    }
  });

export type SaveBrandingPresetInput = z.infer<typeof saveBrandingPresetSchema>;
