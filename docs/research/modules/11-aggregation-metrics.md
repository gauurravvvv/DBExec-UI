# 11 · Aggregation & Metrics

> The math layer. Charts show numbers; this module decides what
> "the number" actually means. Most BI bugs aren't in the
> visualisation — they're in the metric definition.
>
> Sister module: [02 · Semantic Layer](02-semantic-layer.md) defines
> the *containers* (`SemMetric` rows). This doc dives into the
> *contents*: every metric kind, the SQL it compiles to, the edge
> cases that break in production.

**Depends on:** Semantic Layer (02), Query Compiler (04)
**Unblocks:** Analysis builder (06), Filters (07), Dashboards (08), AI (25)
**Maturity:** 🔴 only `simple` and `ratio` kinds in production today

---

## 1. Industry baseline

| Tool | Metric type system | Distinguishing trait |
|---|---|---|
| **Looker** | `measure: { type: sum }`, `type: count_distinct`, `type: percentile`, `derived_table` for cumulative | Type is a closed list; the LookML compiler picks the SQL per dialect. |
| **dbt MetricFlow / Cube.js** | `simple`, `ratio`, `derived`, `cumulative`, `conversion`. Cube adds `count_distinct_approx`. | First to formalise `conversion` as a first-class metric kind. |
| **Power BI (DAX)** | Open expression language — `SUM`, `DISTINCTCOUNT`, `CALCULATE` w/ filter context | Most powerful; most foot-guns. |
| **Tableau LOD** | `{ FIXED dim : agg }` syntax for explicit aggregation scope | Resolves the "totals don't add up" problem by giving the user a knob. |
| **Sigma** | "Worksheet calc" + SQL custom metric | Mixed visual/text authoring. |
| **Mode / Metabase** | Mostly SQL, metric concept is light | Less abstraction means more SQL copy-paste. |

**The lesson DBExec needs to internalise:** a metric is not a number,
it's a *named function* `f(filter_context, time_grain, group_by) → number`.
The kind determines which arguments are valid and how the SQL
materialises. Most production bugs ("why doesn't year total equal
sum of months?") come from treating a non-additive function as if it
were additive.

## 2. DBExec today

- `sem_metric` table with `kind` enum carrying `simple` and
  `ratio` only. `derived`, `cumulative`, `conversion` are in the
  enum but the compiler doesn't branch on them.
- Compiler at `src/shared/services/semanticCompiler.ts`
  (sketched, not finished) renders `simple` as
  `<agg>(<expr>)` and `ratio` as `SUM(num) / NULLIF(SUM(den), 0)`.
- No additive / semi-additive flags. No window functions. No
  percentile metrics.
- FE metric editor offers a free-text expression and a kind picker;
  there's no schema-validated metric author form.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| MET-G01 | `derived` metric (math over other metrics) | P0 | M |
| MET-G02 | `cumulative` metric (running totals, MTD/QTD/YTD) | P0 | M |
| MET-G03 | `conversion` metric (event-A → event-B within window) | P0 | L |
| MET-G04 | Non-additive flag (refuse to sum across windows) | P0 | S |
| MET-G05 | Semi-additive (`LAST`/`FIRST`/`AVG` over time) | P1 | M |
| MET-G06 | Period-over-period (`prior_period`, `prior_year`) | P1 | M |
| MET-G07 | Approx distinct (`HLL` on Snowflake/BQ) | P1 | M |
| MET-G08 | Window functions (`RANK`, `NTILE`, `LAG`, `LEAD`) | P1 | M |
| MET-G09 | Percentile with dialect-correct SQL | P1 | S |
| MET-G10 | Cross-metric "virtual" expressions on the FE | P1 | M |
| MET-G11 | Metric format strings beyond currency/percent | P2 | S |
| MET-G12 | Metric description tooltip on legend hover | P2 | S |
| MET-G13 | "Allowed aggregations" whitelist per metric | P2 | S |
| MET-G14 | Snapshot-stable metric (metric value frozen at publish) | P2 | M |

## 4. Target architecture

### 4.1 Metric taxonomy — the closed list

Every metric is exactly one of these kinds. Adding a new kind is a
schema migration + compiler branch + UI form — not a freeform
field.

| Kind | What it computes | Example | Compile shape |
|---|---|---|---|
| `simple` | One aggregation over one expression | `SUM(revenue)`, `COUNT(DISTINCT user_id)` | `<agg>(<expr>)` |
| `ratio` | Numerator / denominator | `revenue_per_user = SUM(revenue) / COUNT(DISTINCT user_id)` | `SUM(num) / NULLIF(SUM(den), 0)` (null-safe) |
| `derived` | Math over other metrics | `gross_margin = revenue - cogs` | references resolved to their compiled SQL, composed in outer SELECT |
| `cumulative` | Running total with a reset boundary | `mtd_revenue` | `SUM() OVER (PARTITION BY <reset> ORDER BY <time> ROWS UNBOUNDED PRECEDING)` |
| `conversion` | Funnel over events with a window | `signup_to_paid_in_7d` | two CTEs (event A, event B), LEFT JOIN, conditional COUNT(DISTINCT) |
| `prior_period` | Same metric shifted by one period | `revenue_prior_month` | `LAG(<metric>) OVER (ORDER BY <time>)` OR self-join (depending on grouping) |
| `window` | Rank / ntile / lag / lead | `revenue_rank` | `<window_fn>() OVER (PARTITION BY ... ORDER BY ...)` |
| `percentile` | p50/p90/p95/p99 | `p95_latency` | `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY <expr>)` (dialect-aware) |
| `approx_distinct` | Approximate distinct count | `approx_unique_users` | `APPROX_COUNT_DISTINCT(user_id)` on Snowflake/BQ; `COUNT(DISTINCT user_id)` falls back on Postgres |

**Closed-list reasoning.** Every kind has different SQL, different
validation rules, different FE form. An open `expression` field means
every customer SQL injection vector and every "this metric is wrong"
support ticket gets a different debug path. Closed list = N debug
paths, fixed.

### 4.2 Entity additions

```ts
// src/shared/db/shared_entity/sem_metric.entity.ts
@Entity('sem_metric')
@Index(['semanticModelId', 'name'], { unique: true })
export class SemMetric {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') semanticModelId!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ length: 128, nullable: true }) label?: string;
  @Column({ length: 32 }) kind!:
    | 'simple' | 'ratio' | 'derived' | 'cumulative'
    | 'conversion' | 'prior_period' | 'window'
    | 'percentile' | 'approx_distinct';

  // simple / approx_distinct / percentile
  @Column('text', { nullable: true }) expression?: string;
  @Column({ length: 16, nullable: true }) agg?:
    'sum' | 'count' | 'count_distinct' | 'avg'
    | 'min' | 'max' | 'median' | 'stddev' | 'variance';

  // ratio
  @Column('uuid', { nullable: true }) numeratorId?: string;
  @Column('uuid', { nullable: true }) denominatorId?: string;

  // derived
  @Column('text', { nullable: true }) derivedExpression?: string;
  @Column('uuid', { array: true, nullable: true }) referencedMetricIds?: string[];

  // cumulative
  @Column({ length: 16, nullable: true }) windowReset?:
    'none' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'fiscal_year';
  @Column({ length: 32, nullable: true }) cumulativeTimeColumn?: string;

  // conversion
  @Column('jsonb', { nullable: true }) conversion?: {
    eventColumn: string;
    eventA: string;
    eventB: string;
    entityColumn: string;     // user_id, account_id, ...
    timeColumn: string;       // event_ts
    windowDays: number;
    requireOrder?: boolean;   // B must be strictly after A
  };

  // prior_period
  @Column({ length: 16, nullable: true }) priorPeriodOffset?:
    'day' | 'week' | 'month' | 'quarter' | 'year';

  // window
  @Column('jsonb', { nullable: true }) windowConfig?: {
    fn: 'rank' | 'dense_rank' | 'row_number' | 'ntile' | 'lag' | 'lead';
    partitionBy?: string[];
    orderBy: Array<{ col: string; dir: 'asc' | 'desc' }>;
    ntileBuckets?: number;
    offset?: number;          // for lag / lead
  };

  // percentile
  @Column('numeric', { nullable: true }) percentileQ?: number;  // 0–1

  // Additive flags — see §4.3
  @Column({ default: true }) isAdditive!: boolean;
  @Column({ default: false }) isSemiAdditive!: boolean;
  @Column({ length: 16, nullable: true }) semiAdditiveFunc?:
    'LAST' | 'FIRST' | 'AVG';

  // Display / format
  @Column({ length: 32, nullable: true }) format?: string;
  @Column('text', { nullable: true }) description?: string;
  @Column({ length: 16, nullable: true }) valueType?:
    'currency' | 'percent' | 'count' | 'duration' | 'bytes' | 'plain';
  @Column({ default: false }) hidden!: boolean;

  // Compile-time guard rails
  @Column('text', { array: true, nullable: true }) allowedAggregations?: string[];
  @Column('text', { array: true, nullable: true }) allowedDimensions?: string[];
}
```

### 4.3 Additive vs semi-additive vs non-additive

**Why this distinction matters.** Imagine `unique_users` as a metric.
For January it's 1,200. For February it's 1,500. For Q1, **it's
not 2,700.** Some users count in both months. The "right" answer
is `COUNT(DISTINCT user_id) WHERE month IN (Jan, Feb, Mar)` — but
the chart already computed January and February in isolation.
Naïvely summing produces a wrong total that the user has no way to
verify.

The compiler must know:

- **Additive** (`SUM`, `COUNT`): can be added across any
  partitioning. Year total = sum of months = sum of quarters.
- **Semi-additive** (`balance`, `headcount`): can be aggregated
  across non-time dimensions (region, product) but NOT across time.
  Year-end balance = last-month balance, not sum. Looker calls
  these "tally measures".
- **Non-additive** (`AVG`, `COUNT DISTINCT`, percentiles, ratios):
  must be recomputed at the grouping the user asked for. The
  compiler cannot reuse a precomputed monthly value to build a
  yearly one.

```ts
// Resolution algorithm at query compile time
function resolveAggregation(metric: SemMetric, groupBy: string[]) {
  const groupsAcrossTime = groupBy.some(g =>
    semanticModel.dimensions.find(d => d.name === g && d.type === 'time'),
  );

  if (metric.isAdditive) return 'SUM_OF_PRECOMPUTED';
  if (metric.isSemiAdditive && !groupsAcrossTime) return 'SUM_OF_PRECOMPUTED';
  if (metric.isSemiAdditive && groupsAcrossTime) {
    return `${metric.semiAdditiveFunc}_OVER_TIME`;
  }
  return 'RECOMPUTE_AT_GROUP';   // non-additive
}
```

Without this, "totals don't add up" is the #1 BI support ticket
forever.

### 4.4 Compiler — one function per kind

```ts
// src/shared/services/metricCompiler.ts
type CompiledMetric = {
  projection: string;       // goes into outer SELECT
  ctes?: string[];          // shared subqueries (conversion needs these)
  groupBy?: string[];       // when the kind dictates extra GROUP BY
  postProcess?: (rows: any[]) => any[];   // window resets that can't be SQL
};

class MetricCompiler {
  compile(metric: SemMetric, ctx: CompileCtx): CompiledMetric {
    switch (metric.kind) {
      case 'simple':         return compileSimple(metric, ctx);
      case 'ratio':          return compileRatio(metric, ctx);
      case 'derived':        return compileDerived(metric, ctx);
      case 'cumulative':     return compileCumulative(metric, ctx);
      case 'conversion':     return compileConversion(metric, ctx);
      case 'prior_period':   return compilePriorPeriod(metric, ctx);
      case 'window':         return compileWindow(metric, ctx);
      case 'percentile':     return compilePercentile(metric, ctx);
      case 'approx_distinct':return compileApproxDistinct(metric, ctx);
    }
  }
}
```

#### 4.4.1 `simple`

```ts
function compileSimple(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const expr = m.expression ?? ctx.column(m.name);
  const agg  = (m.agg || 'sum').toUpperCase();
  if (agg === 'COUNT_DISTINCT') {
    return { projection: `COUNT(DISTINCT ${expr}) AS ${q(m.name)}` };
  }
  if (agg === 'MEDIAN') {
    return { projection: ctx.dialect.percentile(0.5, expr, m.name) };
  }
  return { projection: `${agg}(${expr}) AS ${q(m.name)}` };
}
```

#### 4.4.2 `ratio`

```ts
function compileRatio(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const num = ctx.metric(m.numeratorId!);
  const den = ctx.metric(m.denominatorId!);
  // Null-safe — divide by zero protected, divide by null protected.
  const projection = `
    CASE
      WHEN ${stripAlias(den.projection)} = 0 OR ${stripAlias(den.projection)} IS NULL THEN NULL
      ELSE (${stripAlias(num.projection)})::numeric / ${stripAlias(den.projection)}::numeric
    END AS ${q(m.name)}
  `;
  return { projection, ctes: [...(num.ctes||[]), ...(den.ctes||[])] };
}
```

#### 4.4.3 `derived`

The derived expression references metric names by `{name}`
substitution. The compiler topologically sorts derived metrics so
their dependencies are emitted in a sub-CTE first.

```ts
function compileDerived(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  // Parse {name} tokens, resolve each to its compiled projection,
  // splice them into the derivedExpression.
  const refs = parseRefs(m.derivedExpression!);   // ['revenue', 'cogs']
  for (const r of refs) {
    if (!ctx.modelHasMetric(r))
      throw new BadRequest(`Derived metric ${m.name} references unknown metric "${r}"`);
  }
  let expr = m.derivedExpression!;
  for (const r of refs) {
    const compiled = ctx.metric(ctx.metricIdByName(r));
    expr = expr.replace(new RegExp(`\\{${r}\\}`, 'g'),
                        `(${stripAlias(compiled.projection)})`);
  }
  return { projection: `${expr} AS ${q(m.name)}` };
}
```

Cycle detection happens at the *validator* layer (see [02 · Semantic
Layer §2.3](02-semantic-layer.md)) before the metric is saved. The
compiler trusts the validator.

#### 4.4.4 `cumulative`

```ts
function compileCumulative(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const inner = ctx.metric(m.id);  // the base aggregation
  const timeCol = m.cumulativeTimeColumn || ctx.defaultTimeColumn;
  const reset = m.windowReset || 'none';

  if (reset === 'none') {
    // Lifetime running total
    return {
      projection: `
        SUM(${stripAlias(inner.projection)})
          OVER (ORDER BY ${q(timeCol)} ROWS UNBOUNDED PRECEDING)
        AS ${q(m.name)}`,
    };
  }

  // Reset at boundary — partition by truncated time
  const truncated = ctx.dialect.dateTrunc(reset, q(timeCol));
  return {
    projection: `
      SUM(${stripAlias(inner.projection)})
        OVER (
          PARTITION BY ${truncated}
          ORDER BY ${q(timeCol)}
          ROWS UNBOUNDED PRECEDING
        )
      AS ${q(m.name)}`,
  };
}
```

`fiscal_year` reset is special — the compiler needs the org's
fiscal-calendar config from `org_fiscal_calendar` (see [07 ·
Filters](07-filters-actions.md) §4.4). If missing, raise an error
at compile time, not silently treat as `year`.

#### 4.4.5 `conversion`

```ts
function compileConversion(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const c = m.conversion!;
  // Pseudo-typed: the user said "from event-A to event-B within
  // windowDays, per entity". We materialise two CTEs.
  const cteA = `
    sem_conv_a_${m.id.slice(0,8)} AS (
      SELECT ${q(c.entityColumn)} AS entity,
             MIN(${q(c.timeColumn)}) AS ts
      FROM ${ctx.fromExpr}
      WHERE ${q(c.eventColumn)} = ${ctx.bind(c.eventA)}
      GROUP BY 1
    )`;
  const cteB = `
    sem_conv_b_${m.id.slice(0,8)} AS (
      SELECT ${q(c.entityColumn)} AS entity,
             MIN(${q(c.timeColumn)}) AS ts
      FROM ${ctx.fromExpr}
      WHERE ${q(c.eventColumn)} = ${ctx.bind(c.eventB)}
      GROUP BY 1
    )`;

  const orderClause = c.requireOrder !== false
    ? `AND b.ts > a.ts`
    : '';

  const projection = `
    (
      SELECT COUNT(DISTINCT a.entity) FILTER (
        WHERE b.entity IS NOT NULL
          AND b.ts <= a.ts + INTERVAL '${c.windowDays} days'
          ${orderClause}
      )::numeric
      / NULLIF(COUNT(DISTINCT a.entity), 0)
      FROM sem_conv_a_${m.id.slice(0,8)} a
      LEFT JOIN sem_conv_b_${m.id.slice(0,8)} b USING (entity)
    ) AS ${q(m.name)}`;

  return { projection, ctes: [cteA, cteB] };
}
```

#### 4.4.6 `prior_period`

```ts
function compilePriorPeriod(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const base = ctx.metric(m.id);          // the source metric
  const timeCol = ctx.defaultTimeColumn;
  const offset = m.priorPeriodOffset || 'month';

  // Strategy A — LAG window, when the outer SELECT groups by the
  // time column directly.
  // Strategy B — self-join with shifted time, when the user is
  // grouping by something else and the time column is in the WHERE
  // clause only.
  //
  // The compiler picks A by default and falls back to B when the
  // outer GROUP BY doesn't include the time column.

  if (ctx.groupByIncludes(timeCol)) {
    return {
      projection: `
        LAG(${stripAlias(base.projection)})
          OVER (ORDER BY ${ctx.dialect.dateTrunc(offset, q(timeCol))})
        AS ${q(m.name)}`,
    };
  }

  // Strategy B: separate CTE with shifted dates, joined back.
  const shifted = `
    prior_${m.id.slice(0,8)} AS (
      SELECT ${ctx.dialect.dateAdd(offset, 1, q(timeCol))} AS ts_shifted, *
      FROM ${ctx.fromExpr}
    )`;
  return {
    projection: `(/* prior-period via shifted CTE */) AS ${q(m.name)}`,
    ctes: [shifted],
  };
}
```

#### 4.4.7 `window`

```ts
function compileWindow(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const w = m.windowConfig!;
  const partition = w.partitionBy?.length
    ? `PARTITION BY ${w.partitionBy.map(q).join(', ')}`
    : '';
  const order = `ORDER BY ${w.orderBy.map(o => `${q(o.col)} ${o.dir.toUpperCase()}`).join(', ')}`;

  let fnExpr: string;
  switch (w.fn) {
    case 'rank':       fnExpr = 'RANK()'; break;
    case 'dense_rank': fnExpr = 'DENSE_RANK()'; break;
    case 'row_number': fnExpr = 'ROW_NUMBER()'; break;
    case 'ntile':      fnExpr = `NTILE(${w.ntileBuckets || 10})`; break;
    case 'lag':        fnExpr = `LAG(${ctx.column('value')}, ${w.offset || 1})`; break;
    case 'lead':       fnExpr = `LEAD(${ctx.column('value')}, ${w.offset || 1})`; break;
  }

  return {
    projection: `${fnExpr} OVER (${partition} ${order}) AS ${q(m.name)}`,
  };
}
```

#### 4.4.8 `percentile`

Dialect-aware:

```ts
function compilePercentile(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  return {
    projection: ctx.dialect.percentile(
      Number(m.percentileQ ?? 0.5),
      m.expression!,
      m.name,
    ),
  };
}

// Postgres
postgresDialect.percentile = (q, expr, alias) =>
  `PERCENTILE_CONT(${q}) WITHIN GROUP (ORDER BY ${expr}) AS ${quote(alias)}`;

// Snowflake
snowflakeDialect.percentile = (q, expr, alias) =>
  `PERCENTILE_CONT(${q}) WITHIN GROUP (ORDER BY ${expr}) AS ${quote(alias)}`;

// BigQuery
bigqueryDialect.percentile = (q, expr, alias) =>
  `APPROX_QUANTILES(${expr}, 100)[OFFSET(${Math.round(q * 100)})] AS ${quote(alias)}`;
//   ↑ exact PERCENTILE_CONT is non-deterministic on BQ; this is the
//   pragmatic default.

// MySQL (no percentile_cont, no quantiles function — emulate via
// ROW_NUMBER + window)
mysqlDialect.percentile = (q, expr, alias) =>
  `(SELECT ${expr} FROM /* base */ ORDER BY ${expr}
    LIMIT 1 OFFSET FLOOR(COUNT(*) * ${q})) AS ${quote(alias)}`;
```

#### 4.4.9 `approx_distinct`

```ts
function compileApproxDistinct(m: SemMetric, ctx: CompileCtx): CompiledMetric {
  const expr = m.expression!;
  const fn = ctx.dialect.approxCountDistinct || 'COUNT(DISTINCT';
  return {
    projection: `${fn}(${expr})${fn.endsWith('(') ? ')' : ''} AS ${q(m.name)}`,
  };
}
// Dialect dispatch:
postgresDialect.approxCountDistinct  = undefined;            // fall back
snowflakeDialect.approxCountDistinct = 'APPROX_COUNT_DISTINCT(';
bigqueryDialect.approxCountDistinct  = 'APPROX_COUNT_DISTINCT(';
duckdbDialect.approxCountDistinct    = 'APPROX_COUNT_DISTINCT(';
```

### 4.5 Cross-metric "virtual" expressions on the FE

Sometimes a user wants `metric_a - metric_b` for one analysis without
defining a permanent metric. The FE composes a temporary expression
in the analysis's payload. The BE treats it as an inline `derived`
metric scoped to that analysis — saved to `analysis_calc_field`
not `sem_metric`, and dropped when the analysis is.

```ts
// src/shared/db/shared_entity/analysisCalcField.entity.ts
@Entity('analysis_calc_field')
export class AnalysisCalcField {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') analysisId!: string;
  @Column({ length: 64 }) name!: string;          // local name
  @Column('text') expression!: string;             // `{revenue} - {cogs}`
  @Column('uuid', { array: true }) referencedMetricIds!: string[];
  @Column({ length: 32, nullable: true }) format?: string;
}
```

The compiler resolves these the same way as `derived` metrics but
scopes the resolution to the owning analysis.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/semantic-models/:id/metrics` | Create metric (kind in body) |
| PUT | `/semantic-models/:id/metrics/:metricId` | Update |
| DELETE | `/semantic-models/:id/metrics/:metricId` | Delete |
| GET | `/semantic-models/:id/metrics` | List |
| POST | `/semantic-models/:id/metrics/validate` | Dry-run a metric definition before saving |
| POST | `/semantic-models/:id/metrics/:id/explain` | Return the compiled SQL for the given filter ctx (admin only) |
| POST | `/analyses/:id/calc-fields` | Add inline derived expression scoped to one analysis |

## 6. Validator rules (Zod)

```ts
// src/shared/validators/metrics.ts
export const METRIC_KINDS = [
  'simple','ratio','derived','cumulative','conversion',
  'prior_period','window','percentile','approx_distinct',
] as const;

const baseMetricSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'validation.metric.name.invalid'),
  label: z.string().max(128).optional(),
  description: z.string().max(500).optional(),
  format: z.string().max(32).optional(),
  valueType: z.enum(['currency','percent','count','duration','bytes','plain']).optional(),
  hidden: z.boolean().optional(),
  isAdditive: z.boolean().optional(),
  isSemiAdditive: z.boolean().optional(),
  semiAdditiveFunc: z.enum(['LAST','FIRST','AVG']).optional(),
  allowedAggregations: z.array(z.string()).optional(),
  allowedDimensions: z.array(z.string()).optional(),
});

export const simpleMetricSchema = baseMetricSchema.extend({
  kind: z.literal('simple'),
  expression: z.string().min(1).max(2000),
  agg: z.enum(['sum','count','count_distinct','avg','min','max','median','stddev','variance']),
});

export const ratioMetricSchema = baseMetricSchema.extend({
  kind: z.literal('ratio'),
  numeratorId: z.string().uuid(),
  denominatorId: z.string().uuid(),
});

export const derivedMetricSchema = baseMetricSchema.extend({
  kind: z.literal('derived'),
  derivedExpression: z.string().min(1).max(2000),
});

export const cumulativeMetricSchema = baseMetricSchema.extend({
  kind: z.literal('cumulative'),
  // Body either supplies a base aggregation OR references another
  // metric by id (the running total of a ratio is a ratio).
  expression: z.string().optional(),
  agg: z.string().optional(),
  windowReset: z.enum(['none','day','week','month','quarter','year','fiscal_year']),
  cumulativeTimeColumn: z.string().max(64),
});

export const conversionMetricSchema = baseMetricSchema.extend({
  kind: z.literal('conversion'),
  conversion: z.object({
    eventColumn: z.string().max(64),
    eventA: z.string().max(128),
    eventB: z.string().max(128),
    entityColumn: z.string().max(64),
    timeColumn: z.string().max(64),
    windowDays: z.number().int().min(1).max(365),
    requireOrder: z.boolean().optional().default(true),
  }),
});

export const priorPeriodMetricSchema = baseMetricSchema.extend({
  kind: z.literal('prior_period'),
  numeratorId: z.string().uuid(),       // points at the source metric
  priorPeriodOffset: z.enum(['day','week','month','quarter','year']),
});

export const windowMetricSchema = baseMetricSchema.extend({
  kind: z.literal('window'),
  windowConfig: z.object({
    fn: z.enum(['rank','dense_rank','row_number','ntile','lag','lead']),
    partitionBy: z.array(z.string().max(64)).optional(),
    orderBy: z.array(z.object({
      col: z.string().max(64),
      dir: z.enum(['asc','desc']),
    })).min(1),
    ntileBuckets: z.number().int().min(2).max(1000).optional(),
    offset: z.number().int().min(1).max(100).optional(),
  }),
});

export const percentileMetricSchema = baseMetricSchema.extend({
  kind: z.literal('percentile'),
  expression: z.string().min(1).max(2000),
  percentileQ: z.number().min(0).max(1),
});

export const approxDistinctMetricSchema = baseMetricSchema.extend({
  kind: z.literal('approx_distinct'),
  expression: z.string().min(1).max(2000),
});

export const metricSchema = z.discriminatedUnion('kind', [
  simpleMetricSchema, ratioMetricSchema, derivedMetricSchema,
  cumulativeMetricSchema, conversionMetricSchema, priorPeriodMetricSchema,
  windowMetricSchema, percentileMetricSchema, approxDistinctMetricSchema,
]);
```

## 7. FE specs

### 7.1 Metric builder dialog

Three steps wizard:

1. **Pick kind** — radio list, each with one-line explainer ("Ratio
   of two metrics, e.g. revenue per user"). The kind never changes
   after step 1.
2. **Define inputs** — kind-specific form. `simple` shows expression
   + agg dropdown. `cumulative` shows reset + time column. `conversion`
   shows event A, event B, entity, window. Etc.
3. **Format & preview** — format string picker, value type, live
   preview against a sample 100-row slice of the dataset.

### 7.2 Additive flag inference

When the user picks `count_distinct`, the FE pre-fills
`isAdditive = false`. When they pick `sum` or `count`, `isAdditive
= true`. For `avg`/`median`/`percentile`/ratios, `isAdditive =
false` and the form shows a tooltip ("This metric will be recomputed
at each grouping level — totals won't equal sums of parts").

The user can override but the warning makes the trade-off explicit.

### 7.3 Format string editor

```
Currency: $#,##0.00
Percent : 0.0%
Bytes   : auto (uses humanFileSize)
Duration: HH:mm:ss
Plain   : 0,000
```

Power-user "custom" field accepts numbro syntax. Live preview
renders three sample numbers (small, medium, large) so the user
sees what each format does.

## 8. Test plan

### 8.1 Compiler — per-kind unit tests

```
MET-SIMPLE-H-01    sum compiles to SUM(expr) AS name
MET-SIMPLE-H-02    count_distinct compiles to COUNT(DISTINCT ...)
MET-SIMPLE-H-03    median compiles to PERCENTILE_CONT(0.5)
MET-RATIO-H-01     null-safe division: 0/0 → NULL
MET-RATIO-H-02     null-safe division: x/0 → NULL
MET-DERIVED-H-01   {a}-{b} substitutes correctly
MET-DERIVED-H-02   undefined ref → 400 with reason
MET-DERIVED-H-03   cycle detected at save time, not compile
MET-CUM-H-01       MTD partitions by month, orders by date
MET-CUM-H-02       lifetime cumulative has no PARTITION clause
MET-CUM-H-03       fiscal_year reset uses org_fiscal_calendar
MET-CUM-N-01       fiscal_year without org config → 400
MET-CONV-H-01      window of 7 days correctly bounds
MET-CONV-H-02      requireOrder=true excludes b before a
MET-CONV-H-03      denominator is distinct count of A entities
MET-CONV-H-04      numerator is distinct count of A entities WITH a B in window
MET-POP-H-01       LAG-based prior_month aligns months
MET-POP-H-02       prior_year offset = 12 months
MET-WIN-RANK-H-01  RANK() with partition + order
MET-WIN-NTILE-H-01 NTILE(4) → quartiles
MET-WIN-LAG-H-01   LAG with offset=2
MET-PCT-PG-H-01    percentile on PG → PERCENTILE_CONT
MET-PCT-BQ-H-01    percentile on BQ → APPROX_QUANTILES
MET-PCT-SF-H-01    percentile on SF → PERCENTILE_CONT
MET-PCT-MY-H-01    percentile on MySQL → emulated via OFFSET
MET-APX-SF-H-01    approx_distinct on SF → APPROX_COUNT_DISTINCT
MET-APX-PG-H-01    approx_distinct on PG → falls back to COUNT(DISTINCT)
```

### 8.2 Additive composition

```
MET-ADD-H-01       additive metric: month totals sum to year total
MET-SEMIADD-H-01   semi-add LAST: year value = last month's value
MET-SEMIADD-H-02   semi-add FIRST: year value = first month's value
MET-NONADD-N-01    non-additive across time + groupBy time → recomputed
MET-NONADD-W-01    UI warns when non-additive metric in totals row
```

### 8.3 Format

```
MET-FMT-H-01       $#,##0.00 renders $1,234.50
MET-FMT-H-02       0.0% renders 12.3%
MET-FMT-H-03       custom 0.00 'kg' renders 12.30 kg
MET-FMT-H-04       format applied to legend, axis, tooltip
```

### 8.4 Cross-metric

```
MET-CALC-H-01      analysis_calc_field {revenue}-{cogs} renders
MET-CALC-H-02      calc field with unknown ref → 400
MET-CALC-H-03      delete analysis → calc fields cascade
```

## 9. Migration

Phase 1 (compile-only):

```sql
ALTER TABLE sem_metric
  ADD COLUMN derived_expression text,
  ADD COLUMN referenced_metric_ids uuid[],
  ADD COLUMN window_reset varchar(16),
  ADD COLUMN cumulative_time_column varchar(64),
  ADD COLUMN conversion jsonb,
  ADD COLUMN prior_period_offset varchar(16),
  ADD COLUMN window_config jsonb,
  ADD COLUMN percentile_q numeric,
  ADD COLUMN is_additive boolean NOT NULL DEFAULT true,
  ADD COLUMN is_semi_additive boolean NOT NULL DEFAULT false,
  ADD COLUMN semi_additive_func varchar(16),
  ADD COLUMN format varchar(32),
  ADD COLUMN value_type varchar(16),
  ADD COLUMN description text,
  ADD COLUMN allowed_aggregations text[],
  ADD COLUMN allowed_dimensions text[];

-- Backfill: every existing simple metric becomes additive if its
-- agg is in (sum, count). Other aggs become non-additive.
UPDATE sem_metric
SET is_additive = (agg IN ('sum','count'));
```

Phase 2 (new kinds): no schema change — the new metrics use the
columns added in phase 1.

## 10. Open questions

- **Filtered metrics** (`revenue WHERE region='APAC'`). Pending
  Looker-style `filters` block on `SemMetric`. Holding for v2.
- **Date math on the FE** ("12-month rolling avg") — should this be
  a metric kind or an analysis-level transformation? Recommend
  metric kind so it's reusable. Adds `rolling` kind in v2.
- **Approximate percentile vs exact** — give the metric author a
  knob or always go exact? Recommend a knob with default exact.

## 11. References

- Looker measure types: <https://docs.looker.com/reference/field-reference/measure-type-reference>
- dbt MetricFlow: <https://docs.getdbt.com/docs/build/about-metricflow>
- Cube.js measures: <https://cube.dev/docs/schema/reference/measures>
- Power BI semi-additive: <https://learn.microsoft.com/dax/last-date-function-dax>
- Tableau LOD: <https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod.htm>

## Appendix · Review additions

After a deep-review pass these concepts were identified as still
missing and are listed here for the implementer:

- **Non-additive metric flag**: `sem_metric.is_additive boolean`.
  Distinct counts can't sum across windows; compiler must refuse.
- **Semi-additive metrics** (Power BI terminology): `sem_metric.is_semi_additive`
  + `sem_metric.semi_additive_func varchar` ('LAST'|'FIRST'|'AVG').
  Use case: bank balance = LAST(balance) per month, not SUM.
- **Window reset semantics**: `sem_metric.window_reset varchar`
  ('day'|'week'|'month'|'year'|'fiscal_year'). MTD resets at month
  boundary; YTD at year; fiscal at fiscal year start.
- **Allowed aggregations whitelist**: `sem_metric.allowed_aggregations varchar[]`.
- **Custom format strings** beyond currency/percent: `0.00 'kg'`,
  `#,##0.0M`. Implement with `numbro` or `d3-format`.
- **Approx-vs-exact distinct counts** flag — Snowflake / BigQuery have
  `APPROX_COUNT_DISTINCT`; metric author picks accuracy vs speed.
- **Window-function metrics**: `RANK() OVER (PARTITION BY ...)`,
  `NTILE(10)`, `LAG()` for prior-period comparison.
- **Percentile metrics**: dialect-specific
  (`PERCENTILE_CONT` vs `APPROX_PERCENTILE`).
- **Cross-metric math (virtual columns)**: FE composes
  `metric_a - metric_b` without authoring a server-side derived
  metric.
- **Metric description tooltip** on hover in chart legend.

### Test IDs to add

- METRIC-SEMIADD-H-01 — LAST month-end balance correct
- METRIC-RESET-H-01 — MTD resets at month boundary
- METRIC-NONADD-N-01 — refuse to SUM distinct counts across regions
- METRIC-FORMAT-H-01 — custom format applied in axis + tooltip
- METRIC-PCT-H-01 — percentile works on PG / Snowflake / BQ / MSSQL
- METRIC-WIN-RANK-H-01 — RANK() partition emits correct SQL
