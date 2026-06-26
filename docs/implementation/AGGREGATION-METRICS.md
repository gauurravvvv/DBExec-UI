# Aggregation & metrics

> Implementation companion to research module 11. Pins the
> compiler for nine metric kinds, the additivity solver, the
> dialect-specific percentile + approx-distinct fallbacks, and
> the `analysis_calc_field` (inline cross-metric expressions
> without polluting the semantic layer).

**Status:** 🔴 not in product. P1 — table stakes for BI.
**Effort:** M-L (~3 weeks). Depends on semantic layer (02).

---

## 0. Problem statement

`SUM(amount)` is easy. Everything else BI shops want is hard:

- **Ratio:** `SUM(discount) / SUM(amount)` — must divide after
  aggregation, not row-by-row.
- **Cumulative:** running total over time.
- **Conversion:** funnel rate (step A → step B within 24h).
- **Prior-period:** "this month vs same month last year".
- **Window:** 7-day moving average.
- **Percentile:** p95 latency.
- **Approx distinct:** HLL on 1B rows.
- **Derived:** formula over other metrics: `revenue - cost`.

Each has dialect quirks and additivity rules. Build one metric
compiler that gets them right once.

---

## 1. The nine kinds (matches `sem_metric.kind`)

| Kind | Sketch | Additivity |
|---|---|---|
| `simple` | `SUM(amount)` / `COUNT(*)` / `MIN(...)` etc. | depends on agg |
| `ratio` | `SUM(num) / SUM(den)` | non-additive |
| `derived` | formula over other metrics | inherits |
| `cumulative` | `SUM(amount) OVER (ORDER BY day)` | non-additive |
| `conversion` | funnel | non-additive |
| `prior_period` | `metric @ now` vs `metric @ now - period` | non-additive |
| `window` | `AVG(amount) OVER (ROWS BETWEEN n PRECEDING)` | non-additive |
| `percentile` | `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY x)` | non-additive |
| `approx_distinct` | HLL / `APPROX_COUNT_DISTINCT` | non-additive |

---

## 2. Per-kind compilers

```typescript
export function renderMetricExpr(metric: SemMetric, dialect: DialectAdapter): string {
  switch (metric.kind) {
    case 'simple':           return renderSimple(metric, dialect);
    case 'ratio':            return renderRatio(metric, dialect);
    case 'derived':          return renderDerived(metric, dialect);
    case 'cumulative':       return renderCumulative(metric, dialect);
    case 'conversion':       return renderConversion(metric, dialect);
    case 'prior_period':     return renderPriorPeriod(metric, dialect);
    case 'window':           return renderWindow(metric, dialect);
    case 'percentile':       return renderPercentile(metric, dialect);
    case 'approx_distinct':  return renderApproxDistinct(metric, dialect);
  }
}

function renderSimple(m: SemMetric, d: DialectAdapter): string {
  const { agg, column } = m.expr;
  const aggUpper = agg.toUpperCase();
  return `${aggUpper}(${d.quoteIdent(column)})`;
}

function renderRatio(m: SemMetric, d: DialectAdapter): string {
  const num = renderSimple({ ...m, expr: m.expr.numerator } as any, d);
  const den = renderSimple({ ...m, expr: m.expr.denominator } as any, d);
  // Guard against divide-by-zero
  return `CASE WHEN ${den} = 0 THEN NULL ELSE ${num}::FLOAT / ${den} END`;
}

function renderDerived(m: SemMetric, d: DialectAdapter, ctx: { resolved: Map<string, string> }): string {
  // formula: "{revenue} - {cost}"; deps: ['revenue','cost']
  let out = m.expr.formula;
  for (const dep of m.expr.deps) {
    const sub = ctx.resolved.get(dep);
    if (!sub) throw new Error(`Derived metric '${m.name}' depends on unresolved '${dep}'`);
    out = out.split(`{${dep}}`).join(sub);
  }
  return `(${out})`;
}

function renderCumulative(m: SemMetric, d: DialectAdapter): string {
  const inner = renderSimple({ ...m, expr: { agg: m.expr.agg, column: m.expr.column } } as any, d);
  return `${inner} OVER (ORDER BY ${d.quoteIdent(m.expr.windowOver)} ROWS UNBOUNDED PRECEDING)`;
}

function renderConversion(m: SemMetric, d: DialectAdapter): string {
  // Funnel: count distinct users who hit step B within N hours of step A,
  // divided by count distinct users who hit step A.
  const { from, to, withinHours } = m.expr;
  // Caller expects this to be combined with a subquery; here we emit the inner aggregation:
  return `(
    COUNT(DISTINCT CASE
      WHEN event_name = '${to}' AND TIMESTAMPDIFF(HOUR, prev_${from}_at, event_at) <= ${withinHours}
      THEN user_id END)::FLOAT
    /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = '${from}' THEN user_id END), 0)
  )`;
}

function renderPriorPeriod(m: SemMetric, d: DialectAdapter): string {
  const { base, period } = m.expr;
  // Renders as a separate select column; the resolver wraps the query
  // in a JOIN against the shifted-period version.
  return `__PP__${base}__${period}`;  // sentinel resolved by query planner
}

function renderWindow(m: SemMetric, d: DialectAdapter): string {
  const inner = renderSimple({ ...m, expr: { agg: m.expr.agg, column: m.expr.column } } as any, d);
  const { preceding, following } = m.expr.frame;
  return `${inner} OVER (ORDER BY ${d.quoteIdent(m.expr.windowOver)} ROWS BETWEEN ${preceding} PRECEDING AND ${following} FOLLOWING)`;
}

function renderPercentile(m: SemMetric, d: DialectAdapter): string {
  return d.renderPercentile(d.quoteIdent(m.expr.column), m.expr.p, m.expr.method ?? 'continuous');
}

function renderApproxDistinct(m: SemMetric, d: DialectAdapter): string {
  return d.renderApproxDistinct(d.quoteIdent(m.expr.column));
}
```

---

## 3. Derived dependency resolver

Derived metrics depend on other metrics. The compiler must
resolve them in topological order — a derived metric can't
reference itself transitively.

```typescript
export function resolveDerivedOrder(
  metrics: SemMetric[],
): SemMetric[] {
  const byName = new Map(metrics.map(m => [m.name, m]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const order: SemMetric[] = [];

  function visit(m: SemMetric, stack: string[]) {
    if (done.has(m.name)) return;
    if (visiting.has(m.name)) {
      throw new Error(`Circular derived metric: ${[...stack, m.name].join(' → ')}`);
    }
    visiting.add(m.name);
    if (m.kind === 'derived') {
      for (const dep of m.expr.deps) {
        const depM = byName.get(dep);
        if (!depM) throw new Error(`Derived metric '${m.name}' references unknown metric '${dep}'`);
        visit(depM, [...stack, m.name]);
      }
    }
    visiting.delete(m.name);
    done.add(m.name);
    order.push(m);
  }

  for (const m of metrics) visit(m, []);
  return order;
}
```

---

## 4. Additivity solver

Given an intent's `(metrics, dimensions)`, decide whether the
result is computationally trustworthy.

```typescript
export interface AdditivityResult {
  ok: boolean;
  warnings: Array<{ metric: string; dim: string; reason: string }>;
}

export function checkAdditivity(
  metrics: SemMetric[],
  dimensions: SemDimension[],
): AdditivityResult {
  const warnings: AdditivityResult['warnings'] = [];
  for (const m of metrics) {
    for (const d of dimensions) {
      if (m.non_additive_along?.includes(d.name)) {
        warnings.push({
          metric: m.name, dim: d.name,
          reason: `metric '${m.name}' declared non-additive along '${d.name}'`,
        });
      }
    }
    if (['ratio', 'percentile', 'approx_distinct'].includes(m.kind)) {
      // These are *always* non-additive; cannot be summed downstream.
      // Warn whenever they appear in a rollup-prone context.
      if (dimensions.length > 1) {
        warnings.push({
          metric: m.name, dim: '<multi>',
          reason: `${m.kind} metrics cannot be aggregated further; ensure dashboard tile is leaf-level`,
        });
      }
    }
  }
  return { ok: warnings.length === 0, warnings };
}
```

---

## 5. `analysis_calc_field` (inline cross-metric expressions)

Analysts sometimes want a one-off calc without editing the
semantic model. `analysis_calc_field` is the slot:

```sql
CREATE TABLE analysis_calc_field (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  display_name TEXT NOT NULL,
  formula     TEXT NOT NULL,                       -- '{revenue} / {orders_count}'
  deps        TEXT[] NOT NULL,                     -- ['revenue','orders_count']
  format      TEXT,
  format_args JSONB
);
```

Compiled in the same place as derived metrics, but scoped to
the analysis only.

---

## 6. Dialect-specific fallbacks

| Feature | Postgres | MySQL | MSSQL | BigQuery | Snowflake | Redshift |
|---|---|---|---|---|---|---|
| Percentile (cont) | `PERCENTILE_CONT(p) WITHIN GROUP` | `PERCENT_RANK` (workaround) | `PERCENTILE_CONT` | `APPROX_QUANTILES(x, 100)[OFFSET]` | `PERCENTILE_CONT(p)` | `PERCENTILE_CONT(p)` |
| Percentile (disc) | `PERCENTILE_DISC` | not native | `PERCENTILE_DISC` | `APPROX_QUANTILES` | `PERCENTILE_DISC` | `PERCENTILE_DISC` |
| Approx distinct | `COUNT(DISTINCT)` (no HLL in core) | `APPROX_COUNT_DISTINCT` (8.x) | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` |
| `ROWS BETWEEN` | yes | 8+ only | yes | yes | yes | yes |
| Funnel time | window funcs + LAG | LAG (8+) | LAG | LAG | LAG | LAG |

For MySQL pre-8 (legacy installs), fallbacks emit a `WARN_LEGACY_DIALECT`
and skip the metric (rendered as `NULL AS metric_name`) rather
than crashing.

---

## 7. Controller — preview a metric

```typescript
// src/controllers/metric/previewMetric.ts
const previewMetric = async (req: Request, res: Response) => {
  const { semanticModelId, metricId, groupBy } = req.body;
  const { orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const model = await loadFullModel(connection, semanticModelId);
    const metric = model.metrics.find((m: any) => m.id === metricId);
    if (!metric) { await master_db_connection.close();
      return sendResponse(res, false, CODE.NOT_FOUND, METRIC_MSG.NOT_FOUND); }

    const intent = {
      semanticModelId,
      metrics: [{ metricId }],
      dimensions: groupBy.map((g: string) => ({ dimensionId: g })),
      filters: [],
      limit: 100,
    };

    const adapter = adapterFor(model.primaryDataset.datasource.type);
    const compiled = await compileIntent(model, intent, { dialect: adapter, user: req.locals?.user });
    const result = await runQuery(model.primaryDataset.datasource, compiled.sql, compiled.params,
                                  { timeoutMs: 30000, maxRows: 100 });

    // Additivity warnings
    const dims = groupBy.map((g: string) => model.dimensions.find((d: any) => d.id === g));
    const add = checkAdditivity([metric], dims);

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, METRIC_MSG.OK, {
      sql: compiled.sql, rows: result.rows,
      warnings: [...compiled.warnings, ...add.warnings],
    });
  } catch (err: any) {
    Logger.error(`Preview metric failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 8. FE — metric editor

Inside the semantic-model editor (companion doc
[SEMANTIC-LAYER.md](SEMANTIC-LAYER.md) §6), the metric editor
expands per-kind:

```
Metric: revenue
Kind: ◉ simple ○ ratio ○ derived ○ cumulative ○ ...

  ┌─ simple ───────────────────────────────┐
  │ Agg:  [▼ SUM]                          │
  │ Col:  [▼ amount  (number)]             │
  └─────────────────────────────────────────┘

  Format: ◉ currency ○ number ○ percent
  Currency: [USD]   Decimals: [2]

  Additive along:
   ✓ time       ✓ region       ✗ status

  Test:
  ┌───────────────────────────────────────────┐
  │ SQL:  SUM("amount")                        │
  │ Sample: 1,247,392.41 (over all rows)      │
  │  → grouped by region:                      │
  │       APAC   312,492.10                    │
  │       EMEA   428,711.55                    │
  │       AMER   506,188.76                    │
  └───────────────────────────────────────────┘
```

For `derived`, the editor has a formula textarea with
autocomplete over the model's other metric names:

```
formula: {revenue} - {cost}
        ^^^^^^^^^   ^^^^^^   ← autocompleted from model metrics
deps:    revenue, cost
```

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_metric_compile_ms` | histogram | `kind`, `dialect` | per-kind compile cost |
| `dbexec_metric_kind_used_total` | counter | `kind` | telemetry — which kinds customers actually use |
| `dbexec_metric_additivity_warning_total` | counter | `reason` | leading indicator of misuse |
| `dbexec_metric_legacy_dialect_skipped_total` | counter | `dialect` | MySQL < 8 etc. |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| Derived formula injection | Parser allows only metric-name references + arithmetic; no function calls, no identifiers other than `{name}` placeholders |
| Conversion metric reveals user_id (PII) | `event_name` & `user_id` resolved through semantic model; PII sanitiser (module 09) drops if user lacks unmasking role |
| Window frame infinite size on huge tables | Frame clauses validated; UNBOUNDED PRECEDING capped to a sane bound (configurable per-org) |
| Percentile on a non-numeric col | Type-checked at compile; reject |
| Approx distinct false-claim of exactness in UI | Format-args row says "approx" + tolerance |

---

## 11. Runbook

**Symptom: ratio metric returns 0 always.**
1. Denominator probably 0 for all rows in scope. Add a sanity
   filter; consider WHERE on denominator > 0.

**Symptom: cumulative breaks across pages.**
1. Cumulative is non-additive — paginating destroys the running
   total. Surface "this metric requires no LIMIT" in chart
   preview.

**Symptom: prior-period metric returns NULL.**
1. The shifted-period join has no rows. Usually the dataset
   doesn't go back far enough. Surface "no prior period
   available" inline.

**Symptom: percentile slow on Snowflake.**
1. `PERCENTILE_CONT` requires a full sort. Suggest the
   `APPROX_PERCENTILE` variant for large datasets — the
   adapter exposes `renderPercentileApprox` as a fallback path.

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Compile single metric expression | 1 ms | 5 ms | 30 ms |
| Compile full intent (5 metrics, 3 dims) | 12 ms | 40 ms | 200 ms |
| Topological sort of 100 derived metrics | 2 ms | 10 ms | 50 ms |
| Additivity check (5 metrics × 3 dims) | < 1 ms | 2 ms | 10 ms |

---

## 13. Migration & rollout

1. **Migrations:** add `analysis_calc_field`; add
   `additive_along`/`non_additive_along` JSONB columns on
   `sem_metric`.
2. **Backfill:** none.
3. **Feature flag:** `feature.metrics_v2`. Falls back to today's
   single-kind compiler.
4. **Per-kind GA cadence:** ship `simple`, `ratio`, `derived`,
   `percentile`, `approx_distinct` first (least dialect-finicky).
   Then `cumulative`, `window`, `prior_period`. `conversion`
   last (most complex).

---

## 14. Open questions

1. **Cohort metrics** — "retention by signup week". v2 needs a
   `cohort` kind with two date dims.
2. **K-anonymity gates** — block `COUNT(DISTINCT user_id)`
   when groups would be < k. Cross-cuts module 09.
3. **Custom-SQL metric escape hatch** — power user wants to
   paste warehouse-native SQL. Risk: bypasses adapter. Provide,
   gated by an org-admin toggle, audit logged.

---

## 15. References

- [11-aggregation-metrics.md](../research/modules/11-aggregation-metrics.md)
- [02-semantic-layer.md](../research/modules/02-semantic-layer.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- dbt MetricFlow metric kind reference
- Snowflake `APPROX_*` functions docs
- BigQuery `APPROX_QUANTILES` semantics
