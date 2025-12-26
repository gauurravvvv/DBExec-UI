// Monaco Editor Custom Language Configuration for Formula Editor

// Declare Monaco for TypeScript
declare const monaco: any;

/**
 * Interface for custom field data
 */
export interface CustomFieldData {
  columnToView: string;
  columnToUse: string;
  formula: string;
}

/**
 * Default empty custom field
 */
export const DEFAULT_CUSTOM_FIELD: CustomFieldData = {
  columnToView: '',
  columnToUse: '',
  formula: '',
};

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
    FORMULA_LANGUAGE_CONFIG
  );

  // Set token provider for syntax highlighting
  monaco.languages.setMonarchTokensProvider('formulaLang', FORMULA_TOKENIZER);
}

/**
 * Get Monaco editor theme based on current app theme
 */
export function getCurrentMonacoTheme(): string {
  const isDarkTheme = document.body.classList.contains('dark-theme');
  return isDarkTheme ? 'vs-dark' : 'vs';
}

/**
 * Create a theme observer that updates Monaco editor theme when app theme changes
 */
export function createThemeObserver(
  onThemeChange: (theme: string) => void
): MutationObserver {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'class'
      ) {
        const newTheme = getCurrentMonacoTheme();
        onThemeChange(newTheme);
      }
    });
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return observer;
}

/**
 * Generate completion items for functions
 */
export function createFunctionCompletionItem(
  fn: { name: string; usage: string; description: string },
  range: any,
  monaco: any
): any {
  return {
    label: fn.name,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: `Function: ${fn.name}()`,
    documentation: {
      value: `**${fn.name}**\n\n\`\`\`\n${fn.usage}\n\`\`\`\n\n${fn.description}`,
      isTrusted: true,
    },
    insertText: fn.usage,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range: range,
  };
}

/**
 * Generate completion items for dataset fields
 */
export function createFieldCompletionItem(
  field: any,
  range: any,
  monaco: any,
  isAfterBrace: boolean
): any {
  const fieldName = field.columnToUse || field.columnToView;

  if (isAfterBrace) {
    // Completing inside { - just add the field name + closing brace
    return {
      label: field.columnToView || field.columnToUse,
      kind: monaco.languages.CompletionItemKind.Variable,
      detail: field.type === 1 ? 'Dataset Field' : 'Custom Field',
      documentation:
        field.type === 1
          ? `Column: ${field.columnToUse}\nDisplay: ${field.columnToView}`
          : `Custom Logic: ${field.customLogic}`,
      insertText: fieldName + '}',
      range: {
        ...range,
        startColumn: range.startColumn,
      },
    };
  } else {
    // Completing from scratch - add full {fieldName}
    return {
      label: `{${fieldName}}`,
      kind: monaco.languages.CompletionItemKind.Variable,
      detail: 'Dataset Field',
      documentation: `Column: ${field.columnToUse}\nDisplay: ${field.columnToView}`,
      insertText: `{${fieldName}}`,
      range: range,
    };
  }
}
