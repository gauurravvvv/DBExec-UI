# API Connectors & API Studio — Requirements

- **Date:** 2026-08-20
- **Branch:** `feature/connectors-api-studio` (both `dbexec-api` and `dbexec-ui`)
- **Status:** Requirements — approved decisions captured; open items flagged inline
- **Companion:** `2026-08-20-api-connectors-module-implementation.md` (phased build plan)

---

## 1. Summary

Today every Dataset / Analysis / Dashboard in DBExec draws from a **datasource** — a single external SQL database (`DatasourceS` + `DatasourceConfigS`). This module does two things:

1. **Rename `datasource` → `connector` everywhere** (code + DB + API + UI), and give a Connector a **type**: `DATABASE` or `API`, backed by a seeded `connector_type` catalog.
2. **Add a new connector type — API Collections** — a Postman-style workspace ("**API Studio**") where a user builds HTTP requests against a base URL, manages environments and auth tokens, gets JSON responses (including deeply nested JSON), and turns any array in that response into a **live dataset** whose columns can be charted at any depth.

An **API-backed dataset is LIVE**: every time an analysis/dashboard using it is opened, DBExec re-hits the API, flattens the JSON, and feeds the rows to the existing chart layer. Nothing is copied into a table.

This binds end-to-end: `Connector (type=API)` → `Dataset (sourceKind=API)` → `Analysis` → `Dashboard`, reusing the entire existing visualization stack.

---

## 2. Goals & non-goals

### Goals
- One umbrella concept — **Connector** — with type `DATABASE` | `API`.
- A Postman-grade API workspace: collections, saved requests (all HTTP verbs), headers / query params / body, per-request + per-collection auth, environments with `{{variables}}`, a pre-request hook that auto-fetches tokens, a response viewer with a collapsible JSON tree.
- Swagger / OpenAPI (`.yaml` / `.json`) import that auto-creates one saved request per path + method.
- Map a nested JSON response to a flat, chartable dataset via a **row-anchor + auto-flatten** model.
- Live datasets that reuse the existing Analysis/Dashboard/chart layer with **zero chart-side changes** (identical `{ columns, rows }` output contract).
- All secrets encrypted with the existing per-org DEK (AES-256-GCM envelope), same as datasource passwords.
- SSRF-safe: all outbound calls go through the existing host-block guard.

### Non-goals (v1)
- **Row-level RLS** on API datasets (no SQL to inject a WHERE into). Column masking still applies. — see §11.
- **Joins** across datasets when either side is an API dataset.
- **Materializing** API responses into Postgres tables (explicitly rejected — datasets are live).
- Collection **folders / nested grouping** (flat request list in v1; folders v2).
- **WebSocket / GraphQL / gRPC** request types (REST/HTTP only in v1).
- Multiple datasets from one response in a single step (one row-anchor = one dataset in v1).
- Request **scripting/tests** (Postman JS test scripts) beyond the structured pre-request auth hook.

---

## 3. Approved design decisions (from brainstorming)

| # | Decision | Value |
|---|----------|-------|
| D1 | JSON → dataset | **Live**: re-hit API on every open, flatten in memory, chart off that. No DB copy. |
| D2 | Nested JSON mapping | **Row-anchor array** + auto-flatten nested objects to dotted columns; nested arrays = keep-as-JSON or explode. Auto-propose a likely anchor. |
| D3 | Auth token handling | **All four**: Environments+`{{vars}}`, pre-request auth hook (auto-fetch token), structured auth presets (Bearer/Basic/API-key/OAuth2 client-credentials), manual paste fallback. |
| D4 | Rename scope | **Full rename** `datasource → connector` (code + DB + API + perm) on a **separate branch**, with a migration for existing orgs. |
| D5 | Workspace name & home | **"API Studio"** under the existing **DBExec Studio** permission group. Connectors list stays under **Data Management**. New perms `apiStudio` + renamed `connectors`. |
| D6 | Collection model | **Collection → Requests → Environments**. Swagger import auto-creates requests from every path+method. |
| D7 | Live guardrails | **Per-request config** (pagination, timeout, cache-TTL, refresh mode) with safe defaults; hard caps (max rows to browser, SSRF) always on. |

---

## 4. Domain model (conceptual)

```
CONNECTOR (renamed from DatasourceS)  ── type: DATABASE | API
   │
   ├── type = DATABASE ──▶ ConnectorConfig (host/port/creds/dbType)   [renamed DatasourceConfigS]
   │
   └── type = API ───────▶ API COLLECTION (baseUrl, default auth, default headers)
                              ├── ENVIRONMENTS[]  (name + variables{}: {{token}}, {{baseUrl}}…)
                              ├── AUTH PROFILE    (collection-level default auth + pre-request hook)
                              └── REQUESTS[]      (method, path, headers, query, body,
                                                   auth override, response mapping, run config)

DATASET  ── sourceKind: SQL | API   ── connectorId ─▶ CONNECTOR
   │
   ├── sourceKind = SQL ─▶ dataset.sql (unchanged path)
   │
   └── sourceKind = API ─▶ apiRequestId ─▶ REQUEST
                           fieldMapping   (row-anchor path + column defs)

ANALYSIS ── datasetId, (denormalized) connectorId
DASHBOARD ── (denormalized) datasetId, connectorId
```

**Key insight:** a Dataset always points at a Connector via `connectorId`. The `sourceKind` discriminator decides the execution path. Analyses and Dashboards are unchanged except for the field rename `datasourceId → connectorId`.

---

## 5. Database design

> **Naming:** entities/tables use `connector*` after the rename. Where a table is renamed from an existing one, the "was" is noted.

### 5.1 Renamed tables (Phase 0 — the rename)

| New | Was | Notes |
|-----|-----|-------|
| `connector_s` | `datasource_s` | + `type` column (`DATABASE`\|`API`), + `connectorTypeId` FK → `connector_type` |
| `connector_config_s` | `datasource_config_s` | unchanged columns; only class/table renamed |
| column `dataset.connectorId` | `dataset.datasourceId` | + new `dataset.sourceKind`, `dataset.apiRequestId`, `dataset.fieldMapping` |
| column `analyses.connectorId` | `analyses.datasourceId` | denormalized, unchanged semantics |
| column `dashboard.connectorId` | `dashboard.datasourceId` | denormalized, unchanged semantics |
| perm value `connectors` | `setupDB` | coordinated FE+BE key change |

> The **org's own backing DB** (`DatabaseE` / `DatabaseConfig`, master DB) and the **Query Runner** `QueryConnectionS` are **NOT** renamed — they are separate concepts. Only the user-facing `DatasourceS` lineage becomes `Connector`.

### 5.2 New seed table — `connector_type`

Seeded at org creation (and backfilled for existing orgs). Small, immutable catalog.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | varchar | `DATABASE` \| `API` (unique) |
| `name` | varchar | display: "Database", "API Collection" |
| `icon` | varchar | Tabler icon key |
| `sequence` | int | ordering |
| `enabled` | bool | future-proofing (e.g. disable a type) |

`connector_s.connectorTypeId` FK → `connector_type.id`. (We keep both a lightweight `type` enum column for fast branching AND the FK for extensibility/labels.)

### 5.3 New shared entities (per-org DB) — the API model

All carry the standard audit columns (`createdOn/By`, `updatedOn/By`, `deletedOn/By` soft-delete), `organisationId`, `organisationName`, `version`. All registered in `all_entities.constant.ts`.

#### `api_collection_s`
The API "connector body" (1:1 with a `connector_s` row of type=API — mirrors how `connector_config_s` is the body for DATABASE).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `connectorId` | uuid FK → connector_s | 1:1 |
| `baseUrl` | text | e.g. `https://api.acme.com` |
| `defaultHeaders` | jsonb | array of `{key,value,enabled}` applied to all requests |
| `defaultAuthType` | enum | `NONE`\|`BEARER`\|`BASIC`\|`API_KEY`\|`OAUTH2_CC` |
| `defaultAuthConfig` | jsonb (encrypted-at-rest for secret fields) | shape per auth type (see §7) |
| `preRequestHook` | jsonb | pre-request auth hook config (see §7.3), nullable |
| `activeEnvironmentId` | uuid, nullable | which env is "selected" by default |
| `version`, audit… | | |

#### `api_environment_s`
Variable sets (Postman environments).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `collectionId` | uuid FK → api_collection_s | |
| `name` | varchar | "Prod", "Staging" |
| `variables` | jsonb | array of `{key, value, secret:boolean, enabled}`. **`secret:true` values are encrypted** with the org DEK before persistence and never returned in plaintext to list endpoints. |
| `isDefault` | bool | per collection |
| `version`, audit… | | |

#### `api_request_s`
A saved request.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `collectionId` | uuid FK → api_collection_s | |
| `name` | varchar | display name (from swagger `operationId`/`summary` on import) |
| `method` | enum | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS |
| `path` | text | relative to baseUrl, may contain `{{vars}}` and `:pathParams` |
| `headers` | jsonb | `[{key,value,enabled}]` (may reference `{{vars}}`) |
| `queryParams` | jsonb | `[{key,value,enabled}]` |
| `pathParams` | jsonb | `[{key,value}]` |
| `bodyMode` | enum | `NONE`\|`JSON`\|`FORM`\|`URLENCODED`\|`RAW` |
| `body` | text | raw body / JSON string (may reference `{{vars}}`) |
| `authMode` | enum | `INHERIT`\|`NONE`\|`BEARER`\|`BASIC`\|`API_KEY`\|`OAUTH2_CC` |
| `authConfig` | jsonb (secrets encrypted) | per-request auth override |
| `runConfig` | jsonb | per-request live guardrails: `{ timeoutMs, maxRows, cacheTtlSeconds, pagination:{mode,…}, refreshMode }` (see §8) |
| `responseMapping` | jsonb, nullable | last-saved row-anchor + column defs (see §6) — the bridge to datasets |
| `lastRunAt`, `lastRunStatus` | timestamptz / varchar | health signal |
| `sourceSpecRef` | jsonb, nullable | provenance if created from swagger (`{specId, pathKey, methodKey}`) |
| `version`, audit… | | |

#### `api_swagger_import_s` (optional, provenance)
Records an import event so re-import can diff. Minimal: `{id, collectionId, fileName, specVersion, importedCount, rawSpecHash, createdOn/By}`. (Could be deferred; kept for re-import UX.)

### 5.4 Dataset changes (the binding)

Add to `dataset` (nullable/additive — no migration pain on dev sync):
- `sourceKind` enum `SQL`|`API`, default `SQL` (existing rows = SQL).
- `apiRequestId` uuid nullable FK → `api_request_s` (set when sourceKind=API).
- `fieldMapping` jsonb nullable — the row-anchor + column defs snapshot the dataset owns (so the dataset is stable even if the request's saved mapping later changes).

### 5.5 Encryption

Reuse `crypto.service.ts` (`encryptForOrg` / `decryptForOrg`, per-org DEK). Encrypted fields: every secret inside `defaultAuthConfig`, `authConfig`, pre-request hook credentials, and `secret:true` environment variables. Non-secret config (base URL, header keys, non-secret var values) stored plain. Secrets are **never** returned to any list/get endpoint (same rule as datasource passwords) — the UI shows a "•••• set" state and only sends new values on change.

---

## 6. JSON → Dataset mapping (the core)

### 6.1 Row-anchor model
- The **row anchor** is a JSON path to an array whose elements become rows, e.g. `$.data.items[]`. `$` itself is valid (top-level array, or a single object → single-row dataset).
- **Auto-propose:** on first response we scan for the largest array-of-objects and propose it (`"37 rows, 8 fields detected"`); user can override via a dropdown of all detected array paths.
- Each element is **flattened**: nested objects → dotted column names (`customer.name`, `address.city`).
- **Nested arrays inside a row** get a per-column choice: **keep-as-JSON** (a string/JSON column) or **explode** (one output row per child element — cartesian with the parent; capped).
- **Type inference** per column across the sampled rows: `string | number | boolean | date | json | null`. Mixed → `string`. Dates detected by ISO-8601 / epoch heuristic; user can override the inferred type.

### 6.2 Column definition (`fieldMapping.columns[]`)
```
{
  path: "customer.name",     // dotted path within a row element
  name: "customer_name",     // dataset field name (sanitized identifier)
  label: "Customer Name",    // display
  type: "string",            // inferred, user-overridable
  visible: true,
  nestedArray: "json"|"explode"|null
}
```

### 6.3 `fieldMapping` shape (stored on request AND snapshotted on dataset)
```
{
  rowAnchor: "$.data.items[]",
  columns: [ …ColumnDef… ],
  explode: [ "items.tags" ],      // which nested-array columns explode
  sampleRowCount: 37
}
```

### 6.4 Contract with the chart layer
The API executor returns exactly `{ columns: [{name,label,type}], rows: [ {..}, .. ] }` — the same shape `runDatasetQuery` returns for SQL. Analyses/dashboards/charts consume it unchanged.

---

## 7. Auth handling (all four, layered)

### 7.1 Environments + `{{variables}}`
- Variables resolved at send time: request/collection strings are scanned for `{{key}}` tokens and substituted from the **active environment** (per-request env override allowed). Missing var → clear error listing the unresolved token(s), never a silent blank.
- Resolution order: request-level var → active environment → collection defaults. (Documented precedence.)

### 7.2 Structured auth presets
Per collection (default) and per request (`INHERIT` uses the collection default):
- **NONE**
- **BEARER** — `{ token: "{{token}}" }` → `Authorization: Bearer <resolved>`
- **BASIC** — `{ username, password }` → `Authorization: Basic base64(u:p)`
- **API_KEY** — `{ key, value, in: header|query }`
- **OAUTH2_CC** (client credentials) — `{ tokenUrl, clientId, clientSecret, scope }` → server fetches token, caches per (collection, env) until `expires_in`, injects as Bearer.

We **build the header server-side** so tokens never touch the browser.

### 7.3 Pre-request auth hook (auto-fetch token)
Collection-level optional hook that runs before a request (or when the cached token is missing/expired/last call returned 401):
```
{
  enabled: true,
  request: { method:"POST", url:"{{baseUrl}}/auth/login", headers, body },
  extract: { tokenPath: "$.access_token", expiresPath: "$.expires_in" },
  target: "token"       // env variable name to set with the extracted token
}
```
Flow: run hook → extract token via JSON path → set `{{token}}` (in-memory, per execution; optionally persist to the env if user opts in) → run the real request. On a 401 from the real request, re-run the hook once and retry (bounded).

### 7.4 Manual paste fallback
Any header (incl. `Authorization`) can be typed literally. Always available; not seamless at scale.

---

## 8. Live execution & per-request guardrails (D7)

Each request carries `runConfig` with safe defaults; the dataset inherits them:

| Field | Default | Purpose |
|-------|---------|---------|
| `timeoutMs` | 30000 | abort a slow upstream (mirrors SQL statement_timeout) |
| `maxRows` | 10000 | hard cap of rows returned to the browser |
| `cacheTtlSeconds` | 60 | short-TTL cache of fetched+flattened rows, keyed by (request, resolved-env, body). N charts on a dashboard sharing one request = 1 upstream call. |
| `pagination` | `{ mode: NONE }` | `NONE` \| `PAGE` (`?page=`) \| `OFFSET` (`?offset=&limit=`) \| `CURSOR` (`nextPath`) \| `LINK_HEADER`. Follows pages up to `maxPages` (default 20) / `maxRows`. |
| `refreshMode` | `LIVE` | `LIVE` (fetch on every open) \| `MANUAL` (fetch once per session, hold until user clicks Refresh) |

**Always-on, non-negotiable:** SSRF host block on every outbound call; `maxRows` browser cap; response body size cap (e.g. 25 MB) before parse.

Execution reuses the existing `queryResultCache` pattern for the TTL cache (keyed differently), and adds a new `apiDatasetRun` service that: resolve vars → run pre-request hook if due → build request → SSRF-check host → fetch (follow pagination) → parse JSON → flatten by row-anchor → in-app filter/aggregate → cap rows → return.

### 8.1 In-app filter/aggregate
Because there's no SQL, filters and aggregation for API datasets run in-app on the flattened rows. v1 supports the same filter operators the filter engine exposes (equals, contains, gt/lt, in, between, is-null…) applied in JS, plus group-by + the core aggregates (count/sum/avg/min/max) used by analyses. This is a **new in-app engine** parallel to `filterEngine.service.ts`. Calc-fields that are already computed in-app work unchanged; SQL-pushdown calc-fields do not apply.

---

## 9. Swagger / OpenAPI import (D6)

- Accept `.yaml` / `.json`, OpenAPI 2 (Swagger) and 3.x.
- Parse `servers[]`/`host+basePath` → prefill collection `baseUrl`.
- For each `paths.<path>.<method>`: create one `api_request_s` with method, path (params → `{{}}`/pathParams), default headers, request-body example (from `requestBody`/`parameters`), name from `operationId` or `summary`.
- Map `securitySchemes` → collection `defaultAuthType`/`defaultAuthConfig` skeleton (e.g. OAuth2 → OAUTH2_CC skeleton with empty secrets; apiKey → API_KEY with `in`+name prefilled).
- Store provenance (`sourceSpecRef`) so a re-import can add-new / update-existing / mark-removed (v1: add-new + report; full diff v2).
- Size/complexity cap (e.g. max N operations per import) with a clear message.

---

## 10. Frontend (UI/UX)

### 10.1 API Studio — the Postman workspace
Route under DBExec Studio: `/app/api-studio`. Layout:

```
┌───────────────┬─────────────────────────────────────────────────────────┐
│ Collections   │  [ GET ▾ ] [ {{baseUrl}}/orders            ] [ Send ]     │
│  ▸ Acme API   │  ┌ Params │ Headers │ Body │ Auth │ Pre-req ┐  env:[Prod▾]│
│    • GET /ord │  │  key/value editor rows…                   │            │
│    • GET /o/{}│  └───────────────────────────────────────────┘            │
│    • POST /ord│  ── Response ───────────────────  200 · 412ms · 4.1KB ──   │
│  ▸ Stripe     │  [ Pretty(JSON tree) │ Raw │ Headers ]                     │
│               │   ▾ data                                                   │
│  [+ Request]  │     ▾ items[]  (37)                                        │
│  [Import ▾]   │       ▸ 0 { id, customer{…}, total }                       │
│               │  [ Use as Dataset → ]  (opens field-mapping panel)         │
└───────────────┴─────────────────────────────────────────────────────────┘
```

- **Left rail:** collections + their requests (flat list v1). `+ Request`, `Import Swagger`, `+ Environment`, env selector.
- **Request tabs (open requests):** built on `app-tabs`; needs closeable/dynamic-tab extension (noted in impl doc as net-new).
- **URL bar:** method dropdown + URL input (with `{{var}}` highlighting) + Send. Send calls the **server proxy** (`POST /api-studio/requests/:id/send` or an ad-hoc send), never the browser directly.
- **Sub-tabs:** Params / Headers / Body / Auth / Pre-request — key-value editors; Body uses Monaco (JSON flavour, new). Auth = structured preset form.
- **Response panel:** status/time/size; **Pretty = JSON tree** (net-new shared component — collapsible; Monaco-json is the low-risk fallback), Raw, Headers.
- **"Use as Dataset →":** opens the field-mapping panel.

### 10.2 Field-mapping panel (JSON → dataset)
- Row-anchor dropdown (auto-proposed + all detected arrays).
- Column table: path, name, label, inferred type (editable), visible toggle, nested-array = json/explode.
- Live preview grid of the first N mapped rows.
- "Create Dataset" → mirrors `save-dataset-dialog`, writes a Dataset with `sourceKind=API`, `connectorId`, `apiRequestId`, `fieldMapping`. From there the normal Analysis/Dashboard flow applies.

### 10.3 Connectors list (renamed datasource module)
- `/app/connectors` (was `/app/datasources`). List shows a **Type** chip (Database / API).
- "New Connector" → choose type → Database form (existing) or API Collection form (name, description, base URL, then opens API Studio for that collection).
- Reuse `app-custom-table` list pattern, `_page-skeleton` mixins, `.back-button`.

### 10.4 Dataset picker
- The dataset picker-dialog gains type awareness: pick a Connector; if API, pick a request (instead of a schema) → open the API dataset builder (the field-mapping panel) instead of the SQL workbench.

### 10.5 Shared components reused
`app-custom-table`, `app-button`, `app-chip`, `app-custom-input/textarea/dropdown/toggle`, `app-tabs` (extended for closeable tabs), `CodeEditorService`/Monaco (add JSON flavour), `app-lazy-tree` or new JSON-tree, `save-dataset-dialog` pattern, `app-justification-dialog` for deletes, page-skeleton mixins.

---

## 11. Edge cases & failure matrix

| Case | Handling |
|------|----------|
| Response is a top-level array `[…]` | row anchor `$` |
| Response is a single object (`/me`) | row anchor `$` → single-row dataset |
| Response is not JSON (HTML/text/binary) | error in Studio; cannot map to dataset; show raw |
| Empty array at anchor | dataset = 0 rows, columns still known from mapping (kept stable) |
| Heterogeneous elements (different keys) | union of keys; missing → null per row |
| Deeply nested / huge JSON | body size cap before parse; flatten depth cap with clear message |
| Nested array explode blow-up | cartesian cap (maxRows); warn + truncate |
| API paginates | follow per `runConfig.pagination` up to maxPages/maxRows |
| API 401 / expired token | pre-request hook re-run once + retry; else surface 401 |
| API 429 rate limit | surface + respect `Retry-After` (bounded); don't hammer |
| API slow / hangs | `timeoutMs` abort → clear error |
| Upstream 5xx | surface status + body snippet; dataset open shows error state, dashboard tile shows error not blank |
| SSRF (internal host / metadata IP) | blocked by host guard before any call |
| Secret in URL/logs | never log resolved secrets; redact `{{secret}}` in any echoed request |
| Missing `{{var}}` | error listing unresolved tokens |
| Env switched (Prod→Staging) | cache key includes resolved env → correct re-fetch |
| Request/mapping edited after dataset created | dataset owns a **snapshot** `fieldMapping`; not silently broken. Offer "re-sync mapping" action. |
| Connector (API) deleted with datasets bound | block delete or cascade-warn (same rule as deleting a datasource with datasets) |
| Swagger with $refs / components | resolve refs; unresolved → skip with report |
| Swagger huge (100s of ops) | import cap + summary |
| Live dataset on a big dashboard | short-TTL cache dedupes to 1 upstream call |
| RLS row rules on API dataset | **v1 limitation**: row-RLS not applied (no SQL). Column masking IS applied post-flatten. Documented + surfaced in RLS UI as "not supported for API datasets". |
| Join with an API dataset | **v1 limitation**: not supported; blocked in join builder with a clear message. |
| Existing orgs after rename | migration renames tables/columns + seeds `connector_type` + backfills perm `connectors`/`apiStudio`; idempotent. |
| Concurrent token refresh | per-(collection,env) token cache with a short lock to avoid stampede. |

---

## 12. Security

- All outbound calls via server-side proxy → **SSRF host guard** (reuse `checkDatasourceHost` / `BLOCK_PRIVATE_DATASOURCE_HOSTS`).
- Secrets encrypted with per-org DEK; never returned in plaintext; never logged.
- Response body size cap before parse (DoS guard).
- Per-connector outbound rate limit (safe default).
- Auth/permission: `apiStudio` gates the workspace; `connectors` gates connector CRUD; existing `visualizations` gates datasets/analyses/dashboards. Read/write/full verbs as today.
- Audit logging on all CUD (collections, requests, environments, connector create/update/delete, swagger import, dataset-from-response) via the existing `auditLogger`.

---

## 13. Permissions & catalog

- `ORG_CATALOG`:
  - Under **Data Management** group: rename screen `setupDB` → `connectors` ("Connectors"), icon unchanged.
  - Under **DBExec Studio** group: add screen `apiStudio` ("API Studio").
- Seeded at onboarding; **backfilled** for existing orgs via `npm run backfill:perms` (idempotent), granting the new grantable ORG perms to each org's Administrator role.
- FE wiring: `permissions.constant.ts` (`CONNECTORS`, `API_STUDIO`), `app-routing.module.ts` lazy routes, `sidebar.constant.ts` entries, `PAGE_TITLES.*` in all 10 locales.

---

## 14. i18n

- All new FE strings are keys in **all 10 locale files** (en/de/es/fr/it/ja/ko/nl/pt-BR/zh-CN).
- New key blocks: `CONNECTORS.*`, `API_STUDIO.*`, `API_DATASET.*`, `PAGE_TITLES.CONNECTORS`, `PAGE_TITLES.API_STUDIO`, plus validation keys `validation.apiCollection.*`, `validation.apiRequest.*`, `validation.apiEnvironment.*`.
- Rename existing `DATASOURCE.*` / `COMMON.DATASOURCE` labels to `CONNECTORS.*` / `COMMON.CONNECTOR` (or repoint) across all 10.
- Parity sweep after: every `en.json` key exists in the 9 others.

---

## 15. Open items (flagged for review)

1. **RLS/joins on API datasets** — confirmed out-of-scope for v1? (§11 assumes yes, with clear UI messaging.)
2. **Token persistence** — should a pre-request-hook-fetched token be persisted back to the environment, or held per-execution only? (Default: per-execution; opt-in persist.)
3. **OAuth2 flows** — v1 = client-credentials only. Authorization-code (browser redirect) deferred? (Assumed yes.)
4. **Delete semantics** — deleting an API connector with bound datasets: block vs cascade-warn — match whatever the datasource rule is today (confirm during Phase 0).
5. **New shared JSON-tree component vs Monaco-json** — recommend Monaco-json for v1 (low risk), custom tree v2.
