/**
 * ruleAst.adapter — bridge between the PERSISTED rule trigger shape and the
 * ported engine's Condition shape. NON-fenced (not byte-parity code): it lives
 * beside the engines so the engine files can stay byte-identical to their FE
 * copies while this adapter absorbs the persisted-vs-engine reconciliation.
 *
 * Persisted (FbFormRule.trigger, data-model §6.2): `{ kind:'leaf', fieldKey, op,
 * value? }` / `{ kind:'group', combinator:'and'|'or'|'not', children[] }` with an
 * EXTENDED op set (adds gte,lte,notIn,notContains,isNotEmpty). The engine uses
 * `{ op, field, value? }` / `{ op:'and'|'or', conditions[] }` / `{ op:'not',
 * condition }` with the NARROWER op set (eq,ne,gt,lt,in,contains,isEmpty).
 *
 * toEngineCondition lowers the persisted AST → engine Condition (extended ops
 * expressed via not-wrapping / isEmpty value:false). toPersistedAst is the
 * inverse for the round-trip from the builder, lifting the not-wraps back to the
 * extended ops so a saved-then-reloaded rule keeps its authored shape.
 */
import { Condition, LeafCondition, LeafOperator, NotCondition } from './ruleEngine';

// ── The persisted shapes (what FbFormRule.trigger stores) ────────────────────
export type PersistedLeafOp =
  | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'in' | 'notIn' | 'contains' | 'notContains' | 'isEmpty' | 'isNotEmpty';
export interface PersistedLeaf {
  kind: 'leaf';
  fieldKey: string;
  op: PersistedLeafOp;
  value?: unknown;
}
export interface PersistedGroup {
  kind: 'group';
  combinator: 'and' | 'or' | 'not';
  children: PersistedAst[];
}
export type PersistedAst = PersistedLeaf | PersistedGroup;

/** How each persisted leaf op lowers onto an engine leaf op. */
export const ENGINE_OP_MAP: Record<
  PersistedLeafOp,
  { op: LeafOperator; wrapNot?: boolean; valueFalse?: boolean } | null
> = {
  eq: { op: 'eq' },
  ne: { op: 'ne' },
  gt: { op: 'gt' },
  lt: { op: 'lt' },
  gte: { op: 'lt', wrapNot: true },
  lte: { op: 'gt', wrapNot: true },
  in: { op: 'in' },
  notIn: { op: 'in', wrapNot: true },
  contains: { op: 'contains' },
  notContains: { op: 'contains', wrapNot: true },
  isEmpty: { op: 'isEmpty' },
  isNotEmpty: { op: 'isEmpty', valueFalse: true },
};

const isGroup = (ast: PersistedAst): ast is PersistedGroup => ast.kind === 'group';

/**
 * Persisted trigger → engine Condition. Extended ops are lowered per the map (a
 * `wrapNot` leaf becomes `{op:'not', condition:<leaf>}`; a `valueFalse` leaf
 * becomes `{op:'isEmpty', field, value:false}`). An unmappable/unknown op throws
 * (the caller must have Zod-gated the trigger to the persisted op set).
 */
export const toEngineCondition = (ast: PersistedAst): Condition => {
  if (isGroup(ast)) {
    if (ast.combinator === 'not') {
      const [first] = ast.children;
      return { op: 'not', condition: toEngineCondition(first) };
    }
    return { op: ast.combinator, conditions: ast.children.map(toEngineCondition) };
  }

  const mapped = ENGINE_OP_MAP[ast.op];
  if (!mapped) throw new Error(`ruleAst.adapter: unmappable persisted op "${ast.op}"`);

  if (mapped.valueFalse) {
    return { op: mapped.op, field: ast.fieldKey, value: false };
  }
  const leaf: Condition = { op: mapped.op, field: ast.fieldKey, value: ast.value };
  return mapped.wrapNot ? { op: 'not', condition: leaf } : leaf;
};

/** Engine leaf op that a `not`-wrap lifts back to its extended persisted op. */
const NOT_LIFT: Partial<Record<LeafOperator, PersistedLeafOp>> = {
  lt: 'gte',
  gt: 'lte',
  in: 'notIn',
  contains: 'notContains',
};

const isLeafCondition = (cond: Condition): cond is LeafCondition =>
  cond.op !== 'and' && cond.op !== 'or' && cond.op !== 'not';

/**
 * Engine Condition → persisted trigger (round-trip for save from the builder).
 * `not` over a single leaf whose op has an extended inverse lifts back to that
 * op (`not(lt)→gte`, `not(gt)→lte`, `not(in)→notIn`, `not(contains)→notContains`;
 * `isEmpty value:false → isNotEmpty`); any other `not` stays a `combinator:'not'`
 * group with one child.
 */
export const toPersistedAst = (cond: Condition): PersistedAst => {
  if (cond.op === 'and' || cond.op === 'or') {
    return { kind: 'group', combinator: cond.op, children: cond.conditions.map(toPersistedAst) };
  }
  if (cond.op === 'not') {
    const inner = (cond as NotCondition).condition;
    if (isLeafCondition(inner)) {
      const lifted = NOT_LIFT[inner.op];
      if (lifted) {
        return { kind: 'leaf', fieldKey: inner.field, op: lifted, value: inner.value };
      }
    }
    return { kind: 'group', combinator: 'not', children: [toPersistedAst(inner)] };
  }
  // A bare leaf. isEmpty with value:false lifts to isNotEmpty.
  const leaf = cond as LeafCondition;
  if (leaf.op === 'isEmpty' && leaf.value === false) {
    return { kind: 'leaf', fieldKey: leaf.field, op: 'isNotEmpty' };
  }
  return { kind: 'leaf', fieldKey: leaf.field, op: leaf.op, value: leaf.value };
};
