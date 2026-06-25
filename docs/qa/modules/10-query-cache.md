# 10 · Query Processor + Cache — Deep Test Cases

## Fixtures
- Redis running (env `REDIS_URL`)
- BullMQ worker available
- Dataset with deterministic SQL output

## Cache — happy
- **CACHE-H-01** · First query → miss → compute → store → 200. P0
- **CACHE-H-02** · Second identical query → hit → no warehouse call (verify driver counter). P0
- **CACHE-H-03** · Dataset edit bumps version → next call is a miss. P0
- **CACHE-H-04** · Per-dataset TTL override respected. P1
- **CACHE-H-05** · Stale-while-revalidate serves stale + refreshes async. P1

## Cache — negative
- **CACHE-N-01** · Two concurrent identical queries → only one compute (singleflight). P0
- **CACHE-N-02** · Redis down → graceful fallback to direct query. P0
- **CACHE-N-03** · Cache key collision (forced) → invalidate + recompute. P1
- **CACHE-N-04** · Quota exceeded → LRU evicts oldest. P1
- **CACHE-N-05** · Compute failure cached short-TTL (negative cache). P1

## Cache — edge
- **CACHE-E-01** · TTL expiry mid-query → next caller recomputes. P1
- **CACHE-E-02** · Invalidate API removes all keys for dataset. P0
- **CACHE-E-03** · 50MB result chunked + round-trips. P1
- **CACHE-E-04** · MV refresh keeps old table available until rename. P1
- **CACHE-E-05** · Cache key includes RLS hash → users' caches don't collide. P0 🟣

## Materialised views

- **MV-H-01** · Create MV; cron triggers refresh; rows populate. P0
- **MV-H-02** · Aggregate awareness picks the smallest qualifying MV. P1
- **MV-H-03** · Incremental refresh appends new rows only. P1
- **MV-N-01** · MV target_table name collision → reject. P1
- **MV-E-01** · Base dataset change cascades MV refresh. P1
- **MV-E-02** · MV refresh failure recorded with error; previous version still served. P1

## Query processor

- **QP-H-01** · Simple SELECT compiles to PG correctly. P0
- **QP-H-02** · date_trunc month works on PG / MySQL / MSSQL / SF / BQ. P0
- **QP-H-03** · LIMIT/OFFSET works on all dialects. P0
- **QP-N-01** · DROP TABLE in user SQL → safelist rejects. P0 🟣
- **QP-N-02** · Multi-statement input rejected. P0 🟣
- **QP-N-03** · Identifier with semicolon → quoter sanitises. P0 🟣
- **QP-E-01** · Empty dimensions → no GROUP BY. P1
- **QP-E-02** · Empty filters → no WHERE. P1
- **QP-E-03** · 0 rows returned → columns still present. P2
- **QP-CANCEL-H-01** · Cancel running query → caller gets 499. P1
- **QP-NULL-H-01** · `ORDER BY x ASC NULLS LAST` rendered per dialect. P1

## Security
- **CACHE-S-01** · Cached rows for user A never returned to user B (RLS in key). P0 🟣
- **QP-S-01** · Safelist resists nested-CTE DDL attempts. P0 🟣
- **QP-S-02** · No interpolation of user input into SQL string (always parameterised). P0 🟣

## Performance
- **CACHE-P-01** · 1000 cache hits/sec sustained on local Redis. P1 ⚡
- **CACHE-P-02** · p95 cache-hit latency < 5ms. P1 ⚡
- **QP-P-01** · Compile p95 < 50ms for typical queries. P1 ⚡

## Regression buckets
- Cache implementation → CACHE-* + CACHE-E-05 (most critical)
- Safelist parser → QP-N-01..03, QP-S-01..02
