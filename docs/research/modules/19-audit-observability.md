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
