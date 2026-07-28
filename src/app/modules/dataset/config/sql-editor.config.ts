/**
 * SQL editor configuration — Monaco options, context-menu wiring, and
 * feature-flag constants for the SQL editor surface.
 *
 * Dialect-specific data (keywords, types, function catalog, parser) for
 * each supported engine (postgres / mysql / mariadb / mssql / oracle /
 * snowflake) lives under ./sql-dialects/ and is consumed at runtime by
 * MonacoIntelliSenseService and SqlLinterService. Don't add per-engine
 * lists to this file — they belong in the dialect modules so they stay
 * scoped to one engine at a time.
 */
import { sqlEditorOptions } from '../../../shared/editor/monaco-options';

/**
 * "Empty" content for the SQL editor. Originally a comment placeholder
 * ("-- Write your SQL query here") but that confused users — many treated it
 * as real content and started typing over the comment markers, while the
 * Save/Run buttons stayed disabled because isQueryEmpty matched the literal.
 *
 * Now an empty string. Monaco shows its own ghost-text affordances; the
 * downstream `value === SQL_EDITOR_PLACEHOLDER` checks all still hold because
 * `'' === ''` is true and `!query || query === ''` is the same predicate.
 */
export const SQL_EDITOR_PLACEHOLDER = '';

/**
 * Monaco Editor configuration options
 */
/**
 * Monaco options for the SQL editors.
 *
 * Re-exported from the app-wide definition so there is ONE options object. The
 * name is kept because several components import it; the body moved to
 * `shared/editor/monaco-options.ts`, which the Query Executor now shares.
 */
export const MONACO_EDITOR_OPTIONS = sqlEditorOptions();

/**
 * Context analysis patterns for intelligent autocomplete
 */
export const CONTEXT_PATTERNS = {
  expectingTableName: /(FROM|JOIN|INTO|UPDATE|TABLE)\s+$/i,
  expectingColumnName: /(SELECT|WHERE|SET|ON|GROUP BY|ORDER BY)\s+$/i,
  afterDot: /\.\s*$/,
  inSelectClause: /SELECT[\s\S]*?(?:FROM|$)/i,
  inWhereClause: /WHERE[\s\S]*?(?:GROUP BY|ORDER BY|LIMIT|$)/i,
  inJoinClause: /JOIN[\s\S]*?(?:WHERE|GROUP BY|ORDER BY|$)/i,
};

/**
 * Editor loading configuration
 */
export const EDITOR_LOADING_CONFIG = {
  MAX_ATTEMPTS: 200,
  CHECK_INTERVAL_MS: 50,
  TIMEOUT_MS: 20000,
};

/**
 * Maximum time the FE will wait for a single query/execute or export response
 * before surfacing a timeout error. The BE has its own DB-level timeouts; this
 * is a safety net so the editor never appears to hang forever on a runaway
 * query or a stalled connection.
 */
export const QUERY_EXECUTION_TIMEOUT_MS = 60_000;

/**
 * Feature flag for the dialect-aware in-browser SQL linter (Phase 3 of
 * the SQL-editor dialect rework). When true, the editor runs each model
 * through the active dialect's Lezer parser on every change (debounced)
 * and decorates syntax errors with Monaco markers.
 *
 * Off by default — Snowflake has no Lezer grammar (`parser: null`) and
 * even the bundled lang-sql parsers are too strict for some dialect
 * quirks (e.g. MySQL backtick quoting in odd positions). Enable when
 * we've shaken out the false-positive surface.
 */
export const ENABLE_DIALECT_LINT = false;

/**
 * Debounce window (ms) for re-running the lint pass on model changes.
 * Editor keystrokes fire change events at a high rate; 300ms is fast
 * enough to feel live without re-parsing every character.
 */
export const DIALECT_LINT_DEBOUNCE_MS = 300;

/**
 * SQL Editor Context Menu Actions Configuration
 * Defines custom context menu items for SQL editing
 */
export const SQL_CONTEXT_MENU_ACTIONS = [
  {
    id: 'sql.executeQuery',
    label: 'Run SQL',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1,
    keybindings: ['CtrlCmd+Enter'],
    description:
      'Smart execution: runs selected SQL if text is selected, otherwise runs the current statement at cursor (between semicolons)',
  },
  {
    id: 'sql.executeCompleteQuery',
    label: 'Run Complete SQL',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 2,
    keybindings: ['CtrlCmd+Shift+Enter'],
    description: 'Always execute the entire SQL content in the editor',
  },
  {
    id: 'sql.executeSelectedQuery',
    label: 'Run Selected SQL',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 3,
    precondition: 'editorHasSelection',
    description:
      'Execute only the selected SQL text (visible only when text is selected)',
  },
];

/**
 * Hidden/Disabled Context Menu Items
 * Items from default Monaco menu that should be hidden for SQL editor
 */
export const HIDDEN_CONTEXT_MENU_ITEMS = [
  'editor.action.quickCommand', // Command Palette
  'editor.action.formatDocument', // Format Document (we handle SQL formatting separately)
];
