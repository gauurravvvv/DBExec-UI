import { Injectable } from '@angular/core';
import { format, FormatOptionsWithLanguage } from 'sql-formatter';

declare const monaco: any;

/**
 * SQL Formatter Service
 * Provides SQL formatting functionality using sql-formatter library
 */
@Injectable({
  providedIn: 'root',
})
export class SqlFormatterService {
  private disposable: any = null;

  /**
   * Default formatting options
   */
  private defaultOptions: FormatOptionsWithLanguage = {
    language: 'postgresql',
    keywordCase: 'upper',
    indentStyle: 'standard',
    tabWidth: 2,
    linesBetweenQueries: 2,
  };

  constructor() {}

  /**
   * Format SQL string
   * @param sql - SQL string to format
   * @param options - Optional formatting options
   * @returns Formatted SQL string
   */
  formatSql(sql: string, options?: Partial<FormatOptionsWithLanguage>): string {
    try {
      const mergedOptions = { ...this.defaultOptions, ...options };
      return format(sql, mergedOptions);
    } catch (error) {
      console.error('SQL formatting error:', error);
      return sql; // Return original if formatting fails
    }
  }

  /**
   * Register Monaco document formatting provider
   * @returns Disposable to unregister the provider
   */
  registerFormattingProvider(): any {
    // Dispose previous provider if exists
    if (this.disposable) {
      this.disposable.dispose();
    }

    // Register document formatting provider
    this.disposable = monaco.languages.registerDocumentFormattingEditProvider(
      'sql',
      {
        provideDocumentFormattingEdits: (model: any) => {
          const text = model.getValue();
          const formatted = this.formatSql(text);

          return [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ];
        },
      }
    );

    // Also register range formatting provider for selection formatting
    monaco.languages.registerDocumentRangeFormattingEditProvider('sql', {
      provideDocumentRangeFormattingEdits: (model: any, range: any) => {
        const text = model.getValueInRange(range);
        const formatted = this.formatSql(text);

        return [
          {
            range: range,
            text: formatted,
          },
        ];
      },
    });

    return this.disposable;
  }

  /**
   * Format document in editor
   * @param editor - Monaco editor instance
   */
  formatDocument(editor: any): void {
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run();
    }
  }

  /**
   * Format selection in editor
   * @param editor - Monaco editor instance
   */
  formatSelection(editor: any): void {
    if (editor) {
      editor.getAction('editor.action.formatSelection')?.run();
    }
  }

  /**
   * Add format action to editor context menu
   * @param editor - Monaco editor instance
   */
  registerContextMenuActions(editor: any): void {
    // Format Document action
    editor.addAction({
      id: 'sql.formatDocument',
      label: 'Format SQL',
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      ],
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.5,
      run: () => {
        this.formatDocument(editor);
      },
    });

    // Format Selection action
    editor.addAction({
      id: 'sql.formatSelection',
      label: 'Format Selected SQL',
      precondition: 'editorHasSelection',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.6,
      run: () => {
        this.formatSelection(editor);
      },
    });
  }

  /**
   * Update formatting options
   * @param options - New formatting options
   */
  setOptions(options: Partial<FormatOptionsWithLanguage>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Get current formatting options
   */
  getOptions(): FormatOptionsWithLanguage {
    return { ...this.defaultOptions };
  }

  /**
   * Cleanup provider
   */
  dispose(): void {
    if (this.disposable) {
      this.disposable.dispose();
      this.disposable = null;
    }
  }
}
