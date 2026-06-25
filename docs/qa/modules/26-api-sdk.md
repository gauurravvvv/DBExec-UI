# 26 · Public API / SDK / Plugins — Deep Test Cases

## REST API
- **API-H-01** · Bearer auth returns 200 on /datasources. P0
- **API-H-02** · OpenAPI spec served at /openapi.json. P0
- **API-H-03** · ReDoc UI at /docs. P1
- **API-N-01** · Bearer with bad scope → 403. P0
- **API-N-02** · Bearer expired → 401. P0
- **API-RL-H-01** · 101st call/min → 429 with Retry-After. P1
- **API-RL-H-02** · `X-RateLimit-Limit/Remaining/Reset` headers present. P1
- **API-IDEMP-H-01** · Same idempotency key returns first response. P1
- **API-IDEMP-N-01** · Same key, different body → 409. P1
- **API-PAG-H-01** · `Link: <...>; rel="next"` header on lists. P1
- **API-DEPR-H-01** · Deprecated route returns Sunset header. P2

## GraphQL
- **API-GQL-H-01** · GraphQL endpoint serves same data as REST. P2
- **API-GQL-N-01** · Query depth limit enforced. P1 🟣

## SDK
- **SDK-H-01** · `client.datasets.preview(id)` returns expected shape. P1
- **SDK-H-02** · SDK retries on 429 with backoff. P1
- **SDK-N-01** · SDK throws typed error on 4xx. P1

## Embed SDK
- **EMBED-PM-H-01** · applyFilter from host postMessages into iframe. P0
- **EMBED-PM-H-02** · onFilterChange callback fires. P1
- **EMBED-N-01** · Mismatched host (not in allowlist) cannot communicate. P0 🟣

## Plugins / custom viz
- **PLG-H-01** · Descriptor-based plugin registers a new chart family. P1
- **PLG-N-01** · Plugin with duplicate chartType → reject. P1
- **PLG-S-01** · Sandboxed JS plugin cannot reach global state. P0 🟣

## Security
- **API-S-01** · CORS allowlist enforced on public API. P0 🟣
- **API-S-02** · Bearer + cookie auth cannot be combined (no confused deputy). P0 🟣

## Performance
- **API-P-01** · GET /datasources list p95 < 200ms with 1000 rows. P1 ⚡

## Regression buckets
- OpenAPI changes → API-H-02, SDK-H-01
- Rate limiting → API-RL-H-01..02
