/**
 * Dataset schema and query-result models.
 *
 * These describe the shape the backend returns for a datasource's schema tree and
 * for an executed query — the vocabulary shared by the dataset screens, the
 * IntelliSense service, the schema transformer and the query-builder executor.
 *
 * They previously lived in `helpers/dummy-data.helper.ts`, alongside a 739-line
 * `DummyDataHelper` mock-data class that nothing in the application referenced.
 * The class was deleted and these moved here, which is where their consumers
 * expect to find them — a file named for mock data was a misleading home for the
 * module's most-imported types.
 */

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  /** Server-supplied default expression (e.g. `nextval(...)`, `CURRENT_DATE`). */
  defaultValue?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  /** Schema of the referenced table, when known. */
  foreignKeySchema?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  /**
   * Stable per-(schema, table) alias pre-computed by the BE
   * (e.g. `emp_24b`). Used as the default alias suggestion in the editor so
   * the FE doesn't need to derive one from the table name.
   */
  alias?: string;
}

export interface SchemaGroup {
  name: string;
  tables: TableSchema[];
}

export interface DatasourceSchema {
  name: string;
  schemas: SchemaGroup[];
  /**
   * Database engine for this datasource (postgres / mysql / mariadb /
   * mssql / oracle / snowflake). Used to scope IntelliSense suggestions
   * to the right SQL dialect. Optional with a Postgres default — legacy
   * data and tests without the field still resolve correctly.
   *
   * Stored on the schema record (not just the active selection) so that
   * when multiple datasources are in the sidebar, each can be queried in
   * its own dialect should we ever expose per-datasource active editing.
   */
  dbType?: string;
}

/**
 * Categorised error kinds from the BE. Lets the result pane pick the
 * right icon + recovery hint without parsing the engine's free-form
 * error message. `unknown` falls through to "show the raw message
 * verbatim" which is the right move for an unrecognised driver error.
 */
export type QueryErrorKind =
  | 'permission_denied'
  | 'syntax'
  | 'timeout'
  | 'connection'
  | 'object_not_found'
  | 'safety_violation'
  | 'unknown';

export interface QueryResult {
  columns: string[];
  columnTypes?: Record<string, string>;
  rows: any[];
  rowCount: number;
  executionTime?: string | number;
  /** ms as a number — finer-grained sibling of executionTime. */
  executionMs?: number;
  /** True when the row cap clipped the result. Drives the banner. */
  truncated?: boolean;
  /** Non-fatal notes from the BE (e.g. "type discovery skipped"). */
  warnings?: string[];
  /** Driver / engine error message — populated on failure. */
  error?: string;
  /**
   * Typed error category from the BE classifier. Lets the FE render
   * permission-denied as a key icon, syntax as a code icon, timeout
   * as a clock, etc, instead of one generic red box.
   */
  errorKind?: QueryErrorKind;
  /** Token the safety validator pointed at (only on safety_violation). */
  offendingToken?: string | null;
  message?: string;
  query?: string;
}

/**
 * Shape of the `data` field on a successful query/execute response from the BE.
 */
export interface QueryExecuteData {
  columns: string[];
  columnTypes?: Record<string, string>;
  data: any[];
  rowCount: number;
  executionTime?: string | number;
  executionMs?: number;
  truncated?: boolean;
  warnings?: string[];
  query?: string;
}
