/**
 * The seam between `MonacoIntelliSenseService` and the providers extracted from it.
 *
 * The service had reached 1,911 lines: three Monaco providers, a schema-diagnostics
 * pass, and about twenty completion-item builders, all sharing one `this`. The
 * providers turned out to share no *mutable* state with one another — only the
 * resolved schema lookups and the memoisation caches — so each moved out as free
 * functions, and this interface is what they are allowed to reach back for.
 *
 * Declaring the seam as an interface rather than passing the concrete service does
 * two useful things: it states exactly how much of the service a provider may
 * touch, and it lets a test drive a provider from a plain object instead of
 * standing up the service and its Angular dependencies.
 *
 * Every signature here mirrors the service's own exactly. They are not simplified:
 * a looser signature would compile and then silently widen argument types inside
 * the providers to `any`, which is how the callbacks in the moved code lost their
 * inferred element types on the first attempt at this split.
 */
import { DatasourceSchema, TableSchema } from '../../models/dataset-schema.model';
import { TableRef } from '../sql-text-analysis';

/**
 * Name → object maps resolved from the loaded datasource trees, rebuilt only when
 * the datasources change.
 */
export interface SchemaLookups {
  allTables: TableSchema[];
  /**
   * Indexed by both `tablename` and `schema.tablename` (lowercase), so the parser
   * can resolve qualified and unqualified references from one map.
   */
  tableByName: Map<string, TableSchema>;
  schemaMap: Map<string, TableSchema[]>;
  tableToSchema: Map<string, string>;
  schemaNames: string[];
}

/** A table reference in scope at the cursor, with its alias and resolved columns. */
export type { TableRef };

export interface IntelliSenseContext {
  /** Every datasource tree currently loaded into the cache. */
  readonly currentDatasources: DatasourceSchema[];

  /**
   * Dialect the editor is currently pointed at.
   *
   * Scopes keyword and function suggestions. Null means "not yet known", which the
   * providers treat as Postgres — the module's default everywhere else too.
   */
  readonly activeDbType: string | null;

  /** Memoised schema lookups; cheap to call repeatedly. */
  getLookups(): SchemaLookups;

  /** Table references parsed from a statement, memoised per statement text. */
  getCachedTableRefs(
    sql: string,
    tableByName: Map<string, TableSchema>,
  ): TableRef[];

  /** CTE names parsed from a statement, memoised per statement text. */
  getCachedCTERefs(
    sql: string,
    tableByName: Map<string, TableSchema>,
  ): TableRef[];

  /**
   * Resolve parsed scope references against the schema.
   *
   * Also fires the lazy column request for any table whose columns are not loaded
   * yet, which is what makes column completion work on a warehouse-scale
   * datasource the backend degraded to schemas-and-tables only.
   */
  resolveScopeRefs(
    scopeRefs: {
      schemaName: string | null;
      tableName: string;
      alias: string | null;
    }[],
    tableByName: Map<string, TableSchema>,
  ): TableRef[];

  /** The single statement the cursor sits in, out of a multi-statement editor. */
  getCurrentStatement(
    fullText: string,
    cursorOffset: number,
  ): { statement: string; startOffset: number };

  /** SQL with string literals and comments blanked out, memoised (bounded LRU). */
  stripCached(sql: string): string;

  /** Replace the loaded datasource trees and invalidate the derived caches. */
  setDatasources(datasources: DatasourceSchema[]): void;

  /** Ask the host to fetch a table's columns. A no-op with no handler registered. */
  requestColumns(schema: string | null, table: string): void;
}
