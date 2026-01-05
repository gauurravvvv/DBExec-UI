import { Injectable } from '@angular/core';
import { TableSchema, TableColumn } from '../helpers/dummy-data.helper';
import {
  SQL_KEYWORDS,
  SQL_FUNCTIONS,
  SQL_SNIPPETS,
  CONTEXT_PATTERNS,
} from '../config/sql-editor.config';

declare const monaco: any;

/**
 * Service to handle Monaco Editor IntelliSense registration
 * Provides SQL completions, hover providers, and keyboard shortcuts
 */
@Injectable({
  providedIn: 'root',
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
        if (!db.schemas || db.schemas.length === 0) {
          continue;
        }

        for (const schema of db.schemas) {
          if (!schema.tables || schema.tables.length === 0) {
            continue;
          }

          for (const table of schema.tables) {
            tables.push(table);
            const fullTableName =
              schema.name === 'public'
                ? table.name
                : `${schema.name}.${table.name}`;
            tableColumns[fullTableName] = table.columns;
            tableColumns[table.name] = table.columns;
          }
        }
      }
    }

    if (tables.length === 0) {
      return null;
    }

    return monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', ',', '('],
      provideCompletionItems: (model: any, position: any) => {
        try {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const word = model.getWordUntilPosition(position);
          let range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // Build alias map from the query
          // Matches: FROM table alias, FROM table AS alias, JOIN table alias
          const aliasMap: { [alias: string]: string } = {};
          const aliasRegex =
            /\b(?:from|join)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
          let aliasMatch;
          while ((aliasMatch = aliasRegex.exec(textUntilPosition)) !== null) {
            const tableName = aliasMatch[2];
            const alias = aliasMatch[3];
            if (alias) {
              aliasMap[alias.toLowerCase()] = tableName;
            }
            // Also map table name to itself for direct access
            aliasMap[tableName.toLowerCase()] = tableName;
          }

          // Check for dot pattern: schema.table. OR table. OR alias.
          // Matches: "users." or "public.users." or "u."
          const dotMatch = textUntilPosition.match(/(?:(\w+)\.)?(\w+)\.$/);
          if (dotMatch) {
            const firstPart = dotMatch[1]; // schema or nothing
            const secondPart = dotMatch[2]; // table/alias or schema

            // FIX: Adjust range to start at current position (after the dot)
            // This ensures suggestions are inserted correctly
            range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            };

            // Case 1: schema.table. (column completion for schema-qualified table)
            if (firstPart) {
              // Check if firstPart is a schema and secondPart is a table
              const schema = databases
                .find(db =>
                  db.schemas.some(
                    (s: any) => s.name.toLowerCase() === firstPart.toLowerCase()
                  )
                )
                ?.schemas.find(
                  (s: any) => s.name.toLowerCase() === firstPart.toLowerCase()
                );

              if (schema) {
                const schemaTable = schema.tables.find(
                  (t: any) => t.name.toLowerCase() === secondPart.toLowerCase()
                );

                if (schemaTable) {
                  // Return columns for schema.table
                  const columnSuggestions = schemaTable.columns.map(
                    (col: any) => ({
                      label: col.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      detail: `${col.type}${col.nullable ? ' (nullable)' : ''}${
                        col.isPrimaryKey ? ' PK' : ''
                      }`,
                      documentation: this.getColumnDocumentation(col),
                      insertText: col.name,
                      range: range,
                    })
                  );
                  return { suggestions: columnSuggestions };
                }
              }
            }

            // Case 2: table. or alias. (column completion)
            // Try to resolve as alias first, then as direct table name
            const resolvedTableName =
              aliasMap[secondPart.toLowerCase()] || secondPart;
            const table = tables.find(
              t => t.name.toLowerCase() === resolvedTableName.toLowerCase()
            );

            if (table) {
              const columnSuggestions = table.columns.map(col => ({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.type}${col.nullable ? ' (nullable)' : ''}${
                  col.isPrimaryKey ? ' PK' : ''
                }`,
                documentation: this.getColumnDocumentation(col),
                insertText: col.name,
                range: range,
              }));

              return { suggestions: columnSuggestions };
            }

            // Case 3: schema. (table completion for schema name)
            const schemaForTables = databases
              .find(db =>
                db.schemas.some(
                  (s: any) => s.name.toLowerCase() === secondPart.toLowerCase()
                )
              )
              ?.schemas.find(
                (s: any) => s.name.toLowerCase() === secondPart.toLowerCase()
              );

            if (schemaForTables) {
              const tableSuggestions = schemaForTables.tables.map(
                (tbl: any) => ({
                  label: tbl.name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  detail: `Table (${tbl.columns.length} columns)`,
                  documentation: this.getTableDocumentation(tbl),
                  insertText: tbl.name,
                  range: range,
                })
              );

              return { suggestions: tableSuggestions };
            }

            // FIX: Early return with empty suggestions when dot matches but nothing found
            // This prevents confusing fall-through behavior
            return { suggestions: [] };
          }

          // Analyze context
          const context = this.analyzeContext(textUntilPosition);
          let suggestions: any[] = [];

          // Always include table suggestions after FROM, JOIN, INTO, UPDATE
          if (/\b(from|join|into|update)\s+\w*$/i.test(textUntilPosition)) {
            // Add table suggestions
            suggestions = tables.map(table => ({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: `Table (${table.columns.length} columns)`,
              documentation: this.getTableDocumentation(table),
              insertText: `${table.name} `,
              range: range,
            }));

            // Add schema suggestions
            if (databases && databases.length > 0) {
              databases.forEach((db: any) => {
                if (db.schemas) {
                  db.schemas.forEach((schema: any) => {
                    suggestions.push({
                      label: schema.name,
                      kind: monaco.languages.CompletionItemKind.Module,
                      detail: `Schema (${schema.tables?.length || 0} tables)`,
                      documentation: `Schema: ${schema.name}`,
                      insertText: schema.name,
                      range: range,
                    });
                  });
                }
              });
            }
          } else if (context.expectingTableName) {
            suggestions = tables.map(table => ({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: `Table (${table.columns.length} columns)`,
              documentation: this.getTableDocumentation(table),
              insertText: `${table.name} `,
              range: range,
            }));
          }

          // Column suggestions - Extract table name from query
          // Support patterns like: FROM table WHERE, FROM schema.table WHERE, JOIN table ON, etc.
          const tableNameMatch = textUntilPosition.match(
            /\b(?:from|join|update)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:as\s+)?(\w+))?\s+(?:where|on|set|and|or|having|order|group)\s+\w*$/i
          );
          if (tableNameMatch) {
            const schemaName = tableNameMatch[1];
            const tableName = tableNameMatch[2];

            let table = tables.find(
              t => t.name.toLowerCase() === tableName.toLowerCase()
            );

            if (table) {
              const columnSuggestions = table.columns.map(col => ({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.type}${col.isPrimaryKey ? ' PK' : ''}${
                  col.isForeignKey ? ' FK' : ''
                }`,
                documentation: this.getColumnDocumentation(col),
                insertText: col.name,
                range: range,
              }));

              // Return columns + keywords for WHERE/ON clauses
              const keywordSuggestions = SQL_KEYWORDS.filter(kw =>
                [
                  'AND',
                  'OR',
                  'NOT',
                  'IN',
                  'LIKE',
                  'BETWEEN',
                  'IS',
                  'NULL',
                ].includes(kw)
              ).map(kw => ({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                detail: 'SQL Keyword',
                insertText: kw,
                range: range,
              }));

              return {
                suggestions: [...columnSuggestions, ...keywordSuggestions],
              };
            }
          }

          // Column suggestions in SELECT clause
          if (
            /\bselect\s+\w*$/i.test(textUntilPosition) ||
            /\bselect\s+.*,\s*\w*$/i.test(textUntilPosition)
          ) {
            const allColumns: any[] = [];
            tables.forEach((table: TableSchema) => {
              table.columns.forEach((col: TableColumn) => {
                allColumns.push({
                  label: `${table.name}.${col.name}`,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: `${col.type} (from ${table.name})`,
                  documentation: this.getColumnDocumentation(col),
                  insertText: `${table.name}.${col.name}`,
                  range: range,
                });
              });
            });
            suggestions = allColumns;
          } else if (context.expectingColumnName && context.currentTable) {
            const table = tables.find(
              t => t.name.toLowerCase() === context.currentTable!.toLowerCase()
            );
            if (table) {
              suggestions = table.columns.map(col => ({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${table.name}.${col.name} (${col.type})`,
                documentation: this.getColumnDocumentation(col),
                insertText: col.name,
                range: range,
              }));
            } else {
            }
          }

          // SQL Keywords from config
          const keywordSuggestions = SQL_KEYWORDS.map(kw => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: 'SQL Keyword',
            insertText: kw,
            range: range,
          }));

          // SQL Functions from config
          const functionSuggestions = SQL_FUNCTIONS.map(fn => ({
            label: fn.name,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: 'SQL Function',
            documentation: `**${fn.name}**(${fn.params})\n\n${fn.description}`,
            insertText: `${fn.name}($0)`,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
          }));

          // SQL Snippets from config
          const snippetSuggestions = SQL_SNIPPETS.map(snippet => ({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: 'SQL Snippet',
            documentation: snippet.documentation,
            insertText: snippet.insertText,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
          }));

          // Dynamic snippets based on schema (smart JOINs)
          const dynamicSnippets = this.generateDynamicSnippets(tables, range);

          const allSuggestions = [
            ...suggestions,
            ...keywordSuggestions,
            ...functionSuggestions,
            ...snippetSuggestions,
            ...dynamicSnippets,
          ];

          return {
            suggestions: allSuggestions,
          };
        } catch (error) {
          console.error('Monaco completion provider error:', error);
          return { suggestions: [] };
        }
      },
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
    const inSelectClause =
      CONTEXT_PATTERNS.inSelectClause.test(text) && !/\bfrom\s+/i.test(text);
    const inWhereClause = CONTEXT_PATTERNS.inWhereClause.test(text);

    return {
      expectingTableName,
      expectingColumnName,
      currentTable,
      inWhereClause,
      inSelectClause,
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
        if (!db.schemas) continue; // Null check for schemas
        for (const schema of db.schemas) {
          if (!schema.tables) continue; // Null check for tables
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
        const table = tables.find(
          (t: TableSchema) => t.name.toLowerCase() === word.word.toLowerCase()
        );
        if (table) {
          const contents = [
            { value: `**Table: ${table.name}**` },
            {
              value:
                '```\n' +
                table.columns
                  .map(
                    (c: TableColumn) =>
                      `${c.name} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${
                        c.isForeignKey ? ' FK' : ''
                      }`
                  )
                  .join('\n') +
                '\n```',
            },
          ];
          return { contents };
        }

        // Check if it's a column
        for (const table of tables) {
          const column = table.columns.find(
            (c: TableColumn) => c.name.toLowerCase() === word.word.toLowerCase()
          );
          if (column) {
            const contents = [
              { value: `**Column: ${table.name}.${column.name}**` },
              { value: `Type: \`${column.type}\`` },
              { value: `Nullable: ${column.nullable ? 'Yes' : 'No'}` },
            ];
            if (column.isPrimaryKey)
              contents.push({ value: '🔑 **Primary Key**' });
            if (column.isForeignKey) {
              contents.push({
                value: `🔗 **Foreign Key** → ${column.foreignKeyTable}.${column.foreignKeyColumn}`,
              });
            }
            return { contents };
          }
        }

        return null;
      },
    });
  }

  /**
   * Register keyboard shortcuts for the editor
   */
  registerKeyboardShortcuts(
    editor: any,
    executeQueryCallback: () => void
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
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
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
    return (
      `**${table.name}** (${table.columns.length} columns)\n\n` +
      table.columns
        .map(
          c =>
            `• ${c.name}: ${c.type}${c.isPrimaryKey ? ' 🔑' : ''}${
              c.isForeignKey ? ' 🔗' : ''
            }`
        )
        .join('\n')
    );
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
