# Audit, observability, telemetry

> Implementation companion to research module 19. Pins the
> hash-chained audit log, OpenTelemetry bootstrap,
> Prometheus metrics conventions, health endpoints, slow-query
> log, and Sentry-style error grouping.

**Status:** 🟡 partial — `audit_log` table exists, no chain, no
correlation IDs, no health split.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

Three customers ask for three different cuts:

- Auditor: "show me every action by user X between Y and Z,
  with proof it wasn't tampered with."
- Oncall: "production p95 spiked, where's the trace?"
- Customer success: "what did user X do before their export
  failed?"

One observability stack serves all three. The discipline is in
making everything traceable to the same `correlation_id`.

---

## 1. Data model — audit log

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL,
  actor_user_id UUID,                                  -- null = system
  actor_kind    TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'system' | 'api_token' | 'service_account' | 'subscription'
  actor_token_id UUID,
  impersonator_user_id UUID,                            -- if an admin is impersonating
  action        TEXT NOT NULL,                          -- 'create' | 'update' | 'delete' | 'login' | 'export' | …
  module        TEXT NOT NULL,                          -- 'dashboard' | 'dataset' | …
  entity_name   TEXT,
  entity_id     UUID,
  metadata      JSONB,
  ip            INET,
  user_agent    TEXT,
  correlation_id TEXT,
  request_id    TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Hash chain
  prev_hash     BYTEA,
  row_hash      BYTEA NOT NULL
);

CREATE INDEX idx_audit_org_at ON audit_log(org_id, at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id, at DESC);
CREATE INDEX idx_audit_entity ON audit_log(module, entity_id);
CREATE INDEX idx_audit_correlation ON audit_log(correlation_id);
```

---

## 2. Hash chain

```typescript
// src/services/audit/chain.ts
import { createHash } from 'crypto';

export async function appendAudit(
  connection: Connection,
  row: Omit<AuditRow, 'id' | 'rowHash' | 'prevHash' | 'at'>,
): Promise<void> {
  await connection.transaction(async (tx: any) => {
    // Serialise per-org so the chain is well-defined
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('audit_chain:' || $1))`, [row.orgId]);
    const last = await tx.query(
      `SELECT row_hash FROM audit_log WHERE org_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [row.orgId],
    );
    const prevHash = last[0]?.row_hash ?? null;

    const canonical = canonicalise({ ...row, at: new Date(), prevHash });
    const rowHash = createHash('sha256').update(canonical).digest();

    await tx.query(`
      INSERT INTO audit_log (org_id, actor_user_id, actor_kind, actor_token_id,
                             impersonator_user_id, action, module, entity_name, entity_id,
                             metadata, ip, user_agent, correlation_id, request_id,
                             prev_hash, row_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [row.orgId, row.actorUserId, row.actorKind, row.actorTokenId, row.impersonatorUserId,
        row.action, row.module, row.entityName, row.entityId, row.metadata, row.ip, row.userAgent,
        row.correlationId, row.requestId, prevHash, rowHash]);
  });
}

function canonicalise(row: any): string {
  return JSON.stringify(row, Object.keys(row).sort());
}
```

Verification (admin endpoint):

```typescript
// POST /admin/audit/verify  { orgId, fromDate, toDate }
export async function verifyChain(orgId: string, from: Date, to: Date): Promise<VerifyResult> {
  const rows = await connection.query(`
    SELECT * FROM audit_log
    WHERE org_id = $1 AND at BETWEEN $2 AND $3
    ORDER BY id ASC
  `, [orgId, from, to]);

  let prev: Buffer | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null)?.toString('hex') !== prev?.toString('hex')) {
      return { ok: false, brokenAt: r.id };
    }
    const expected = createHash('sha256').update(canonicalise({ ...r, rowHash: undefined })).digest();
    if (Buffer.compare(expected, r.row_hash) !== 0) {
      return { ok: false, brokenAt: r.id };
    }
    prev = r.row_hash;
  }
  return { ok: true, count: rows.length };
}
```

---

## 3. Correlation ID propagation

Every API request gets a correlation ID at the edge:

```typescript
// src/middleware/correlationId.ts
import { v4 as uuidv4 } from 'uuid';
import { als } from '../services/als';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-correlation-id'] as string | undefined;
  const correlationId = incoming ?? `req_${uuidv4()}`;
  res.setHeader('x-correlation-id', correlationId);
  als.run({ correlationId }, () => next());
}
```

All log lines, audit rows, queue jobs, webhook calls, and trace
spans read from AsyncLocalStorage so they share the ID. A
single `correlationId` query lets you reconstruct a flow that
crossed worker → DB → external HTTP.

---

## 4. OpenTelemetry bootstrap

```typescript
// src/services/telemetry/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export const otelSdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'dbexec-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.GIT_SHA ?? 'dev',
    'dbexec.region': process.env.REGION ?? 'unknown',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-express': { ignoreLayers: [/healthz$/, /readyz$/] },
      '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: true },
      '@opentelemetry/instrumentation-redis-4': {},
      '@opentelemetry/instrumentation-http': {},
    }),
  ],
});

otelSdk.start();
```

Manual spans for hot paths:

```typescript
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('dbexec');

export async function executeQueryTraced(...) {
  return tracer.startActiveSpan('query.execute', async (span) => {
    span.setAttribute('dbexec.org_id', orgId);
    span.setAttribute('dbexec.datasource_type', dsType);
    try {
      const r = await execute(...);
      span.setAttribute('dbexec.rows', r.rowCount);
      return r;
    } catch (err: any) {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

---

## 5. Prometheus metrics conventions

Naming: `dbexec_<module>_<metric>_<unit>`. Use `_total` for
counters, `_seconds` / `_ms` for histograms.

```typescript
// src/services/telemetry/metrics.ts
import client from 'prom-client';

export const httpRequestsTotal = new client.Counter({
  name: 'dbexec_http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const httpRequestDuration = new client.Histogram({
  name: 'dbexec_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

// Expose
app.get('/metrics', basicAuth, async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});
```

Cardinality discipline: never label by user/org IDs (high
cardinality). Use `org_tier` (`free`/`team`/`enterprise`)
instead when needed.

---

## 6. Health endpoints

Split into three concerns:

| Endpoint | Status | What it checks |
|---|---|---|
| `GET /healthz` | always 200 if process alive | k8s liveness probe |
| `GET /readyz` | 200 if upstream deps reachable | k8s readiness probe |
| `GET /statusz` | always 200 with JSON body | UI/ops dashboard |

```typescript
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/readyz', async (_req, res) => {
  const checks = await Promise.allSettled([
    redis.ping(),
    masterPool.query('SELECT 1'),
  ]);
  const ok = checks.every(c => c.status === 'fulfilled');
  res.status(ok ? 200 : 503).json({ ok, checks: checks.map(serialise) });
});

app.get('/statusz', async (_req, res) => {
  res.json({
    version: process.env.GIT_SHA,
    uptimeSec: Math.floor(process.uptime()),
    region: process.env.REGION,
    deps: {
      redis: await safePing(redis.ping),
      master_db: await safePing(() => masterPool.query('SELECT NOW()')),
    },
  });
});
```

---

## 7. Slow-query log

Every query execution emits a log when above threshold:

```typescript
const SLOW_QUERY_THRESHOLD_MS = 1500;

export function logSlowQuery(args: { sql: string; params: any[]; ms: number; org: string; user: string }) {
  if (args.ms < SLOW_QUERY_THRESHOLD_MS) return;
  Logger.warn(JSON.stringify({
    evt: 'slow_query',
    sql_hash: sha256(args.sql).slice(0, 16),
    sql_excerpt: args.sql.slice(0, 200),
    ms: args.ms,
    org_id: args.org,
    user_id: args.user,
    correlation_id: als.getStore()?.correlationId,
  }));
  slowQueriesTotal.inc({ org: args.org });
}
```

The admin UI surfaces a "Slow queries (last 24h)" panel grouped
by `sql_hash`, top 20 by p95.

---

## 8. Error grouping

A Sentry-style fingerprint per error, normalised to suppress
noise:

```typescript
export function fingerprintError(err: Error, ctx: { route?: string }): string {
  // Strip ID/UUID/path-specific bits from the message
  const norm = (err.message || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d+\b/g, '<n>')
    .slice(0, 200);
  const stackTopFrame = (err.stack || '').split('\n')[1]?.trim().replace(/:\d+:\d+/g, '') ?? '';
  return sha256(`${err.name}|${norm}|${stackTopFrame}|${ctx.route ?? ''}`).slice(0, 16);
}

export function reportError(err: Error, req: Request) {
  const fp = fingerprintError(err, { route: req.path });
  errorTotal.inc({ fingerprint: fp });
  Logger.error(JSON.stringify({
    evt: 'error',
    fingerprint: fp,
    name: err.name,
    msg: err.message,
    stack: err.stack,
    route: req.path,
    correlation_id: als.getStore()?.correlationId,
  }));
}
```

Admin UI groups errors by fingerprint with counts + first/last
seen + sample correlation IDs.

---

## 9. Controller — audit list

```typescript
// src/controllers/audit/list.ts
const listAudit = async (req: Request, res: Response) => {
  const { fromDate, toDate, actorUserId, action, module, entityId, correlationId,
          page = 1, limit = 50 } = req.query as any;
  const { orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const qb = connection.createQueryBuilder('AuditLog', 'a')
      .where('a.org_id = :org', { org: orgData.orgId });
    if (fromDate) qb.andWhere('a.at >= :from', { from: fromDate });
    if (toDate) qb.andWhere('a.at < :to', { to: toDate });
    if (actorUserId) qb.andWhere('a.actor_user_id = :u', { u: actorUserId });
    if (action) qb.andWhere('a.action = :a', { a: action });
    if (module) qb.andWhere('a.module = :m', { m: module });
    if (entityId) qb.andWhere('a.entity_id = :e', { e: entityId });
    if (correlationId) qb.andWhere('a.correlation_id = :c', { c: correlationId });

    const [rows, total] = await Promise.all([
      qb.orderBy('a.at', 'DESC')
        .offset((Number(page) - 1) * Number(limit))
        .limit(Math.min(Number(limit), 200))
        .getMany(),
      qb.getCount(),
    ]);
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, AUDIT_MSG.OK, { rows, total });
  } catch (err: any) {
    Logger.error(`List audit failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 10. FE — admin observability dashboard

Existing admin console gains four panels (module 24 ties it together):

1. **Audit log** — paginated, filterable, "verify chain" button.
2. **Slow queries** — top 20 by p95, group by hash, click to
   see canonical SQL + correlation IDs.
3. **Error groups** — fingerprint-grouped errors with sparklines.
4. **Active sessions** — currently-open SSE + queries-in-flight
   per user.

---

## 11. Observability of observability

| Metric | Type | Purpose |
|---|---|---|
| `dbexec_audit_append_ms` | histogram | chain append latency (lock+insert) |
| `dbexec_audit_verify_ms` | histogram | verify-chain endpoint cost |
| `dbexec_audit_verify_broken_total` | counter | tampering attempt counter |
| `dbexec_otel_span_dropped_total` | counter | exporter pressure |
| `dbexec_metrics_high_cardinality_label_total` | counter | cardinality discipline alarm |

---

## 12. Security & threat model

| Threat | Mitigation |
|---|---|
| Audit log tampering | Hash chain; verify-chain endpoint; admin alert on broken chain |
| Audit metadata leak (e.g. password) | Whitelist of fields per module's `AUDIT_FIELDS`; everything else dropped |
| Replay of correlation ID | Correlation IDs are informational; tied to ULIDs which are time-sortable but not secret |
| Log volume DoS | Per-IP rate limit on `error` events emitted to telemetry sink |
| Metrics scraping unauth | `/metrics` behind basic auth + IP allowlist |
| Trace payload leaks secret | Auto-instrumentation sanitised: `Authorization` headers stripped; SQL parameters off by default |
| Slow-query log SQL leak | `sql_excerpt` capped at 200 chars; full SQL only in trace span (which has auth) |

---

## 13. Runbook

**Symptom: chain broken.**
1. `POST /admin/audit/verify` returns `brokenAt`. Pull that
   row + its neighbours.
2. Almost always: a code bug wrote a row outside the appender
   (legacy path). Patch the path; the chain is permanently
   broken at that boundary — document it, re-seed a new chain
   from that point.

**Symptom: traces missing.**
1. `dbexec_otel_span_dropped_total` rising = exporter back
   pressure. Increase batch processor max size.

**Symptom: high-cardinality metric label.**
1. Spike on `dbexec_metrics_high_cardinality_label_total`. Grep
   recent metric defs for `userId` / `orgId` labels.

---

## 14. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| audit append (hash chain) | 5 ms | 20 ms | 200 ms |
| audit list page (50 rows) | 40 ms | 150 ms | 1 s |
| chain verify (10k rows) | 200 ms | 800 ms | 5 s |
| chain verify (1M rows) | 30 s | 90 s | 5 min |
| trace span overhead | < 0.5 ms | 2 ms | 10 ms |
| metrics endpoint scrape | 10 ms | 50 ms | 500 ms |

---

## 15. Migration & rollout

1. **Migrations:** add hash-chain columns (`prev_hash`,
   `row_hash`) to `audit_log`; add `correlation_id`,
   `request_id`, `actor_kind`, `actor_token_id`,
   `impersonator_user_id` columns.
2. **Backfill:** existing rows get `row_hash` computed from a
   deterministic canonicaliser; `prev_hash` chains them in `id`
   order.
3. **OTel bootstrap:** ship behind `feature.otel`. Default ON
   for new orgs.
4. **Health split:** add `/healthz` (always-on), `/readyz` (deps),
   `/statusz` (rich). Old `/health` aliases `/readyz`.

---

## 16. Open questions

1. **Audit log retention** — orgs ask for 7 years for SOC2.
   Cold-storage move after 1 year (S3 + Glacier).
2. **Per-tenant Prom labels** — currently we use `org_tier`.
   Should premium orgs get their own labels? Cardinality
   trade-off.
3. **Distributed correlation across regions** — when an export
   spans regions, the `correlation_id` must propagate via the
   inter-region RPC headers. Confirm wired.

---

## 17. References

- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- OpenTelemetry semantic conventions
- prom-client npm
- RFC 4180 / RFC 3339 timestamps
- OWASP audit log cheat-sheet
