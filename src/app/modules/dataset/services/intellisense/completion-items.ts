/**
 * Builders for individual completion items: keywords, functions, snippets, join
 * conditions, and the column suggestions offered at INSERT / UPDATE positions.
 *
 * Separate from the provider so that the provider reads as "what kind of
 * completion does this cursor position want", and this file reads as "produce
 * items of that kind".
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
import { getColumnDocumentation } from './hover-provider';



/** Monaco is loaded at runtime by MonacoLoaderService, not bundled. */
declare const monaco: any;


/**
 * Suggest columns for INSERT INTO table (...) context.
 * Filters out already-specified columns.
 */
export function getInsertColumnSuggestions(
  svc: IntelliSenseContext,
  insertMatch: RegExpMatchArray,
  tableByName: Map<string, TableSchema>,
  range: any,
): any[] {
  const schemaName = insertMatch[1];
  const tableName = insertMatch[2];
  const existingColsStr = insertMatch[3] || '';

  const key = schemaName
    ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
    : tableName.toLowerCase();
  const table =
    tableByName.get(key) || tableByName.get(tableName.toLowerCase());
  if (!table) return [];

  // Parse already-specified columns
  const existingCols = new Set(
    existingColsStr
      .split(',')
      .map(c => c.replace(/\s+/g, '').toLowerCase())
      .filter(c => c),
  );

  return table.columns
    .filter(col => !existingCols.has(col.name.toLowerCase()))
    .map((col, idx) => ({
      label: col.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: `${col.type}${col.nullable ? '' : ' NOT NULL'}${col.isPrimaryKey ? ' PK' : ''}`,
      documentation: getColumnDocumentation(svc, col),
      insertText: col.name,
      sortText: String(idx).padStart(4, '0'),
      range: range,
    }));
}

/**
 * Suggest columns for UPDATE table SET context.
 * Uses snippet insertion: column = $0
 */
export function getUpdateSetSuggestions(
  svc: IntelliSenseContext,
  updateMatch: RegExpMatchArray,
  tableByName: Map<string, TableSchema>,
  range: any,
): any[] {
  const schemaName = updateMatch[1];
  const tableName = updateMatch[2];

  const key = schemaName
    ? `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`
    : tableName.toLowerCase();
  const table =
    tableByName.get(key) || tableByName.get(tableName.toLowerCase());
  if (!table) return [];

  return table.columns.map((col, idx) => ({
    label: col.name,
    kind: monaco.languages.CompletionItemKind.Field,
    detail: `${col.type}${col.nullable ? '' : ' NOT NULL'}`,
    documentation: getColumnDocumentation(svc, col),
    insertText: `${col.name} = $0`,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    sortText: col.isPrimaryKey
      ? '1_' + String(idx).padStart(4, '0')
      : '0_' + String(idx).padStart(4, '0'),
    range: range,
  }));
}

// ─── DOT COMPLETION ────────────────────────────────────────

export function buildColumnSuggestions(svc: IntelliSenseContext, table: TableSchema, range: any): any[] {
  return table.columns.map((col, idx) => ({
    label: col.name,
    kind: monaco.languages.CompletionItemKind.Field,
    detail: `${col.type}${col.nullable ? ' (nullable)' : ''}${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`,
    documentation: getColumnDocumentation(svc, col),
    insertText: quoteIdentifier(col.name),
    sortText: String(idx).padStart(4, '0'), // preserve column order from schema
    range: range,
  }));
}

// ─── SUGGESTION BUILDERS ───────────────────────────────────

/**
 * Add columns from all table references to suggestions.
 * Auto-prefixes with alias/table name when multiple tables are referenced.
 */
export function addColumnsFromRefs(
  svc: IntelliSenseContext,
  refs: TableRef[],
  suggestions: any[],
  seen: Set<string>,
  range: any,
  sortPrefix: string,
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
          documentation: getColumnDocumentation(svc, col),
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
          documentation: getColumnDocumentation(svc, col),
          insertText: col.name,
          sortText: sortPrefix + col.name,
          range: range,
        });
      }
    }
  }
}

export function addKeywords(
  svc: IntelliSenseContext,
  suggestions: any[],
  seen: Set<string>,
  range: any,
  sortPrefix: string,
): void {
  // Dialect spec lookup is O(1) (switch on dbType, return a const). Reading
  // it once per call keeps the loop hot path simple.
  const { keywords, types } = getDialectSpec(svc.activeDbType);

  const emit = (kw: string) => {
    if (seen.has(kw)) return;
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
  };

  for (const kw of keywords) emit(kw);
  // Types are surfaced under the same Keyword kind for now — Monaco's
  // CompletionItemKind doesn't have a distinct "type" kind that styles
  // nicely, and they behave identically in autocomplete.
  for (const t of types) emit(t);
}

export function addFunctions(
  svc: IntelliSenseContext,
  suggestions: any[],
  seen: Set<string>,
  range: any,
  sortPrefix: string,
): void {
  const { functions, extraFunctionNames } = getDialectSpec(svc.activeDbType);

  // Rich entries first — they carry param signatures and descriptions
  // for hover / signature-help, so we want them in the dedup set
  // ahead of the bare names below.
  for (const fn of functions) {
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
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: sortPrefix + fn.name,
      range: range,
    });
  }

  // Long-tail names from the library that we haven't catalogued with
  // docs yet. Sorted one band lower so the rich entries (which have
  // signature help) win when both match a prefix. No description ⇒
  // detail is just the engine label.
  for (const raw of extraFunctionNames) {
    const upper = raw.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    suggestions.push({
      label: upper,
      kind: monaco.languages.CompletionItemKind.Function,
      detail: 'SQL Function',
      insertText: `${upper}($0)`,
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      // One sortPrefix below the rich-entries band so when the user
      // types a prefix that matches both, the catalogued (richer)
      // entry shows up on top.
      sortText: sortPrefix + 'z_' + upper,
      range: range,
    });
  }
}

export function addSnippets(svc: IntelliSenseContext, suggestions: any[], seen: Set<string>, range: any): void {
  for (const snippet of COMMON_SQL_SNIPPETS) {
    if (seen.has(snippet.label)) continue;
    seen.add(snippet.label);
    suggestions.push({
      label: snippet.label,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: 'SQL Snippet',
      documentation: snippet.documentation,
      insertText: snippet.insertText,
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: '4_' + snippet.label,
      range: range,
    });
  }
}

export function addDynamicSnippets(
  svc: IntelliSenseContext,
  tables: TableSchema[],
  suggestions: any[],
  seen: Set<string>,
  range: any,
): void {
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
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
export function addJoinOnSnippets(
  svc: IntelliSenseContext,
  tableRefs: TableRef[],
  suggestions: any[],
  seen: Set<string>,
  range: any,
): void {
  if (tableRefs.length < 2) return;

  // The last ref is likely the table that was just JOINed
  const newRef = tableRefs[tableRefs.length - 1];
  if (!newRef.tableSchema) return;

  const newPrefix = newRef.alias || newRef.tableName;

  for (const col of newRef.tableSchema.columns) {
    if (!col.isForeignKey || !col.foreignKeyTable || !col.foreignKeyColumn)
      continue;

    // Find the referenced table in existing refs
    const targetRef = tableRefs.find(
      r =>
        r.tableName.toLowerCase() === col.foreignKeyTable!.toLowerCase() &&
        r !== newRef,
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
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
      if (
        !col.isForeignKey ||
        col.foreignKeyTable?.toLowerCase() !== newRef.tableName.toLowerCase()
      )
        continue;

      const label = `${existingPrefix}.${col.name} = ${newPrefix}.${col.foreignKeyColumn}`;
      if (seen.has(label)) continue;
      seen.add(label);
      suggestions.push({
        label: label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: 'FK join condition',
        documentation: `Auto-detected foreign key: ${existingRef.tableName}.${col.name} → ${newRef.tableName}.${col.foreignKeyColumn}`,
        insertText: label + '$0',
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '0_' + label,
        range: range,
      });
    }
  }
}

// ─── SCHEMA-AWARE DIAGNOSTICS ──────────────────────────────
