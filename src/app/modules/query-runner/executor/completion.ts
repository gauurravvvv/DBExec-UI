/**
 * Context-aware SQL completion source for CodeMirror 6, driven by the
 * SchemaCatalog. Three behaviours (INTEGRATION_PLAN §5):
 *   1. dot completion   — `u.` after `FROM users u` → users' columns
 *   2. clause-scoped     — after SELECT/WHERE/ON/… → columns of the
 *                          tables in THIS statement's FROM/JOIN
 *   3. table suggestions — after FROM/JOIN → schemas + tables
 *
 * Falls through (returns null) to the keyword source otherwise.
 */
import {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import { ColInfo, SchemaCatalog, TblInfo } from './schema-catalog';

interface TableRef {
  schema?: string;
  table: string;
  alias?: string;
}

const CLAUSE_KEYWORDS = new Set([
  'on',
  'where',
  'group',
  'order',
  'having',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'using',
  'limit',
  'offset',
  'union',
  'select',
  'set',
  'and',
  'or',
  'as',
  'natural',
]);

const IDENT_OK = /^[a-z_][a-z0-9_$]*$/;
const quoteIdent = (s: string) =>
  IDENT_OK.test(s) ? s : `"${s.replace(/"/g, '""')}"`;

/** Slice back to the statement containing the cursor (last unquoted ';'). */
function currentStatement(textBefore: string): string {
  let last = 0;
  for (let i = 0; i < textBefore.length; i++) {
    const c = textBefore[i];
    if (c === "'" || c === '"') {
      i++;
      while (i < textBefore.length && textBefore[i] !== c) i++;
    } else if (c === ';') {
      last = i + 1;
    }
  }
  return textBefore.slice(last);
}

/** Extract FROM/JOIN table refs + aliases from a statement. */
function extractTableRefs(stmt: string): TableRef[] {
  const refs: TableRef[] = [];
  const re =
    /\b(?:from|join)\s+("?[\w$]+"?(?:\.\s*"?[\w$]+"?)?)\s*(?:(?:as\s+)?("?[\w$]+"?))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stmt))) {
    const qualified = m[1].replace(/"/g, '');
    const aliasRaw = m[2]?.replace(/"/g, '');
    const parts = qualified.split(/\s*\.\s*/);
    const table = parts.pop() as string;
    const schema = parts.pop();
    const alias =
      aliasRaw && !CLAUSE_KEYWORDS.has(aliasRaw.toLowerCase())
        ? aliasRaw
        : undefined;
    refs.push({ schema, table, alias });
  }
  return refs;
}

/** Find the clause keyword governing the cursor (scan tokens backwards). */
function governingClause(textBefore: string): string | null {
  const stmt = currentStatement(textBefore).toLowerCase();
  const tokens = stmt.match(/[\w$]+|[(),.*]/g) ?? [];
  const anchors = [
    'select',
    'from',
    'join',
    'where',
    'on',
    'group',
    'order',
    'having',
    'set',
    'values',
  ];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (anchors.includes(tokens[i])) return tokens[i];
  }
  return null;
}

function colCompletion(c: ColInfo, aliasPrefix?: string): Completion {
  const apply = (aliasPrefix ? aliasPrefix + '.' : '') + quoteIdent(c.name);
  return {
    label: c.name,
    apply,
    type: c.isPrimaryKey ? 'pk' : 'column',
    detail: c.dataType + (c.nullable ? '' : ' NOT NULL'),
    boost: c.isPrimaryKey ? 2 : 0,
  };
}
function tblCompletion(t: TblInfo): Completion {
  return {
    label: t.name,
    apply: quoteIdent(t.name),
    type: 'table',
    detail: `${t.schema} · ${t.type}`,
  };
}
function schemaCompletion(name: string): Completion {
  return {
    label: name,
    apply: quoteIdent(name) + '.',
    type: 'schema',
    detail: 'schema',
  };
}

/**
 * @param cat            the (incrementally-hydrated) catalog
 * @param requestColumns lazy loader: called with (schema?, table) when a
 *                       table's columns aren't cached yet. It should fetch
 *                       + merge them into `cat`, then re-trigger completion.
 */
export function dbexecCompletionSource(
  cat: SchemaCatalog,
  requestColumns?: (schema: string | undefined, table: string) => void,
) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const textBefore = ctx.state.sliceDoc(0, ctx.pos);

    // 1) DOT completion: ident.[partial]
    const dot = /([\w$]+)\.\s*([\w$]*)$/i.exec(textBefore);
    if (dot) {
      const ident = dot[1];
      const from = ctx.pos - dot[2].length;
      const refs = extractTableRefs(currentStatement(textBefore));

      const byAlias = refs.find(
        r => r.alias?.toLowerCase() === ident.toLowerCase(),
      );
      const byTable = refs.find(
        r => r.table.toLowerCase() === ident.toLowerCase(),
      );
      const target = byAlias ?? byTable;
      if (target) {
        const cols = cat.columns(target.schema, target.table);
        if (cols.length) {
          return {
            from,
            options: cols.map(c => colCompletion(c)),
            validFor: /^[\w$]*$/,
          };
        }
        // Columns not cached yet — kick off a lazy fetch; completion
        // re-fires once they land.
        if (!cat.hasColumns(target.schema, target.table) && requestColumns) {
          requestColumns(target.schema, target.table);
        }
      }
      if (cat.isSchema(ident)) {
        const tables = cat.tablesInSchema(ident);
        return {
          from,
          options: tables.map(tblCompletion),
          validFor: /^[\w$]*$/,
        };
      }
      return null;
    }

    // 2) plain word context
    const word = ctx.matchBefore(/[\w$]*/);
    if (!word && !ctx.explicit) return null;
    const from = word ? word.from : ctx.pos;
    const clause = governingClause(textBefore);

    if (clause === 'from' || clause === 'join') {
      return {
        from,
        validFor: /^[\w$]*$/,
        options: [
          ...cat.schemas.map(schemaCompletion),
          ...cat.allTables().map(tblCompletion),
        ],
      };
    }

    if (
      ['select', 'where', 'on', 'group', 'order', 'having', 'set'].includes(
        clause ?? '',
      )
    ) {
      const refs = extractTableRefs(currentStatement(textBefore));
      const opts: Completion[] = [];
      for (const r of refs) {
        const cols = cat.columns(r.schema, r.table);
        if (
          !cols.length &&
          !cat.hasColumns(r.schema, r.table) &&
          requestColumns
        ) {
          requestColumns(r.schema, r.table);
        }
        const prefix = r.alias ?? (refs.length > 1 ? r.table : undefined);
        for (const c of cols) opts.push(colCompletion(c, prefix));
      }
      for (const r of refs) {
        if (r.alias)
          opts.push({ label: r.alias, type: 'table', detail: r.table });
      }
      if (opts.length) {
        return { from, options: opts, validFor: /^[\w$]*$/ };
      }
    }

    return null; // fall through to keyword source
  };
}
