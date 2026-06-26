# Public API, SDKs, plugins, custom viz

> Implementation companion to research module 22. Pins the
> public REST API conventions (versioning, idempotency,
> rate-limits, deprecation), OpenAPI generation from Zod,
> webhooks, TypeScript/Python SDK auto-gen, and the
> sandboxed-iframe plugin runtime.

**Status:** 🟡 partial — internal endpoints exist; no public
versioning, no Idempotency-Key, no OpenAPI, no webhooks, no
plugins.
**Effort:** L (~4 weeks).

---

## 0. Problem statement

Two distinct customers:

- **Automation customer:** wants `curl` + an SDK to script
  DBExec — create dashboards, trigger exports, embed
  links, listen for events.
- **Plugin customer:** wants to add a custom visualisation or
  custom transform without forking the codebase.

Both deserve a deliberate public-API story.

---

## 1. Versioning

URL-versioned: `/api/v1/...`. Breaking changes get a new
prefix (`/api/v2/...`). Per-endpoint deprecation via
headers:

```
Deprecation: true
Sunset: Sun, 31 Dec 2027 23:59:59 GMT
Link: </api/v2/dashboards>; rel="alternate"
Warning: 299 dbexec "Endpoint will be removed; see /api/v2/dashboards"
```

---

## 2. Idempotency

Every state-changing endpoint accepts `Idempotency-Key` header
(UUID v4). Server stores `(orgId, key) → (statusCode, body)`
for 24h:

```typescript
// src/middleware/idempotency.ts
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key || !isUuid(key)) return next();

  const orgId = req.user!.orgId;
  const cacheKey = `idem:${orgId}:${key}`;

  const existing = await redis.get(cacheKey);
  if (existing) {
    const { status, body } = JSON.parse(existing);
    res.status(status).json(body);
    return;
  }

  // Hijack the response to capture
  const origJson = res.json.bind(res);
  res.json = (body: any) => {
    redis.set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', 86_400)
      .catch(() => undefined);
    return origJson(body);
  };
  next();
}
```

Apply to every public `POST` / `PATCH` / `DELETE`.

---

## 3. Rate limiting

Standard headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 743
X-RateLimit-Reset: 1719360000
```

```typescript
// src/middleware/rateLimit.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const buckets = {
  read: new RateLimiterRedis({ storeClient: redis, points: 1000, duration: 60, keyPrefix: 'rl:r' }),
  write: new RateLimiterRedis({ storeClient: redis, points: 300, duration: 60, keyPrefix: 'rl:w' }),
  ai: new RateLimiterRedis({ storeClient: redis, points: 30, duration: 60, keyPrefix: 'rl:ai' }),
};

export function rateLimitMiddleware(bucket: keyof typeof buckets) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.tokenId ?? req.user?.userId ?? req.ip;
    try {
      const result = await buckets[bucket].consume(key, 1);
      res.setHeader('X-RateLimit-Limit', buckets[bucket].points);
      res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + result.msBeforeNext / 1000));
      next();
    } catch (rej: any) {
      res.setHeader('Retry-After', Math.ceil(rej.msBeforeNext / 1000));
      res.status(429).json({ error: 'RATE_LIMITED', retryAfter: rej.msBeforeNext });
    }
  };
}
```

Per-token quotas surfaced in admin console.

---

## 4. OpenAPI generation

Every endpoint declares its Zod schemas; a build-time step
generates an OpenAPI 3.1 spec:

```typescript
// src/openapi/registry.ts
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export const registry = new OpenAPIRegistry();

// Each route registers itself
import './routes/dashboards.openapi';
import './routes/analyses.openapi';
// ...

// At build time
export function generateOpenApi() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'DBExec API', version: '1.0.0' },
    servers: [{ url: 'https://api.dbexec.com/v1' }],
  });
}
```

Per-route:

```typescript
// src/routes/dashboards.openapi.ts
import { z } from 'zod';
import { registry } from '../openapi/registry';

const DashboardSchema = registry.register('Dashboard', z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  tabCount: z.number().int(),
}));

registry.registerPath({
  method: 'get',
  path: '/dashboards/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: DashboardSchema } } },
    404: { description: 'Not found' },
  },
});
```

Spec served at `/api/v1/openapi.json` and `/api/v1/docs` (Swagger UI).

---

## 5. SDKs

Auto-generated from OpenAPI. Two targets:

- **TypeScript:** `openapi-typescript-codegen`. Distributed as
  `@dbexec/sdk-js` on npm. Promise-based, typed.
- **Python:** `openapi-python-client`. Distributed as
  `dbexec-sdk` on PyPI.

Both add a thin hand-written auth layer + retry policy on top.

```typescript
// TS SDK usage
import { DBExec } from '@dbexec/sdk-js';
const client = new DBExec({ apiKey: process.env.DBEXEC_TOKEN });
const dashboards = await client.dashboards.list({ page: 1 });
await client.exports.create({ dashboardId: 'dash_abc', format: 'pdf' });
```

Versioning: SDK version tracks the API minor version. Breaking
changes ship as a new major.

---

## 6. Webhooks

### 6.1 Subscription model

```sql
CREATE TABLE webhook_endpoint (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  signing_secret_enc BYTEA NOT NULL,
  events        TEXT[] NOT NULL,           -- ['export.completed', 'subscription.failed', ...]
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_delivery (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   UUID NOT NULL REFERENCES webhook_endpoint(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  attempt       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'success' | 'failed' | 'gave_up'
  http_status   INTEGER,
  response_body TEXT,
  delivered_at  TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.2 Signing

```typescript
// HMAC SHA-256 over timestamp + body
const ts = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
const header = `t=${ts},v1=${sig}`;
// X-DBExec-Signature: t=1719360000,v1=abcd...

// Receiver verification
function verify(header: string, body: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const expectedSig = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');
  if (!timingSafeEqual(Buffer.from(parts.v1, 'hex'), Buffer.from(expectedSig, 'hex'))) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(parts.t, 10)) > 300) return false;
  return true;
}
```

### 6.3 Retry policy

Exponential backoff: 30s, 2 min, 10 min, 1h, 6h. After 5
failures, mark `gave_up` and (after 24h of consecutive
failures) disable the endpoint with an admin notification.

### 6.4 Event catalog

| Event | Payload | When |
|---|---|---|
| `export.completed` | { exportJobId, dashboardId, downloadUrl, expiresAt } | export finishes |
| `export.failed` | { exportJobId, dashboardId, reason } | export fails terminally |
| `subscription.delivered` | { subscriptionId, deliveryLogId, channel } | subscription fires |
| `subscription.failed` | { subscriptionId, reason, consecutiveFailures } | subscription fails |
| `share_link.viewed` | { shareLinkId, viewer, ip, ts } | view recorded |
| `alert.triggered` | { alertId, severity, value, threshold } | alert fires |
| `user.invited` | { userId, invitedBy, role } | user invited |
| `dashboard.created` / `updated` / `deleted` | { dashboardId, actor } | lifecycle |
| `dataset.created` / `updated` / `deleted` | … | lifecycle |
| `backup.completed` / `failed` | { backupId, byteCount, ts } | module 28 |

---

## 7. Plugin runtime (custom viz, transform, channel)

### 7.1 Manifest

```yaml
# plugin.yaml
name: my-radial-chart
version: 1.2.0
kind: viz                       # 'viz' | 'transform' | 'channel'
entry: dist/index.js
permissions:
  - read:chart_data             # for viz: read the data
  - write:chart_output          # for viz: render to canvas
signature: <ed25519 signature over plugin bytes>
```

### 7.2 Sandbox

Each plugin loads in a **sandboxed iframe** with `sandbox`
attribute set to most-restrictive:

```html
<iframe
  src="/plugin-host?id=<pluginId>&version=<ver>"
  sandbox="allow-scripts"
  style="border:0; width:100%; height:100%"
></iframe>
```

`allow-scripts` only — no `allow-same-origin`. Communication
via postMessage with a typed protocol.

```typescript
// Host side (DBExec)
window.addEventListener('message', (ev) => {
  if (ev.source !== iframeWindow) return;
  const msg = ev.data as PluginMessage;
  switch (msg.type) {
    case 'plugin.ready':       postToPlugin({ type: 'data', payload: prepareDataForPlugin() }); break;
    case 'plugin.dataRequest': postToPlugin({ type: 'data', payload: getMoreData(msg.range) }); break;
    case 'plugin.event':       handlePluginEvent(msg.event, msg.payload); break;  // e.g. cell click
    case 'plugin.error':       reportPluginError(msg.message, msg.stack); break;
  }
});

// Plugin side (sandboxed)
parent.postMessage({ type: 'plugin.ready' }, '*');
parent.addEventListener('message', (ev) => {
  if (ev.data.type === 'data') renderChart(ev.data.payload);
});
```

### 7.3 Lifecycle

```sql
CREATE TABLE plugin (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  current_version TEXT NOT NULL,
  signature_pubkey TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_version (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id     UUID NOT NULL REFERENCES plugin(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  bundle_url    TEXT NOT NULL,
  bundle_sha256 BYTEA NOT NULL,
  manifest      JSONB NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Plugins are versioned; an org admin pins which version is
active. Updates are opt-in.

---

## 8. Controller — create webhook endpoint

```typescript
// src/controllers/webhook/create.ts
const createWebhookEndpoint = async (req: Request, res: Response) => {
  const { name, url, events } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    // URL allowlist: must be https + not loopback
    if (!url.startsWith('https://')) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, WH_MSG.NOT_HTTPS);
    }
    const resolved = await guardedDnsLookup(url);
    if (isPrivateIp(resolved.address)) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, WH_MSG.PRIVATE_IP);
    }

    const secret = crypto.randomBytes(32).toString('hex');
    const { enc, dekId } = await encryptSecret(secret, orgData.orgId);

    const ep = await connection.getRepository('WebhookEndpoint').save({
      orgId: orgData.orgId, name, url, signingSecretEnc: enc, dekId,
      events, isEnabled: true, createdBy: loggedInId,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.WEBHOOK, action: AUDIT_ACTIONS.CREATE,
      entityName: 'WebhookEndpoint', entityId: ep.id,
      metadata: { url, eventCount: events.length },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, WH_MSG.CREATED, { ...ep, signingSecret: secret });
  } catch (err: any) {
    Logger.error(`Create webhook endpoint failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_api_request_total` | counter | `version`, `route`, `status` | volume by status |
| `dbexec_api_idempotency_hit_total` | counter | — | replay rate |
| `dbexec_api_rate_limit_blocks_total` | counter | `bucket` | rate-limit pressure |
| `dbexec_webhook_dispatch_total` | counter | `event`, `outcome` | reliability |
| `dbexec_webhook_dispatch_ms` | histogram | `event` | latency |
| `dbexec_plugin_load_ms` | histogram | `plugin` | sandbox cold-start |
| `dbexec_plugin_error_total` | counter | `plugin`, `kind` | plugin reliability |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| API key in logs | Auth middleware strips Authorization header from log enrichment |
| Idempotency replay across orgs | Key namespaced by orgId |
| Webhook to internal IPs | SSRF guard + HTTPS only enforced |
| Webhook replay | HMAC + 5-min timestamp window |
| Plugin code escape | Sandboxed iframe + postMessage-only IPC + no `allow-same-origin` |
| Plugin asks for too much data | `permissions` declared in manifest; org admin reviews on install |
| Plugin signature spoof | Pluginsigned with maintainer's ed25519; org admin pins the pubkey |
| Plugin bundles malicious npm dep | All bundles served from DBExec's plugin registry; npm fetches happen build-time, scanned |
| Rate-limit bypass via multiple tokens | Per-org rate limit ceiling stacks across tokens |
| API key leak triggers all events | Per-token scope tree (module 10) limits blast radius |

---

## 11. Runbook

**Symptom: customer's webhook receiver returns 200 but logs no
delivery.**
1. They probably aren't verifying the signature; ours arrives
   fine. Send them the verifier code.

**Symptom: customer hits 429 constantly.**
1. Inspect their `X-RateLimit-*` headers in our logs. They're
   probably polling. Suggest webhooks instead.

**Symptom: plugin freezes the page.**
1. The iframe sandbox isolates it; the host page stays
   responsive. Disable the plugin from admin console.

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Public API middleware chain | 5 ms | 20 ms | 100 ms |
| Idempotency lookup | 2 ms | 10 ms | 50 ms |
| Webhook dispatch (single endpoint) | 100 ms | 500 ms | 30 s |
| OpenAPI generation (build time) | 1 s | 3 s | 30 s |
| Plugin cold-load | 200 ms | 800 ms | 5 s |

---

## 13. Migration & rollout

1. **Migrations:** add `webhook_endpoint`, `webhook_delivery`,
   `plugin`, `plugin_version`.
2. **API v1 freeze:** existing endpoints stabilised under `/api/v1`.
3. **OpenAPI publish:** automated on every release tag.
4. **SDK publish:** automated, version pinned to API version.
5. **Webhook beta:** dispatch worker behind
   `feature.webhooks`; one design-partner.
6. **Plugin beta:** off by default; manual whitelist of
   plugins per org.

---

## 14. Open questions

1. **GraphQL** — REST is the lowest common denominator; add
   GraphQL later if customers ask.
2. **WebSocket subscription API** — for "live data" customers;
   defer until use cases concrete.
3. **Marketplace** — customers publish plugins for other
   customers. v3.
4. **OAuth-based 3rd-party access** — instead of API tokens,
   allow a 3rd-party app to ask "Alice, grant me read:dashboards
   in your DBExec". Defer.

---

## 15. References

- [22-api-sdk-plugins.md](../research/modules/22-api-sdk-plugins.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- RFC 8030 / Stripe webhook signing convention
- @asteasolutions/zod-to-openapi
- openapi-typescript-codegen
- openapi-python-client
- HTML5 iframe sandbox attribute
