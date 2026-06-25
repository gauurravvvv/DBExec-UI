# 09 · Semantic Layer — Deep Test Cases

> Largest gap in DBExec. These tests assume the semantic layer is
> being built per `docs/research/modules/02-semantic-layer.md`.

## Fixtures
- Dataset `orders` with columns id, customer_id, region, sold_at, revenue
- Semantic model `orders` with:
  - entity `order` (PK id)
  - dim `region` (string)
  - dim `sold_at` (time, grain=day)
  - metric `revenue` (sum)
  - metric `orders` (count)

## CRUD — happy
- **SEM-H-01** · Create model with 2 dims + 2 metrics. P0
- **SEM-H-02** · Update dim label. P1
- **SEM-H-03** · Delete dim cascades to dependent metrics' validation. P0
- **SEM-H-04** · Clone model with new name. P1
- **SEM-H-05** · YAML export round-trips. P2

## CRUD — negative
- **SEM-N-01** · Duplicate dim name in same model → 409. P0
- **SEM-N-02** · Derived metric with unknown ref → validator 400. P0
- **SEM-N-03** · Cyclic derived metric (A→B→A) → reject. P0
- **SEM-N-04** · Cross-org model id → 404. P0
- **SEM-N-05** · Required filter missing in query → 400. P0
- **SEM-N-06** · Allowed-aggregation violated → reject. P1

## Compile / query — happy
- **SEM-Q-H-01** · `{metrics: ['revenue'], dimensions: ['region']}` returns 1 row per region. P0
- **SEM-Q-H-02** · Time dim with grain=month rolls daily data. P0
- **SEM-Q-H-03** · Ratio metric handles divide-by-zero (returns NULL). P0
- **SEM-Q-H-04** · `sql_always_where` appended to every compile. P0
- **SEM-Q-H-05** · Required filter ingested → 200. P0

## Compile / query — negative
- **SEM-Q-N-01** · Unknown metric name → 400. P0
- **SEM-Q-N-02** · Unknown dimension name → 400. P0
- **SEM-Q-N-03** · Required filter omitted → 400. P0
- **SEM-Q-N-04** · Conversion metric without entity → reject. P1
- **SEM-Q-N-05** · Caller without `semantic:query` scope → 401. P0

## Compile / query — edge
- **SEM-Q-E-01** · Joined model fan-out detected → warning + auto-dedupe. P1
- **SEM-Q-E-02** · Cumulative metric with mtd window resets at month. P1
- **SEM-Q-E-03** · Semi-additive (LAST balance) → last value per period. P1
- **SEM-Q-E-04** · Dialect-specific date_trunc per engine. P0
- **SEM-Q-E-05** · Snowflake APPROX_COUNT_DISTINCT when metric flags approx=true. P1

## Static lint
- **SEM-LINT-H-01** · Unused dimension flagged. P2
- **SEM-LINT-H-02** · Metric expression with unknown column → flagged. P1

## Test-as-user
- **SEM-TAU-H-01** · Admin "preview as user X" honours user X's RLS + column rules. P0
- **SEM-TAU-N-01** · Non-admin attempts test-as-user → 401. P0

## Security
- **SEM-S-01** · Cross-org compile attempt → 404. P0 🟣
- **SEM-S-02** · Custom expression cannot escape compile scope (no DDL). P0 🟣
- **SEM-S-03** · Filter values parameterised (no injection). P0 🟣

## Performance
- **SEM-P-01** · Compile time < 100ms for 10-metric, 5-dim request. P1 ⚡
- **SEM-P-02** · Static validator < 50ms on 50-metric model. P2 ⚡

## Regression buckets
- Compiler changes → SEM-Q-H-01..05, SEM-Q-E-04
- Static validator → SEM-N-01..04, SEM-LINT-*
