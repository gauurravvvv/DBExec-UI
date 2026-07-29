/**
 * Schema-aware diagnostics: unknown table and column references.
 *
 * Deliberately conservative — it flags only what it is confident about, because a
 * false positive on hand-written SQL costs the user far more than a missed warning.
 */

import { COMMON_SQL_SNIPPETS, getDialectSpec } from '../../config/sql-dialects';
import {
  DatasourceSchema,
  TableColumn,
  TableSchema,
} from '../../models/dataset-schema.model';
import { CursorScope, findScopeAt } from '../sql-scope-tracker';
import {
  RESERVED_WORDS,
  TableRef,
  buildAliasMap,
  extractBalancedParens,
  generateAlias,
  getContext,
  isCursorInStringOrComment,
  parseCTEReferences,
  parseTableReferences,
  quoteIdentifier,
  stripStringsAndComments,
} from '../sql-text-analysis';
import { IntelliSenseContext } from './intellisense-context';



/**
 * Find identifier-resolution problems in SQL — unknown tables in FROM/JOIN
 * positions and unknown qualifiers in `qualifier.column` references.
 *
 * Returns plain offset ranges so the caller (validator) can convert to
 * Monaco markers. Returns an empty array when no schema is loaded — never
 * emits diagnostics speculatively.
 *
 * Conservative by design: only flags things we're confident about. False
 * negatives are acceptable; false positives are not.
 */
export function findSchemaDiagnostics(
  svc: IntelliSenseContext,
  sql: string,
): { start: number; end: number; message: string }[] {
  const diagnostics: { start: number; end: number; message: string }[] = [];
  const { tableByName, schemaMap, allTables } = svc.getLookups();
  if (allTables.length === 0) return diagnostics;

  const stripped = svc.stripCached(sql);

  // ─── 1. UNKNOWN TABLE in FROM/JOIN position ────────────────
  // We re-run the FROM/JOIN regex against the stripped SQL but track
  // capture group offsets so we can mark the table token specifically.
  const tableRegex =
    /\b(?:from|join)\s+(?![\(\s]*select)(?:(\w+)\s*\.\s*)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(stripped)) !== null) {
    const schemaName = m[1] || null;
    const tableName = m[2];
    const tableTokenStart = m.index + m[0].length - tableName.length;
    const tableTokenEnd = tableTokenStart + tableName.length;

    // CTEs are valid table references — skip if this name is a CTE.
    const cteRefs = svc.getCachedCTERefs(stripped, tableByName);
    if (
      cteRefs.some(c => c.tableName.toLowerCase() === tableName.toLowerCase())
    ) {
      continue;
    }

    const lookupKey = schemaName
      ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
      : tableName.toLowerCase();
    const resolved =
      tableByName.get(lookupKey) || tableByName.get(tableName.toLowerCase());

    if (!resolved) {
      diagnostics.push({
        start: tableTokenStart,
        end: tableTokenEnd,
        message: schemaName
          ? `Table "${schemaName}.${tableName}" not found in schema`
          : `Table "${tableName}" not found in schema`,
      });
    }
  }

  // ─── 2. UNKNOWN QUALIFIER in `qualifier.column` ────────────
  // Once we know which tables/aliases are in scope, any `name.something`
  // where `name` is neither (a) a known alias, (b) a known table, nor
  // (c) a known schema is almost certainly a typo.
  const refs = svc.getCachedTableRefs(stripped, tableByName);
  const cteRefs = svc.getCachedCTERefs(stripped, tableByName);
  const allRefs = [...cteRefs, ...refs];
  const aliasMap = buildAliasMap(allRefs);

  // qualifier.column where the column is a word (not `*`)
  const qualifierRegex = /(?<![\w."'])(\w+)\s*\.\s*(\w+)/g;
  let q: RegExpExecArray | null;
  while ((q = qualifierRegex.exec(stripped)) !== null) {
    const qualifier = q[1];
    const column = q[2];
    const qualifierStart = q.index;
    const qualifierEnd = qualifierStart + qualifier.length;
    const columnStart =
      qualifierEnd + (q[0].length - qualifier.length - column.length);
    const columnEnd = columnStart + column.length;

    // Skip if this is in a FROM/JOIN/UPDATE/INTO position — that's
    // schema.table syntax, handled by the table-resolution loop above.
    // Look backward through whitespace for the preceding keyword.
    const before = stripped.substring(0, qualifierStart);
    if (/\b(?:from|join|update|into|table)\s+$/i.test(before)) {
      continue;
    }

    const qualifierLower = qualifier.toLowerCase();

    // Resolve to a TableSchema via alias map, direct table, or schema lookup
    const aliasRef = aliasMap.get(qualifierLower);
    if (aliasRef?.tableSchema) {
      // Qualifier resolved → check the column.
      // Skip if the "column" is `*` — handled by the regex's \w+ but defensive.
      const colExists = aliasRef.tableSchema.columns.some(
        c => c.name.toLowerCase() === column.toLowerCase(),
      );
      if (!colExists) {
        diagnostics.push({
          start: columnStart,
          end: columnEnd,
          message: `Column "${column}" not found on ${aliasRef.tableName}`,
        });
      }
      continue;
    }

    // Qualifier might be a schema name (legitimate `schema.table`)
    if (schemaMap.has(qualifierLower)) {
      // It's a schema — `schema.table` resolution happens in the FROM/JOIN
      // pass above, so don't double-report here.
      continue;
    }

    // Unknown qualifier — only report if it's not a SQL keyword or a
    // function name (e.g. `pg_catalog.set_config(...)` or the start of a
    // path-like identifier). Cheap reserved-words check covers most cases.
    if (RESERVED_WORDS.has(qualifierLower)) continue;

    diagnostics.push({
      start: qualifierStart,
      end: qualifierEnd,
      message: `Unknown table or alias "${qualifier}"`,
    });
  }

  return diagnostics;
}

// ─── HOVER PROVIDER ────────────────────────────────────────
