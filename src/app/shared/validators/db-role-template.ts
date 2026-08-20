/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/db-role-template.ts
 *   FE: src/app/shared/validators/db-role-template.ts
 *
 * Contract for the DB Access role/privilege TEMPLATE CRUD (PDM D10).
 * A template is a reusable recipe — role attributes + a structured
 * privilege set — stored per org, applied against a chosen datasource.
 * Validated identically on the FE form and the BE endpoint.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** Object levels a privilege rule can target. */
export const TEMPLATE_RULE_LEVELS = [
  'database',
  'schema',
  'table',
  'column',
  'sequence',
  'function',
] as const;

/** One privilege rule inside a template's definition. Names/keywords only —
 *  no concrete schema/table (resolved when the template is applied). */
export const templateRuleSchema = z.object({
  action: z.enum(['grant', 'revoke'], {
    message: 'validation.dbRoleTemplate.rule.action',
  }),
  level: z.enum(TEMPLATE_RULE_LEVELS, {
    message: 'validation.dbRoleTemplate.rule.level',
  }),
  privileges: z
    .array(z.string().trim().min(1).max(20))
    .min(1, { message: 'validation.dbRoleTemplate.rule.privileges' })
    .max(20),
  scope: z.enum(['allInSchema', 'named'], {
    message: 'validation.dbRoleTemplate.rule.scope',
  }),
  withGrantOption: z.boolean().optional(),
});

/** Role attribute flags a template sets on create. */
export const templateAttributesSchema = z.object({
  login: z.boolean().optional(),
  inherit: z.boolean().optional(),
  createdb: z.boolean().optional(),
  createrole: z.boolean().optional(),
  superuser: z.boolean().optional(),
  replication: z.boolean().optional(),
  bypassrls: z.boolean().optional(),
  connectionLimit: z.number().int().min(-1).nullable().optional(),
});

/** The full recipe stored in `definition`. */
export const templateDefinitionSchema = z.object({
  attributes: templateAttributesSchema.optional(),
  rules: z.array(templateRuleSchema).max(100).optional(),
});

/** Create body. `connectorId` null/omitted → org-wide template. */
export const createDbRoleTemplateSchema = z.object({
  name: z
    .string({ message: 'validation.dbRoleTemplate.name.required' })
    .trim()
    .min(1, { message: 'validation.dbRoleTemplate.name.required' })
    .max(100, { message: 'validation.dbRoleTemplate.name.max' }),
  description: z.string().trim().max(250).nullable().optional(),
  connectorId: z.string().uuid().nullable().optional(),
  definition: templateDefinitionSchema,
  sortOrder: z.number().int().min(0).optional(),
});

/** Update body — same shape; the controller refuses built-ins. */
export const updateDbRoleTemplateSchema = createDbRoleTemplateSchema.partial().extend({
  definition: templateDefinitionSchema.optional(),
});

/** Bulk-delete body. */
export const bulkDeleteDbRoleTemplateSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, { message: 'validation.dbRoleTemplate.ids.required' })
    .max(100),
});

export type CreateDbRoleTemplateInput = z.infer<
  typeof createDbRoleTemplateSchema
>;
export type UpdateDbRoleTemplateInput = z.infer<
  typeof updateDbRoleTemplateSchema
>;
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;
