/**
 * param-tokens.helper — FE port of the BE `{{name}}` tokenizer.
 *
 * Mirrors `extractParamTokens` from the sibling repo
 * (dbexec-api/src/shared/utility/datasetParams.ts) so the Parameters
 * panel detects EXACTLY the same tokens the run path will bind. A naive
 * `/\{\{(\w+)\}\}/g` scan would treat `'{{fake}}'` inside a string
 * literal or `-- {{note}}` inside a comment as a real parameter and
 * over-report to the user. This walk skips single/double-quoted string
 * literals, `--` line comments, and block comments, so only tokens in
 * live SQL are returned.
 *
 * Keep this algorithm byte-for-byte equivalent to the BE version; a
 * divergence means the panel and the binder disagree about which tokens
 * exist, which surfaces as spurious "unknown parameter" / "missing
 * required parameter" errors at run time.
 */

/** Same identifier shape the BE tokenizer + filter engine enforce. */
export const VALID_PARAM_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Parameter control types for `{{name}}` tokens (mirrors BE enum). */
export type DatasetParamType =
  'text' | 'number' | 'date' | 'daterange' | 'dropdown';

/** Static-list dropdown source. */
export interface DatasetParamStaticOptions {
  static?: string[];
}

/** Query-based dropdown source (options fetched from another dataset). */
export interface DatasetParamQueryOptions {
  datasetId?: string;
  valueColumn?: string;
  labelColumn?: string;
}

/**
 * A single declared parameter — the FE shape persisted into
 * `Dataset.paramsConfig`. Matches the BE `datasetParamSchema`.
 */
export interface DatasetParamConfig {
  name: string;
  type: DatasetParamType;
  label?: string;
  default?: any;
  required?: boolean;
  options?: DatasetParamStaticOptions | DatasetParamQueryOptions;
}

/**
 * Walk `sql` and return every DISTINCT `{{name}}` token that appears in
 * live SQL — i.e. NOT inside a single/double-quoted string literal, a
 * `--` line comment, or a block comment. Order of first appearance is
 * preserved; duplicates are collapsed. Only tokens whose inner name
 * matches VALID_PARAM_IDENTIFIER are returned; a malformed token like
 * `{{ 1bad }}` is ignored (treated as literal text).
 */
export function extractParamTokens(sql: string): string[] {
  if (!sql) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const n = sql.length;
  let i = 0;

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';

    // -- line comment: skip to end of line.
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }

    // block comment: skip to closing marker (no nesting in SQL).
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && i + 1 < n && sql[i + 1] === '/')) i++;
      i += 2; // consume the closing marker
      continue;
    }

    // Single- or double-quoted string literal. Handles the SQL-standard
    // doubled-quote escape ('' / "") by consuming both quotes and staying
    // inside the literal.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++; // consume opening quote
      while (i < n) {
        if (sql[i] === quote) {
          if (i + 1 < n && sql[i + 1] === quote) {
            i += 2; // doubled quote → escaped, stay inside
            continue;
          }
          i++; // closing quote
          break;
        }
        i++;
      }
      continue;
    }

    // Live SQL: look for a {{ … }} token.
    if (ch === '{' && next === '{') {
      const close = sql.indexOf('}}', i + 2);
      if (close !== -1) {
        const inner = sql.slice(i + 2, close).trim();
        if (VALID_PARAM_IDENTIFIER.test(inner)) {
          if (!seen.has(inner)) {
            seen.add(inner);
            found.push(inner);
          }
          i = close + 2;
          continue;
        }
        // Malformed token — advance past the opening braces only so a
        // later valid token isn't skipped.
        i += 2;
        continue;
      }
      // No closing marker — treat the rest as literal.
      i += 2;
      continue;
    }

    i++;
  }

  return found;
}

/**
 * Reconcile a saved/edited `paramsConfig` against the tokens currently
 * present in the SQL. Returns one config entry per LIVE token, in token
 * order: an existing entry is reused (so the user's type/label/etc are
 * preserved across edits), a missing one gets a fresh default (`text`).
 * Entries whose token no longer appears in the SQL are dropped, so a
 * removed `{{name}}` cleans up its config automatically.
 */
export function reconcileParams(
  sql: string,
  existing: DatasetParamConfig[] | null | undefined,
): DatasetParamConfig[] {
  const tokens = extractParamTokens(sql);
  const byName = new Map<string, DatasetParamConfig>();
  (existing ?? []).forEach(p => {
    if (p && p.name) byName.set(p.name, p);
  });
  return tokens.map(
    name => byName.get(name) ?? { name, type: 'text' as DatasetParamType },
  );
}
