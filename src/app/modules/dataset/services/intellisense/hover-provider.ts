/**
 * Monaco hover provider: table, column, keyword and function documentation.
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



/** Monaco is loaded at runtime by MonacoLoaderService, not bundled. */
declare const monaco: any;


/**
 * Register hover provider for tables and columns
 * @returns Disposable to unregister the provider
 */
export function registerHoverProvider(svc: IntelliSenseContext, datasources: any[]): any {
  if (datasources && datasources.length > 0) {
    svc.setDatasources(datasources);
  }

  return monaco.languages.registerHoverProvider('sql', {
    provideHover: (model: any, position: any) => {
      const { allTables: tables, tableByName } = svc.getLookups();

      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const wordLower = word.word.toLowerCase();
      const haveSchema = tables.length > 0;
      // If no schema is loaded, schema-aware hover paths are skipped but
      // keyword/function hovers still work — fall through to the fallback.
      if (!haveSchema) {
        return buildKeywordOrFunctionHover(svc, word.word) ?? null;
      }

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
          const qualTable = tables.find(
            t => t.name.toLowerCase() === qualifier,
          );
          if (qualTable) {
            const col = qualTable.columns.find(
              c => c.name.toLowerCase() === wordLower,
            );
            if (col) {
              return {
                contents: buildColumnHoverContents(svc, qualTable, col),
              };
            }
          }
          // Qualifier might be an alias — resolve from current text
          const fullText = model.getValue();
          const strippedText = svc.stripCached(fullText);
          const refs = svc.getCachedTableRefs(strippedText, tableByName);
          const ref = refs.find(
            r =>
              (r.alias && r.alias.toLowerCase() === qualifier) ||
              r.tableName.toLowerCase() === qualifier,
          );
          if (ref?.tableSchema) {
            const col = ref.tableSchema.columns.find(
              c => c.name.toLowerCase() === wordLower,
            );
            if (col) {
              return {
                contents: buildColumnHoverContents(svc, ref.tableSchema, col),
              };
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
          {
            value: `**Table: ${table.name}** — ${table.columns.length} columns`,
          },
          {
            value:
              '```\n' +
              table.columns
                .map(
                  (c: TableColumn) =>
                    `${c.name.padEnd(24)} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK→' + c.foreignKeyTable : ''}`,
                )
                .join('\n') +
              '\n```',
          },
        ];
        if (pkCols.length > 0) {
          contents.push({
            value: `🔑 PK: ${pkCols.map(c => c.name).join(', ')}`,
          });
        }
        if (fkCols.length > 0) {
          contents.push({
            value: `🔗 FK: ${fkCols.map(c => `${c.name}→${c.foreignKeyTable}.${c.foreignKeyColumn}`).join(', ')}`,
          });
        }
        return { contents };
      }

      // Dialect-scoped keyword / function lookup. The dialect is the one
      // currently active for this editor — set via setActiveDbType().
      const dialect = getDialectSpec(svc.activeDbType);

      // Check if it's a SQL keyword — show brief description
      const kwMatch =
        dialect.keywords.find(kw => kw.toLowerCase() === wordLower) ||
        dialect.types.find(t => t.toLowerCase() === wordLower);
      if (kwMatch) {
        return { contents: [{ value: `**SQL Keyword:** \`${kwMatch}\`` }] };
      }

      // Check if it's a SQL function
      const fnMatch = dialect.functions.find(
        fn => fn.name.toLowerCase() === wordLower,
      );
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
      const strippedFull = svc.stripCached(fullText);
      const refs = svc.getCachedTableRefs(strippedFull, tableByName);
      const aliasRef = refs.find(
        r => r.alias && r.alias.toLowerCase() === wordLower,
      );
      if (aliasRef?.tableSchema) {
        const contents = [
          {
            value: `**Alias:** \`${aliasRef.alias}\` → **${aliasRef.tableName}** (${aliasRef.tableSchema.columns.length} columns)`,
          },
          {
            value:
              '```\n' +
              aliasRef.tableSchema.columns
                .map(
                  (c: TableColumn) =>
                    `${c.name.padEnd(24)} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK' : ''}`,
                )
                .join('\n') +
              '\n```',
          },
        ];
        return { contents };
      }

      // Column name — collect ALL matching tables
      const matchingColumns: { table: TableSchema; column: TableColumn }[] =
        [];
      for (const tbl of tables) {
        const col = tbl.columns.find(c => c.name.toLowerCase() === wordLower);
        if (col) {
          matchingColumns.push({ table: tbl, column: col });
        }
      }

      if (matchingColumns.length === 1) {
        return {
          contents: buildColumnHoverContents(svc, 
            matchingColumns[0].table,
            matchingColumns[0].column,
          ),
        };
      }

      if (matchingColumns.length > 1) {
        const contents = [
          {
            value: `**Column: ${word.word}** _(found in ${matchingColumns.length} tables)_`,
          },
          {
            value: matchingColumns
              .map(({ table: tbl, column }) => {
                let info = `• **${tbl.name}**.${column.name} — \`${column.type}\``;
                if (column.isPrimaryKey) info += ' 🔑';
                if (column.isForeignKey)
                  info += ` 🔗→${column.foreignKeyTable}`;
                return info;
              })
              .join('\n'),
          },
        ];
        return { contents };
      }

      // Last resort: SQL keyword or built-in function tooltip.
      return buildKeywordOrFunctionHover(svc, word.word) ?? null;
    },
  });
}

/**
 * Look up `word` against the active dialect's keyword / function lists
 * and return a hover-content payload, or null if there's no match.
 * Case-insensitive.
 */
export function buildKeywordOrFunctionHover(
  svc: IntelliSenseContext,
  word: string,
): { contents: { value: string }[] } | null {
  const upper = word.toUpperCase();
  const dialect = getDialectSpec(svc.activeDbType);

  // Built-in functions catalogued with docs carry richer info
  // (params + description). Try those first.
  const fn = dialect.functions.find(f => f.name.toUpperCase() === upper);
  if (fn) {
    return {
      contents: [
        { value: `**${fn.name}**(${fn.params})` },
        { value: fn.description },
      ],
    };
  }

  // Long-tail function names harvested from lang-sql (currently only
  // MSSQL ships this list). No docs available — fall through to a
  // bare-name tooltip so the user at least knows it's a function.
  if (dialect.extraFunctionNames.some(n => n.toUpperCase() === upper)) {
    return {
      contents: [{ value: `**${upper}**` }, { value: '_SQL function_' }],
    };
  }

  // Keywords / types are flat lists — only show a tooltip for canonical
  // matches in the active dialect.
  if (dialect.keywords.includes(upper) || dialect.types.includes(upper)) {
    return {
      contents: [{ value: `**${upper}**` }, { value: '_SQL keyword_' }],
    };
  }

  return null;
}

export function buildColumnHoverContents(
  svc: IntelliSenseContext,
  table: TableSchema,
  col: TableColumn,
): any[] {
  const contents = [
    { value: `**${table.name}.${col.name}**` },
    {
      value: `Type: \`${col.type}\` | Nullable: ${col.nullable ? 'Yes' : 'No'}`,
    },
  ];
  if (col.isPrimaryKey) contents.push({ value: '🔑 **Primary Key**' });
  if (col.isForeignKey && col.foreignKeyTable) {
    const ref = col.foreignKeySchema
      ? `${col.foreignKeySchema}.${col.foreignKeyTable}.${col.foreignKeyColumn}`
      : `${col.foreignKeyTable}.${col.foreignKeyColumn}`;
    contents.push({ value: `🔗 **Foreign Key** → ${ref}` });
  }
  if (col.defaultValue) {
    contents.push({ value: `**Default:** \`${col.defaultValue}\`` });
  }
  return contents;
}

// ─── SIGNATURE HELP PROVIDER ─────────────────────────────────

export function getTableDocumentation(svc: IntelliSenseContext, table: TableSchema): string {
  const pkCols = table.columns.filter(c => c.isPrimaryKey).map(c => c.name);
  const fkCols = table.columns.filter(c => c.isForeignKey);
  let doc = `**${table.name}** (${table.columns.length} columns)\n\n`;
  if (pkCols.length) doc += `🔑 PK: ${pkCols.join(', ')}\n`;
  if (fkCols.length)
    doc += `🔗 FK: ${fkCols.map(c => `${c.name}→${c.foreignKeyTable}`).join(', ')}\n`;
  doc +=
    '\n' +
    table.columns
      .map(
        c =>
          `• ${c.name}: ${c.type}${c.isPrimaryKey ? ' 🔑' : ''}${c.isForeignKey ? ' 🔗' : ''}`,
      )
      .join('\n');
  return doc;
}

export function getColumnDocumentation(svc: IntelliSenseContext, col: TableColumn): string {
  let doc = `**Type:** ${col.type}\n`;
  doc += `**Nullable:** ${col.nullable ? 'Yes' : 'No'}\n`;
  if (col.isPrimaryKey) doc += `**Primary Key:** Yes\n`;
  if (col.isForeignKey && col.foreignKeyTable) {
    const ref = col.foreignKeySchema
      ? `${col.foreignKeySchema}.${col.foreignKeyTable}.${col.foreignKeyColumn}`
      : `${col.foreignKeyTable}.${col.foreignKeyColumn}`;
    doc += `**Foreign Key:** References ${ref}\n`;
  }
  if (col.defaultValue) {
    doc += `**Default:** \`${col.defaultValue}\`\n`;
  }
  return doc;
}
