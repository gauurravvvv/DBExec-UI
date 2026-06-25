# 22 · Public API, SDKs, Plugins, Custom Visualisations

> Programmatic surface. REST + GraphQL endpoints, official SDKs in
> the languages your customers actually use, plugin model for
> custom visualisations / data transforms / channel adapters, and
> a webhook event bus that's the inverse of the inbound API.
>
> Sister modules:
> [10 · Auth](10-auth-rbac-sso.md) (API tokens), [15 ·
> Scheduling](15-scheduling-alerts.md) (webhook delivery), [18 ·
> Versioning](18-versioning-lineage.md) (YAML workspace export
> via the API), [14 · Sharing](14-share-embed.md) (Embed SDK).

**Depends on:** Auth (10), Audit (19), everything else (the API
mirrors the platform's internal modules)
**Unblocks:** Customers building automation, dbt-style git workflows,
custom visual marketplaces
**Maturity:** 🔴 internal API exists; no public-facing API surface,
  no SDK, no plugin model

---

## 1. Industry baseline

| Tool | REST | GraphQL | Webhooks | SDK languages | Plugins | Custom viz |
|---|---|---|---|---|---|---|
| **Tableau** | yes | no | partial | JavaScript, Python | yes (Extensions API) | yes (Extensions) |
| **Power BI** | yes | no | yes | .NET, JS, Python | yes (Custom Visuals) | yes (R/Python/JS) |
| **Looker** | yes | no | yes | Python, Ruby, Java, Kotlin, Swift, TypeScript | yes (Custom Visualization API) | yes |
| **Metabase** | yes | no | no | unofficial | yes (Source plugins) | partial |
| **Hex** | yes | no | yes | Python | no | yes (notebook cells) |
| **Mode** | yes | no | yes | Python | no | partial |
| **Superset** | yes | no | yes | Python | yes | yes (chart plugins) |
| **dbt** | yes | no | yes | Python | yes (adapters) | n/a |

**The patterns to copy:**

- **REST as the primary surface**, GraphQL as a v2 read-only
  optimisation (most customers don't need it).
- **API tokens scoped by permission**, not all-or-nothing — exactly
  the same permission tree the UI consumes.
- **Idempotency-Key header** on every POST. Customers will retry.
- **Rate limits** with `X-RateLimit-*` headers — token-bucket per
  app + per IP.
- **OpenAPI document** generated from Zod schemas, served from
  `/openapi.json`. ReDoc at `/docs`.
- **Webhook signing** — HMAC-SHA256 with timestamped replay window
  (module 15 §4.7).
- **Versioned API path** (`/api/public/v1`) so the internal
  `/api/v1` can evolve without breaking customers.
- **Plugin model**: pure-JS UMD bundles loaded into a sandboxed
  iframe with a `postMessage` protocol. Same shape as Looker
  Custom Visualizations.

## 2. DBExec today

- Internal `/api/v1/*` exists but the contract isn't published.
- No API tokens — auth is JWT-only.
- No OpenAPI spec.
- No SDK in any language.
- No webhooks (although module 15 wires the engine for
  subscriptions/alerts).
- No plugin model. All visuals are built-in ECharts types.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| API-G01 | API token entity + create/rotate/revoke endpoints | P0 | M |
| API-G02 | Public API namespace `/api/public/v1/*` | P0 | M |
| API-G03 | OpenAPI document generation from Zod | P0 | M |
| API-G04 | ReDoc / Scalar docs page | P0 | S |
| API-G05 | Idempotency-Key middleware | P0 | S |
| API-G06 | Rate-limit middleware with headers | P0 | S |
| API-G07 | Per-token scope check | P0 | M |
| API-G08 | Per-token allowed-IP list | P1 | S |
| API-G09 | Deprecation headers (`Sunset`, `Deprecation`) | P1 | S |
| API-G10 | Pagination cursor convention (already in shared util) | P0 | S |
| API-G11 | Webhook subscription registry + delivery worker | P0 | M |
| API-G12 | Event catalog (which events DBExec emits) | P0 | S |
| API-G13 | Webhook receiver verification helpers (per-lang) | P1 | S |
| API-G14 | TypeScript SDK (`@dbexec/sdk`) | P1 | M |
| API-G15 | Python SDK | P1 | M |
| API-G16 | OpenAPI-generated CLI (`dbexec` binary) | P2 | M |
| API-G17 | Plugin runtime (sandboxed iframe + postMessage) | P2 | L |
| API-G18 | Custom visual API + marketplace | P2 | L |
| API-G19 | GraphQL endpoint (read-only) | P2 | M |
| API-G20 | YAML workspace import/export (module 18) | P1 | M |
| API-G21 | Webhook DLQ + replay UI | P1 | S |

## 4. Target architecture

### 4.1 API token model

```sql
-- migration: 2027-03-XX_api_tokens.sql

CREATE TABLE api_token (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,

  -- Owner: either a human user OR a service account
  owner_user_id      uuid,
  service_account_id uuid,

  -- Identification
  name            varchar(100) NOT NULL,        -- "Acme reporting bot"
  prefix          varchar(8) NOT NULL,          -- "dbe_a3f" — public chars
  token_hash      varchar(255) NOT NULL UNIQUE, -- sha256 of full token
  last_4          varchar(4) NOT NULL,           -- "Hf21"

  -- Scoping
  scopes          text[] NOT NULL,               -- ['datasets:read', 'dashboards:*']
  allowed_ips     inet[],                         -- empty = any
  allowed_origins text[],                         -- for browser-side tokens

  -- Lifecycle
  expires_at      timestamptz,
  last_used_at    timestamptz,
  status          smallint NOT NULL DEFAULT 1,
  revoked_at      timestamptz,
  revoked_by      uuid,
  revoke_reason   varchar(255),

  -- Audit
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_token_hash ON api_token (token_hash) WHERE status = 1;
CREATE INDEX api_token_owner ON api_token (organisation_id, owner_user_id);

CREATE TABLE service_account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL UNIQUE,
  description     varchar(500),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
```

Token creation returns the full token *once* — never stored:

```ts
async function createApiToken(req, res) {
  const { name, scopes, allowedIps, expiresAt, ownerKind, ownerId } = req.body;
  const orgId = res.locals.orgData.id;

  // Scope validation — caller can only grant scopes they themselves have
  const callerPerms = res.locals.permissions as string[];
  const invalidScopes = scopes.filter((s: string) => !satisfiesScope(callerPerms, s));
  if (invalidScopes.length > 0) {
    return sendResponse(res, false, 403, 'api_token.scope.exceeds_caller',
      null, [{ field: 'scopes', message: `Cannot grant: ${invalidScopes.join(', ')}` }]);
  }

  const fullToken = `dbe_${randomBase64Url(40)}`;
  const tokenHash = sha256(fullToken);
  const prefix = fullToken.slice(0, 7);
  const last4 = fullToken.slice(-4);

  const t = await ApiToken.save({
    organisationId: orgId,
    ownerUserId: ownerKind === 'user' ? ownerId : null,
    serviceAccountId: ownerKind === 'service' ? ownerId : null,
    name, prefix, tokenHash, last4,
    scopes, allowedIps: allowedIps ?? null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: res.locals.loggedInId,
  });

  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { tokenId: t.id, name, scopes, expiresAt },
  });

  // The full token is returned ONCE.
  return sendResponse(res, true, 201, 'api_token.created', {
    id: t.id,
    name: t.name,
    token: fullToken,         // ← only time the caller ever sees this
    prefix, last4, scopes,
    expiresAt: t.expiresAt,
    warning: 'Save this token now. You will not be able to retrieve it again.',
  });
}
```

### 4.2 API token middleware

```ts
// src/shared/middleware/apiToken.middleware.ts
export default async function apiToken(req, res, next) {
  const auth = req.headers.authorization as string | undefined;
  const token = auth?.startsWith('Bearer ')
    ? auth.slice(7)
    : (req.headers['x-api-token'] as string | undefined);

  if (!token || !token.startsWith('dbe_')) return next();

  const hash = sha256(token);
  const row = await ApiToken.findOne({
    where: { tokenHash: hash, status: 1 },
  });
  if (!row) return sendResponse(res, false, 401, 'api_token.invalid');

  if (row.expiresAt && row.expiresAt < new Date()) {
    return sendResponse(res, false, 401, 'api_token.expired');
  }

  // IP allowlist (if set)
  const ip = extractClientIp(req).ip;
  if (row.allowedIps?.length && ip && !row.allowedIps.includes(ip)) {
    return sendResponse(res, false, 403, 'api_token.ip_not_allowed');
  }

  // Fire-and-forget last_used_at update
  ApiToken.update(row.id, { lastUsedAt: new Date() }).catch(() => {});

  res.locals.apiAuth = row;
  res.locals.scopes = row.scopes;
  res.locals.orgData = { id: row.organisationId };
  res.locals.loggedInId = row.ownerUserId ?? row.serviceAccountId;
  res.locals.tokenId = row.id;
  next();
}

// Scope check middleware (replaces permission check on public routes)
export function requireScope(scope: string) {
  return (req, res, next) => {
    const scopes = (res.locals.scopes ?? []) as string[];
    if (!satisfiesScope(scopes, scope)) {
      return sendResponse(res, false, 403, 'api_token.scope.missing',
        null, [{ message: `Required scope: ${scope}` }]);
    }
    next();
  };
}

// Hierarchy: `dashboards:*` implies `dashboards:read` + `dashboards:write` + …
export function satisfiesScope(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [domain] = required.split(':');
  return granted.includes(`${domain}:*`);
}
```

### 4.3 Scope catalog

```ts
// src/shared/constants/api.scopes.ts
export const API_SCOPES = [
  // Datasets
  'datasets:read', 'datasets:write', 'datasets:delete',

  // Analyses
  'analyses:read', 'analyses:write', 'analyses:delete',

  // Dashboards
  'dashboards:read', 'dashboards:write', 'dashboards:delete',
  'dashboards:publish', 'dashboards:export',

  // RLS
  'rls:read', 'rls:write',

  // Embed
  'embed:sign',         // create signed embed JWTs

  // Users / orgs (admin)
  'users:read', 'users:write',
  'orgs:read', 'orgs:write',

  // Search
  'search:read',

  // Audit
  'audit:read', 'audit:export',

  // Webhooks
  'webhooks:read', 'webhooks:write',

  // Datasource credentials (very privileged)
  'datasources:read', 'datasources:write',

  // Wildcards
  '*',
] as const;
```

Token creation UI shows scopes grouped by domain with hover
explanations.

### 4.4 Public API namespace

```ts
// src/modules/public/public.router.ts
import { Router } from 'express';
import apiToken from '../../shared/middleware/apiToken.middleware';
import { requireScope } from '../../shared/middleware/apiToken.middleware';
import idempotency from '../../shared/middleware/idempotency.middleware';
import { rateLimit } from '../../shared/middleware/rateLimit.middleware';
import deprecation from '../../shared/middleware/deprecation.middleware';

const router = Router();

router.use(apiToken);                              // bearer dbe_…
router.use(idempotency({ ttlHours: 24 }));         // Idempotency-Key header
router.use(rateLimit({ windowSecs: 60, limit: 100 }));
router.use(deprecation);                            // adds Deprecation / Sunset headers

// Datasets
router.get   ('/datasets',        requireScope('datasets:read'),  listPublicDatasets);
router.get   ('/datasets/:id',    requireScope('datasets:read'),  getPublicDataset);
router.post  ('/datasets',        requireScope('datasets:write'), createPublicDataset);
router.put   ('/datasets/:id',    requireScope('datasets:write'), updatePublicDataset);
router.delete('/datasets/:id',    requireScope('datasets:delete'), deletePublicDataset);
router.post  ('/datasets/:id/run', requireScope('datasets:read'),  runPublicDataset);

// (... analyses, dashboards, etc. ...)

// Embed signing
router.post('/embed/sign', requireScope('embed:sign'), signEmbed);

// Webhooks
router.get   ('/webhooks',         requireScope('webhooks:read'),  listWebhooks);
router.post  ('/webhooks',         requireScope('webhooks:write'), createWebhook);
router.delete('/webhooks/:id',     requireScope('webhooks:write'), revokeWebhook);
router.post  ('/webhooks/:id/test', requireScope('webhooks:write'), testWebhook);

export default router;

// Mounted in server.ts:
app.use('/api/public/v1', publicRouter);
```

### 4.5 Idempotency middleware

(Same shape as the BE-implementation doc §0.2; included here for
reference.)

```ts
export default function idempotency(opts: { ttlHours?: number } = {}) {
  const ttl = (opts.ttlHours ?? 24) * 3600 * 1000;
  return async function (req, res, next) {
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key || !/^POST|PUT|PATCH$/.test(req.method)) return next();
    const orgId = res.locals.orgData.id;

    const reqHash = sha256(JSON.stringify({ p: req.path, b: req.body, m: req.method }));
    const existing = await IdempotencyRecord.findOne({ where: { key, organisationId: orgId } });

    if (existing) {
      if (existing.requestHash !== reqHash) {
        return sendResponse(res, false, 409,
          'Idempotency key reused with a different request body');
      }
      return res.status(existing.responseStatus).json(existing.responseBody);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Persist asynchronously; don't block the response
      IdempotencyRecord.save({
        key, organisationId: orgId, requestHash: reqHash,
        responseStatus: res.statusCode, responseBody: body,
        expiresAt: new Date(Date.now() + ttl),
      }).catch(() => {});
      return originalJson(body);
    };
    next();
  };
}
```

### 4.6 Rate-limit middleware

```ts
export function rateLimit(opts: { windowSecs: number; limit: number }) {
  return async (req, res, next) => {
    const subject = res.locals.tokenId
                  ?? `${res.locals.orgData?.id ?? 'anon'}:${req.ip}`;
    const key = `rl:${req.method}:${req.path}:${subject}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, opts.windowSecs);
    const ttl = await redis.ttl(key);
    res.setHeader('X-RateLimit-Limit', String(opts.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.limit - n)));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now()/1000) + ttl));
    if (n > opts.limit) {
      res.setHeader('Retry-After', String(ttl));
      return sendResponse(res, false, 429, 'rate_limit');
    }
    next();
  };
}
```

### 4.7 Deprecation headers

```ts
// src/shared/middleware/deprecation.middleware.ts
const DEPRECATED_ROUTES: Record<string, { sunset: string; alt?: string }> = {
  'POST:/api/public/v1/legacy-thing': {
    sunset: '2027-12-31',
    alt: 'POST /api/public/v1/things',
  },
};

export default function deprecation(req, res, next) {
  const entry = DEPRECATED_ROUTES[`${req.method}:${req.path}`];
  if (entry) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', new Date(entry.sunset).toUTCString());
    if (entry.alt) res.setHeader('Link', `<${entry.alt}>; rel="alternate"`);
  }
  next();
}
```

### 4.8 OpenAPI generation from Zod

```ts
// src/openapi/build.ts
import { OpenApiGeneratorV3, OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

import {
  datasetCreateSchema, datasetUpdateSchema,
  analysisCreateSchema, /* ... */
} from '../shared/validators/datasets';

const registry = new OpenAPIRegistry();

// Register schemas
registry.register('Dataset', datasetCreateSchema.openapi({
  title: 'Dataset',
  description: 'A dataset is a query against a datasource that returns tabular data.',
}));
// ... others ...

// Register paths
registry.registerPath({
  method: 'post', path: '/api/public/v1/datasets',
  tags: ['Datasets'],
  summary: 'Create a dataset',
  description: 'Creates a new dataset for the authenticated organisation.',
  request: {
    headers: z.object({
      'authorization': z.string().openapi({
        description: 'Bearer <api-token>',
        example: 'Bearer dbe_abc123…',
      }),
      'idempotency-key': z.string().uuid().optional().openapi({
        description: 'Client-supplied idempotency key (24h TTL).',
      }),
    }),
    body: { content: { 'application/json': { schema: datasetCreateSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: datasetCreateSchema } },
    },
    400: { description: 'Validation failed' },
    401: { description: 'Missing or invalid token' },
    403: { description: 'Token missing required scope (datasets:write)' },
    409: { description: 'Idempotency conflict' },
    429: { description: 'Rate limit exceeded' },
  },
  security: [{ apiToken: [] }],
});

// ... every other route ...

const generator = new OpenApiGeneratorV3(registry.definitions);
const spec = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'DBExec Public API',
    version: '1.0.0',
    description: 'Programmatic access to DBExec resources.',
    contact: { name: 'DBExec API', url: 'https://docs.dbexec.com' },
  },
  servers: [{ url: 'https://app.dbexec.com' }],
  components: {
    securitySchemes: {
      apiToken: { type: 'http', scheme: 'bearer', bearerFormat: 'dbe_*' },
    },
  },
});

import { writeFileSync } from 'fs';
writeFileSync('public/openapi.json', JSON.stringify(spec, null, 2));
```

Served at `/openapi.json`. Docs UI:

```ts
// /docs route renders ReDoc inline
app.get('/docs', (_req, res) => {
  res.send(`<!doctype html><html><head>
    <title>DBExec API</title>
    <meta charset="utf-8"/>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
  </head><body>
    <redoc spec-url="/openapi.json"></redoc>
  </body></html>`);
});

app.get('/openapi.json', (_req, res) => {
  res.sendFile(path.resolve('public/openapi.json'));
});
```

### 4.9 Webhook subscriptions

```sql
-- already in module 15 §4.2 — webhook_endpoint table.
-- Module 22 extends with subscription event catalog:

CREATE TABLE webhook_event_catalog (
  event_name      varchar(64) PRIMARY KEY,
  description     text,
  example_payload jsonb
);

INSERT INTO webhook_event_catalog (event_name, description) VALUES
  ('dataset.created', 'A dataset was created.'),
  ('dataset.updated', 'A dataset was updated.'),
  ('dataset.deleted', 'A dataset was soft-deleted.'),
  ('dataset.refreshed', 'An upload-kind dataset was refreshed from file.'),
  ('analysis.created', 'An analysis was created.'),
  ('analysis.updated', 'An analysis was updated.'),
  ('dashboard.published', 'A dashboard snapshot was published.'),
  ('dashboard.shared', 'A share link was created.'),
  ('alert.fired', 'An alert triggered.'),
  ('alert.resolved', 'An alert condition resolved.'),
  ('subscription.delivered', 'A subscription was delivered.'),
  ('subscription.failed', 'A subscription delivery failed.'),
  ('export.completed', 'An async export job completed.'),
  ('user.invited', 'A new user was invited.'),
  ('user.deleted', 'A user was removed.'),
  ('audit.event', 'Generic audit event forwarder (high volume).');
```

Webhook payload shape:

```json
{
  "id": "evt_abc123…",
  "event": "dashboard.published",
  "occurredAt": "2027-04-15T11:22:33Z",
  "data": {
    "dashboardId": "01J7…",
    "name": "Sales Q3 Review",
    "publishedBy": "user_abc",
    "tabCount": 3,
    "visualCount": 12
  },
  "organisationId": "ORG…"
}
```

Headers:

```
Content-Type: application/json
User-Agent: DBExec-Webhook/1.0
X-DBExec-Event: dashboard.published
X-DBExec-Signature: t=1719321600,v1=4f3b2a1c…
X-DBExec-Delivery-Id: del_abc123…
X-DBExec-Idempotency-Key: del_abc123…
```

### 4.10 TypeScript SDK

```ts
// @dbexec/sdk — npm package
export class DBExecClient {
  constructor(public config: {
    apiKey: string;
    baseUrl?: string;            // default https://app.dbexec.com
    timeoutMs?: number;          // default 30000
    fetch?: typeof fetch;        // injectable for tests
  }) {}

  async request<T>(method: string, path: string, body?: any, opts: {
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {}): Promise<T> {
    const fetcher = this.config.fetch ?? globalThis.fetch;
    const headers: Record<string,string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': '@dbexec/sdk/1.0.0',
    };
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const url = `${this.config.baseUrl ?? 'https://app.dbexec.com'}/api/public/v1${path}`;
    const resp = await fetcher(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new DBExecError(errBody.message ?? resp.statusText, resp.status, errBody);
    }
    return resp.json();
  }

  // Domain accessors — slim wrappers around request
  get datasets()   { return new DatasetsAPI(this); }
  get dashboards() { return new DashboardsAPI(this); }
  get analyses()   { return new AnalysesAPI(this); }
  get exports()    { return new ExportsAPI(this); }
  get webhooks()   { return new WebhooksAPI(this); }
}

class DatasetsAPI {
  constructor(private c: DBExecClient) {}
  list(opts: { limit?: number; cursor?: string } = {}) {
    return this.c.request<{ items: Dataset[]; nextCursor: string|null }>(
      'GET',
      `/datasets?${new URLSearchParams(opts as any).toString()}`,
    );
  }
  get(id: string) { return this.c.request<Dataset>('GET', `/datasets/${id}`); }
  create(input: DatasetCreate, opts: { idempotencyKey?: string } = {}) {
    return this.c.request<Dataset>('POST', '/datasets', input, opts);
  }
  update(id: string, input: DatasetUpdate) {
    return this.c.request<Dataset>('PUT', `/datasets/${id}`, input);
  }
  delete(id: string) { return this.c.request<void>('DELETE', `/datasets/${id}`); }
  run(id: string, body: RunDatasetBody) {
    return this.c.request<RunDatasetResponse>('POST', `/datasets/${id}/run`, body);
  }
}

// Types generated from OpenAPI:
//   npm run codegen   →   src/generated/types.ts
```

Generation pipeline:

```
openapi-typescript ./public/openapi.json -o packages/sdk-typescript/src/types.ts
```

### 4.11 Python SDK

Same shape, idiomatic Python:

```python
# pip install dbexec
from dbexec import DBExecClient
from dbexec.types import DatasetCreate

client = DBExecClient(api_key="dbe_…")

datasets = client.datasets.list(limit=20)
for d in datasets.items:
    print(d.id, d.name)

new_ds = client.datasets.create(DatasetCreate(
    name="Q3 invoices",
    description="…",
    datasource_id="ds_…",
    sql="SELECT * FROM invoices WHERE quarter='Q3'",
), idempotency_key="2026-q3-bootstrap")
```

Generation from OpenAPI via `openapi-python-client`. Same release
cadence as TypeScript SDK.

### 4.12 CLI

```
$ npm install -g @dbexec/cli
$ dbexec auth login          # opens browser, gets token, stores in ~/.dbexec/config
$ dbexec datasets list
$ dbexec dashboards publish --file ./dashboards/sales-q3.yaml
$ dbexec export create --dashboard ID --format pdf --watch
```

Built on top of the TypeScript SDK; `commander` for argument
parsing, `ora` for spinners.

### 4.13 Plugin runtime

For custom visualisations + custom data transforms + custom
channel adapters, a sandboxed iframe model:

```
┌─────────────────────────────────────────────────────────┐
│  DBExec FE (origin: app.dbexec.com)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  <iframe src="https://plugins.dbexec.com/run/...?id">│ │
│  │   ↑ sandboxed                                       │ │
│  │   ↑ different origin (CORS isolation)               │ │
│  │   ↑ postMessage protocol                            │ │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

The plugin runs in a separate-origin iframe. Communication via
`postMessage` only — no shared DOM, no shared cookies. The plugin
receives:

```ts
// Plugin SDK
import { Plugin } from '@dbexec/plugin-sdk';

export default new Plugin({
  type: 'visualization',
  name: 'sankey-3d',
  version: '1.0.0',

  async render({ container, data, options, brand }) {
    // data: { columns: [...], rows: [...] }
    // options: user-configured visual options
    // brand: theme tokens
    // container: HTMLElement
    new SankeyChart3D(container).draw(data, options, brand);
  },

  async getInputs() {
    return [
      { name: 'source', kind: 'column', cardinality: 'one' },
      { name: 'target', kind: 'column', cardinality: 'one' },
      { name: 'value',  kind: 'metric', cardinality: 'one' },
    ];
  },

  async configSchema() {
    return {
      type: 'object',
      properties: {
        nodeAlign: { type: 'string', enum: ['left','right','center','justify'], default: 'justify' },
        showLabels: { type: 'boolean', default: true },
      },
    };
  },
});
```

DBExec FE invokes the iframe:

```ts
const iframe = document.createElement('iframe');
iframe.src = `https://plugins.dbexec.com/run/${plugin.id}?ver=${plugin.version}`;
iframe.sandbox.add('allow-scripts', 'allow-same-origin');     // no top navigation
iframe.style.width = '100%';
iframe.style.height = '100%';
container.appendChild(iframe);

iframe.addEventListener('load', () => {
  iframe.contentWindow!.postMessage({
    type: 'dbexec.plugin.render',
    data: chartData,
    options: userOptions,
    brand: themeTokens,
  }, 'https://plugins.dbexec.com');
});
```

Plugin entity:

```sql
CREATE TABLE plugin (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,                       -- NULL = marketplace global
  type            varchar(32) NOT NULL,        -- visualization | transform | channel
  name            varchar(100) NOT NULL,
  version         varchar(32) NOT NULL,
  source_url      text NOT NULL,               -- UMD bundle URL
  source_sha256   varchar(64) NOT NULL,         -- integrity check
  status          smallint NOT NULL DEFAULT 0, -- 0=pending 1=approved 2=disabled
  created_by      uuid,
  approved_by     uuid,
  created_on      timestamptz NOT NULL DEFAULT now()
);
```

Approval: marketplace plugins gated by platform reviewers. Per-org
plugins skip the gate but only visible to that org.

### 4.14 Custom data-transform plugins

For ETL-lite: a plugin receives `{columns, rows}` from a dataset
and returns transformed `{columns, rows}` before the analysis
sees it.

```ts
export default new Plugin({
  type: 'transform',
  name: 'date-buckets',
  async transform({ data, params }) {
    const { dateCol, bucket } = params;     // 'day'|'week'|'month'|...
    return {
      columns: [...data.columns, `${dateCol}_bucket`],
      rows: data.rows.map(r => ({
        ...r,
        [`${dateCol}_bucket`]: truncTo(bucket, new Date(r[dateCol])),
      })),
    };
  },
});
```

### 4.15 Custom channel adapters

Same plugin substrate for output destinations (e.g. send
subscriptions to a custom internal system):

```ts
export default new Plugin({
  type: 'channel',
  name: 'pager-duty-incident',
  async send({ payload, config }) {
    await fetch('https://api.pagerduty.com/incidents', {
      method: 'POST',
      headers: { 'Authorization': `Token token=${config.apiKey}` },
      body: JSON.stringify({
        incident: {
          type: 'incident', title: payload.subject,
          service: { id: config.serviceId, type: 'service_reference' },
          urgency: payload.severity === 'critical' ? 'high' : 'low',
          body: { type: 'incident_body', details: payload.bodyHtml },
        },
      }),
    });
  },
});
```

## 5. APIs

The complete public-API surface is generated from OpenAPI; see
`/docs` for the live reference. Key entry points:

| Surface | Methods |
|---|---|
| `/api/public/v1/datasets` | CRUD + run |
| `/api/public/v1/analyses` | CRUD + run + filter values |
| `/api/public/v1/dashboards` | CRUD + publish + render + run |
| `/api/public/v1/exports` | Create + list + download |
| `/api/public/v1/embed/sign` | Embed JWT signing |
| `/api/public/v1/webhooks` | Subscription CRUD |
| `/api/public/v1/api-tokens` | Token management |
| `/api/public/v1/me` | Whoami (decoded token info) |
| `/api/public/v1/workspace/export.yaml` | YAML bundle (module 18) |
| `/api/public/v1/workspace/import` | YAML bundle ingest (V2) |

## 6. FE specs

### 6.1 API tokens screen

```
API tokens

  Active tokens
  ──────────────────────────────────────────────────────────
  Acme reporting bot          dbe_abc123…Hf21                 [Revoke]
  Scopes: datasets:read · dashboards:read · embed:sign
  Created Jul 12, 2026 · Last used 14m ago · Owner: Sarah Lee

  Looker migration runner     dbe_x9k1…Mn21                   [Revoke]
  Scopes: datasets:* · analyses:* · dashboards:*
  Created Jan 03, 2027 · Expires Jul 03, 2027

  [+ Create new token]
```

Create dialog:

```
Create API token

  Name:            [Acme reporting bot____________]

  Owner:           ◉ User: me   ○ Service account: [▾ ...]

  Scopes:
    Datasets       ☑ Read  ☐ Write  ☐ Delete
    Dashboards     ☑ Read  ☐ Write  ☐ Publish  ☐ Export
    Analyses       ☑ Read  ☐ Write
    RLS            ☐ Read  ☐ Write
    Embed signing  ☑

  Expires:         [○ Never  ◉ In 90 days  ○ Custom: ___]

  IP allowlist:    [Optional CIDR list___]

  [Cancel]  [Create]
```

After create:

```
Token created

  dbe_a3f29Hf21M9X… (full token shown ONCE — copy it now)

  ⚠ This is the only time you can see the full token.
    Save it in your secret manager.

  [Copy]  [Done]
```

### 6.2 OpenAPI docs

ReDoc at `/docs` rendering the generated spec. Each operation
includes:
- Description + tags
- Required scopes
- Rate-limit info
- Idempotency-Key support
- Example request + response
- Code samples in `curl`, TypeScript, Python (via Redoc
  `x-code-samples`)

### 6.3 Webhook management

```
Webhooks

  Active subscriptions
  ──────────────────────────────────────────────────────────
  ▶ acme-internal-bus  https://acme.internal/dbexec/webhook
    Events: dataset.created · dashboard.published · alert.fired
    Last 24h: 142 delivered · 0 failed · p95 latency 230ms
    [Test]  [Rotate secret]  [View deliveries]  [Edit]  [Revoke]

  [+ Add webhook]
```

Per-webhook delivery log:

```
Deliveries
  Time           Event              Status  Latency
  14:30:11       dataset.created    200     180ms
  14:25:03       alert.fired        200     220ms
  14:22:00       export.completed   500     1.2s    [Replay]
  ...
```

## 7. Validators

```ts
export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  ownerKind: z.enum(['user','service']),
  ownerId: z.string().uuid(),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(50),
  allowedIps: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().refine(u => u.startsWith('https://'), 'webhook.url.must_be_https'),
  events: z.array(z.string()).min(1),
  filterModules: z.array(z.string().max(64)).optional(),
  signingSecret: z.string().min(32).max(128).optional(),    // auto-generated if absent
});
```

## 8. Test plan

```
API-AUTH-H-01  valid token → request authorised, last_used_at updated
API-AUTH-N-01  invalid token → 401
API-AUTH-N-02  expired token → 401
API-AUTH-N-03  revoked token → 401
API-AUTH-N-04  token from wrong IP → 403
API-AUTH-N-05  missing scope → 403 with required scope listed

API-SCOPE-H-01 token with datasets:* satisfies datasets:read
API-SCOPE-H-02 token with * satisfies any scope
API-SCOPE-N-01 token with only datasets:read can't dashboards:write

API-IDEMP-H-01 same Idempotency-Key + same body → returns cached response
API-IDEMP-N-01 same key + different body → 409
API-IDEMP-H-02 key expires after 24h

API-RL-H-01    burst beyond limit → 429 with Retry-After
API-RL-H-02    X-RateLimit-* headers present on every response
API-RL-H-03    quota refills after window

API-OAS-H-01   /openapi.json parses as valid OpenAPI 3.0
API-OAS-H-02   /docs renders ReDoc against the spec
API-OAS-H-03   every public route documented (script asserts)

API-WH-H-01    create webhook → secret generated, returned ONCE
API-WH-H-02    webhook delivery signs body with HMAC
API-WH-H-03    delivery 5xx → 5 retries with exponential backoff
API-WH-H-04    delivery succeeds → row in delivery_log
API-WH-H-05    rotate-secret invalidates old; new deliveries use new
API-WH-H-06    revoke → no more deliveries
API-WH-N-01    webhook URL not HTTPS → 400

API-SDK-TS-H-01  TS SDK list returns typed Dataset[]
API-SDK-TS-H-02  TS SDK retries network failure once with backoff
API-SDK-TS-N-01  TS SDK 401 → throws DBExecError with code

API-CLI-H-01     `dbexec auth login` flow stores token
API-CLI-H-02     `dbexec datasets list` outputs JSON / table

API-DEP-H-01    deprecated route → Deprecation + Sunset headers
API-DEP-H-02    Link: rel="alternate" header points to new route

API-PLUGIN-H-01  visualization plugin renders inside sandbox iframe
API-PLUGIN-H-02  postMessage handshake passes data + brand
API-PLUGIN-N-01  plugin without status=1 → not loadable
API-PLUGIN-N-02  plugin source_sha256 mismatch → refuse to load
```

## 9. Migration & rollout

1. Phase 1 — API token entity + middleware + tokens UI.
2. Phase 2 — Public namespace `/api/public/v1/*` mounted with
   Datasets + Dashboards CRUD. OpenAPI generation script. ReDoc.
3. Phase 3 — Rate limit + idempotency + deprecation middleware.
4. Phase 4 — Webhooks CRUD + delivery worker (depends on module
   15's HMAC infrastructure).
5. Phase 5 — TypeScript SDK published to npm.
6. Phase 6 — Python SDK + CLI.
7. Phase 7 — Plugin runtime (sandboxed iframe) for custom viz +
   transforms + channels.
8. Phase 8 — GraphQL endpoint (read-only).

## 10. Open questions

- **GraphQL** — useful only when customers compose multi-entity
  fetches. Defer until requested. Generation via
  `nestjs/graphql` or hand-rolled from the Zod schemas.
- **Plugin signing** — should DBExec sign approved plugins so
  source_sha256 mismatch is detected at load? Yes; introduce a
  plugin signing keypair, embed signature in bundle metadata.
- **Plugin permissions** — what can a plugin's iframe access?
  postMessage to parent only; no fetch to arbitrary origins
  unless declared in manifest. Enforce via CSP in the iframe.
- **Cross-region API**. EU + US deployments need data residency.
  Each region has its own API surface; SDK detects via
  `https://<region>.app.dbexec.com`. Documented per-org.
- **Audit-event webhook volume**. `audit.event` could emit
  thousands per minute. Default subscription state is opt-out;
  customers who want it get a high-volume path.

## 11. References

- OpenAPI 3.0: <https://swagger.io/specification/v3/>
- zod-to-openapi: <https://github.com/asteasolutions/zod-to-openapi>
- Stripe API design: <https://stripe.com/docs/api>
- Stripe webhooks signing: <https://stripe.com/docs/webhooks/signatures>
- Looker Extensions API: <https://docs.looker.com/data-modeling/extension-framework>
- Power BI Custom Visuals: <https://learn.microsoft.com/en-us/power-bi/developer/visuals/>
- ReDoc: <https://github.com/Redocly/redoc>
- openapi-typescript: <https://github.com/openapi-ts/openapi-typescript>
- openapi-python-client: <https://github.com/openapi-generators/openapi-python-client>

## Appendix · Review additions

- **Idempotency-Key middleware** with 24h TTL and conflict-on-
  different-body — §4.5.
- **GraphQL** flagged as v2 read-only optimisation — §10.
- **OpenAPI generated from Zod** via zod-to-openapi — §4.8.
- **Rate-limit headers** standard (`X-RateLimit-*`, `Retry-After`)
  — §4.6.
- **Deprecation headers** (`Sunset`, `Deprecation`, `Link rel=alternate`)
  — §4.7.
- **Per-token IP allowlist** — §4.1, §4.2.
- **TS + Python + CLI** — §4.10, §4.11, §4.12.
- **Plugin model** for custom viz / transforms / channels — §4.13–§4.15.
