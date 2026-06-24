# 04 · Query Processor / Compiler

> A first-class compiler is what separates "SQL editor with charts"
> from "self-service BI". DBExec concatenates strings today.

**Depends on:** Semantic Layer (02), Datasource (01)
**Unblocks:** Cache (05), Aggregate Awareness, AI Q&A, cross-dialect support
**Maturity:** 🔴 substring templating only

---

## 1. Industry baseline

| Tool | Compiler | Dialects |
|---|---|---|
| Looker | LookML → SQL | BigQuery, Snowflake, Postgres, MySQL, Redshift, Databricks, MSSQL, … |
| Metabase | MBQL → SQL | 18+ dialects |
| dbt MetricFlow | Semantic graph → SQL | All dialects dbt supports |
| Power BI | DAX → engine ops | Vertipaq / DirectQuery |
| Tableau | VizQL → SQL | All Tableau-supported drivers |

Every tool has an **AST** in the middle, not string concatenation.

## 2. DBExec today

- Saved SQL in `dataset.sql` is a literal string.
- `QueryBuilder` substitutes prompt values into a hand-authored WHERE.
- Snowflake quirks are handled by per-driver code in
  `shared/services/snowflakeConnection.ts`.
- No dialect adapter for everything else.

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| QP-G01 | AST representation | P0 |
| QP-G02 | Dialect adapters (PG/MySQL/MSSQL/Oracle/Snowflake/BQ/Databricks) | P0 |
| QP-G03 | Parameter / binding management | P0 |
| QP-G04 | Identifier quoting per dialect | P0 |
| QP-G05 | Time grain expression per dialect | P0 |
| QP-G06 | Pagination/limit/offset per dialect | P0 |
| QP-G07 | Window function shims for older MySQL | P1 |
| QP-G08 | UPPER vs LOWER folding awareness | P1 |
| QP-G09 | Cross-dataset joins | P1 |
| QP-G10 | "Explain" endpoint that returns the would-be SQL | P0 |
| QP-G11 | EXPLAIN/EXPLAIN ANALYZE wrapper for ops | P1 |
| QP-G12 | Safe-list of SQL nodes (no DDL, no DML, no procs) | P0 |

## 4. Target architecture

```
QueryRequest                           CompiledSQL
─────────────                          ───────────
{                                       {
  modelId,           ┌──────────────┐    sql,
  metrics,           │ Compiler      │   bindings,
  dimensions,        │  - parse req  │   cacheKey,
  filters,           │  - resolve    │   plan
  orderBy,           │  - inject RLS │  }
  limit              │  - optimise   │
} ─────────────────► │  - print      │ ─────────►
                     │  - cache key  │
                     └──────────────┘
                            │
                            ▼
                     dialect-specific
                       SQL string
```

### 4.1 AST node types

```ts
// shared/queryCompiler/ast.ts
export type QueryAst =
  | { kind: 'select';
      cols: ProjectionAst[];
      from: FromAst;
      where?: PredicateAst;
      groupBy?: number[];     // 1-based positional
      orderBy?: OrderAst[];
      limit?: number;
      offset?: number;
    };

export type ProjectionAst =
  | { kind: 'col'; name: string; alias?: string }
  | { kind: 'expr'; expr: string; alias: string }
  | { kind: 'agg'; agg: AggFn; expr: string; alias: string }
  | { kind: 'window'; agg: AggFn; expr: string;
      partitionBy?: string[]; orderBy?: OrderAst[]; frame?: WindowFrame; alias: string }
  | { kind: 'date-trunc'; grain: TimeGrain; expr: string; alias: string };

export type FromAst =
  | { kind: 'dataset'; sql: string }
  | { kind: 'aggregate-table'; schema?: string; table: string }
  | { kind: 'physical'; schema?: string; table: string };

export type PredicateAst =
  | { op: 'eq'|'ne'|'gt'|'lt'|'gte'|'lte'; col: string; value: unknown }
  | { op: 'in'|'not_in'; col: string; values: unknown[] }
  | { op: 'between'; col: string; lo: unknown; hi: unknown }
  | { op: 'like'|'ilike'; col: string; pattern: string }
  | { op: 'is_null'|'is_not_null'; col: string }
  | { op: 'and'|'or'; clauses: PredicateAst[] }
  | { op: 'raw'; sql: string; bindings?: unknown[] };

export type AggFn =
  'sum'|'count'|'count_distinct'|'avg'|'min'|'max'|'median'|'stddev'|'variance';

export type TimeGrain = 'second'|'minute'|'hour'|'day'|'week'|'month'|'quarter'|'year';
```

### 4.2 Dialect interface

```ts
export interface DialectAdapter {
  readonly name: 'postgres'|'mysql'|'mariadb'|'mssql'|'oracle'|'snowflake'|'bigquery'|'databricks';
  quoteIdent(s: string): string;
  paramPlaceholder(idx: number): string;       // $1 / ? / :1
  dateTrunc(grain: TimeGrain, expr: string): string;
  cast(expr: string, type: string): string;
  limitOffset(limit?: number, offset?: number): string;
  aggFn(fn: AggFn, expr: string): string;
  raw(node: PredicateAst & { op: 'raw' }): string;
  print(ast: QueryAst, bindings: unknown[], rls: string[]): string;
}
```

### 4.3 Safe-list pre-check

Block DDL/DML/procs at the parser stage:

```ts
// shared/queryCompiler/safelist.ts
import { parse } from 'pgsql-ast-parser';

const FORBIDDEN = new Set([
  'create', 'drop', 'alter', 'truncate', 'insert', 'update', 'delete',
  'grant', 'revoke', 'merge', 'lock', 'vacuum', 'analyze',
  'commit', 'rollback', 'savepoint',
]);

export function assertSafeSql(sql: string) {
  let ast;
  try { ast = parse(sql); }
  catch (e) { throw new BadRequestError(`Invalid SQL: ${(e as Error).message}`); }
  for (const stmt of ast) {
    if (FORBIDDEN.has(stmt.type)) {
      throw new BadRequestError(`Statement type "${stmt.type}" is not allowed.`);
    }
  }
}
```

Run on every user-authored SQL on save AND on preview.

### 4.4 EXPLAIN endpoint

`POST /query/explain` returns the compiled SQL + execution plan
without running it. Critical for debug + AI agents.

## 5. Test plan

- **QP-H-01** — simple select returns expected SQL on PG dialect
- **QP-H-02** — date-trunc month works on PG / MySQL / MSSQL / Snowflake / BigQuery
- **QP-H-03** — limit/offset works on all
- **QP-N-01** — DROP TABLE in saved SQL → safelist rejects
- **QP-N-02** — multi-statement input → reject
- **QP-N-03** — semicolon injection in identifier → rejected by quoter
- **QP-E-01** — empty dimensions → no GROUP BY emitted
- **QP-E-02** — empty filters → no WHERE emitted
- **QP-E-03** — 0 rows returned → empty payload, columns still present

## 6. Migration & rollout

1. Land the AST + Postgres dialect first (covers the majority).
2. Migrate **only the semantic-query endpoint** to the compiler;
   existing user-SQL paths still use the raw path.
3. Add MSSQL / Snowflake / Oracle / BigQuery / Databricks adapters one
   per release.
4. Once every dialect is covered, route ALL dataset preview through
   the compiler.

## 7. Open questions

- Cross-dataset joins → defer; depends on a federated execution layer
  (PrestoDB / Trino) or pre-materialisation.
- Should we adopt SQLGlot (Python) as a transpiler instead of writing
  per-dialect code? Pro: covers 20+ dialects. Con: Python boundary,
  added latency. Recommend hand-written for top 4 dialects + SQLGlot
  fallback for niche.

## Appendix · Review additions

- **Query plan** as a separate artefact (not just SQL).
- **Streaming results** via cursor for large queries.
- **Cancel-by-query-id** semantics tied to `pg_cancel_backend` etc.
- **Parameterised query AST cache**.
- **Dialect-specific identifier folding** awareness (Snowflake UPPER,
  Postgres lower).
- **NULLS FIRST / NULLS LAST** per dialect.
- **Date arithmetic** (`INTERVAL '1 day'` vs `DATEADD`).
- **Limit pushdown** into subquery.
- **CTE vs subquery preservation** per dialect (some optimisers
  inline CTEs poorly).

### New endpoints

- `POST /query/cancel/:id`
- `POST /query/explain-analyze`
- `GET /query/stats` — slow query log per org

### Tests

- QP-CAN-H-01 — cancel mid-flight → 499
- QP-NULL-H-01 — `NULLS LAST` rendered per dialect
- QP-INT-H-01 — interval arithmetic correct on all dialects
- QP-PUSH-H-01 — limit pushed into subquery, not wrapped
