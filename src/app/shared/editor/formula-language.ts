/**
 * The `formulaLang` Monaco language — grammar and registration.
 *
 * Lives in shared/editor rather than in the dataset module because
 * CodeEditorService registers it, and the shared layer must not import from a
 * feature module. The Field Creator still imports these names from its own
 * helper, which now re-exports them, so nothing at the call sites changed.
 */

// Declare Monaco for TypeScript
declare const monaco: any;

/**
 * Formula language configuration for Monaco Editor
 */
export const FORMULA_LANGUAGE_CONFIG = {
  brackets: [
    ['(', ')'],
    ['{', '}'],
    ['[', ']'],
  ] as [string, string][],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
};

/**
 * Token provider for formula language syntax highlighting
 */
export const FORMULA_TOKENIZER = {
  tokenizer: {
    root: [
      // Field references like {field_name}
      [/\{[^}]+\}/, 'variable'],
      // Function names followed by (
      [/[a-zA-Z_]\w*(?=\s*\()/, 'function'],
      // String literals
      [/'[^']*'/, 'string'],
      [/"[^"]*"/, 'string'],
      // Numbers
      [/\d+(\.\d+)?/, 'number'],
      // Operators
      [/[+\-*/%=<>!&|,]/, 'operator'],
      // Brackets
      [/[(){}[\]]/, 'bracket'],
      // Keywords
      [/\b(if|else|then|and|or|not|true|false|null)\b/i, 'keyword'],
    ],
  },
};

/**
 * Register the custom formula language with Monaco Editor
 * Should only be called once per application
 */
export function registerFormulaLanguage(): void {
  if (typeof monaco === 'undefined') return;

  // Check if already registered
  const languages = monaco.languages.getLanguages();
  const isRegistered = languages.some((lang: any) => lang.id === 'formulaLang');
  if (isRegistered) return;

  // Register custom language
  monaco.languages.register({ id: 'formulaLang' });

  // Set language configuration
  monaco.languages.setLanguageConfiguration(
    'formulaLang',
    FORMULA_LANGUAGE_CONFIG,
  );

  // Set token provider for syntax highlighting
  monaco.languages.setMonarchTokensProvider('formulaLang', FORMULA_TOKENIZER);
}
