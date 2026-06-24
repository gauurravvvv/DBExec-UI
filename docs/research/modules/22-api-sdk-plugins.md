# 22 · Public API, SDKs, Plugins, Custom Viz

## Public REST API

`/api/public/v1/*` namespace. Stable, versioned, OpenAPI-documented.

### Resources

- `/datasources` `/datasets` `/analyses` `/dashboards`
- `/semantic-models` `/metrics/query`
- `/exports/dataset/:id/csv` `/exports/dashboard/:id/pdf`
- `/subscriptions` `/alerts`
- `/users` `/groups` `/roles`
- `/share-links` `/embed/sign`

### Auth

Bearer token (API token from module 10). Scopes per route. Rate-limit
per token (default 100 rpm).

### OpenAPI

Generate from Zod schemas (already used internally) via
`@asteasolutions/zod-to-openapi`:

```ts
import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { datasourceSchema } from '../../shared/validators/datasources';

const registry = new OpenAPIRegistry();
registry.register('Datasource', datasourceSchema);
registry.registerPath({
  method: 'post', path: '/datasources',
  summary: 'Create a datasource',
  request: { body: { content: { 'application/json': { schema: datasourceSchema } } } },
  responses: { 201: { description: 'created' } },
});
const generator = new OpenApiGeneratorV3(registry.definitions);
const spec = generator.generateDocument({
  openapi: '3.0.0', info: { title: 'DBExec API', version: '1.0' },
});
fs.writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
```

## TypeScript SDK

```ts
// @dbexec/sdk usage
import { DBExec } from '@dbexec/sdk';
const client = new DBExec({ baseURL: 'https://app.dbexec.com', token: 'dbe_xxx' });
const ds = await client.datasources.list();
const job = await client.exports.dataset({ id: 'abc', format: 'csv' });
```

Generated from the OpenAPI spec via `openapi-typescript-codegen`.

## Embed SDK

```ts
import { DBExecEmbed } from '@dbexec/embed';
const embed = new DBExecEmbed({
  host: 'https://app.dbexec.com',
  token,   // signed JWT from your backend
});
embed.mount('#dashboard', { type: 'dashboard', id: 'xyz' });
embed.on('filter-change', (state) => console.log(state));
embed.applyFilter({ region: 'APAC' });
```

Implementation: an iframe wrapper + `postMessage` API.

## Plugin / custom viz

Plugin registry (module 06 §4.1) accepts a `VisualSpec`. Loading
options:

### Option 1: descriptor-only (safe, ship V1)

```ts
// plugin.json shipped by customer
{
  "chartType": "candle-with-volume",
  "family": "special",
  "roles": [...],
  "defaultOptions": { /* a JSON-resolvable EChartsOption template */ },
  "properties": [...]
}
```

DBExec loads the descriptor, no arbitrary code.

### Option 2: code-bundled (V2, sandboxed)

Webpack Module Federation OR iframe-sandboxed plugin. Allows full
JS for `defaultOptions(ctx)`.

## Tests

- **API-H-01** — Bearer auth returns 200 on /datasources
- **API-N-01** — Bearer with bad scope → 403
- **API-RL-H-01** — 101st call in 1min → 429
- **SDK-H-01** — `client.datasets.preview(id)` returns expected shape
- **EMBED-PM-H-01** — applyFilter from host postMessages into iframe

## Appendix · Review additions

- **GraphQL API** alongside REST (Looker has both).
- **gRPC** for service-to-service.
- **API changelog page** with deprecation timelines.
- **OpenAPI spec at `/openapi.json`** + ReDoc at `/docs`.
- **`Idempotency-Key` header** support on every mutation
  (HTTP best practice).
- **Rate-limit headers**:
  `X-RateLimit-Limit`, `-Remaining`, `-Reset`.
- **Pagination headers** (`Link: <...>; rel="next"`).
- **Deprecation headers** (`Deprecation: true`, `Sunset: <date>`).
- **CLI tool** (`dbexec` for CI usage).
- **VS Code extension** stub for in-editor query authoring.
- **OAuth2 third-party apps** (Slack-style "App X wants to read your data").

### Schema delta

```sql
CREATE TABLE idempotency_record (
  key             varchar(255) PRIMARY KEY,
  organisation_id uuid NOT NULL,
  request_hash    varchar(64) NOT NULL,
  response_status int NOT NULL,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '24h'
);
CREATE INDEX ON idempotency_record (expires_at);
```

### Idempotency middleware

```ts
export async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || !req.method.match(/POST|PUT|PATCH/)) return next();
  const reqHash = crypto.createHash('sha256')
    .update(JSON.stringify(req.body)).digest('hex');
  const existing = await IdempotencyRecord.findOne({ where: { key } });
  if (existing) {
    if (existing.requestHash !== reqHash)
      return res.status(409).json({ error: 'idempotency key reused with different body' });
    return res.status(existing.responseStatus).json(existing.responseBody);
  }
  const json = res.json.bind(res);
  res.json = (body: any) => {
    IdempotencyRecord.insert({
      key, organisationId: res.locals.orgData.id, requestHash: reqHash,
      responseStatus: res.statusCode, responseBody: body,
    }).catch(() => {});
    return json(body);
  };
  next();
}
```

### Test IDs

- API-IDEMP-H-01 — same key returns first response
- API-IDEMP-N-01 — same key, different body → 409
- API-HEADER-H-01 — rate-limit headers present
- API-DEPR-H-01 — deprecated route returns sunset header
- API-GQL-H-01 — GraphQL endpoint serves same data as REST
