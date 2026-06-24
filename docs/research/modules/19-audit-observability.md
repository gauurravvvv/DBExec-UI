# 19 · Audit, Observability, Telemetry

## Audit (DBExec has this)

Existing `audit_log` table. Extensions:

- **Hash chain** — each row's `hash = SHA256(prev_hash + row_payload)`.
  Tamper-evident.
- **Retention policy** — config per org; rows older than N days move
  to cold storage / get truncated.
- **Export** — already supported; add NDJSON format for SIEMs
  (Splunk, Datadog).

## Observability

OpenTelemetry tracing on every endpoint:

```ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('dbexec-api');

export function traced<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try { return await fn(); }
    catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally { span.end(); }
  });
}
```

Spans: `auth.login`, `dataset.preview`, `analysis.render`,
`dashboard.export.pdf`, `query.compile`, `query.execute`.

Metrics:

- `dbexec_requests_total{route, status}`
- `dbexec_query_duration_ms{datasource, dataset}` (histogram)
- `dbexec_cache_hit_ratio` (gauge)
- `dbexec_pool_in_use{datasource}` (gauge)
- `dbexec_subscriptions_sent_total{channel, status}`

Prometheus endpoint at `/metrics` (guarded by an internal token).

## Slow-query log

```sql
CREATE TABLE slow_query (
  id          bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL,
  dataset_id  uuid,
  caller_id   uuid,
  source      varchar(32) NOT NULL,           -- preview|analysis|dashboard|alert
  sql         text NOT NULL,
  bindings    jsonb,
  duration_ms int NOT NULL,
  rows        int,
  cache_hit   boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
```

Threshold: log if duration > 1s. Admin UI under Operations.

## Tests

- **AUD-HASH-H-01** — modifying a row breaks the chain
- **OBS-METRIC-H-01** — /metrics endpoint returns prometheus format
- **OBS-TRACE-H-01** — request emits span with correlation-id

## Appendix · Review additions

- **Real-time SSE stream** of audit events for a "Live activity" page.
- **Audit free-text search** across summary + metadata.
- **Cohort analytics**: WAU / MAU per role.
- **Health endpoints**: `/healthz/live`, `/healthz/ready` with deps.
- **OpenTelemetry OTLP** export (HTTP + gRPC).
- **Per-org log level** overrides (set debug for support tickets).
- **Sentry-style error grouping** by stack trace fingerprint.
- **Correlation IDs** propagated through every request.

### Schema delta

```sql
ALTER TABLE audit_log
  ADD COLUMN correlation_id varchar(64),
  ADD COLUMN summary text;            -- denormalised free-text for search

CREATE INDEX ON audit_log USING GIN(to_tsvector('english', summary));

CREATE TABLE error_event (
  id            uuid PRIMARY KEY,
  organisation_id uuid,
  fingerprint   varchar(64) NOT NULL,
  count         int NOT NULL DEFAULT 1,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  message       text,
  stack         text,
  context       jsonb
);
CREATE UNIQUE INDEX ON error_event (organisation_id, fingerprint);
```

### Health endpoints

```ts
router.get('/healthz/live', (_, res) => res.json({ ok: true }));
router.get('/healthz/ready', async (_, res) => {
  const checks = await Promise.allSettled([
    masterDb.query('SELECT 1'),
    redis.ping(),
    emailService.ping(),
  ]);
  const ok = checks.every(c => c.status === 'fulfilled');
  res.status(ok ? 200 : 503).json({
    ok,
    checks: ['db', 'redis', 'email'].map((n, i) => ({
      name: n, status: checks[i].status,
    })),
  });
});
```

### Test IDs

- OBS-HEALTH-H-01 — `/healthz/ready` returns 200 only when all deps up
- OBS-CORR-H-01 — correlation id flows through nested calls
- OBS-STREAM-H-01 — SSE pushes audit events to live page
- OBS-FT-H-01 — audit free-text search returns matches
- OBS-ERR-H-01 — duplicate exceptions group by fingerprint
