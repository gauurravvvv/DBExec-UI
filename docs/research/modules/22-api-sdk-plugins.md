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
