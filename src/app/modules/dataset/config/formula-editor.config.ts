/**
 * Formula Editor Configuration
 * Contains Monaco Editor settings for custom formula language
 */

/**
 * Monaco Editor configuration options for formula editor
 */
export const FORMULA_EDITOR_OPTIONS = {
  language: 'formulaLang',
  automaticLayout: true,

  // IntelliSense & Autocomplete
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  wordBasedSuggestions: 'currentDocument' as const,
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

  // UI Features
  minimap: { enabled: false },
  folding: true,
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 3,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  smoothScrolling: true,
  mouseWheelZoom: false,
  fontSize: 14,
  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
  fontLigatures: false,
  lineHeight: 22,
  padding: { top: 8, bottom: 8 },

  // Bracket Features
  bracketPairColorization: { enabled: true },
  matchBrackets: 'always' as const,
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
  autoSurround: 'languageDefined' as const,
  dragAndDrop: true,
  copyWithSyntaxHighlighting: true,
  multiCursorModifier: 'alt' as const,

  // Find & Replace
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: 'never' as const,
    seedSearchStringFromSelection: 'selection' as const,
  },

  // Context Menu
  contextmenu: true,

  // Scrollbar
  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
    useShadows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },

  // Word wrap for long formulas
  wordWrap: 'on' as const,
  wrappingIndent: 'indent' as const,
  wrappingStrategy: 'advanced' as const,

  // Selection
  selectionHighlight: true,
  occurrencesHighlight: 'singleFile' as const,
  roundedSelection: true,

  // Other
  overviewRulerLanes: 2,
  hideCursorInOverviewRuler: false,
  overviewRulerBorder: false,
  glyphMargin: false,
  renderWhitespace: 'selection' as const,
  renderControlCharacters: false,
  links: true,
  colorDecorators: true,
};

/**
 * Editor loading configuration
 */
export const FORMULA_EDITOR_LOADING_CONFIG = {
  MAX_ATTEMPTS: 100,
  CHECK_INTERVAL_MS: 50,
  TIMEOUT_MS: 10000,
};
