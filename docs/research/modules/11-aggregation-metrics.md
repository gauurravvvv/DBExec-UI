# 11 · Aggregation & Metrics

Most of this lives in module 02 (Semantic Layer). This doc dives into
the **metric-type taxonomy** and the SQL each type compiles to.

## Metric taxonomy

| Kind | Example | SQL pattern |
|---|---|---|
| Simple | `sum(revenue)` | `SUM(revenue)` |
| Ratio  | `arpu = revenue / users` | `SUM(revenue)::numeric / NULLIF(COUNT(DISTINCT user_id),0)` |
| Derived | `gross_margin = revenue - cogs` | `SUM(revenue) - SUM(cogs)` |
| Cumulative | `running_revenue` | `SUM(revenue) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)` |
| Conversion | `signup_to_paid_in_7d` | self-join + COUNT(DISTINCT) |
| Period-over-period | `revenue_vs_prior_month` | window with LAG / window aggregations |
| Distinct count | `unique_users` | `COUNT(DISTINCT user_id)` |
| Percentile | `p95_latency` | `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency)` |

### Conversion metric DB definition

```jsonc
{
  "name": "signup_to_paid",
  "kind": "conversion",
  "conversion": {
    "event_a": "signed_up",
    "event_b": "paid",
    "within_days": 7,
    "entity": "user_id"
  }
}
```

Compiled SQL (Postgres):

```sql
WITH a AS (SELECT user_id, MIN(event_ts) ts FROM events WHERE event_name='signed_up' GROUP BY 1),
     b AS (SELECT user_id, MIN(event_ts) ts FROM events WHERE event_name='paid'      GROUP BY 1)
SELECT
  COUNT(DISTINCT a.user_id) AS denominator,
  COUNT(DISTINCT CASE WHEN b.ts BETWEEN a.ts AND a.ts + INTERVAL '7 days'
                      THEN a.user_id END) AS numerator
FROM a LEFT JOIN b USING (user_id);
```

### Period-over-period

User picks a metric + period grain. Compiler emits two CTEs (current
and prior) and a join.

## Build plan delta

1. Extend `sem_metric` with conversion / period_over_period columns.
2. Compiler branches on `kind`.
3. UI metric builder shows kind-specific forms.

## Tests

- **METRIC-RATIO-H-01** — divide by zero → NULL not Infinity
- **METRIC-CONV-H-01** — denominator excludes events outside window
- **METRIC-POP-H-01** — period-over-period correctly aligns months
