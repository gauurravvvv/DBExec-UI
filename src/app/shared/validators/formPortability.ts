/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: dbexec-api/src/shared/validators/formPortability.ts
 *   FE: dbexec-ui/src/app/shared/validators/formPortability.ts
 * Edit BOTH together — byte identical.
 *
 * Prompt Builder — Phase 8 portability validators (import a form document,
 * save a version as a template). Messages are i18n keys
 * validation.formBuilder.<field>.<rule>. This is Zod 4 — z.record takes two
 * args: z.record(z.string(), z.any()).
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

export const PORTABILITY_LIMITS = {
  NAME_MAX: 200,
  CODE_MAX: 100,
  DESCRIPTION_MAX: 2000,
} as const;

/**
 * The imported document — loose on the tree (the import service tolerates gaps
 * and reports them as warnings), strict on the envelope + optional overrides.
 */
export const importFormSchema = z.object({
  document: z.object({
    schemaVersion: z.string(),
    form: z.object({
      code: z.string().min(1, 'validation.formBuilder.code.required'),
      name: z.string().min(1, 'validation.formBuilder.name.required'),
      description: z.string().nullable().optional(),
      iconKey: z.string().nullable().optional(),
    }),
    sourceVersionNo: z.number().int().nonnegative(),
    tabs: z.array(z.record(z.string(), z.any())).default([]),
    rules: z.array(z.record(z.string(), z.any())).default([]),
    prompts: z.array(z.record(z.string(), z.any())).default([]),
    datasource: z.record(z.string(), z.any()).nullable().optional(),
  }),
  code: z
    .string()
    .max(PORTABILITY_LIMITS.CODE_MAX, 'validation.formBuilder.code.max')
    .optional(),
  name: z
    .string()
    .max(PORTABILITY_LIMITS.NAME_MAX, 'validation.formBuilder.name.max')
    .optional(),
});

export const saveTemplateSchema = z.object({
  name: z
    .string()
    .min(1, 'validation.formBuilder.name.required')
    .max(PORTABILITY_LIMITS.NAME_MAX, 'validation.formBuilder.name.max'),
  description: z
    .string()
    .max(
      PORTABILITY_LIMITS.DESCRIPTION_MAX,
      'validation.formBuilder.description.max',
    )
    .nullable()
    .optional(),
});

export type ImportFormBody = z.infer<typeof importFormSchema>;
export type SaveTemplateBody = z.infer<typeof saveTemplateSchema>;
