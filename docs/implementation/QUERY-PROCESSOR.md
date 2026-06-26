# Query processor / dialect compiler

> Implementation companion to research module 04. The query
> processor is the single point that turns a `SemanticIntent`
> (or a raw dataset SQL + filters) into the *exact bytes* sent
> to a warehouse. It enforces RLS, applies the dialect's quirks,
> binds parameters, and emits canonical SQL for the cache key.

**Status:** 🟡 partial in product (a Postgres-only path exists
buried in dataset preview).
**Effort:** L — initial multi-dialect adapter set is 3 weeks;
each new dialect is then 3–5 days.

---

## 0. Problem statement

DBExec connects to Postgres today. Customers ask for Snowflake,
BigQuery, MySQL, MSSQL, Redshift, Databricks. Every one has
quirks:

- Postgres: `"identifiers in double quotes"`, `||` for concat.
- MySQL: `` `identifiers in backticks` ``, `CONCAT(a,b)` for concat,
  no `FULL OUTER JOIN`.
- MSSQL: `[identifiers in brackets]`, `+` for concat, no
  `LIMIT` (uses `TOP n` or `OFFSET … FETCH`).
- BigQuery: backticks, `CONCAT()`, partitioned tables need
  `_PARTITIONTIME` filters or you'll scan the universe.
- Snowflake: case-folds identifiers to UPPER by default; quoted
  identifiers preserve case.
- Redshift: most-recently-PG, but `DISTKEY` / `SORTKEY` matter.

Without a dialect layer we either (a) write Postgres SQL and
hope, (b) write per-warehouse code paths everywhere, or (c) use
an ORM that doesn't speak warehouse SQL idioms. Pick the only
correct option: a dialect-adapter layer.

---

## 1. Architecture

```
            ┌──────────────────────────┐
            │   SemanticIntent /        │
            │   dataset SQL + filters   │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  IR Builder              │
            │  (semantic compiler or   │
            │   dataset SQL parser)    │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  Intermediate Plan       │
            │  (dialect-neutral AST)   │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  RLS / Column-mask Hook  │
            │  (module 09)              │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  Dialect Renderer        │
            │   pg / mysql / mssql /   │
            │   bq / snowflake / rs /  │
            │   databricks             │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  Param Binder            │
            │  (dialect-specific       │
            │   placeholder style)     │
            └──────────────────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │  Canonicaliser           │
            │  (stable identifier      │
            │   order + sort + hash)   │
            └──────────────────────────┘
                       │
                       ▼
              CompiledQuery { sql, params, hash, planMetadata }
```

The IR is the contract between layers. Above the IR, semantic
intent or dataset SQL; below the IR, only dialect-specific
rendering happens.

---

## 2. The IR (intermediate representation)

```typescript
export interface Plan {
  kind:    'query';
  select:  SelectItem[];
  from:    FromNode;             // tree of tables + joins
  where:   ExprNode[];           // implicit AND
  groupBy: ColumnRef[];
  having:  ExprNode[];
  orderBy: Array<{ expr: ExprNode; dir: 'asc' | 'desc'; nulls?: 'first' | 'last' }>;
  limit?:  number;
  offset?: number;
  cte?:    Array<{ name: string; plan: Plan }>;
  hints?:  Record<string, unknown>;  // dialect-specific, e.g. { bq: { partitionFilter: '...' } }
}

export interface SelectItem {
  alias: string;
  expr:  ExprNode;
  origin?: { kind: 'dim' | 'metric' | 'raw'; id?: string };  // for telemetry
}

export type ExprNode =
  | { type: 'col';    table: string; column: string; quoteOverride?: boolean }
  | { type: 'lit';    value: string | number | boolean | null | Date; dataType?: string }
  | { type: 'param';  name: string }
  | { type: 'fn';     name: string; args: ExprNode[]; over?: WindowSpec }
  | { type: 'cast';   inner: ExprNode; toType: string }
  | { type: 'case';   when: Array<[ExprNode, ExprNode]>; else?: ExprNode }
  | { type: 'op';     op: BinaryOp; left: ExprNode; right: ExprNode }
  | { type: 'in';     left: ExprNode; values: ExprNode[]; negate?: boolean }
  | { type: 'between'; expr: ExprNode; lo: ExprNode; hi: ExprNode }
  | { type: 'subquery'; plan: Plan };
```

Every expression in the IR is a tree — no SQL strings. The
dialect renderer is the only thing that produces strings.

---

## 3. Dialect adapter contract

```typescript
export interface DialectAdapter {
  name: string;
  quoteIdent(s: string): string;                                // identifiers
  quoteString(s: string): string;                               // string literals
  paramPlaceholder(name: string, position: number): string;     // $1, ?, @p1, etc.
  renderFn(name: string, args: string[]): string | null;        // null = use default
  renderLimit(limit: number, offset: number | undefined): string;
  renderConcat(parts: string[]): string;
  renderDateBucket(expr: string, bucket: TimeBucket): string;   // 'month' → DATE_TRUNC('month', …) etc.
  renderPercentile(expr: string, p: number, method: 'discrete' | 'continuous'): string;
  renderApproxDistinct(expr: string): string;
  identifierCaseFolding: 'preserve' | 'upper' | 'lower';
  supportsFullOuter: boolean;
  supportsArrayAgg: boolean;
  supportsLateralJoin: boolean;
  maxIdentifierLength: number;
  defaultStringConcatOp: '||' | '+' | 'CONCAT';
  hintsRenderer?(hints: Plan['hints']): string;                  // dialect-specific hint comments
}
```

Adapter registry:

```typescript
// src/services/query/adapters/index.ts
import { postgresAdapter } from './postgres';
import { mysqlAdapter } from './mysql';
import { mssqlAdapter } from './mssql';
import { bigqueryAdapter } from './bigquery';
import { snowflakeAdapter } from './snowflake';
import { redshiftAdapter } from './redshift';
import { databricksAdapter } from './databricks';

export const adapters: Record<string, DialectAdapter> = {
  postgres:   postgresAdapter,
  mysql:      mysqlAdapter,
  mssql:      mssqlAdapter,
  bigquery:   bigqueryAdapter,
  snowflake:  snowflakeAdapter,
  redshift:   redshiftAdapter,
  databricks: databricksAdapter,
};

export function adapterFor(dsType: string): DialectAdapter {
  const a = adapters[dsType];
  if (!a) throw new Error(`No dialect adapter for ${dsType}`);
  return a;
}
```

### 3.1 Postgres adapter (canonical reference)

```typescript
// src/services/query/adapters/postgres.ts
import { DialectAdapter } from '../types';

export const postgresAdapter: DialectAdapter = {
  name: 'postgres',
  quoteIdent: (s) => `"${s.replace(/"/g, '""')}"`,
  quoteString: (s) => `'${s.replace(/'/g, "''")}'`,
  paramPlaceholder: (_n, pos) => `$${pos}`,
  renderFn: (name, args) => {
    // dialect-specific overrides; null falls back to FN(args...)
    if (name === 'EXTRACT_YEAR') return `EXTRACT(YEAR FROM ${args[0]})`;
    if (name === 'EXTRACT_MONTH') return `EXTRACT(MONTH FROM ${args[0]})`;
    return null;
  },
  renderLimit: (limit, offset) =>
    offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`,
  renderConcat: (parts) => parts.join(' || '),
  renderDateBucket: (expr, bucket) => `DATE_TRUNC('${bucket}', ${expr})`,
  renderPercentile: (expr, p, method) =>
    method === 'discrete'
      ? `PERCENTILE_DISC(${p}) WITHIN GROUP (ORDER BY ${expr})`
      : `PERCENTILE_CONT(${p}) WITHIN GROUP (ORDER BY ${expr})`,
  renderApproxDistinct: (expr) => `COUNT(DISTINCT ${expr})`, // pg has no native HLL in core
  identifierCaseFolding: 'lower',
  supportsFullOuter: true,
  supportsArrayAgg: true,
  supportsLateralJoin: true,
  maxIdentifierLength: 63,
  defaultStringConcatOp: '||',
};
```

### 3.2 BigQuery adapter highlights

```typescript
// src/services/query/adapters/bigquery.ts
import { DialectAdapter } from '../types';

export const bigqueryAdapter: DialectAdapter = {
  name: 'bigquery',
  quoteIdent: (s) => `\`${s.replace(/`/g, '\\`')}\``,
  quoteString: (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
  paramPlaceholder: (n) => `@${n}`,
  renderFn: () => null,
  renderLimit: (limit, offset) =>
    offset != null ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`,
  renderConcat: (parts) => `CONCAT(${parts.join(', ')})`,
  renderDateBucket: (expr, bucket) => `TIMESTAMP_TRUNC(${expr}, ${bucket.toUpperCase()})`,
  renderPercentile: (expr, p) => `APPROX_QUANTILES(${expr}, 100)[OFFSET(${Math.round(p * 100)})]`,
  renderApproxDistinct: (expr) => `APPROX_COUNT_DISTINCT(${expr})`,
  identifierCaseFolding: 'preserve',
  supportsFullOuter: true,
  supportsArrayAgg: true,
  supportsLateralJoin: false,         // UNNEST instead
  maxIdentifierLength: 1024,
  defaultStringConcatOp: 'CONCAT',
  hintsRenderer: (hints) => {
    // Force a partition filter so we don't scan the universe
    if (hints?.bq && (hints.bq as any).partitionFilter) {
      return `-- partition filter: ${(hints.bq as any).partitionFilter}\n`;
    }
    return '';
  },
};
```

### 3.3 Snowflake adapter highlight: case folding

Snowflake folds unquoted identifiers to UPPER. If the dataset
column is `customer_id` in lowercase in metadata but the
warehouse stores it as `CUSTOMER_ID`, we **always** quote so
the renderer is deterministic. The adapter sets
`identifierCaseFolding: 'upper'` and the IR resolver normalises
to upper at IR-build time, so quotes pass through losslessly.

---

## 4. RLS hook

`applyRls(plan, user)` is the single place the row-level
security predicates get woven into the plan. It runs at IR
time, *before* dialect rendering, so the adapter sees the same
shape regardless of who's running the query.

```typescript
export async function applyRls(
  plan: Plan,
  user: AuthUser,
  ctx: { connection: Connection },
): Promise<Plan> {
  // Walk plan.from, collecting every dataset_id used
  const dsIds = collectDatasetIds(plan.from);

  for (const dsId of dsIds) {
    const rules = await loadRlsRules(ctx.connection, dsId, user);
    for (const rule of rules) {
      const predicate = buildRlsPredicate(rule, user);
      plan.where.push(predicate);
    }
  }

  // Column masking is a SELECT-rewrite, not a WHERE predicate
  plan.select = plan.select.map(s => maskIfRequired(s, user, dsIds));

  return plan;
}
```

If RLS evaluates to "no rows" (e.g. user has no group membership
for any rule on this dataset), we *don't* throw — we add `1 = 0`
to WHERE. The dashboard renders empty, with the standard
"No data accessible" placeholder. Throwing here would crash
every dashboard for users with partial access.

---

## 5. Canonicaliser (cache-key shape)

Two semantically identical plans must produce identical SQL
strings so the cache key (module 05) is stable.

```typescript
export function canonicaliseSql(sql: string, params: ParamBinding[]): {
  canonical: string;
  hash: string;
} {
  // 1. Re-parse the rendered SQL into a normalisation AST
  // 2. Sort SELECT items by alias (already sorted at IR build time but
  //    belt-and-braces)
  // 3. Sort WHERE conjuncts lexicographically
  // 4. Collapse whitespace
  // 5. Replace literal parameters with $1, $2, … by binding-order
  const canonical = renormalise(sql);
  const hash = sha256(canonical + JSON.stringify(params.map(p => p.value)));
  return { canonical, hash };
}
```

The hash includes both the SQL shape and the bound values, so
two users running the "same query" but with different
parameters get different cache entries — correct.

---

## 6. API surface

```
POST /query/execute           { intent | sql, datasourceId, parameters }
POST /query/compile           { intent | sql, datasourceId }   → preview SQL
POST /query/explain           { intent | sql, datasourceId }   → engine EXPLAIN plan
POST /query/cancel/:queryId
```

Internal-only (called by 06, 08, 13, 15, 25):

```
queryProcessor.execute(intent, ctx)
queryProcessor.compile(intent, ctx)
queryProcessor.dryRunRowCount(intent, ctx)   // SELECT 1 wrapper or engine-specific
```

---

## 7. Controller stub

```typescript
// src/controllers/query/execute.ts
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { QUERY_MSG, GENERIC } from '../../constants/response.messages';
import { adapterFor } from '../../services/query/adapters';
import { buildPlan } from '../../services/query/planBuilder';
import { applyRls } from '../../services/query/rlsHook';
import { render } from '../../services/query/render';
import { canonicaliseSql } from '../../services/query/canonicalise';
import { cache } from '../../services/cache';
import { runQuery } from '../../services/query/runner';
import Logger from '../../utility/logger';

const executeQuery = async (req: Request, res: Response) => {
  const { intent, datasourceId, parameters, useCache = true } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  const startedAt = Date.now();

  try {
    const datasource = await connection.getRepository('Datasource')
      .findOne({ where: { id: datasourceId } });
    if (!datasource) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.NOT_FOUND, QUERY_MSG.DATASOURCE_NOT_FOUND);
    }

    const adapter = adapterFor(datasource.type);
    const user = await loadAuthUser(connection, loggedInId);

    // 1. IR
    let plan = await buildPlan(intent, { connection, datasourceId, parameters });
    // 2. RLS
    plan = await applyRls(plan, user, { connection });
    // 3. Render
    const { sql, params } = render(plan, adapter);
    // 4. Canonicalise (cache key)
    const { canonical, hash } = canonicaliseSql(sql, params);

    // 5. Cache lookup
    if (useCache) {
      const cached = await cache.get(hash);
      if (cached) {
        await master_db_connection.close();
        return sendResponse(res, true, CODE.SUCCESS, QUERY_MSG.OK, {
          ...cached, fromCache: true, queryHash: hash,
        });
      }
    }

    // 6. Execute against the datasource
    const result = await runQuery(datasource, canonical, params, {
      timeoutMs: 60_000,
      maxRows: 100_000,
      correlationId: req.headers['x-correlation-id'] as string,
    });

    // 7. Cache the result (TTL configurable, default 5 min)
    if (useCache) await cache.set(hash, result, { ttlSec: 300 });

    Logger.info(JSON.stringify({
      evt: 'query.execute', user_id: loggedInId, datasource: datasource.type,
      compile_ms: 0, exec_ms: result.execMs, rows: result.rowCount,
      total_ms: Date.now() - startedAt, cache: false, hash,
    }));

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, QUERY_MSG.OK, {
      ...result, fromCache: false, queryHash: hash,
    });
  } catch (err: any) {
    Logger.error(`Query execute failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default executeQuery;
```

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_query_compile_ms` | histogram | `dialect` | compile latency |
| `dbexec_query_execute_ms` | histogram | `dialect`, `cache` | execute latency |
| `dbexec_query_rows_returned` | histogram | `dialect` | row count distribution |
| `dbexec_query_cache_hit_total` | counter | `dialect` | cache hit rate |
| `dbexec_query_canceled_total` | counter | `reason` | timeouts, manual cancel |
| `dbexec_query_failed_total` | counter | `dialect`, `code` | failures by SQLSTATE/code |
| `dbexec_query_rls_predicates_added` | histogram | `dataset` | how many RLS rules per query |

Tracing: a root span `query.execute` with child spans
`query.build_plan`, `query.apply_rls`, `query.render`,
`query.cache_lookup`, `query.run`. The hash is a span attribute
so you can correlate a slow query in production to the exact
canonical SQL.

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| SQL injection via filter value | All values bound as parameters; identifiers come from semantic IDs not user strings |
| SQL injection via dataset SQL editor | Dataset SQL is parsed (sqlite-parser-style AST) on save; only SELECT statements with single statement (`;` rejected) allowed; `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, `ALTER` rejected |
| RLS bypass via dataset SQL CTE that overrides table refs | RLS hook walks the parsed AST not the string; finds every relation reference regardless of CTE shadowing |
| Cross-dialect smuggling (writing PG-specific syntax that runs on a customer's BQ) | IR is dialect-neutral; the renderer is the only place dialect appears |
| Resource exhaustion via massive result | `maxRows` enforced at runner; on excess, return first N + `truncated: true` flag |
| Long-running query DoS | Per-query timeout (configurable, default 60s); admin can cancel via `/cancel` |
| Side-channel via execution time | All errors caught and normalised; users never see warehouse-internal error strings |
| Connection pool exhaustion | Per-datasource pool with bounded size; queue with timeout when full |
| Cost runaway on BQ / Snowflake | Module 27 cost observability dry-run gate; this module exposes the hook |
| Stale RLS context (user role changed mid-session) | RLS resolved per-request, not cached across requests |

---

## 10. Operational runbook

**Symptom: queries slow.**
1. Pull `dbexec_query_execute_ms` p95 by dialect. Spike in one
   dialect = warehouse issue, not our compiler.
2. Pull p95 by `cache=false`. If cache hit rate dropped, cache
   layer is the issue (module 05).
3. For one specific slow query: open the canonical SQL from
   the audit log + run `EXPLAIN` against the source.

**Symptom: cache hit rate falling.**
1. Check `dbexec_query_canonical_diff_total` counter (added in
   v2) — counts cases where two plans differed only in
   whitespace or alias ordering. Spike = canonicaliser bug.

**Symptom: customer reports "wrong rows".**
1. Get the `queryHash` from the dashboard request — it's in
   every audit row.
2. Look up canonical SQL.
3. Diff against what they expected. 9 times out of 10: RLS
   predicate the user didn't realise was applying.

**Symptom: new dialect rolled out, errors on JOIN.**
1. `supportsFullOuter` / `supportsLateralJoin` may be wrong on
   the adapter. Check Reference docs and flip the bool.
2. Until fix: the IR builder degrades FULL OUTER to UNION ALL
   of LEFT + RIGHT (correctness preserved, performance trade).

---

## 11. Performance budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| buildPlan | 5 ms | 15 ms | 50 ms |
| applyRls | 3 ms | 10 ms | 30 ms |
| render | 1 ms | 5 ms | 20 ms |
| canonicalise | 2 ms | 8 ms | 25 ms |
| Total compile (above 4) | 15 ms | 50 ms | 150 ms |
| Execute (depends on warehouse — track separately) | — | — | 60 s default |
| Cache lookup | 1 ms | 5 ms | 50 ms |

Cache hit rate target: 60% steady state on dashboard tile
loads. Cold-start a new dashboard: 0% for first viewer, 90%+
for every subsequent viewer within TTL.

---

## 12. Migration & rollout

1. **Migrations:** none — this is service code, not schema.
2. **Adapter rollout:** ship Postgres first (already there in
   shape, refactor into the new adapter). Then MySQL, MSSQL,
   BigQuery, Snowflake, Redshift, Databricks in priority order.
3. **Feature flag per dialect:** `feature.dialect.bigquery`
   etc. Lets us ship adapters one at a time, beta-test with
   one customer, then turn on for all.
4. **Backfill of cache shape:** the canonicaliser may produce
   slightly different bytes than the current ad-hoc path. On
   deploy, invalidate the cache (one-time) to avoid stale-shape
   hits.
5. **Telemetry first:** ship metrics before the new path so the
   diff is observable.

---

## 13. Open questions

1. **CTE common base** — should the compiler factor a shared
   sub-plan across visuals on a dashboard? Big perf win but
   non-trivial. Defer.
2. **Federated queries** — joining two datasources. Defer;
   needs a planner that knows where each table lives.
3. **Streaming results** — for huge exports we want cursor
   streaming, not load-all. Live in module 13 — this module
   just exposes the underlying connection.

---

## 14. References

- [04-query-processor.md](../research/modules/04-query-processor.md)
- [02-semantic-layer.md](../research/modules/02-semantic-layer.md)
- [05-cache-materialisation.md](../research/modules/05-cache-materialisation.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [27-cost-observability.md](../research/modules/27-cost-observability.md)
- BigQuery legacy vs standard SQL docs
- Snowflake identifier case rules docs
- PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` docs
