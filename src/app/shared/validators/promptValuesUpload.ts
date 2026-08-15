/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/promptValuesUpload.ts
 *   FE: src/app/shared/validators/promptValuesUpload.ts
 *
 * Non-file multipart fields for POST /prompts/:promptId/values/upload
 * (spec 04 §8). The file itself is validated by the multer middleware; this
 * schema validates the column mapping + destructive re-upload justification.
 * Multipart text fields arrive as strings, so hasHeaderRow is coerced.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

const boolFromText = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform(v => v === true || v === 'true');

export const uploadColumnMapSchema = z.object({
  valueColumn: z
    .string({ message: 'validation.prompt.upload.valueColumn.required' })
    .min(1, { message: 'validation.prompt.upload.valueColumn.required' })
    .max(200),
  labelColumn: z.string().max(200).optional(),
  hasHeaderRow: boolFromText.optional().default(true),
  sheet: z.string().max(200).optional(),
  justification: z.string().max(2000).optional(),
});

export type UploadColumnMap = z.infer<typeof uploadColumnMapSchema>;
