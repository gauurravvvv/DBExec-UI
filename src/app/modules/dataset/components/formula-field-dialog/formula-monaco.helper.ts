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
  dataType: string;
}

/**
 * Default empty custom field
 */
export const DEFAULT_CUSTOM_FIELD: CustomFieldData = {
  columnToView: '',
  columnToUse: '',
  formula: '',
  dataType: 'text',
};

/**
 * Formula language — moved to shared/editor/formula-language.ts so
 * CodeEditorService can register it without the shared layer depending on a
 * feature module. Re-exported here because the dialog and its tests import
 * these names from this file.
 */
export {
  FORMULA_LANGUAGE_CONFIG,
  FORMULA_TOKENIZER,
  registerFormulaLanguage,
} from '../../../../shared/editor/formula-language';

/**
 * Re-exported from the app-wide theme so every editor shares one definition.
 *
 * The previous local themes hard-coded hex values, which was wrong: ThemeService
 * rewrites --primary-color at runtime per organisation, so a branded org got a
 * branded app and a stock-blue editor. The shared theme reads the computed token
 * values instead. It also dropped a `dark-theme` branch that could never fire —
 * nothing in the app adds that class.
 */
import {
  currentDbexecTheme,
  defineDbexecThemes,
} from '../../../../shared/editor/monaco-theme';

// `getCurrentMonacoTheme` is kept as an alias so existing call sites read the
// same; both names resolve to the one shared theme.
export { defineDbexecThemes, currentDbexecTheme as getCurrentMonacoTheme };

/**
 * Create a theme observer that updates Monaco editor theme when app theme changes
 */
export function createThemeObserver(
  onThemeChange: (theme: string) => void,
): MutationObserver {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'class'
      ) {
        const newTheme = currentDbexecTheme();
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
  monaco: any,
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
  isAfterBrace: boolean,
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
