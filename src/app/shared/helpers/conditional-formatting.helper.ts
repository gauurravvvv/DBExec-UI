/**
 * ─── Conditional Formatting: shared rule model + evaluator ───────────
 *
 * One pure evaluator shared by BOTH render paths:
 *   - echart-visual  → per-datum `itemStyle.color` (bars/points) via the
 *     option builder (see applyConditionalFormatting in
 *     echarts-option-builder.ts).
 *   - table-visual   → per-cell text / background colour.
 *
 * Rules live on `visual_config.config.conditionalFormatting[]` (JSONB —
 * no migration). This file owns the rule SHAPE and the value-comparison
 * logic so the two surfaces can never disagree on when a rule fires.
 *
 * The evaluator is intentionally free of any ECharts / DOM dependency —
 * it takes a raw cell value (+ optional whole-row context for
 * cross-field rules) and returns the matched rule's presentation, or
 * undefined when nothing matches.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Comparison operators a conditional-formatting rule can use. */
export type ConditionalOperator =
  | 'eq' // equals
  | 'ne' // not equals
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'between' // value BETWEEN value AND value2 (inclusive)
  | 'notBetween'
  | 'contains' // string contains (case-insensitive)
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty' // null / undefined / ''
  | 'isNotEmpty';

/**
 * Where a rule's colour is applied. For charts, 'bar'/'point' colour the
 * datum's mark; 'text' colours the data label. For tables, 'cell' paints
 * the cell background, 'text' the cell foreground.
 */
export type ConditionalAppliesTo =
  'cell' | 'bar' | 'point' | 'text' | 'background';

/**
 * A single conditional-formatting rule. `targetField` is the row key the
 * rule tests. When omitted, the rule tests the datum's own value (the
 * measure) — convenient for single-measure charts where there is no
 * ambiguity about which field to colour by.
 *
 * `value` / `value2` are compared against the field. They are typed
 * loosely (string | number | date-ISO) because the field's dataType is
 * only known at author time; the evaluator coerces both sides to a
 * comparable shape (numeric when both look numeric, else string).
 */
export interface ConditionalRule {
  /** Stable id for *ngFor trackBy + editor row identity. */
  id?: string;
  /** Row key to test. Falsy → test the datum's own value. */
  targetField?: string;
  operator: ConditionalOperator;
  value?: string | number | null;
  value2?: string | number | null;
  /** Presentation colour (hex / rgb string). */
  color?: string;
  /** Optional text colour when appliesTo paints a background. */
  textColor?: string;
  appliesTo?: ConditionalAppliesTo;
  /** Author-time hint of the field type so date compares parse correctly. */
  dataType?: 'number' | 'string' | 'date' | 'boolean';
  /** When false, the rule is retained but not evaluated. */
  enabled?: boolean;
}

/** The presentation a matched rule contributes. */
export interface ConditionalMatch {
  color?: string;
  textColor?: string;
  appliesTo: ConditionalAppliesTo;
  rule: ConditionalRule;
}

// ── Coercion helpers ────────────────────────────────────────────────

const isNil = (v: unknown): boolean =>
  v === null || v === undefined || v === '';

/** True when the string/number looks like a finite number. */
function looksNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' && v.trim() !== '')
    return Number.isFinite(Number(v));
  return false;
}

/**
 * Parse a value to a millisecond timestamp when both operands are meant
 * to be compared as dates. Returns NaN when unparseable.
 */
function toTime(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    return t;
  }
  return NaN;
}

/**
 * Compare two operands with the given operator. `dataType` biases the
 * coercion: 'date' parses both sides to timestamps; 'number' coerces
 * numerically; otherwise a numeric compare is used when both sides look
 * numeric, falling back to a case-insensitive string compare.
 */
function compare(
  cell: unknown,
  op: ConditionalOperator,
  a: unknown,
  b: unknown,
  dataType?: ConditionalRule['dataType'],
): boolean {
  // Emptiness operators short-circuit — they don't consult a/b.
  if (op === 'isEmpty') return isNil(cell);
  if (op === 'isNotEmpty') return !isNil(cell);

  // A missing cell can only satisfy the emptiness operators handled above.
  if (isNil(cell)) return false;

  // String-family operators always compare as (lowercased) strings.
  if (
    op === 'contains' ||
    op === 'notContains' ||
    op === 'startsWith' ||
    op === 'endsWith'
  ) {
    const s = String(cell).toLowerCase();
    const needle = String(a ?? '').toLowerCase();
    switch (op) {
      case 'contains':
        return s.includes(needle);
      case 'notContains':
        return !s.includes(needle);
      case 'startsWith':
        return s.startsWith(needle);
      case 'endsWith':
        return s.endsWith(needle);
    }
  }

  // Decide the numeric/date/string comparison basis.
  let lhs: number | string;
  let rhsA: number | string;
  let rhsB: number | string;

  if (dataType === 'date') {
    lhs = toTime(cell);
    rhsA = toTime(a);
    rhsB = toTime(b);
  } else if (
    dataType === 'number' ||
    (dataType === undefined && looksNumeric(cell) && looksNumeric(a))
  ) {
    lhs = Number(cell);
    rhsA = Number(a);
    rhsB = Number(b);
  } else {
    lhs = String(cell).toLowerCase();
    rhsA = String(a ?? '').toLowerCase();
    rhsB = String(b ?? '').toLowerCase();
  }

  switch (op) {
    case 'eq':
      return lhs === rhsA;
    case 'ne':
      return lhs !== rhsA;
    case 'gt':
      return lhs > rhsA;
    case 'gte':
      return lhs >= rhsA;
    case 'lt':
      return lhs < rhsA;
    case 'lte':
      return lhs <= rhsA;
    case 'between':
      return lhs >= rhsA && lhs <= rhsB;
    case 'notBetween':
      return !(lhs >= rhsA && lhs <= rhsB);
    default:
      return false;
  }
}

/**
 * Evaluate one rule against a cell value (+ optional whole row for
 * cross-field rules). Returns true when the rule fires.
 */
export function ruleMatches(
  rule: ConditionalRule,
  cellValue: unknown,
  row?: Record<string, any>,
): boolean {
  if (!rule || rule.enabled === false || !rule.operator) return false;
  // Cross-field: when targetField is set and a row is supplied, test that
  // field; otherwise test the value handed in (the datum's own measure).
  const subject =
    rule.targetField &&
    row &&
    Object.prototype.hasOwnProperty.call(row, rule.targetField)
      ? row[rule.targetField]
      : cellValue;
  return compare(
    subject,
    rule.operator,
    rule.value,
    rule.value2,
    rule.dataType,
  );
}

/**
 * Resolve the FIRST matching rule for a value into its presentation.
 * First-match-wins mirrors the way spreadsheet CF stacks resolve, and
 * keeps the editor's rule order meaningful. Returns undefined when no
 * rule matches (caller keeps the base colour).
 *
 * `filterAppliesTo` narrows evaluation to rules whose appliesTo is in the
 * allowed set — e.g. the chart path only wants 'bar' | 'point' | 'text',
 * the table path wants 'cell' | 'text' | 'background'. A rule with no
 * appliesTo is treated as matching every surface (sensible default).
 */
export function resolveConditionalStyle(
  rules: ConditionalRule[] | undefined,
  cellValue: unknown,
  row?: Record<string, any>,
  filterAppliesTo?: ConditionalAppliesTo[],
): ConditionalMatch | undefined {
  if (!Array.isArray(rules) || rules.length === 0) return undefined;
  for (const rule of rules) {
    const applies = rule.appliesTo;
    if (filterAppliesTo && applies && !filterAppliesTo.includes(applies)) {
      continue;
    }
    if (ruleMatches(rule, cellValue, row)) {
      return {
        color: rule.color,
        textColor: rule.textColor,
        appliesTo: applies || (filterAppliesTo?.[0] ?? 'cell'),
        rule,
      };
    }
  }
  return undefined;
}

/** Operator dropdown option list (i18n keys as labels). Shared by editor. */
export const CONDITIONAL_OPERATOR_OPTIONS: {
  label: string;
  value: ConditionalOperator;
  /** Number of operand inputs the operator needs (0, 1, or 2). */
  operands: 0 | 1 | 2;
}[] = [
  { label: 'ANALYSES.CF.OP.EQ', value: 'eq', operands: 1 },
  { label: 'ANALYSES.CF.OP.NE', value: 'ne', operands: 1 },
  { label: 'ANALYSES.CF.OP.GT', value: 'gt', operands: 1 },
  { label: 'ANALYSES.CF.OP.GTE', value: 'gte', operands: 1 },
  { label: 'ANALYSES.CF.OP.LT', value: 'lt', operands: 1 },
  { label: 'ANALYSES.CF.OP.LTE', value: 'lte', operands: 1 },
  { label: 'ANALYSES.CF.OP.BETWEEN', value: 'between', operands: 2 },
  { label: 'ANALYSES.CF.OP.NOT_BETWEEN', value: 'notBetween', operands: 2 },
  { label: 'ANALYSES.CF.OP.CONTAINS', value: 'contains', operands: 1 },
  { label: 'ANALYSES.CF.OP.NOT_CONTAINS', value: 'notContains', operands: 1 },
  { label: 'ANALYSES.CF.OP.STARTS_WITH', value: 'startsWith', operands: 1 },
  { label: 'ANALYSES.CF.OP.ENDS_WITH', value: 'endsWith', operands: 1 },
  { label: 'ANALYSES.CF.OP.IS_EMPTY', value: 'isEmpty', operands: 0 },
  { label: 'ANALYSES.CF.OP.IS_NOT_EMPTY', value: 'isNotEmpty', operands: 0 },
];

/** How many operand inputs an operator needs (for the editor). */
export function operandCount(op: ConditionalOperator | undefined): 0 | 1 | 2 {
  const found = CONDITIONAL_OPERATOR_OPTIONS.find(o => o.value === op);
  return found ? found.operands : 1;
}
