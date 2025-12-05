import { Injectable } from '@angular/core';
import { TableSchema, TableColumn } from '../helpers/dummy-data.helper';
import { SQL_KEYWORDS, SQL_FUNCTIONS, SQL_SNIPPETS, CONTEXT_PATTERNS } from '../config/sql-editor.config';

declare const monaco: any;

/**
 * Service to handle Monaco Editor IntelliSense registration
 * Provides SQL completions, hover providers, and keyboard shortcuts
 */
@Injectable({
  providedIn: 'root'
})
export class MonacoIntelliSenseService {

  constructor() {}

  /**
   * Register SQL completions for tables, columns, keywords, functions, and snippets
   * @returns Disposable to unregister the provider
   */
  registerSQLCompletions(databases: any[], editor: any): any {
    // Get all tables from all databases and schemas
    const tables: TableSchema[] = [];
    const tableColumns: { [key: string]: TableColumn[] } = {};

    if (databases && databases.length > 0) {
      for (const db of databases) {
        for (const schema of db.schemas) {
          for (const table of schema.tables) {
            tables.push(table);
            const fullTableName = schema.name === 'public' ? table.name : `${schema.name}.${table.name}`;
            tableColumns[fullTableName] = table.columns;
            tableColumns[table.name] = table.columns;
          }
        }
      }
    }

    if (tables.length === 0) return null;

    return monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', ',', '('],
      provideCompletionItems: (model: any, position: any) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        // Check for table.column pattern (e.g., "users.")
        const dotMatch = textUntilPosition.match(/(\w+)\.$/);
        if (dotMatch) {
          const tableName = dotMatch[1];
          const table = tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());

          if (table) {
            const columnSuggestions = table.columns.map(col => ({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${col.type}${col.nullable ? ' (nullable)' : ''}${col.isPrimaryKey ? ' PK' : ''}`,
              documentation: this.getColumnDocumentation(col),
              insertText: col.name,
              range: range
            }));

            return { suggestions: columnSuggestions };
          }
        }

        // Analyze context
        const context = this.analyzeContext(textUntilPosition);
        let suggestions: any[] = [];

        // Table name suggestions
        if (context.expectingTableName) {
          suggestions = tables.map(table => ({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: `Table (${table.columns.length} columns)`,
            documentation: this.getTableDocumentation(table),
            insertText: table.name,
            range: range
          }));
        }

        // Column suggestions
        if (context.expectingColumnName && context.currentTable) {
          const table = tables.find(t => t.name.toLowerCase() === context.currentTable!.toLowerCase());
          if (table) {
            suggestions = table.columns.map(col => ({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${table.name}.${col.name} (${col.type})`,
              documentation: this.getColumnDocumentation(col),
              insertText: col.name,
              range: range
            }));
          }
        }

        // SQL Keywords from config
        const keywordSuggestions = SQL_KEYWORDS.map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: 'SQL Keyword',
          insertText: kw,
          range: range
        }));

        // SQL Functions from config
        const functionSuggestions = SQL_FUNCTIONS.map(fn => ({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: 'SQL Function',
          documentation: `**${fn.name}**(${fn.params})\n\n${fn.description}`,
          insertText: `${fn.name}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: range
        }));

        // SQL Snippets from config
        const snippetSuggestions = SQL_SNIPPETS.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'SQL Snippet',
          documentation: snippet.documentation,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: range
        }));

        // Dynamic snippets based on schema (smart JOINs)
        const dynamicSnippets = this.generateDynamicSnippets(tables, range);

        return {
          suggestions: [
            ...suggestions,
            ...keywordSuggestions,
            ...functionSuggestions,
            ...snippetSuggestions,
            ...dynamicSnippets
          ]
        };
      }
    });
  }

  /**
   * Analyze SQL context to determine what suggestions to show
   */
  private analyzeContext(text: string): {
    expectingTableName: boolean;
    expectingColumnName: boolean;
    currentTable: string | null;
    inWhereClause: boolean;
    inSelectClause: boolean;
  } {
    // Use patterns from config
    const expectingTableName = CONTEXT_PATTERNS.expectingTableName.test(text);
    const expectingColumnName = CONTEXT_PATTERNS.expectingColumnName.test(text);

    // Extract current table
    const fromTableMatch = text.match(/\bfrom\s+(\w+)/i);
    const currentTable = fromTableMatch ? fromTableMatch[1] : null;

    // Determine context using patterns
    const inSelectClause = CONTEXT_PATTERNS.inSelectClause.test(text) && !/\bfrom\s+/i.test(text);
    const inWhereClause = CONTEXT_PATTERNS.inWhereClause.test(text);

    return {
      expectingTableName,
      expectingColumnName,
      currentTable,
      inWhereClause,
      inSelectClause
    };
  }

  /**
   * Register hover provider for tables and columns
   * @returns Disposable to unregister the provider
   */
  registerHoverProvider(databases: any[]): any {
    // Get all tables from all databases and schemas
    const tables: TableSchema[] = [];

    if (databases && databases.length > 0) {
      for (const db of databases) {
        for (const schema of db.schemas) {
          for (const table of schema.tables) {
            tables.push(table);
          }
        }
      }
    }

    if (tables.length === 0) return null;

    return monaco.languages.registerHoverProvider('sql', {
      provideHover: (model: any, position: any) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        // Check if it's a table
        const table = tables.find((t: TableSchema) => t.name.toLowerCase() === word.word.toLowerCase());
        if (table) {
          const contents = [
            { value: `**Table: ${table.name}**` },
            { value: '```\n' + table.columns.map((c: TableColumn) =>
              `${c.name} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK' : ''}`
            ).join('\n') + '\n```' }
          ];
          return { contents };
        }

        // Check if it's a column
        for (const table of tables) {
          const column = table.columns.find((c: TableColumn) => c.name.toLowerCase() === word.word.toLowerCase());
          if (column) {
            const contents = [
              { value: `**Column: ${table.name}.${column.name}**` },
              { value: `Type: \`${column.type}\`` },
              { value: `Nullable: ${column.nullable ? 'Yes' : 'No'}` }
            ];
            if (column.isPrimaryKey) contents.push({ value: '🔑 **Primary Key**' });
            if (column.isForeignKey) {
              contents.push({ value: `🔗 **Foreign Key** → ${column.foreignKeyTable}.${column.foreignKeyColumn}` });
            }
            return { contents };
          }
        }

        return null;
      }
    });
  }

  /**
   * Register keyboard shortcuts for the editor
   */
  registerKeyboardShortcuts(editor: any, executeQueryCallback: () => void): void {
    // Execute query with Ctrl+Enter or Cmd+Enter
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeQueryCallback();
    });

    // Format SQL with Shift+Alt+F
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        editor.getAction('editor.action.formatDocument').run();
      }
    );
  }

  /**
   * Generate dynamic snippets based on foreign key relationships
   */
  private generateDynamicSnippets(tables: TableSchema[], range: any): any[] {
    const snippets: any[] = [];

    // Generate smart JOIN snippets based on foreign keys
    for (const table of tables) {
      for (const col of table.columns) {
        if (col.isForeignKey && col.foreignKeyTable && col.foreignKeyColumn) {
          snippets.push({
            label: `join_${table.name}_${col.foreignKeyTable}`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: `JOIN ${table.name} with ${col.foreignKeyTable}`,
            documentation: `Smart join based on foreign key relationship`,
            insertText: `JOIN ${table.name} ON ${col.foreignKeyTable}.${col.foreignKeyColumn} = ${table.name}.${col.name}$0`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          });
        }
      }
    }

    return snippets;
  }

  /**
   * Get formatted documentation for a table
   */
  private getTableDocumentation(table: TableSchema): string {
    return `**${table.name}** (${table.columns.length} columns)\n\n` +
      table.columns.map(c =>
        `• ${c.name}: ${c.type}${c.isPrimaryKey ? ' 🔑' : ''}${c.isForeignKey ? ' 🔗' : ''}`
      ).join('\n');
  }

  /**
   * Get formatted documentation for a column
   */
  private getColumnDocumentation(col: TableColumn): string {
    let doc = `**Type:** ${col.type}\n`;
    doc += `**Nullable:** ${col.nullable ? 'Yes' : 'No'}\n`;
    if (col.isPrimaryKey) doc += `**Primary Key:** Yes\n`;
    if (col.isForeignKey && col.foreignKeyTable) {
      doc += `**Foreign Key:** References ${col.foreignKeyTable}.${col.foreignKeyColumn}\n`;
    }
    return doc;
  }
}
