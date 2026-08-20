# API Connectors & API Studio — Code Skeletons

- **Date:** 2026-08-20
- **Branch:** `feature/connectors-api-studio` (both repos)
- **Companions:** `…-requirements.md`, `…-implementation.md`
- **Purpose:** Copy-pasteable starting code faithful to DBExec conventions (verified against `datasourceS.entity.ts`, `CLAUDE.md`). These are **skeletons/stubs**, not finished implementations — bodies are trimmed to the shape + the tricky bits.

> Conventions honored: `BaseEntity` + `@PrimaryGeneratedColumn('uuid')`; `@VersionColumn({select:false})`; `@CreateDateColumn`/`@UpdateDateColumn`/`@DeleteDateColumn` (timestamptz, nullable) + `createdBy`/`updatedBy`/`deletedBy` (`select:false`); denormalized `organisationId`/`organisationName`; one default export per controller; `sendResponse()` only; `try/catch` + `Logger.error`; close `master_db_connection`; `await` audit before close; Zod validators mirrored FE↔BE; secrets via `crypto.service` per-org DEK; never log secrets.

---

## BACKEND (`dbexec-api`)

### 1. Enums (`src/shared/constants/apiStudio.constants.ts`)

```typescript
export enum ConnectorType { DATABASE = 'DATABASE', API = 'API' }

export enum HttpMethod {
  GET = 'GET', POST = 'POST', PUT = 'PUT', PATCH = 'PATCH',
  DELETE = 'DELETE', HEAD = 'HEAD', OPTIONS = 'OPTIONS',
}

export enum AuthType {
  NONE = 'NONE', BEARER = 'BEARER', BASIC = 'BASIC',
  API_KEY = 'API_KEY', OAUTH2_CC = 'OAUTH2_CC',
}
export enum RequestAuthMode { INHERIT = 'INHERIT', /* + AuthType members */ }

export enum BodyMode { NONE = 'NONE', JSON = 'JSON', FORM = 'FORM', URLENCODED = 'URLENCODED', RAW = 'RAW' }

export enum SourceKind { SQL = 'SQL', API = 'API' }

export enum PaginationMode { NONE = 'NONE', PAGE = 'PAGE', OFFSET = 'OFFSET', CURSOR = 'CURSOR', LINK_HEADER = 'LINK_HEADER' }
export enum RefreshMode { LIVE = 'LIVE', MANUAL = 'MANUAL' }

// hard, non-negotiable safety caps
export const API_LIMITS = {
  DEFAULT_TIMEOUT_MS: 30_000,
  MAX_TIMEOUT_MS: 120_000,
  DEFAULT_MAX_ROWS: 10_000,
  HARD_MAX_ROWS: 50_000,
  DEFAULT_CACHE_TTL_S: 60,
  DEFAULT_MAX_PAGES: 20,
  MAX_BODY_BYTES: 25 * 1024 * 1024,
  MAX_FLATTEN_DEPTH: 12,
  MAX_SWAGGER_OPS: 500,
} as const;
```

### 2. Entities (`src/shared/db/shared_entity/`)

#### `connectorType.entity.ts` (seed catalog)
```typescript
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ comment: 'Immutable catalog of connector kinds (DATABASE | API). Seeded at onboarding, backfilled for existing orgs.' })
export class ConnectorType extends BaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true, comment: 'DATABASE | API' }) code: string;
  @Column({ comment: 'Display label, e.g. "API Collection"' }) name: string;
  @Column({ nullable: true, comment: 'Tabler icon key' }) icon?: string;
  @Column({ type: 'int', default: 0 }) sequence: number;
  @Column({ type: 'boolean', default: true }) enabled: boolean;
}
```

#### `connectorS.entity.ts` (was `datasourceS.entity.ts` — Phase 0 rename + type)
```typescript
// ... identical to DatasourceS (all columns/comments preserved) PLUS:
  @Column({ type: 'enum', enum: ConnectorType, default: ConnectorType.DATABASE,
    comment: 'Fast branch discriminator: DATABASE uses ConnectorConfig; API uses ApiCollection.' })
  type!: ConnectorType;

  @Column({ nullable: true, comment: 'FK to connector_type.id (label/extensibility; type enum is the fast path).' })
  connectorTypeId?: string;

  // config is now nullable for API connectors (they use ApiCollection instead of ConnectorConfig)
  @OneToOne(() => ConnectorConfig, c => c.connector) @JoinColumn({ name: 'configId' })
  config?: ConnectorConfig;
```
> Class `DatasourceS → Connector`, table `datasource_s → connector_s`. `ConnectorConfig` = renamed `DatasourceConfigS` (columns unchanged).

#### `apiCollection.entity.ts`
```typescript
import { BaseEntity, Column, CreateDateColumn, DeleteDateColumn, Entity, Index,
  JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { Connector } from './connectorS.entity';
import { AuthType } from '../../constants/apiStudio.constants';

@Entity({ comment: 'API connector body — 1:1 with a connector_s row of type=API. Holds base URL, collection-level default headers/auth, and the optional pre-request token hook.' })
@Index(['organisationId'])
export class ApiCollection extends BaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ comment: 'FK to connector_s.id (1:1).' }) connectorId: string;
  @OneToOne(() => Connector) @JoinColumn({ name: 'connectorId' }) connector: Connector;

  @Column({ nullable: false }) organisationId: string;
  @Column({ nullable: false, default: '' }) organisationName: string;

  @Column({ type: 'text', comment: 'Base URL, e.g. https://api.acme.com. May contain {{vars}}.' }) baseUrl: string;
  @Column({ type: 'jsonb', default: () => "'[]'", comment: 'Default headers applied to all requests: [{key,value,enabled}].' }) defaultHeaders: any[];
  @Column({ type: 'enum', enum: AuthType, default: AuthType.NONE }) defaultAuthType: AuthType;
  @Column({ type: 'jsonb', nullable: true, comment: 'Default auth config. SECRET fields encrypted with org DEK before persist; never returned in plaintext.' }) defaultAuthConfig?: any;
  @Column({ type: 'jsonb', nullable: true, comment: 'Pre-request auth hook: {enabled, request, extract:{tokenPath,expiresPath}, target}. Secrets encrypted.' }) preRequestHook?: any;
  @Column({ type: 'uuid', nullable: true, comment: 'Default-selected environment.' }) activeEnvironmentId?: string;

  @VersionColumn({ select: false }) version: number;
  @CreateDateColumn({ type: 'timestamptz', nullable: true }) createdOn?: Date;
  @Column({ nullable: true, select: false }) createdBy?: string;
  @UpdateDateColumn({ type: 'timestamptz', nullable: true, select: false }) updatedOn?: Date;
  @Column({ nullable: true, select: false }) updatedBy?: string;
  @DeleteDateColumn({ type: 'timestamptz', nullable: true, select: false }) deletedOn?: Date;
  @Column({ nullable: true, select: false }) deletedBy?: string;
}
```

#### `apiEnvironment.entity.ts`
```typescript
@Entity({ comment: 'Postman-style environment: a named variable set scoped to a collection.' })
@Index(['organisationId', 'collectionId'])
export class ApiEnvironment extends BaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() collectionId: string;
  @Column() organisationId: string;
  @Column({ default: '' }) organisationName: string;
  @Column() name: string;
  @Column({ type: 'jsonb', default: () => "'[]'",
    comment: 'Variables: [{key,value,secret,enabled}]. secret:true values encrypted with org DEK; never returned plaintext.' })
  variables: Array<{ key: string; value: string; secret: boolean; enabled: boolean }>;
  @Column({ type: 'boolean', default: false }) isDefault: boolean;
  // + version + audit columns (same block as above)
}
```

#### `apiRequest.entity.ts`
```typescript
@Entity({ comment: 'A saved API request within a collection. The bridge to datasets via responseMapping.' })
@Index(['organisationId', 'collectionId'])
export class ApiRequest extends BaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() collectionId: string;
  @Column() organisationId: string;
  @Column({ default: '' }) organisationName: string;

  @Column() name: string;
  @Column({ type: 'enum', enum: HttpMethod, default: HttpMethod.GET }) method: HttpMethod;
  @Column({ type: 'text', comment: 'Path relative to baseUrl; may contain {{vars}} and :pathParams.' }) path: string;

  @Column({ type: 'jsonb', default: () => "'[]'" }) headers: any[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) queryParams: any[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) pathParams: any[];

  @Column({ type: 'enum', enum: BodyMode, default: BodyMode.NONE }) bodyMode: BodyMode;
  @Column({ type: 'text', nullable: true }) body?: string;

  @Column({ type: 'enum', enum: RequestAuthMode, default: RequestAuthMode.INHERIT }) authMode: RequestAuthMode;
  @Column({ type: 'jsonb', nullable: true, comment: 'Per-request auth override; secrets encrypted.' }) authConfig?: any;

  @Column({ type: 'jsonb', nullable: true,
    comment: 'Live guardrails: {timeoutMs,maxRows,cacheTtlSeconds,pagination:{mode,...},refreshMode}. Defaults from API_LIMITS.' })
  runConfig?: any;

  @Column({ type: 'jsonb', nullable: true,
    comment: 'Last-saved row-anchor + column defs: {rowAnchor, columns[], explode[], sampleRowCount}.' })
  responseMapping?: any;

  @Column({ type: 'jsonb', nullable: true, comment: 'Swagger provenance: {specId, pathKey, methodKey}.' }) sourceSpecRef?: any;
  @Column({ type: 'timestamptz', nullable: true }) lastRunAt?: Date | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) lastRunStatus?: string | null;
  // + version + audit columns
}
```

#### Dataset additions (`dataset.entity.ts`)
```typescript
  // rename: datasourceId -> connectorId (Phase 0), keep @ManyToOne(() => Connector)
  @Column({ type: 'enum', enum: SourceKind, default: SourceKind.SQL,
    comment: 'SQL = existing DB path; API = live fetch+flatten path.' })
  sourceKind: SourceKind;

  @Column({ type: 'uuid', nullable: true, comment: 'FK to api_request_s.id when sourceKind=API.' })
  apiRequestId?: string;

  @Column({ type: 'jsonb', nullable: true,
    comment: 'Snapshot of row-anchor + column defs the dataset owns (stable even if the request mapping later changes).' })
  fieldMapping?: any;
```

#### Register (`all_entities.constant.ts`)
```typescript
import { ConnectorType } from './connectorType.entity';
import { ApiCollection } from './apiCollection.entity';
import { ApiEnvironment } from './apiEnvironment.entity';
import { ApiRequest } from './apiRequest.entity';
// ... in ALL_SHARED_ENTITIES: [ ..., ConnectorType, ApiCollection, ApiEnvironment, ApiRequest ]
```

### 3. Zod validators (`src/shared/validators/apiRequest.ts`) — mirrored to FE verbatim

```typescript
import { z } from 'zod';
import { HttpMethod, BodyMode, RequestAuthMode } from '../constants/apiStudio.constants';

const kvPair = z.object({ key: z.string(), value: z.string(), enabled: z.boolean().default(true) });

export const addApiRequestSchema = z.object({
  collectionId: z.string().uuid({ message: 'validation.apiRequest.collectionId.uuid' }),
  name: z.string().min(1, { message: 'validation.apiRequest.name.required' }).max(200),
  method: z.nativeEnum(HttpMethod, { message: 'validation.apiRequest.method.invalid' }),
  path: z.string().min(1, { message: 'validation.apiRequest.path.required' }),
  headers: z.array(kvPair).default([]),
  queryParams: z.array(kvPair).default([]),
  pathParams: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  bodyMode: z.nativeEnum(BodyMode).default(BodyMode.NONE),
  body: z.string().optional(),
  authMode: z.nativeEnum(RequestAuthMode).default(RequestAuthMode.INHERIT),
  authConfig: z.record(z.string(), z.any()).optional(),   // Zod4: two-arg record
  runConfig: z.record(z.string(), z.any()).optional(),
});
export type AddApiRequestInput = z.infer<typeof addApiRequestSchema>;
```
Middleware:
```typescript
// src/modules/api-studio/middleware/addApiRequest.validation.ts
import { addApiRequestSchema } from '../../../shared/validators/apiRequest';
import { zodValidate } from '../../../shared/utility/zodValidate.middleware';
export default zodValidate(addApiRequestSchema);
```

### 4. Controllers (one function/file) — e.g. `controllers/request/addApiRequest.ts`

```typescript
import { Request, Response } from 'express';
import sendResponse from '../../../../shared/utility/response';
import { CODE } from '../../../../config';
import { GENERIC } from '../../../../shared/constants/response.messages';
import { API_STUDIO_MSG } from '../../../../shared/constants/response.messages';
import { auditLogger } from '../../../../shared/services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../../../shared/constants/audit.constants';
import Logger from '../../../../shared/utility/logger';
import { ApiRequest } from '../../../../shared/db/shared_entity/apiRequest.entity';
import { encryptSecretsInAuthConfig } from '../../services/authSecrets.service';

const addApiRequest = async (req: Request, res: Response) => {
  Logger.info('Add API Request');
  const { orgData, master_db_connection: connection } = res.locals;
  try {
    const r = new ApiRequest();
    Object.assign(r, req.body);
    r.organisationId = orgData.id;
    r.organisationName = orgData.name;
    if (r.authConfig) r.authConfig = await encryptSecretsInAuthConfig(r.authConfig, orgData);
    await connection.getRepository(ApiRequest).save(r);

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.API_STUDIO, action: AUDIT_ACTIONS.CREATE,
      entityName: 'ApiRequest', entityId: r.id,
      metadata: { entity: { name: r.name, method: r.method, path: r.path } }, // never snapshot secrets
    });
    await connection.close();
    return sendResponse(res, true, CODE.SUCCESS, API_STUDIO_MSG.REQUEST_CREATED, stripSecrets(r));
  } catch (error: any) {
    Logger.error(`Error: ${error.message}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default addApiRequest;
```

### 5. Routes (`src/modules/api-studio/apiStudio.routes.ts`)

```typescript
import { Router } from 'express';
import AuthMiddleware from '../../shared/middleware/auth.middleware';
import VerifyResourceMiddleware from '../../shared/middleware/verifyResource.middleware';
import VerifyMasterDatabaseMiddleware from '../../shared/middleware/verifyMasterDatabase.middleware';
import VerifyPermissionMiddleware from '../../shared/middleware/verifyPermission.middleware';
import { ACCESS } from '../../config';
import AddApiRequestValidation from './middleware/addApiRequest.validation';
import * as ctrl from './apiStudio.controller';

const router = Router();
const P = 'apiStudio';

// Collections
router.get('/collections/:id', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.READ), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, ctrl.getCollection);
router.patch('/collections/:id', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.WRITE), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, ctrl.updateCollection);
router.post('/collections/:id/import-swagger', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.WRITE), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, ctrl.importSwagger);

// Environments
router.post('/environments', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.WRITE), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, AddEnvValidation, ctrl.addEnvironment);
// ... list/get/update/delete/setActive

// Requests
router.post('/requests', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.WRITE), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, AddApiRequestValidation, ctrl.addRequest);
router.post('/requests/:id/send', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.WRITE), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, checkApiRequestHost, ctrl.sendRequest);
router.post('/requests/:id/preview-mapping', AuthMiddleware, VerifyPermissionMiddleware(P, ACCESS.READ), VerifyResourceMiddleware, VerifyMasterDatabaseMiddleware, ctrl.previewMapping);
// ... list/get/update/delete/duplicate

export default router;
```
Mount (`server.ts`, near the connectors mount): `app.use('/api/v1/api-studio', apiStudioRoutes);`

### 6. Send-request proxy (`services/apiRequestSender.service.ts`)

```typescript
import { checkHostAllowed } from '../../../shared/helpers/datasource/hostGuard'; // reuse SSRF guard
import { resolveVariables } from './variableResolver.service';
import { buildAuthHeaders } from './authBuilder.service';
import { runPreRequestHook } from './preRequestHook.service';
import { followPagination } from './paginationFollower.service';
import { API_LIMITS } from '../../../shared/constants/apiStudio.constants';

export interface SendResult { status: number; timeMs: number; sizeBytes: number; headers: Record<string,string>; body: any; }

export async function sendApiRequest(ctx: {
  collection: ApiCollection; request: ApiRequest; env: ApiEnvironment | null; orgData: any;
}): Promise<SendResult> {
  const { collection, request, env, orgData } = ctx;

  // 1. pre-request hook (auto-fetch token) if configured/expired
  const injectedVars = await runPreRequestHook(collection, env, orgData);

  // 2. resolve {{vars}} (request -> env(+injected) -> collection precedence)
  const url = resolveVariables(joinUrl(collection.baseUrl, request.path), request, env, injectedVars, collection);
  const headers = buildFinalHeaders(collection, request, env, injectedVars);
  Object.assign(headers, await buildAuthHeaders(collection, request, env, injectedVars, orgData));

  // 3. SSRF guard — resolve host, block private/metadata ranges
  await checkHostAllowed(url); // throws -> caller surfaces a safe error

  // 4. fetch with timeout + body-size cap + pagination follow
  const timeoutMs = Math.min(request.runConfig?.timeoutMs ?? API_LIMITS.DEFAULT_TIMEOUT_MS, API_LIMITS.MAX_TIMEOUT_MS);
  const result = await followPagination({ url, method: request.method, headers, body: buildBody(request, env), timeoutMs, run: request.runConfig });

  return result; // { status, timeMs, sizeBytes, headers, body }
}
```
> `hostGuard` = extract/rename the existing `checkDatasourceHost` SSRF logic into a reusable helper both datasource-test and api-send call.

### 7. JSON flatten (`services/jsonFlatten.service.ts`) — the core algorithm

```typescript
export interface DetectedArray { path: string; count: number; sampleKeys: string[]; }
export interface ColumnDef { path: string; name: string; label: string; type: string; visible: boolean; nestedArray: 'json'|'explode'|null; }
export interface FlattenResult { columns: ColumnDef[]; rows: Record<string, any>[]; detectedAnchors: DetectedArray[]; }

// 1) find candidate row-anchor arrays (arrays of objects), rank by count*depth
export function detectRowAnchors(json: any): DetectedArray[] { /* walk tree, collect arrays-of-objects */ }

// 2) resolve a JSONPath-ish anchor ($.data.items[]) to the element array
function resolveAnchor(json: any, anchor: string): any[] { /* '$' => [json] if object; else navigate */ }

// 3) flatten one element: nested objects -> dotted keys; nested arrays -> json|explode
function flattenElement(el: any, opts: { explode: string[]; depth?: number }): Record<string, any>[] {
  // recurse; objects => prefix.key; arrays: if in explode -> cartesian expand, else JSON.stringify
  // guard MAX_FLATTEN_DEPTH; return one row (or many if exploded)
}

// 4) infer column types across sampled rows (string|number|boolean|date|json|null; mixed=>string)
function inferColumns(rows: Record<string, any>[]): ColumnDef[] { /* union keys, type-vote, date heuristic */ }

export function flatten(json: any, mapping: { rowAnchor: string; explode?: string[]; columns?: ColumnDef[] }): FlattenResult {
  const anchors = detectRowAnchors(json);
  const elements = resolveAnchor(json, mapping.rowAnchor);
  const rows = elements.flatMap(el => flattenElement(el, { explode: mapping.explode ?? [] }));
  const columns = mapping.columns?.length ? mapping.columns : inferColumns(rows);
  return { columns, rows, detectedAnchors: anchors };
}
```

### 8. Live dataset execution fork (`services/apiDatasetRun.service.ts`)

```typescript
import { sendApiRequest } from './apiRequestSender.service';
import { flatten } from './jsonFlatten.service';
import { applyApiFilters } from './apiFilterEngine.service';
import { applyApiAggregate } from './apiAggregate.service';
import { getCached, setCached } from '../../../shared/services/queryResultCache.service';
import { applyColumnSecurity } from '../../../shared/services/rlsResolver.service';
import { API_LIMITS } from '../../../shared/constants/apiStudio.constants';

export async function runApiDataset(ctx: {
  dataset: Dataset; filters?: any[]; aggregate?: any; userId: string; orgData: any; connection: any;
}) {
  const { dataset } = ctx;
  const request = await ctx.connection.getRepository(ApiRequest).findOne({ where: { id: dataset.apiRequestId, organisationId: ctx.orgData.id } });
  const collection = await ctx.connection.getRepository(ApiCollection).findOne({ where: { id: request.collectionId } });
  const env = collection.activeEnvironmentId ? await ctx.connection.getRepository(ApiEnvironment).findOne({ where: { id: collection.activeEnvironmentId } }) : null;

  const cacheKey = buildApiCacheKey(request, env, ctx.filters); // includes resolved env id
  const ttl = request.runConfig?.cacheTtlSeconds ?? API_LIMITS.DEFAULT_CACHE_TTL_S;
  let flat = await getCached(cacheKey);
  if (!flat) {
    const res = await sendApiRequest({ collection, request, env, orgData: ctx.orgData });
    if (!isJson(res.body)) throw new ApiRunError('Response is not JSON');
    flat = flatten(res.body, dataset.fieldMapping);           // dataset owns the snapshot mapping
    await setCached(cacheKey, flat, ttl);
  }

  // in-app filter + aggregate (no SQL path for API datasets)
  let rows = applyApiFilters(flat.rows, ctx.filters);
  if (ctx.aggregate) rows = applyApiAggregate(rows, ctx.aggregate);

  // RLS: column masking still applies; row-RLS is NOT supported for API datasets (documented)
  const masks = await resolveColumnMasksOnly(ctx.connection, ctx.userId, dataset.id);
  rows = applyColumnSecurity(rows, masks);

  rows = rows.slice(0, Math.min(request.runConfig?.maxRows ?? API_LIMITS.DEFAULT_MAX_ROWS, API_LIMITS.HARD_MAX_ROWS));
  return { columns: flat.columns, rows };
}
```
Fork wiring in `runDatasetQuery.ts` / `runAnalysisQuery.ts`:
```typescript
if (dataset.sourceKind === SourceKind.API) {
  const out = await runApiDataset({ dataset, filters, aggregate, userId, orgData, connection });
  return sendResponse(res, true, CODE.SUCCESS, DATASET_MSG.QUERY_OK, out);
}
// ... existing SQL path unchanged ...
```

### 9. Swagger import (`services/swaggerImport.service.ts`)

```typescript
import SwaggerParser from '@apidevtools/swagger-parser'; // add dep (resolves $refs, validates OA2/3)
export async function importSwagger(fileBuf: Buffer, fileName: string, collection: ApiCollection, connection: any, orgData: any) {
  const spec: any = await SwaggerParser.dereference(parseYamlOrJson(fileBuf, fileName));
  const baseUrl = spec.servers?.[0]?.url ?? (spec.host ? `${spec.schemes?.[0] ?? 'https'}://${spec.host}${spec.basePath ?? ''}` : collection.baseUrl);
  const requests: ApiRequest[] = [];
  let count = 0;
  for (const [path, methods] of Object.entries<any>(spec.paths ?? {})) {
    for (const [method, op] of Object.entries<any>(methods)) {
      if (!HttpMethodSet.has(method.toUpperCase())) continue;
      if (++count > API_LIMITS.MAX_SWAGGER_OPS) { /* stop + report */ break; }
      const r = new ApiRequest();
      r.name = op.operationId || op.summary || `${method.toUpperCase()} ${path}`;
      r.method = method.toUpperCase() as HttpMethod;
      r.path = path.replace(/\{(\w+)\}/g, ':$1');
      r.headers = []; r.queryParams = mapParams(op.parameters, 'query'); r.pathParams = mapParams(op.parameters, 'path');
      r.body = exampleBody(op.requestBody); r.bodyMode = r.body ? BodyMode.JSON : BodyMode.NONE;
      r.sourceSpecRef = { pathKey: path, methodKey: method };
      // + org fields
      requests.push(r);
    }
  }
  await connection.getRepository(ApiRequest).save(requests);
  // map securitySchemes -> collection.defaultAuthType/Config skeleton
  return { baseUrl, importedCount: requests.length, capped: count > API_LIMITS.MAX_SWAGGER_OPS };
}
```

### 10. Permission catalog (`seedPermissionCatalog.ts`) + backfill

```typescript
// Data Management group: rename screen value setupDB -> connectors
{ value: 'connectors', name: 'Connectors', icon: 'ti ti-database-cog', sequence: 1 },
// DBExec Studio group: add
{ value: 'apiStudio', name: 'API Studio', icon: 'ti ti-api', sequence: 2 },
```
Backfill (`scripts/backfillPermissionCatalog.ts`) already idempotent-upserts ORG_CATALOG and grants new ORG perms to each org's Administrator — re-run `npm run backfill:perms` after the catalog edit.

### 11. Migration (Phase 0) — sketch

```sql
-- idempotent guards omitted for brevity
ALTER TABLE datasource_s RENAME TO connector_s;
ALTER TABLE datasource_config_s RENAME TO connector_config_s;
ALTER TABLE connector_s ADD COLUMN IF NOT EXISTS "type" varchar DEFAULT 'DATABASE';
ALTER TABLE connector_s ADD COLUMN IF NOT EXISTS "connectorTypeId" uuid;
ALTER TABLE dataset  RENAME COLUMN "datasourceId" TO "connectorId";
ALTER TABLE analyses RENAME COLUMN "datasourceId" TO "connectorId";
ALTER TABLE dashboard RENAME COLUMN "datasourceId" TO "connectorId";
ALTER TABLE dataset ADD COLUMN IF NOT EXISTS "sourceKind" varchar DEFAULT 'SQL';
ALTER TABLE dataset ADD COLUMN IF NOT EXISTS "apiRequestId" uuid;
ALTER TABLE dataset ADD COLUMN IF NOT EXISTS "fieldMapping" jsonb;
-- create + seed connector_type (DATABASE, API); set connector_s.type='DATABASE', connectorTypeId=<DATABASE row>
-- perm rename: UPDATE role permission JSON setupDB -> connectors (handled by backfill script, not raw SQL)
```

---

## FRONTEND (`dbexec-ui`)

### 12. Module + routing

```typescript
// app-routing.module.ts
{ path: 'api-studio', loadChildren: () => import('./modules/api-studio/api-studio.module').then(m => m.ApiStudioModule),
  canActivate: [roleGuard], data: { permission: PERMISSIONS.API_STUDIO, title: 'PAGE_TITLES.API_STUDIO' } },
{ path: 'connectors', loadChildren: () => import('./modules/connector/connector.module').then(m => m.ConnectorModule),
  canActivate: [roleGuard], data: { permission: PERMISSIONS.CONNECTORS, title: 'PAGE_TITLES.CONNECTORS' } }, // was datasources

// permissions.constant.ts
CONNECTORS: 'connectors',    // was SETUP_DB:'setupDB'
API_STUDIO: 'apiStudio',

// routes.constant.ts
export const CONNECTOR  = feature('/app/connectors');   // was DATASOURCE
export const API_STUDIO = feature('/app/api-studio');

// sidebar.constant.ts  (Data Management group + DBExec Studio group)
{ value: 'connectors', route: '/app/connectors' },
{ value: 'apiStudio',  route: '/app/api-studio' },
```

### 13. API endpoints (`core/constants/api.constant.ts`)

```typescript
export const API_STUDIO = {
  COLLECTION: (id: string) => `/api-studio/collections/${id}`,
  IMPORT_SWAGGER: (id: string) => `/api-studio/collections/${id}/import-swagger`,
  ENVIRONMENTS: '/api-studio/environments',
  REQUESTS: '/api-studio/requests',
  SEND: (id: string) => `/api-studio/requests/${id}/send`,
  PREVIEW_MAPPING: (id: string) => `/api-studio/requests/${id}/preview-mapping`,
};
export const CONNECTOR = { /* renamed from DATASOURCE, base '/connectors' */ };
```

### 14. API Studio service (`modules/api-studio/services/api-studio.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class ApiStudioService {
  private http = inject(HttpClient);
  getCollection(id: string) { return this.http.get(API.API_STUDIO.COLLECTION(id)); }
  addRequest(body: AddApiRequestInput) { return this.http.post(API.API_STUDIO.REQUESTS, body); }
  send(id: string, envId?: string, adhoc?: Partial<ApiRequest>) { return this.http.post(API.API_STUDIO.SEND(id), { envId, adhoc }); }
  previewMapping(id: string, rowAnchor?: string) { return this.http.post(API.API_STUDIO.PREVIEW_MAPPING(id), { rowAnchor }); }
  importSwagger(id: string, file: File) { const fd = new FormData(); fd.append('file', file); return this.http.post(API.API_STUDIO.IMPORT_SWAGGER(id), fd); }
}
```

### 15. Component scaffold (`modules/api-studio/components/api-studio-workspace/`)

```typescript
@Component({ selector: 'app-api-studio-workspace', templateUrl: './api-studio-workspace.component.html', styleUrls: ['./api-studio-workspace.component.scss'] })
export class ApiStudioWorkspaceComponent {
  private svc = inject(ApiStudioService);
  private editor = inject(CodeEditorService); // add 'json' flavour
  collectionId = signal<string | null>(null);
  requests = signal<ApiRequest[]>([]);
  openTabs = signal<ApiRequest[]>([]);   // closeable tabs (extend app-tabs)
  activeTab = signal<string | null>(null);
  response = signal<SendResult | null>(null);
  subTab = signal<'params'|'headers'|'body'|'auth'|'prereq'>('params');

  send(req: ApiRequest, envId?: string) {
    this.svc.send(req.id, envId).subscribe(r => this.response.set(r.data));
  }
  useAsDataset() { /* open field-mapping-panel with response.body */ }
}
```
```scss
/* api-studio-workspace.component.scss */
@use '../../../../shared/styles/page-skeleton' as skeleton;
:host { @include skeleton.page-view; display: grid; grid-template-columns: 260px 1fr; }
```

### 16. Field-mapping panel (`components/field-mapping-panel/`)

```typescript
@Component({ selector: 'app-field-mapping-panel', /* ... */ })
export class FieldMappingPanelComponent {
  @Input() responseBody: any;
  @Input() requestId!: string;
  rowAnchor = signal<string>('');
  detected = signal<DetectedArray[]>([]);
  columns = signal<ColumnDef[]>([]);
  previewRows = signal<any[]>([]);
  @Output() datasetCreate = new EventEmitter<{ rowAnchor: string; columns: ColumnDef[] }>();

  onAnchorChange(anchor: string) { this.svc.previewMapping(this.requestId, anchor).subscribe(r => { this.columns.set(r.data.columns); this.previewRows.set(r.data.rows); }); }
  create() { this.datasetCreate.emit({ rowAnchor: this.rowAnchor(), columns: this.columns() }); }
}
```

### 17. Monaco JSON flavour (`shared/editor/code-editor.service.ts`)

```typescript
// extend the flavour union and options
createEditor({ host, flavour: 'sql'|'formula'|'json', value, readOnly, ... }) {
  const language = flavour === 'json' ? 'json' : flavour === 'sql' ? 'sql' : 'formula';
  // reuse existing monaco boot; for 'json' set language + (readOnly for response viewer)
}
```

---

## Cross-cutting build reminders (do NOT skip at implementation time)

1. **Session Context Protocol** (`dbexec-api/docs/context/` + `dbexec-ui` equivalent): create module context files for `api-studio` + rename `datasources` doc → `connectors`; update `INDEX.md` rows; add `SESSION_LOG.md` entries. This is part of "done".
2. **i18n**: every new key in all 10 locales; parity sweep; preserve `{{placeholders}}`.
3. **Backfill perms** after catalog edit; new module 403s on existing orgs otherwise.
4. **Verify for real**: `npx tsc --noEmit` both repos + `ng build --configuration production`; drive the end-to-end flow.
5. **Secrets**: never returned by list/get, never logged, encrypted with org DEK; redact `{{secret}}` in any echoed request.
6. **Commit style**: `type(scope): summary`, humanized, no AI/model mention, no trailers. User pushes.
```
