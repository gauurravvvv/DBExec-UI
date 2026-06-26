# Cache & materialisation

> Implementation companion to research module 05. Pins the
> Redis-backed result cache, the cache-key construction
> (hash of canonical SQL + RLS context + params), invalidation
> on dataset write, and the materialised-view cache for hot
> aggregations.

**Status:** 🔴 not in product. P0 — without it every dashboard
tile re-queries the warehouse on every view.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

A dashboard with 12 tiles, opened by 50 people in an hour, is
600 warehouse queries — most identical. The cache is what makes
that 12 warehouse queries + 588 cache hits. Without it we
can't keep p95 dashboard load < 5s and we can't keep the
warehouse bill manageable.

The hard parts:

1. The cache key must be **stable** under semantically-identical
   intents (canonical SQL, sorted params).
2. The cache key must **diverge** for different users when RLS
   rewrites their query (so user A's restricted result isn't
   served to user B).
3. Invalidation: when a dataset is re-materialised or a model
   is republished, all dependent cache entries should age out.
4. Cache stampede: 50 people open a cold dashboard at once;
   only one warehouse query should fire.

---

## 1. The key

```typescript
function cacheKey(args: {
  canonicalSql: string;             // from query processor canonicaliser
  paramValues: any[];                // bound values in stable order
  rlsRuleIds: string[];              // sorted ascending
  rlsParamValues: any[];             // values bound by RLS predicates
  semanticModelVersion: string | null;
  datasetVersion: string;
}): string {
  const payload = JSON.stringify({
    sql: args.canonicalSql,
    p:   args.paramValues,
    r:   args.rlsRuleIds,
    rp:  args.rlsParamValues,
    sm:  args.semanticModelVersion,
    dv:  args.datasetVersion,
  });
  return `qc:${sha256(payload).toString('hex').slice(0, 32)}`;
}
```

Why each piece:

- **canonicalSql** — captures the shape.
- **paramValues** — same shape, different user input.
- **rlsRuleIds** — Bob and Carol may match different RLS rules
  on the same query.
- **rlsParamValues** — Alice and Bob both match the same
  rule but with different attribute values (`territory`).
- **semanticModelVersion** — model rev bump invalidates cleanly.
- **datasetVersion** — same, for raw-SQL datasets.

---

## 2. Cache layer

Two tiers:

| Tier | Store | TTL | Purpose |
|---|---|---|---|
| L1 (process) | In-memory LRU (per API instance) | 60 s | Bursty repeat reads from the same instance |
| L2 (shared) | Redis | configurable per result (default 5 min) | Cross-instance + cross-user sharing |

```typescript
// src/services/cache/queryCache.ts
import { LRUCache } from 'lru-cache';

const l1 = new LRUCache<string, CachedResult>({
  max: 10_000,
  ttl: 60 * 1000,
});

export async function getCache(key: string): Promise<CachedResult | null> {
  const a = l1.get(key);
  if (a) return a;

  const b = await redis.get(`cache:${key}`);
  if (b) {
    const parsed = JSON.parse(b) as CachedResult;
    l1.set(key, parsed);
    return parsed;
  }
  return null;
}

export async function setCache(key: string, value: CachedResult, ttlSec = 300): Promise<void> {
  l1.set(key, value);
  await redis.set(`cache:${key}`, JSON.stringify(value), 'EX', ttlSec);
}
```

---

## 3. Stampede protection

```typescript
export async function getOrCompute(
  key: string,
  compute: () => Promise<CachedResult>,
  ttlSec = 300,
): Promise<CachedResult> {
  const hit = await getCache(key);
  if (hit) return hit;

  // Single-flight lock
  const lockKey = `lock:${key}`;
  const lockToken = crypto.randomUUID();
  const acquired = await redis.set(lockKey, lockToken, 'NX', 'EX', 30);

  if (!acquired) {
    // Someone else is computing — poll briefly
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const v = await getCache(key);
      if (v) return v;
    }
    // Stale lock; fall through and compute ourselves
  }

  try {
    const value = await compute();
    await setCache(key, value, ttlSec);
    return value;
  } finally {
    // Release lock if we still hold it
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1, lockKey, lockToken,
    );
  }
}
```

Single-flight ensures only one warehouse query fires per
unique key in a 30-second window.

---

## 4. Invalidation

```typescript
// Hooks
export async function invalidateOnDatasetWrite(datasetId: string): Promise<void> {
  // Bump dataset version; all keys baked with the old version naturally expire.
  // (We don't scan/delete — that's expensive at scale.)
  await connection.getRepository('Dataset').update({ id: datasetId },
    { cacheVersion: () => 'gen_random_uuid()' });
}

export async function invalidateOnSemanticPublish(modelId: string): Promise<void> {
  await connection.getRepository('SemanticModel').update({ id: modelId },
    { cacheVersion: () => 'gen_random_uuid()' });
}
```

Versioned invalidation > scan-and-delete. Old keys age out by
TTL naturally; new requests get fresh keys. Trade-off: brief
period where in-memory L1 still serves stale within its 60 s
TTL. Accepted.

Hard invalidate (admin-triggered):

```typescript
POST /admin/cache/purge
// scans cache:* and deletes; gated by org-admin role; rate-limited
```

---

## 5. Materialised aggregations

For hot aggregations (e.g. KPI tiles refreshed every minute
across all dashboards), the cache TTL approach is wasteful.
Promote to a **materialised view** maintained by a worker:

```sql
CREATE TABLE materialised_aggregation (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  source_kind   TEXT NOT NULL,                       -- 'analysis' | 'semantic_intent'
  source_id     UUID NOT NULL,
  intent_hash   TEXT NOT NULL,
  schedule      TEXT NOT NULL,                       -- cron
  target_table  TEXT NOT NULL,                       -- 'mat.org_<id>.<slug>'
  row_count_last BIGINT,
  last_run_at   TIMESTAMPTZ,
  last_run_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'active'
);
```

A BullMQ cron runs `REFRESH MATERIALIZED VIEW` (PG) or
issues `INSERT OVERWRITE` (BQ/Snowflake) on the schedule. The
query processor checks `materialised_aggregation` before
falling back to live query.

---

## 6. Controller — cache stats (admin)

```typescript
// src/controllers/cache/stats.ts
const cacheStats = async (req: Request, res: Response) => {
  const { orgData, master_db_connection } = res.locals;
  try {
    const info = await redis.info('stats');
    const dbsize = await redis.dbsize();
    const sampleKeys = await redis.scan(0, 'MATCH', 'cache:*', 'COUNT', 1000);

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, CACHE_MSG.OK, {
      keyspaceSize: dbsize,
      hitRate: parseRedisInfo(info).keyspace_hits / parseRedisInfo(info).keyspace_misses,
      samples: sampleKeys[1].length,
    });
  } catch (err: any) {
    await master_db_connection.close().catch(() => undefined);
    Logger.error(`Cache stats failed: ${err.message}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 7. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_cache_hit_total` | counter | `tier` (l1/l2), `kind` | hit rate per tier |
| `dbexec_cache_miss_total` | counter | `kind` | miss rate |
| `dbexec_cache_set_total` | counter | `kind`, `outcome` | writes |
| `dbexec_cache_stampede_lock_acquired_total` | counter | — | single-flight effectiveness |
| `dbexec_cache_stampede_lock_failed_total` | counter | — | concurrent compute attempts |
| `dbexec_cache_size_bytes` | gauge | — | Redis memory |
| `dbexec_cache_ttl_seconds` | histogram | `kind` | TTL distribution |

Target hit rate: 60% steady-state on dashboard tile reads.

---

## 8. Security & threat model

| Threat | Mitigation |
|---|---|
| Cross-user data leak via missing RLS in key | RLS rule IDs + rule param values part of the key; rls hook required before cache lookup |
| Cache poisoning by malicious payload | Cache writes only from server-side after successful query; clients can't influence value |
| Redis exposure | Network-isolated; AUTH required; TLS on the wire if cross-VPC |
| Stale data after admin RLS change | Admin endpoint invalidates by bumping rule version; alternative: ACL-change hook |
| OOM via huge result cached | Per-entry size cap (default 5 MB); larger results bypass cache |
| Stampede lock held forever | 30s TTL on lock; lua-eval check-and-delete prevents wrong release |
| Tampered cache entry | We trust Redis; signature on payload optional (overkill for most orgs) |

---

## 9. Runbook

**Symptom: cache hit rate low (< 30%).**
1. Check key cardinality. Too many users with distinct RLS
   attribute values = cache effectively per-user.
2. Promote hot aggregations to materialised views.

**Symptom: redis memory growth.**
1. TTLs too long? Default 5 min; some org may have configured 1
   hour. Tune.
2. Single-entry huge? `dbexec_cache_size_bytes` histogram
   shows distribution.

**Symptom: stale data after a metric change.**
1. Did the model publish bump `cacheVersion`? Check the publish
   controller's audit row.

---

## 10. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| L1 lookup | < 1 ms | 1 ms | 5 ms |
| L2 lookup (Redis) | 2 ms | 10 ms | 50 ms |
| L2 write | 3 ms | 15 ms | 100 ms |
| Stampede wait | 200 ms | 2 s | 30 s |
| Materialised refresh (10M rows) | depends | depends | 10 min |

---

## 11. Migration & rollout

1. **Migrations:** `materialised_aggregation` table; `cache_version` column on `dataset` and `semantic_model`.
2. **Backfill:** populate `cache_version = gen_random_uuid()` for existing rows.
3. **Feature flag:** `feature.query_cache_v2`. Off by default
   for first soak.
4. **Per-org TTL config:** admin can set `org.cache_default_ttl_sec`.

---

## 12. Open questions

1. **CDN-level cache** for fully-public dashboards: trade-off
   between simplicity and the personalisation embed flow.
2. **Differential caching** — cache the heavy join + reapply
   filters at edge. Defer; complex.
3. **Warm cache on dashboard open** — fire a batch of L2
   prefetches when the user lands on the dashboard. P2 nicety.

---

## 13. References

- [05-cache-materialisation.md](../research/modules/05-cache-materialisation.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- Redis docs (SETNX, EVAL, INFO stats)
- node `lru-cache` v10
