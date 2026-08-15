/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/formStructure.ts
 *   FE: src/app/shared/validators/formStructure.ts
 *
 * Prompt Builder — structure validators (tabs / sections / fields / reorder).
 * Skeleton for Phase 0; Phase 3 fills in the schemas. The 1..4 grid bound is
 * the belt-and-suspenders companion to the DB @Check on columns / colSpan.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

export const FORM_STRUCTURE_LIMITS = {
  TAB_NAME_MIN: 1,
  TAB_NAME_MAX: 80,
  SECTION_NAME_MAX: 120,
  FIELD_LABEL_MAX: 160,
  FIELD_HELP_MAX: 240,
  GRID_MIN: 1,
  GRID_MAX: 4,
} as const;

// Grid column count / colSpan — mirrors the DB @Check(1..4). Exported now so
// Phase 3 schemas (createTabSchema / createSectionSchema / createFieldSchema /
// updateFieldSchema / reorderSchema) reuse one bound.
export const gridSpanSchema = z
  .number()
  .int()
  .min(FORM_STRUCTURE_LIMITS.GRID_MIN)
  .max(FORM_STRUCTURE_LIMITS.GRID_MAX);

// ── shared enums (mirror the DB varchar discriminators) ───────────────
export const BLOCK_TYPES = [
  'section_heading',
  'static_text',
  'divider',
  'spacer',
] as const;
export const REORDER_TARGETS = ['tabs', 'sections', 'fields'] as const;

// Per-locale label/help maps (locale code → string). Zod 4 requires two args.
const localeMap = z.record(z.string(), z.string());

// ── tabs ──────────────────────────────────────────────────────────────
// Maps to FbFormTab (label, icon, tabOrder, isActive, labelI18n).
export const createTabSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(FORM_STRUCTURE_LIMITS.TAB_NAME_MIN, {
        message: 'validation.formBuilder.tab.name.required',
      })
      .max(FORM_STRUCTURE_LIMITS.TAB_NAME_MAX, {
        message: 'validation.formBuilder.tab.name.max',
      }),
    icon: z.string().trim().max(48).nullish(),
    isActive: z.boolean().optional(),
    sequence: z.number().int().min(0).optional(),
    localeLabels: localeMap.nullish(),
  })
  .strict();

export const updateTabSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(FORM_STRUCTURE_LIMITS.TAB_NAME_MIN, {
        message: 'validation.formBuilder.tab.name.required',
      })
      .max(FORM_STRUCTURE_LIMITS.TAB_NAME_MAX, {
        message: 'validation.formBuilder.tab.name.max',
      })
      .optional(),
    icon: z.string().trim().max(48).nullish(),
    isActive: z.boolean().optional(),
    localeLabels: localeMap.nullish(),
  })
  .strict();

// ── sections ──────────────────────────────────────────────────────────
// Maps to FbFormSection (label, columns, collapsible, isActive, sectionOrder,
// labelI18n). The entity has NO collapsedByDefault column, so it is not accepted.
export const createSectionSchema = z
  .object({
    tabId: z
      .string()
      .uuid({ message: 'validation.formBuilder.section.tabId.uuid' }),
    name: z
      .string()
      .trim()
      .min(1, { message: 'validation.formBuilder.section.name.required' })
      .max(FORM_STRUCTURE_LIMITS.SECTION_NAME_MAX, {
        message: 'validation.formBuilder.section.name.max',
      }),
    columns: gridSpanSchema.optional(),
    collapsible: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sequence: z.number().int().min(0).optional(),
    localeLabels: localeMap.nullish(),
  })
  .strict();

export const updateSectionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'validation.formBuilder.section.name.required' })
      .max(FORM_STRUCTURE_LIMITS.SECTION_NAME_MAX, {
        message: 'validation.formBuilder.section.name.max',
      })
      .optional(),
    columns: gridSpanSchema.optional(),
    collapsible: z.boolean().optional(),
    isActive: z.boolean().optional(),
    tabId: z.string().uuid().optional(), // move section to another tab (same version)
    localeLabels: localeMap.nullish(),
  })
  .strict();

// ── fields / placements ───────────────────────────────────────────────
// Maps to FbFormField. Exactly one of (promptId, blockType) is required.
export const createFieldSchema = z
  .object({
    sectionId: z
      .string()
      .uuid({ message: 'validation.formBuilder.field.sectionId.uuid' }),
    promptId: z.string().uuid().nullish(),
    blockType: z.enum(BLOCK_TYPES).nullish(),
    blockContent: z.string().nullish(),
    sequence: z.number().int().min(0).optional(),
    colSpan: gridSpanSchema.optional(),
    labelOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_LABEL_MAX)
      .nullish(),
    helpOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_HELP_MAX)
      .nullish(),
    placeholderOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_LABEL_MAX)
      .nullish(),
    defaultOverride: z.any().nullish(),
    isMandatory: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    isReadonly: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    allowedOperators: z.array(z.string().trim().min(1)).nullish(),
    localeLabels: localeMap.nullish(),
    localeHelps: localeMap.nullish(),
  })
  .strict()
  // exactly one of (promptId, blockType) — the promptId-xor-blockType rule.
  .refine(b => (b.promptId == null) !== (b.blockType == null), {
    message: 'validation.formBuilder.field.promptOrBlock',
    path: ['promptId'],
  });

export const updateFieldSchema = z
  .object({
    sectionId: z.string().uuid().optional(), // move to another section (same version)
    colSpan: gridSpanSchema.optional(),
    labelOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_LABEL_MAX)
      .nullish(),
    helpOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_HELP_MAX)
      .nullish(),
    placeholderOverride: z
      .string()
      .trim()
      .max(FORM_STRUCTURE_LIMITS.FIELD_LABEL_MAX)
      .nullish(),
    defaultOverride: z.any().nullish(),
    blockContent: z.string().nullish(),
    isMandatory: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    isReadonly: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    allowedOperators: z.array(z.string().trim().min(1)).nullish(),
    localeLabels: localeMap.nullish(),
    localeHelps: localeMap.nullish(),
  })
  .strict();

// ── reorder ───────────────────────────────────────────────────────────
export const reorderSchema = z
  .object({
    target: z.enum(REORDER_TARGETS),
    parentId: z.string().uuid().optional(),
    orderedIds: z
      .array(z.string().uuid())
      .min(1, { message: 'validation.formBuilder.reorder.orderedIds.required' })
      .max(1000),
  })
  .strict()
  // parentId is required for sections/fields, optional-ignored for tabs.
  .refine(b => b.target === 'tabs' || !!b.parentId, {
    message: 'validation.formBuilder.reorder.parentId.required',
    path: ['parentId'],
  });

export type CreateTabBody = z.infer<typeof createTabSchema>;
export type UpdateTabBody = z.infer<typeof updateTabSchema>;
export type CreateSectionBody = z.infer<typeof createSectionSchema>;
export type UpdateSectionBody = z.infer<typeof updateSectionSchema>;
export type CreateFieldBody = z.infer<typeof createFieldSchema>;
export type UpdateFieldBody = z.infer<typeof updateFieldSchema>;
export type ReorderBody = z.infer<typeof reorderSchema>;
