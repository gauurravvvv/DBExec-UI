/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated at the same relative path in the sibling repo:
 *   BE: src/shared/validators/formRules.ts
 *   FE: src/app/shared/validators/formRules.ts
 * The two are byte-identical EXCEPT the `validateExpression` import path (the
 * engine lives under services/formRules on the BE, under modules/form-builder/
 * logic on the FE) — exactly as other mirrored validators handle relative paths.
 *
 * Prompt Builder — rule + field-permission validators. Phase 5 fills the rule
 * schemas (condition AST + action). setValueExpr is bounded at 1000 chars to
 * match the expr-eval sandbox and validated through the SAME sandbox at save.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { validateExpression } from '../../modules/form-builder/logic/exprEngine';

export const FORM_RULES_LIMITS = {
  RULE_NAME_MIN: 1,
  RULE_NAME_MAX: 120,
  SET_VALUE_EXPR_MAX: 1000,
  MESSAGE_MAX: 2000,
  FIELD_KEY_MAX: 128,
  TARGET_KEYS_MAX: 200,
  GROUP_CHILDREN_MAX: 50,
} as const;

export const FIELD_ACCESS_VALUES = ['none', 'read', 'write'] as const;

// Access enum reused by Phase 6 setFieldPermissionSchema. Exported now so the
// FE grid + BE validator share one source.
export const fieldAccessSchema = z.enum(FIELD_ACCESS_VALUES);
export type FieldAccess = z.infer<typeof fieldAccessSchema>;

// ── Trigger AST (persisted shape) ────────────────────────────────────────────
// Leaf op set is the EXTENDED persisted set; the ruleAst adapter lowers these to
// the engine's narrower op set. Only engine-expressible triggers persist in v1.
export const RULE_LEAF_OPS = [
  'eq', 'ne', 'gt', 'lt', 'gte', 'lte',
  'in', 'notIn', 'contains', 'notContains', 'isEmpty', 'isNotEmpty',
] as const;

export const ruleLeafSchema = z.object({
  kind: z.literal('leaf'),
  fieldKey: z.string().min(1).max(FORM_RULES_LIMITS.FIELD_KEY_MAX),
  op: z.enum(RULE_LEAF_OPS),
  value: z.unknown().optional(),
});
export type RuleLeafShape = z.infer<typeof ruleLeafSchema>;

export type RuleGroupShape = {
  kind: 'group';
  combinator: 'and' | 'or' | 'not';
  children: Array<RuleGroupShape | RuleLeafShape>;
};

export const ruleGroupSchema: z.ZodType<RuleGroupShape> = z.lazy(() =>
  z
    .object({
      kind: z.literal('group'),
      combinator: z.enum(['and', 'or', 'not']),
      children: z
        .array(z.union([ruleGroupSchema, ruleLeafSchema]))
        .min(1)
        .max(FORM_RULES_LIMITS.GROUP_CHILDREN_MAX),
    })
    .refine((g) => g.combinator !== 'not' || g.children.length === 1, {
      message: 'validation.formBuilder.rule.not.singleChild',
    }),
) as z.ZodType<RuleGroupShape>;

export const ruleTriggerSchema = z.union([ruleGroupSchema, ruleLeafSchema]);
export type RuleTriggerShape = z.infer<typeof ruleTriggerSchema>;

// ── Action ───────────────────────────────────────────────────────────────────
export const RULE_ACTIONS = [
  'show', 'hide', 'enable', 'disable',
  'require', 'optional', 'set_value', 'clear', 'validate',
] as const;
export const ruleActionSchema = z.enum(RULE_ACTIONS);
export type RuleActionValue = z.infer<typeof ruleActionSchema>;

// ── Create / update rule ─────────────────────────────────────────────────────
const ruleBodyShape = {
  name: z.string().min(FORM_RULES_LIMITS.RULE_NAME_MIN).max(FORM_RULES_LIMITS.RULE_NAME_MAX),
  trigger: ruleTriggerSchema,
  action: ruleActionSchema,
  targetFieldKeys: z
    .array(z.string().min(1).max(FORM_RULES_LIMITS.FIELD_KEY_MAX))
    .min(1)
    .max(FORM_RULES_LIMITS.TARGET_KEYS_MAX),
  setValueExpr: z.string().max(FORM_RULES_LIMITS.SET_VALUE_EXPR_MAX).optional(),
  message: z.string().max(FORM_RULES_LIMITS.MESSAGE_MAX).optional(),
  messageI18n: z.record(z.string(), z.string()).optional(),
  ruleOrder: z.number().int().min(0).optional(),
  isEnabled: z.boolean().optional(),
};

/** Shared cross-field checks: set_value needs a valid expr; validate needs a message. */
const applyRuleRefinements = (
  r: {
    action?: RuleActionValue;
    setValueExpr?: string;
    message?: string;
    messageI18n?: Record<string, string>;
  },
  ctx: z.RefinementCtx,
): void => {
  if (r.action === 'set_value') {
    if (!r.setValueExpr) {
      ctx.addIssue({
        code: 'custom',
        path: ['setValueExpr'],
        message: 'validation.formBuilder.rule.action.missingField',
      });
    } else if (!validateExpression(r.setValueExpr).ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['setValueExpr'],
        message: 'validation.formBuilder.rule.expr.invalid',
      });
    }
  }
  if (r.action === 'validate' && !r.message && !r.messageI18n) {
    ctx.addIssue({
      code: 'custom',
      path: ['message'],
      message: 'validation.formBuilder.rule.action.missingField',
    });
  }
};

export const createRuleSchema = z
  .object(ruleBodyShape)
  .superRefine(applyRuleRefinements);
export type CreateRuleBody = z.infer<typeof createRuleSchema>;

// Update: every field optional; the same cross-field checks re-apply (they only
// fire when `action` is present in the patch).
export const updateRuleSchema = z
  .object(ruleBodyShape)
  .partial()
  .superRefine(applyRuleRefinements);
export type UpdateRuleBody = z.infer<typeof updateRuleSchema>;

// ── Validate-rules report request ────────────────────────────────────────────
export const validateRulesSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  asRole: z.string().uuid().optional(),
});
export type ValidateRulesBody = z.infer<typeof validateRulesSchema>;
