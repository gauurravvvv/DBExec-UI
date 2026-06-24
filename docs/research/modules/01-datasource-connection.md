# 01 · Datasource & Connection

> The connectivity layer. Everything in DBExec ultimately reads from a
> datasource. Connections wrap a datasource with per-user / per-role
> credentials so admin secrets never reach end-users.

**Depends on:** —
**Unblocks:** every other module
**DBExec maturity:** ✅ mature; gaps are around new drivers, SSL,
IAM auth, and pool observability.

---

## 0. Context

A datasource has two faces:

- **Outward** — the user picks one when creating a dataset.
- **Inward** — the BE pool manager owns a `pg.Pool` (or equivalent)
  keyed by `datasource.id`.

Connections are DBExec-specific. Tableau/Looker don't have a direct
analogue; their nearest match is "data source filters" — but ours is
much stronger because the underlying DB user is different per
connection.

```
┌──────────────────────────────────────────────────────────────┐
│   Datasource (datasource + datasource_config)                │
│   - one row per external DB                                  │
│   - stores admin credentials, encrypted with org pepper       │
└──────────────────────────────────────────────────────────────┘
                          ▲                  ▲
                          │                  │
            ┌─────────────┴────┐    ┌────────┴──────────┐
            │   Connection      │    │   Direct usage    │
            │   (per-user creds)│    │  (admin path,     │
            │                   │    │   schema explore) │
            └───────────────────┘    └───────────────────┘
                          ▲
                          │
                   ┌──────┴───────┐
                   │   Dataset    │
                   │  (chooses    │
                   │   one)        │
                   └──────────────┘
```

## 1. Industry baseline

- **Tableau** — Connection metadata in workbook + Hyper extract for
  caching. Drivers shipped with Tableau Server.
- **Power BI** — Power Query connectors. 100+ first-party connectors.
- **Looker** — `connection` block in LookML. Supports BigQuery,
  Snowflake, Postgres, MySQL, Redshift, Databricks, Trino, MS Fabric,
  more.
- **Metabase** — Drivers loaded at runtime; community drivers for
  Druid, Ignite, etc.
- **Superset** — Pure SQLAlchemy. Any dialect SQLAlchemy supports →
  Superset supports.

DBExec ships **Postgres / MySQL / MariaDB / MSSQL / Oracle / Snowflake**
today. Industry standard is 8-12 first-party + community plugins.

## 2. DBExec today

| Aspect | Status | File paths |
|---|---|---|
| Datasource entity | ✅ | `DBExec-API/src/shared/db/master_entity/database.entity.ts`, `shared_entity/datasourceS.entity.ts` |
| Datasource config (host/port/credentials/etc.) | ✅ | `shared_entity/datasource_config.entity.ts` |
| Connection entity | ✅ | `shared_entity/connections.entity.ts` |
| Drivers | ✅ Postgres, MySQL, MariaDB, MSSQL, Oracle, Snowflake | `shared/services/connectionPool.service.ts` |
| Schema explore | ✅ | `modules/datasources/middleware/schema/*` |
| Activity/cancel | ✅ | `modules/datasources/middleware/activity/*` |
| FE add/edit forms | ✅ Zod | `src/app/modules/datasource/*` |
| SSL UI | ❌ | — |
| IAM auth | ❌ | — |
| BigQuery / Databricks / Redshift / Trino | ❌ | — |
| Pool metrics endpoint | ❌ | — |
| Connection rotation | 🟡 (manual edit) | — |

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| DS-G01 | SSL/TLS configuration UI + storage | P0 |
| DS-G02 | BigQuery driver | P0 |
| DS-G03 | Redshift driver (technically Postgres compat — but quirks) | P1 |
| DS-G04 | Databricks SQL driver | P1 |
| DS-G05 | Trino / Presto driver | P2 |
| DS-G06 | ClickHouse driver | P2 |
| DS-G07 | DuckDB embedded (for "managed" datasource holding uploads) | P0 |
| DS-G08 | AWS RDS IAM auth | P1 |
| DS-G09 | GCP OAuth (BigQuery) | P0 (paired with DS-G02) |
| DS-G10 | Azure AD service principal | P1 |
| DS-G11 | Pool metrics endpoint | P1 |
| DS-G12 | Connection password rotation with grace period | P1 |
| DS-G13 | "Test connection" inside the connection form (not just datasource) | P1 |
| DS-G14 | Connection sharing audit (who uses which connection?) | P2 |

## 4. Target architecture

### 4.1 Datasource entity refresh

Add `ssl jsonb` and `auth_method` to the existing `datasource_config`:

```sql
ALTER TABLE datasource_config
  ADD COLUMN ssl jsonb,                                  -- { mode, caCert, clientCert, clientKey }
  ADD COLUMN auth_method varchar(32) NOT NULL DEFAULT 'password',
                                                         -- password | iam | oauth | service_account
  ADD COLUMN iam_role_arn varchar(255),
  ADD COLUMN service_account_json_enc bytea,
  ADD COLUMN oauth_refresh_token_enc bytea,
  ADD COLUMN pool_max int NOT NULL DEFAULT 10,
  ADD COLUMN pool_idle_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN pool_acquire_timeout_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN statement_timeout_ms int NOT NULL DEFAULT 60000;
```

### 4.2 Pool manager

A single in-process registry keyed by `datasource.id`. Lifecycle:

- **Create** — first dataset/preview against a datasource triggers
  pool construction.
- **Refresh** — `/datasources/:id/refresh` evicts the existing pool;
  next caller rebuilds with new config.
- **Idle eviction** — pools with no checkout for `pool_idle_ms` are
  destroyed.
- **Health probe** — every 30s a `SELECT 1` keeps a single connection
  warm.

```ts
// shared/services/connectionPool.service.ts (refactored)
import * as pg from 'pg';
import * as mysql from 'mysql2/promise';
import { ConnectionOptions, Pool as MssqlPool } from 'mssql';
import oracledb from 'oracledb';
import snowflake from 'snowflake-sdk';
import { BigQuery } from '@google-cloud/bigquery';
import { DBSQLClient } from '@databricks/sql';

export interface DatasourcePool {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; columns: ColumnMeta[] }>;
  destroy(): Promise<void>;
  metrics(): PoolMetrics;
}

export interface PoolMetrics {
  size: number;
  idle: number;
  inUse: number;
  waiting: number;
  totalCheckouts: number;
  totalErrors: number;
  p95CheckoutMs: number;
}

export class PoolManager {
  private pools = new Map<string, DatasourcePool>();

  async acquire(ds: DatasourceConfig): Promise<DatasourcePool> {
    if (this.pools.has(ds.id)) return this.pools.get(ds.id)!;
    const pool = await this.buildPool(ds);
    this.pools.set(ds.id, pool);
    return pool;
  }

  async refresh(dsId: string) {
    const pool = this.pools.get(dsId);
    if (pool) {
      this.pools.delete(dsId);
      await pool.destroy();
    }
  }

  metricsFor(dsId: string): PoolMetrics | null {
    return this.pools.get(dsId)?.metrics() ?? null;
  }

  private async buildPool(ds: DatasourceConfig): Promise<DatasourcePool> {
    switch (ds.dbType) {
      case 'postgres':   return new PgDatasourcePool(ds);
      case 'mysql':
      case 'mariadb':    return new MySqlDatasourcePool(ds);
      case 'mssql':      return new MssqlDatasourcePool(ds);
      case 'oracle':     return new OracleDatasourcePool(ds);
      case 'snowflake':  return new SnowflakeDatasourcePool(ds);
      case 'bigquery':   return new BigQueryDatasourcePool(ds);
      case 'databricks': return new DatabricksDatasourcePool(ds);
      case 'duckdb':     return new DuckDbDatasourcePool(ds);
      default: throw new Error(`unsupported db type ${ds.dbType}`);
    }
  }
}
```

Each driver wrapper is small. Postgres:

```ts
export class PgDatasourcePool implements DatasourcePool {
  private pool: pg.Pool;
  private metricsState: PoolMetrics = {
    size: 0, idle: 0, inUse: 0, waiting: 0,
    totalCheckouts: 0, totalErrors: 0, p95CheckoutMs: 0,
  };
  private checkoutDurations: number[] = [];

  constructor(cfg: DatasourceConfig) {
    const password = decryptWithOrgPepper(cfg.passwordEnc, cfg.organisationId);
    this.pool = new pg.Pool({
      host: cfg.hostname,
      port: cfg.port,
      database: cfg.dbName,
      user: cfg.username,
      password,
      ssl: cfg.ssl?.mode === 'require'
        ? { rejectUnauthorized: cfg.ssl.rejectUnauthorized ?? true,
            ca: cfg.ssl.caCert, cert: cfg.ssl.clientCert, key: cfg.ssl.clientKey }
        : false,
      max: cfg.poolMax,
      idleTimeoutMillis: cfg.poolIdleMs,
      connectionTimeoutMillis: cfg.poolAcquireTimeoutMs,
      statement_timeout: cfg.statementTimeoutMs,
    });
    this.pool.on('error', () => { this.metricsState.totalErrors++; });
    setInterval(() => this.refreshMetrics(), 5000);
  }

  async query<T>(sql: string, params: unknown[] = []) {
    const t0 = Date.now();
    let client: pg.PoolClient | null = null;
    try {
      client = await this.pool.connect();
      this.metricsState.totalCheckouts++;
      const res = await client.query(sql, params);
      this.checkoutDurations.push(Date.now() - t0);
      if (this.checkoutDurations.length > 1000) this.checkoutDurations.shift();
      return {
        rows: res.rows as T[],
        columns: res.fields.map(f => ({ name: f.name, type: pgTypeMap(f.dataTypeID) })),
      };
    } catch (e) {
      this.metricsState.totalErrors++;
      throw mapDriverError(e);
    } finally {
      client?.release();
    }
  }

  async destroy() { await this.pool.end(); }

  metrics(): PoolMetrics {
    return { ...this.metricsState };
  }

  private refreshMetrics() {
    this.metricsState.size    = this.pool.totalCount;
    this.metricsState.idle    = this.pool.idleCount;
    this.metricsState.waiting = this.pool.waitingCount;
    this.metricsState.inUse   = this.metricsState.size - this.metricsState.idle;
    this.metricsState.p95CheckoutMs = percentile(this.checkoutDurations, 0.95);
  }
}
```

### 4.3 BigQuery driver shim

```ts
export class BigQueryDatasourcePool implements DatasourcePool {
  private client: BigQuery;

  constructor(cfg: DatasourceConfig) {
    const sa = JSON.parse(
      decryptWithOrgPepper(cfg.serviceAccountJsonEnc!, cfg.organisationId)
    );
    this.client = new BigQuery({ projectId: sa.project_id, credentials: sa });
  }

  async query<T>(sql: string, params: unknown[] = []) {
    const [job]  = await this.client.createQueryJob({
      query: sql,
      params,
      location: 'US',
      useLegacySql: false,
    });
    const [rows, , meta] = await job.getQueryResults();
    return {
      rows: rows as T[],
      columns: meta.schema!.fields!.map((f: any) => ({
        name: f.name, type: bqTypeMap(f.type),
      })),
    };
  }
  async destroy() { /* no persistent pool */ }
  metrics(): PoolMetrics { return zeroMetrics(); }
}
```

### 4.4 Driver-specific error normalisation

Surfaces to FE as a consistent shape — never raw "ORA-12541":

```ts
// shared/services/driverErrors.ts
export function mapDriverError(e: unknown): Error {
  const msg = (e as any)?.message ?? String(e);
  if (/ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(msg))
    return new BadRequestError('Could not reach the database server.');
  if (/password authentication failed|Access denied|ORA-01017|Login failed/.test(msg))
    return new BadRequestError('Invalid database credentials.');
  if (/permission denied|insufficient privilege|SELECT command denied/.test(msg))
    return new BadRequestError('The database user lacks permission for this operation.');
  if (/statement timeout|canceling statement/.test(msg))
    return new BadRequestError('Query timed out.');
  return new BadRequestError(`Database error: ${msg.slice(0, 200)}`);
}
```

## 5. Schemas + migrations

### 5.1 datasource_config.sql

```sql
BEGIN;

ALTER TABLE datasource_config
  ADD COLUMN ssl jsonb,
  ADD COLUMN auth_method varchar(32) NOT NULL DEFAULT 'password',
  ADD COLUMN iam_role_arn varchar(255),
  ADD COLUMN service_account_json_enc bytea,
  ADD COLUMN oauth_refresh_token_enc bytea,
  ADD COLUMN pool_max int NOT NULL DEFAULT 10,
  ADD COLUMN pool_idle_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN pool_acquire_timeout_ms int NOT NULL DEFAULT 30000,
  ADD COLUMN statement_timeout_ms int NOT NULL DEFAULT 60000;

-- Backfill: existing rows already imply auth_method='password'.
COMMIT;
```

### 5.2 datasource_pool_event table (optional, observability)

```sql
CREATE TABLE datasource_pool_event (
  id           uuid PRIMARY KEY,
  datasource_id uuid NOT NULL,
  event        varchar(32) NOT NULL,     -- created | destroyed | refreshed | timeout | error
  detail       jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON datasource_pool_event (datasource_id, occurred_at DESC);
```

## 6. APIs

### 6.1 Existing (reaffirm)

| Method | Path | Purpose |
|---|---|---|
| POST | `/datasource` | Create |
| PUT | `/datasource/update` | Update |
| DELETE | `/datasource/delete/:id` | Soft-delete |
| GET | `/datasource/list` | Paginated list |
| GET | `/datasource/get/:id` | Single |
| POST | `/datasource/validate` | Connection test (no persist) |
| GET | `/datasource/schema/list/:id` | schema → tables → columns |

### 6.2 New endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/datasource/:id/pool/metrics` | Live pool stats |
| POST | `/datasource/:id/pool/refresh` | Evict + rebuild pool |
| POST | `/datasource/:id/rotate-password` | Rotate stored password |
| POST | `/datasource/:id/test-ssl` | SSL handshake test |

Sample response shape:

```jsonc
// GET /datasource/<uuid>/pool/metrics
{
  "status": true,
  "code": 200,
  "message": "ok",
  "data": {
    "size": 5,
    "idle": 3,
    "inUse": 2,
    "waiting": 0,
    "totalCheckouts": 1827,
    "totalErrors": 4,
    "p95CheckoutMs": 28
  }
}
```

## 7. UI specs

### 7.1 Add Datasource form (changes)

Add **"Authentication"** group:

- Radio: Password | IAM | OAuth | Service Account
- If IAM → `iamRoleArn` input
- If OAuth → "Connect Google" button → opens consent screen
- If Service Account → JSON textarea + upload button

Add **"Security"** group (advanced collapsible):

- SSL Mode dropdown: disable / require / verify-ca / verify-full
- CA Certificate (textarea)
- Client Certificate (textarea)
- Client Key (textarea)
- "Skip TLS verification" toggle (warning)

Add **"Pool"** group:

- pool_max (slider 1-50)
- statement_timeout_ms (slider 1s-10min)
- pool_idle_ms

### 7.2 Datasource detail page

Add **"Pool"** tab next to "Schemas" and "Activity":

- Live gauges: in-use, idle, waiting
- p95 checkout
- Total errors with last 10 events from `datasource_pool_event`
- "Refresh pool" button

### 7.3 Connection form

Add **"Test connection"** button (G13).

## 8. Code recipes

### 8.1 SSL validation helper

```ts
// shared/services/sslValidator.ts
import * as tls from 'node:tls';

export function probeSsl(
  host: string, port: number, opts: SslOpts,
): Promise<{ ok: boolean; peerSubject?: string; error?: string }> {
  return new Promise((resolve) => {
    const sock = tls.connect({
      host, port,
      ca: opts.caCert ? [opts.caCert] : undefined,
      cert: opts.clientCert,
      key: opts.clientKey,
      rejectUnauthorized: opts.rejectUnauthorized,
      timeout: 10_000,
    }, () => {
      const peer = sock.getPeerCertificate();
      resolve({ ok: true, peerSubject: peer.subject?.CN });
      sock.end();
    });
    sock.on('error', (e) => resolve({ ok: false, error: e.message }));
    sock.on('timeout', () => resolve({ ok: false, error: 'TLS handshake timeout' }));
  });
}
```

### 8.2 IAM token signer (AWS RDS)

```ts
// shared/services/iamAuth.ts
import { Signer } from '@aws-sdk/rds-signer';

export async function buildRdsIamPassword(cfg: {
  region: string;
  hostname: string;
  port: number;
  username: string;
}): Promise<string> {
  const signer = new Signer({
    region: cfg.region,
    hostname: cfg.hostname,
    port: cfg.port,
    username: cfg.username,
  });
  return await signer.getAuthToken();
}
```

Used in `PgDatasourcePool` when `auth_method === 'iam'`. Rotate every
14 min (IAM tokens last 15 min).

## 9. Test plan

E2E IDs match `e2e/docs/modules/04-datasources.md`. Add new ones:

- **DS-H-22** — Add Postgres with SSL require → green test.
- **DS-H-23** — Add BigQuery with service account JSON → green test.
- **DS-N-22** — Self-signed cert + `rejectUnauthorized=true` → reject.
- **DS-N-23** — IAM with bad role ARN → reject.
- **DS-E-23** — Refresh pool while a query runs → in-flight query
  completes; new pool services next.

## 10. Migration & rollout

1. Migration on shared DB adds new columns; default-backfilled.
2. Pool manager refactor is internal; no API break.
3. UI fields appear with feature flag `enableAdvancedDatasourceConfig`
   (on by default for org admins).
4. New drivers (BigQuery / Databricks) ship behind feature flags so
   missing system libs (e.g. ODBC) don't break boot.

## 11. Open questions

- Should IAM credential rotation happen in the pool manager
  (transparent) or be an explicit refresh tick? Recommend transparent
  with a 14-min cron.
- Should the "managed datasource" (DuckDB or embedded Postgres) be
  per-org or per-org-per-user? Per-org keeps the row-count modest;
  per-user gives stronger isolation. Recommend **per-org with prefix**.
