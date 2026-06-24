# 27 · Cost Observability & Query Budgets

## Why

BigQuery / Snowflake bill per byte scanned / credit consumed. Customers
need to know what DBExec costs them.

## Schema

```sql
CREATE TABLE query_cost (
  id             bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL,
  dataset_id     uuid,
  source         varchar(32) NOT NULL,
  bytes_scanned  bigint,
  rows_returned  bigint,
  duration_ms    int,
  cost_credits   numeric(12,6),
  vendor         varchar(16),                 -- bigquery|snowflake|redshift|...
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  scope           varchar(16) NOT NULL,        -- org|dataset|user|datasource
  scope_id        uuid,
  period          varchar(16) NOT NULL,        -- daily|weekly|monthly
  limit_bytes     bigint,
  limit_credits   numeric(12,6),
  hard_limit      boolean NOT NULL DEFAULT false,
  alert_at_pct    int NOT NULL DEFAULT 80
);
```

## Driver hooks

Per driver, capture cost on each query:

- **BigQuery**: `job.statistics.query.totalBytesProcessed`
- **Snowflake**: query `SHOW QUERIES` post-execution; warehouse credits
  estimated by node count × duration.
- **Postgres / MySQL**: no native cost; estimate by row count × cpu time.

## Budgets enforcement

Every query checks pending budget:

```ts
async function enforceBudget(orgId: string, datasetId: string, estBytes: number) {
  const usage = await sumCostsThisPeriod(orgId, datasetId);
  const limit = await loadBudget(orgId, datasetId);
  if (limit && usage + estBytes > limit.limitBytes) {
    if (limit.hardLimit) throw new Error('Budget exceeded; query blocked');
    notifyAdmin(orgId, 'budget exceeded');
  }
}
```

## UI

Admin → Cost dashboard:

- Daily/weekly/monthly bytes scanned, credits consumed.
- Top 10 most expensive datasets, queries, users.
- Budgets with progress bars.

## Tests

- **COST-H-01** — BigQuery query records bytes_scanned
- **COST-BUD-H-01** — soft budget alert at 80%
- **COST-BUD-N-01** — hard budget blocks 101% query
