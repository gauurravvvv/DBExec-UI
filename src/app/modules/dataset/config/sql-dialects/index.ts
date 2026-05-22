/**
 * Per-dialect SQL dictionaries for editor IntelliSense.
 *
 * Each supported engine (postgres, mysql, mariadb, mssql, oracle, snowflake)
 * has its own file exporting a DialectSpec. getDialectSpec() returns the
 * right one based on the datasource's dbType so the completion / hover /
 * signature-help providers can scope their suggestions to the dialect the
 * user is actually writing against.
 *
 * Five of the six engines pull keyword + type lists straight from
 * @codemirror/lang-sql's bundled dialect specs (PostgreSQL, MySQL, MariaSQL,
 * MSSQL, PLSQL). Snowflake has no upstream lang-sql dialect — its spec is
 * hand-written from the Snowflake reserved-words reference. Function
 * catalogs are hand-curated per engine since lang-sql doesn't ship them.
 *
 * Why FE-only: keyword/function lists are static reference data that don't
 * change between deploys. A BE endpoint would add a network hop and a
 * loading state with no win. Live schema (tables/columns) keeps its
 * existing BE-driven pipeline; only the dialect dictionary lives here.
 */
import type { LRParser } from '@lezer/lr';
import { DatabaseTypeValue } from '../../../datasource/constants/database-types.constant';

/**
 * One catalogued SQL function. Matches the legacy SQL_FUNCTIONS entry
 * shape so existing hover/signature-help code can consume it unchanged.
 */
export interface SqlFunction {
  name: string;
  params: string;
  description: string;
}

/**
 * Everything the editor needs to know about one SQL dialect. Built up
 * lazily — each per-engine file constructs its own const at module load.
 *
 * Where the data comes from:
 *
 *   keywords / types — pulled at module load from
 *   @codemirror/lang-sql's bundled dialect spec
 *   (PostgreSQL.spec.keywords, MySQL.spec.types, …). Hundreds of
 *   identifiers per dialect; we don't hand-maintain these.
 *
 *   functions — hand-curated per dialect with rich metadata (params,
 *   description) the library does NOT ship. Powers signature help and
 *   hover docs. Library's `builtin` field is engine CLI verbs (MySQL
 *   shell commands, SQL*Plus directives, sqlite-shell verbs) for most
 *   dialects, NOT SQL function names — only MSSQL ships actual function
 *   names in `builtin`, and we harvest those as bare completions on
 *   top of the rich catalog (see mssql.ts).
 *
 *   extraFunctionNames — bare function names from lang-sql `builtin`
 *   where it ships actual function names (currently only MSSQL). Added
 *   to autocomplete with no params/docs so the user still sees them in
 *   the suggestion list even when our catalog doesn't cover them.
 *
 *   parser — Lezer LR parser from lang-sql for the in-browser lint
 *   pass. Null for Snowflake because lang-sql doesn't ship a Snowflake
 *   grammar.
 */
export interface DialectSpec {
  /** Which dbType this spec serves. Useful for sanity checks. */
  dbType: DatabaseTypeValue;
  /** Uppercased keyword list — passed straight into addKeywords(). */
  keywords: string[];
  /** Uppercased type-name list — currently surfaced as keyword-style
   *  suggestions, separate so callers can style them differently later. */
  types: string[];
  /** Rich function catalog (name + params + description) for hover and
   *  signature help. Hand-curated. */
  functions: SqlFunction[];
  /** Additional function name-only entries pulled from lang-sql's
   *  `builtin` field where it ships actual SQL functions. Merged with
   *  `functions` in addFunctions() — entries already present in
   *  `functions` keep their rich metadata; extras complete as bare
   *  names. Empty for dialects whose lang-sql builtin list is CLI
   *  commands rather than SQL functions. */
  extraFunctionNames: string[];
  /**
   * Optional Lezer parser for in-browser syntax linting. Lang-sql exposes
   * one per dialect (except Snowflake — we leave that as null and fall
   * back to standard SQL when lint is enabled).
   */
  parser: LRParser | null;
}

import { mariadbDialect } from './mariadb';
import { mssqlDialect } from './mssql';
import { mysqlDialect } from './mysql';
import { oracleDialect } from './oracle';
import { postgresDialect } from './postgres';
import { snowflakeDialect } from './snowflake';

/**
 * Returns the DialectSpec for a given dbType. Falls back to Postgres for
 * any unknown value — historically the editor was Postgres-only, so this
 * preserves the legacy behaviour for legacy data without a dbType field.
 */
export function getDialectSpec(
  dbType: DatabaseTypeValue | string | null | undefined,
): DialectSpec {
  switch (dbType) {
    case 'mysql':
      return mysqlDialect;
    case 'mariadb':
      return mariadbDialect;
    case 'mssql':
      return mssqlDialect;
    case 'oracle':
      return oracleDialect;
    case 'snowflake':
      return snowflakeDialect;
    case 'postgres':
    default:
      return postgresDialect;
  }
}

/**
 * Snippets that are dialect-neutral (plain SELECT/INSERT/CASE etc.) live
 * on this re-export. Dialect-specific snippets live on each DialectSpec
 * if/when we add them — kept separate so the bulk of the snippet list
 * doesn't get duplicated across six files.
 */
export { COMMON_SQL_SNIPPETS } from './common-snippets';
