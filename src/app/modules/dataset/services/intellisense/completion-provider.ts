/**
 * Monaco completion provider for SQL.
 *
 * Split out of `MonacoIntelliSenseService`, which had reached 1,911 lines with a
 * single 586-line method at its centre. The three Monaco providers share no
 * mutable state with one another — only the schema lookups and memoisation caches
 * the service still owns — so each became its own file, reaching back through
 * `IntelliSenseContext`.
 */

import { COMMON_SQL_SNIPPETS, getDialectSpec } from '../../config/sql-dialects';
import {
  DatasourceSchema,
  TableColumn,
  TableSchema,
} from '../../models/dataset-schema.model';
import { CursorScope, findScopeAt } from '../sql-scope-tracker';
import {
  RESERVED_WORDS,
  TableRef,
  buildAliasMap,
  extractBalancedParens,
  generateAlias,
  getContext,
  isCursorInStringOrComment,
  parseCTEReferences,
  parseTableReferences,
  quoteIdentifier,
  stripStringsAndComments,
} from '../sql-text-analysis';
import { IntelliSenseContext } from './intellisense-context';
import { addColumnsFromRefs, addDynamicSnippets, addFunctions, addJoinOnSnippets, addKeywords, addSnippets, buildColumnSuggestions, getInsertColumnSuggestions, getUpdateSetSuggestions } from './completion-items';
import { getColumnDocumentation, getTableDocumentation } from './hover-provider';



/** Monaco is loaded at runtime by MonacoLoaderService, not bundled. */
declare const monaco: any;


/**
 * Register SQL completions for tables, columns, keywords, functions, and
 * snippets. Reads schema data from the live cache (`setDatasources()`), so
 * the registration itself never needs to be redone when the schema reloads.
 *
 * `datasources` is kept as a parameter for backwards compatibility with
 * existing callers — the first argument is just forwarded to setDatasources()
 * so the cache is primed.
 */
export function registerSQLCompletions(svc: IntelliSenseContext, datasources: DatasourceSchema[], editor: any): any {
  if (datasources && datasources.length > 0) {
    svc.setDatasources(datasources);
  }

  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ',', '('],
    provideCompletionItems: (model: any, position: any) => {
      try {
        // Read fresh lookups every invocation; cache hit is O(1).
        const {
          allTables,
          tableByName,
          schemaMap,
          tableToSchema,
          schemaNames,
        } = svc.getLookups();

        // Nothing schema-aware to suggest if the schema hasn't loaded yet —
        // but we still want keywords/functions/snippets, so don't bail.
        const haveSchema = allTables.length > 0;

        const fullText = model.getValue();
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // ─── SUPPRESS INSIDE STRINGS / COMMENTS ─────────────
        if (isCursorInStringOrComment(textUntilPosition)) {
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
        const { statement: currentStatement, startOffset } =
          svc.getCurrentStatement(fullText, cursorOffset);
        const textInStatement = fullText.substring(startOffset, cursorOffset);

        // Strip strings/comments for safe structural parsing.
        // The cached form deduplicates work across keystrokes that don't
        // structurally change the SQL.
        const strippedStatement = svc.stripCached(currentStatement);
        const strippedTextInStatement = svc.stripCached(textInStatement);

        // ─── PARSE REFERENCES (scoped to current statement, memoized) ─
        const baseTableRefs = svc.getCachedTableRefs(
          strippedStatement,
          tableByName,
        );
        const baseCteRefs = svc.getCachedCTERefs(
          strippedStatement,
          tableByName,
        );

        // ─── SCOPE TRACKER OVERRIDE ─────────────────────────
        // The token-based scope tracker handles nesting (subqueries, CTE
        // bodies, scalar subqueries in SET/WHERE) that the regex parsers
        // can't see. When it confidently identifies a scope, we use ITS
        // table refs — they're filtered to the cursor's actual visibility.
        // Falls through to the regex-parsed refs when the tracker bails.
        const cursorOffsetInStatement = strippedTextInStatement.length;
        const scope: CursorScope | null = findScopeAt(
          strippedStatement,
          cursorOffsetInStatement,
        );
        const scopeTrackerActive = !!scope;
        const tableRefs = scopeTrackerActive
          ? svc.resolveScopeRefs(scope!.tableRefs, tableByName)
          : baseTableRefs;
        const cteRefs = scopeTrackerActive
          ? scope!.cteNames.map(name => ({
              schemaName: null,
              tableName: name,
              alias: null,
              tableSchema: null,
            }))
          : baseCteRefs;
        const allRefs = [...cteRefs, ...tableRefs];
        const aliasMap = buildAliasMap(allRefs);

        // ─── DOT COMPLETION ──────────────────────────────────
        // Allow whitespace around the dot — Postgres-style `schema . table`
        // and accidental whitespace from formatters both still complete.
        const dotMatch = textUntilPosition.match(
          /(?:(\w+)\s*\.\s*)?(\w+)\s*\.\s*$/,
        );
        if (dotMatch && haveSchema) {
          const afterDotRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column,
          };
          return {
            suggestions: getDotCompletions(svc, 
              dotMatch,
              svc.currentDatasources,
              allTables,
              aliasMap,
              schemaMap,
              afterDotRange,
            ),
          };
        }

        // ─── INSERT INTO table (...) → Column suggestions ───
        const insertMatch = strippedTextInStatement.match(
          /\bINSERT\s+INTO\s+(?:(\w+)\.)?(\w+)\s*\(([^)]*?)$/i,
        );
        if (insertMatch) {
          return {
            suggestions: getInsertColumnSuggestions(svc, 
              insertMatch,
              tableByName,
              defaultRange,
            ),
          };
        }

        // ─── UPDATE table SET → Column suggestions ──────────
        const updateSetMatch = strippedTextInStatement.match(
          /\bUPDATE\s+(?:(\w+)\.)?(\w+)\s+SET\s+(?:.*,\s*)?(\w*)$/i,
        );
        if (updateSetMatch) {
          return {
            suggestions: getUpdateSetSuggestions(svc, 
              updateSetMatch,
              tableByName,
              defaultRange,
            ),
          };
        }

        // ─── CONTEXT ANALYSIS ────────────────────────────────
        // Prefer the scope tracker's clause when available. It correctly
        // handles subqueries, CTE bodies, INSERT-from-SELECT, scalar
        // subqueries — every case the regex pattern misses. The 'groupby'
        // clause from the tracker maps to 'orderby' for the regex-side
        // call sites because the suggestion behavior is identical.
        let ctx: string;
        if (scopeTrackerActive) {
          ctx = scope!.clause === 'groupby' ? 'orderby' : scope!.clause;
          // If the tracker reports 'generic', fall back to the regex
          // detection — it has finer-grained heuristics for partial input
          // (e.g. mid-typing a clause keyword).
          if (ctx === 'generic') {
            ctx = getContext(strippedTextInStatement);
          }
        } else {
          ctx = getContext(strippedTextInStatement);
        }
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
                const qualifiedLabel = `${schemaName}.${table.name}`;
                const qualifiedInsert = `${quoteIdentifier(schemaName)}.${quoteIdentifier(table.name)}`;
                addSuggestion({
                  label: qualifiedLabel,
                  kind: monaco.languages.CompletionItemKind.Class,
                  detail: `Table (${table.columns.length} columns)`,
                  documentation: getTableDocumentation(svc, table),
                  insertText: qualifiedInsert + ' ',
                  filterText: `${qualifiedLabel} ${table.name}`,
                  sortText: '2_' + schemaName + '_' + table.name,
                  range: defaultRange,
                });
              }
            }

            // 3. Unqualified table names (for quick access / default schema)
            for (const table of allTables) {
              const schemaName =
                tableToSchema.get(table.name.toLowerCase()) || '';
              addSuggestion({
                label: table.name,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: `Table · ${schemaName} (${table.columns.length} cols)`,
                documentation: getTableDocumentation(svc, table),
                insertText: quoteIdentifier(table.name) + ' ',
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
                documentation: getTableDocumentation(svc, table),
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
                  documentation: getColumnDocumentation(svc, col),
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
                  documentation: getColumnDocumentation(svc, col),
                  insertText: `${table.name}.${col.name}`,
                  sortText: '0_' + table.name + '.' + col.name,
                  range: defaultRange,
                });
              }
            }
          }
          // DISTINCT / ALL are the canonical first tokens right after
          // SELECT — surface them above generic keywords so they appear
          // when the user types `dist` / `all` immediately.
          for (const kw of ['DISTINCT', 'ALL']) {
            if (seenLabels.has(kw)) continue;
            seenLabels.add(kw);
            suggestions.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              detail: 'SQL keyword',
              insertText: kw + ' ',
              sortText: '0__' + kw, // tied with `*` / `prefix.*` shortcuts
              range: defaultRange,
            });
          }
          // Add aggregate functions at high priority in SELECT
          addFunctions(svc, suggestions, seenLabels, defaultRange, '1_');
          addKeywords(svc, suggestions, seenLabels, defaultRange, '3_');
          addSnippets(svc, suggestions, seenLabels, defaultRange);
          return { suggestions };
        }

        // ─── WHERE / ON / SET / AND / OR → Columns from ALL referenced tables ─
        if (ctx === 'column') {
          addColumnsFromRefs(svc, 
            allRefs,
            suggestions,
            seenLabels,
            defaultRange,
            '0_',
          );
          // WHERE-context keywords
          const whereKeywords = [
            'AND',
            'OR',
            'NOT',
            'IN',
            'LIKE',
            'ILIKE',
            'BETWEEN',
            'IS NULL',
            'IS NOT NULL',
            'EXISTS',
            'NOT EXISTS',
            'TRUE',
            'FALSE',
            'NULL',
            'CASE',
          ];
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
          addFunctions(svc, suggestions, seenLabels, defaultRange, '2_');
          return { suggestions };
        }

        // ─── HAVING → Aggregate functions first, then columns ─
        if (ctx === 'having') {
          // Aggregates are most relevant in HAVING
          addFunctions(svc, suggestions, seenLabels, defaultRange, '0_');
          addColumnsFromRefs(svc, 
            allRefs,
            suggestions,
            seenLabels,
            defaultRange,
            '1_',
          );
          const havingKeywords = [
            'AND',
            'OR',
            'NOT',
            'IN',
            'BETWEEN',
            'IS NULL',
            'IS NOT NULL',
            'TRUE',
            'FALSE',
            'NULL',
          ];
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
                const label =
                  allRefs.length > 1 ? `${prefix}.${col.name}` : col.name;
                const insertText =
                  allRefs.length > 1 ? `${prefix}.${col.name}` : col.name;
                addSuggestion({
                  label: label,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: `${col.type} (${ref.tableName})`,
                  documentation: getColumnDocumentation(svc, col),
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
                documentation: getColumnDocumentation(svc, col),
                insertText: label,
                sortText:
                  col.isPrimaryKey || col.isForeignKey
                    ? '0_' + label
                    : '1_' + label,
                range: defaultRange,
              });
            }
          }
          // Add smart FK-based ON condition snippets
          addJoinOnSnippets(svc, 
            allRefs,
            suggestions,
            seenLabels,
            defaultRange,
          );
          return { suggestions };
        }

        // ─── DEFAULT / GENERIC context → Keywords + Functions + Snippets + Tables ─

        // Smart alias suggestion: if text ends with FROM/JOIN table_name, suggest alias.
        // Prefer the BE-supplied `table_alias` (server-derived, deterministic
        // per-(schema,table)) over the client heuristic so two users editing
        // the same schema converge on the same alias.
        const aliasContextMatch = strippedTextInStatement.match(
          /\b(?:from|join)\s+(?:(\w+)\.)?(\w+)\s+$/i,
        );
        if (aliasContextMatch) {
          const schemaPart = aliasContextMatch[1];
          const tblName = aliasContextMatch[2];
          const lookupKey = schemaPart
            ? `${schemaPart.toLowerCase()}.${tblName.toLowerCase()}`
            : tblName.toLowerCase();
          const resolvedTable =
            tableByName.get(lookupKey) ||
            tableByName.get(tblName.toLowerCase());
          const suggestedAlias =
            resolvedTable?.alias || generateAlias(tblName);
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
            detail: tblSchema
              ? `Table · ${tblSchema}`
              : `Table (${table.columns.length} columns)`,
            documentation: getTableDocumentation(svc, table),
            insertText: table.name,
            sortText: '2_' + table.name,
            range: defaultRange,
          });
        }

        addKeywords(svc, suggestions, seenLabels, defaultRange, '1_');
        addFunctions(svc, suggestions, seenLabels, defaultRange, '2_');
        addSnippets(svc, suggestions, seenLabels, defaultRange);
        addDynamicSnippets(svc, 
          allTables,
          suggestions,
          seenLabels,
          defaultRange,
        );

        return { suggestions };
      } catch (error) {
        console.error('Monaco completion provider error:', error);
        return { suggestions: [] };
      }
    },
  });
}

// ─── TABLE REFERENCE PARSING (memoized over sql-text-analysis) ───

/**
 * Handle completions after a dot: alias.col, table.col, schema.table
 */
export function getDotCompletions(
  svc: IntelliSenseContext,
  dotMatch: RegExpMatchArray,
  datasources: DatasourceSchema[],
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
      return buildColumnSuggestions(svc, ref.tableSchema, range);
    }
    // Try schema lookup
    const schemaTables = schemaMap.get(firstPart.toLowerCase());
    if (schemaTables) {
      const table = schemaTables.find(
        t => t.name.toLowerCase() === secondPart.toLowerCase(),
      );
      if (table) {
        return buildColumnSuggestions(svc, table, range);
      }
    }
  }

  // Case 2: alias. or table. → column completion
  const ref = aliasMap.get(secondPart.toLowerCase());
  if (ref?.tableSchema) {
    return buildColumnSuggestions(svc, ref.tableSchema, range);
  }

  // Direct table name lookup
  const directTable = allTables.find(
    t => t.name.toLowerCase() === secondPart.toLowerCase(),
  );
  if (directTable) {
    return buildColumnSuggestions(svc, directTable, range);
  }

  // Case 3: schema. → table completion (schema → table flow)
  const schemaTables = schemaMap.get(secondPart.toLowerCase());
  if (schemaTables) {
    return schemaTables.map((tbl, idx) => ({
      label: tbl.name,
      kind: monaco.languages.CompletionItemKind.Class,
      detail: `Table (${tbl.columns.length} columns)`,
      documentation: getTableDocumentation(svc, tbl),
      insertText: quoteIdentifier(tbl.name),
      sortText: String(idx).padStart(4, '0'),
      range: range,
    }));
  }

  return [];
}
