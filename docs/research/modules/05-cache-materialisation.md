# 05 · Cache & Materialisation

> The biggest performance lever. Today every preview round-trips the
> warehouse. With Redis + materialisation we cut warehouse spend by
> 80-95% and tail-latency from seconds to milliseconds.

**Depends on:** Datasource (01), Query Compiler (04)
**Unblocks:** Scheduled refresh (15), Live dashboards, Aggregate awareness
**Maturity:** 🔴 none

---

## 1. Industry baseline

| Tool | Cache | Pre-aggregation |
|---|---|---|
| Tableau | Hyper extracts (file-based) | Hyper |
| Power BI | Vertipaq in-memory column store | Aggregations + composite models |
| Looker | Persistent Derived Tables (PDTs) | Aggregate awareness |
| Metabase | "Native cache" sqlite/Postgres | Models with refresh schedules |
| Superset | Redis result cache + CACHE_CONFIG | Async queries via Celery |
| Cube | Redis + pre-aggregations | Yes, sophisticated |

DBExec should follow Superset's model: Redis result cache + BullMQ
async + materialised tables on the managed datasource.

## 2. DBExec today

Nothing.

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| CACHE-G01 | Redis result cache | P0 |
| CACHE-G02 | BullMQ scheduler + worker | P0 |
| CACHE-G03 | Materialised tables (PDT) | P1 |
| CACHE-G04 | Aggregate awareness | P1 |
| CACHE-G05 | Cache invalidation API + UI | P0 |
| CACHE-G06 | Stampede prevention | P0 |
| CACHE-G07 | Per-dataset TTL config | P0 |
| CACHE-G08 | Per-org cache size cap | P1 |
| CACHE-G09 | Cache hit-rate telemetry | P1 |
| CACHE-G10 | Cache key versioning (bust on dataset edit) | P0 |

## 4. Target architecture

### 4.1 Two layers

```
                       Layer A: Redis result cache
         hash(sql + bindings + datasetVersion + rlsKey) → rows
         TTL: 5 min default, per-dataset override

                       Layer B: Materialised tables
         dataset_id → table on managed datasource
         Refreshed on cron, holds last N hours / days of data
         Used by aggregate awareness
```

### 4.2 Redis keys

```
DBExec:cache:result:v1:<sha256>                    JSON result + meta
DBExec:cache:result:v1:<sha256>:lock               short-lived lock
DBExec:cache:dataset:<datasetId>:version           int
DBExec:cache:rls:<userId>:<datasetId>              JSON predicate list
DBExec:cache:filter:v1:<analysisId>:<userId>       FE-driven cache
DBExec:cache:thumbnail:dashboard:<dashId>          PNG bytes
DBExec:queue:dbexec-schedule:*                     BullMQ keys
```

### 4.3 Cache key composition

```ts
function cacheKeyFor({
  sql, bindings, datasetVersion, rlsHash, dialect,
}: KeyParts): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ sql, bindings, datasetVersion, rlsHash, dialect }))
    .digest('hex');
}
```

Dataset edit bumps `dataset.version`; every cached row keyed by the
old version becomes unreachable (orphaned, expires by TTL).

### 4.4 Materialised tables

```sql
CREATE TABLE materialised_view (
  id            uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  dataset_id    uuid NOT NULL,
  target_table  varchar(255) NOT NULL,
  cron          varchar(64),
  query_sql     text NOT NULL,         -- the query that builds it
  grain         varchar(16),           -- for aggregate awareness
  dimensions    jsonb,                 -- which dims it covers
  metrics       jsonb,                 -- which metrics it covers
  last_refresh_at timestamptz,
  last_status   varchar(16),
  last_duration_ms int,
  row_count     bigint,
  size_bytes    bigint
);
```

Aggregate awareness picks the smallest mv whose dimensions ⊇ request.dims.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET   | `/cache/stats` | Org-wide hit rate, size |
| POST  | `/cache/invalidate/dataset/:id` | Bust a dataset's keys |
| POST  | `/cache/invalidate/org` | Bust everything for the org |
| POST  | `/cache/warm/dataset/:id` | Pre-compute first-N popular queries |
| GET   | `/materialised/list` | List PDTs |
| POST  | `/materialised` | Create PDT |
| POST  | `/materialised/:id/refresh` | Force refresh now |

## 6. Code recipes

### 6.1 Redis singleflight (already in master doc; here for completeness)

```ts
async getOrCompute<T>(key: string, ttlSecs: number, compute: () => Promise<T>) {
  const hit = await this.redis.get(key);
  if (hit) {
    metrics.counter('cache_hit').inc();
    return JSON.parse(hit);
  }
  metrics.counter('cache_miss').inc();
  const lockKey = `${key}:lock`;
  const gotLock = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
  if (!gotLock) {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached);
    }
  }
  try {
    const t0 = Date.now();
    const value = await compute();
    metrics.histogram('cache_miss_compute_ms').observe(Date.now() - t0);
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSecs);
    return value;
  } finally {
    await this.redis.del(lockKey);
  }
}
```

### 6.2 BullMQ worker

```ts
import { Queue, Worker } from 'bullmq';
const conn = { host: REDIS_HOST, port: REDIS_PORT };

export const Q = new Queue('dbexec-schedule', { connection: conn });

new Worker('dbexec-schedule', async (job) => {
  switch (job.name) {
    case 'materialise:refresh': return refreshMv(job.data.id);
    case 'cache:warm':         return warmCache(job.data.id);
    case 'subscription:run':   return runSub(job.data.id);
    case 'alert:check':        return checkAlert(job.data.id);
  }
}, { connection: conn, concurrency: 5 });
```

### 6.3 MV refresh

```ts
async function refreshMv(id: string) {
  const mv = await MaterialisedView.findOne({ where: { id } });
  const managed = await ManagedDatasourceService.poolFor(mv.organisationId);
  const tmp = `${mv.targetTable}_tmp`;
  const t0 = Date.now();
  try {
    await managed.query(`DROP TABLE IF EXISTS ${q(tmp)}`);
    await managed.query(`CREATE TABLE ${q(tmp)} AS (${mv.querySql})`);
    await managed.query(`BEGIN`);
    await managed.query(`DROP TABLE IF EXISTS ${q(mv.targetTable)}`);
    await managed.query(`ALTER TABLE ${q(tmp)} RENAME TO ${q(mv.targetTable)}`);
    await managed.query(`COMMIT`);
    const [{ count }] = await managed.query(`SELECT COUNT(*) FROM ${q(mv.targetTable)}`);
    await MaterialisedView.update(id, {
      lastRefreshAt: new Date(),
      lastStatus: 'ok',
      lastDurationMs: Date.now() - t0,
      rowCount: count,
    });
  } catch (e) {
    await MaterialisedView.update(id, {
      lastRefreshAt: new Date(),
      lastStatus: 'failed',
      lastDurationMs: Date.now() - t0,
    });
    throw e;
  }
}
```

### 6.4 Aggregate-aware route in compiler

```ts
function pickAggregate(req: SemanticQueryRequest, mvs: MaterialisedView[]) {
  const dims = new Set(req.dimensions);
  // Pick the mv whose dimensions ⊇ request dims AND has smallest row_count.
  const candidates = mvs.filter(mv =>
    (mv.dimensions as string[]).every(d => dims.has(d) || isSubGrain(mv.grain!, d, req)) &&
    req.metrics.every(m => (mv.metrics as string[]).includes(m))
  );
  return candidates.sort((a, b) => a.rowCount - b.rowCount)[0] ?? null;
}
```

## 7. Test plan

- **CACHE-H-01** — first query against a dataset → miss → compute → store
- **CACHE-H-02** — second identical query → hit → no warehouse call
- **CACHE-H-03** — dataset edit bumps version → next query is a miss
- **CACHE-N-01** — two concurrent identical queries → only one compute
- **CACHE-N-02** — Redis down → graceful fallback to direct query
- **CACHE-E-01** — TTL expiry mid-query → next caller recomputes
- **CACHE-E-02** — invalidate API removes all keys for a dataset
- **CACHE-E-03** — materialised view refresh keeps old table available
  until rename (no read interruption)

## 8. Migration & rollout

1. Add Redis as optional infrastructure. Cache miss path is a no-op
   when Redis is unset → existing behaviour preserved.
2. Roll out result caching first (no schema changes).
3. Add `materialised_view` table + worker second.
4. Aggregate awareness ships behind a per-org flag.

## 9. Open questions

- Should we expose cache TTL to users per analysis (override)?
  Recommended: yes, on the analysis Properties panel.
- Should the result cache be partitioned per user, or shared org-wide
  with RLS in the key? **RLS in key** so cached rows respect each
  user's filters. Cache key includes `rlsHash`.

## Appendix · Review additions

- **Stale-while-revalidate** — serve stale, refresh in background.
- **Cache tiers** — L1 in-process LRU + L2 Redis.
- **Compression** — gzip JSON > 4 KB.
- **Chunked storage** — split > Redis 512MB string limit.
- **Cost-aware caching** — bigger queries cached longer.
- **Per-org cache namespace** + LRU eviction at quota.
- **Negative caching** — cache failures with short TTL.
- **Cache key includes RLS predicates** — so each user gets their own row set.
- **MV dependency cascade** — base dataset change cascades MV refresh.

### Code

- SWR implementation listed in REVIEW-DEEP.md `## 05`.
- Chunked write listed there too.

### Tests

- CACHE-SWR-H-01 — stale return + background refresh
- CACHE-CHUNK-H-01 — 50MB result round-trips
- CACHE-QUOTA-H-01 — org-wide LRU eviction kicks in
- CACHE-NEG-H-01 — failure cached short TTL
- CACHE-MV-DEP-H-01 — base dataset change cascades MV
