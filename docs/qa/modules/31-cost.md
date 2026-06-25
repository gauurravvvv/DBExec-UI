# 31 · Cost Observability — Deep Test Cases

## Fixtures
- BigQuery datasource (skip if unavailable).
- Snowflake datasource.
- Budget set on `orders` dataset.

## Happy
- **COST-H-01** · BigQuery query records bytes_scanned. P0
- **COST-H-02** · Snowflake credits recorded. P0
- **COST-DRYRUN-H-01** · Dry-run cost shown to user before run (BigQuery). P1
- **COST-BUD-H-01** · Soft budget alert at 80%. P0
- **COST-FORE-H-01** · Forecast within 20% of actual on stable workload. P2
- **COST-ATTR-H-01** · Dashboard shows cumulative query cost. P1
- **COST-AUTO-PAUSE-H-01** · Warehouse paused at hard limit. P1

## Negative
- **COST-BUD-N-01** · Hard budget blocks 101% query. P0
- **COST-BUD-N-02** · Per-user budget violation → user blocked but admin can override. P1

## Edge
- **COST-E-01** · Cost recorded for cached vs uncached queries differently. P1
- **COST-E-02** · Currency conversion for credits → USD. P2
- **COST-E-03** · Free-tier user shielded from cost dashboards. P2

## Security
- **COST-S-01** · Cost data scoped per org. P0 🟣

## Performance
- **COST-P-01** · Cost dashboard renders < 1s for 30d data. P1 ⚡

## Regression buckets
- Driver cost hooks → COST-H-01..02
- Budget enforcement → COST-BUD-H-01, COST-BUD-N-01
