# API Connectors & API Studio — Implementation Plan

- **Date:** 2026-08-20
- **Branch:** `feature/connectors-api-studio` (both repos)
- **Companion:** `2026-08-20-api-connectors-module-requirements.md`
- **Repos:** `dbexec-api` (Express + TypeORM 0.3), `dbexec-ui` (Angular + PrimeNG)

This is the ordered build plan. **Phase 0 (the rename) lands and is verified before any API-connector feature code.** Each phase ends with a gate: `npx tsc --noEmit` (both repos) + `ng build --configuration production` (FE) must be green.

---

## Verified codebase anchors (from exploration 2026-08-20)

**Backend** (`dbexec-api`):
- Entities live under `src/shared/db/{master_entity,shared_entity}` (NOT `src/db/...`).
- Datasource: `src/shared/db/shared_entity/datasourceS.entity.ts` (`DatasourceS`, table `datasource_s`) + `datasourceConfigS.entity.ts` (`DatasourceConfigS`, `datasource_config_s`).
- Binding: `dataset.entity.ts:97` (`datasourceId` → `@ManyToOne DatasourceS`), `analyses.entity.ts:135`, `dashboard.entity.ts:127` (both denormalized).
- Connection lifecycle: `src/shared/helpers/datasource/{openDatasourceConnection,getDbConnection,getOrgDbConnection,testDatasourceConnection,snowflakeConnection}.ts`.
- Encryption: `src/shared/services/crypto.service.ts` (`encryptForOrg`/`decryptForOrg`, per-org DEK).
- Execution: `src/modules/datasets/controllers/runDatasetQuery.ts`, `src/modules/analyses/controllers/runAnalysisQuery.ts`; services `safeDatasetQuery`, `filterEngine`, `rlsResolver`, `sqlSafety`, `queryResultCache`.
- Routes/controllers: `src/modules/datasources/` (mount `server.ts:205` `/api/v1/datasources`). SSRF guard `checkDatasourceHost` (used in `datasources.routes.ts`).
- Permissions: `src/shared/helpers/system/seedPermissionCatalog.ts` — `ORG_CATALOG` (`setupDB` under `databaseManagement` "Data Management" `:238`; `connectionManager`/`queryRunner` under `dbExecStudio` "DBExec Studio" `:271`). Backfill: `scripts/backfillPermissionCatalog.ts` (`npm run backfill:perms`).
- Entity registry: `src/shared/db/shared_entity/all_entities.constant.ts` (`ALL_SHARED_ENTITIES`).
- Response messages: `src/shared/constants/response.messages.ts` (groups incl. `DATASOURCE`).

**Frontend** (`dbexec-ui`):
- Module: `src/app/modules/datasource/` (components add/edit/list/view, `services/datasource.service.ts`, `constants/database-types.constant.ts`).
- Route: `app-routing.module.ts:142` (`path:'datasources'`), nav `routes.constant.ts:78` (`DATASOURCE`), sidebar `sidebar.constant.ts:22` (`{value:'setupDB', route:'/app/datasources'}`), perm `permissions.constant.ts:25` (`SETUP_DB`), API `api.constant.ts:87` (`DATASOURCE={…}`).
- Dataset flow: `src/app/modules/dataset/` — picker `components/dataset-picker-dialog/`, builder `components/add-dataset/` (Monaco via `shared/editor/code-editor.service.ts`, schema tree `services/dataset-schema-tree.service.ts`), save `components/save-dataset-dialog/`.
- Shared: `src/app/shared/components/*` (`custom-table`, `button`, `chip`, `custom-*`, `tabs`, `lazy-tree`), `src/app/shared/editor/code-editor.service.ts` (Monaco `sql`/`formula` flavours), skeleton `src/app/shared/styles/_page-skeleton.scss`.
- i18n: `src/assets/i18n/{en,de,es,fr,it,ja,ko,nl,pt-BR,zh-CN}.json`.

---

## Phase 0 — Rename `datasource → connector` (both repos)

**Goal:** pure rename, zero behaviour change, green gates, migration for existing orgs. Ship this first and confirm the app still works before feature work.

### 0.A Backend rename
1. Rename entities: `DatasourceS → Connector` (`connectorS.entity.ts`, table `connector_s`), `DatasourceConfigS → ConnectorConfig` (`connector_config_s`). Add `type` enum column + `connectorTypeId` FK (nullable for now; backfilled).
2. Add `connector_type` seed entity + seeding (DATABASE, API).
3. Rename module `src/modules/datasources/ → src/modules/connectors/`; controllers `*Datasource* → *Connector*`; keep behaviour identical.
4. Rename column on `dataset`/`analyses`/`dashboard`: `datasourceId → connectorId` (entity + all query refs). Add `dataset.sourceKind` default `SQL`.
5. Update `all_entities.constant.ts` imports/registrations.
6. Route mount `server.ts`: `/api/v1/datasources → /api/v1/connectors`.
7. Rename response-message group `DATASOURCE → CONNECTOR`; keep messages.
8. Permission: `setupDB → connectors` in `seedPermissionCatalog.ts`; update the 4 route perm checks.
9. Connection helpers keep their names internally (they're generic DB helpers) but references to the entity type update.
10. **Migration** (`src/shared/db/migrations` or the project's migration mechanism): `ALTER TABLE datasource_s RENAME TO connector_s`, same for config; `RENAME COLUMN datasourceId TO connectorId` on the 3 tables; create + seed `connector_type`; set `connector_s.type='DATABASE'`, `connectorTypeId=` DATABASE row; backfill perm rename. Idempotent guards.
11. **Backfill script** update so existing orgs get the renamed perm + `connector_type` seed.

### 0.B Frontend rename
1. Rename folder `modules/datasource → modules/connector`; components/selectors `*datasource* → *connector*`.
2. `datasource.service.ts → connector.service.ts`; method names keep semantics.
3. Routing: `app-routing.module.ts` `datasources → connectors`; `routes.constant.ts` `DATASOURCE → CONNECTOR` (`/app/connectors`); sidebar `{value:'connectors', route:'/app/connectors'}`; `permissions.constant.ts` `SETUP_DB → CONNECTORS:'connectors'`; `api.constant.ts` `DATASOURCE → CONNECTOR` base `/connectors`.
4. i18n: repoint `DATASOURCE.* → CONNECTORS.*`, `COMMON.DATASOURCE → COMMON.CONNECTOR`, `PAGE_TITLES.DATASOURCES → PAGE_TITLES.CONNECTORS` across **all 10** locales.
5. Every consumer of `datasourceId` (dataset/analysis/dashboard components, ~556 identifier refs) → `connectorId`.

### 0.C Phase 0 gate
- `npx tsc --noEmit` green both repos.
- `ng build --configuration production` green.
- Manual smoke: existing DB datasource still creates, tests connection, and an existing dataset still previews.
- Migration dry-run on a copy of an existing org DB.

> **Rename tactic:** do it as a scripted, reviewed find-replace per identifier casing (`datasource`/`Datasource`/`DATASOURCE`/`datasourceId`), compile after each repo, never blanket-replace the word "connection" (591 BE / 765 FE files — mostly generic DB connections, NOT this concept).

---

## Phase 1 — Connector type model + API connector shell (BE)

1. Entities: `ApiCollection` (`api_collection_s`), `ApiEnvironment` (`api_environment_s`), `ApiRequest` (`api_request_s`), optional `ApiSwaggerImport`. Register in `all_entities.constant.ts`.
2. When a Connector of `type=API` is created, create its 1:1 `api_collection_s`.
3. Module `src/modules/api-studio/` with routes mounted `/api/v1/api-studio`.
4. CRUD controllers (one function/file, audited, `sendResponse`, close connection):
   - Collections: get/update (create/delete go through connector CRUD).
   - Environments: add/list/update/delete/setActive.
   - Requests: add/list/get/update/delete/duplicate.
5. Validation: **Zod** validators in `src/shared/validators/apiCollection.ts|apiRequest.ts|apiEnvironment.ts`, mirrored verbatim to FE; i18n message keys.
6. Encryption on secret fields via `crypto.service`.
7. Response-message group `API_STUDIO`; audit module/actions in `audit.constants.ts`.

**Gate:** tsc green; CRUD works via REST client.

---

## Phase 2 — Send-request proxy + variable resolver + auth (BE)

1. `apiRequestSender.service.ts`: resolve `{{vars}}` (request→env→collection precedence) → build final URL/headers/body → **SSRF host check** → fetch (Node fetch/undici) with `timeoutMs` + body-size cap → return `{ status, timeMs, sizeBytes, headers, body }`.
2. `authBuilder.service.ts`: build headers for BEARER/BASIC/API_KEY; OAUTH2_CC token fetch + per-(collection,env) cache w/ expiry + anti-stampede lock.
3. `preRequestHook.service.ts`: run hook → extract token via JSON path → set target var (in-memory) → 401-retry-once wiring.
4. `paginationFollower.service.ts`: NONE/PAGE/OFFSET/CURSOR/LINK_HEADER up to maxPages/maxRows.
5. Endpoint `POST /api-studio/requests/:id/send` (and ad-hoc send for unsaved edits). Never returns secrets; redacts secrets in echoed request.
6. Rate limit per connector.

**Gate:** can send a real request to a public API (e.g. httpbin / a swagger petstore) and get JSON; secrets never in response/logs.

---

## Phase 3 — JSON flatten + mapping + live dataset execution (BE)

1. `jsonFlatten.service.ts`: given JSON + rowAnchor → detect arrays, auto-propose anchor, flatten elements to dotted columns, infer types, handle nested-array json/explode (cartesian cap).
2. `apiDatasetRun.service.ts`: the API-path executor — resolve+send (Phase 2) → flatten (this phase) → in-app filter/aggregate → row cap → `{columns,rows}`. TTL cache via a new key on `queryResultCache` pattern.
3. `apiFilterEngine.service.ts` + `apiAggregate.service.ts`: in-app equivalents of the SQL filter/group-by/aggregates for API rows.
4. Wire the dataset executor fork: in `runDatasetQuery`/`runAnalysisQuery`, branch on `dataset.sourceKind` → SQL path (existing) or `apiDatasetRun`. Column-masking (RLS) still applied post-rows; row-RLS + joins blocked for API datasets with clear errors.
5. Endpoints: `POST /api-studio/requests/:id/preview-mapping` (returns detected anchors + sample mapped rows), `POST /datasets` accepts `sourceKind=API, apiRequestId, fieldMapping`.

**Gate:** create an API dataset from a live response and preview mapped rows; open an analysis on it and get a chart.

---

## Phase 4 — Swagger/OpenAPI import (BE)

1. `swaggerImport.service.ts`: parse YAML/JSON (add a YAML dep), OpenAPI 2/3, resolve `$ref`s, iterate paths×methods → create requests, prefill baseUrl + auth skeleton, store provenance. Op cap + report.
2. Endpoint `POST /api-studio/collections/:id/import-swagger` (multipart or raw).

**Gate:** import petstore spec → N requests created with correct method/path.

---

## Phase 5 — API Studio UI (FE)

1. Module `src/app/modules/api-studio/`; route `/app/api-studio` (perm `apiStudio`); sidebar under DBExec Studio; page titles ×10 locales.
2. Layout component (left rail + request pane + response pane).
3. Left rail: collections + requests list, `+ Request`, `Import Swagger`, env selector, `+ Environment`.
4. Request pane: method+URL bar (with `{{var}}` highlight), Send (calls proxy), sub-tabs Params/Headers/Body/Auth/Pre-request. Body = Monaco (add **JSON flavour** to `code-editor.service.ts`). Auth = structured form per preset.
5. Open-request tabs: extend `app-tabs` with closeable/dynamic tabs (net-new) OR a custom tab bar.
6. Response pane: status/time/size, Pretty (JSON tree — **Monaco-json read-only** for v1), Raw, Headers.
7. `connector.service` gains API-studio methods; new `api-studio.service.ts`; Zod validators mirrored from BE.

**Gate:** send a request in the UI, see JSON response.

---

## Phase 6 — Field-mapping panel + dataset-from-response (FE)

1. `field-mapping-panel` component: row-anchor dropdown (auto-proposed), column table (path/name/label/type/visible/nested-array), live preview grid.
2. "Use as Dataset →" from response → opens panel → "Create Dataset" (mirrors `save-dataset-dialog`) → POST dataset with `sourceKind=API`.
3. Dataset picker-dialog: type-aware (DB → schema step + SQL workbench; API → request step + mapping panel).
4. Connectors list: Type chip; New Connector → type chooser → DB form (existing) or API form (name/desc/baseUrl → opens API Studio).

**Gate:** end-to-end in UI — pick API connector → request → map → create dataset → build analysis → add to dashboard → dashboard renders live.

---

## Phase 7 — Permissions, i18n parity, hardening, tests

1. `seedPermissionCatalog.ts`: `apiStudio` under DBExec Studio; `connectors` confirmed under Data Management; backfill run.
2. i18n parity sweep (all keys in all 10 locales; placeholders preserved).
3. Audit logging on every CUD + send + import + dataset-from-response.
4. RLS UI: mark row-rules "not supported for API datasets"; join builder blocks API datasets.
5. Tests:
   - BE unit: `jsonFlatten` (nested, arrays, explode, type infer, edge cases from §11), `authBuilder`, `preRequestHook`, `paginationFollower`, `apiFilterEngine`/`apiAggregate`, `swaggerImport`, SSRF block, secret redaction/no-plaintext-return.
   - BE integration: send proxy against a stub server; live dataset run; migration idempotency.
   - FE: field-mapping panel logic, api-studio.service, validator parity.
6. Verify per skill: real `tsc --noEmit` both repos + real `ng build --configuration production`; drive the end-to-end flow.

---

## Cross-cutting rules (from dbexec-development skill)

- One default export per controller file; `try/catch` + `Logger.error` + `sendResponse`; close `master_db_connection`; `await` audit before close.
- Validation in middleware (Zod preferred, mirrored FE); never in controllers.
- Additive schema (nullable cols + jsonb) to avoid dev migrations where possible; Phase-0 rename needs a real migration for existing orgs.
- New shared entity → register in `all_entities.constant.ts`.
- New FE string → key in all 10 locales.
- New module → `permissions.constant.ts` + `app-routing.module.ts` + `sidebar.constant.ts` + `PAGE_TITLES.*` ×10 + backfill perms.
- Never `git add -A`; stage explicit paths; confirm no `.env`/`environment*.ts` staged.
- Never string-concat user values into SQL; the API path never builds SQL at all — it fetches + flattens.

---

## Suggested commit slicing (per phase, per repo)

- `Phase 0` — rename datasource→connector (2 commits: BE, FE) + migration.
- `Phase 1` — API connector entities + CRUD (BE).
- `Phase 2` — send proxy + auth + hook (BE).
- `Phase 3` — flatten + live dataset execution (BE).
- `Phase 4` — swagger import (BE).
- `Phase 5` — API Studio UI (FE).
- `Phase 6` — field mapping + dataset-from-response (FE).
- `Phase 7` — perms + i18n + tests + hardening (both).

Humanized commit messages, no AI/model mention, no Co-Authored-By trailer. User pushes.
