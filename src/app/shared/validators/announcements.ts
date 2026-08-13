/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/announcements.ts
 *   FE: src/app/shared/validators/announcements.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

export const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

// ── Field schemas ──────────────────────────────────────────────────

export const announcementNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.announcements.name.required' })
    .min(1, { message: 'validation.announcements.name.required' })
    .max(255, { message: 'validation.announcements.name.tooLong' }),
);

export const announcementDescriptionSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.announcements.description.required' })
    .min(1, { message: 'validation.announcements.description.required' })
    .max(2000, { message: 'validation.announcements.description.tooLong' }),
);

export const announcementStartTimeSchema = z
  .string()
  .datetime({ message: 'validation.announcements.startTime.invalid' })
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((v) => (v ? new Date(v) : undefined))
  .optional();

export const announcementEndTimeSchema = z
  .string()
  .datetime({ message: 'validation.announcements.endTime.invalid' })
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((v) => (v ? new Date(v) : undefined))
  .optional();

export const announcementBgColorSchema = z
  .preprocess(
    nullableTrim,
    z
      .string()
      .regex(HEX_COLOR_PATTERN, {
        message: 'validation.announcements.bgColor.invalid',
      })
      .optional(),
  )
  .optional();

export const announcementTextColorSchema = z
  .preprocess(
    nullableTrim,
    z
      .string()
      .regex(HEX_COLOR_PATTERN, {
        message: 'validation.announcements.textColor.invalid',
      })
      .optional(),
  )
  .optional();

export const announcementStatusSchema = z
  .number({
    message: 'validation.announcements.status.invalid',
  })
  .refine((v) => v === 0 || v === 1, {
    message: 'validation.announcements.status.invalid',
  })
  .optional();

// ── Composite schemas ──────────────────────────────────────────────

/** POST /api/v1/announcements/add body. */
export const addAnnouncementSchema = z
  .object({
    name: announcementNameSchema,
    description: announcementDescriptionSchema,
    startTime: announcementStartTimeSchema,
    endTime: announcementEndTimeSchema,
    bgColor: announcementBgColorSchema,
    textColor: announcementTextColorSchema,
    status: announcementStatusSchema,
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      if (new Date(data.endTime) <= new Date(data.startTime)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endTime'],
          message: 'validation.announcements.endTime.afterStart',
        });
      }
    }
  });

export type AddAnnouncementInput = z.infer<typeof addAnnouncementSchema>;

/** PUT /api/v1/announcements/update/:id body. All fields optional (PATCH semantics). */
export const updateAnnouncementSchema = z
  .object({
    name: announcementNameSchema.optional(),
    description: announcementDescriptionSchema.optional(),
    startTime: announcementStartTimeSchema,
    endTime: announcementEndTimeSchema,
    bgColor: announcementBgColorSchema,
    textColor: announcementTextColorSchema,
    status: announcementStatusSchema,
    republish: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      if (new Date(data.endTime) <= new Date(data.startTime)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endTime'],
          message: 'validation.announcements.endTime.afterStart',
        });
      }
    }
  });

export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

/** GET /api/v1/announcements/list query params. */
export const listAnnouncementsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  filter: z.string().optional(),
});

export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsSchema>;

/** Route :id parameter for GET /api/v1/announcements/details/:id and DELETE /api/v1/announcements/delete/:id. */
export const announcementIdParamSchema = z.object({
  id: z
    .string({
      message: 'validation.common.id.required',
    })
    .trim()
    .uuid({ message: 'validation.common.id.invalid' }),
});

export type AnnouncementIdParamInput = z.infer<
  typeof announcementIdParamSchema
>;

/** Route :announcementId parameter for POST /api/v1/announcements/dismiss/:announcementId. */
export const dismissAnnouncementParamSchema = z.object({
  announcementId: z
    .string({
      message: 'validation.common.id.required',
    })
    .trim()
    .uuid({ message: 'validation.common.id.invalid' }),
});

export type DismissAnnouncementParamInput = z.infer<
  typeof dismissAnnouncementParamSchema
>;
