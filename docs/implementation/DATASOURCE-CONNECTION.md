# Datasource & connection

> Implementation companion to research module 01. Pins the
> datasource entity, connection pooling, secret storage,
> per-engine adapter ingest, schema introspection, and the
> credential rotation flow.

**Status:** 🟡 partial — Postgres datasources work, but
single-connection-per-datasource, plaintext-ish secrets, no
introspection cache, no health check.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

DBExec talks to customer databases. The connection layer has
four jobs:

1. Store credentials safely (envelope-encrypted, BYOK-friendly).
2. Maintain a healthy connection pool per datasource.
3. Introspect the schema (databases → schemas → tables → columns)
   and cache it.
4. Surface real-time health (is the warehouse reachable, is the
   pool saturated, what queries are running).

Today only (1) partially works. The rest is shipped piecemeal in
modules that need it. This doc consolidates.

---

## 1. Data model

```sql
CREATE TABLE datasource_s (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL,                 -- 'postgres' | 'mysql' | 'mssql' | 'bigquery' | 'snowflake' | 'redshift' | 'databricks' | 'managed'
  is_default    BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'unhealthy'
  health_status TEXT,                            -- updated by health checker
  health_last_at TIMESTAMPTZ,
  health_last_error TEXT,
  config        JSONB NOT NULL,                  -- non-secret connection bits (host, port, db, options)
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_datasource_org ON datasource_s(org_id);

CREATE TABLE datasource_connection (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasource_s(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                   -- 'default' | 'admin' | 'readonly_etl'
  username      TEXT NOT NULL,
  password_enc  BYTEA NOT NULL,                  -- KMS-wrapped
  dek_id        UUID NOT NULL,                   -- which DEK was used (rotation)
  scope         TEXT NOT NULL DEFAULT 'read',    -- 'read' | 'write' | 'admin'
  is_default    BOOLEAN NOT NULL DEFAULT false,
  pool_min      INTEGER NOT NULL DEFAULT 2,
  pool_max      INTEGER NOT NULL DEFAULT 10,
  pool_idle_ms  INTEGER NOT NULL DEFAULT 30000,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at    TIMESTAMPTZ
);

CREATE INDEX idx_conn_datasource ON datasource_connection(datasource_id);

CREATE TABLE datasource_schema_cache (
  datasource_id UUID NOT NULL REFERENCES datasource_s(id) ON DELETE CASCADE,
  fetched_at    TIMESTAMPTZ NOT NULL,
  -- {schemas: [{name, tables: [{name, columns: [{name, type, nullable}]}]}]}
  payload       JSONB NOT NULL,
  PRIMARY KEY (datasource_id)
);
```

---

## 2. Engine adapter

```typescript
export interface EngineAdapter {
  type: string;
  buildPool(conn: DatasourceConnection, cfg: DatasourceConfig): Pool;
  introspect(pool: Pool): Promise<SchemaCachePayload>;
  health(pool: Pool): Promise<HealthResult>;
  killQuery(pool: Pool, pid: string | number): Promise<void>;
  estimateBytes?(sql: string, params: any[], pool: Pool): Promise<number>;
}

export interface Pool {
  query<T = any>(sql: string, params?: any[], opts?: QueryOpts): Promise<QueryResult<T>>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}
```

### Postgres adapter

```typescript
import { Pool as PgPool } from 'pg';
export const postgresEngine: EngineAdapter = {
  type: 'postgres',
  buildPool(conn, cfg) {
    return new PgPool({
      host: cfg.host, port: cfg.port, database: cfg.database,
      user: conn.username, password: decryptPassword(conn),
      min: conn.poolMin, max: conn.poolMax,
      idleTimeoutMillis: conn.poolIdleMs,
      ssl: cfg.ssl ?? false,
      application_name: `dbexec:${cfg.appTag ?? 'app'}`,
      statement_timeout: 60_000,
    }) as unknown as Pool;
  },
  async introspect(pool) {
    const schemas = await pool.query<any>(`
      SELECT table_schema, table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, ordinal_position
    `);
    return shapeSchemas(schemas.rows);
  },
  async health(pool) {
    const { rows } = await pool.query<{ now: Date }>('SELECT NOW() AS now');
    return { ok: true, latencyMs: 0, version: 'pg' };
  },
  async killQuery(pool, pid) {
    await pool.query('SELECT pg_cancel_backend($1)', [pid]);
  },
};
```

Adapters for MySQL (`mysql2`), MSSQL (`mssql`), BigQuery
(`@google-cloud/bigquery`), Snowflake (`snowflake-sdk`),
Redshift (use postgres adapter with extra options), Databricks
(`@databricks/sql`). One file each.

---

## 3. Secret storage

```typescript
import { kms } from './kms';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export async function encryptSecret(plaintext: string, orgId: string): Promise<{ enc: Buffer; dekId: string }> {
  // Per-org KEK (in KMS); per-secret DEK
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Wrap DEK with the org's KEK in KMS
  const { wrappedDek, dekId } = await kms.wrap(dek, orgId);
  // Final blob: [iv][tag][wrappedDek][ct]
  const enc = Buffer.concat([iv, tag, wrappedDek, ct]);
  return { enc, dekId };
}

export async function decryptSecret(enc: Buffer, dekId: string, orgId: string): Promise<string> {
  const iv = enc.subarray(0, 12);
  const tag = enc.subarray(12, 28);
  const wrappedDek = enc.subarray(28, 28 + 256);  // size depends on KMS algo
  const ct = enc.subarray(28 + 256);
  const dek = await kms.unwrap(wrappedDek, dekId, orgId);
  const decipher = createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

Rotation: nightly cron iterates `datasource_connection` rows
with `rotated_at < NOW() - 90 days`, re-encrypts with the
current KEK version, updates `rotated_at`. Audit log per row.

---

## 4. Connection pool registry

```typescript
import { LRUCache } from 'lru-cache';

const poolCache = new LRUCache<string, Pool>({
  max: 200,                                      // 200 active pools
  ttl: 30 * 60 * 1000,                            // 30 min idle eviction
  dispose: (pool, key) => { pool.end().catch(() => undefined); },
});

export async function getPool(orgId: string, connectionId: string): Promise<Pool> {
  const key = `${orgId}:${connectionId}`;
  let pool = poolCache.get(key);
  if (pool) return pool;

  const ds = await loadDatasourceWithConn(connectionId);
  const adapter = engineFor(ds.datasource.type);
  pool = adapter.buildPool(ds.connection, ds.datasource.config);
  poolCache.set(key, pool);
  return pool;
}
```

Pool keys are scoped by org so cross-org connection sharing is
impossible at the registry level — defence in depth.

---

## 5. Schema introspection cache

Background worker: every 30 min (configurable per org), runs
`adapter.introspect(pool)` and upserts into
`datasource_schema_cache`. The FE schema browser reads from
this table, not live.

```typescript
// src/services/datasource/schemaCache.ts
import cron from 'node-cron';

cron.schedule('*/30 * * * *', async () => {
  for (const ds of await listActiveDatasources()) {
    try {
      const pool = await getPool(ds.orgId, ds.defaultConnectionId);
      const adapter = engineFor(ds.type);
      const payload = await adapter.introspect(pool);
      await connection.getRepository('DatasourceSchemaCache').save({
        datasourceId: ds.id,
        fetchedAt: new Date(),
        payload,
      });
    } catch (err: any) {
      Logger.warn(`Schema introspect failed for ${ds.id}: ${err.message}`);
    }
  }
});
```

Manual refresh: `POST /datasource/:id/schema/refresh` triggers
out-of-band introspection.

---

## 6. Health check

Every 60 s a worker pings each active datasource via
`adapter.health(pool)`. Updates `datasource_s.health_status`,
`health_last_at`, `health_last_error`.

Three states: `ok` (last ping < 90s ago, no error), `degraded`
(> 90s since success), `down` (5 consecutive failures).

On state change, write an audit row and (if `down`) fire a
`datasource.down` notification (module 16) to the org's admin
group.

---

## 7. Controller — add datasource

```typescript
// src/controllers/datasource/addDatasource.ts
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { DS_MSG, GENERIC } from '../../constants/response.messages';
import { auditLogger } from '../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../constants/audit.constants';
import { encryptSecret } from '../../services/secrets';
import { engineFor } from '../../services/datasource/engines';
import { snapshotEntity, AUDIT_FIELDS } from '../../utility/auditMetadata';
import Logger from '../../utility/logger';

const addDatasource = async (req: Request, res: Response) => {
  const { name, description, type, config, defaultConnection } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    const adapter = engineFor(type);

    // 1. Test the connection BEFORE saving
    const { enc, dekId } = await encryptSecret(defaultConnection.password, orgData.orgId);
    const tempPool = adapter.buildPool(
      { username: defaultConnection.username, password_enc: enc, dek_id: dekId,
        poolMin: 1, poolMax: 2, poolIdleMs: 5000 } as any,
      config,
    );
    const health = await adapter.health(tempPool);
    await tempPool.end();
    if (!health.ok) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, DS_MSG.CONNECT_FAILED,
                          { reason: health.error });
    }

    // 2. Save in a tx
    const ds = await connection.transaction(async (tx: any) => {
      const datasource = await tx.getRepository('Datasource').save({
        orgId: orgData.orgId,
        name, description, type, config,
        status: 'active', isDefault: false,
        createdBy: loggedInId,
      });
      await tx.getRepository('DatasourceConnection').save({
        datasourceId: datasource.id,
        name: defaultConnection.name ?? 'default',
        username: defaultConnection.username,
        passwordEnc: enc,
        dekId,
        scope: defaultConnection.scope ?? 'read',
        isDefault: true,
        poolMin: 2, poolMax: 10, poolIdleMs: 30000,
      });
      return datasource;
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.DATASOURCE,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'Datasource',
      entityId: ds.id,
      metadata: { entity: snapshotEntity(ds, AUDIT_FIELDS.DATASOURCE), type },
    });

    // 3. Kick off background introspect (don't block response)
    queueIntrospect(ds.id);

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, DS_MSG.CREATED, ds);
  } catch (err: any) {
    Logger.error(`Add datasource failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default addDatasource;
```

---

## 8. FE — datasource list & detail

Existing `datasource-list.component` already exists. Updates:

- Add health pill (green / amber / red) per row.
- Add "Connections" tab to detail view (list, edit, rotate).
- Add "Schema browser" tab driven by `datasource_schema_cache`.
- "Rotate password" button → modal → updates `password_enc` +
  `rotated_at`, no service impact.

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_ds_pool_total` | gauge | `datasource`, `state` (total/idle/waiting) | pool saturation |
| `dbexec_ds_health_status` | gauge | `datasource`, `status` | 0/1 per status |
| `dbexec_ds_health_latency_ms` | histogram | `datasource` | warehouse RT |
| `dbexec_ds_introspect_ms` | histogram | `datasource` | introspection cost |
| `dbexec_ds_secret_rotated_total` | counter | `outcome` | rotation cron |
| `dbexec_ds_connect_failed_total` | counter | `type`, `reason` | onboarding success rate |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| Plaintext password in audit log | Audit metadata fields whitelisted; `password_enc` never serialised |
| Connection string in URL params | Connection always via id + secret lookup; no params carry secrets |
| Pool growing unbounded under attack | Per-datasource `poolMax`; queue with bounded wait; reject with 503 on saturation |
| Schema info leak (table names tell a story) | Schema browser respects `data_visible_to` flag at column granularity (module 09 col security extends here) |
| SSRF via custom JDBC URL | `config.host` validated against IP allowlist; loopback / metadata / RFC1918 blocked unless org has `allow_internal_datasource = true` |
| Stale credentials after IdP off-board | `datasource_connection.last_used_at` surfaced; orphan-conn report in admin console |
| Cross-org pool key collision | Pool key prefixed by `orgId`; LRU cache mutex per key |
| Replay of decrypted DEK | DEKs are per-secret; replay across secrets ineffective; KMS rate-limits unwrap |

---

## 11. Operational runbook

**Symptom: datasource shows red.**
1. Read `health_last_error`. Network? DNS? Wrong credentials?
2. Manually click "Test connection" — captures fresh error.
3. If error is "password rotated" — rotate in DBExec to match.

**Symptom: pool saturation.**
1. `dbexec_ds_pool_total{state="waiting"}` > 0 = pool full.
2. Diagnose: who's hogging? Cross-ref `pg_stat_activity` or
   warehouse equivalent via `/datasource/:id/activity`.
3. Raise `poolMax` (admin endpoint) or kill the long-running
   query (`POST /datasource/:id/cancel/:pid`).

**Symptom: introspection slow / wrong.**
1. Force refresh via `/schema/refresh`.
2. For BigQuery: introspection across many datasets is slow;
   limit `config.allowedDatasets` to only the relevant ones.

---

## 12. Performance budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Connect (cold pool) | 200 ms | 1 s | 10 s |
| Connect (cached pool) | 1 ms | 5 ms | 50 ms |
| Health ping | 30 ms | 200 ms | 5 s |
| Introspect (typical 20-schema warehouse) | 800 ms | 3 s | 30 s |
| Secret decrypt (KMS unwrap) | 15 ms | 50 ms | 500 ms |

KMS unwrap is per-pool-build, not per-query — caches via the
pool LRU.

---

## 13. Migration & rollout

1. **Migrations:** add `datasource_connection`,
   `datasource_schema_cache`, extra columns on `datasource_s`.
2. **Backfill:** existing `datasource_s` rows get a default
   `datasource_connection` from their existing inline credentials,
   then those columns are nulled.
3. **Re-encrypt:** rotation cron re-wraps existing DEKs with
   the current KEK version.
4. **Feature flag:** `feature.datasource_v2`. Default ON for
   new orgs, gradual rollout for existing.

---

## 14. Open questions

1. **Read replicas** — auto-route SELECTs to a read replica?
   v2.
2. **Cross-region datasources** — pool affinity to region.
   v2.
3. **JDBC connection-string mode** — let admins paste a JDBC
   URL instead of host/port/database. Risk: bad URLs slip past
   validation. Need parser.

---

## 15. References

- [01-datasource-connection.md](../research/modules/01-datasource-connection.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [28-backup-restore.md](../research/modules/28-backup-restore.md) (KMS shared)
- node-postgres, mysql2, snowflake-sdk, @databricks/sql docs
