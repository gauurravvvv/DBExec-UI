/**
 * Pure SQL text analysis — lexical scanning, reference parsing and identifier
 * shaping, with no Angular, no Monaco and no component state.
 *
 * Extracted verbatim from `MonacoIntelliSenseService`, which had grown to
 * 2,329 lines by mixing three unrelated concerns: Monaco provider
 * registration (an I/O boundary), schema lookup caching (stateful) and the
 * text analysis below (stateless). Only the third is testable in isolation,
 * so it lives here.
 *
 * Two rules for anything added to this file:
 *
 * 1. **No `this`.** Every export is a free function over its arguments. If a
 *    function needs the service's caches or the Monaco instance, it belongs in
 *    the service, not here.
 * 2. **Position-preserving where it claims to be.** `stripStringsAndComments`
 *    substitutes spaces rather than deleting, because every caller maps an
 *    offset in the stripped text back to an offset in the original. A
 *    "cleaner" implementation that shortens the string silently breaks cursor
 *    context detection and diagnostics ranges.
 */

import { TableSchema } from '../helpers/dummy-data.helper';

/** Resolved table reference from the query text */
export interface TableRef {
  schemaName: string | null;
  tableName: string;
  alias: string | null;
  tableSchema: TableSchema | null; // resolved schema object
}

/**
 * Keywords that should never be treated as a table alias.
 *
 * Used for three distinct decisions — alias rejection in
 * `parseTableReferences`, CTE-name rejection in `parseCTEReferences`, and
 * quoting in `quoteIdentifier` — plus unknown-qualifier suppression in the
 * service's diagnostics pass, which is why it is exported.
 */
export const RESERVED_WORDS = new Set([
  'where',
  'on',
  'set',
  'and',
  'or',
  'not',
  'in',
  'between',
  'like',
  'is',
  'null',
  'order',
  'group',
  'having',
  'limit',
  'offset',
  'union',
  'except',
  'intersect',
  'inner',
  'outer',
  'left',
  'right',
  'full',
  'cross',
  'natural',
  'join',
  'select',
  'from',
  'insert',
  'update',
  'delete',
  'create',
  'alter',
  'drop',
  'into',
  'values',
  'as',
  'case',
  'when',
  'then',
  'else',
  'end',
  'exists',
  'all',
  'any',
  'some',
  'distinct',
  'top',
  'asc',
  'desc',
  'true',
  'false',
  'fetch',
  'for',
  'with',
  'recursive',
  'returning',
  'using',
  'lateral',
  'only',
  'window',
  'over',
  'partition',
  'rows',
  'range',
  'groups',
  'preceding',
  'following',
  'current',
  'unbounded',
]);

// ─── CLAUSE CONTEXT ──────────────────────────────────────────

/**
 * Classify what the cursor is expecting, from the text up to it.
 * Returns one of: table | join_on | orderby | select | having | column | generic.
 */
export function getContext(text: string): string {
  // NOTE: Don't trim trailing whitespace here — the gap between a keyword
  // and the cursor (e.g. `SELECT |`) is the strongest signal that we're in
  // that clause's context. Each regex below allows an optional trailing
  // `\s*` so it works with or without a partial word being typed.
  const t = text;

  // After FROM, JOIN, INTO, UPDATE → expecting table name
  if (/\b(?:from|join|into|update|table)\s+\w*\s*$/i.test(t)) {
    return 'table';
  }

  // After ON (in JOIN context) → expecting join condition columns
  if (/\bJOIN\s+\S+(?:\s+(?:AS\s+)?\w+)?\s+ON\s+\w*\s*$/i.test(t)) {
    return 'join_on';
  }

  // After ORDER BY or GROUP BY → expecting columns
  if (/\b(?:order\s+by|group\s+by)\s+(?:[\w\.,\s]*,\s*)?\w*\s*$/i.test(t)) {
    return 'orderby';
  }

  // In SELECT clause (after SELECT or after comma in SELECT, before FROM)
  if (
    /\bselect\s+(?:distinct\s+)?(?:[\w\.\*,\s\(\)]*,\s*)?\w*\s*$/i.test(t) &&
    !/\bfrom\b/i.test(t)
  ) {
    return 'select';
  }

  // Check the last major keyword before cursor for fine-grained context
  const lastClause = t.match(
    /\b(select|from|where|join|on|set|having|order\s+by|group\s+by|and|or)\b\s*(?:[\s\S](?!\b(?:select|from|where|join|on|set|having|order\s+by|group\s+by)\b))*$/i,
  );
  if (lastClause) {
    const clause = lastClause[1].toLowerCase().replace(/\s+/g, ' ');
    if (clause === 'having') {
      return 'having';
    }
    if (['where', 'set', 'and', 'or'].includes(clause)) {
      return 'column';
    }
    if (clause === 'on') {
      return 'join_on';
    }
    if (['order by', 'group by'].includes(clause)) {
      return 'orderby';
    }
  }

  return 'generic';
}

// ─── TABLE REFERENCE PARSING ─────────────────────────────────

/**
 * Parse all FROM and JOIN table references in the query.
 * Extracts table name, optional schema, alias, and resolves to TableSchema.
 */
export function parseTableReferences(
  sql: string,
  tableByName: Map<string, TableSchema>,
): TableRef[] {
  const refs: TableRef[] = [];
  const seen = new Set<string>();

  // Match: FROM/JOIN [schema.]table [AS] [alias]
  // Excludes subqueries (detected by open paren after FROM/JOIN)
  const regex =
    /\b(?:from|join)\s+(?![\(\s]*select)(?:(\w+)\.)?(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const schemaName = match[1] || null;
    const tableName = match[2];
    const rawAlias = match[3] || null;

    // Skip if the "alias" is actually a SQL keyword
    const alias =
      rawAlias && !RESERVED_WORDS.has(rawAlias.toLowerCase()) ? rawAlias : null;

    // Resolve to a TableSchema
    const lookupKey = schemaName
      ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
      : tableName.toLowerCase();
    const tableSchema =
      tableByName.get(lookupKey) ||
      tableByName.get(tableName.toLowerCase()) ||
      null;

    const key = `${schemaName || ''}.${tableName}.${alias || ''}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ schemaName, tableName, alias, tableSchema });
    }
  }

  return refs;
}

/**
 * Build alias → tableName map from parsed table references.
 */
export function buildAliasMap(refs: TableRef[]): Map<string, TableRef> {
  const map = new Map<string, TableRef>();
  for (const ref of refs) {
    if (ref.alias) {
      map.set(ref.alias.toLowerCase(), ref);
    }
    map.set(ref.tableName.toLowerCase(), ref);
  }
  return map;
}

// ─── STRING/COMMENT AWARENESS ────────────────────────────────

/**
 * Replace string literals and comments with spaces (preserving line/column positions).
 * Prevents false matches from keywords/identifiers inside strings or comments.
 *
 * Most call sites should prefer the service's `stripCached()` to avoid repeated work.
 */
export function stripStringsAndComments(sql: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < sql.length) {
    // Single-line comment: -- ...
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        result.push(' ');
        i++;
      }
    }
    // Block comment: /* ... */
    else if (sql[i] === '/' && sql[i + 1] === '*') {
      result.push(' ');
      i++;
      result.push(' ');
      i++;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          result.push(' ');
          i++;
          result.push(' ');
          i++;
          break;
        }
        result.push(sql[i] === '\n' ? '\n' : ' ');
        i++;
      }
    }
    // String literal: '...' (with '' escape)
    else if (sql[i] === "'") {
      result.push(' ');
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          result.push(' ');
          i++;
          result.push(' ');
          i++;
        } else if (sql[i] === "'") {
          result.push(' ');
          i++;
          break;
        } else {
          result.push(sql[i] === '\n' ? '\n' : ' ');
          i++;
        }
      }
    }
    // Normal character
    else {
      result.push(sql[i]);
      i++;
    }
  }

  return result.join('');
}

/**
 * Check if cursor position is inside a string literal or comment.
 * If so, we should suppress SQL completions.
 */
export function isCursorInStringOrComment(textUntilCursor: string): boolean {
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < textUntilCursor.length; i++) {
    const ch = textUntilCursor[i];
    const next = textUntilCursor[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "'" && next === "'") {
        i++;
        continue;
      } // escaped quote
      if (ch === "'") {
        inString = false;
        continue;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
  }

  return inString || inLineComment || inBlockComment;
}

// ─── CTE PARSING ─────────────────────────────────────────────

/**
 * Parse CTE (WITH ... AS) definitions and return them as table references.
 * Recognizes: WITH name AS (...), name2 AS (...)
 */
export function parseCTEReferences(
  strippedSql: string,
  tableByName: Map<string, TableSchema>,
): TableRef[] {
  const refs: TableRef[] = [];

  // Check if there's a WITH clause
  if (!/\bWITH\b/i.test(strippedSql)) return refs;

  // Extract CTE names: match `name AS (` patterns after WITH
  const cteRegex = /\b(\w+)\s+AS\s*\(/gi;
  const withPos = strippedSql.search(/\bWITH\b/i);
  if (withPos < 0) return refs;

  // Only scan the WITH preamble (before the main SELECT/INSERT/etc.)
  const afterWith = strippedSql.substring(withPos + 4);
  let match;

  while ((match = cteRegex.exec(afterWith)) !== null) {
    const cteName = match[1];
    // Skip SQL keywords that might look like CTE names
    if (RESERVED_WORDS.has(cteName.toLowerCase())) continue;

    // Try to resolve the CTE body's source table for column inference
    // Find the balanced parentheses content after "AS ("
    const parenStart = match.index + match[0].length - 1; // position of '('
    const cteBody = extractBalancedParens(afterWith, parenStart);
    let cteTableSchema: TableSchema | null = null;

    if (cteBody) {
      // Try to infer columns from the CTE's FROM clause
      const innerRefs = parseTableReferences(cteBody, tableByName);
      if (innerRefs.length > 0 && innerRefs[0].tableSchema) {
        // Use the first table's schema as an approximation for CTE columns
        cteTableSchema = innerRefs[0].tableSchema;
      }
    }

    refs.push({
      schemaName: null,
      tableName: cteName,
      alias: null,
      tableSchema: cteTableSchema,
    });
  }

  return refs;
}

/**
 * Extract content between balanced parentheses starting at the given position.
 */
export function extractBalancedParens(
  text: string,
  startPos: number,
): string | null {
  if (text[startPos] !== '(') return null;
  let depth = 0;
  for (let i = startPos; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        return text.substring(startPos + 1, i);
      }
    }
  }
  return null;
}

// ─── IDENTIFIER SHAPING ──────────────────────────────────────

/**
 * Generate a suggested alias for a table name.
 * Single word → first letter: users → u
 * Multi-word (snake_case) → initials: order_items → oi
 */
export function generateAlias(tableName: string): string {
  const parts = tableName.split('_');
  if (parts.length > 1) {
    return parts
      .map(p => p[0] || '')
      .join('')
      .toLowerCase();
  }
  return tableName[0].toLowerCase();
}

/**
 * Wrap an identifier in double quotes when it contains characters that
 * would break unquoted SQL — anything that isn't [A-Za-z0-9_], or a leading
 * digit, or a name that happens to be a reserved word. Existing inner
 * double quotes are escaped per SQL standard (doubled).
 */
export function quoteIdentifier(name: string): string {
  if (!name) return name;
  const needsQuoting =
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
    RESERVED_WORDS.has(name.toLowerCase());
  if (!needsQuoting) return name;
  return `"${name.replace(/"/g, '""')}"`;
}
