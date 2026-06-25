# 19 · Audit, Observability, Telemetry

> The "what happened, when, and by whom" surface. Audit log for
> business / compliance use cases; telemetry (traces, metrics,
> logs) for ops investigation; health endpoints for liveness +
> readiness. Three audiences, one shared substrate.
>
> Sister modules:
> [10 · Auth](10-auth-rbac-sso.md) (audit subjects + actors),
> [18 · Versioning](18-versioning-lineage.md) (entity-level
> history; audit is action-level), [22 · API & SDK](22-api-sdk-plugins.md)
> (audit export / SIEM forwarder).

**Depends on:** All write-path modules (the audit emitter wraps them)
**Unblocks:** SOC2 / HIPAA evidence, incident investigation
**Maturity:** 🟡 audit logging exists; observability is minimal

---

## 1. Industry baseline

| Tool | Audit | Tracing | Metrics | SIEM export |
|---|---|---|---|---|
| **Looker** | Audit + system activity Explore | none | system metrics dashboard | log forwarder |
| **Tableau** | Postgres-based audit log | none | OS-level | TSM logs |
| **Power BI** | Activity log (M365 audit) | none | Azure Monitor | Log Analytics |
| **Hex** | App-level audit | OpenTelemetry | DataDog | API |
| **Notion** | per-page activity | none | none | SCIM |
| **GitHub** | audit log API | none | none | streaming export |

**The patterns to copy:**

- **Audit logs are append-only**. Edits are forbidden. Tamper-
  evidence comes from a hash chain (each row carries the hash
  of the previous row).
- **Three pillars of observability** — logs (structured),
  metrics (counters/gauges), traces (per-request spans). Pick a
  vendor-neutral wire format (OpenTelemetry) and let the operator
  pipe to whatever backend.
- **Correlation IDs everywhere**. Every request gets one, it
  propagates through logs/traces/audit; investigators can
  cross-reference.
- **Health endpoints distinguish liveness from readiness**.
  `/healthz/live` = "process is up". `/healthz/ready` = "DB,
  Redis, downstream services reachable". Kubernetes pattern.
- **SIEM forwarder** is a paid-tier feature most enterprises want.

## 2. DBExec today

- `audit_log` (master) + `audit_log_s` (per-org) tables. Each row
  carries `userId, action, entityName, entityId, metadata, ip,
  occurredAt`. Snapshot of the entity dump in `metadata.entity`.
- Logging via `winston` to stdout. No correlation ID. No spans.
  No metrics endpoint.
- `/healthz` returns hardcoded 200; no actual checks.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| AUD-G01 | Hash-chained audit log (tamper-evident) | P0 | S |
| AUD-G02 | Correlation ID middleware + propagation to logs | P0 | S |
| AUD-G03 | OpenTelemetry traces (per-request span) | P0 | M |
| AUD-G04 | Metrics counters / histograms (Prom) | P0 | M |
| AUD-G05 | Health `/healthz/live` + `/healthz/ready` | P0 | S |
| AUD-G06 | Error grouping (Sentry-style) | P1 | M |
| AUD-G07 | Audit log SSE live stream (admin UI) | P1 | M |
| AUD-G08 | Audit search by user / action / entity / time | P0 | M |
| AUD-G09 | Audit export (CSV / JSON / SIEM webhook) | P1 | M |
| AUD-G10 | Tamper-detection endpoint (verify chain) | P1 | S |
| AUD-G11 | PII redaction in audit metadata | P0 | S |
| AUD-G12 | Structured log JSON (one event = one line) | P0 | S |
| AUD-G13 | Slow-query log table | P1 | M |
| AUD-G14 | Rate-limited login activity (anti-enumeration) | P1 | S |
| AUD-G15 | Per-org "you may export this audit log" admin permission | P1 | S |
| AUD-G16 | Customer-controlled retention window | P1 | M |
| AUD-G17 | Anomaly detection on audit stream (impossible-travel etc.) | P2 | L |

## 4. Target architecture

### 4.1 Three pillars + audit

```
┌─ Logs ─────────────────────────────────────────────┐
│  structured JSON, one event per line               │
│  correlation_id, user_id, org_id on every line     │
│  → stdout → fluentd / vector / Loki                │
└────────────────────────────────────────────────────┘
┌─ Metrics ──────────────────────────────────────────┐
│  prom-client counters / histograms / gauges        │
│  → /metrics endpoint (Prom scrape)                 │
└────────────────────────────────────────────────────┘
┌─ Traces ───────────────────────────────────────────┐
│  OpenTelemetry spans, one per request + per IO     │
│  → OTLP HTTP exporter → Tempo / Jaeger / DataDog   │
└────────────────────────────────────────────────────┘

       │                  │                  │
       └───── correlation_id binds the three ─┘

┌─ Audit (the 4th pillar) ───────────────────────────┐
│  business-meaningful events, append-only,          │
│  hash-chained, exportable to SIEM                  │
└────────────────────────────────────────────────────┘
```

### 4.2 Audit hash chain

```sql
ALTER TABLE audit_log
  ADD COLUMN correlation_id varchar(64),
  ADD COLUMN prev_row_hash  varchar(64),
  ADD COLUMN row_hash       varchar(64);
ALTER TABLE audit_log_s
  ADD COLUMN correlation_id varchar(64),
  ADD COLUMN prev_row_hash  varchar(64),
  ADD COLUMN row_hash       varchar(64);

CREATE INDEX audit_log_chain   ON audit_log   (organisation_id, occurred_at DESC, id);
CREATE INDEX audit_log_s_chain ON audit_log_s (organisation_id, occurred_at DESC, id);
```

`row_hash = sha256(prev_row_hash || canonical_json(row))`. Chain is
per-org and per-table.

```ts
import { createHash } from 'node:crypto';

function canonicalJson(row: any): string {
  const sortedKeys = Object.keys(row).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) out[k] = row[k];
  return JSON.stringify(out);
}

export function computeRowHash(prevHash: string | null, row: any): string {
  return createHash('sha256')
    .update((prevHash ?? '') + canonicalJson({
      userId: row.userId, module: row.module, action: row.action,
      entityName: row.entityName, entityId: row.entityId,
      requestMethod: row.requestMethod, requestPath: row.requestPath,
      responseCode: row.responseCode, metadata: row.metadata,
      ipAddress: row.ipAddress,
      occurredAt: row.occurredAt instanceof Date
        ? row.occurredAt.toISOString()
        : row.occurredAt,
    }))
    .digest('hex');
}

async function appendAuditWithChain(conn: DataSource, table: string, row: any) {
  await conn.transaction(async (tx) => {
    const prev = await tx.query(`
      SELECT row_hash FROM ${table}
      WHERE organisation_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1 FOR UPDATE`, [row.organisationId]);

    const prevHash = prev[0]?.row_hash ?? null;
    const ts = new Date();
    const filled = { ...row, occurredAt: ts };
    const rowHash = computeRowHash(prevHash, filled);

    await tx.query(`
      INSERT INTO ${table} (
        user_id, organisation_id, module, action, entity_name, entity_id,
        request_method, request_path, response_code, metadata,
        ip_address, user_agent, correlation_id, prev_row_hash, row_hash, occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [filled.userId, filled.organisationId, filled.module, filled.action,
       filled.entityName, filled.entityId, filled.requestMethod, filled.requestPath,
       filled.responseCode, filled.metadata, filled.ipAddress, filled.userAgent,
       filled.correlationId, prevHash, rowHash, ts]);
  });
}
```

### 4.3 Tamper verification endpoint

```ts
// GET /admin/audit/verify-chain?from=&to=
async function verifyAuditChain(req, res) {
  const orgId = res.locals.orgData.id;
  const rows = await master_db_connection.query(`
    SELECT id, prev_row_hash, row_hash, user_id, module, action,
           entity_name, entity_id, request_method, request_path,
           response_code, metadata, ip_address, occurred_at
    FROM audit_log_s
    WHERE organisation_id = $1
    ORDER BY occurred_at ASC, id ASC`, [orgId]);

  let prevHash: string | null = null;
  let firstBad: any = null;
  let n = 0;
  for (const r of rows) {
    if (r.prev_row_hash !== prevHash) {
      firstBad = { id: r.id, expected: prevHash, actual: r.prev_row_hash };
      break;
    }
    const expected = computeRowHash(prevHash, {
      userId: r.user_id, module: r.module, action: r.action,
      entityName: r.entity_name, entityId: r.entity_id,
      requestMethod: r.request_method, requestPath: r.request_path,
      responseCode: r.response_code, metadata: r.metadata,
      ipAddress: r.ip_address, occurredAt: r.occurred_at,
    });
    if (expected !== r.row_hash) {
      firstBad = { id: r.id, expected, actual: r.row_hash };
      break;
    }
    prevHash = r.row_hash;
    n++;
  }
  return sendResponse(res, true, 200, '', {
    verifiedRowCount: n, totalRowCount: rows.length,
    firstBadRow: firstBad, ok: firstBad === null,
  });
}
```

### 4.4 Correlation ID middleware

```ts
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const correlationStore = new AsyncLocalStorage<{ id: string }>();

export default function correlationIdMiddleware(req, res, next) {
  const id = (req.headers['x-correlation-id'] as string) ?? randomUUID();
  res.locals.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  correlationStore.run({ id }, () => next());
}

export function currentCorrelationId(): string | null {
  return correlationStore.getStore()?.id ?? null;
}

// Logger auto-injects it:
const Logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format((info) => {
      info.correlationId = currentCorrelationId();
      return info;
    })(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
```

### 4.5 OpenTelemetry

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes as SRA } from '@opentelemetry/semantic-conventions';

export function startTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SRA.SERVICE_NAME]: 'dbexec-api',
      [SRA.SERVICE_VERSION]: process.env.SERVICE_VERSION ?? 'dev',
      [SRA.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: true }),
      new RedisInstrumentation(),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
}

// Custom spans
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('dbexec-api');
await tracer.startActiveSpan('runAnalysisQuery', async (span) => {
  span.setAttributes({ 'analysis.id': id, 'org.id': orgId });
  try { /* ... */ }
  catch (e) {
    span.recordException(e as Error);
    span.setStatus({ code: 2, message: (e as Error).message });
    throw e;
  } finally { span.end(); }
});
```

### 4.6 Metrics

```ts
import client from 'prom-client';
client.collectDefaultMetrics();

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});
export const queryDuration = new client.Histogram({
  name: 'datasource_query_duration_ms',
  help: 'External datasource query duration',
  labelNames: ['datasource_type', 'org_id', 'kind'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000],
});
export const datasourceErrors = new client.Counter({
  name: 'datasource_errors_total',
  labelNames: ['datasource_type', 'reason'],
});
export const dashboardRenders = new client.Counter({
  name: 'dashboard_render_total',
  labelNames: ['org_id', 'mode'],
});
export const activeSessions = new client.Gauge({
  name: 'active_sessions',
  help: 'Active user sessions',
  async collect() {
    this.set(await UserSession.count({ where: { revokedAt: IsNull() } }));
  },
});

export default function metricsMiddleware(req, res, next) {
  const t0 = Date.now();
  res.on('finish', () => {
    httpDuration
      .labels(req.method, req.route?.path ?? req.path, String(res.statusCode))
      .observe(Date.now() - t0);
  });
  next();
}

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});
```

### 4.7 Health endpoints

```ts
app.get('/healthz/live', (_, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/healthz/ready', async (_, res) => {
  const checks = await Promise.allSettled([
    masterDb.query('SELECT 1'),
    redis.ping(),
  ]);
  const names = ['db', 'redis'];
  const results = checks.map((c, i) => ({
    name: names[i],
    status: c.status === 'fulfilled' ? 'ok' : 'failed',
    reason: c.status === 'rejected' ? String((c as any).reason) : null,
  }));
  const ok = results.every(r => r.status === 'ok');
  res.status(ok ? 200 : 503).json({ ok, checks: results });
});

app.get('/healthz/status', AuthMiddleware, requirePerm('systemAdmin'), async (_, res) => {
  res.json({
    version: process.env.SERVICE_VERSION ?? 'dev',
    uptime_s: process.uptime(),
    memory: process.memoryUsage(),
    eventLoopLag_ms: await measureEventLoopLag(),
    activeConnections: pool.totalCount,
  });
});
```

### 4.8 Slow query log

```sql
CREATE TABLE slow_query_log (
  id              bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL,
  user_id         uuid,
  datasource_id   uuid,
  surface         varchar(32),
  surface_id      uuid,
  duration_ms     int NOT NULL,
  sql_preview     varchar(1000),
  row_count       bigint,
  bytes_returned  bigint,
  status          varchar(16),
  error_message   text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slow_query_log_org ON slow_query_log (organisation_id, occurred_at DESC);
```

```ts
const SLOW_THRESHOLD_MS = 5_000;

export async function instrumentedQuery<T = any>(
  pool: any, sql: string, params: any[],
  ctx: { orgId: string; userId?: string; datasourceId: string;
         surface: string; surfaceId?: string },
): Promise<T> {
  const t0 = Date.now();
  let rows: T;
  let status: 'ok'|'timeout'|'error' = 'ok';
  let error: string | undefined;
  try {
    rows = await pool.query(sql, params);
    return rows;
  } catch (e: any) {
    error = e.message;
    status = /timeout/i.test(error ?? '') ? 'timeout' : 'error';
    throw e;
  } finally {
    const dur = Date.now() - t0;
    queryDuration.labels('external', ctx.orgId, ctx.surface).observe(dur);
    if (dur > SLOW_THRESHOLD_MS || status !== 'ok') {
      SlowQueryLog.insert({
        organisationId: ctx.orgId,
        userId: ctx.userId,
        datasourceId: ctx.datasourceId,
        surface: ctx.surface,
        surfaceId: ctx.surfaceId,
        durationMs: dur,
        sqlPreview: sql.slice(0, 1000),
        status,
        errorMessage: error,
      }).catch(() => {});
    }
  }
}
```

### 4.9 Audit search + live stream

```ts
async function searchAudit(req, res) {
  const { q, user, action, module, from, to } = req.query;
  const orgId = res.locals.orgData.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 50);

  const where: string[] = ['organisation_id = $1'];
  const params: any[] = [orgId];
  let i = 1;
  if (user)   { params.push(user);   where.push(`user_id = $${++i}`); }
  if (action) { params.push(action); where.push(`action = $${++i}`); }
  if (module) { params.push(module); where.push(`module = $${++i}`); }
  if (from)   { params.push(new Date(from as string)); where.push(`occurred_at >= $${++i}`); }
  if (to)     { params.push(new Date(to as string));   where.push(`occurred_at <= $${++i}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(entity_name ILIKE $${++i} OR action ILIKE $${i})`);
  }
  params.push(limit, (page - 1) * limit);

  const rows = await master_db_connection.query(`
    SELECT id, user_id, action, module, entity_name, entity_id,
           request_method, request_path, response_code,
           metadata, ip_address, correlation_id, occurred_at
    FROM audit_log_s
    WHERE ${where.join(' AND ')}
    ORDER BY occurred_at DESC
    LIMIT $${i + 1} OFFSET $${i + 2}`, params);

  return sendResponse(res, true, 200, '', { rows });
}

// SSE tail
async function auditStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.flushHeaders();
  const orgId = res.locals.orgData.id;
  const sub = sse.subscribe(`audit:${orgId}`, (row) => {
    res.write(`data: ${JSON.stringify(row)}\n\n`);
  });
  req.on('close', () => sse.unsubscribe(`audit:${orgId}`, sub));
}
```

### 4.10 PII redaction

```ts
// src/shared/utility/auditMetadata.ts
export const AUDIT_FIELDS = {
  USER: ['id','username','email','firstName','lastName','status','isFirstLogin'],
  // NOT: password, otp, refreshToken, setupToken, anything *_enc
  DATASET: ['id','name','description','datasourceId','type','status'],
  // …
};

export function snapshotEntity<T extends Record<string, any>>(
  entity: T,
  allowlist: readonly (keyof T)[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of allowlist) out[k as string] = entity[k];
  return out;
}
```

### 4.11 Retention

```sql
CREATE TABLE org_audit_retention (
  organisation_id     uuid PRIMARY KEY,
  retention_days      int NOT NULL DEFAULT 365,
  archive_after_days  int,
  delete_after_days   int
);
```

Nightly:

```sql
INSERT INTO audit_log_s_archive
  SELECT * FROM audit_log_s
  WHERE organisation_id = $1
    AND occurred_at < now() - ($2 * interval '1 day');
DELETE FROM audit_log_s
  WHERE organisation_id = $1
    AND occurred_at < now() - ($2 * interval '1 day');
```

Hash chain on archive table starts fresh from the last hot row's
hash — chain integrity is per-physical-table.

### 4.12 SIEM forwarder

```sql
CREATE TABLE org_audit_forwarder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  url             text NOT NULL,
  signing_secret_enc bytea,
  format          varchar(16) NOT NULL DEFAULT 'json',
  filter_modules  text[],
  filter_min_severity varchar(16),
  status          smallint NOT NULL DEFAULT 1,
  created_on      timestamptz NOT NULL DEFAULT now()
);
```

Background worker tails new audit rows and POSTs them HMAC-signed.

### 4.13 Error grouping

```sql
CREATE TABLE error_group (
  fingerprint     varchar(64) PRIMARY KEY,
  first_seen      timestamptz NOT NULL,
  last_seen       timestamptz NOT NULL,
  occurrence_count int NOT NULL DEFAULT 1,
  error_type      varchar(255),
  message_sample  text,
  stack_top       text,
  module          varchar(64),
  status          varchar(16) NOT NULL DEFAULT 'open',
  resolved_by     uuid,
  resolved_at     timestamptz
);
CREATE TABLE error_occurrence (
  id              bigserial PRIMARY KEY,
  fingerprint     varchar(64) NOT NULL REFERENCES error_group(fingerprint),
  user_id         uuid,
  organisation_id uuid,
  correlation_id  varchar(64),
  request_path    varchar(500),
  metadata        jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_occ_fp ON error_occurrence (fingerprint, occurred_at DESC);
```

```ts
app.use((err, req, res, next) => {
  const fp = createHash('sha256')
    .update(`${err.name}:${moduleFromStack(err)}:${topFrame(err)}`)
    .digest('hex');
  ErrorGroup.upsert({
    fingerprint: fp,
    firstSeen: new Date(),
    lastSeen: new Date(),
    errorType: err.name,
    messageSample: err.message?.slice(0, 1000),
    stackTop: err.stack?.split('\n').slice(0,3).join('\n'),
    module: moduleFromStack(err),
  }, ['fingerprint']);
  ErrorOccurrence.insert({
    fingerprint: fp,
    userId: res.locals.loggedInId,
    organisationId: res.locals.orgData?.id,
    correlationId: res.locals.correlationId,
    requestPath: req.originalUrl,
    metadata: { method: req.method, status: res.statusCode },
  }).catch(() => {});
  next(err);
});
```

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/audit` | Search audit log |
| GET | `/admin/audit/:id` | Detail |
| GET | `/admin/audit/stream` | SSE tail |
| GET | `/admin/audit/verify-chain` | Integrity check |
| POST | `/admin/audit/export` | CSV / JSON / CEF export (async) |
| GET | `/admin/errors` | Error group list |
| POST | `/admin/errors/:fp/ack` | Acknowledge |
| POST | `/admin/errors/:fp/resolve` | Mark resolved |
| GET | `/admin/slow-queries` | Recent slow queries |
| GET | `/healthz/live` | Liveness |
| GET | `/healthz/ready` | Readiness |
| GET | `/healthz/status` | Detailed (admin only) |
| GET | `/metrics` | Prom scrape |
| POST | `/admin/audit-forwarders` | Register SIEM forwarder |
| POST | `/admin/audit-forwarders/:id/test` | Send test event |

## 6. FE specs

### 6.1 Audit explorer

```
┌──────────────────────────────────────────────────────────────┐
│ Audit log                                                     │
│ Search: [user OR action OR entity...   ]                      │
│ User: [▾ All]  Action: [▾ All]  Module: [▾ All]               │
│ Time: [Last 24h ▾]                                            │
│  Time         User       Action  Module   Entity     ↘       │
│  14:32:21     Alice C.   UPDATE  Dataset  invoices_q3 ▸      │
│  14:31:55     Bob S.     CREATE  Analysis Q3-Trend    ▸      │
│  14:30:11     [system]   DELETE  RlsRule  apac-only   ▸      │
│  [Verify chain integrity]  [Export CSV]  [Forwarder]         │
└──────────────────────────────────────────────────────────────┘
```

Click row → full metadata, diff (when CRUD on entity), IP, UA,
correlation ID with link to trace.

### 6.2 Errors UI

```
Error groups (124 open · 18 ack · 287 resolved)

⚠ × 1.2K  RangeError in datasetCompiler
         "Maximum call stack size exceeded"
         Last seen: 5m ago · Module: semantic
         [Occurrences]  [Ack]  [Resolve]

⚠ × 142   DatabaseError in dashboardRun
         "canceling statement due to statement timeout"
         Last seen: 1h ago · Module: dashboards
```

## 7. Validators

```ts
export const auditSearchSchema = z.object({
  q: z.string().max(500).optional(),
  user: z.string().uuid().optional(),
  action: z.string().max(32).optional(),
  module: z.string().max(64).optional(),
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const forwarderSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  format: z.enum(['json','cef','leef']).default('json'),
  filterModules: z.array(z.string().max(64)).optional(),
  filterMinSeverity: z.enum(['info','warning','critical']).optional(),
  signingSecret: z.string().min(32).max(128),
});
```

## 8. Test plan

```
AUD-CHAIN-H-01  N inserts → row_hash = sha256(prev + row)
AUD-CHAIN-H-02  verify endpoint walks chain → ok=true
AUD-CHAIN-N-01  mutate one row → verify finds firstBadRow
AUD-CHAIN-H-03  concurrent writers → chain linear (FOR UPDATE)

AUD-CORR-H-01   incoming X-Correlation-Id preserved
AUD-CORR-H-02   absent → middleware generates UUID
AUD-CORR-H-03   logger output includes correlationId
AUD-CORR-H-04   audit row.correlation_id matches request

AUD-OTEL-H-01   span per request
AUD-OTEL-H-02   span attributes include user/org/route
AUD-OTEL-H-03   exception sets span status code=error
AUD-OTEL-H-04   nested pg span attached to parent

AUD-METRICS-H-01 /metrics returns Prom text
AUD-METRICS-H-02 http histogram increments per req
AUD-METRICS-H-03 active_sessions gauge fetches on scrape

AUD-HEALTH-H-01 /healthz/live → 200 ok
AUD-HEALTH-H-02 /healthz/ready with DB down → 503 + reason
AUD-HEALTH-H-03 /healthz/ready with Redis down → 503

AUD-SEARCH-H-01  filter by user → correct results
AUD-SEARCH-H-02  filter by date range → correct
AUD-STREAM-H-01  SSE pushes new rows in <500ms

AUD-PII-N-01     audit metadata never contains password
AUD-PII-N-02     audit never contains otp/refresh_token
AUD-PII-H-01     allowlist gate — new column doesn't auto-leak

AUD-SLOW-H-01    5.5s query → slow_query_log row
AUD-SLOW-H-02    timeout → status='timeout'

AUD-ERR-H-01     throw in controller → error_group upserted
AUD-ERR-H-02     same error twice → occurrence_count=2
AUD-ERR-H-03     ack endpoint sets status=acknowledged

AUD-RETAIN-H-01  retention=30d, 31-day row → moved to archive
AUD-RETAIN-H-02  archive table chain integrity verifiable

AUD-FWD-H-01     forwarder configured → POST within 1min
AUD-FWD-H-02     POST is HMAC-signed
AUD-FWD-N-01     forwarder 500 → retry; DLQ after 5
```

## 9. Migration & rollout

1. Phase 1 — correlation ID middleware, structured logger,
   OpenTelemetry, metrics endpoint, health endpoints.
2. Phase 2 — hash chain on audit log + verify endpoint.
3. Phase 3 — audit search UI + SSE stream.
4. Phase 4 — slow query log + error grouping.
5. Phase 5 — retention.
6. Phase 6 — SIEM forwarder + export.

## 10. Open questions

- **Cross-table chain reference** — last hot row's hash = first
  archive row's prev_hash. Adds defence against archive tampering.
  v1.5.
- **Trace sampling** — 100% noisy at scale; adaptive sampling per
  route based on error rate + duration. Defer.
- **Metric cardinality** — `org_id` as Prom label can blow up
  cardinality. Bucket by tier instead, or expose org-specific
  metrics only on admin endpoint.
- **Anomaly detection** — impossible travel, brute force; build
  as a module consuming the audit stream.
- **Customer access to own audit** — today admin-only. Compliance
  teams might want per-user "my actions". Defer.

## 11. References

- OpenTelemetry: <https://opentelemetry.io/docs/instrumentation/js/>
- Prom node client: <https://github.com/siimon/prom-client>
- Tamper-evident logs: <https://research.swtch.com/tlog>
- Sentry error grouping: <https://docs.sentry.io/concepts/data-management/event-grouping/>
- Splunk CEF: <https://docs.splunk.com/Documentation/CIM/latest/User/Howtouseatypicalsearch>

## Appendix · Review additions

- **/healthz/live + /healthz/ready** split — §4.7.
- **Correlation IDs end-to-end** — §4.4.
- **OpenTelemetry** with HTTP/Express/PG/Redis — §4.5.
- **Prom metrics + /metrics endpoint** — §4.6.
- **Slow query log** — §4.8.
- **Error grouping** — §4.13.
- **Hash-chain tamper detection** — §4.2 + §4.3.
- **Customer-controlled retention** — §4.11.
- **SIEM forwarder** — §4.12.
- **PII allowlist in snapshotEntity** — §4.10.
