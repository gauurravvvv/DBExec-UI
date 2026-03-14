import { Injectable } from '@angular/core';
import { TableSchema, TableColumn, DatabaseSchema } from '../helpers/dummy-data.helper';
import {
  SQL_KEYWORDS,
  SQL_FUNCTIONS,
  SQL_SNIPPETS,
} from '../config/sql-editor.config';

declare const monaco: any;

/** Resolved table reference from the query text */
interface TableRef {
  schemaName: string | null;
  tableName: string;
  alias: string | null;
  tableSchema: TableSchema | null; // resolved schema object
}

// Keywords that should never be treated as a table alias
const RESERVED_WORDS = new Set([
  'where', 'on', 'set', 'and', 'or', 'not', 'in', 'between', 'like', 'is',
  'null', 'order', 'group', 'having', 'limit', 'offset', 'union', 'except',
  'intersect', 'inner', 'outer', 'left', 'right', 'full', 'cross', 'natural',
  'join', 'select', 'from', 'insert', 'update', 'delete', 'create', 'alter',
  'drop', 'into', 'values', 'as', 'case', 'when', 'then', 'else', 'end',
  'exists', 'all', 'any', 'some', 'distinct', 'top', 'asc', 'desc', 'true',
  'false', 'fetch', 'for', 'with', 'recursive', 'returning', 'using',
  'lateral', 'only', 'window', 'over', 'partition', 'rows', 'range',
  'groups', 'preceding', 'following', 'current', 'unbounded',
]);

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
  registerSQLCompletions(databases: DatabaseSchema[], editor: any): any {
    // Build flat table list + lookup maps
    const allTables: TableSchema[] = [];
    const tableByName: Map<string, TableSchema> = new Map();
    const schemaMap: Map<string, TableSchema[]> = new Map();
    const tableToSchema: Map<string, string> = new Map(); // table name → schema name

    if (databases && databases.length > 0) {
      for (const db of databases) {
        if (!db.schemas) continue;
        for (const schema of db.schemas) {
          if (!schema.tables) continue;
          if (!schemaMap.has(schema.name.toLowerCase())) {
            schemaMap.set(schema.name.toLowerCase(), []);
          }
          for (const table of schema.tables) {
            allTables.push(table);
            tableByName.set(table.name.toLowerCase(), table);
            // Also store as schema.table
            tableByName.set(`${schema.name.toLowerCase()}.${table.name.toLowerCase()}`, table);
            schemaMap.get(schema.name.toLowerCase())!.push(table);
            tableToSchema.set(table.name.toLowerCase(), schema.name);
          }
        }
      }
    }

    if (allTables.length === 0) {
      return null;
    }

    return monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ',', '('],
      provideCompletionItems: (model: any, position: any) => {
        try {
          const fullText = model.getValue();
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // ─── SUPPRESS INSIDE STRINGS / COMMENTS ─────────────
          if (this.isCursorInStringOrComment(textUntilPosition)) {
            return { suggestions: [] };
          }

          const word = model.getWordUntilPosition(position);
          const defaultRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // ─── MULTI-STATEMENT ISOLATION ──────────────────────
          const cursorOffset = model.getOffsetAt(position);
          const { statement: currentStatement, startOffset } = this.getCurrentStatement(fullText, cursorOffset);
          const textInStatement = fullText.substring(startOffset, cursorOffset);

          // Strip strings/comments for safe structural parsing
          const strippedStatement = this.stripStringsAndComments(currentStatement);
          const strippedTextInStatement = this.stripStringsAndComments(textInStatement);

          // ─── PARSE REFERENCES (scoped to current statement) ─
          const tableRefs = this.parseTableReferences(strippedStatement, tableByName);
          const cteRefs = this.parseCTEReferences(strippedStatement, tableByName);
          const allRefs = [...cteRefs, ...tableRefs];
          const aliasMap = this.buildAliasMap(allRefs);

          // ─── DOT COMPLETION ──────────────────────────────────
          const dotMatch = textUntilPosition.match(/(?:(\w+)\.)?(\w+)\.$/);
          if (dotMatch) {
            const afterDotRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            };
            return { suggestions: this.getDotCompletions(dotMatch, databases, allTables, aliasMap, schemaMap, afterDotRange) };
          }

          // ─── INSERT INTO table (...) → Column suggestions ───
          const insertMatch = strippedTextInStatement.match(/\bINSERT\s+INTO\s+(?:(\w+)\.)?(\w+)\s*\(([^)]*?)$/i);
          if (insertMatch) {
            return { suggestions: this.getInsertColumnSuggestions(insertMatch, tableByName, defaultRange) };
          }

          // ─── UPDATE table SET → Column suggestions ──────────
          const updateSetMatch = strippedTextInStatement.match(/\bUPDATE\s+(?:(\w+)\.)?(\w+)\s+SET\s+(?:.*,\s*)?(\w*)$/i);
          if (updateSetMatch) {
            return { suggestions: this.getUpdateSetSuggestions(updateSetMatch, tableByName, defaultRange) };
          }

          // ─── CONTEXT ANALYSIS (uses stripped text) ──────────
          const ctx = this.getContext(strippedTextInStatement);
          const suggestions: any[] = [];
          const seenLabels = new Set<string>();

          const addSuggestion = (s: any) => {
            if (!seenLabels.has(s.label)) {
              seenLabels.add(s.label);
              suggestions.push(s);
            }
          };

          // ─── AFTER FROM / JOIN / INTO / UPDATE → Schema → Table hierarchy ─
          if (ctx === 'table') {
            const schemaNames = Array.from(schemaMap.keys());
            const hasMultipleSchemas = schemaNames.length > 1;

            // CTEs always at the very top
            for (const cte of cteRefs) {
              addSuggestion({
                label: cte.tableName,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: `CTE${cte.tableSchema ? ` (${cte.tableSchema.columns.length} columns)` : ''}`,
                documentation: `Common Table Expression: ${cte.tableName}`,
                insertText: cte.tableName + ' ',
                sortText: '0_' + cte.tableName,
                range: defaultRange,
              });
            }

            if (hasMultipleSchemas) {
              // ── Multiple schemas: show schema → table hierarchy ──
              // 1. Schema names (type one and press . to drill into tables)
              for (const [schemaName, schemaTables] of schemaMap.entries()) {
                addSuggestion({
                  label: schemaName,
                  kind: monaco.languages.CompletionItemKind.Module,
                  detail: `Schema (${schemaTables.length} tables)`,
                  documentation: `Schema: ${schemaName}\n\nTables: ${schemaTables.map(t => t.name).join(', ')}`,
                  insertText: schemaName,
                  sortText: '1_' + schemaName,
                  range: defaultRange,
                });
              }

              // 2. Schema-qualified tables (select in one step: schema.table)
              for (const [schemaName, schemaTables] of schemaMap.entries()) {
                for (const table of schemaTables) {
                  const qualifiedName = `${schemaName}.${table.name}`;
                  addSuggestion({
                    label: qualifiedName,
                    kind: monaco.languages.CompletionItemKind.Class,
                    detail: `Table (${table.columns.length} columns)`,
                    documentation: this.getTableDocumentation(table),
                    insertText: qualifiedName + ' ',
                    filterText: `${qualifiedName} ${table.name}`,
                    sortText: '2_' + schemaName + '_' + table.name,
                    range: defaultRange,
                  });
                }
              }

              // 3. Unqualified table names (for quick access / default schema)
              for (const table of allTables) {
                const schemaName = tableToSchema.get(table.name.toLowerCase()) || '';
                addSuggestion({
                  label: table.name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  detail: `Table · ${schemaName} (${table.columns.length} cols)`,
                  documentation: this.getTableDocumentation(table),
                  insertText: table.name + ' ',
                  sortText: '3_' + table.name,
                  range: defaultRange,
                });
              }
            } else {
              // ── Single schema: tables directly, schema available for explicit use ──
              for (const table of allTables) {
                addSuggestion({
                  label: table.name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  detail: `Table (${table.columns.length} columns)`,
                  documentation: this.getTableDocumentation(table),
                  insertText: table.name + ' ',
                  sortText: '1_' + table.name,
                  range: defaultRange,
                });
              }
              // Schema name for explicit qualification
              if (schemaNames.length === 1) {
                addSuggestion({
                  label: schemaNames[0],
                  kind: monaco.languages.CompletionItemKind.Module,
                  detail: `Schema (${schemaMap.get(schemaNames[0])!.length} tables)`,
                  documentation: `Schema: ${schemaNames[0]}`,
                  insertText: schemaNames[0],
                  sortText: '2_' + schemaNames[0],
                  range: defaultRange,
                });
              }
            }
            return { suggestions };
          }

          // ─── SELECT clause → Columns from referenced tables (alias-aware) ─
          if (ctx === 'select') {
            if (allRefs.length > 0) {
              for (const ref of allRefs) {
                if (!ref.tableSchema) continue;
                const prefix = ref.alias || ref.tableName;
                for (const col of ref.tableSchema.columns) {
                  const label = `${prefix}.${col.name}`;
                  addSuggestion({
                    label: label,
                    kind: monaco.languages.CompletionItemKind.Field,
                    detail: `${col.type} (${ref.tableName})`,
                    documentation: this.getColumnDocumentation(col),
                    insertText: label,
                    sortText: '0_' + label,
                    range: defaultRange,
                  });
                }
              }
              // Also add bare * and table.* shortcuts
              addSuggestion({
                label: '*',
                kind: monaco.languages.CompletionItemKind.Keyword,
                detail: 'All columns',
                insertText: '*',
                sortText: '0__*',
                range: defaultRange,
              });
              for (const ref of allRefs) {
                if (!ref.tableSchema) continue;
                const prefix = ref.alias || ref.tableName;
                addSuggestion({
                  label: `${prefix}.*`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  detail: `All columns from ${ref.tableName}`,
                  insertText: `${prefix}.*`,
                  sortText: '0_' + prefix + '.*',
                  range: defaultRange,
                });
              }
            } else {
              // No tables referenced yet, show all columns with table prefix
              for (const table of allTables) {
                for (const col of table.columns) {
                  addSuggestion({
                    label: `${table.name}.${col.name}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    detail: `${col.type} (from ${table.name})`,
                    documentation: this.getColumnDocumentation(col),
                    insertText: `${table.name}.${col.name}`,
                    sortText: '0_' + table.name + '.' + col.name,
                    range: defaultRange,
                  });
                }
              }
            }
            // Add aggregate functions at high priority in SELECT
            this.addFunctions(suggestions, seenLabels, defaultRange, '1_');
            this.addKeywords(suggestions, seenLabels, defaultRange, '3_');
            this.addSnippets(suggestions, seenLabels, defaultRange);
            return { suggestions };
          }

          // ─── WHERE / ON / SET / AND / OR → Columns from ALL referenced tables ─
          if (ctx === 'column') {
            this.addColumnsFromRefs(allRefs, suggestions, seenLabels, defaultRange, '0_');
            // WHERE-context keywords
            const whereKeywords = ['AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'EXISTS', 'NOT EXISTS', 'TRUE', 'FALSE', 'NULL', 'CASE'];
            for (const kw of whereKeywords) {
              addSuggestion({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                detail: 'SQL Keyword',
                insertText: kw + ' ',
                sortText: '1_' + kw,
                range: defaultRange,
              });
            }
            this.addFunctions(suggestions, seenLabels, defaultRange, '2_');
            return { suggestions };
          }

          // ─── HAVING → Aggregate functions first, then columns ─
          if (ctx === 'having') {
            // Aggregates are most relevant in HAVING
            this.addFunctions(suggestions, seenLabels, defaultRange, '0_');
            this.addColumnsFromRefs(allRefs, suggestions, seenLabels, defaultRange, '1_');
            const havingKeywords = ['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'TRUE', 'FALSE', 'NULL'];
            for (const kw of havingKeywords) {
              addSuggestion({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                detail: 'SQL Keyword',
                insertText: kw + ' ',
                sortText: '2_' + kw,
                range: defaultRange,
              });
            }
            return { suggestions };
          }

          // ─── ORDER BY / GROUP BY → Columns + position numbers ─
          if (ctx === 'orderby') {
            if (allRefs.length > 0) {
              for (const ref of allRefs) {
                if (!ref.tableSchema) continue;
                const prefix = ref.alias || ref.tableName;
                for (const col of ref.tableSchema.columns) {
                  const label = allRefs.length > 1 ? `${prefix}.${col.name}` : col.name;
                  const insertText = allRefs.length > 1 ? `${prefix}.${col.name}` : col.name;
                  addSuggestion({
                    label: label,
                    kind: monaco.languages.CompletionItemKind.Field,
                    detail: `${col.type} (${ref.tableName})`,
                    documentation: this.getColumnDocumentation(col),
                    insertText: insertText,
                    sortText: '0_' + label,
                    range: defaultRange,
                  });
                }
              }
            }
            // ASC / DESC for ORDER BY
            for (const kw of ['ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST']) {
              addSuggestion({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                detail: 'Sort direction',
                insertText: kw + ' ',
                sortText: '1_' + kw,
                range: defaultRange,
              });
            }
            return { suggestions };
          }

          // ─── JOIN ... ON → Columns from ALL tables with smart FK join suggestions ─
          if (ctx === 'join_on') {
            // Add columns from all referenced tables
            for (const ref of allRefs) {
              if (!ref.tableSchema) continue;
              const prefix = ref.alias || ref.tableName;
              for (const col of ref.tableSchema.columns) {
                const label = `${prefix}.${col.name}`;
                addSuggestion({
                  label: label,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: `${col.type} (${ref.tableName})${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`,
                  documentation: this.getColumnDocumentation(col),
                  insertText: label,
                  sortText: col.isPrimaryKey || col.isForeignKey ? '0_' + label : '1_' + label,
                  range: defaultRange,
                });
              }
            }
            // Add smart FK-based ON condition snippets
            this.addJoinOnSnippets(allRefs, suggestions, seenLabels, defaultRange);
            return { suggestions };
          }

          // ─── DEFAULT / GENERIC context → Keywords + Functions + Snippets + Tables ─

          // Smart alias suggestion: if text ends with FROM/JOIN table_name, suggest alias
          const aliasContextMatch = strippedTextInStatement.match(/\b(?:from|join)\s+(?:\w+\.)?(\w+)\s+$/i);
          if (aliasContextMatch) {
            const tblName = aliasContextMatch[1];
            const suggestedAlias = this.generateAlias(tblName);
            addSuggestion({
              label: suggestedAlias,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: `Alias for ${tblName}`,
              insertText: suggestedAlias + ' ',
              sortText: '0_0_' + suggestedAlias,
              range: defaultRange,
            });
            addSuggestion({
              label: `AS ${suggestedAlias}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: `Alias for ${tblName}`,
              insertText: `AS ${suggestedAlias} `,
              filterText: `AS${suggestedAlias} AS ${suggestedAlias}`,
              sortText: '0_0_AS',
              range: defaultRange,
            });
          }

          // CTE names in generic context
          for (const cte of cteRefs) {
            addSuggestion({
              label: cte.tableName,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: 'CTE',
              insertText: cte.tableName,
              sortText: '1_' + cte.tableName,
              range: defaultRange,
            });
          }

          // Tables (lower priority in generic context) — with schema info
          for (const table of allTables) {
            const tblSchema = tableToSchema.get(table.name.toLowerCase()) || '';
            addSuggestion({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: tblSchema ? `Table · ${tblSchema}` : `Table (${table.columns.length} columns)`,
              documentation: this.getTableDocumentation(table),
              insertText: table.name,
              sortText: '2_' + table.name,
              range: defaultRange,
            });
          }

          this.addKeywords(suggestions, seenLabels, defaultRange, '1_');
          this.addFunctions(suggestions, seenLabels, defaultRange, '2_');
          this.addSnippets(suggestions, seenLabels, defaultRange);
          this.addDynamicSnippets(allTables, suggestions, seenLabels, defaultRange);

          return { suggestions };
        } catch (error) {
          console.error('Monaco completion provider error:', error);
          return { suggestions: [] };
        }
      },
    });
  }

  // ─── CONTEXT DETECTION ─────────────────────────────────────

  /**
   * Determine what kind of suggestions to show based on the text up to cursor.
   * Returns: 'table' | 'select' | 'column' | 'having' | 'orderby' | 'join_on' | 'generic'
   */
  private getContext(text: string): string {
    const t = text.replace(/\s+$/, '');

    // After FROM, JOIN, INTO, UPDATE → expecting table name
    if (/\b(?:from|join|into|update|table)\s+\w*$/i.test(t)) {
      return 'table';
    }

    // After ON (in JOIN context) → expecting join condition columns
    if (/\bJOIN\s+\S+(?:\s+(?:AS\s+)?\w+)?\s+ON\s+\w*$/i.test(t)) {
      return 'join_on';
    }

    // After ORDER BY or GROUP BY → expecting columns
    if (/\b(?:order\s+by|group\s+by)\s+(?:[\w\.,\s]*,\s*)?\w*$/i.test(t)) {
      return 'orderby';
    }

    // In SELECT clause (after SELECT or after comma in SELECT, before FROM)
    if (/\bselect\s+(?:distinct\s+)?(?:[\w\.\*,\s\(\)]*,\s*)?\w*$/i.test(t) && !/\bfrom\b/i.test(t)) {
      return 'select';
    }

    // Check the last major keyword before cursor for fine-grained context
    const lastClause = t.match(/\b(select|from|where|join|on|set|having|order\s+by|group\s+by|and|or)\b\s*(?:[\s\S](?!\b(?:select|from|where|join|on|set|having|order\s+by|group\s+by)\b))*$/i);
    if (lastClause) {
      const clause = lastClause[1].toLowerCase().replace(/\s+/g, ' ');
      if (clause === 'having') {
        return 'having';
      }
      if (['where', 'set', 'and', 'or'].includes(clause)) {
        return 'column';
      }
      if (clause === 'on') {
        return 'join_on';
      }
      if (['order by', 'group by'].includes(clause)) {
        return 'orderby';
      }
    }

    return 'generic';
  }

  // ─── TABLE REFERENCE PARSING ───────────────────────────────

  /**
   * Parse all FROM and JOIN table references in the query.
   * Extracts table name, optional schema, alias, and resolves to TableSchema.
   */
  private parseTableReferences(sql: string, tableByName: Map<string, TableSchema>): TableRef[] {
    const refs: TableRef[] = [];
    const seen = new Set<string>();

    // Match: FROM/JOIN [schema.]table [AS] [alias]
    // Excludes subqueries (detected by open paren after FROM/JOIN)
    const regex = /\b(?:from|join)\s+(?![\(\s]*select)(?:(\w+)\.)?(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
    let match;

    while ((match = regex.exec(sql)) !== null) {
      const schemaName = match[1] || null;
      const tableName = match[2];
      const rawAlias = match[3] || null;

      // Skip if the "alias" is actually a SQL keyword
      const alias = rawAlias && !RESERVED_WORDS.has(rawAlias.toLowerCase()) ? rawAlias : null;

      // Resolve to a TableSchema
      const lookupKey = schemaName
        ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
        : tableName.toLowerCase();
      const tableSchema = tableByName.get(lookupKey) || tableByName.get(tableName.toLowerCase()) || null;

      const key = `${schemaName || ''}.${tableName}.${alias || ''}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ schemaName, tableName, alias, tableSchema });
      }
    }

    return refs;
  }

  /**
   * Build alias → tableName map from parsed table references.
   */
  private buildAliasMap(refs: TableRef[]): Map<string, TableRef> {
    const map = new Map<string, TableRef>();
    for (const ref of refs) {
      if (ref.alias) {
        map.set(ref.alias.toLowerCase(), ref);
      }
      map.set(ref.tableName.toLowerCase(), ref);
    }
    return map;
  }

  // ─── STRING/COMMENT AWARENESS ────────────────────────────────

  /**
   * Replace string literals and comments with spaces (preserving line/column positions).
   * Prevents false matches from keywords/identifiers inside strings or comments.
   */
  private stripStringsAndComments(sql: string): string {
    const result: string[] = [];
    let i = 0;

    while (i < sql.length) {
      // Single-line comment: -- ...
      if (sql[i] === '-' && sql[i + 1] === '-') {
        while (i < sql.length && sql[i] !== '\n') {
          result.push(' ');
          i++;
        }
      }
      // Block comment: /* ... */
      else if (sql[i] === '/' && sql[i + 1] === '*') {
        result.push(' '); i++;
        result.push(' '); i++;
        while (i < sql.length) {
          if (sql[i] === '*' && sql[i + 1] === '/') {
            result.push(' '); i++;
            result.push(' '); i++;
            break;
          }
          result.push(sql[i] === '\n' ? '\n' : ' ');
          i++;
        }
      }
      // String literal: '...' (with '' escape)
      else if (sql[i] === "'") {
        result.push(' '); i++;
        while (i < sql.length) {
          if (sql[i] === "'" && sql[i + 1] === "'") {
            result.push(' '); i++;
            result.push(' '); i++;
          } else if (sql[i] === "'") {
            result.push(' '); i++;
            break;
          } else {
            result.push(sql[i] === '\n' ? '\n' : ' ');
            i++;
          }
        }
      }
      // Normal character
      else {
        result.push(sql[i]);
        i++;
      }
    }

    return result.join('');
  }

  /**
   * Check if cursor position is inside a string literal or comment.
   * If so, we should suppress SQL completions.
   */
  private isCursorInStringOrComment(textUntilCursor: string): boolean {
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < textUntilCursor.length; i++) {
      const ch = textUntilCursor[i];
      const next = textUntilCursor[i + 1];

      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; i++; }
        continue;
      }
      if (inString) {
        if (ch === "'" && next === "'") { i++; continue; } // escaped quote
        if (ch === "'") { inString = false; continue; }
        continue;
      }

      if (ch === '-' && next === '-') { inLineComment = true; i++; continue; }
      if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
      if (ch === "'") { inString = true; continue; }
    }

    return inString || inLineComment || inBlockComment;
  }

  // ─── MULTI-STATEMENT ISOLATION ──────────────────────────────

  /**
   * Extract the current SQL statement around the cursor.
   * Finds statement boundaries by locating semicolons outside strings/comments.
   */
  private getCurrentStatement(fullText: string, cursorOffset: number): { statement: string; startOffset: number } {
    const stripped = this.stripStringsAndComments(fullText);
    let start = 0;
    let end = fullText.length;

    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] === ';') {
        if (i < cursorOffset) {
          start = i + 1;
        } else {
          end = i;
          break;
        }
      }
    }

    return {
      statement: fullText.substring(start, end),
      startOffset: start,
    };
  }

  // ─── CTE PARSING ───────────────────────────────────────────

  /**
   * Parse CTE (WITH ... AS) definitions and return them as table references.
   * Recognizes: WITH name AS (...), name2 AS (...)
   */
  private parseCTEReferences(strippedSql: string, tableByName: Map<string, TableSchema>): TableRef[] {
    const refs: TableRef[] = [];

    // Check if there's a WITH clause
    if (!/\bWITH\b/i.test(strippedSql)) return refs;

    // Extract CTE names: match `name AS (` patterns after WITH
    const cteRegex = /\b(\w+)\s+AS\s*\(/gi;
    const withPos = strippedSql.search(/\bWITH\b/i);
    if (withPos < 0) return refs;

    // Only scan the WITH preamble (before the main SELECT/INSERT/etc.)
    const afterWith = strippedSql.substring(withPos + 4);
    let match;

    while ((match = cteRegex.exec(afterWith)) !== null) {
      const cteName = match[1];
      // Skip SQL keywords that might look like CTE names
      if (RESERVED_WORDS.has(cteName.toLowerCase())) continue;

      // Try to resolve the CTE body's source table for column inference
      // Find the balanced parentheses content after "AS ("
      const parenStart = match.index + match[0].length - 1; // position of '('
      const cteBody = this.extractBalancedParens(afterWith, parenStart);
      let cteTableSchema: TableSchema | null = null;

      if (cteBody) {
        // Try to infer columns from the CTE's FROM clause
        const innerRefs = this.parseTableReferences(cteBody, tableByName);
        if (innerRefs.length > 0 && innerRefs[0].tableSchema) {
          // Use the first table's schema as an approximation for CTE columns
          cteTableSchema = innerRefs[0].tableSchema;
        }
      }

      refs.push({
        schemaName: null,
        tableName: cteName,
        alias: null,
        tableSchema: cteTableSchema,
      });
    }

    return refs;
  }

  /**
   * Extract content between balanced parentheses starting at the given position.
   */
  private extractBalancedParens(text: string, startPos: number): string | null {
    if (text[startPos] !== '(') return null;
    let depth = 0;
    for (let i = startPos; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') {
        depth--;
        if (depth === 0) {
          return text.substring(startPos + 1, i);
        }
      }
    }
    return null;
  }

  // ─── ALIAS GENERATION ──────────────────────────────────────

  /**
   * Generate a suggested alias for a table name.
   * Single word → first letter: users → u
   * Multi-word (snake_case) → initials: order_items → oi
   */
  private generateAlias(tableName: string): string {
    const parts = tableName.split('_');
    if (parts.length > 1) {
      return parts.map(p => p[0] || '').join('').toLowerCase();
    }
    return tableName[0].toLowerCase();
  }

  // ─── INSERT / UPDATE COLUMN HELPERS ─────────────────────────

  /**
   * Suggest columns for INSERT INTO table (...) context.
   * Filters out already-specified columns.
   */
  private getInsertColumnSuggestions(
    insertMatch: RegExpMatchArray,
    tableByName: Map<string, TableSchema>,
    range: any
  ): any[] {
    const schemaName = insertMatch[1];
    const tableName = insertMatch[2];
    const existingColsStr = insertMatch[3] || '';

    const key = schemaName
      ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
      : tableName.toLowerCase();
    const table = tableByName.get(key) || tableByName.get(tableName.toLowerCase());
    if (!table) return [];

    // Parse already-specified columns
    const existingCols = new Set(
      existingColsStr.split(',').map(c => c.replace(/\s+/g, '').toLowerCase()).filter(c => c)
    );

    return table.columns
      .filter(col => !existingCols.has(col.name.toLowerCase()))
      .map((col, idx) => ({
        label: col.name,
        kind: monaco.languages.CompletionItemKind.Field,
        detail: `${col.type}${col.nullable ? '' : ' NOT NULL'}${col.isPrimaryKey ? ' PK' : ''}`,
        documentation: this.getColumnDocumentation(col),
        insertText: col.name,
        sortText: String(idx).padStart(4, '0'),
        range: range,
      }));
  }

  /**
   * Suggest columns for UPDATE table SET context.
   * Uses snippet insertion: column = $0
   */
  private getUpdateSetSuggestions(
    updateMatch: RegExpMatchArray,
    tableByName: Map<string, TableSchema>,
    range: any
  ): any[] {
    const schemaName = updateMatch[1];
    const tableName = updateMatch[2];

    const key = schemaName
      ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
      : tableName.toLowerCase();
    const table = tableByName.get(key) || tableByName.get(tableName.toLowerCase());
    if (!table) return [];

    return table.columns.map((col, idx) => ({
      label: col.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: `${col.type}${col.nullable ? '' : ' NOT NULL'}`,
      documentation: this.getColumnDocumentation(col),
      insertText: `${col.name} = $0`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: col.isPrimaryKey ? '1_' + String(idx).padStart(4, '0') : '0_' + String(idx).padStart(4, '0'),
      range: range,
    }));
  }

  // ─── DOT COMPLETION ────────────────────────────────────────

  /**
   * Handle completions after a dot: alias.col, table.col, schema.table
   */
  private getDotCompletions(
    dotMatch: RegExpMatchArray,
    databases: DatabaseSchema[],
    allTables: TableSchema[],
    aliasMap: Map<string, TableRef>,
    schemaMap: Map<string, TableSchema[]>,
    range: any,
  ): any[] {
    const firstPart = dotMatch[1]; // schema (if schema.table.)
    const secondPart = dotMatch[2]; // table/alias/schema

    // Case 1: schema.table. → column completion
    if (firstPart) {
      const key = `${firstPart.toLowerCase()}.${secondPart.toLowerCase()}`;
      // Try alias map first (in case it's an alias with same name as schema.table)
      const ref = aliasMap.get(secondPart.toLowerCase());
      if (ref?.tableSchema) {
        return this.buildColumnSuggestions(ref.tableSchema, range);
      }
      // Try schema lookup
      const schemaTables = schemaMap.get(firstPart.toLowerCase());
      if (schemaTables) {
        const table = schemaTables.find(t => t.name.toLowerCase() === secondPart.toLowerCase());
        if (table) {
          return this.buildColumnSuggestions(table, range);
        }
      }
    }

    // Case 2: alias. or table. → column completion
    const ref = aliasMap.get(secondPart.toLowerCase());
    if (ref?.tableSchema) {
      return this.buildColumnSuggestions(ref.tableSchema, range);
    }

    // Direct table name lookup
    const directTable = allTables.find(t => t.name.toLowerCase() === secondPart.toLowerCase());
    if (directTable) {
      return this.buildColumnSuggestions(directTable, range);
    }

    // Case 3: schema. → table completion (schema → table flow)
    const schemaTables = schemaMap.get(secondPart.toLowerCase());
    if (schemaTables) {
      return schemaTables.map((tbl, idx) => ({
        label: tbl.name,
        kind: monaco.languages.CompletionItemKind.Class,
        detail: `Table (${tbl.columns.length} columns)`,
        documentation: this.getTableDocumentation(tbl),
        insertText: tbl.name,
        sortText: String(idx).padStart(4, '0'),
        range: range,
      }));
    }

    return [];
  }

  private buildColumnSuggestions(table: TableSchema, range: any): any[] {
    return table.columns.map((col, idx) => ({
      label: col.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: `${col.type}${col.nullable ? ' (nullable)' : ''}${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`,
      documentation: this.getColumnDocumentation(col),
      insertText: col.name,
      sortText: String(idx).padStart(4, '0'), // preserve column order from schema
      range: range,
    }));
  }

  // ─── SUGGESTION BUILDERS ───────────────────────────────────

  /**
   * Add columns from all table references to suggestions.
   * Auto-prefixes with alias/table name when multiple tables are referenced.
   */
  private addColumnsFromRefs(
    refs: TableRef[],
    suggestions: any[],
    seen: Set<string>,
    range: any,
    sortPrefix: string
  ): void {
    if (refs.length === 0) return;
    for (const ref of refs) {
      if (!ref.tableSchema) continue;
      const prefix = ref.alias || ref.tableName;
      for (const col of ref.tableSchema.columns) {
        if (refs.length > 1) {
          const label = `${prefix}.${col.name}`;
          if (seen.has(label)) continue;
          seen.add(label);
          suggestions.push({
            label: label,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${col.type} (${ref.tableName})`,
            documentation: this.getColumnDocumentation(col),
            insertText: label,
            sortText: sortPrefix + label,
            range: range,
          });
        } else {
          if (seen.has(col.name)) continue;
          seen.add(col.name);
          suggestions.push({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${col.type} (${ref.tableName})${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`,
            documentation: this.getColumnDocumentation(col),
            insertText: col.name,
            sortText: sortPrefix + col.name,
            range: range,
          });
        }
      }
    }
  }

  private addKeywords(suggestions: any[], seen: Set<string>, range: any, sortPrefix: string): void {
    for (const kw of SQL_KEYWORDS) {
      if (seen.has(kw)) continue;
      seen.add(kw);

      // Multi-word keywords: use filterText for matching
      const isMultiWord = kw.includes(' ');
      suggestions.push({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'SQL Keyword',
        insertText: kw + (isMultiWord ? ' ' : ''),
        filterText: isMultiWord ? kw.replace(/\s+/g, '') + ' ' + kw : kw,
        sortText: sortPrefix + kw,
        range: range,
      });
    }
  }

  private addFunctions(suggestions: any[], seen: Set<string>, range: any, sortPrefix: string): void {
    for (const fn of SQL_FUNCTIONS) {
      if (seen.has(fn.name)) continue;
      seen.add(fn.name);

      // Functions with no params don't need cursor inside parens
      const hasParams = fn.params && fn.params.length > 0;
      suggestions.push({
        label: fn.name,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: `(${fn.params}) — ${fn.description}`,
        documentation: {
          value: `**${fn.name}**(${fn.params})\n\n${fn.description}`,
        },
        insertText: hasParams ? `${fn.name}($0)` : `${fn.name}()`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: sortPrefix + fn.name,
        range: range,
      });
    }
  }

  private addSnippets(suggestions: any[], seen: Set<string>, range: any): void {
    for (const snippet of SQL_SNIPPETS) {
      if (seen.has(snippet.label)) continue;
      seen.add(snippet.label);
      suggestions.push({
        label: snippet.label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'SQL Snippet',
        documentation: snippet.documentation,
        insertText: snippet.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '4_' + snippet.label,
        range: range,
      });
    }
  }

  private addDynamicSnippets(tables: TableSchema[], suggestions: any[], seen: Set<string>, range: any): void {
    for (const table of tables) {
      for (const col of table.columns) {
        if (col.isForeignKey && col.foreignKeyTable && col.foreignKeyColumn) {
          const label = `join_${table.name}_${col.foreignKeyTable}`;
          if (seen.has(label)) continue;
          seen.add(label);
          suggestions.push({
            label: label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: `JOIN ${table.name} ↔ ${col.foreignKeyTable}`,
            documentation: `Auto-join on FK: ${table.name}.${col.name} → ${col.foreignKeyTable}.${col.foreignKeyColumn}`,
            insertText: `JOIN ${table.name} ON ${col.foreignKeyTable}.${col.foreignKeyColumn} = ${table.name}.${col.name}$0`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: '3_' + label,
            range: range,
          });
        }
      }
    }
  }

  /**
   * Add smart ON-condition snippets when cursor is after JOIN ... ON
   * Detects FK relationships between the just-joined table and existing tables.
   */
  private addJoinOnSnippets(tableRefs: TableRef[], suggestions: any[], seen: Set<string>, range: any): void {
    if (tableRefs.length < 2) return;

    // The last ref is likely the table that was just JOINed
    const newRef = tableRefs[tableRefs.length - 1];
    if (!newRef.tableSchema) return;

    const newPrefix = newRef.alias || newRef.tableName;

    for (const col of newRef.tableSchema.columns) {
      if (!col.isForeignKey || !col.foreignKeyTable || !col.foreignKeyColumn) continue;

      // Find the referenced table in existing refs
      const targetRef = tableRefs.find(
        r => r.tableName.toLowerCase() === col.foreignKeyTable!.toLowerCase() && r !== newRef
      );
      if (targetRef) {
        const targetPrefix = targetRef.alias || targetRef.tableName;
        const label = `${newPrefix}.${col.name} = ${targetPrefix}.${col.foreignKeyColumn}`;
        if (seen.has(label)) continue;
        seen.add(label);
        suggestions.push({
          label: label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'FK join condition',
          documentation: `Auto-detected foreign key: ${newRef.tableName}.${col.name} → ${col.foreignKeyTable}.${col.foreignKeyColumn}`,
          insertText: label + '$0',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '0_' + label, // highest priority
          range: range,
        });
      }
    }

    // Also check reverse direction: existing tables that FK into the new table
    for (const existingRef of tableRefs) {
      if (existingRef === newRef || !existingRef.tableSchema) continue;
      const existingPrefix = existingRef.alias || existingRef.tableName;

      for (const col of existingRef.tableSchema.columns) {
        if (!col.isForeignKey || col.foreignKeyTable?.toLowerCase() !== newRef.tableName.toLowerCase()) continue;

        const label = `${existingPrefix}.${col.name} = ${newPrefix}.${col.foreignKeyColumn}`;
        if (seen.has(label)) continue;
        seen.add(label);
        suggestions.push({
          label: label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'FK join condition',
          documentation: `Auto-detected foreign key: ${existingRef.tableName}.${col.name} → ${newRef.tableName}.${col.foreignKeyColumn}`,
          insertText: label + '$0',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '0_' + label,
          range: range,
        });
      }
    }
  }

  // ─── HOVER PROVIDER ────────────────────────────────────────

  /**
   * Register hover provider for tables and columns
   * @returns Disposable to unregister the provider
   */
  registerHoverProvider(databases: any[]): any {
    const tables: TableSchema[] = [];

    if (databases && databases.length > 0) {
      for (const db of databases) {
        if (!db.schemas) continue;
        for (const schema of db.schemas) {
          if (!schema.tables) continue;
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

        const wordLower = word.word.toLowerCase();

        // Check if previous character is a dot → this is qualified (table.column or alias.column)
        const lineContent = model.getLineContent(position.lineNumber);
        const charBeforeWord = lineContent[word.startColumn - 2]; // -2 because startColumn is 1-based
        if (charBeforeWord === '.') {
          // Get the qualifier (word before the dot)
          const beforeDot = model.getWordAtPosition({
            lineNumber: position.lineNumber,
            column: word.startColumn - 2,
          });
          if (beforeDot) {
            const qualifier = beforeDot.word.toLowerCase();
            // Try qualifier as table name
            const qualTable = tables.find(t => t.name.toLowerCase() === qualifier);
            if (qualTable) {
              const col = qualTable.columns.find(c => c.name.toLowerCase() === wordLower);
              if (col) {
                return { contents: this.buildColumnHoverContents(qualTable, col) };
              }
            }
            // Qualifier might be an alias — resolve from current text
            const fullText = model.getValue();
            const strippedText = this.stripStringsAndComments(fullText);
            const tableByName = new Map<string, TableSchema>();
            tables.forEach(t => tableByName.set(t.name.toLowerCase(), t));
            const refs = this.parseTableReferences(strippedText, tableByName);
            const ref = refs.find(r =>
              (r.alias && r.alias.toLowerCase() === qualifier) ||
              r.tableName.toLowerCase() === qualifier
            );
            if (ref?.tableSchema) {
              const col = ref.tableSchema.columns.find(c => c.name.toLowerCase() === wordLower);
              if (col) {
                return { contents: this.buildColumnHoverContents(ref.tableSchema, col) };
              }
            }
          }
        }

        // Check if it's a table name
        const table = tables.find(t => t.name.toLowerCase() === wordLower);
        if (table) {
          const pkCols = table.columns.filter(c => c.isPrimaryKey);
          const fkCols = table.columns.filter(c => c.isForeignKey);
          const contents = [
            { value: `**Table: ${table.name}** — ${table.columns.length} columns` },
            {
              value:
                '```\n' +
                table.columns
                  .map(
                    (c: TableColumn) =>
                      `${c.name.padEnd(24)} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK→' + c.foreignKeyTable : ''}`
                  )
                  .join('\n') +
                '\n```',
            },
          ];
          if (pkCols.length > 0) {
            contents.push({ value: `🔑 PK: ${pkCols.map(c => c.name).join(', ')}` });
          }
          if (fkCols.length > 0) {
            contents.push({ value: `🔗 FK: ${fkCols.map(c => `${c.name}→${c.foreignKeyTable}.${c.foreignKeyColumn}`).join(', ')}` });
          }
          return { contents };
        }

        // Check if it's a SQL keyword — show brief description
        const kwMatch = SQL_KEYWORDS.find(kw => kw.toLowerCase() === wordLower);
        if (kwMatch) {
          return { contents: [{ value: `**SQL Keyword:** \`${kwMatch}\`` }] };
        }

        // Check if it's a SQL function
        const fnMatch = SQL_FUNCTIONS.find(fn => fn.name.toLowerCase() === wordLower);
        if (fnMatch) {
          return {
            contents: [
              { value: `**${fnMatch.name}**(${fnMatch.params})` },
              { value: fnMatch.description },
            ],
          };
        }

        // Check if it's an alias — resolve and show the real table
        const fullText = model.getValue();
        const strippedFull = this.stripStringsAndComments(fullText);
        const tableByName = new Map<string, TableSchema>();
        tables.forEach(t => tableByName.set(t.name.toLowerCase(), t));
        const refs = this.parseTableReferences(strippedFull, tableByName);
        const aliasRef = refs.find(r => r.alias && r.alias.toLowerCase() === wordLower);
        if (aliasRef?.tableSchema) {
          const contents = [
            { value: `**Alias:** \`${aliasRef.alias}\` → **${aliasRef.tableName}** (${aliasRef.tableSchema.columns.length} columns)` },
            {
              value:
                '```\n' +
                aliasRef.tableSchema.columns
                  .map(
                    (c: TableColumn) =>
                      `${c.name.padEnd(24)} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK' : ''}`
                  )
                  .join('\n') +
                '\n```',
            },
          ];
          return { contents };
        }

        // Column name — collect ALL matching tables
        const matchingColumns: { table: TableSchema; column: TableColumn }[] = [];
        for (const tbl of tables) {
          const col = tbl.columns.find(c => c.name.toLowerCase() === wordLower);
          if (col) {
            matchingColumns.push({ table: tbl, column: col });
          }
        }

        if (matchingColumns.length === 1) {
          return { contents: this.buildColumnHoverContents(matchingColumns[0].table, matchingColumns[0].column) };
        }

        if (matchingColumns.length > 1) {
          const contents = [
            { value: `**Column: ${word.word}** _(found in ${matchingColumns.length} tables)_` },
            {
              value: matchingColumns.map(({ table: tbl, column }) => {
                let info = `• **${tbl.name}**.${column.name} — \`${column.type}\``;
                if (column.isPrimaryKey) info += ' 🔑';
                if (column.isForeignKey) info += ` 🔗→${column.foreignKeyTable}`;
                return info;
              }).join('\n'),
            },
          ];
          return { contents };
        }

        return null;
      },
    });
  }

  private buildColumnHoverContents(table: TableSchema, col: TableColumn): any[] {
    const contents = [
      { value: `**${table.name}.${col.name}**` },
      { value: `Type: \`${col.type}\` | Nullable: ${col.nullable ? 'Yes' : 'No'}` },
    ];
    if (col.isPrimaryKey) contents.push({ value: '🔑 **Primary Key**' });
    if (col.isForeignKey) {
      contents.push({ value: `🔗 **Foreign Key** → ${col.foreignKeyTable}.${col.foreignKeyColumn}` });
    }
    return contents;
  }

  // ─── SIGNATURE HELP PROVIDER ─────────────────────────────────

  /**
   * Register signature help provider to show function parameter info.
   * Shows signature when typing inside function parentheses: COUNT(|), SUBSTRING(str, |)
   * @returns Disposable to unregister the provider
   */
  registerSignatureHelpProvider(): any {
    return monaco.languages.registerSignatureHelpProvider('sql', {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: (model: any, position: any) => {
        try {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Walk backwards from cursor to find the enclosing function call
          let parenDepth = 0;
          let commaCount = 0;
          let funcParenPos = -1;

          for (let i = textUntilPosition.length - 1; i >= 0; i--) {
            const ch = textUntilPosition[i];
            if (ch === ')') {
              parenDepth++;
            } else if (ch === '(') {
              if (parenDepth === 0) {
                funcParenPos = i;
                break;
              }
              parenDepth--;
            } else if (ch === ',' && parenDepth === 0) {
              commaCount++;
            }
          }

          if (funcParenPos < 0) return null;

          // Extract function name (word before the opening paren)
          const beforeParen = textUntilPosition.substring(0, funcParenPos).replace(/\s+$/, '');
          const funcNameMatch = beforeParen.match(/(\w+)$/);
          if (!funcNameMatch) return null;

          const funcName = funcNameMatch[1].toUpperCase();

          // Look up the function definition
          const funcDef = SQL_FUNCTIONS.find(f => f.name.toUpperCase() === funcName);
          if (!funcDef) return null;

          // Build parameter list
          const params = funcDef.params
            ? funcDef.params.split(',').map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p)
            : [];

          if (params.length === 0) return null;

          return {
            value: {
              signatures: [{
                label: `${funcDef.name}(${funcDef.params})`,
                documentation: funcDef.description,
                parameters: params.map(p => ({
                  label: p,
                  documentation: '',
                })),
              }],
              activeSignature: 0,
              activeParameter: Math.min(commaCount, params.length - 1),
            },
            dispose: () => {},
          };
        } catch {
          return null;
        }
      },
    });
  }

  // ─── KEYBOARD SHORTCUTS ────────────────────────────────────

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

  // ─── DOCUMENTATION HELPERS ─────────────────────────────────

  private getTableDocumentation(table: TableSchema): string {
    const pkCols = table.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    const fkCols = table.columns.filter(c => c.isForeignKey);
    let doc = `**${table.name}** (${table.columns.length} columns)\n\n`;
    if (pkCols.length) doc += `🔑 PK: ${pkCols.join(', ')}\n`;
    if (fkCols.length) doc += `🔗 FK: ${fkCols.map(c => `${c.name}→${c.foreignKeyTable}`).join(', ')}\n`;
    doc += '\n' + table.columns
      .map(c => `• ${c.name}: ${c.type}${c.isPrimaryKey ? ' 🔑' : ''}${c.isForeignKey ? ' 🔗' : ''}`)
      .join('\n');
    return doc;
  }

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
