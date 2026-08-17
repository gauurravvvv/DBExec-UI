/**
 * FE engine behaviour specs — proves the copied `ruleEngine`/`exprEngine`/adapter
 * sources run under jest and evaluate identically to the BE truth table (the full
 * correctness is inherited via the byte-parity pin in `rule-parity.spec.ts`; these
 * port a representative slice of the BE unit cases so a regression in the copied
 * source is caught on the FE too).
 */
import {
  applyRules,
  conditionFieldKeys,
  evaluateCondition,
  evaluateValidationRules,
  FormRuleLike,
  isEmptyValue,
} from './ruleEngine';
import {
  evaluateExpression,
  referencedKeys,
  validateExpression,
} from './exprEngine';
import { PersistedAst, toEngineCondition, toPersistedAst } from './ruleAst.adapter';

describe('ruleEngine — leaf operators', () => {
  const V = { a: 5, s: 'hello', arr: ['x', 'y'], blank: '', z: 0 };
  it('eq/ne are string/number agnostic', () => {
    expect(evaluateCondition({ op: 'eq', field: 'a', value: 5 }, V)).toBe(true);
    expect(evaluateCondition({ op: 'eq', field: 'a', value: '5' }, V)).toBe(true);
    expect(evaluateCondition({ op: 'eq', field: 'a', value: 6 }, V)).toBe(false);
    expect(evaluateCondition({ op: 'ne', field: 'a', value: 6 }, V)).toBe(true);
  });
  it('gt/lt numeric and ISO-date', () => {
    expect(evaluateCondition({ op: 'gt', field: 'a', value: 3 }, V)).toBe(true);
    expect(evaluateCondition({ op: 'lt', field: 'a', value: 1 }, V)).toBe(false);
    const d = { d1: '2026-01-01' };
    expect(evaluateCondition({ op: 'lt', field: 'd1', value: '2026-06-01' }, d)).toBe(true);
  });
  it('in — scalar and multi-value fields', () => {
    expect(evaluateCondition({ op: 'in', field: 'a', value: [5, 6] }, V)).toBe(true);
    expect(evaluateCondition({ op: 'in', field: 'arr', value: ['y', 'q'] }, V)).toBe(true);
    expect(evaluateCondition({ op: 'in', field: 'a', value: [1, 2] }, V)).toBe(false);
  });
  it('contains — array membership + substring', () => {
    expect(evaluateCondition({ op: 'contains', field: 'arr', value: 'x' }, V)).toBe(true);
    expect(evaluateCondition({ op: 'contains', field: 's', value: 'ell' }, V)).toBe(true);
    expect(evaluateCondition({ op: 'contains', field: 'arr', value: 'q' }, V)).toBe(false);
  });
  it('isEmpty + value:false inversion; 0/false not empty', () => {
    expect(evaluateCondition({ op: 'isEmpty', field: 'blank' }, V)).toBe(true);
    expect(evaluateCondition({ op: 'isEmpty', field: 'missing' }, V)).toBe(true);
    expect(evaluateCondition({ op: 'isEmpty', field: 's' }, V)).toBe(false);
    expect(evaluateCondition({ op: 'isEmpty', field: 's', value: false }, V)).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
  });
  it('gte/lte/notIn/notContains are null-aware — an EMPTY operand does NOT fire (C1)', () => {
    // The bug: an unset field must NOT satisfy >= 18 / <= x / notIn / notContains.
    expect(evaluateCondition({ op: 'gte', field: 'age', value: 18 }, {})).toBe(false);
    expect(evaluateCondition({ op: 'lte', field: 'age', value: 18 }, {})).toBe(false);
    expect(evaluateCondition({ op: 'notIn', field: 'country', value: ['UK'] }, {})).toBe(false);
    expect(evaluateCondition({ op: 'notContains', field: 'tags', value: 'z' }, {})).toBe(false);
    expect(evaluateCondition({ op: 'gte', field: 'age', value: 18 }, { age: '' })).toBe(false);
  });
  it('gte/lte/notIn/notContains compare correctly for a populated operand', () => {
    expect(evaluateCondition({ op: 'gte', field: 'age', value: 18 }, { age: 18 })).toBe(true);
    expect(evaluateCondition({ op: 'gte', field: 'age', value: 18 }, { age: 17 })).toBe(false);
    expect(evaluateCondition({ op: 'lte', field: 'age', value: 18 }, { age: 18 })).toBe(true);
    expect(evaluateCondition({ op: 'lte', field: 'age', value: 17 }, { age: 18 })).toBe(false);
    expect(evaluateCondition({ op: 'notIn', field: 'country', value: ['UK'] }, { country: 'US' })).toBe(true);
    expect(evaluateCondition({ op: 'notIn', field: 'country', value: ['US'] }, { country: 'US' })).toBe(false);
    expect(evaluateCondition({ op: 'notContains', field: 'tags', value: 'z' }, { tags: ['a'] })).toBe(true);
    expect(evaluateCondition({ op: 'notContains', field: 'tags', value: 'a' }, { tags: ['a'] })).toBe(false);
  });
});

describe('ruleEngine — logical nesting + applyRules folding', () => {
  const V = { a: 'X', b: 10, c: null };
  it('and/or/not compose', () => {
    const and = {
      op: 'and' as const,
      conditions: [
        { op: 'eq' as const, field: 'a', value: 'X' },
        { op: 'gt' as const, field: 'b', value: 5 },
      ],
    };
    expect(evaluateCondition(and, V)).toBe(true);
    const nested = {
      op: 'and' as const,
      conditions: [
        { op: 'eq' as const, field: 'a', value: 'X' },
        { op: 'not' as const, condition: { op: 'isEmpty' as const, field: 'c', value: false } },
      ],
    };
    expect(evaluateCondition(nested, V)).toBe(true);
  });

  const base = {
    a: { visible: true, required: false, disabled: false },
    b: { visible: true, required: false, disabled: false },
  };
  it('require fires only when the trigger matches; hide flips visible', () => {
    const rules: FormRuleLike[] = [
      { action: 'hide', trigger: { op: 'eq', field: 'a', value: 'no' }, targetFieldKeys: ['b'] },
      { action: 'require', trigger: { op: 'eq', field: 'a', value: 'yes' }, targetFieldKeys: ['b'] },
    ];
    const s1 = applyRules(rules, { a: 'yes' }, base);
    expect(s1.b.required).toBe(true);
    expect(s1.b.visible).toBe(true);
    expect(applyRules(rules, { a: 'no' }, base).b.visible).toBe(false);
  });
  it('order matters — later order wins', () => {
    const rules: FormRuleLike[] = [
      { order: 2, action: 'show', trigger: { op: 'eq', field: 'a', value: 'x' }, targetFieldKeys: ['b'] },
      { order: 1, action: 'hide', trigger: { op: 'eq', field: 'a', value: 'x' }, targetFieldKeys: ['b'] },
    ];
    expect(applyRules(rules, { a: 'x' }, base).b.visible).toBe(true);
  });
  it('set_value uses evalExpr; clear sets null', () => {
    const sv = applyRules(
      [{ action: 'set_value', setValueExpr: 'a + 1', trigger: { op: 'gt', field: 'a', value: 0 }, targetFieldKeys: ['b'] }],
      { a: 4 },
      base,
      (_e, v) => (v['a'] as number) + 1,
    );
    expect(sv.b.setValue).toEqual({ value: 5 });
  });
  it('evaluateValidationRules raises when the assertion does not hold', () => {
    const rules: FormRuleLike[] = [
      { action: 'validate', message: 'end after start', trigger: { op: 'gt', field: 'end', value: '2000-01-01' }, targetFieldKeys: ['end'] },
    ];
    expect(evaluateValidationRules(rules, { end: '2026-01-01' }).length).toBe(0);
    const bad = evaluateValidationRules(rules, { end: '1990-01-01' });
    expect(bad.length).toBe(1);
    expect(bad[0].targetFieldKeys).toEqual(['end']);
  });
  it('conditionFieldKeys collects across nesting, de-duped', () => {
    const cond = {
      op: 'and' as const,
      conditions: [
        { op: 'eq' as const, field: 'a', value: 1 },
        {
          op: 'or' as const,
          conditions: [
            { op: 'gt' as const, field: 'b', value: 2 },
            { op: 'not' as const, condition: { op: 'isEmpty' as const, field: 'c' } },
          ],
        },
      ],
    };
    expect(conditionFieldKeys(cond).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('exprEngine — arithmetic, helpers, and the sandbox', () => {
  it('arithmetic + allow-listed helpers', () => {
    expect(evaluateExpression('a + b * 2', { a: 1, b: 3 })).toBe(7);
    expect(evaluateExpression('min(a, b)', { a: 5, b: 2 })).toBe(2);
    expect(evaluateExpression('concat(a, " ", b)', { a: 'John', b: 'Doe' })).toBe('John Doe');
    expect(evaluateExpression('year(d)', { d: '2026-07-07' })).toBe(2026);
    expect(evaluateExpression('daysBetween(a, b)', { a: '2026-01-01', b: '2026-01-08' })).toBe(7);
  });
  it('missing keys default to null; unparseable -> null', () => {
    expect(evaluateExpression('a + 1', {})).toBe(1);
    expect(evaluateExpression('coalesce(a, 0)', {})).toBe(0);
    expect(evaluateExpression('a +', { a: 1 })).toBe(null);
  });
  it('referencedKeys + validateExpression', () => {
    expect(referencedKeys('a + b * c').sort()).toEqual(['a', 'b', 'c']);
    expect(validateExpression('a + b').ok).toBe(true);
    expect(validateExpression('').ok).toBe(false);
    expect(validateExpression('1'.repeat(1001)).ok).toBe(false);
  });
  it('sandbox blocks member access / assignment / host globals', () => {
    expect(validateExpression('a.constructor').ok).toBe(false);
    expect(validateExpression('a = 5').ok).toBe(false);
    expect(evaluateExpression('process', {})).toBe(null);
    expect(evaluateExpression('__proto__', {})).toBe(null);
    expect(evaluateExpression('random()', {})).toBe(null);
  });
});

describe('ruleAst.adapter — persisted <-> engine', () => {
  const V = { country: 'US', age: 30, tags: ['a', 'b'], note: '' };
  it('lowers gte/lte/notIn/notContains/isNotEmpty correctly', () => {
    const cases: Array<[PersistedAst, boolean]> = [
      [{ kind: 'leaf', fieldKey: 'age', op: 'gte', value: 30 }, true],
      [{ kind: 'leaf', fieldKey: 'age', op: 'lte', value: 18 }, false],
      [{ kind: 'leaf', fieldKey: 'country', op: 'notIn', value: ['UK', 'FR'] }, true],
      [{ kind: 'leaf', fieldKey: 'tags', op: 'notContains', value: 'z' }, true],
      [{ kind: 'leaf', fieldKey: 'note', op: 'isNotEmpty' }, false],
    ];
    for (const [ast, expected] of cases) {
      expect(evaluateCondition(toEngineCondition(ast), V)).toBe(expected);
    }
  });
  it('round-trips a plain eq/gt group', () => {
    const ast: PersistedAst = {
      kind: 'group',
      combinator: 'or',
      children: [
        { kind: 'leaf', fieldKey: 'country', op: 'eq', value: 'US' },
        { kind: 'leaf', fieldKey: 'age', op: 'gt', value: 18 },
      ],
    };
    expect(toPersistedAst(toEngineCondition(ast))).toEqual(ast);
  });
  it('maps extended ops 1:1 with no not-wrapping, and round-trips them (C1)', () => {
    expect(toEngineCondition({ kind: 'leaf', fieldKey: 'age', op: 'gte', value: 18 })).toEqual({
      op: 'gte', field: 'age', value: 18,
    });
    const cases: PersistedAst[] = [
      { kind: 'leaf', fieldKey: 'age', op: 'gte', value: 30 },
      { kind: 'leaf', fieldKey: 'age', op: 'lte', value: 18 },
      { kind: 'leaf', fieldKey: 'country', op: 'notIn', value: ['UK', 'FR'] },
      { kind: 'leaf', fieldKey: 'tags', op: 'notContains', value: 'z' },
    ];
    for (const ast of cases) {
      expect(toPersistedAst(toEngineCondition(ast))).toEqual(ast);
    }
  });
  it('an authored not(comparator) group round-trips AS a not-group (C2)', () => {
    const ast: PersistedAst = {
      kind: 'group',
      combinator: 'not',
      children: [{ kind: 'leaf', fieldKey: 'age', op: 'lt', value: 18 }],
    };
    const round = toPersistedAst(toEngineCondition(ast));
    expect(round).toEqual(ast);
    expect((round as { kind: string }).kind).toBe('group');
  });
});
