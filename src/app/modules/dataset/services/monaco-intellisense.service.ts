import { Injectable } from '@angular/core';
import { DatabaseTypeValue } from '../../datasource/constants/database-types.constant';
import { COMMON_SQL_SNIPPETS, getDialectSpec } from '../config/sql-dialects';
import {
  DatasourceSchema,
  TableColumn,
  TableSchema,
} from '../models/dataset-schema.model';
import { CursorScope, findScopeAt } from './sql-scope-tracker';
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
} from './sql-text-analysis';

declare const monaco: any;

/**
 * Service to handle Monaco Editor IntelliSense registration
 * Provides SQL completions, hover providers, and keyboard shortcuts
 */
/** Pre-built lookup maps over the active datasources. */

const EMPTY_LOOKUPS: SchemaLookups = {
  allTables: [],
  tableByName: new Map(),
  schemaMap: new Map(),
  tableToSchema: new Map(),
  schemaNames: [],
};

import {
  IntelliSenseContext,
  SchemaLookups,
} from './intellisense/intellisense-context';
import { findSchemaDiagnostics } from './intellisense/schema-diagnostics';
import { registerHoverProvider } from './intellisense/hover-provider';
import { registerSQLCompletions } from './intellisense/completion-provider';
import { registerSignatureHelpProvider } from './intellisense/signature-help-provider';

@Injectable({
  providedIn: 'root',
})
export class MonacoIntelliSenseService implements IntelliSenseContext {
  /**
   * Most recent datasources passed to a provider. Held here so the
   * provideCompletionItems / provideHover callbacks can read fresh schema
   * data on each invocation without forcing the component to re-register
   * providers (which is slow and resets Monaco's internal cache).
   */
  currentDatasources: DatasourceSchema[] = [];

  /**
   * Optional hook for consumers whose schema loads lazily.
   *
   * The dataset creator hands over a tree that already holds every column it
   * knows about. The Query Executor cannot: it browses arbitrary databases and
   * fetches a table's columns only when something needs them, because
   * materialising a warehouse with thousands of tables up front is unusable.
   *
   * When a table reference resolves to a table whose `columns` array is empty,
   * this is called so the consumer can fetch them, grow its catalog and re-feed
   * setDatasources(). Left unset, behaviour is exactly as before.
   */
  private columnRequestHandler:
    | ((schema: string | null, table: string) => void)
    | null = null;

  /**
   * Tables already requested, so a cache miss on every keystroke does not
   * become a request per keystroke. Cleared by setDatasources(), since a new
   * tree is the signal that a previous request landed.
   */
  private requestedColumns = new Set<string>();

  /**
   * Active dbType for completion / hover / signature-help. Drives which
   * dialect spec (keyword + function lists, parser) the providers read
   * from. Defaults to undefined → getDialectSpec falls back to Postgres
   * so legacy behaviour is preserved when the component hasn't wired in
   * a dbType yet.
   *
   * Updated via setActiveDbType() from add-dataset / edit-dataset when
   * the user selects (or the page loads with) a datasource. Provider
   * registration does NOT need to be redone on change — callbacks read
   * this field lazily.
   */
  activeDbType: DatabaseTypeValue | string | null = null;

  /**
   * Bumped on every setDatasources() call. Used to invalidate the lookup
   * cache below — providers stay registered, but rebuild their maps lazily
   * the first time they're called after a schema update.
   */
  private datasourcesVersion = 0;

  /** Cached lookups + the version they were built from. */
  private lookupsCache: SchemaLookups = EMPTY_LOOKUPS;
  private lookupsCacheVersion = -1;

  /** Cached parsed table references, keyed by the stripped statement text. */
  private tableRefsCache: { key: string; refs: TableRef[] } | null = null;
  private cteRefsCache: { key: string; refs: TableRef[] } | null = null;

  /**
   * Tiny LRU for stripped SQL — most editor activity targets the same 2-3
   * texts repeatedly (full document, current statement, text-up-to-cursor),
   * so a 4-entry cache covers >99% of repeated keystrokes. Map preserves
   * insertion order so eviction is just `delete(firstKey)`.
   */
  private stripCache = new Map<string, string>();
  private static readonly STRIP_CACHE_CAPACITY = 4;

  constructor() {}

  /**
   * Update the schema data the providers read from. Safe to call as often as
   * the schema changes — no provider re-registration required. Bumping the
   * version invalidates downstream lookup and parse caches.
   */
  setDatasources(datasources: DatasourceSchema[]): void {
    this.currentDatasources = datasources || [];
    this.datasourcesVersion++;
    // Pre-built lookups become stale; parse caches are tied to the lookups
    // that resolved the table names so they go stale too.
    this.lookupsCacheVersion = -1;
    this.tableRefsCache = null;
    this.cteRefsCache = null;
    // A fresh tree means any pending column fetch has landed (or been
    // superseded), so allow requests again — otherwise a table requested once
    // and later invalidated would never be asked for a second time.
    this.requestedColumns.clear();
  }

  /**
   * Update which dialect spec the completion / hover / signature-help
   * providers should pull from. Safe to call on every datasource switch
   * — providers don't need re-registration, the next callback invocation
   * reads the new value.
   *
   * Pass null/undefined to fall back to the Postgres default (used when
   * the component hasn't resolved a dbType yet).
   */
  /**
   * Install the lazy-column hook. See `columnRequestHandler`.
   *
   * Pass null to detach — a component must do this on destroy, or a closure over
   * a dead component keeps firing fetches against it.
   */
  setColumnRequestHandler(
    fn: ((schema: string | null, table: string) => void) | null,
  ): void {
    this.columnRequestHandler = fn;
    this.requestedColumns.clear();
  }

  setActiveDbType(dbType: DatabaseTypeValue | string | null | undefined): void {
    this.activeDbType = dbType ?? null;
  }

  /**
   * Build (or return cached) flat lookups over the current datasources.
   * Called on every keystroke from inside provideCompletionItems, so it
   * needs to be O(1) on cache hit.
   */
  getLookups(): SchemaLookups {
    if (this.lookupsCacheVersion === this.datasourcesVersion) {
      return this.lookupsCache;
    }

    const allTables: TableSchema[] = [];
    const tableByName: Map<string, TableSchema> = new Map();
    const schemaMap: Map<string, TableSchema[]> = new Map();
    const tableToSchema: Map<string, string> = new Map();

    for (const db of this.currentDatasources) {
      if (!db.schemas) continue;
      for (const schema of db.schemas) {
        if (!schema.tables) continue;
        const schemaKey = schema.name.toLowerCase();
        if (!schemaMap.has(schemaKey)) {
          schemaMap.set(schemaKey, []);
        }
        for (const table of schema.tables) {
          allTables.push(table);
          tableByName.set(table.name.toLowerCase(), table);
          tableByName.set(`${schemaKey}.${table.name.toLowerCase()}`, table);
          schemaMap.get(schemaKey)!.push(table);
          tableToSchema.set(table.name.toLowerCase(), schema.name);
        }
      }
    }

    this.lookupsCache = {
      allTables,
      tableByName,
      schemaMap,
      tableToSchema,
      schemaNames: Array.from(schemaMap.keys()),
    };
    this.lookupsCacheVersion = this.datasourcesVersion;
    return this.lookupsCache;
  }


  /**
   * Memoized wrapper around parseTableReferences. Most keystrokes happen inside
   * a single statement that hasn't structurally changed, so we cache by the
   * stripped statement text. Cache is invalidated automatically when the
   * datasources change (setDatasources clears it).
   */
  getCachedTableRefs(
    sql: string,
    tableByName: Map<string, TableSchema>,
  ): TableRef[] {
    if (this.tableRefsCache && this.tableRefsCache.key === sql) {
      return this.tableRefsCache.refs;
    }
    const refs = parseTableReferences(sql, tableByName);
    this.tableRefsCache = { key: sql, refs };
    return refs;
  }

  /** Memoized wrapper around parseCTEReferences — same caching strategy. */
  getCachedCTERefs(
    sql: string,
    tableByName: Map<string, TableSchema>,
  ): TableRef[] {
    if (this.cteRefsCache && this.cteRefsCache.key === sql) {
      return this.cteRefsCache.refs;
    }
    const refs = parseCTEReferences(sql, tableByName);
    this.cteRefsCache = { key: sql, refs };
    return refs;
  }

  /**
   * Resolve scope-tracker refs (which carry only schema/table/alias names)
   * into TableRef objects with their TableSchema attached, using the same
   * lookup map the regex parser uses. Drops refs that don't resolve — the
   * scope tracker may capture FROM-clause names that aren't in our schema
   * (a typo, a temp table, a view we can't see). Letting unresolved refs
   * through would cause downstream code to dereference null tableSchema.
   */
  resolveScopeRefs(
    scopeRefs: {
      schemaName: string | null;
      tableName: string;
      alias: string | null;
    }[],
    tableByName: Map<string, TableSchema>,
  ): TableRef[] {
    const out: TableRef[] = [];
    for (const r of scopeRefs) {
      const lookupKey = r.schemaName
        ? `${r.schemaName.toLowerCase()}.${r.tableName.toLowerCase()}`
        : r.tableName.toLowerCase();
      const tableSchema =
        tableByName.get(lookupKey) ||
        tableByName.get(r.tableName.toLowerCase()) ||
        null;
      // Resolved, but with no columns loaded yet: ask the consumer to fetch
      // them. This is the single choke point where a reference in the SQL becomes
      // a table schema, so hooking here covers dot completion, clause-scoped
      // columns and alias resolution alike.
      if (!tableSchema?.columns?.length) {
        this.requestColumns(r.schemaName, r.tableName);
      }

      out.push({
        schemaName: r.schemaName,
        tableName: r.tableName,
        alias: r.alias,
        tableSchema,
      });
    }
    return out;
  }

  /** Ask the consumer for a table's columns, at most once per table per tree. */
  requestColumns(schema: string | null, table: string): void {
    if (!this.columnRequestHandler) return;
    const key = `${(schema ?? '').toLowerCase()}.${table.toLowerCase()}`;
    if (this.requestedColumns.has(key)) return;
    this.requestedColumns.add(key);
    this.columnRequestHandler(schema, table);
  }

  // ─── STRING/COMMENT AWARENESS (cache over sql-text-analysis) ───

  /**
   * Cached strip-strings-and-comments. Same input → cached output, with a
   * tiny LRU so the validator and IntelliSense don't both pay the O(n) cost
   * on every keystroke.
   */
  stripCached(sql: string): string {
    const cached = this.stripCache.get(sql);
    if (cached !== undefined) {
      // Refresh recency: re-insert moves to end of Map order.
      this.stripCache.delete(sql);
      this.stripCache.set(sql, cached);
      return cached;
    }
    const result = stripStringsAndComments(sql);
    if (
      this.stripCache.size >= MonacoIntelliSenseService.STRIP_CACHE_CAPACITY
    ) {
      // Evict oldest (least recently used) entry.
      const oldestKey = this.stripCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.stripCache.delete(oldestKey);
      }
    }
    this.stripCache.set(sql, result);
    return result;
  }

  // ─── MULTI-STATEMENT ISOLATION ──────────────────────────────

  /**
   * Extract the current SQL statement around the cursor.
   * Finds statement boundaries by locating semicolons outside strings/comments.
   */
  getCurrentStatement(
    fullText: string,
    cursorOffset: number,
  ): { statement: string; startOffset: number } {
    const stripped = this.stripCached(fullText);
    let start = 0;
    let end = fullText.length;

    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] === ';') {
        if (i < cursorOffset) {
          start = i + 1;
        } else {
          end = i;
          break;
        }
      }
    }

    return {
      statement: fullText.substring(start, end),
      startOffset: start,
    };
  }

  // ─── INSERT / UPDATE COLUMN HELPERS ─────────────────────────


  /**
   * Register keyboard shortcuts for the editor
   */
  registerKeyboardShortcuts(
    editor: any,
    executeQueryCallback: () => void,
  ): void {
    // Execute query with Ctrl+Enter or Cmd+Enter
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeQueryCallback();
    });

    // Format SQL with Shift+Alt+F
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        editor.getAction('editor.action.formatDocument').run();
      },
    );
  }

  // ─── DOCUMENTATION HELPERS ─────────────────────────────────


  // ── Monaco providers ────────────────────────────────────────────
  //
  // The provider bodies live under ./intellisense. These four stay as the public
  // surface: call sites across the dataset screens and the Query Executor already
  // register providers through this service, and this service is what holds the
  // schema state and caches they read.

  /** Register SQL completion: keywords, functions, schemas, tables, columns. */
  registerSQLCompletions(datasources: DatasourceSchema[], editor: any): any {
    return registerSQLCompletions(this, datasources, editor);
  }

  /** Register hover documentation for tables, columns, keywords and functions. */
  registerHoverProvider(datasources: any[]): any {
    return registerHoverProvider(this, datasources);
  }

  /** Register signature help for SQL function calls. */
  registerSignatureHelpProvider(): any {
    return registerSignatureHelpProvider(this);
  }

  /** Unknown-table / unknown-column diagnostics for a statement. */
  findSchemaDiagnostics(
    sql: string,
  ): { start: number; end: number; message: string }[] {
    return findSchemaDiagnostics(this, sql);
  }

}
