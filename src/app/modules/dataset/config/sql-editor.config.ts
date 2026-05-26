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
export const MONACO_EDITOR_OPTIONS = {
  language: 'sql',
  automaticLayout: true,

  // IntelliSense & Autocomplete
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  wordBasedSuggestions: false,
  tabCompletion: 'on' as const,
  suggest: {
    // showKeywords gates ALL items with kind === Keyword in the suggest
    // widget — including ones our own provider emits. Was previously false
    // (intent: silence Monaco's built-in SQL keyword list), but that also
    // dropped DISTINCT, ASC, DESC, IS NULL, etc. that we explicitly add.
    // wordBasedSuggestions: false below already handles the built-in noise.
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showWords: false,
    insertMode: 'insert' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false,
    localityBonus: true,
    shareSuggestSelections: true,
    showIcons: true,
    maxVisibleSuggestions: 15,
  },
  quickSuggestionsDelay: 50,

  // UI Features
  minimap: { enabled: true },
  folding: true,
  lineNumbers: 'on' as const,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  smoothScrolling: true,
  mouseWheelZoom: true,
  // Match the rest of the app: JetBrains Mono with ui-monospace fallback so
  // the editor reads with the same family as inline code chips and version
  // chips. Monaco reads fontFamily as a literal CSS list and does not
  // resolve var(...), so the stack is duplicated here from --font-mono.
  fontSize: 14,
  fontFamily:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontLigatures: true,

  // Bracket Features
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },

  // Editing Features
  formatOnPaste: false,
  formatOnType: false,
  autoClosingBrackets: 'always' as const,
  autoClosingQuotes: 'always' as const,
  autoIndent: 'full' as const,
  multiCursorModifier: 'alt' as const,

  // Context Menu - Hide unnecessary items for SQL editor
  contextmenu: true,

  // Scrollbar
  //
  // 3px to match the result-table scrollbars (defined in styles.scss).
  // The visual rhythm across editor + result table stays consistent —
  // both surfaces use the same hairline rounded pill. Shadows off
  // because they add no value on a 3px slider (the fade gradient
  // would overpower the bar itself).
  scrollbar: {
    vertical: 'visible' as const,
    horizontal: 'visible' as const,
    useShadows: false,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 3,
  },
};

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
 * Monaco Editor theme names
 */
export const MONACO_THEMES = {
  LIGHT: 'vs',
  DARK: 'vs-dark',
  HIGH_CONTRAST: 'hc-black',
} as const;

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
