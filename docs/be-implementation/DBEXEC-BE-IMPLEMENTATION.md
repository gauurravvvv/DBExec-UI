# DBExec — Backend Implementation Deep Dive

> The how-to for actually building every gap identified across the
> deep-research docs. Express + TypeScript + TypeORM 0.2 + PostgreSQL,
> matching DBExec's existing patterns (response envelope, audit
> logger, multi-tenant master DB ↔ shared DB, Joi/Zod validation,
> single-function-per-controller files).
>
> Every section is BE-first. FE notes are included only where needed
> for contract clarity.

**Conventions used everywhere in this doc**

- File paths assume `DBExec-API/src/...`.
- Entities use TypeORM 0.2 decorators (matching existing code).
- Controllers default-export a single async function.
- Response goes through `sendResponse(res, status, code, message, data)`.
- Validators are Zod schemas under `src/shared/validators/<module>.ts`
  + `zodValidate(schema)` middleware factory.
- Auth context: `res.locals.orgData.id`, `res.locals.loggedInId`,
  `res.locals.master_db_connection` (shared DB), `res.locals.user`.
- Audit:
  `auditLogger.logAuditToOrg({ connection, req, res, module, action, ... })`
  before closing the connection.
- Permissions: `VerifyPermissionMiddleware('<value>')` after auth.
- Soft delete: `status = 0`, never DELETE rows.

---

## Table of contents

0. [Cross-cutting plumbing (do this first)](#0-cross-cutting-plumbing)
1. [Datasource & Connection extensions](#1-datasource--connection)
2. [Semantic Layer](#2-semantic-layer)
3. [Dataset extensions (upload + lineage + versions)](#3-dataset-extensions)
4. [Query processor / compiler](#4-query-processor)
5. [Cache & materialisation](#5-cache--materialisation)
6. [Analysis & visual builder service layer](#6-analysis--visual-builder)
7. [Filters / parameters / cross-filters / drill](#7-filters-and-actions)
8. [Dashboards (live + filters + export + thumbnails)](#8-dashboards)
9. [RLS + column security](#9-rls--column-security)
10. [SSO / MFA / SCIM / API tokens / sessions](#10-sso-mfa-scim-tokens)
11. [Metrics extensions (semi-additive, percentile, etc.)](#11-metrics-extensions)
12. [Import / upload](#12-import-upload)
13. [Export / download](#13-export-download)
14. [Sharing & embedding](#14-sharing--embedding)
15. [Scheduling, subscriptions, alerts](#15-scheduling-subs-alerts)
16. [Notifications (channels + bundling + push)](#16-notifications)
17. [Search, tags, collections, favourites](#17-search-and-catalogue)
18. [Versioning, branches, lineage](#18-versioning-and-lineage)
19. [Audit, observability, telemetry](#19-audit--observability)
20. [Theming, branding, custom domains](#20-branding)
21. [Mobile / PWA back-end concerns](#21-pwa-be)
22. [Public REST API, OpenAPI, idempotency, rate-limit, SDK](#22-public-api)
23. [i18n / a11y back-end concerns](#23-i18n-be)
24. [Admin console (backup, restore, GDPR, impersonate)](#24-admin)
25. [AI Insights (NL → semantic query)](#25-ai)
26. [Geo (tile providers, geocoding, H3)](#26-geo)
27. [Cost observability & budgets](#27-cost)
28. [Backup / restore / multi-region](#28-backup-restore)

---

## 0 · Cross-cutting plumbing

Build these once. Every later section depends on them.

### 0.1 Feature flag service

`src/shared/services/featureFlags.service.ts`:

```ts
import { LRUCache } from 'lru-cache';
import { Connection } from 'typeorm';
import { FeatureFlag } from '../db/shared_entity/featureFlag.entity';

const cache = new LRUCache<string, boolean>({ max: 1000, ttl: 60_000 });

export class FeatureFlagService {
  constructor(private conn: Connection) {}

  async isEnabled(orgId: string, flag: string): Promise<boolean> {
    const key = `${orgId}:${flag}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const row = await this.conn.getRepository(FeatureFlag).findOne({
      where: { organisationId: orgId, name: flag },
    });
    const value = !!row?.enabled;
    cache.set(key, value);
    return value;
  }

  async set(orgId: string, flag: string, enabled: boolean, byUserId: string) {
    const repo = this.conn.getRepository(FeatureFlag);
    const existing = await repo.findOne({ where: { organisationId: orgId, name: flag } });
    if (existing) {
      existing.enabled = enabled;
      existing.updatedBy = byUserId;
      await repo.save(existing);
    } else {
      await repo.save({
        organisationId: orgId, name: flag, enabled,
        createdBy: byUserId, updatedBy: byUserId,
      });
    }
    cache.delete(`${orgId}:${flag}`);
  }
}
```

Entity:

```ts
// src/shared/db/shared_entity/featureFlag.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity('feature_flag')
@Index(['organisationId', 'name'], { unique: true })
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ default: false }) enabled!: boolean;
  @Column('uuid', { nullable: true }) createdBy?: string;
  @Column('uuid', { nullable: true }) updatedBy?: string;
  @CreateDateColumn() createdOn!: Date;
  @UpdateDateColumn() updatedOn!: Date;
}
```

Pattern for every "new feature" controller:

```ts
import { ff } from '../../shared/services/featureFlags.singleton';
if (!await ff.isEnabled(orgData.id, 'enableSemanticLayer'))
  return sendResponse(res, false, CODE.FORBIDDEN, 'feature not enabled');
```

### 0.2 Idempotency

`src/shared/middleware/idempotency.middleware.ts`:

```ts
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import { IdempotencyRecord } from '../db/shared_entity/idempotencyRecord.entity';
import sendResponse from '../utility/response';

export default function idempotency(opts: { ttlHours?: number } = {}) {
  const ttl = (opts.ttlHours ?? 24) * 3600 * 1000;

  return async function (req: Request, res: Response, next: NextFunction) {
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) return next();
    if (!/^POST|PUT|PATCH$/.test(req.method)) return next();
    const { master_db_connection, orgData } = res.locals;
    const repo = master_db_connection.getRepository(IdempotencyRecord);
    const reqHash = crypto.createHash('sha256')
      .update(JSON.stringify({ p: req.path, b: req.body }))
      .digest('hex');
    const existing = await repo.findOne({ where: { key, organisationId: orgData.id } });
    if (existing) {
      if (existing.requestHash !== reqHash) {
        return sendResponse(res, false, 409,
          'Idempotency key reused with a different request body');
      }
      return res.status(existing.responseStatus).json(existing.responseBody);
    }
    const json = res.json.bind(res);
    res.json = (body: any) => {
      repo.save({
        key, organisationId: orgData.id, requestHash: reqHash,
        responseStatus: res.statusCode, responseBody: body,
        expiresAt: new Date(Date.now() + ttl),
      }).catch(() => {});
      return json(body);
    };
    next();
  };
}
```

Entity:

```ts
// src/shared/db/shared_entity/idempotencyRecord.entity.ts
@Entity('idempotency_record')
@Index(['organisationId', 'key'], { unique: true })
@Index(['expiresAt'])
export class IdempotencyRecord {
  @PrimaryColumn() key!: string;
  @Column('uuid') organisationId!: string;
  @Column({ length: 64 }) requestHash!: string;
  @Column('int') responseStatus!: number;
  @Column('jsonb') responseBody!: unknown;
  @Column('timestamptz') expiresAt!: Date;
  @CreateDateColumn() createdAt!: Date;
}
```

Cron prunes daily: `DELETE FROM idempotency_record WHERE expires_at < NOW();`

### 0.3 Cursor pagination

`src/shared/utility/cursor.ts`:

```ts
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
export function decodeCursor<T>(cursor?: string): T | null {
  if (!cursor) return null;
  try { return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); }
  catch { return null; }
}

export async function paginate<T>(opts: {
  qb: import('typeorm').SelectQueryBuilder<T>;
  cursor?: string;
  limit: number;
  cursorField: keyof T & string;        // e.g. 'createdOn'
  tieBreaker: keyof T & string;          // e.g. 'id'
  direction?: 'ASC' | 'DESC';
}): Promise<CursorPage<T>> {
  const dir = opts.direction ?? 'DESC';
  const dec = decodeCursor<{ v: unknown; id: string }>(opts.cursor);
  if (dec) {
    opts.qb.andWhere(
      `("${opts.cursorField}", "${opts.tieBreaker}") ${dir === 'DESC' ? '<' : '>'} (:v, :id)`,
      { v: dec.v, id: dec.id }
    );
  }
  opts.qb.orderBy(`"${opts.cursorField}"`, dir).addOrderBy(`"${opts.tieBreaker}"`, dir);
  opts.qb.limit(opts.limit + 1);
  const rows = await opts.qb.getMany();
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const last = items.at(-1) as any;
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ v: last[opts.cursorField], id: last[opts.tieBreaker] })
      : null,
  };
}
```

### 0.4 Rate limit middleware

`src/shared/middleware/rateLimit.middleware.ts`:

```ts
import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis.singleton';
import sendResponse from '../utility/response';

export function rateLimit(opts: {
  windowSecs: number;
  limit: number;
  keyFn?: (req: Request, res: Response) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subject = opts.keyFn
      ? opts.keyFn(req, res)
      : `${res.locals.orgData?.id ?? 'anon'}:${res.locals.loggedInId ?? req.ip}`;
    const k = `rl:${req.method}:${req.path}:${subject}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, opts.windowSecs);
    const ttl = await redis.ttl(k);
    res.setHeader('X-RateLimit-Limit', String(opts.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.limit - n)));
    res.setHeader('X-RateLimit-Reset', String(Date.now() + ttl * 1000));
    if (n > opts.limit) return sendResponse(res, false, 429, 'Too many requests');
    next();
  };
}
```

### 0.5 Webhook event bus

`src/shared/services/eventBus.service.ts`:

```ts
import { Queue } from 'bullmq';
import { redis } from './redis.singleton';

const webhookQueue = new Queue('webhook-deliver', { connection: redis });

export async function emit(event: {
  type: string;                     // e.g. 'dataset.created'
  organisationId: string;
  payload: Record<string, unknown>;
  actor: { type: 'user' | 'service'; id: string };
}) {
  const subs = await loadWebhookSubscriptions(event.organisationId, event.type);
  for (const sub of subs) {
    await webhookQueue.add('deliver', { subscriptionId: sub.id, event });
  }
}
```

Entity:

```ts
@Entity('webhook_subscription')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;
  @Column({ length: 64 }) name!: string;
  @Column('text') targetUrl!: string;
  @Column('text', { array: true }) events!: string[];   // ['dataset.created','dataset.updated']
  @Column('bytea') secretEnc!: Buffer;                  // HMAC secret
  @Column({ default: 1 }) status!: number;
  @Column('uuid') createdBy!: string;
  @CreateDateColumn() createdOn!: Date;
}
```

Worker delivers with HMAC-SHA256 signed body, exponential retry,
DLQ → `webhook_delivery_failure` table.

### 0.6 Soft-delete cascade policy

A registry mapping parent type → child types with policy:

```ts
// src/shared/services/cascade.registry.ts
export const CASCADE: Record<string, { childType: string; policy: 'restrict'|'cascade'|'set_null' }[]> = {
  dataset: [
    { childType: 'analysis',           policy: 'restrict' },
    { childType: 'rls_rule',           policy: 'cascade'  },
    { childType: 'column_security',    policy: 'cascade'  },
    { childType: 'dataset_field',      policy: 'cascade'  },
    { childType: 'semantic_model',     policy: 'cascade'  },
  ],
  analysis: [
    { childType: 'dashboard',          policy: 'restrict' },  // dashboard.snapshot may reference
    { childType: 'analysis_filter',    policy: 'cascade'  },
    { childType: 'analysis_parameter', policy: 'cascade'  },
  ],
  organisation: [
    { childType: 'user',               policy: 'cascade'  },
    // ...
  ],
};

export async function precheckDelete(
  conn: Connection,
  parentType: string,
  parentId: string,
): Promise<{ ok: boolean; blockers: { childType: string; ids: string[] }[] }> {
  const policies = CASCADE[parentType] || [];
  const blockers: { childType: string; ids: string[] }[] = [];
  for (const p of policies) {
    if (p.policy !== 'restrict') continue;
    const rows = await conn.query(
      `SELECT id FROM ${p.childType} WHERE ${parentType}_id = $1 AND status = 1 LIMIT 5`,
      [parentId],
    );
    if (rows.length) blockers.push({ childType: p.childType, ids: rows.map((r: any) => r.id) });
  }
  return { ok: blockers.length === 0, blockers };
}
```

Use in every delete controller as the first step.

### 0.7 Error envelope (multi-error)

`src/shared/utility/response.ts` extension:

```ts
export function sendResponse(
  res: Response, status: boolean, code: number, msg: any, data: any = null,
  errors: Array<{ field?: string; code?: string; message: string }> = [],
) {
  // localise msg if it's a translation key
  const message = typeof msg === 'string' && msg.startsWith('validation.')
    ? t(res, msg) : msg;
  return res.status(code).json({ status, code, message, data, errors });
}
```

`zodValidate` translates Zod issues into the `errors` array:

```ts
export function zodValidate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      const errors = r.error.issues.map(i => ({
        field: i.path.join('.'),
        code: i.code,
        message: t(res, String(i.message)),
      }));
      return sendResponse(res, false, 400,
        errors[0]?.message || 'Validation failed', null, errors);
    }
    req.body = r.data;
    next();
  };
}
```

---

## 1 · Datasource & Connection

### 1.1 Schema delta

```sql
-- migration: 2026-07-01_datasource_extensions.sql
ALTER TABLE datasource_config
  ADD COLUMN ssl jsonb,
  ADD COLUMN auth_method varchar(32) NOT NULL DEFAULT 'password',
  ADD COLUMN iam_role_arn varchar(255),
  ADD COLUMN service_account_json_enc bytea,
  ADD COLUMN oauth_refresh_token_enc bytea,
  ADD COLUMN pool_max int NOT NULL DEFAULT 10,
  ADD COLUMN pool_idle_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN pool_acquire_timeout_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN statement_timeout_ms int NOT NULL DEFAULT 60000,
  ADD COLUMN connection_string_enc bytea,
  ADD COLUMN tunnel_config jsonb,
  ADD COLUMN read_replica_hosts text[],
  ADD COLUMN expected_cert_fingerprint varchar(64),
  ADD COLUMN application_name varchar(64) DEFAULT 'DBExec',
  ADD COLUMN last_validated_at timestamptz;

CREATE TABLE datasource_pool_event (
  id           bigserial PRIMARY KEY,
  datasource_id uuid NOT NULL,
  event        varchar(32) NOT NULL,
  detail       jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON datasource_pool_event (datasource_id, occurred_at DESC);
```

### 1.2 Pool manager refactor

`src/shared/services/connectionPool/manager.ts`:

```ts
import { Pool as PgPool } from 'pg';
import { createPool as createMyPool } from 'mysql2/promise';
import { ConnectionPool as MssqlPool } from 'mssql';
import * as snowflake from 'snowflake-sdk';
import { BigQuery } from '@google-cloud/bigquery';
import { decrypt } from '../../utility/encryptDecrypt';
import { mapDriverError } from './driverErrors';

export interface DatasourcePool {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  cursor(sql: string, params?: unknown[]): AsyncIterable<RowBatch>;
  destroy(): Promise<void>;
  cancel(pid: number): Promise<void>;
  metrics(): PoolMetrics;
}

export interface QueryResult<T> {
  rows: T[];
  columns: ColumnMeta[];
  pid?: number;
  bytesScanned?: number;
}

const REGISTRY = new Map<string, DatasourcePool>();

export async function acquire(cfg: DatasourceConfig): Promise<DatasourcePool> {
  if (REGISTRY.has(cfg.id)) return REGISTRY.get(cfg.id)!;
  const pool = await build(cfg);
  REGISTRY.set(cfg.id, pool);
  return pool;
}

export async function refresh(id: string): Promise<void> {
  const p = REGISTRY.get(id);
  if (!p) return;
  REGISTRY.delete(id);
  await p.destroy();
}

async function build(cfg: DatasourceConfig): Promise<DatasourcePool> {
  switch (cfg.dbType) {
    case 'postgres':   return new PgDatasourcePool(cfg);
    case 'mysql':
    case 'mariadb':    return new MySqlDatasourcePool(cfg);
    case 'mssql':      return new MssqlDatasourcePool(cfg);
    case 'snowflake':  return new SnowflakeDatasourcePool(cfg);
    case 'bigquery':   return new BigQueryDatasourcePool(cfg);
    case 'databricks': return new DatabricksDatasourcePool(cfg);
    case 'oracle':     return new OracleDatasourcePool(cfg);
    case 'duckdb':     return new DuckDbDatasourcePool(cfg);
    default: throw new Error(`Unsupported db type ${cfg.dbType}`);
  }
}
```

`pg.ts`:

```ts
import { Pool } from 'pg';
import { buildRdsIamPassword } from '../iamAuth';

export class PgDatasourcePool implements DatasourcePool {
  private pool!: Pool;
  private metricsState = zeroMetrics();
  private checkoutDurations: number[] = [];

  constructor(private cfg: DatasourceConfig) {
    this.initPool();
  }

  private async initPool() {
    let password = decrypt(this.cfg.passwordEnc, this.cfg.organisationId);
    if (this.cfg.authMethod === 'iam') {
      password = await buildRdsIamPassword({
        region: this.cfg.iamRegion!,
        hostname: this.cfg.hostname!,
        port: this.cfg.port!,
        username: this.cfg.username!,
      });
      // refresh every 14 min
      setInterval(() => this.initPool(), 14 * 60 * 1000);
    }
    this.pool = new Pool({
      host: this.cfg.hostname,
      port: this.cfg.port,
      database: this.cfg.dbName,
      user: this.cfg.username,
      password,
      application_name: this.cfg.applicationName || 'DBExec',
      ssl: this.sslOptions(),
      max: this.cfg.poolMax,
      idleTimeoutMillis: this.cfg.poolIdleMs,
      connectionTimeoutMillis: this.cfg.poolAcquireTimeoutMs,
      statement_timeout: this.cfg.statementTimeoutMs,
    });
    this.pool.on('error', () => this.metricsState.totalErrors++);
  }

  private sslOptions() {
    const ssl = (this.cfg as any).ssl;
    if (!ssl || ssl.mode === 'disable') return false;
    return {
      ca: ssl.caCert,
      cert: ssl.clientCert,
      key: ssl.clientKey,
      rejectUnauthorized: ssl.mode !== 'require',
      // for TLS pinning, an additional check happens in connect handler
    };
  }

  async query<T>(sql: string, params: unknown[] = []) {
    const t0 = Date.now();
    const client = await this.pool.connect();
    try {
      this.metricsState.totalCheckouts++;
      const r = await client.query({ text: sql, values: params, rowMode: 'array' });
      const cols = r.fields.map(f => ({ name: f.name, type: pgTypeMap(f.dataTypeID) }));
      const rows = r.rows.map(row => Object.fromEntries(
        cols.map((c, i) => [c.name, row[i]])
      )) as T[];
      this.recordDuration(Date.now() - t0);
      return { rows, columns: cols, pid: (client as any).processID };
    } catch (e) {
      this.metricsState.totalErrors++;
      throw mapDriverError(e);
    } finally {
      client.release();
    }
  }

  async *cursor(sql: string, params: unknown[] = []): AsyncIterable<RowBatch> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DECLARE c1 CURSOR FOR ${sql}`, params);
      while (true) {
        const r = await client.query('FETCH 1000 FROM c1');
        if (r.rows.length === 0) break;
        yield { rows: r.rows, columns: r.fields.map(f => ({ name: f.name, type: pgTypeMap(f.dataTypeID) })) };
      }
      await client.query('CLOSE c1');
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  async cancel(pid: number): Promise<void> {
    const c = await this.pool.connect();
    try { await c.query('SELECT pg_cancel_backend($1)', [pid]); }
    finally { c.release(); }
  }

  async destroy() { await this.pool.end(); }

  metrics(): PoolMetrics {
    return { ...this.metricsState,
      size: (this.pool as any).totalCount,
      idle: (this.pool as any).idleCount,
      waiting: (this.pool as any).waitingCount,
      inUse: (this.pool as any).totalCount - (this.pool as any).idleCount,
      p95CheckoutMs: percentile(this.checkoutDurations, 0.95),
    };
  }

  private recordDuration(ms: number) {
    this.checkoutDurations.push(ms);
    if (this.checkoutDurations.length > 1000) this.checkoutDurations.shift();
  }
}
```

`bigquery.ts`:

```ts
export class BigQueryDatasourcePool implements DatasourcePool {
  private client: BigQuery;
  constructor(private cfg: DatasourceConfig) {
    const sa = JSON.parse(decrypt(cfg.serviceAccountJsonEnc!, cfg.organisationId));
    this.client = new BigQuery({ projectId: sa.project_id, credentials: sa });
  }
  async query<T>(sql: string, params: unknown[] = []) {
    const [job] = await this.client.createQueryJob({ query: sql, params, useLegacySql: false });
    const [rows, , meta] = await job.getQueryResults();
    return {
      rows: rows as T[],
      columns: meta.schema!.fields!.map((f: any) => ({ name: f.name, type: bqTypeMap(f.type) })),
      bytesScanned: Number(job.metadata.statistics?.totalBytesProcessed ?? 0),
    };
  }
  async *cursor(sql: string, params: unknown[] = []) {
    const r = await this.query(sql, params);
    yield { rows: r.rows, columns: r.columns };
  }
  async cancel(pid: number) { /* BQ has job.cancel() */ }
  async destroy() {}
  metrics() { return zeroMetrics(); }
}
```

### 1.3 Controllers (additions)

`src/modules/datasources/controllers/getPoolMetrics.ts`:

```ts
import { Request, Response } from 'express';
import { acquire } from '../../../shared/services/connectionPool/manager';
import { DatasourceConfigS } from '../../../shared/db/shared_entity/datasourceConfigS.entity';
import sendResponse from '../../../shared/utility/response';
import { CODE } from '../../../../config/config';

export default async function getPoolMetrics(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection, orgData } = res.locals;
  const cfg = await master_db_connection.getRepository(DatasourceConfigS)
    .findOne({ where: { id, organisationId: orgData.id } });
  if (!cfg) return sendResponse(res, false, CODE.NOT_FOUND, 'datasource not found');
  const pool = await acquire(cfg as any);
  return sendResponse(res, true, CODE.SUCCESS, 'ok', pool.metrics());
}
```

Route in `datasources.routes.ts`:

```ts
router.get('/:id/pool/metrics', AuthMiddleware, VerifyResource,
  VerifyDatabase, VerifyPermission('datasourceManagement'),
  getPoolMetrics);
router.post('/:id/pool/refresh', AuthMiddleware, VerifyResource,
  VerifyDatabase, VerifyPermission('datasourceManagement'),
  refreshPool);
router.post('/:id/test-ssl', /* ... */, testSsl);
```

`refreshPool.ts`:

```ts
export default async function refreshPool(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection, orgData } = res.locals;
  const exists = await master_db_connection.query(
    `SELECT 1 FROM datasource WHERE id=$1 AND organisation_id=$2`,
    [id, orgData.id]);
  if (!exists.length) return sendResponse(res, false, CODE.NOT_FOUND, 'not found');
  await refresh(id);
  await master_db_connection.query(
    `INSERT INTO datasource_pool_event (datasource_id, event, detail) VALUES ($1,'refreshed',$2)`,
    [id, { by: res.locals.loggedInId }]);
  return sendResponse(res, true, CODE.SUCCESS, 'pool refreshed');
}
```

### 1.4 Driver error normalisation

`src/shared/services/connectionPool/driverErrors.ts`:

```ts
export function mapDriverError(e: any): Error {
  const msg = e?.message ?? String(e);
  if (/ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(msg))
    return new BadRequest('Could not reach the database server.');
  if (/password authentication failed|Access denied|ORA-01017|Login failed/i.test(msg))
    return new BadRequest('Invalid database credentials.');
  if (/permission denied|insufficient privilege/i.test(msg))
    return new BadRequest('The database user lacks permission for this operation.');
  if (/statement timeout|canceling statement|ERR_CANCELED/i.test(msg))
    return new BadRequest('Query timed out.');
  if (/SSL handshake|certificate verify failed/i.test(msg))
    return new BadRequest('SSL handshake failed; check TLS configuration.');
  return new BadRequest(`Database error: ${msg.slice(0, 200)}`);
}
```

---

## 2 · Semantic Layer

### 2.1 Entities

```ts
// src/shared/db/shared_entity/semantic/semanticModel.entity.ts
@Entity('semantic_model')
@Index(['organisationId', 'datasetId', 'name'], { unique: true })
export class SemanticModel {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;
  @Column('uuid') datasetId!: string;
  @Column({ length: 64 }) name!: string;
  @Column('text', { nullable: true }) description?: string;
  @Column({ length: 128, nullable: true }) primaryEntity?: string;
  @Column({ length: 128, nullable: true }) defaultTimeColumn?: string;
  @Column('text', { nullable: true }) sqlAlwaysWhere?: string;
  @Column('uuid') createdBy!: string;
  @Column({ default: 1 }) status!: number;
  @Column('int', { default: 1 }) lockVersion!: number;
  @CreateDateColumn() createdOn!: Date;
  @UpdateDateColumn() updatedOn!: Date;
}
```

```ts
// sem_dimension, sem_metric, sem_entity, sem_entity_join, sem_segment — analogous.
@Entity('sem_dimension')
@Index(['semanticModelId', 'name'], { unique: true })
export class SemDimension {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') semanticModelId!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ length: 16 }) type!: 'string'|'numeric'|'time'|'bool'|'geo';
  @Column('text') expression!: string;
  @Column({ length: 16, nullable: true }) timeGrain?: 'day'|'week'|'month'|'quarter'|'year';
  @Column({ length: 128, nullable: true }) label?: string;
  @Column({ length: 32, nullable: true }) format?: string;
  @Column('text', { nullable: true }) description?: string;
  @Column({ default: false }) hidden!: boolean;
  @Column('uuid', { nullable: true }) parentId?: string;          // hierarchy
  @Column({ default: false }) isRequired!: boolean;
  @Column('text', { nullable: true }) displaySql?: string;
}
```

```ts
@Entity('sem_metric')
@Index(['semanticModelId', 'name'], { unique: true })
export class SemMetric {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') semanticModelId!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ length: 16 }) kind!: 'simple'|'ratio'|'derived'|'cumulative'|'conversion';
  @Column('text') expression!: string;
  @Column({ length: 16, nullable: true }) agg?: string;
  @Column('text', { nullable: true }) filter?: string;
  @Column('uuid', { nullable: true }) numeratorId?: string;
  @Column('uuid', { nullable: true }) denominatorId?: string;
  @Column({ length: 32, nullable: true }) window?: string;
  @Column('jsonb', { nullable: true }) conversion?: any;
  @Column({ length: 128, nullable: true }) label?: string;
  @Column({ length: 32, nullable: true }) format?: string;
  @Column({ default: false }) hidden!: boolean;
  @Column({ default: true }) isAdditive!: boolean;
  @Column({ default: false }) isSemiAdditive!: boolean;
  @Column({ length: 16, nullable: true }) semiAdditiveFunc?: 'LAST'|'FIRST'|'AVG';
  @Column({ length: 16, nullable: true }) windowReset?: 'day'|'week'|'month'|'year'|'fiscal_year';
  @Column('text', { array: true, nullable: true }) allowedAggregations?: string[];
}
```

### 2.2 Validators

`src/shared/validators/semantic.ts`:

```ts
import { z } from 'zod';

export const semanticModelSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'validation.semantic.name.invalid'),
  description: z.string().max(500).optional(),
  primaryEntity: z.string().max(128).optional(),
  defaultTimeColumn: z.string().max(128).optional(),
  sqlAlwaysWhere: z.string().max(2000).optional(),
});

export const dimensionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum(['string','numeric','time','bool','geo']),
  expression: z.string().min(1).max(2000),
  timeGrain: z.enum(['day','week','month','quarter','year']).optional(),
  label: z.string().max(128).optional(),
  format: z.string().max(32).optional(),
  description: z.string().max(500).optional(),
  hidden: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
  isRequired: z.boolean().optional(),
  displaySql: z.string().max(2000).optional(),
}).refine(v => v.type !== 'time' || v.timeGrain,
  { message: 'validation.semantic.dimension.timeGrainRequired' });

export const metricSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  kind: z.enum(['simple','ratio','derived','cumulative','conversion']),
  expression: z.string().min(1).max(2000),
  agg: z.enum(['sum','count','count_distinct','avg','min','max','median','stddev','variance']).optional(),
  filter: z.string().max(2000).optional(),
  numeratorId: z.string().uuid().optional(),
  denominatorId: z.string().uuid().optional(),
  window: z.string().max(32).optional(),
  conversion: z.any().optional(),
  label: z.string().max(128).optional(),
  format: z.string().max(32).optional(),
  hidden: z.boolean().optional(),
  isAdditive: z.boolean().optional(),
  isSemiAdditive: z.boolean().optional(),
  semiAdditiveFunc: z.enum(['LAST','FIRST','AVG']).optional(),
  windowReset: z.enum(['day','week','month','year','fiscal_year']).optional(),
  allowedAggregations: z.array(z.string()).optional(),
});
```

### 2.3 Static lint

`src/modules/semantic/services/lint.service.ts`:

```ts
export interface LintIssue { where: string; severity: 'error'|'warning'; message: string; }

export async function lintSemanticModel(conn: Connection, modelId: string): Promise<LintIssue[]> {
  const model = await conn.getRepository(SemanticModel).findOne({ where: { id: modelId }, relations: ['dimensions','metrics','segments','joins'] }) as any;
  if (!model) throw new Error('not found');
  const issues: LintIssue[] = [];
  const dimNames = new Set(model.dimensions.map((d: any) => d.name));
  const metNames = new Set(model.metrics.map((m: any) => m.name));

  for (const m of model.metrics) {
    if (m.kind === 'derived') {
      for (const ref of refs(m.expression)) {
        if (!metNames.has(ref))
          issues.push({ where: `metric.${m.name}`, severity: 'error',
            message: `references unknown metric {${ref}}` });
      }
      if (hasCycle(m, model.metrics))
        issues.push({ where: `metric.${m.name}`, severity: 'error',
          message: 'derived expression has a cycle' });
    }
    if (m.kind === 'ratio' && (!m.numeratorId || !m.denominatorId))
      issues.push({ where: `metric.${m.name}`, severity: 'error',
        message: 'ratio needs both numerator and denominator' });
    if (m.kind === 'simple' && !m.agg)
      issues.push({ where: `metric.${m.name}`, severity: 'error',
        message: 'simple metric needs an aggregation' });
  }
  for (const d of model.dimensions) {
    if (d.type === 'time' && !d.timeGrain)
      issues.push({ where: `dim.${d.name}`, severity: 'error',
        message: 'time dimension needs a grain' });
  }
  // unused-dim warning
  const used = collectUsedDims(model);
  for (const d of model.dimensions)
    if (!used.has(d.name))
      issues.push({ where: `dim.${d.name}`, severity: 'warning', message: 'unused dimension' });

  return issues;
}

function refs(expr: string) {
  return [...new Set([...(expr.match(/\{(\w+)\}/g) || []).map(s => s.slice(1, -1))])];
}
function hasCycle(start: any, all: any[]): boolean {
  const stack = new Set<string>();
  function visit(name: string): boolean {
    if (stack.has(name)) return true;
    stack.add(name);
    const m = all.find(x => x.name === name);
    if (m && m.kind === 'derived') for (const r of refs(m.expression)) if (visit(r)) return true;
    stack.delete(name);
    return false;
  }
  return visit(start.name);
}
function collectUsedDims(model: any): Set<string> { /* … */ return new Set(model.dimensions.map((d: any) => d.name)); }
```

### 2.4 Controllers

```ts
// src/modules/semantic/controllers/addSemanticModel.ts
export default async function addSemanticModel(req: Request, res: Response) {
  const { master_db_connection, orgData, loggedInId } = res.locals;
  const body = req.body; // already Zod-validated
  const ds = await master_db_connection.query(
    'SELECT id FROM dataset WHERE id=$1 AND organisation_id=$2',
    [body.datasetId, orgData.id]);
  if (!ds.length) return sendResponse(res, false, CODE.NOT_FOUND, 'dataset not found');

  const repo = master_db_connection.getRepository(SemanticModel);
  if (await repo.findOne({ where: { organisationId: orgData.id, datasetId: body.datasetId, name: body.name } }))
    return sendResponse(res, false, CODE.ALREADY_EXISTS, 'semantic.alreadyExists');

  const m = new SemanticModel();
  Object.assign(m, body, { organisationId: orgData.id, createdBy: loggedInId });
  await repo.save(m);

  await auditLogger.logAuditToOrg({
    connection: master_db_connection, req, res,
    module: AUDIT_MODULES.SEMANTIC_MODEL, action: AUDIT_ACTIONS.CREATE,
    entityName: 'SemanticModel', entityId: m.id, metadata: { entity: snapshotEntity(m, AUDIT_FIELDS.SEMANTIC_MODEL) },
  });
  return sendResponse(res, true, CODE.SUCCESS, 'semantic.created', m);
}
```

`semanticQuery.ts` — executes a semantic query:

```ts
import { SemanticCompiler } from '../../../shared/services/semanticCompiler';
import { acquire } from '../../../shared/services/connectionPool/manager';
import { cache } from '../../../shared/services/cache.singleton';

export default async function semanticQuery(req: Request, res: Response) {
  const { master_db_connection, orgData, loggedInId } = res.locals;
  const body = req.body; // validated

  const compiler = new SemanticCompiler(master_db_connection);
  const compiled = await compiler.compile(body, {
    callerId: loggedInId, orgId: orgData.id,
  });

  const result = await cache.getOrCompute(compiled.cacheKey, body.cacheTtlSecs ?? 300, async () => {
    const cfg = await master_db_connection.getRepository(DatasourceConfigS).findOne({ where: { id: compiled.datasourceId } });
    const pool = await acquire(cfg as any);
    const r = await pool.query(compiled.sql, compiled.bindings);
    return r;
  });

  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    columns: result.columns, rows: result.rows,
    meta: { cacheKey: compiled.cacheKey, sqlCompiled: compiled.sql },
  });
}
```

### 2.5 Routes

```ts
// src/modules/semantic/semantic.routes.ts
router.post('/',                AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), zodValidate(semanticModelSchema), addSemanticModel);
router.get ('/list/:datasetId', AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), listSemanticModels);
router.get ('/:id',             AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), getSemanticModel);
router.put ('/:id',             AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), zodValidate(semanticModelSchema), updateSemanticModel);
router.delete('/:id',           AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), deleteSemanticModel);
router.post('/:id/dimension',   AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), zodValidate(dimensionSchema), addDimension);
router.put ('/:id/dimension/:did', /* ... */, updateDimension);
router.delete('/:id/dimension/:did', /* ... */, deleteDimension);
// same for metric, segment, join
router.post('/:id/lint',        AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), lintModel);
router.post('/:id/dry-run',     AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), dryRunModel);
router.post('/:id/clone',       AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), cloneModel);
router.post('/query',           AuthMiddleware, VerifyResource, VerifyDatabase, VerifyPermission('semanticLayer'), zodValidate(queryRequestSchema), semanticQuery);
```

---

## 4 · Query Processor

### 4.1 AST types

```ts
// src/shared/queryCompiler/ast.ts
export type QueryAst = SelectAst;
export interface SelectAst {
  kind: 'select';
  cols: ProjectionAst[];
  from: FromAst;
  where?: PredicateAst;
  groupBy?: number[];
  orderBy?: OrderAst[];
  limit?: number;
  offset?: number;
}
export type ProjectionAst =
  | { kind: 'col'; expr: string; alias?: string }
  | { kind: 'agg'; agg: AggFn; expr: string; alias: string }
  | { kind: 'time'; grain: TimeGrain; expr: string; alias: string }
  | { kind: 'window'; agg: AggFn; expr: string; partitionBy?: string[]; orderBy?: OrderAst[]; frame?: WindowFrame; alias: string };

export type FromAst =
  | { kind: 'subquery'; sql: string }
  | { kind: 'table'; schema?: string; table: string };

export type PredicateAst =
  | { op: 'eq'|'ne'|'gt'|'lt'|'gte'|'lte'; col: string; value: unknown }
  | { op: 'in'|'not_in'; col: string; values: unknown[] }
  | { op: 'between'; col: string; lo: unknown; hi: unknown }
  | { op: 'like'|'ilike'; col: string; pattern: string }
  | { op: 'is_null'|'is_not_null'; col: string }
  | { op: 'and'|'or'; clauses: PredicateAst[] }
  | { op: 'raw'; sql: string };

export type AggFn = 'sum'|'count'|'count_distinct'|'avg'|'min'|'max'|'median'|'percentile';
export type TimeGrain = 'second'|'minute'|'hour'|'day'|'week'|'month'|'quarter'|'year';
export type WindowFrame = { type: 'rows'|'range'; start: string; end: string };
export type OrderAst = { col: string; dir: 'asc'|'desc'; nulls?: 'first'|'last' };
```

### 4.2 Dialect adapter contract

```ts
// src/shared/queryCompiler/dialect.ts
export interface DialectAdapter {
  readonly name: string;
  quoteIdent(s: string): string;
  paramPlaceholder(i: number): string;
  dateTrunc(grain: TimeGrain, expr: string): string;
  cast(expr: string, type: string): string;
  limitOffset(limit?: number, offset?: number): string;
  agg(fn: AggFn, expr: string, ...rest: string[]): string;
  nullsOrder(dir: 'asc'|'desc', nulls?: 'first'|'last'): string;
  bigintCast(expr: string): string;
  print(ast: QueryAst, bindings: unknown[], rls: string[]): string;
}
```

### 4.3 Postgres dialect

```ts
// src/shared/queryCompiler/postgres.ts
export class PostgresDialect implements DialectAdapter {
  readonly name = 'postgres';
  quoteIdent(s: string): string { return `"${s.replace(/"/g, '""')}"`; }
  paramPlaceholder(i: number): string { return `$${i}`; }

  dateTrunc(grain: TimeGrain, expr: string): string {
    return `DATE_TRUNC('${grain}', ${expr})`;
  }
  cast(expr: string, type: string): string { return `(${expr})::${type}`; }
  limitOffset(limit?: number, offset?: number): string {
    return [limit ? `LIMIT ${limit}` : '', offset ? `OFFSET ${offset}` : ''].filter(Boolean).join(' ');
  }
  agg(fn: AggFn, expr: string, ...rest: string[]) {
    switch (fn) {
      case 'count_distinct': return `COUNT(DISTINCT ${expr})`;
      case 'median': return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${expr})`;
      case 'percentile': return `PERCENTILE_CONT(${rest[0]}) WITHIN GROUP (ORDER BY ${expr})`;
      default: return `${fn.toUpperCase()}(${expr})`;
    }
  }
  nullsOrder(dir: 'asc'|'desc', nulls?: 'first'|'last') {
    const d = dir.toUpperCase();
    return nulls ? `${d} NULLS ${nulls.toUpperCase()}` : d;
  }
  bigintCast(expr: string) { return `(${expr})::bigint`; }

  print(ast: QueryAst, bindings: unknown[], rls: string[]): string {
    return new Printer(this).print(ast, bindings, rls);
  }
}

class Printer {
  constructor(private d: DialectAdapter) {}
  print(ast: QueryAst, bindings: unknown[], rls: string[]): string {
    const cols = ast.cols.map(c => this.col(c)).join(', ');
    const from = ast.from.kind === 'subquery'
      ? `(${ast.from.sql})`
      : `${ast.from.schema ? this.d.quoteIdent(ast.from.schema) + '.' : ''}${this.d.quoteIdent(ast.from.table)}`;
    const wheres: string[] = [];
    if (ast.where) wheres.push(this.pred(ast.where, bindings));
    wheres.push(...rls);
    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const groupBy = ast.groupBy?.length ? `GROUP BY ${ast.groupBy.join(', ')}` : '';
    const orderBy = ast.orderBy?.length
      ? `ORDER BY ${ast.orderBy.map(o => `${this.d.quoteIdent(o.col)} ${this.d.nullsOrder(o.dir, o.nulls)}`).join(', ')}`
      : '';
    return [
      `SELECT ${cols}`,
      `FROM ${from} AS base`,
      where, groupBy, orderBy,
      this.d.limitOffset(ast.limit, ast.offset),
    ].filter(Boolean).join('\n');
  }

  private col(c: ProjectionAst): string {
    switch (c.kind) {
      case 'col':    return c.alias ? `${c.expr} AS ${this.d.quoteIdent(c.alias)}` : c.expr;
      case 'time':   return `${this.d.dateTrunc(c.grain, c.expr)} AS ${this.d.quoteIdent(c.alias)}`;
      case 'agg':    return `${this.d.agg(c.agg, c.expr)} AS ${this.d.quoteIdent(c.alias)}`;
      case 'window': {
        const parts = [
          c.partitionBy?.length ? `PARTITION BY ${c.partitionBy.map(p => this.d.quoteIdent(p)).join(', ')}` : '',
          c.orderBy?.length ? `ORDER BY ${c.orderBy.map(o => `${this.d.quoteIdent(o.col)} ${this.d.nullsOrder(o.dir, o.nulls)}`).join(', ')}` : '',
          c.frame ? `${c.frame.type.toUpperCase()} BETWEEN ${c.frame.start} AND ${c.frame.end}` : '',
        ].filter(Boolean).join(' ');
        return `${this.d.agg(c.agg, c.expr)} OVER (${parts}) AS ${this.d.quoteIdent(c.alias)}`;
      }
    }
  }

  private pred(p: PredicateAst, b: unknown[]): string {
    const q = this.d.quoteIdent.bind(this.d);
    const ph = (v: unknown) => { b.push(v); return this.d.paramPlaceholder(b.length); };
    switch (p.op) {
      case 'eq':  return `${q(p.col)} = ${ph(p.value)}`;
      case 'ne':  return `${q(p.col)} <> ${ph(p.value)}`;
      case 'gt':  return `${q(p.col)} > ${ph(p.value)}`;
      case 'lt':  return `${q(p.col)} < ${ph(p.value)}`;
      case 'gte': return `${q(p.col)} >= ${ph(p.value)}`;
      case 'lte': return `${q(p.col)} <= ${ph(p.value)}`;
      case 'in':  return `${q(p.col)} IN (${p.values.map(ph).join(', ')})`;
      case 'not_in':  return `${q(p.col)} NOT IN (${p.values.map(ph).join(', ')})`;
      case 'between': return `${q(p.col)} BETWEEN ${ph(p.lo)} AND ${ph(p.hi)}`;
      case 'like':    return `${q(p.col)} LIKE ${ph(p.pattern)}`;
      case 'ilike':   return `${q(p.col)} ILIKE ${ph(p.pattern)}`;
      case 'is_null':     return `${q(p.col)} IS NULL`;
      case 'is_not_null': return `${q(p.col)} IS NOT NULL`;
      case 'and': return '(' + p.clauses.map(c => this.pred(c, b)).join(' AND ') + ')';
      case 'or':  return '(' + p.clauses.map(c => this.pred(c, b)).join(' OR ') + ')';
      case 'raw': return p.sql;
    }
  }
}
```

Snowflake / BigQuery / MySQL / MSSQL dialects override `dateTrunc`,
`agg`, `paramPlaceholder`, `quoteIdent`, `nullsOrder`, `limitOffset`.

### 4.4 Safe-list pre-check

```ts
// src/shared/queryCompiler/safelist.ts
import { parse } from 'pgsql-ast-parser';

const FORBIDDEN = new Set([
  'create','drop','alter','truncate','insert','update','delete',
  'grant','revoke','merge','lock','vacuum','analyze',
  'commit','rollback','savepoint','copy','call',
]);

export function assertSafeSql(sql: string) {
  let ast;
  try { ast = parse(sql); }
  catch (e) { throw new BadRequest(`Invalid SQL: ${(e as Error).message}`); }
  for (const stmt of ast) {
    if (FORBIDDEN.has((stmt as any).type))
      throw new BadRequest(`SQL statement "${(stmt as any).type}" is not allowed.`);
  }
  if (ast.length > 1)
    throw new BadRequest('Multiple SQL statements are not allowed.');
}
```

---

## 5 · Cache & Materialisation

### 5.1 Redis singleton

```ts
// src/shared/services/redis.singleton.ts
import Redis from 'ioredis';
export const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});
```

### 5.2 Cache service

```ts
// src/shared/services/cache.service.ts
import * as zlib from 'node:zlib';
import { redis } from './redis.singleton';

const COMPRESS_THRESHOLD = 4096;

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const buf = await redis.getBuffer(key);
    if (!buf) return null;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const json = zlib.gunzipSync(buf).toString('utf8');
      return JSON.parse(json) as T;
    }
    return JSON.parse(buf.toString('utf8')) as T;
  }

  async set<T>(key: string, val: T, ttlSecs: number) {
    const json = JSON.stringify(val);
    if (json.length > COMPRESS_THRESHOLD) {
      const buf = zlib.gzipSync(json);
      await redis.set(key, buf, 'EX', ttlSecs);
    } else {
      await redis.set(key, json, 'EX', ttlSecs);
    }
  }

  async getOrCompute<T>(key: string, ttlSecs: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) {
      metrics.counter('cache_hit_total').inc();
      return hit;
    }
    metrics.counter('cache_miss_total').inc();
    const lock = `${key}:lock`;
    const gotLock = await redis.set(lock, '1', 'EX', 30, 'NX');
    if (!gotLock) {
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        const v = await this.get<T>(key);
        if (v !== null) return v;
      }
    }
    try {
      const t0 = Date.now();
      const v = await compute();
      metrics.histogram('cache_miss_compute_ms').observe(Date.now() - t0);
      await this.set(key, v, ttlSecs);
      return v;
    } finally {
      await redis.del(lock);
    }
  }

  async swr<T>(key: string, ttlSecs: number, staleSecs: number, compute: () => Promise<T>): Promise<T> {
    const value = await this.get<T>(key);
    if (value !== null) {
      const ttl = await redis.ttl(key);
      if (ttl < ttlSecs - staleSecs) {
        // serve stale, refresh in background
        void this.getOrCompute(key, ttlSecs, compute).catch(() => {});
      }
      return value;
    }
    return this.getOrCompute(key, ttlSecs, compute);
  }

  async invalidate(prefix: string): Promise<number> {
    let cursor = '0', deleted = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
      cursor = next;
      if (keys.length) deleted += await redis.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }
}

export const cache = new CacheService();
```

### 5.3 BullMQ wiring

```ts
// src/shared/services/queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from './redis.singleton';

const connection = redis.options;
export const scheduleQueue = new Queue('dbexec-schedule', { connection });

new Worker('dbexec-schedule', async (job) => {
  switch (job.name) {
    case 'subscription:run':     return (await import('../../modules/subscriptions/jobs/runSubscription')).default(job.data.id);
    case 'alert:check':          return (await import('../../modules/alerts/jobs/checkAlert')).default(job.data.id);
    case 'materialised:refresh': return (await import('../../modules/materialised/jobs/refresh')).default(job.data.id);
    case 'cache:warm':           return (await import('../../modules/cache/jobs/warm')).default(job.data);
    case 'export:render':        return (await import('../../modules/exports/jobs/render')).default(job.data);
    case 'webhook:deliver':      return (await import('../../modules/webhooks/jobs/deliver')).default(job.data);
    case 'dataset:refresh':      return (await import('../../modules/datasets/jobs/refresh')).default(job.data.id);
    case 'thumbnail:generate':   return (await import('../../modules/dashboards/jobs/thumbnail')).default(job.data.id);
  }
}, { connection, concurrency: 10 });
```

### 5.4 Materialised view

Entity + worker:

```ts
@Entity('materialised_view')
export class MaterialisedView {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;
  @Column('uuid') datasetId!: string;
  @Column({ length: 255 }) targetTable!: string;
  @Column({ length: 64, nullable: true }) cron?: string;
  @Column('text') querySql!: string;
  @Column({ length: 16, nullable: true }) grain?: string;
  @Column('jsonb', { nullable: true }) dimensions?: string[];
  @Column('jsonb', { nullable: true }) metrics?: string[];
  @Column('timestamptz', { nullable: true }) lastRefreshAt?: Date;
  @Column({ length: 16, nullable: true }) lastStatus?: 'ok'|'failed';
  @Column('int', { nullable: true }) lastDurationMs?: number;
  @Column('bigint', { nullable: true }) rowCount?: number;
  @Column('uuid', { array: true, nullable: true }) dependsOnDatasetIds?: string[];
}
```

```ts
// src/modules/materialised/jobs/refresh.ts
export default async function refreshMv(id: string) {
  const mv = await MaterialisedView.findOne({ where: { id } });
  if (!mv) return;
  const managed = await ManagedDatasourceService.poolFor(mv.organisationId);
  const tmp = `${mv.targetTable}__tmp`;
  const t0 = Date.now();
  try {
    await managed.query(`DROP TABLE IF EXISTS "${tmp}"`);
    await managed.query(`CREATE TABLE "${tmp}" AS (${mv.querySql})`);
    await managed.query('BEGIN');
    await managed.query(`DROP TABLE IF EXISTS "${mv.targetTable}"`);
    await managed.query(`ALTER TABLE "${tmp}" RENAME TO "${mv.targetTable}"`);
    await managed.query('COMMIT');
    const [{ count }] = await managed.query(`SELECT COUNT(*)::bigint AS count FROM "${mv.targetTable}"`);
    await MaterialisedView.update(id, {
      lastRefreshAt: new Date(), lastStatus: 'ok',
      lastDurationMs: Date.now() - t0, rowCount: Number(count),
    });
    await cache.invalidate(`DBExec:sem:${mv.datasetId}`);
  } catch (e) {
    await managed.query('ROLLBACK').catch(() => {});
    await MaterialisedView.update(id, {
      lastRefreshAt: new Date(), lastStatus: 'failed',
      lastDurationMs: Date.now() - t0,
    });
    throw e;
  }
}
```

---

## 6 · Analysis & Visual Builder

The BE additions here are mostly **registry data** and the
`render-visual` service used by dashboards.

### 6.1 Visual spec registry endpoint

```ts
// src/modules/visualisations/controllers/listSpecs.ts
import { ALL_SPECS } from '../../../shared/visualisations/registry';
export default async function listSpecs(req: Request, res: Response) {
  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    specs: ALL_SPECS.map(s => ({
      chartType: s.chartType, family: s.family, description: s.description,
      roles: s.roles, properties: s.properties,
    })),
  });
}
```

### 6.2 Parameters

```ts
@Entity('analysis_parameter')
export class AnalysisParameter {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') analysisId!: string;
  @Column({ length: 64 }) name!: string;
  @Column({ length: 128, nullable: true }) label?: string;
  @Column({ length: 16 }) type!: 'text'|'number'|'date'|'enum';
  @Column('text', { nullable: true }) defaultValue?: string;
  @Column('text', { array: true, nullable: true }) enumValues?: string[];
  @Column({ length: 128, nullable: true }) bindToField?: string;
}
```

```ts
// CRUD controllers omitted for brevity — same pattern as dimensions.
```

### 6.3 Render-visual service

Used by dashboards' live mode AND single-visual fetch.

```ts
// src/shared/services/render/renderVisual.service.ts
export async function renderVisual(opts: {
  analysisId: string;
  visualId: string;
  filters?: FilterClause[];
  parameters?: Record<string, unknown>;
  drillState?: DrillState;
  caller: AuthCtx;
}): Promise<{ rows: any[]; columns: ColumnMeta[]; meta: any }> {
  const analysis = await Analyses.findOne({ where: { id: opts.analysisId } });
  if (!analysis) throw new NotFound('analysis');
  const visual = (analysis.visuals as any[]).find(v => v.id === opts.visualId);
  if (!visual) throw new NotFound('visual');

  const semReq = mapVisualToSemanticRequest(visual, opts.filters, opts.parameters, opts.drillState);
  const compiler = new SemanticCompiler();
  const compiled = await compiler.compile(semReq, { caller: opts.caller });
  return await cache.getOrCompute(compiled.cacheKey, analysis.cacheTtlSecs || 300, async () => {
    const cfg = await DatasourceConfigS.findOne({ where: { id: compiled.datasourceId } });
    const pool = await acquire(cfg as any);
    return await pool.query(compiled.sql, compiled.bindings);
  });
}
```

---

## 8 · Dashboards (live mode + filters + thumbnails)

### 8.1 Schema delta

```sql
ALTER TABLE dashboard
  ADD COLUMN mode varchar(16) NOT NULL DEFAULT 'snapshot',
  ADD COLUMN cover_image_url text,
  ADD COLUMN sections jsonb,
  ADD COLUMN settings jsonb,
  ADD COLUMN theme_override jsonb;

CREATE TABLE dashboard_filter (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id    uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  filter_type     varchar(32) NOT NULL,
  control_type    varchar(32) NOT NULL,
  column_name     varchar(255) NOT NULL,
  default_value   jsonb,
  config          jsonb,
  scope           jsonb,
  sequence        int NOT NULL DEFAULT 0,
  is_enabled      boolean NOT NULL DEFAULT true,
  is_mandatory    boolean NOT NULL DEFAULT false
);

CREATE TABLE dashboard_thumbnail (
  dashboard_id uuid PRIMARY KEY,
  bytes        bytea NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_tab (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  name         varchar(100) NOT NULL,
  layout       jsonb NOT NULL,
  ordering     int NOT NULL DEFAULT 0
);
```

### 8.2 Live render controller

```ts
// src/modules/dashboards/controllers/renderDashboard.ts
export default async function renderDashboard(req: Request, res: Response) {
  const { id } = req.params;
  const { master_db_connection, orgData, loggedInId } = res.locals;
  const dashboard = await master_db_connection.getRepository(Dashboard)
    .findOne({ where: { id, organisationId: orgData.id } });
  if (!dashboard) return sendResponse(res, false, CODE.NOT_FOUND, 'not found');

  if (dashboard.mode === 'snapshot' && dashboard.snapshot)
    return sendResponse(res, true, CODE.SUCCESS, 'ok', dashboard.snapshot);

  const filters = mergeFilters(dashboard.filters, parseFilterQuery(req.query));
  const layout = dashboard.layout as any;
  const visualResults = await Promise.allSettled(
    layout.visuals.map((v: any) => renderVisual({
      analysisId: v.analysisId, visualId: v.visualId,
      filters, parameters: req.query.params ? JSON.parse(req.query.params as string) : undefined,
      caller: { userId: loggedInId, organisationId: orgData.id, scopes: [], userAttributes: await loadUserAttrs(loggedInId) },
    }))
  );

  const visuals = visualResults.map((r, i) => {
    const v = layout.visuals[i];
    if (r.status === 'fulfilled') return { ...v, ...r.value };
    return { ...v, error: (r.reason as Error).message };
  });

  return sendResponse(res, true, CODE.SUCCESS, 'ok', {
    layout: dashboard.layout, visuals,
    meta: { mode: 'live', generatedAt: new Date().toISOString() },
  });
}
```

### 8.3 PDF export

```ts
// src/modules/dashboards/services/dashboardExport.service.ts
import { BrowserPool } from '../../../shared/services/browserPool';

const pool = new BrowserPool({ capacity: 4 });

export async function renderDashboardPdf(dashboardId: string, opts: {
  serviceToken: string;
  filters?: Record<string, unknown>;
  format?: 'A3'|'A4'|'Letter';
  landscape?: boolean;
  watermark?: string;
}): Promise<Buffer> {
  return pool.use(async (page) => {
    await page.setExtraHTTPHeaders({ 'x-auth-token': opts.serviceToken });
    const url = `${process.env.FE_URL}/embed/dashboard/${dashboardId}?print=true&filters=${encodeURIComponent(JSON.stringify(opts.filters || {}))}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90_000 });
    await page.waitForFunction(() => (window as any).__DASHBOARD_READY__ === true, { timeout: 90_000 });
    if (opts.watermark) {
      await page.evaluate((wm) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999';
        d.innerHTML = `<div style="opacity:.07;font-size:120px;transform:rotate(-30deg);font-family:sans-serif">${wm}</div>`;
        document.body.appendChild(d);
      }, opts.watermark);
    }
    return await page.pdf({
      format: opts.format || 'A3',
      landscape: opts.landscape ?? true,
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
  });
}
```

`browserPool.ts` keeps 4 warm Chromium instances.

### 8.4 Thumbnail generator

```ts
// src/modules/dashboards/jobs/thumbnail.ts
export default async function generateThumbnail(dashboardId: string) {
  const buf = await renderDashboardPng(dashboardId, {
    serviceToken: signServiceToken(),
    viewport: { width: 1280, height: 800 },
    scale: 0.5,
  });
  const small = await sharp(buf).resize(640, 400).png({ quality: 80 }).toBuffer();
  await DashboardThumbnail.upsert({ dashboardId, bytes: small, generatedAt: new Date() }, ['dashboardId']);
  await cache.set(`thumb:dashboard:${dashboardId}`, small.toString('base64'), 86400);
}
```

Schedule via BullMQ on every publish + nightly cron.

---

## 9 · RLS & Column Security

### 9.1 Schema delta

```sql
CREATE TABLE column_security (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  dataset_id      uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  scope           varchar(16) NOT NULL,
  scope_id        uuid NOT NULL,
  column_name     varchar(255) NOT NULL,
  action          varchar(16) NOT NULL,           -- hide|mask
  mask_pattern    varchar(255),
  is_enabled      boolean NOT NULL DEFAULT true,
  is_pii          boolean NOT NULL DEFAULT false,
  pii_class       varchar(32),
  UNIQUE (dataset_id, scope, scope_id, column_name)
);

CREATE TABLE user_attribute (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(64) NOT NULL,
  type            varchar(16) NOT NULL,
  default_value   text,
  UNIQUE (organisation_id, name)
);
CREATE TABLE user_attribute_value (
  user_id      uuid NOT NULL,
  attribute_id uuid NOT NULL REFERENCES user_attribute(id) ON DELETE CASCADE,
  value        text NOT NULL,
  PRIMARY KEY (user_id, attribute_id)
);

ALTER TABLE rls_rule
  ADD COLUMN precedence int NOT NULL DEFAULT 0,
  ADD COLUMN deny_by_default boolean NOT NULL DEFAULT false;

CREATE TABLE connection_impersonation (
  datasource_id uuid NOT NULL,
  scope         varchar(16) NOT NULL,
  scope_id      uuid NOT NULL,
  db_role       varchar(128) NOT NULL,
  PRIMARY KEY (datasource_id, scope, scope_id)
);
```

### 9.2 Security compiler

```ts
// src/shared/services/securityCompiler.ts
export interface ProjectionRewrite {
  hide: string[];
  mask: { col: string; pattern: string }[];
}

export class SecurityCompiler {
  constructor(private conn: Connection) {}

  async predicates(datasetId: string, caller: AuthCtx): Promise<string[]> {
    if (!caller.userId) return [];
    const rules = await this.loadRowRules(datasetId, caller);
    const attrs = await this.loadUserAttrs(caller.userId);

    const out: string[] = [];
    if (rules.some(r => r.denyByDefault) && rules.length === 0) out.push('FALSE');

    const sorted = rules.sort((a, b) => a.precedence - b.precedence);
    for (const r of sorted) {
      out.push(this.renderRow(r, attrs));
    }
    return out;
  }

  async projection(datasetId: string, caller: AuthCtx): Promise<ProjectionRewrite> {
    const cols = await this.loadColumnRules(datasetId, caller);
    return {
      hide: cols.filter(c => c.action === 'hide').map(c => c.columnName),
      mask: cols.filter(c => c.action === 'mask').map(c => ({ col: c.columnName, pattern: c.maskPattern! })),
    };
  }

  applyProjection(rows: any[], p: ProjectionRewrite) {
    if (!p.hide.length && !p.mask.length) return rows;
    return rows.map(r => {
      const o = { ...r };
      for (const h of p.hide) delete o[h];
      for (const m of p.mask) o[m.col] = this.applyMask(o[m.col], m.pattern);
      return o;
    });
  }

  private renderRow(rule: any, attrs: Record<string, unknown>): string {
    let values = rule.values;
    if (Array.isArray(values)) {
      values = values.map((v: any) => {
        const m = typeof v === 'string' && /^\{\{user\.(\w+)\}\}$/.exec(v);
        return m ? attrs[m[1]] : v;
      });
    }
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lit = (v: any) => typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
    const list = (vs: any[]) => vs.map(lit).join(', ');
    switch (rule.operator) {
      case 'in':       return `${q(rule.columnName)} IN (${list(values)})`;
      case 'not_in':   return `${q(rule.columnName)} NOT IN (${list(values)})`;
      case 'equals':   return `${q(rule.columnName)} = ${lit(values[0])}`;
      case 'between':  return `${q(rule.columnName)} BETWEEN ${lit(values[0])} AND ${lit(values[1])}`;
      default: throw new Error(`unknown operator ${rule.operator}`);
    }
  }

  private applyMask(v: unknown, pattern: string): unknown {
    if (v == null) return v;
    const s = String(v);
    const crypto = require('node:crypto');
    return pattern
      .replace(/\{last(\d+)\}/g, (_, n) => s.slice(-Number(n)))
      .replace(/\{first(\d+)\}/g, (_, n) => s.slice(0, Number(n)))
      .replace(/\{hash\}/g, crypto.createHash('sha256').update(s).digest('hex').slice(0, 12))
      .replace(/\{category\}/g, () => {
        const n = Number(s);
        return Number.isNaN(n) ? '?' : n < 100 ? 'low' : n < 1000 ? 'medium' : 'high';
      });
  }

  private async loadRowRules(datasetId: string, c: AuthCtx) {
    return this.conn.query(`
      SELECT * FROM rls_rule
      WHERE dataset_id = $1 AND is_enabled = true
        AND (
          (scope = 'user' AND scope_id = $2)
          OR (scope = 'group' AND scope_id = ANY($3))
        )
      ORDER BY precedence ASC`, [datasetId, c.userId, c.groupIds ?? []]);
  }

  private async loadColumnRules(datasetId: string, c: AuthCtx) {
    return this.conn.query(`
      SELECT * FROM column_security
      WHERE dataset_id = $1 AND is_enabled = true
        AND (
          (scope = 'user' AND scope_id = $2)
          OR (scope = 'group' AND scope_id = ANY($3))
        )`, [datasetId, c.userId, c.groupIds ?? []]);
  }

  private async loadUserAttrs(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.conn.query(`
      SELECT a.name, COALESCE(uav.value, a.default_value) AS value
      FROM user_attribute a
      LEFT JOIN user_attribute_value uav ON uav.attribute_id = a.id AND uav.user_id = $1`, [userId]);
    return Object.fromEntries(rows.map((r: any) => [r.name, r.value]));
  }
}
```

### 9.3 PII auto-detect

```ts
// src/modules/security/services/piiScanner.ts
const PII_PATTERNS: { name: string; re: RegExp; piiClass: string }[] = [
  { name: 'email', re: /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, piiClass: 'email' },
  { name: 'phone', re: /^\+?\d[\d \-()]{6,}$/, piiClass: 'phone' },
  { name: 'ssn',   re: /^\d{3}-\d{2}-\d{4}$/, piiClass: 'us_ssn' },
  { name: 'ccn',   re: /^\d{13,19}$/, piiClass: 'credit_card' },
];

export async function scanColumns(datasetId: string, pool: DatasourcePool, columns: ColumnMeta[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.type !== 'text') continue;
    const { rows } = await pool.query(`SELECT "${c.name}" FROM (${'<dataset.sql>'}) base WHERE "${c.name}" IS NOT NULL LIMIT 100`);
    const sample = rows.map(r => r[c.name]);
    for (const p of PII_PATTERNS) {
      const matches = sample.filter(v => typeof v === 'string' && p.re.test(v)).length;
      if (matches / Math.max(sample.length, 1) > 0.6) {
        out[c.name] = p.piiClass;
        break;
      }
    }
  }
  return out;
}
```

---

## 10 · SSO / MFA / SCIM / API tokens / Sessions

### 10.1 Schema delta

```sql
CREATE TABLE sso_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL UNIQUE REFERENCES organisation(id) ON DELETE CASCADE,
  protocol          varchar(16) NOT NULL,
  status            varchar(16) NOT NULL DEFAULT 'disabled',
  saml_entry_point  text,
  saml_issuer       text,
  saml_cert         text,
  saml_attribute_mapping jsonb,
  oidc_issuer       text,
  oidc_client_id    text,
  oidc_client_secret_enc bytea,
  oidc_scopes       text[] DEFAULT ARRAY['openid','email','profile'],
  jit_provisioning  boolean NOT NULL DEFAULT true,
  default_role_id   uuid,
  group_mapping     jsonb,
  created_on        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_mfa (
  user_id           uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  method            varchar(16) NOT NULL,
  totp_secret_enc   bytea,
  webauthn_credentials jsonb,
  recovery_codes_enc bytea,
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz
);

CREATE TABLE api_token (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  owner_user_id   uuid,
  service_account_id uuid,
  name            varchar(100) NOT NULL,
  token_hash      varchar(255) NOT NULL UNIQUE,
  scopes          text[] NOT NULL,
  prefix          varchar(8) NOT NULL,
  last_4          varchar(4) NOT NULL,
  allowed_ips     inet[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  last_used_at    timestamptz,
  status          smallint NOT NULL DEFAULT 1
);

CREATE TABLE user_session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES "user"(id),
  organisation_id uuid NOT NULL,
  refresh_token_hash varchar(255) NOT NULL UNIQUE,
  user_agent      varchar(512),
  ip              inet,
  geo             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  revoked_reason  varchar(64),
  suspicious      boolean NOT NULL DEFAULT false
);
```

### 10.2 SAML ACS

```ts
// src/modules/auth/controllers/samlAcs.ts
import { SAML } from '@node-saml/node-saml';
import { decrypt } from '../../../shared/utility/encryptDecrypt';

export default async function samlAcs(req: Request, res: Response) {
  const orgId = req.query.orgId as string;
  const cfg = await SsoConfig.findOne({ where: { organisationId: orgId, protocol: 'saml', status: 'enabled' } });
  if (!cfg) return res.status(404).end();

  const saml = new SAML({
    callbackUrl: `${BACKEND_URL}/api/v1/auth/sso/saml/acs?orgId=${orgId}`,
    entryPoint: cfg.samlEntryPoint,
    issuer: cfg.samlIssuer,
    cert: cfg.samlCert,
    audience: cfg.samlIssuer,
  });

  let profile;
  try { ({ profile } = await saml.validatePostResponseAsync(req.body)); }
  catch (e) { return res.status(401).send('SAML validation failed: ' + (e as Error).message); }

  const map = cfg.samlAttributeMapping || {};
  const email = profile[map.email || 'email'] as string;
  let user = await User.findOne({ where: { organisationId: orgId, email } });
  if (!user && cfg.jitProvisioning) {
    user = await provisionUserFromSaml(profile, cfg);
  }
  if (!user) return res.status(403).send('User not found and JIT disabled');

  const tokens = await issueJwt(user);
  await createSession(user, req, tokens);
  res.redirect(`${FE_URL}/auth/sso-callback?token=${tokens.access}&refresh=${tokens.refresh}`);
}
```

### 10.3 OIDC

```ts
// src/modules/auth/controllers/oidc.ts
import { Issuer, generators } from 'openid-client';

export async function oidcStart(req: Request, res: Response) {
  const cfg = await SsoConfig.findOne({ where: { organisationId: req.query.orgId } });
  if (!cfg || cfg.protocol !== 'oidc') return res.status(404).end();
  const issuer = await Issuer.discover(cfg.oidcIssuer!);
  const client = new issuer.Client({
    client_id: cfg.oidcClientId!,
    client_secret: decrypt(cfg.oidcClientSecretEnc!, cfg.organisationId),
    redirect_uris: [`${BACKEND_URL}/api/v1/auth/sso/oidc/callback`],
    response_types: ['code'],
  });
  const state = generators.state();
  const nonce = generators.nonce();
  req.session!.oidc = { state, nonce, orgId: cfg.organisationId };
  res.redirect(client.authorizationUrl({ scope: cfg.oidcScopes!.join(' '), state, nonce }));
}
export async function oidcCallback(req: Request, res: Response) {
  const { state, nonce, orgId } = req.session!.oidc!;
  const cfg = await SsoConfig.findOne({ where: { organisationId: orgId } });
  const issuer = await Issuer.discover(cfg.oidcIssuer!);
  const client = new issuer.Client({
    client_id: cfg.oidcClientId!,
    client_secret: decrypt(cfg.oidcClientSecretEnc!, orgId),
    redirect_uris: [`${BACKEND_URL}/api/v1/auth/sso/oidc/callback`],
    response_types: ['code'],
  });
  const params = client.callbackParams(req);
  const tokens = await client.callback(`${BACKEND_URL}/api/v1/auth/sso/oidc/callback`, params, { state, nonce });
  const userinfo = await client.userinfo(tokens.access_token!);
  // ... JIT provision, JWT, redirect
}
```

### 10.4 TOTP

```ts
// src/modules/auth/controllers/mfa.ts
import * as speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export async function totpEnrolStart(req: Request, res: Response) {
  const user = res.locals.user;
  const secret = speakeasy.generateSecret({ name: `DBExec (${user.email})`, length: 32 });
  await UserMfa.upsert({
    userId: user.id, method: 'totp', totpSecretEnc: encrypt(secret.base32, user.organisationId),
  } as any, ['userId']);
  res.json({ qrDataUrl: await qrcode.toDataURL(secret.otpauth_url!), secret: secret.base32 });
}

export async function totpEnrolConfirm(req: Request, res: Response) {
  const user = res.locals.user;
  const mfa = await UserMfa.findOne({ where: { userId: user.id } });
  if (!mfa) return res.status(400).end();
  const ok = speakeasy.totp.verify({
    secret: decrypt(mfa.totpSecretEnc!, user.organisationId),
    encoding: 'base32', token: req.body.code, window: 1,
  });
  if (!ok) return res.status(400).json({ error: 'invalid code' });
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex'));
  await UserMfa.update(user.id, {
    recoveryCodesEnc: encrypt(JSON.stringify(codes.map(c => bcrypt.hashSync(c, 8))), user.organisationId),
    enrolledAt: new Date(),
  });
  res.json({ recoveryCodes: codes });
}

export async function mfaVerify(req: Request, res: Response) {
  const user = res.locals.user;
  const mfa = await UserMfa.findOne({ where: { userId: user.id } });
  if (!mfa) return res.status(400).end();
  const ok = speakeasy.totp.verify({
    secret: decrypt(mfa.totpSecretEnc!, user.organisationId),
    encoding: 'base32', token: req.body.code, window: 1,
  });
  if (!ok) {
    const hashed = JSON.parse(decrypt(mfa.recoveryCodesEnc!, user.organisationId));
    const idx = hashed.findIndex((h: string) => bcrypt.compareSync(req.body.code, h));
    if (idx === -1) return res.status(400).end();
    hashed.splice(idx, 1);
    await UserMfa.update(user.id, { recoveryCodesEnc: encrypt(JSON.stringify(hashed), user.organisationId) });
  }
  await UserMfa.update(user.id, { lastUsedAt: new Date() });
  res.json({ ok: true, stepUpExpiry: Date.now() + 10 * 60_000 });
}
```

### 10.5 Refresh-token rotation with reuse-detection

```ts
// src/modules/auth/controllers/refreshToken.ts
export default async function refreshToken(req: Request, res: Response) {
  const oldRt = req.body.refreshToken as string;
  if (!oldRt) return res.status(401).end();
  const oldHash = sha256(oldRt);
  const stored = await UserSession.findOne({ where: { refreshTokenHash: oldHash } });
  if (!stored) return res.status(401).end();
  if (stored.revokedAt) {
    // REUSE detected — kill ALL sessions for this user
    await UserSession.update({ userId: stored.userId, revokedAt: IsNull() }, {
      revokedAt: new Date(), revokedReason: 'reuse-detected',
    });
    return res.status(401).json({ error: 'Token reuse detected; all sessions revoked.' });
  }
  const newRt = base64url(crypto.randomBytes(48));
  await UserSession.update(stored.id, { revokedAt: new Date(), revokedReason: 'rotation' });
  await UserSession.insert({
    userId: stored.userId, organisationId: stored.organisationId,
    refreshTokenHash: sha256(newRt),
    userAgent: req.headers['user-agent'], ip: req.ip,
  });
  const access = signJwt({ sub: stored.userId, org: stored.organisationId });
  res.json({ access, refresh: newRt });
}
```

### 10.6 API token middleware

```ts
// src/shared/middleware/apiToken.middleware.ts
export async function apiToken(req: Request, res: Response, next: NextFunction) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/, '')
           || (req.headers['x-api-token'] as string);
  if (!raw || !raw.startsWith('dbe_')) return next();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const row = await ApiToken.findOne({ where: { tokenHash: hash, status: 1 } });
  if (!row) return res.status(401).json({ error: 'invalid token' });
  if (row.expiresAt && row.expiresAt < new Date()) return res.status(401).end();
  if (row.allowedIps?.length && !row.allowedIps.includes(req.ip)) return res.status(403).end();
  ApiToken.update(row.id, { lastUsedAt: new Date() }).catch(() => {});
  res.locals.apiAuth = row;
  res.locals.scopes = row.scopes;
  res.locals.orgData = { id: row.organisationId };
  next();
}
```

### 10.7 SCIM endpoints

```ts
// src/modules/scim/scim.routes.ts (mounted at /scim/v2)
router.use(scimAuth);
router.get('/Users', listScimUsers);
router.post('/Users', createScimUser);
router.patch('/Users/:id', patchScimUser);
router.delete('/Users/:id', deleteScimUser);
router.get('/Groups', listScimGroups);
router.post('/Groups', createScimGroup);
router.patch('/Groups/:id', patchScimGroup);
router.get('/Schemas', schemas);
router.get('/ResourceTypes', resourceTypes);
router.get('/ServiceProviderConfig', serviceProviderConfig);
```

```ts
// scimAuth middleware: validate `Authorization: Bearer <scim_token>` against scim_token table.
export async function scimAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!t) return res.status(401).end();
  const row = await ScimToken.findOne({ where: { tokenHash: sha256(t), status: 1 } });
  if (!row) return res.status(401).end();
  res.locals.scim = { organisationId: row.organisationId };
  next();
}
```

Sample `createScimUser`:

```ts
export async function createScimUser(req, res) {
  const orgId = res.locals.scim.organisationId;
  const b = req.body;
  const u = new User();
  u.organisationId = orgId;
  u.username = b.userName;
  u.email = b.emails?.[0]?.value;
  u.firstName = b.name?.givenName;
  u.lastName = b.name?.familyName;
  u.status = b.active ? 1 : 0;
  await User.save(u);
  // welcome email + setup token similar to existing addUser path.
  res.status(201).json(scimUserOf(u));
}
function scimUserOf(u: User) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    userName: u.username,
    name: { givenName: u.firstName, familyName: u.lastName },
    emails: [{ value: u.email, primary: true }],
    active: u.status === 1,
    meta: { resourceType: 'User', created: u.createdOn, lastModified: u.updatedOn },
  };
}
```

---

## 12 · Import / Upload

### 12.1 multipart route

```ts
// src/modules/datasets/datasets.routes.ts
import multer from 'multer';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB cap per plan
});
router.post('/upload/csv',  AuthMiddleware, VerifyResource, VerifyDatabase,
  VerifyPermission('datasetManager'), idempotency(),
  upload.single('file'), uploadDatasetCsv);
router.post('/upload/xlsx', /* ... */, upload.single('file'), uploadDatasetXlsx);
router.post('/upload/json', /* ... */, upload.single('file'), uploadDatasetJson);
router.post('/upload/url',  /* ... */, uploadDatasetUrl);
```

### 12.2 CSV upload (full)

```ts
// src/modules/datasets/controllers/uploadDatasetCsv.ts
import Papa from 'papaparse';
import { Request, Response } from 'express';
import { ManagedDatasourceService } from '../services/managedDatasource.service';
import { Dataset } from '../../../shared/db/shared_entity/dataset.entity';
import { DatasetField } from '../../../shared/db/shared_entity/datasetField.entity';
import { auditLogger } from '../../../shared/services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../../shared/constants/audit.constants';
import sendResponse from '../../../shared/utility/response';
import { CODE } from '../../../../config/config';
import * as crypto from 'node:crypto';
import { OrgStorageQuota } from '../../../shared/db/shared_entity/orgStorageQuota.entity';

export default async function uploadDatasetCsv(req: Request, res: Response) {
  const file = req.file;
  if (!file) return sendResponse(res, false, CODE.BAD_REQUEST, 'no file');
  const { master_db_connection, orgData, loggedInId } = res.locals;

  // Quota check
  const quota = await master_db_connection.getRepository(OrgStorageQuota).findOne({ where: { organisationId: orgData.id } });
  if (quota && quota.usedBytes + file.size > quota.maxBytes)
    return sendResponse(res, false, 413, 'Upload quota exceeded for this organisation');

  // Idempotent re-upload via hash
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = await master_db_connection.getRepository(Dataset).findOne({
    where: { organisationId: orgData.id, kind: 'upload' },
    // metadata.sha256 — handled by query builder
  });
  if (existing && (existing.uploadSourceMeta as any)?.sha256 === hash) {
    return sendResponse(res, true, CODE.SUCCESS, 'identical file already uploaded', existing);
  }

  // Parse
  const rows: Record<string, string>[] = [];
  const parseResult = Papa.parse<Record<string, string>>(file.buffer.toString('utf8'), {
    header: true, skipEmptyLines: true,
  });
  if (parseResult.errors.length) {
    return sendResponse(res, false, CODE.BAD_REQUEST,
      `CSV parse error on row ${parseResult.errors[0].row}: ${parseResult.errors[0].message}`);
  }
  rows.push(...(parseResult.data as any));
  if (rows.length === 0) return sendResponse(res, false, CODE.BAD_REQUEST, 'empty file');
  if (rows.length > 1_000_000) return sendResponse(res, false, 413, 'over 1M rows');

  // Infer columns
  const columns = inferColumns(rows);

  // Provision managed datasource
  const managed = await ManagedDatasourceService.ensureFor(orgData.id);
  const tableName = `up_${shortOrgId(orgData.id)}_${Date.now()}`;
  const ddl = columns.map(c => `${q(c.name)} ${pgType(c.type)}`).join(', ');
  await managed.pool.query(`CREATE TABLE ${q(tableName)} (${ddl})`);

  // Bulk insert
  await batchInsertCopy(managed.pool, tableName, columns, rows);

  // Persist
  const ds = new Dataset();
  ds.organisationId = orgData.id;
  ds.datasourceId = managed.datasourceId;
  ds.name = req.body.name || sanitiseName(file.originalname);
  ds.description = req.body.description || '';
  ds.kind = 'upload';
  ds.targetSchema = 'public';
  ds.targetTable = tableName;
  ds.sql = `SELECT * FROM ${q(tableName)}`;
  ds.uploadSourceMeta = {
    originalName: file.originalname,
    sizeBytes: file.size,
    sha256: hash,
    format: 'csv',
    rowCount: rows.length,
    parsedAt: new Date().toISOString(),
  } as any;
  ds.rowCountHint = rows.length;
  ds.lastRefreshAt = new Date();
  ds.lastRefreshStatus = 'ok';
  await master_db_connection.getRepository(Dataset).save(ds);

  for (const c of columns) {
    const f = new DatasetField();
    f.datasetId = ds.id;
    f.name = c.name;
    f.dataType = c.type;
    await master_db_connection.getRepository(DatasetField).save(f);
  }

  // Quota update
  if (quota) await OrgStorageQuota.update(quota.id, { usedBytes: quota.usedBytes + file.size });

  // Audit
  await auditLogger.logAuditToOrg({
    connection: master_db_connection, req, res,
    module: AUDIT_MODULES.DATASET, action: AUDIT_ACTIONS.CREATE,
    entityName: 'Dataset (upload)', entityId: ds.id,
    metadata: { rowCount: rows.length, format: 'csv', sha256: hash },
  });

  // Webhook
  await eventBus.emit({
    type: 'dataset.uploaded', organisationId: orgData.id,
    payload: { datasetId: ds.id, rowCount: rows.length, format: 'csv' },
    actor: { type: 'user', id: loggedInId },
  });

  return sendResponse(res, true, CODE.SUCCESS, 'dataset created', ds);
}

function inferColumns(rows: any[]) {
  const sample = rows.slice(0, Math.min(rows.length, 100));
  const out: { name: string; type: 'bool'|'numeric'|'timestamp'|'text' }[] = [];
  for (const name of Object.keys(sample[0])) {
    const t = sample.map(r => detect(r[name]));
    out.push({ name, type: dominant(t) });
  }
  return out;
}
function detect(v: any): 'bool'|'numeric'|'timestamp'|'text' {
  if (v == null || v === '') return 'text';
  const s = String(v);
  if (/^(true|false)$/i.test(s)) return 'bool';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'numeric';
  if (!isNaN(Date.parse(s))) return 'timestamp';
  return 'text';
}
function dominant(arr: string[]): any {
  const cnt: Record<string, number> = {};
  for (const t of arr) cnt[t] = (cnt[t] || 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
}
const pgType = (t: string) =>
  ({ bool: 'boolean', numeric: 'numeric', timestamp: 'timestamptz', text: 'text' } as any)[t] || 'text';
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const shortOrgId = (uuid: string) => uuid.replace(/-/g, '').slice(0, 8);
const sanitiseName = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, 100);
```

### 12.3 COPY-based bulk insert

```ts
// src/modules/datasets/services/batchInsert.ts
import { from as copyFrom } from 'pg-copy-streams';

export async function batchInsertCopy(pool: any, table: string, columns: { name: string; type: string }[], rows: any[]) {
  const client = await pool.connect();
  try {
    const colList = columns.map(c => q(c.name)).join(', ');
    const stream = client.query(copyFrom(`COPY ${q(table)} (${colList}) FROM STDIN WITH (FORMAT csv)`));
    let buf = '';
    let i = 0;
    for (const r of rows) {
      buf += columns.map(c => csvCell(r[c.name])).join(',') + '\n';
      i++;
      if (i % 50_000 === 0) { stream.write(buf); buf = ''; }
    }
    if (buf) stream.write(buf);
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  } finally {
    client.release();
  }
}
function csvCell(v: any): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
```

### 12.4 Resumable upload (tus)

```ts
import { Server, FileStore } from '@tus/server';
const tus = new Server({
  path: '/api/v1/upload/tus',
  datastore: new FileStore({ directory: '.tus' }),
  onUploadFinish: async (req, res, upload) => {
    // Move from FS to processing queue
    await scheduleQueue.add('upload:process', { uploadId: upload.id, orgId: getOrgIdFromAuth(req) });
    return res;
  },
});
app.all('/api/v1/upload/tus*', tus.handle.bind(tus));
```

---

## 13 · Export / Download

### 13.1 CSV streaming

```ts
// src/modules/exports/controllers/exportDatasetCsv.ts
export default async function exportDatasetCsv(req: Request, res: Response) {
  const ds = await loadDataset(req.params.id, res.locals.orgData.id);
  const cfg = await DatasourceConfigS.findOne({ where: { id: ds.datasourceId } });
  const pool = await acquire(cfg as any);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${ds.name}.csv"`);

  let wroteHeader = false;
  for await (const batch of pool.cursor(ds.sql)) {
    if (!wroteHeader) {
      res.write(batch.columns.map(c => csvCell(c.name)).join(',') + '\n');
      wroteHeader = true;
    }
    for (const row of batch.rows) {
      res.write(batch.columns.map(c => csvCell(row[c.name])).join(',') + '\n');
    }
  }
  res.end();

  await auditLogger.logAuditToOrg({
    connection: res.locals.master_db_connection, req, res,
    module: AUDIT_MODULES.DATASET, action: AUDIT_ACTIONS.EXPORT,
    entityName: 'Dataset', entityId: ds.id,
    metadata: { format: 'csv' },
  });
}
```

### 13.2 XLSX streaming with multi-sheet

```ts
// src/modules/exports/controllers/exportDashboardXlsx.ts
import ExcelJS from 'exceljs';

export default async function exportDashboardXlsx(req: Request, res: Response) {
  const data = await renderDashboardLive(req.params.id, res.locals);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="dashboard.xlsx"`);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  for (const v of data.visuals) {
    const ws = wb.addWorksheet(sanitiseSheet(v.title));
    ws.columns = v.columns.map(c => ({ header: c.name, key: c.name }));
    ws.getRow(1).font = { bold: true };
    for (const row of v.rows) ws.addRow(row);
    ws.commit();
  }
  await wb.commit();
}
function sanitiseSheet(s: string) {
  return s.replace(/[\\\/\*\?\:\[\]]/g, '_').slice(0, 31);
}
```

### 13.3 PDF with watermark + password

```ts
import { PDFDocument } from 'pdf-lib';

export async function pdfWithPassword(buf: Buffer, password: string): Promise<Buffer> {
  const doc = await PDFDocument.load(buf);
  // pdf-lib doesn't directly encrypt — use HummusJS or qpdf shell-out.
  // Here we shell out to qpdf:
  const fs = await import('node:fs/promises');
  const path = `.tmp/${Date.now()}.pdf`;
  await fs.writeFile(path, buf);
  const out = `${path}.enc.pdf`;
  await new Promise((resolve, reject) => {
    const child = require('child_process').spawn('qpdf', [
      '--encrypt', password, password, '256', '--', path, out,
    ]);
    child.on('exit', (c: number) => c === 0 ? resolve(null) : reject(new Error('qpdf failed')));
  });
  const result = await fs.readFile(out);
  await fs.unlink(path); await fs.unlink(out);
  return result;
}
```

---

## 14 · Sharing & Embedding

### 14.1 Schema

```sql
CREATE TABLE share_link (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  target_type     varchar(16) NOT NULL,
  target_id       uuid NOT NULL,
  short_code      varchar(16) NOT NULL UNIQUE,
  mode            varchar(16) NOT NULL,           -- public|password|embed
  password_hash   varchar(255),
  expires_at      timestamptz,
  view_count      bigint NOT NULL DEFAULT 0,
  allowed_domains text[],
  visible_visuals uuid[],
  theme_override  jsonb,
  max_views_per_hour int,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          smallint NOT NULL DEFAULT 1
);
CREATE TABLE share_link_view_event (
  id        bigserial PRIMARY KEY,
  link_id   uuid NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  ip        inet, user_agent varchar(512), country varchar(64), duration_ms int,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON share_link_view_event (link_id, viewed_at DESC);
```

### 14.2 Embed sign + guard

```ts
// src/modules/embed/controllers/signEmbed.ts
import * as jwt from 'jsonwebtoken';
export default async function signEmbed(req: Request, res: Response) {
  // Requires API token with scope 'embed:sign'
  if (!res.locals.scopes?.includes('embed:sign'))
    return sendResponse(res, false, 403, 'insufficient scope');
  const { targetType, targetId, externalUserId, permissions, attrs, ttlSecs } = req.body;
  const token = jwt.sign({
    sub: externalUserId,
    org: res.locals.orgData.id,
    target: { type: targetType, id: targetId },
    perms: permissions,
    attrs: attrs || {},
  }, process.env.EMBED_SIGNING_SECRET!, { algorithm: 'HS256', expiresIn: ttlSecs || 3600 });
  return sendResponse(res, true, CODE.SUCCESS, 'ok', { token, expiresIn: ttlSecs || 3600 });
}
```

```ts
// src/modules/embed/middleware/embedGuard.ts
export default function embedGuard(req: Request, res: Response, next: NextFunction) {
  const token = (req.query.token as string) || (req.headers['x-embed-token'] as string);
  if (!token) return sendResponse(res, false, 401, 'embed token required');
  let payload: any;
  try { payload = jwt.verify(token, process.env.EMBED_SIGNING_SECRET!); }
  catch (e) { return sendResponse(res, false, 401, 'invalid embed token'); }
  if (payload.target.type !== req.params.type || payload.target.id !== req.params.id)
    return sendResponse(res, false, 403, 'token-target mismatch');
  res.locals.embedCtx = {
    organisationId: payload.org,
    externalUserId: payload.sub,
    permissions: payload.perms as string[],
    userAttributes: payload.attrs as Record<string, unknown>,
  };
  res.locals.orgData = { id: payload.org };
  next();
}
```

```ts
// CSP per share-link
app.use('/embed', (req, res, next) => {
  const allowed = res.locals.embedCtx?.allowedDomains?.join(' ') ?? "'none'";
  res.setHeader('Content-Security-Policy', `frame-ancestors ${allowed}`);
  next();
});
```

---

## 15 · Scheduling / Subscriptions / Alerts

### 15.1 Schema

```sql
CREATE TABLE subscription (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  target_type     varchar(16) NOT NULL,
  target_id       uuid NOT NULL,
  channel         varchar(16) NOT NULL,
  recipients      jsonb NOT NULL,
  cron            varchar(64) NOT NULL,
  timezone        varchar(64) NOT NULL DEFAULT 'UTC',
  format          varchar(16) NOT NULL,
  filter_state    jsonb,
  include_message text,
  snoozed_until   timestamptz,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  last_status     varchar(16),
  status          smallint NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  dataset_id      uuid NOT NULL,
  expression      text NOT NULL,
  cron            varchar(64) NOT NULL,
  timezone        varchar(64) NOT NULL DEFAULT 'UTC',
  channel         varchar(16) NOT NULL,
  recipients      jsonb NOT NULL,
  cooldown_mins   int NOT NULL DEFAULT 60,
  consecutive_breaches_required int NOT NULL DEFAULT 1,
  acknowledged_until timestamptz,
  snoozed_until   timestamptz,
  severity        varchar(16) NOT NULL DEFAULT 'warning',
  trigger_on_refresh boolean NOT NULL DEFAULT false,
  last_triggered_at timestamptz,
  status          smallint NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     varchar(16) NOT NULL,
  source_id       uuid NOT NULL,
  status          varchar(16) NOT NULL,
  channel         varchar(16) NOT NULL,
  recipients_count int NOT NULL,
  size_bytes      bigint,
  duration_ms     int,
  error           text,
  attempt_no      int NOT NULL DEFAULT 1,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
```

### 15.2 Email service

```ts
// src/shared/services/email/index.ts
import nodemailer from 'nodemailer';
import { Templates } from './templates';

export interface SendOpts {
  to: string[]; subject: string; html: string; text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  headers?: Record<string, string>;
}

class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  private templates = new Templates();

  async send(opts: SendOpts) {
    return this.transporter.sendMail({ from: process.env.SMTP_FROM!, ...opts });
  }
  async sendTemplated(opts: { to: string[]; template: string; data: any; attachments?: any[] }) {
    const { subject, html, text } = await this.templates.render(opts.template, opts.data);
    return this.send({ to: opts.to, subject, html, text, attachments: opts.attachments });
  }
}
export const emailService = new EmailService();
```

### 15.3 Subscription runner

```ts
// src/modules/subscriptions/jobs/runSubscription.ts
import { renderDashboardPdf, renderDashboardPng, renderDashboardXlsx } from '../../dashboards/services/dashboardExport.service';
import { signServiceToken } from '../../../shared/services/serviceToken';

export default async function runSubscription(id: string) {
  const sub = await Subscription.findOne({ where: { id, status: 1 } });
  if (!sub) return;
  if (sub.snoozedUntil && sub.snoozedUntil > new Date()) return;

  const t0 = Date.now();
  let status: 'ok'|'failed' = 'ok'; let err: string | null = null;
  let bytes = 0;
  try {
    const token = await signServiceToken(sub.organisationId);
    let attachment;
    switch (sub.format) {
      case 'pdf':
        attachment = { filename: 'dashboard.pdf', content: await renderDashboardPdf(sub.targetId, { serviceToken: token, filters: sub.filterState as any }) };
        break;
      case 'png':
        attachment = { filename: 'dashboard.png', content: await renderDashboardPng(sub.targetId, { serviceToken: token }) };
        break;
      case 'xlsx':
        attachment = { filename: 'dashboard.xlsx', content: await renderDashboardXlsx(sub.targetId, token) };
        break;
    }
    bytes = attachment!.content.length;

    if (sub.channel === 'email') {
      await emailService.sendTemplated({
        to: sub.recipients as string[],
        template: 'subscription',
        data: { message: sub.includeMessage, dashboardName: (await Dashboard.findOne({ where: { id: sub.targetId } }))?.name },
        attachments: [attachment],
      });
    } else if (sub.channel === 'slack') {
      await slackUpload(sub.recipients as string[], attachment!, sub.includeMessage);
    } else if (sub.channel === 'webhook') {
      await webhookPost(sub.recipients as string[], attachment!, sub);
    }
  } catch (e) {
    status = 'failed'; err = (e as Error).message;
  }
  await Subscription.update(sub.id, { lastRunAt: new Date(), lastStatus: status, nextRunAt: nextCron(sub.cron, sub.timezone) });
  await DeliveryLog.insert({
    sourceType: 'subscription', sourceId: sub.id, status,
    channel: sub.channel, recipientsCount: (sub.recipients as string[]).length,
    sizeBytes: bytes, durationMs: Date.now() - t0, error: err,
  });
}
```

### 15.4 Alert checker

```ts
// src/modules/alerts/jobs/checkAlert.ts
import { Parser } from 'expr-eval';

const parser = new Parser({ operators: { assignment: false } });

export default async function checkAlert(id: string) {
  const a = await Alert.findOne({ where: { id, status: 1 } });
  if (!a) return;
  if (a.snoozedUntil && a.snoozedUntil > new Date()) return;
  if (a.acknowledgedUntil && a.acknowledgedUntil > new Date()) return;
  if (a.lastTriggeredAt && Date.now() - +a.lastTriggeredAt < a.cooldownMins * 60_000) return;

  const dataset = await Dataset.findOne({ where: { id: a.datasetId } });
  const cfg = await DatasourceConfigS.findOne({ where: { id: dataset.datasourceId } });
  const pool = await acquire(cfg as any);
  const sec = await new SecurityCompiler().apply(dataset.sql, dataset, serviceAccountCtx(a.organisationId));
  const { rows } = await pool.query(sec.sql, sec.bindings);
  const ctx = rows[0] || {};
  const expr = parser.parse(a.expression);
  const fired = !!expr.evaluate(ctx);
  if (!fired) return;

  // Consecutive breach check
  const breachKey = `alert:${a.id}:breach`;
  const breaches = await redis.incr(breachKey);
  if (breaches === 1) await redis.expire(breachKey, 24 * 3600);
  if (breaches < a.consecutiveBreachesRequired) return;

  await redis.del(breachKey);
  await deliverAlert(a, ctx);
  await Alert.update(id, { lastTriggeredAt: new Date() });
}
```

### 15.5 Webhook delivery with HMAC

```ts
// src/modules/webhooks/jobs/deliver.ts
import crypto from 'node:crypto';
import { decrypt } from '../../../shared/utility/encryptDecrypt';

const delays = [1, 5, 25, 125, 625];

export default async function deliver({ subscriptionId, event }: any) {
  const sub = await WebhookSubscription.findOne({ where: { id: subscriptionId, status: 1 } });
  if (!sub) return;
  const secret = decrypt(sub.secretEnc, sub.organisationId);
  const body = JSON.stringify({ event });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const ts = Date.now();
  const signature = `t=${ts},v1=${sig}`;
  let attempt = 0;
  while (attempt < 5) {
    attempt++;
    try {
      const res = await fetch(sub.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DBExec-Signature': signature,
          'X-DBExec-Event': event.type,
        },
        body,
      });
      await DeliveryLog.insert({
        sourceType: 'webhook', sourceId: sub.id, status: res.ok ? 'ok' : 'failed',
        channel: 'webhook', recipientsCount: 1, attemptNo: attempt,
      });
      if (res.ok) return;
    } catch (e) {
      await DeliveryLog.insert({
        sourceType: 'webhook', sourceId: sub.id, status: 'failed',
        channel: 'webhook', recipientsCount: 1, attemptNo: attempt,
        error: (e as Error).message,
      });
    }
    await new Promise(r => setTimeout(r, delays[attempt - 1] * 1000));
  }
  // After 5 failures → DLQ
  await scheduleQueue.add('webhook:dlq', { subscriptionId: sub.id, event });
}
```

---

## 16 · Notifications (Web Push + bundling + DND)

### 16.1 Web Push

```ts
// src/shared/services/webpush.singleton.ts
import webpush from 'web-push';
webpush.setVapidDetails(
  'mailto:dev@dbexec.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);
export { webpush };
```

```ts
@Entity('push_subscription')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('text') endpoint!: string;
  @Column('jsonb') keys!: { p256dh: string; auth: string };
  @CreateDateColumn() createdAt!: Date;
}
```

```ts
// src/modules/notifications/services/notify.service.ts
export async function notify(opts: {
  userId: string; category: string; payload: any; bundleKey?: string; url?: string;
}) {
  const prefs = await NotificationPreference.findOne({
    where: { userId: opts.userId, category: opts.category },
  });
  const inApp = prefs?.inApp ?? true;
  const email = prefs?.email ?? false;
  const push  = prefs?.push  ?? false;

  // DND check
  const dnd = await UserDnd.findOne({ where: { userId: opts.userId, enabled: true } });
  if (dnd && inDndWindow(dnd)) {
    // Queue for later — leave inApp delivery happen; queue email + push.
  }

  if (inApp) {
    if (opts.bundleKey) {
      // Try to merge with an existing unread notification of same bundle key in last 5 min.
      const recent = await Notification.findOne({
        where: { userId: opts.userId, bundleKey: opts.bundleKey, readAt: IsNull() },
        order: { createdOn: 'DESC' },
      });
      if (recent && Date.now() - +recent.createdOn < 5 * 60_000) {
        await Notification.update(recent.id, {
          payload: mergePayload(recent.payload, opts.payload),
          updatedOn: new Date(),
        });
        return;
      }
    }
    await Notification.insert({ userId: opts.userId, category: opts.category, payload: opts.payload, url: opts.url, bundleKey: opts.bundleKey });
    sse.publish(opts.userId, { kind: 'notification', ...opts });
  }
  if (email) emailService.sendTemplated({ to: [(await User.findOne({ where: { id: opts.userId } }))!.email], template: opts.category, data: opts.payload }).catch(() => {});
  if (push) {
    const subs = await PushSubscription.find({ where: { userId: opts.userId } });
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(opts.payload)); }
      catch (e) { if ((e as any).statusCode === 410) await PushSubscription.delete(s.id); }
    }
  }
}
```

---

## 17 · Search, Tags, Collections, Favourites

### 17.1 pg_trgm + pgvector

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE dashboard
  ADD COLUMN search_doc tsvector,
  ADD COLUMN embedding vector(1536);
CREATE INDEX dashboard_search_gin ON dashboard USING GIN(search_doc);
CREATE INDEX dashboard_name_trgm ON dashboard USING GIN(name gin_trgm_ops);
CREATE INDEX dashboard_embed_ivf ON dashboard USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);

CREATE OR REPLACE FUNCTION dashboard_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_doc := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A')
                 || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dashboard_search_update BEFORE INSERT OR UPDATE ON dashboard
  FOR EACH ROW EXECUTE FUNCTION dashboard_search_trigger();
```

### 17.2 Search controller

```ts
// src/modules/search/controllers/search.ts
export default async function search(req: Request, res: Response) {
  const { orgData } = res.locals;
  const q = (req.query.q as string)?.trim() ?? '';
  const types = (req.query.types as string)?.split(',') ?? ['dashboards','analyses','datasets','users'];
  if (!q) return sendResponse(res, true, CODE.SUCCESS, 'ok', { results: [] });

  const tsq = q.split(/\s+/).map(w => `${w}:*`).join(' & ');
  const out: Record<string, any[]> = {};

  if (types.includes('dashboards')) {
    out.dashboards = await master_db_connection.query(`
      SELECT id, name, description,
             ts_rank(search_doc, to_tsquery('english', $1)) AS rank,
             similarity(name, $2) AS sim
      FROM dashboard
      WHERE organisation_id = $3
        AND (search_doc @@ to_tsquery('english', $1) OR name % $2)
      ORDER BY (ts_rank(search_doc, to_tsquery('english', $1)) + similarity(name, $2)) DESC
      LIMIT 10`,
      [tsq, q, orgData.id]);
  }
  // ... same for analyses, datasets, users
  return sendResponse(res, true, CODE.SUCCESS, 'ok', out);
}
```

---

## 19 · Audit & Observability

### 19.1 Hash chain

```sql
ALTER TABLE audit_log
  ADD COLUMN prev_hash varchar(64),
  ADD COLUMN row_hash varchar(64),
  ADD COLUMN correlation_id varchar(64);
```

```ts
// src/shared/services/auditLogger.service.ts (extend)
async function chained(payload: any) {
  const prev = await master_db_connection.query(
    'SELECT row_hash FROM audit_log WHERE organisation_id = $1 ORDER BY occurred_at DESC LIMIT 1',
    [payload.organisationId]);
  const prevHash = prev[0]?.row_hash ?? '';
  const rowHash = crypto.createHash('sha256')
    .update(prevHash + JSON.stringify(payload)).digest('hex');
  return { prevHash, rowHash };
}
```

### 19.2 OpenTelemetry

```ts
// src/shared/services/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function startTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'dbexec-api',
    }),
    traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [],
  });
  sdk.start();
}
```

Wrap every controller with `tracer.startActiveSpan`. Use middleware:

```ts
app.use((req, res, next) => {
  const cid = req.headers['x-correlation-id'] as string ?? crypto.randomUUID();
  res.setHeader('x-correlation-id', cid);
  res.locals.correlationId = cid;
  next();
});
```

### 19.3 Health endpoints

```ts
router.get('/healthz/live', (_, res) => res.json({ ok: true }));
router.get('/healthz/ready', async (_, res) => {
  const checks = await Promise.allSettled([
    master_db.query('SELECT 1'),
    redis.ping(),
    emailService.verify(),
  ]);
  const ok = checks.every(c => c.status === 'fulfilled');
  res.status(ok ? 200 : 503).json({
    ok,
    checks: ['db', 'redis', 'email'].map((n, i) => ({
      name: n, status: checks[i].status,
      reason: checks[i].status === 'rejected' ? String((checks[i] as any).reason) : null,
    })),
  });
});
```

---

## 22 · Public API

### 22.1 Generate OpenAPI from Zod

```ts
// src/openapi/build.ts
import { OpenApiGeneratorV3, OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// register every Zod schema with .openapi() metadata
import { datasourceSchema, datasourceUpdateSchema } from '../shared/validators/datasources';
registry.register('Datasource', datasourceSchema.openapi({ title: 'Datasource' }));

registry.registerPath({
  method: 'post', path: '/api/public/v1/datasources',
  summary: 'Create a datasource',
  tags: ['Datasources'],
  request: {
    headers: z.object({
      authorization: z.string().openapi({ description: 'Bearer dbe_...' }),
      'idempotency-key': z.string().optional(),
    }),
    body: { content: { 'application/json': { schema: datasourceSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: datasourceSchema } } },
    400: { description: 'Validation failed' },
    409: { description: 'Idempotency conflict' },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);
const spec = generator.generateDocument({
  openapi: '3.0.0', info: { title: 'DBExec Public API', version: '1.0.0' },
  servers: [{ url: 'https://app.dbexec.com' }],
});
fs.writeFileSync('public-openapi.json', JSON.stringify(spec, null, 2));
```

### 22.2 ReDoc page

```ts
app.get('/docs', (_, res) => {
  res.send(`
    <!doctype html><html><head><title>DBExec API</title>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
    </head><body><redoc spec-url="/openapi.json"></redoc></body></html>`);
});
app.get('/openapi.json', (_, res) => res.sendFile(path.resolve('public-openapi.json')));
```

### 22.3 Public router

```ts
// src/modules/public/public.router.ts
const router = Router();
router.use(apiToken);                          // bearer dbe_…
router.use(idempotency({ ttlHours: 24 }));     // Idempotency-Key
router.use(rateLimit({ windowSecs: 60, limit: 100 }));

// Mount sanitised public-facing controllers
router.post('/datasources', /* zodValidate, controller */);
router.get('/datasources/list', /* ... */);
router.post('/datasets/preview', /* ... */);
router.post('/semantic/query', /* ... */);
router.post('/exports/dataset/:id/csv', /* ... */);
router.post('/embed/sign', /* requires embed:sign scope */);
// ...

export default router;
```

Mount in `server.ts`:

```ts
app.use('/api/public/v1', publicRouter);
```

---

## 24 · Admin — Backup & Restore

### 24.1 Backup generator

```ts
// src/modules/admin/jobs/backup.ts
export default async function backupOrg(orgId: string) {
  const conn = await openOrgConnection(orgId);
  const out: Record<string, any[]> = {};
  for (const t of ['user','role','group','datasource','dataset','analyses','dashboard','rls_rule','semantic_model','sem_dimension','sem_metric','subscription','alert']) {
    out[t] = await conn.query(`SELECT * FROM "${t}"`);
  }
  const json = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), org: orgId, tables: out });
  const buf = await pipe(gzip(Buffer.from(json)));
  // Optional KMS encryption
  const enc = await kmsEncrypt(buf);
  const key = `backup/${orgId}/${Date.now()}.json.gz`;
  await s3.upload({ Bucket: process.env.BACKUP_BUCKET, Key: key, Body: enc }).promise();
  const checksum = crypto.createHash('sha256').update(buf).digest('hex');
  await BackupArtifact.insert({
    organisationId: orgId, kind: 'full', locationUri: `s3://${process.env.BACKUP_BUCKET}/${key}`,
    sizeBytes: enc.length, checksumSha256: checksum,
    encryptedBy: 'kms', createdAt: new Date(),
  });
}
```

### 24.2 Restore

```ts
export default async function restoreOrg(orgId: string, backupId: string, opts: { selective?: string[]; dryRun?: boolean }) {
  const artifact = await BackupArtifact.findOne({ where: { id: backupId, organisationId: orgId } });
  if (!artifact) throw new NotFound();
  const enc = await s3.getObject({ Bucket: bucket(artifact.locationUri), Key: keyOf(artifact.locationUri) }).promise();
  const buf = await kmsDecrypt(enc.Body as Buffer);
  const json = JSON.parse((await pipe(gunzip(buf))).toString('utf8'));

  if (opts.dryRun) {
    // compare with current state, return diff
    return computeDiff(orgId, json.tables, opts.selective);
  }

  const conn = await openOrgConnection(orgId);
  await conn.query('BEGIN');
  try {
    const tables = opts.selective?.length ? opts.selective : Object.keys(json.tables);
    for (const t of tables) {
      for (const row of json.tables[t]) {
        // upsert by id
        const cols = Object.keys(row); const vals = cols.map(c => row[c]);
        const params = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updates = cols.filter(c => c !== 'id').map(c => `"${c}"=EXCLUDED."${c}"`).join(', ');
        await conn.query(`INSERT INTO "${t}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${params}) ON CONFLICT (id) DO UPDATE SET ${updates}`, vals);
      }
    }
    await conn.query('COMMIT');
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  }
}
```

### 24.3 GDPR right-to-erasure

```ts
// src/modules/admin/jobs/erasure.ts
export default async function erasure(userId: string, orgId: string) {
  const conn = await openOrgConnection(orgId);
  await conn.query('BEGIN');
  try {
    // Anonymise references in audit logs (keep the action, lose the identity)
    await conn.query(`UPDATE audit_log SET user_id = NULL, summary = REGEXP_REPLACE(summary, '<<USER:${userId}>>', '[ERASED]') WHERE user_id = $1`, [userId]);
    // Cascade-delete notifications, favourites, sessions
    await conn.query('DELETE FROM notification WHERE user_id = $1', [userId]);
    await conn.query('DELETE FROM favourite WHERE user_id = $1', [userId]);
    await conn.query('UPDATE user_session SET revoked_at = now(), revoked_reason = $1 WHERE user_id = $2', ['erasure', userId]);
    // Replace PII fields on the user record
    await conn.query(`UPDATE "user" SET email = $1, first_name = '[erased]', last_name = '', username = $2, status = 0 WHERE id = $3`,
      [`erased-${userId}@dbexec.invalid`, `erased-${userId}`, userId]);
    await conn.query('COMMIT');
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  }
}
```

---

## 25 · AI Insights

### 25.1 NL → SemanticRequest pipeline

```ts
// src/modules/ai/services/aiQuery.service.ts
import { OpenAI } from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function answerNL(orgId: string, userId: string, prompt: string, sessionId?: string) {
  // 1. Sanitise schema (drop PII column names + sample values).
  const models = await listSemanticModels(orgId);
  const schema = sanitiseSchemaForLLM(models);

  // 2. Tools definition
  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'execute_semantic_query',
        description: 'Run a semantic query against a model',
        parameters: { /* JSON schema for SemanticQueryRequest */ },
      },
    },
  ];

  // 3. Persist session + turn
  const session = sessionId
    ? await AiSession.findOne({ where: { id: sessionId, userId } })
    : await AiSession.save({ organisationId: orgId, userId });

  // 4. Pull conversation history
  const history = await AiTurn.find({ where: { sessionId: session.id }, order: { createdAt: 'ASC' } });

  // 5. Call LLM
  const messages = [
    { role: 'system' as const, content: `You are a data analyst assistant. Available models:\n${JSON.stringify(schema)}` },
    ...history.map(t => ({ role: t.role as any, content: t.content || '' })),
    { role: 'user' as const, content: prompt },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    tools,
    tool_choice: 'auto',
  });

  await AiTurn.save({ sessionId: session.id, role: 'user', content: prompt });

  const choice = response.choices[0];
  if (choice.message.tool_calls) {
    const call = choice.message.tool_calls[0];
    const args = JSON.parse(call.function.arguments);
    const rows = await runSemanticQuery(args, { userId, orgId });
    await AiTurn.save({
      sessionId: session.id, role: 'tool',
      content: JSON.stringify({ args, rows: rows.slice(0, 5) }),
      toolCalls: { name: call.function.name, args }, tokensIn: response.usage?.prompt_tokens, tokensOut: response.usage?.completion_tokens,
    });
    return { sessionId: session.id, query: args, rows, visualSuggestion: suggestVisual(args, rows) };
  }
  // Plain text response
  await AiTurn.save({ sessionId: session.id, role: 'assistant', content: choice.message.content || '' });
  return { sessionId: session.id, text: choice.message.content };
}

function sanitiseSchemaForLLM(models: any[]) {
  return models.map(m => ({
    id: m.id, name: m.name,
    dimensions: m.dimensions.filter((d: any) => !d.isPii).map((d: any) => ({ name: d.name, type: d.type, label: d.label })),
    metrics: m.metrics.filter((mm: any) => !mm.hidden).map((mm: any) => ({ name: mm.name, kind: mm.kind, label: mm.label })),
  }));
}

function suggestVisual(req: any, rows: any[]) {
  if (req.dimensions?.length === 1 && req.metrics?.length === 1) return 'bar';
  if (req.dimensions?.find((d: string) => d.includes('time'))) return 'line';
  return 'table';
}
```

---

## 27 · Cost Observability

### 27.1 BigQuery dry-run

```ts
async function estimateBigqueryBytes(sql: string, cfg: DatasourceConfig): Promise<number> {
  const sa = JSON.parse(decrypt(cfg.serviceAccountJsonEnc!, cfg.organisationId));
  const bq = new BigQuery({ projectId: sa.project_id, credentials: sa });
  const [job] = await bq.createQueryJob({ query: sql, dryRun: true, useLegacySql: false });
  return Number(job.metadata.statistics.totalBytesProcessed);
}
```

### 27.2 Snowflake auto-pause

```ts
async function pauseSnowflakeWarehouse(cfg: DatasourceConfig) {
  const pool = await acquire(cfg as any);
  await pool.query(`ALTER WAREHOUSE ${cfg.warehouse} SUSPEND`);
}
```

### 27.3 Budget enforcement on query

Wrap every pool.query in semantic compiler path with:

```ts
async function enforceBudget(orgId: string, dsId: string, estBytes: number) {
  const usage = await sumCostsThisPeriod(orgId, dsId);
  const limits = await Budget.find({ where: { organisationId: orgId, scope: In(['org','datasource']) }, });
  for (const l of limits) {
    if ((l.scope === 'org' || (l.scope === 'datasource' && l.scopeId === dsId)) &&
        usage + estBytes > l.limitBytes!) {
      if (l.hardLimit) throw new BadRequest('Budget exceeded; query blocked.');
      if (l.autoPause) await pauseSnowflakeWarehouse(/* cfg */);
      notifyAdmin(orgId, 'budget exceeded');
    }
  }
}
```

---

## 28 · Backup retention + verification

Weekly BullMQ job picks a random backup, restores into a sandbox
schema, runs row-count parity, updates `verified_at + verified_ok`.

```ts
// src/modules/admin/jobs/verifyBackup.ts
export default async function verifyBackup(id: string) {
  const artifact = await BackupArtifact.findOne({ where: { id } });
  if (!artifact) return;
  const sandbox = `verify_${shortId(id)}`;
  try {
    const buf = await downloadAndDecrypt(artifact);
    const json = JSON.parse((await pipe(gunzip(buf))).toString('utf8'));
    const conn = await openSandboxConnection(sandbox);
    // Apply only schema + checks; not full restore
    let totalRows = 0;
    for (const [t, rows] of Object.entries(json.tables)) {
      totalRows += (rows as any[]).length;
    }
    await BackupArtifact.update(id, { verifiedAt: new Date(), verifiedOk: true });
    await dropSandbox(sandbox);
  } catch (e) {
    await BackupArtifact.update(id, { verifiedAt: new Date(), verifiedOk: false });
  }
}
```

Cron: `0 4 * * 0` weekly.

---

## Closing checklist for every new module

1. Migration committed to `src/shared/db/migrations/` (single file per module).
2. Entities under master / shared.
3. Zod validators under `src/shared/validators/<module>.ts`, mirrored
   to UI repo for FE.
4. Routes mounted in `server.ts`.
5. Audit logger called before every successful CUD.
6. Feature flag gating each P0 endpoint.
7. Idempotency middleware applied on every mutating endpoint.
8. Rate-limit middleware applied.
9. OpenAPI registration in `src/openapi/`.
10. e2e cases authored in `e2e/docs/modules/<module>.md` and generated.
11. Webhook event emitted via `eventBus.emit` for each lifecycle.
12. Telemetry span around the controller.

This document is the BE-side complement to the per-module deep-dives.
Together they form a complete blueprint for shipping every feature
identified in the deep-research pass.
