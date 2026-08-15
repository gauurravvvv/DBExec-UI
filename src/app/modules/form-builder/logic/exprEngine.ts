/**
 * exprEngine — sandboxed expression evaluator for computed fields and
 * set-value rules (FORM_BUILDER_PRD F3.3). Framework-agnostic, pure TypeScript
 * over the `expr-eval` parser: the SAME source runs on the Node server
 * (authoritative recompute on capture) and the Angular client (live recompute).
 * The FE keeps a BYTE-IDENTICAL copy at
 * `dbexec-ui/src/app/modules/form-builder/logic/exprEngine.ts`; the FE parity test
 * `rule-parity.spec.ts` asserts the two files' fenced regions match. Do NOT add a framework/Node-only import.
 *
 * Sandbox guarantees (no arbitrary code execution):
 *   - `allowMemberAccess: false` blocks `x.constructor` / prototype walking;
 *   - `assignment`/`fndef` operators disabled — no `x = 1`, no lambda defs;
 *   - built-in functions pruned to a deterministic allow-list (drops `random`,
 *     `map`, `fold`, `filter`, `gamma`, `fac`, …) plus vetted string/date helpers;
 *   - scope is ONLY the form's field-key values — no host globals are reachable.
 */
import { Parser, ParserOptions } from 'expr-eval';

/* PARITY:START — everything below must stay byte-identical to the FE copy. */

export interface ExprValidationResult {
  ok: boolean;
  error?: string;
}

/** Deterministic built-in functions kept from expr-eval's default set. */
const ALLOWED_BUILTIN_FUNCTIONS = new Set([
  'min',
  'max',
  'pow',
  'hypot',
  'if',
  'roundTo',
  'indexOf',
  'join',
]);

/** Max source length — a coarse guard against pathological expressions. */
const MAX_EXPRESSION_LENGTH = 1000;

/** Parse a date-ish value (ISO string / epoch ms) to a Date, or null. */
const parseDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t);
};

/**
 * Build a fresh, sandboxed parser. A new instance per call keeps evaluation
 * stateless and free of cross-expression leakage; parsing cost is negligible.
 */
const buildParser = (): Parser => {
  // assignment/fndef off → no `x = 1`, no lambda defs; array off → no `a["x"]`
  // bracket indexing (which would otherwise reach an object's constructor).
  // `array` is not in expr-eval's typings but is honoured at runtime.
  const options = {
    allowMemberAccess: false,
    operators: { assignment: false, fndef: false, array: false },
  } as unknown as ParserOptions;
  const parser = new Parser(options);

  // Prune built-in functions to the deterministic allow-list.
  const fns = parser.functions as Record<string, unknown>;
  for (const name of Object.keys(fns)) {
    if (!ALLOWED_BUILTIN_FUNCTIONS.has(name)) delete fns[name];
  }

  // Vetted string / null / date helpers (all pure, no host access).
  fns.concat = (...args: unknown[]) => args.map(a => (a == null ? '' : String(a))).join('');
  fns.len = (v: unknown) => (v == null ? 0 : Array.isArray(v) ? v.length : String(v).length);
  fns.upper = (s: unknown) => (s == null ? '' : String(s).toUpperCase());
  fns.lower = (s: unknown) => (s == null ? '' : String(s).toLowerCase());
  fns.trim = (s: unknown) => (s == null ? '' : String(s).trim());
  fns.coalesce = (...args: unknown[]) => {
    for (const a of args) if (a != null && a !== '') return a;
    return null;
  };
  fns.year = (d: unknown) => parseDate(d)?.getUTCFullYear() ?? null;
  fns.month = (d: unknown) => {
    const dt = parseDate(d);
    return dt ? dt.getUTCMonth() + 1 : null;
  };
  fns.day = (d: unknown) => parseDate(d)?.getUTCDate() ?? null;
  fns.daysBetween = (a: unknown, b: unknown) => {
    const da = parseDate(a);
    const db = parseDate(b);
    return da && db ? Math.round((db.getTime() - da.getTime()) / 86400000) : null;
  };

  return parser;
};

/**
 * Validate an expression at field-definition save time (F3.3). Rejects empty,
 * over-long, and unparseable expressions with a message; a valid expression
 * returns `{ ok: true }`. Never throws.
 */
export const validateExpression = (expr: string): ExprValidationResult => {
  if (typeof expr !== 'string' || expr.trim() === '') {
    return { ok: false, error: 'Expression is empty' };
  }
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: 'Expression is too long' };
  }
  try {
    buildParser().parse(expr);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid expression' };
  }
};

/** The field keys an expression references (drives live recompute on change). */
export const referencedKeys = (expr: string): string[] => {
  try {
    return buildParser()
      .parse(expr)
      .variables({ withMembers: false });
  } catch {
    return [];
  }
};

/**
 * Evaluate an expression against the form's field-key values. Missing
 * referenced keys default to null so evaluation never throws on absent inputs;
 * any evaluation error yields null (the caller renders an empty computed value).
 */
export const evaluateExpression = (
  expr: string,
  values: Record<string, unknown>,
): unknown => {
  if (typeof expr !== 'string' || expr.trim() === '') return null;
  try {
    const parsed = buildParser().parse(expr);
    // Null-prototype scope so identifiers like `__proto__` / `constructor`
    // resolve to null instead of leaking a prototype object.
    const scope: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(values ?? {})) scope[k] = v;
    for (const key of parsed.variables({ withMembers: false })) {
      if (!(key in scope)) scope[key] = null;
    }
    const result = parsed.evaluate(scope as never);
    // Computed fields yield scalars only. Anything else (an object/function that
    // could leak from an odd identifier like `__proto__`) collapses to null.
    if (result === undefined || result === null) return null;
    const t = typeof result;
    return t === 'number' || t === 'string' || t === 'boolean' ? result : null;
  } catch {
    return null;
  }
};

/* PARITY:END */
