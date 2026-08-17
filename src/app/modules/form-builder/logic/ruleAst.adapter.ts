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
 * toEngineCondition maps the persisted AST → engine Condition. The engine now
 * has first-class null-aware `gte`/`lte`/`notIn`/`notContains` operators, so
 * those map 1:1 (no not-wrapping); only `isNotEmpty` still lowers onto
 * `isEmpty value:false`. toPersistedAst is the exact inverse — each engine op
 * maps straight back, and an authored `not`-group round-trips AS a `not`-group.
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

/**
 * How each persisted leaf op maps onto an engine leaf op. The four extended
 * comparators (`gte`/`lte`/`notIn`/`notContains`) are now first-class engine
 * ops with null-aware semantics, so they map 1:1 — no `not`-wrapping. Only
 * `isNotEmpty` still lowers onto `isEmpty` with `value:false`.
 */
export const ENGINE_OP_MAP: Record<
  PersistedLeafOp,
  { op: LeafOperator; valueFalse?: boolean } | null
> = {
  eq: { op: 'eq' },
  ne: { op: 'ne' },
  gt: { op: 'gt' },
  lt: { op: 'lt' },
  gte: { op: 'gte' },
  lte: { op: 'lte' },
  in: { op: 'in' },
  notIn: { op: 'notIn' },
  contains: { op: 'contains' },
  notContains: { op: 'notContains' },
  isEmpty: { op: 'isEmpty' },
  isNotEmpty: { op: 'isEmpty', valueFalse: true },
};

const isGroup = (ast: PersistedAst): ast is PersistedGroup => ast.kind === 'group';

/**
 * Persisted trigger → engine Condition. Each leaf op maps directly per the map;
 * a `valueFalse` leaf (only `isNotEmpty`) becomes `{op:'isEmpty', field,
 * value:false}`. An unmappable/unknown op throws (the caller must have Zod-gated
 * the trigger to the persisted op set).
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
  return { op: mapped.op, field: ast.fieldKey, value: ast.value };
};

/** Engine leaf op → its persisted op. Identity for all except the empty pair. */
const PERSISTED_OP: Partial<Record<LeafOperator, PersistedLeafOp>> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  lt: 'lt',
  gte: 'gte',
  lte: 'lte',
  in: 'in',
  notIn: 'notIn',
  contains: 'contains',
  notContains: 'notContains',
};

/**
 * Engine Condition → persisted trigger (round-trip for save from the builder).
 * Each engine leaf op maps straight back to its persisted op (`isEmpty` with
 * `value:false` lifts to `isNotEmpty`). A `not`-group round-trips AS a
 * `combinator:'not'` group — the adapter no longer rewrites an authored NOT into
 * an inverse leaf, so `not(comparator)` keeps its authored shape.
 */
export const toPersistedAst = (cond: Condition): PersistedAst => {
  if (cond.op === 'and' || cond.op === 'or') {
    return { kind: 'group', combinator: cond.op, children: cond.conditions.map(toPersistedAst) };
  }
  if (cond.op === 'not') {
    const inner = (cond as NotCondition).condition;
    return { kind: 'group', combinator: 'not', children: [toPersistedAst(inner)] };
  }
  // A bare leaf. isEmpty with value:false lifts to isNotEmpty.
  const leaf = cond as LeafCondition;
  if (leaf.op === 'isEmpty' && leaf.value === false) {
    return { kind: 'leaf', fieldKey: leaf.field, op: 'isNotEmpty' };
  }
  return { kind: 'leaf', fieldKey: leaf.field, op: PERSISTED_OP[leaf.op] ?? leaf.op, value: leaf.value };
};
