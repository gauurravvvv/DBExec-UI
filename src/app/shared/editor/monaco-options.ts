/**
 * The single Monaco options set for the whole app.
 *
 * Query Executor, Dataset Creator, Field Creator and their edit screens all
 * build their editor from `BASE_EDITOR_OPTIONS`, so behaviour and appearance
 * cannot drift. Before this existed there were three definitions; the SQL one
 * turned out to be a strict subset of the formula one — identical on all 32
 * shared keys, missing 22 others — which is why the formula config is the base
 * here.
 *
 * Only five options legitimately differ by context. Each is set in the helper
 * below with the reason, so a future reader can tell a deliberate difference
 * from an oversight.
 */

/**
 * Shared by every editor in the app.
 *
 * `theme` is deliberately absent: it is passed at `create` time from
 * `currentDbexecTheme()`, because Monaco's theme is global and each component
 * must assert it after creation to correct a leak from another editor.
 */
export const BASE_EDITOR_OPTIONS = {
  automaticLayout: true,

  // ── IntelliSense ────────────────────────────────────────────────────────
  quickSuggestions: { other: true, comments: true, strings: true },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  tabCompletion: 'on' as const,
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showWords: true,
    showVariables: true,
    insertMode: 'insert' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false,
  },
  quickSuggestionsDelay: 50,

  // ── Chrome ──────────────────────────────────────────────────────────────
  folding: true,
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 3,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  smoothScrolling: true,

  // Monaco reads fontFamily as a literal CSS list and cannot resolve
  // var(--font-mono), so the stack is duplicated here. Keep it in step with
  // the --font-mono token.
  fontSize: 14,
  fontFamily:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  lineHeight: 22,
  padding: { top: 8, bottom: 8 },

  // ── Brackets ────────────────────────────────────────────────────────────
  bracketPairColorization: { enabled: true },
  matchBrackets: 'always' as const,
  guides: { bracketPairs: true, indentation: true },

  // ── Editing ─────────────────────────────────────────────────────────────
  formatOnPaste: false,
  formatOnType: false,
  autoClosingBrackets: 'always' as const,
  autoClosingQuotes: 'always' as const,
  autoIndent: 'full' as const,
  autoSurround: 'languageDefined' as const,
  dragAndDrop: true,
  copyWithSyntaxHighlighting: true,
  multiCursorModifier: 'alt' as const,

  // ── Find & replace ──────────────────────────────────────────────────────
  // Monaco's native widget, styled as a compact card in _editor-chrome.scss.
  // It replaced the executor's hand-built CodeMirror search panel.
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: 'never' as const,
    seedSearchStringFromSelection: 'selection' as const,
  },

  contextmenu: true,

  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
    useShadows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },

  wordWrap: 'on' as const,
  wrappingIndent: 'indent' as const,
  wrappingStrategy: 'advanced' as const,

  selectionHighlight: true,
  occurrencesHighlight: 'singleFile' as const,
  roundedSelection: true,

  overviewRulerLanes: 2,
  hideCursorInOverviewRuler: false,
  overviewRulerBorder: false,
  glyphMargin: false,
  renderWhitespace: 'selection' as const,
  renderControlCharacters: false,
  links: true,
  colorDecorators: true,
};

/** Options for the SQL editors — Query Executor, Dataset Creator/Editor. */
export function sqlEditorOptions<T extends object>(overrides?: T) {
  return {
    ...BASE_EDITOR_OPTIONS,
    language: 'sql',
    // A dataset query or an executor script runs to hundreds of lines, where an
    // overview is worth the gutter width. A formula is a single expression.
    minimap: { enabled: true },
    // Ligatures make SQL operators (<=, <>, ||) read as single glyphs, which
    // suits prose-like SQL. In a formula, seeing the exact characters matters
    // more than typography.
    fontLigatures: true,
    mouseWheelZoom: true,
    // Off for SQL: identifiers already come from the schema catalog, and
    // word-based suggestions bury real column names under noise from comments
    // and string literals.
    wordBasedSuggestions: false as const,
    ...(overrides ?? {}),
  };
}

/** Options for the formula editor — Field Creator, add and edit. */
export function formulaEditorOptions<T extends object>(overrides?: T) {
  return {
    ...BASE_EDITOR_OPTIONS,
    language: 'formulaLang',
    minimap: { enabled: false },
    fontLigatures: false,
    mouseWheelZoom: false,
    // On for formulas: a long formula often reuses a field name it already
    // mentions, and completing from the current document is a real help.
    wordBasedSuggestions: 'currentDocument' as const,
    ...(overrides ?? {}),
  };
}
