/**
 * SQL scope tracker — token-based context detection for the cursor.
 *
 * Purpose
 * -------
 * The regex `getContext()` previously used in MonacoIntelliSenseService can't
 * handle nested SQL: subqueries in the FROM clause, scalar subqueries in
 * SET/WHERE, CTE bodies, INSERT-from-SELECT, etc. A real parser like
 * `node-sql-parser` would be too heavy and doesn't tolerate the partial,
 * mid-typing SQL Monaco hands us on every keystroke.
 *
 * This module is the lightweight middle ground every production SQL editor
 * uses: tokenize once (linear scan), track paren / CTE / subquery scopes,
 * then for any cursor offset answer "what's the smallest enclosing clause
 * and which table references are in scope?".
 *
 * The tracker is error-tolerant: malformed SQL is treated as best-effort —
 * unmatched parens just leave a scope open at the document end; unknown
 * tokens are skipped. The completion provider falls back to its regex path
 * if the tracker can't classify a position.
 */

/** Token kinds we care about for scope tracking. */
export type TokenKind =
  | 'keyword'
  | 'identifier'
  | 'punct' //  , . ;
  | 'lparen' // (
  | 'rparen' // )
  | 'op' // arithmetic / comparison / etc.
  | 'string'
  | 'comment'
  | 'whitespace';

export interface SqlToken {
  kind: TokenKind;
  /** Lowercased value for keywords / identifiers, raw text for everything else. */
  value: string;
  start: number;
  end: number;
}

/**
 * Result of resolving a cursor offset against the parsed scope tree.
 *
 * `clause` is the SQL clause the cursor is in. `tableRefs` are the table
 * references that should be in scope at that cursor position — e.g. when
 * the cursor is inside a subquery, only the subquery's own FROM tables are
 * listed (parent FROM tables are NOT in scope, matching SQL semantics for
 * a non-correlated subquery). For simplicity we always treat subqueries
 * as their own scope; correlated subqueries lose access to outer tables in
 * the suggestions, which is a strictly safer false negative than incorrectly
 * suggesting columns that won't resolve.
 */
export interface CursorScope {
  /** The clause the cursor sits inside, mapped to the same names the
   * regex tracker used so call sites barely change. */
  clause:
    | 'select'
    | 'table' // FROM / JOIN / INSERT INTO / UPDATE — expecting table name
    | 'column' // WHERE / SET / AND / OR — expecting column / value
    | 'orderby'
    | 'groupby'
    | 'having'
    | 'join_on'
    | 'generic';
  /** Resolved-by-name table references in scope, in source order.
   * Each is `{ schemaName?, tableName, alias? }`. */
  tableRefs: ScopeTableRef[];
  /** The CTE names defined in scope (for table-position suggestions). */
  cteNames: string[];
}

export interface ScopeTableRef {
  schemaName: string | null;
  tableName: string;
  alias: string | null;
}

// ─── KEYWORD SET ───────────────────────────────────────────────
// Only the clause-introducing keywords need to be recognized as keywords for
// scope tracking. Everything else is just an identifier as far as the tracker
// cares — actual SQL keywords get their special treatment from
// MonacoIntelliSenseService's existing helpers.
const CLAUSE_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'group',
  'order',
  'by',
  'having',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'natural',
  'on',
  'using',
  'as',
  'union',
  'intersect',
  'except',
  'with',
  'recursive',
  'and',
  'or',
  'not',
  'into',
  'update',
  'set',
  'insert',
  'values',
  'returning',
  'limit',
  'offset',
  'fetch',
  'distinct',
  'all',
  'case',
  'when',
  'then',
  'else',
  'end',
]);

// ─── TOKENIZER ─────────────────────────────────────────────────

/**
 * Linear-time SQL tokenizer. Skips strings and comments by treating them as
 * single tokens — the tracker doesn't look inside.
 */
export function tokenize(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      const start = i;
      while (i < n && /\s/.test(sql[i])) i++;
      tokens.push({ kind: 'whitespace', value: sql.slice(start, i), start, end: i });
      continue;
    }

    // Single-line comment: -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      const start = i;
      while (i < n && sql[i] !== '\n') i++;
      tokens.push({ kind: 'comment', value: sql.slice(start, i), start, end: i });
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      if (i < n - 1) i += 2; // consume */
      else i = n; // unterminated — eat the rest
      tokens.push({ kind: 'comment', value: sql.slice(start, i), start, end: i });
      continue;
    }

    // String literal: '...' with '' as escape
    if (ch === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: 'string', value: sql.slice(start, i), start, end: i });
      continue;
    }

    // Quoted identifier: "foo bar" — treat as identifier, strip quotes from value.
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      // Strip the surrounding quotes for the value so lookups by name work.
      const inner = sql.slice(start + 1, i - 1).replace(/""/g, '"');
      tokens.push({ kind: 'identifier', value: inner, start, end: i });
      continue;
    }

    // Punctuation
    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: '(', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';' || ch === '.') {
      tokens.push({ kind: 'punct', value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    // Identifier / keyword: starts with letter or underscore, then word chars.
    // PostgreSQL allows `$` in identifiers; we accept it for safety.
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) i++;
      const value = sql.slice(start, i).toLowerCase();
      const kind: TokenKind = CLAUSE_KEYWORDS.has(value) ? 'keyword' : 'identifier';
      tokens.push({ kind, value, start, end: i });
      continue;
    }

    // Operators / anything else: lump as 'op' single-char so we don't crash.
    tokens.push({ kind: 'op', value: ch, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

// ─── SCOPE TREE ────────────────────────────────────────────────

/**
 * One node in the scope tree. A scope is created for:
 *  - the top-level statement
 *  - each `(...)` group whose first non-trivial token is SELECT
 *    (subquery — gets its own table ref list)
 *  - each `name AS (...)` pair seen in a WITH preamble (CTE body)
 *  - each `(...)` group otherwise treated as transparent (parens only
 *    affect clause boundaries, not table-ref scope)
 *
 * Each scope tracks the table refs declared in *its own* FROM/JOIN clauses
 * and the boundaries of each clause (so cursor → clause is a binary search).
 */
interface Scope {
  start: number;
  end: number;
  /** True if this scope owns its own table ref list (subquery / CTE body /
   * top-level). False for transparent paren groups. */
  isQueryScope: boolean;
  parent: Scope | null;
  children: Scope[];
  /** Clause boundaries within THIS scope. Each entry: clause kind starting
   * at token index, ending at the next entry's start (or scope end). */
  clauseBoundaries: { offsetStart: number; offsetEnd: number; clause: CursorScope['clause'] }[];
  /** Table refs declared in THIS scope's FROM/JOIN clauses. */
  tableRefs: ScopeTableRef[];
  /** CTE names declared in THIS scope's WITH preamble. */
  cteNames: string[];
}

/**
 * Public entry point. Returns the cursor's scope or null if the input is too
 * pathological to classify (the caller should fall back to regex detection).
 */
export function findScopeAt(sql: string, offset: number): CursorScope | null {
  const tokens = tokenize(sql);
  // Ignore whitespace + comments for scope analysis — they don't carry meaning.
  const meaningful = tokens.filter(
    t => t.kind !== 'whitespace' && t.kind !== 'comment',
  );
  if (meaningful.length === 0) return { clause: 'generic', tableRefs: [], cteNames: [] };

  // Build the scope tree.
  const root: Scope = makeScope(0, sql.length, true, null);
  buildScopeTree(meaningful, 0, meaningful.length, root, sql.length);

  // Find the deepest scope whose [start, end) covers `offset`.
  const leaf = findDeepestScope(root, offset);
  if (!leaf) return null;

  // Walk up to find the nearest QUERY scope — the one whose tableRefs apply.
  let queryScope: Scope = leaf;
  while (queryScope && !queryScope.isQueryScope) {
    queryScope = queryScope.parent!;
  }

  // Find the clause within the leaf scope (or its nearest query ancestor) that
  // contains `offset`.
  const clauseScope = findClauseScopeFor(leaf, offset);

  // Walk parent chain to collect CTE names visible at this scope.
  const cteNames: string[] = [];
  let walker: Scope | null = queryScope;
  while (walker) {
    cteNames.push(...walker.cteNames);
    walker = walker.parent;
  }

  return {
    clause: clauseScope,
    tableRefs: queryScope.tableRefs,
    cteNames,
  };
}

function makeScope(
  start: number,
  end: number,
  isQueryScope: boolean,
  parent: Scope | null,
): Scope {
  return {
    start,
    end,
    isQueryScope,
    parent,
    children: [],
    clauseBoundaries: [],
    tableRefs: [],
    cteNames: [],
  };
}

/**
 * Single-pass tree builder. Walks `meaningful` tokens between [from, to),
 * pushing to `current` and recursing into paren groups.
 *
 * Keeps an "active clause" cursor for `current` and emits clause boundaries
 * whenever a top-level keyword changes the active clause.
 */
function buildScopeTree(
  tokens: SqlToken[],
  from: number,
  to: number,
  current: Scope,
  sqlEnd: number,
): void {
  let activeClause: CursorScope['clause'] = 'generic';
  let activeClauseStart = current.start;

  const flushClause = (offsetEnd: number) => {
    if (offsetEnd > activeClauseStart) {
      current.clauseBoundaries.push({
        offsetStart: activeClauseStart,
        offsetEnd,
        clause: activeClause,
      });
    }
  };

  let i = from;
  while (i < to) {
    const tok = tokens[i];

    // ── Paren group: subquery vs transparent ──
    if (tok.kind === 'lparen') {
      const { matchIndex, matchEnd } = findMatchingParen(tokens, i, to);
      const innerStart = tok.end;
      const innerEnd = matchIndex >= 0 ? tokens[matchIndex].start : sqlEnd;

      // Decide subquery vs transparent: peek first meaningful token after `(`.
      let firstIdx = i + 1;
      while (firstIdx < (matchIndex >= 0 ? matchIndex : to)) {
        if (tokens[firstIdx].kind !== 'whitespace' && tokens[firstIdx].kind !== 'comment') {
          break;
        }
        firstIdx++;
      }
      const isSubquery =
        firstIdx < (matchIndex >= 0 ? matchIndex : to) &&
        tokens[firstIdx].kind === 'keyword' &&
        (tokens[firstIdx].value === 'select' || tokens[firstIdx].value === 'with');

      const child = makeScope(innerStart, innerEnd, isSubquery, current);
      current.children.push(child);
      buildScopeTree(
        tokens,
        i + 1,
        matchIndex >= 0 ? matchIndex : to,
        child,
        sqlEnd,
      );

      // Also: if we're sitting after a CTE name+AS pair and the parent scope
      // has not yet logged this CTE, log it. Pattern: `<ident> AS (` where
      // the ident isn't a clause keyword.
      if (isSubquery) {
        // Look back two non-trivial tokens for `AS` and the name before it.
        let j = i - 1;
        if (j >= from && tokens[j].kind === 'keyword' && tokens[j].value === 'as') {
          j--;
          if (j >= from && tokens[j].kind === 'identifier') {
            current.cteNames.push(tokens[j].value);
          }
        }
      }

      i = matchIndex >= 0 ? matchIndex + 1 : to;
      continue;
    }

    if (tok.kind === 'rparen') {
      // Stray ) at this level — skip (shouldn't happen with matched parens).
      i++;
      continue;
    }

    // Statement terminator — flushes everything; we don't span statements.
    if (tok.kind === 'punct' && tok.value === ';') {
      flushClause(tok.start);
      activeClause = 'generic';
      activeClauseStart = tok.end;
      i++;
      continue;
    }

    // ── Clause-introducing keywords change the active clause ──
    if (tok.kind === 'keyword') {
      const next = nextMeaningful(tokens, i + 1, to);
      let newClause: CursorScope['clause'] | null = null;

      switch (tok.value) {
        case 'select':
          newClause = 'select';
          break;
        case 'from':
        case 'into':
        case 'update':
          newClause = 'table';
          break;
        case 'join':
          newClause = 'table';
          break;
        case 'on':
          newClause = 'join_on';
          break;
        case 'where':
        case 'set':
          newClause = 'column';
          break;
        case 'and':
        case 'or':
          // AND / OR don't change clause meaning — they continue whatever
          // the active clause is (typically 'column' inside WHERE).
          break;
        case 'having':
          newClause = 'having';
          break;
        case 'order':
          if (next && next.kind === 'keyword' && next.value === 'by') {
            newClause = 'orderby';
          }
          break;
        case 'group':
          if (next && next.kind === 'keyword' && next.value === 'by') {
            newClause = 'groupby';
          }
          break;
      }

      if (newClause !== null && newClause !== activeClause) {
        flushClause(tok.start);
        activeClause = newClause;
        activeClauseStart = tok.end; // clause body starts AFTER the keyword
      }

      // ── Capture table refs in FROM / JOIN / INSERT INTO / UPDATE positions ──
      // FROM and JOIN are the obvious ones. INSERT INTO and UPDATE also
      // declare table references that should be in scope for column suggestions
      // (e.g. when the user types `UPDATE users SET name = |` they want
      // `users` columns).
      const introducesTable =
        tok.value === 'from' ||
        tok.value === 'join' ||
        (tok.value === 'into' && // only after INSERT — bare INTO is rare but harmless
          previousMeaningful(tokens, i - 1, from)?.value === 'insert') ||
        tok.value === 'update';
      if (introducesTable && next && next.kind === 'identifier') {
        const ref = readTableRef(tokens, i + 1, to);
        if (ref) {
          current.tableRefs.push(ref.ref);
          i = ref.consumedTo;
          continue;
        }
      }
    }

    i++;
  }

  flushClause(current.end);
}

/** Find the next meaningful (non-whitespace, non-comment) token. */
function nextMeaningful(tokens: SqlToken[], from: number, to: number): SqlToken | null {
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (t.kind !== 'whitespace' && t.kind !== 'comment') return t;
  }
  return null;
}

/** Find the previous meaningful token (going leftward). */
function previousMeaningful(
  tokens: SqlToken[],
  fromIdx: number,
  minIdx: number,
): SqlToken | null {
  for (let i = fromIdx; i >= minIdx; i--) {
    const t = tokens[i];
    if (t.kind !== 'whitespace' && t.kind !== 'comment') return t;
  }
  return null;
}

/**
 * Match a `(` to its `)` at the same depth. Returns the index of the matching
 * `)` token in the meaningful-tokens array, or -1 if unmatched.
 */
function findMatchingParen(
  tokens: SqlToken[],
  lparenIdx: number,
  to: number,
): { matchIndex: number; matchEnd: number } {
  let depth = 1;
  for (let i = lparenIdx + 1; i < to; i++) {
    const t = tokens[i];
    if (t.kind === 'lparen') depth++;
    else if (t.kind === 'rparen') {
      depth--;
      if (depth === 0) return { matchIndex: i, matchEnd: t.end };
    }
  }
  return { matchIndex: -1, matchEnd: -1 };
}

/**
 * Read a table reference starting at the token AFTER FROM/JOIN. Handles
 * optional `schema.` prefix, optional `AS alias` or bare alias.
 *
 * Returns `null` if the next thing is a `(` (subquery — handled by recursion).
 */
function readTableRef(
  tokens: SqlToken[],
  from: number,
  to: number,
): { ref: ScopeTableRef; consumedTo: number } | null {
  // Skip whitespace/comment
  let i = from;
  while (i < to && (tokens[i].kind === 'whitespace' || tokens[i].kind === 'comment')) i++;
  if (i >= to) return null;
  if (tokens[i].kind === 'lparen') return null; // subquery — recursion handles it

  if (tokens[i].kind !== 'identifier') return null;

  let schemaName: string | null = null;
  let tableName = tokens[i].value;
  i++;

  // Optional `.tableName`
  if (
    i < to &&
    tokens[i].kind === 'punct' &&
    tokens[i].value === '.' &&
    i + 1 < to &&
    tokens[i + 1].kind === 'identifier'
  ) {
    schemaName = tableName;
    tableName = tokens[i + 1].value;
    i += 2;
  }

  // Optional alias: `AS alias` or bare `alias`
  let alias: string | null = null;
  let probeI = i;
  while (
    probeI < to &&
    (tokens[probeI].kind === 'whitespace' || tokens[probeI].kind === 'comment')
  ) {
    probeI++;
  }
  if (probeI < to) {
    if (tokens[probeI].kind === 'keyword' && tokens[probeI].value === 'as') {
      let aliasI = probeI + 1;
      while (
        aliasI < to &&
        (tokens[aliasI].kind === 'whitespace' || tokens[aliasI].kind === 'comment')
      ) {
        aliasI++;
      }
      if (aliasI < to && tokens[aliasI].kind === 'identifier') {
        alias = tokens[aliasI].value;
        i = aliasI + 1;
      }
    } else if (
      tokens[probeI].kind === 'identifier' &&
      // Don't gobble the next FROM-clause keyword as an alias
      !CLAUSE_KEYWORDS.has(tokens[probeI].value)
    ) {
      alias = tokens[probeI].value;
      i = probeI + 1;
    }
  }

  return { ref: { schemaName, tableName, alias }, consumedTo: i };
}

/** Recursively descend to find the smallest scope containing `offset`. */
function findDeepestScope(scope: Scope, offset: number): Scope | null {
  if (offset < scope.start || offset > scope.end) return null;
  for (const child of scope.children) {
    const found = findDeepestScope(child, offset);
    if (found) return found;
  }
  return scope;
}

/** Within a scope, find the clause that contains `offset`. */
function findClauseScopeFor(scope: Scope, offset: number): CursorScope['clause'] {
  for (const c of scope.clauseBoundaries) {
    if (offset >= c.offsetStart && offset <= c.offsetEnd) {
      return c.clause;
    }
  }
  return 'generic';
}
