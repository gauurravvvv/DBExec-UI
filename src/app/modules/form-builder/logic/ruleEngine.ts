/**
 * ruleEngine — declarative conditional-logic evaluator for the Form Builder
 * (FORM_BUILDER_PRD F3.1). Framework-agnostic, pure TypeScript: the SAME source
 * runs on the Node server (authoritative, on capture/validation) and on the
 * Angular client (live UX). The FE keeps a BYTE-IDENTICAL copy at
 * `dbexec-ui/src/app/modules/form-builder/logic/ruleEngine.ts`; the FE parity test
 * `rule-parity.spec.ts` asserts the two files' fenced regions match. Do NOT add any
 * framework or Node-only import to this file.
 *
 * A rule has a `trigger` (a JSON condition AST over field keys) and an `action`.
 * When the trigger evaluates true, the action is applied to `targetFieldKeys`,
 * overriding each field's static (visible/required/disabled) base state. A
 * `validate` action is NOT a state override — its trigger expresses an assertion
 * that must HOLD; when it does not, the validation engine raises the rule's
 * `message` against the target fields (cross-field validation, F3.4).
 */

/* PARITY:START — everything below must stay byte-identical to the FE copy. */

export type LeafOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains' | 'isEmpty';
export type LogicalOperator = 'and' | 'or' | 'not';
export type ConditionOperator = LeafOperator | LogicalOperator;

/** A single comparison against one field's value. */
export interface LeafCondition {
  op: LeafOperator;
  field: string;
  value?: unknown;
}
/** A boolean combination of sub-conditions. */
export interface AndOrCondition {
  op: 'and' | 'or';
  conditions: Condition[];
}
/** Negation of a sub-condition. */
export interface NotCondition {
  op: 'not';
  condition: Condition;
}
export type Condition = LeafCondition | AndOrCondition | NotCondition;

export type RuleAction =
  | 'show'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'require'
  | 'optional'
  | 'set_value'
  | 'clear'
  | 'validate';

/** The shape the evaluator needs from a persisted `form_rule` row. */
export interface FormRuleLike {
  formRuleId?: string;
  name?: string;
  order?: number;
  trigger: Condition;
  action: RuleAction;
  targetFieldKeys: string[];
  setValueExpr?: string | null;
  message?: string | null;
}

/** Static (pre-rule) state of a field, from the resolved schema. */
export interface FieldBaseState {
  visible: boolean;
  required: boolean;
  disabled: boolean;
}

/** Effective state of a field after all rules are applied. */
export interface FieldEffectiveState extends FieldBaseState {
  /** Present only when a set_value/clear rule fired; carries the new value. */
  setValue?: { value: unknown };
}

/** A cross-field validation failure produced by a `validate` rule. */
export interface RuleValidationFailure {
  message: string;
  targetFieldKeys: string[];
}

/** True for null/undefined/empty-string/empty-array — the `isEmpty` operator. */
export const isEmptyValue = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === '' ||
  (Array.isArray(v) && v.length === 0);

/** Loose scalar equality: null-safe, and string/number agnostic for choices. */
const looseEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return String(a) === String(b);
};

/** Coerce to a number for ordered comparison; dates parse from ISO strings. */
const toComparable = (v: unknown): number | string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v);
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== '') return n;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  return s;
};

/** Evaluate a leaf comparison against the current form values. */
const evaluateLeaf = (cond: LeafCondition, values: Record<string, unknown>): boolean => {
  const actual = values ? values[cond.field] : undefined;
  switch (cond.op) {
    case 'eq':
      return looseEqual(actual, cond.value);
    case 'ne':
      return !looseEqual(actual, cond.value);
    case 'gt':
    case 'lt': {
      const a = toComparable(actual);
      const b = toComparable(cond.value);
      if (a == null || b == null || typeof a !== typeof b) return false;
      return cond.op === 'gt' ? a > b : a < b;
    }
    case 'in': {
      const list = Array.isArray(cond.value) ? cond.value : [];
      if (Array.isArray(actual)) return actual.some(x => list.some(y => looseEqual(x, y)));
      return list.some(y => looseEqual(actual, y));
    }
    case 'contains': {
      if (Array.isArray(actual)) return actual.some(x => looseEqual(x, cond.value));
      if (actual == null) return false;
      return String(actual).includes(String(cond.value));
    }
    case 'isEmpty': {
      const empty = isEmptyValue(actual);
      // `value:false` inverts the check ("is NOT empty").
      return cond.value === false ? !empty : empty;
    }
    default:
      return false;
  }
};

/** Recursively evaluate a condition AST to a boolean. */
export const evaluateCondition = (
  cond: Condition,
  values: Record<string, unknown>,
): boolean => {
  if (!cond || typeof cond !== 'object') return false;
  switch (cond.op) {
    case 'and':
      return (cond.conditions ?? []).every(c => evaluateCondition(c, values));
    case 'or':
      return (cond.conditions ?? []).some(c => evaluateCondition(c, values));
    case 'not':
      return !evaluateCondition(cond.condition, values);
    default:
      return evaluateLeaf(cond as LeafCondition, values);
  }
};

/** Apply one fired rule's action to a single field's effective state. */
const applyAction = (
  target: FieldEffectiveState,
  rule: FormRuleLike,
  values: Record<string, unknown>,
  evalExpr?: (expr: string, values: Record<string, unknown>) => unknown,
): void => {
  switch (rule.action) {
    case 'show':
      target.visible = true;
      break;
    case 'hide':
      target.visible = false;
      break;
    case 'enable':
      target.disabled = false;
      break;
    case 'disable':
      target.disabled = true;
      break;
    case 'require':
      target.required = true;
      break;
    case 'optional':
      target.required = false;
      break;
    case 'set_value':
      target.setValue = {
        value:
          rule.setValueExpr && evalExpr
            ? evalExpr(rule.setValueExpr, values)
            : (rule.setValueExpr ?? null),
      };
      break;
    case 'clear':
      target.setValue = { value: null };
      break;
    default:
      break;
  }
};

/**
 * Fold every logic rule over the field base-state map, in `order`. Returns the
 * effective per-field state. `validate` rules are ignored here (see
 * `evaluateValidationRules`). An optional `evalExpr` wires the expression engine
 * for `set_value` rules; without it a `set_value` uses the literal expr string.
 */
export const applyRules = (
  rules: FormRuleLike[],
  values: Record<string, unknown>,
  base: Record<string, FieldBaseState>,
  evalExpr?: (expr: string, values: Record<string, unknown>) => unknown,
): Record<string, FieldEffectiveState> => {
  const state: Record<string, FieldEffectiveState> = {};
  for (const key of Object.keys(base ?? {})) state[key] = { ...base[key] };

  const ordered = [...(rules ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const rule of ordered) {
    if (!rule || rule.action === 'validate') continue;
    if (!evaluateCondition(rule.trigger, values)) continue;
    for (const key of rule.targetFieldKeys ?? []) {
      if (!state[key]) state[key] = { visible: true, required: false, disabled: false };
      applyAction(state[key], rule, values, evalExpr);
    }
  }
  return state;
};

/**
 * Evaluate `validate` rules. A validation rule's `trigger` expresses the
 * assertion that must hold for the record to be valid; when it does NOT hold the
 * rule fails and its `message` is raised against the target fields (F3.4).
 */
export const evaluateValidationRules = (
  rules: FormRuleLike[],
  values: Record<string, unknown>,
): RuleValidationFailure[] => {
  const failures: RuleValidationFailure[] = [];
  for (const rule of rules ?? []) {
    if (!rule || rule.action !== 'validate') continue;
    if (evaluateCondition(rule.trigger, values)) continue;
    failures.push({
      message: rule.message ?? 'Validation failed',
      targetFieldKeys: rule.targetFieldKeys ?? [],
    });
  }
  return failures;
};

/** Collect the field keys a condition AST references (for dependency tracking). */
export const conditionFieldKeys = (cond: Condition, acc: string[] = []): string[] => {
  if (!cond || typeof cond !== 'object') return acc;
  if (cond.op === 'and' || cond.op === 'or') {
    for (const c of cond.conditions ?? []) conditionFieldKeys(c, acc);
  } else if (cond.op === 'not') {
    conditionFieldKeys(cond.condition, acc);
  } else if ((cond as LeafCondition).field) {
    if (!acc.includes((cond as LeafCondition).field)) acc.push((cond as LeafCondition).field);
  }
  return acc;
};

/* PARITY:END */
