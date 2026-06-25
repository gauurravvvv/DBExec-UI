# 27 · Cost Observability & Query Budgets

> When DBExec sits in front of a paid warehouse (Snowflake, BigQuery,
> Redshift), every query has a price. A naïve dashboard can run a
> $1,000 query in five clicks. This module gives admins visibility
> into who's spending what, enforces budgets before things break,
> and pauses idle warehouses to stop the meter.
>
> Sister modules:
> [01 · Datasource](01-datasource-connection.md) (where the
> external compute lives), [05 · Cache](05-cache-materialisation.md)
> (the primary cost-reducer), [19 · Audit](19-audit-observability.md)
> (the slow query log), [04 · Query Processor](04-query-processor.md)
> (where dry-run estimates plug in).

**Depends on:** Datasource (01), Audit (19), Query Processor (04)
**Unblocks:** "Why is our Snowflake bill 3× last month?", cost
  governance, paid-tier features
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Tool | Per-query cost | Budgets | Auto-pause | Forecast |
|---|---|---|---|---|
| **Looker** | partial (admin view) | yes (Looker Cloud) | n/a | partial |
| **Hex** | yes (Snowflake billing API) | yes | yes (Snowflake) | yes |
| **Mode** | partial | partial | n/a | n/a |
| **Sigma** | partial | partial | yes (Snowflake) | partial |
| **Snowflake native** | yes (account usage) | resource monitors | yes (auto-suspend) | yes |
| **BigQuery** | yes (INFORMATION_SCHEMA.JOBS) | quotas | n/a (pay-per-query) | yes |

**The patterns to copy:**

- **Dry-run estimates** where the engine supports them (BigQuery
  `dryRun: true` returns bytes scanned; Snowflake doesn't natively
  but `EXPLAIN USING TEXT` is close).
- **Budgets per organisation, per datasource**, and per user. Hard
  limits block; soft limits warn.
- **Auto-pause Snowflake warehouses** when idle — biggest single
  cost lever.
- **Forecast spend** using simple ARIMA / linear regression on the
  last 30 days of usage. Doesn't need ML; just statistics.
- **Cost reports** as a built-in dashboard so admins can self-serve
  without writing SQL against billing tables.

## 2. DBExec today

- **Nothing.** No cost tracking, no budget, no auto-pause, no
  forecast. Customers learn about query cost when their warehouse
  bill arrives at month-end.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| CO-G01 | Per-query bytes-scanned + duration capture | P0 | M |
| CO-G02 | Cost estimation per query (per-engine pricing rules) | P0 | M |
| CO-G03 | Daily / weekly / monthly cost rollup | P0 | M |
| CO-G04 | Budget table (org / datasource / user scopes) | P0 | M |
| CO-G05 | Budget enforcement (hard + soft) | P0 | M |
| CO-G06 | Dry-run for BigQuery before execution | P0 | S |
| CO-G07 | Snowflake warehouse auto-pause on idle | P1 | M |
| CO-G08 | "Top expensive users / dashboards this month" report | P1 | M |
| CO-G09 | 30-day spend forecast | P1 | M |
| CO-G10 | Cost-of-execution attribution (dataset → analysis → dashboard) | P1 | M |
| CO-G11 | Slack / email alert at 80% / 100% of budget | P0 | S |
| CO-G12 | Webhook event `budget.threshold_crossed` | P1 | S |
| CO-G13 | "Cache hit ratio" report (refer to module 05) | P1 | S |
| CO-G14 | Per-engine pricing config (admin-editable) | P1 | S |
| CO-G15 | Cost-aware rate limiting (slow down expensive workloads) | P2 | M |
| CO-G16 | Reservations / commit-tier optimisation | P2 | L |

## 4. Target architecture

### 4.1 Per-query telemetry

```sql
CREATE TABLE query_execution_log (
  id              bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL,
  user_id         uuid,
  datasource_id   uuid NOT NULL,
  surface         varchar(32),                -- dataset | analysis | dashboard | adhoc | ai
  surface_id      uuid,

  -- What was run
  sql_preview     varchar(1000),
  query_hash      varchar(64),                 -- sha256 of normalised SQL

  -- What it cost
  bytes_scanned   bigint,
  bytes_returned  bigint,
  row_count       bigint,
  duration_ms     int,
  warehouse_size  varchar(16),                  -- for Snowflake
  warehouse_id    varchar(64),                  -- which compute resource
  credits         numeric(10, 6),               -- Snowflake credits
  estimated_cost_usd numeric(10, 4),

  -- Status
  status          varchar(16),                  -- ok | timeout | error | cancelled
  error_message   text,

  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qel_org_time   ON query_execution_log (organisation_id, occurred_at DESC);
CREATE INDEX qel_user_time  ON query_execution_log (user_id, occurred_at DESC);
CREATE INDEX qel_surface    ON query_execution_log (surface, surface_id, occurred_at DESC);
CREATE INDEX qel_ds_time    ON query_execution_log (datasource_id, occurred_at DESC);
```

Every external-datasource query gets wrapped:

```ts
// src/shared/services/cost/instrumentedExecute.ts
export async function instrumentedExecute<T>(
  pool: DatasourceQueryConnection,
  sql: string,
  params: any[],
  ctx: {
    organisationId: string;
    userId?: string;
    datasourceId: string;
    surface: string;
    surfaceId?: string;
    datasourceType: string;
    pricingProfile: PricingProfile;
  },
): Promise<T> {
  const t0 = Date.now();
  let status: 'ok'|'timeout'|'error'|'cancelled' = 'ok';
  let error: string | undefined;
  let bytesScanned: number | undefined;
  let bytesReturned: number | undefined;
  let rowCount: number | undefined;
  let credits: number | undefined;
  let result: T;

  try {
    // BigQuery exposes bytes scanned via the job metadata
    if (ctx.datasourceType === 'bigquery') {
      result = await pool.query(sql, params) as any;
      bytesScanned = (result as any).bytesProcessed;
      rowCount = (result as any).rows?.length;
    }
    // Snowflake exposes warehouse size via QUERY_HISTORY
    else if (ctx.datasourceType === 'snowflake') {
      result = await pool.query(sql, params) as any;
      // Snowflake doesn't return cost in the same response; we
      // poll QUERY_HISTORY for the query_id later (async)
      rowCount = (result as any).rows?.length;
    }
    // Postgres / MySQL — count only rows + duration; bytes via
    // EXPLAIN (BUFFERS) optionally
    else {
      result = await pool.query(sql, params) as any;
      rowCount = (result as any).rows?.length;
    }

    return result;
  } catch (e: any) {
    error = e.message;
    status = /timeout/i.test(error ?? '') ? 'timeout' :
             /cancel/i.test(error ?? '')  ? 'cancelled' : 'error';
    throw e;
  } finally {
    const duration = Date.now() - t0;
    const cost = estimateCost({
      datasourceType: ctx.datasourceType,
      bytesScanned, durationMs: duration, credits,
      pricingProfile: ctx.pricingProfile,
    });
    QueryExecutionLog.insert({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      datasourceId: ctx.datasourceId,
      surface: ctx.surface, surfaceId: ctx.surfaceId,
      sqlPreview: sql.slice(0, 1000),
      queryHash: sha256(normaliseSql(sql)),
      bytesScanned, bytesReturned, rowCount,
      durationMs: duration,
      credits, estimatedCostUsd: cost,
      status, errorMessage: error,
    }).catch(() => {});
  }
}
```

### 4.2 Pricing profile

Per-engine cost formula, admin-editable:

```sql
CREATE TABLE pricing_profile (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid,                       -- NULL = platform default
  datasource_type     varchar(32) NOT NULL,
  -- BigQuery: $ per TiB scanned
  bigquery_usd_per_tib          numeric(10, 4) DEFAULT 6.25,
  -- Snowflake: $ per credit, plus warehouse-size credit/sec
  snowflake_usd_per_credit      numeric(10, 4) DEFAULT 2.00,
  snowflake_credits_per_sec_xs   numeric(10, 8) DEFAULT 0.000278,  -- 1 credit/h
  snowflake_credits_per_sec_s    numeric(10, 8) DEFAULT 0.000556,  -- 2 credits/h
  snowflake_credits_per_sec_m    numeric(10, 8) DEFAULT 0.001111,
  snowflake_credits_per_sec_l    numeric(10, 8) DEFAULT 0.002222,
  snowflake_credits_per_sec_xl   numeric(10, 8) DEFAULT 0.004444,
  -- Postgres / MySQL: time-based notional ($ per CPU-hour as proxy)
  cpu_usd_per_hour              numeric(10, 4) DEFAULT 0.20,
  -- Redshift: similar to Postgres + per-node multiplier
  redshift_usd_per_node_hour    numeric(10, 4) DEFAULT 0.85,
  updated_on     timestamptz NOT NULL DEFAULT now()
);
```

```ts
function estimateCost(args: {
  datasourceType: string;
  bytesScanned?: number;
  durationMs: number;
  credits?: number;
  warehouseSize?: string;
  pricingProfile: PricingProfile;
}): number {
  const p = args.pricingProfile;
  switch (args.datasourceType) {
    case 'bigquery':
      if (!args.bytesScanned) return 0;
      return (args.bytesScanned / 1e12) * (p.bigquery_usd_per_tib ?? 6.25);
    case 'snowflake':
      if (args.credits) return args.credits * (p.snowflake_usd_per_credit ?? 2);
      // Fallback: estimate from duration + warehouse size
      const cps = creditPerSec(p, args.warehouseSize);
      return (args.durationMs / 1000) * cps * (p.snowflake_usd_per_credit ?? 2);
    case 'postgres':
    case 'mysql':
    case 'mariadb':
    case 'mssql':
    case 'oracle':
      // Approximation — treat duration as CPU time
      return (args.durationMs / 3_600_000) * (p.cpu_usd_per_hour ?? 0.20);
    case 'redshift':
      return (args.durationMs / 3_600_000) * (p.redshift_usd_per_node_hour ?? 0.85);
    default:
      return 0;
  }
}
```

### 4.3 BigQuery dry-run estimation

Before executing a query that *might* be expensive, dry-run it:

```ts
import { BigQuery } from '@google-cloud/bigquery';

export async function bigqueryDryRunEstimate(
  cfg: DatasourceConfig,
  sql: string,
): Promise<{ bytesScanned: number; estimatedCostUsd: number }> {
  const sa = JSON.parse(decryptForOrg(cfg.serviceAccountJsonEnc!, cfg.organisationId));
  const bq = new BigQuery({ projectId: sa.project_id, credentials: sa });

  const [job] = await bq.createQueryJob({
    query: sql,
    dryRun: true,
    useLegacySql: false,
  });

  const bytesScanned = Number(job.metadata.statistics?.totalBytesProcessed ?? 0);
  const estimatedCostUsd = (bytesScanned / 1e12) * 6.25;   // $6.25/TiB on-demand
  return { bytesScanned, estimatedCostUsd };
}

// In runAnalysisQuery (BigQuery-only branch):
if (cfg.dbType === 'bigquery') {
  const est = await bigqueryDryRunEstimate(cfg, finalSql);
  if (est.bytesScanned > LARGE_QUERY_THRESHOLD_BYTES) {
    // Refuse without confirmation
    if (!req.body.confirmExpensive) {
      return sendResponse(res, false, 400, 'cost.dryrun.threshold_exceeded', {
        bytesScanned: est.bytesScanned,
        estimatedCostUsd: est.estimatedCostUsd,
        threshold: LARGE_QUERY_THRESHOLD_BYTES,
      });
    }
  }
  // Budget check before execution
  await enforceBudget({
    orgId: ctx.organisationId,
    datasourceId: cfg.id,
    additionalCostUsd: est.estimatedCostUsd,
  });
}
```

### 4.4 Budgets

```sql
CREATE TABLE budget (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  scope               varchar(16) NOT NULL,      -- org | datasource | user
  scope_id            uuid,                       -- null when scope=org
  period              varchar(16) NOT NULL,       -- day | week | month
  limit_usd           numeric(10, 2) NOT NULL,
  hard_limit          boolean NOT NULL DEFAULT false,    -- true = block above
  auto_pause          boolean NOT NULL DEFAULT false,    -- Snowflake-only
  alert_thresholds_pct int[] NOT NULL DEFAULT '{50,80,100}',
  alert_channels      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              smallint NOT NULL DEFAULT 1,
  created_by          uuid,
  created_on          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget_state (
  budget_id           uuid NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  period_start        timestamptz NOT NULL,
  spent_usd           numeric(10, 4) NOT NULL DEFAULT 0,
  last_alert_pct      int,                        -- last threshold crossed
  PRIMARY KEY (budget_id, period_start)
);
```

```ts
// src/shared/services/cost/enforceBudget.ts
export async function enforceBudget(args: {
  orgId: string;
  datasourceId: string;
  userId?: string;
  additionalCostUsd: number;
}): Promise<void> {
  const candidates = await Budget.find({
    where: [
      { organisationId: args.orgId, scope: 'org',         scopeId: null,                    status: 1 },
      { organisationId: args.orgId, scope: 'datasource',  scopeId: args.datasourceId,        status: 1 },
      ...(args.userId ? [{ organisationId: args.orgId, scope: 'user', scopeId: args.userId, status: 1 }] : []),
    ] as any,
  });

  for (const b of candidates) {
    const periodStart = startOfPeriod(b.period);
    const state = await BudgetState.findOne({
      where: { budgetId: b.id, periodStart },
    });
    const spent = (state?.spentUsd ?? 0) + args.additionalCostUsd;
    const pct = (spent / b.limitUsd) * 100;

    if (b.hardLimit && spent > b.limitUsd) {
      await maybeAutoPause(b);
      throw new BadRequest('cost.budget.exceeded', {
        budgetId: b.id,
        scope: b.scope,
        limitUsd: b.limitUsd,
        spentUsd: state?.spentUsd ?? 0,
        additionalUsd: args.additionalCostUsd,
      });
    }
  }
}

// After successful execution, debit:
export async function debitBudgetFor(args: {
  orgId: string;
  datasourceId: string;
  userId?: string;
  actualCostUsd: number;
}) {
  const candidates = /* same lookup */;
  for (const b of candidates) {
    const periodStart = startOfPeriod(b.period);
    await master_db_connection.query(`
      INSERT INTO budget_state (budget_id, period_start, spent_usd)
      VALUES ($1, $2, $3)
      ON CONFLICT (budget_id, period_start)
      DO UPDATE SET spent_usd = budget_state.spent_usd + EXCLUDED.spent_usd`,
      [b.id, periodStart, args.actualCostUsd]);

    await checkAlertThresholds(b);
  }
}

async function checkAlertThresholds(b: Budget) {
  const state = await BudgetState.findOne({ where: { budgetId: b.id, periodStart: startOfPeriod(b.period) } });
  if (!state) return;
  const pct = Math.floor((state.spentUsd / b.limitUsd) * 100);
  const crossed = b.alertThresholdsPct.find(t =>
    pct >= t && (state.lastAlertPct ?? -1) < t);
  if (crossed) {
    await BudgetState.update(
      { budgetId: b.id, periodStart: startOfPeriod(b.period) },
      { lastAlertPct: crossed },
    );
    await notifyBudgetThreshold(b, pct, state.spentUsd);
  }
}
```

### 4.5 Snowflake auto-pause

When a hard limit is breached and `auto_pause = true`, suspend the
warehouse to stop the meter:

```ts
async function maybeAutoPause(b: Budget) {
  if (!b.autoPause) return;
  if (b.scope !== 'datasource' && b.scope !== 'org') return;

  const datasources = b.scope === 'datasource'
    ? [await DatasourceS.findOne({ where: { id: b.scopeId! } })]
    : await DatasourceS.find({ where: { organisationId: b.organisationId } });

  for (const ds of datasources) {
    if (!ds || ds.config.dbType !== 'snowflake') continue;
    const warehouse = ds.config.warehouse;
    if (!warehouse) continue;
    try {
      const pool = await acquire(ds.config);
      await pool.query(`ALTER WAREHOUSE ${quoteIdentifier(warehouse)} SUSPEND`);
      Logger.warn(`Auto-paused Snowflake warehouse ${warehouse} for budget ${b.id}`);
    } catch (e) {
      // Likely already suspended — fine
      Logger.info(`Warehouse pause skipped: ${(e as Error).message}`);
    }
  }
}

// Reverse — when an admin resumes the budget (resets, or
// increases the limit), unpause:
async function resumeWarehouses(orgId: string, datasourceId?: string) {
  const datasources = datasourceId
    ? [await DatasourceS.findOne({ where: { id: datasourceId, organisationId: orgId } })]
    : await DatasourceS.find({ where: { organisationId: orgId } });

  for (const ds of datasources) {
    if (!ds || ds.config.dbType !== 'snowflake') continue;
    const pool = await acquire(ds.config);
    try {
      await pool.query(`ALTER WAREHOUSE ${quoteIdentifier(ds.config.warehouse!)} RESUME`);
    } catch {}
  }
}
```

### 4.6 Idle auto-suspend (Snowflake)

Set on warehouse creation, not at runtime — Snowflake's own
`AUTO_SUSPEND` parameter. DBExec exposes this as a per-datasource
admin setting:

```ts
// PUT /datasources/:id/snowflake-config  body: { autoSuspendSec: 60 }
async function updateSnowflakeAutoSuspend(req, res) {
  const ds = await DatasourceS.findOne({ /* ... */ });
  if (ds.config.dbType !== 'snowflake') return sendResponse(res, false, 400, 'not_snowflake');
  const pool = await acquire(ds.config);
  await pool.query(`
    ALTER WAREHOUSE ${quoteIdentifier(ds.config.warehouse!)}
      SET AUTO_SUSPEND = ${Number(req.body.autoSuspendSec)}`);
  return sendResponse(res, true, 200, 'snowflake.warehouse.updated');
}
```

Defaults to 60 seconds — most aggressive setting Snowflake allows
without disabling auto-suspend entirely.

### 4.7 Cost rollups

```sql
CREATE TABLE cost_daily (
  organisation_id   uuid NOT NULL,
  datasource_id     uuid NOT NULL,
  user_id           uuid,
  day               date NOT NULL,
  queries           int NOT NULL,
  bytes_scanned     bigint,
  duration_ms       bigint,
  credits           numeric(12, 6),
  estimated_cost_usd numeric(12, 4) NOT NULL,
  PRIMARY KEY (organisation_id, datasource_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
);
CREATE INDEX cost_daily_org_day ON cost_daily (organisation_id, day DESC);
```

Rollup cron (5-min cadence so the dashboard is near-real-time):

```ts
async function rollupCostDaily() {
  const yesterday = subDays(new Date(), 1);
  await master_db_connection.query(`
    INSERT INTO cost_daily (
      organisation_id, datasource_id, user_id, day,
      queries, bytes_scanned, duration_ms, credits, estimated_cost_usd
    )
    SELECT
      organisation_id, datasource_id,
      COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      date_trunc('day', occurred_at)::date AS day,
      COUNT(*)              AS queries,
      SUM(bytes_scanned)    AS bytes_scanned,
      SUM(duration_ms)::bigint AS duration_ms,
      SUM(credits)          AS credits,
      SUM(estimated_cost_usd) AS estimated_cost_usd
    FROM query_execution_log
    WHERE occurred_at >= $1
    GROUP BY 1, 2, 3, 4
    ON CONFLICT (organisation_id, datasource_id, user_id, day)
    DO UPDATE SET
      queries = EXCLUDED.queries,
      bytes_scanned = EXCLUDED.bytes_scanned,
      duration_ms = EXCLUDED.duration_ms,
      credits = EXCLUDED.credits,
      estimated_cost_usd = EXCLUDED.estimated_cost_usd`,
    [yesterday]);
}
```

### 4.8 Forecast

ARIMA is heavy for a backend. Linear regression on the last 30
days is enough fidelity for budget alerts:

```ts
import * as ss from 'simple-statistics';

export async function forecastMonthlySpend(orgId: string): Promise<{
  projected: number;
  basedOnDays: number;
  daysRemaining: number;
}> {
  const last30 = await CostDaily.find({
    where: {
      organisationId: orgId,
      day: MoreThan(subDays(new Date(), 30)),
    },
    order: { day: 'ASC' },
  });

  if (last30.length < 7) {
    return { projected: 0, basedOnDays: last30.length, daysRemaining: 0 };
  }

  // Linear fit on (dayOffset, cumulativeSpend)
  const start = +last30[0].day;
  const points = last30.map((d, i) => [i, d.estimatedCostUsd] as [number, number]);
  const reg = ss.linearRegression(points);
  const fit = ss.linearRegressionLine(reg);

  // Project to month-end
  const today = new Date();
  const monthEnd = endOfMonth(today);
  const daysFromStart = differenceInDays(today, last30[0].day);
  const daysToEnd = differenceInDays(monthEnd, last30[0].day);

  // Sum the per-day expected spend from today to month-end
  let projected = 0;
  for (let d = daysFromStart; d <= daysToEnd; d++) {
    projected += Math.max(fit(d), 0);
  }

  return {
    projected,
    basedOnDays: last30.length,
    daysRemaining: differenceInDays(monthEnd, today),
  };
}
```

### 4.9 Cost reports

Built as a built-in dashboard backed by `cost_daily`. Pre-shipped
templates:

- **Cost by datasource** — bar chart over 30 days
- **Cost by user** — top-N over current month
- **Cost by surface** — what's costing most (dataset / analysis /
  dashboard / adhoc / ai)
- **Cost forecast** — line chart of actual + projected
- **Cache hit ratio** — % of queries served from cache (relate
  to module 05)
- **Expensive queries** — top 50 by individual cost

### 4.10 Cost attribution

Trace where the cost ultimately landed:

```sql
-- For a given dashboard render, attribute the cost to the
-- dashboard rather than the bare dataset query.
-- The query_execution_log already carries surface + surface_id.

-- "How much does this dashboard cost per render?"
SELECT
  AVG(estimated_cost_usd) AS avg_per_render,
  SUM(estimated_cost_usd) AS total_this_month,
  COUNT(*) AS renders
FROM query_execution_log
WHERE organisation_id = $1
  AND surface = 'dashboard'
  AND surface_id = $2
  AND occurred_at >= date_trunc('month', now());
```

The "Cost" tab on a dashboard page shows this — admins can spot
the $50/render dashboard and intervene.

### 4.11 Budget alerts

Reuses module 16's notification pipeline:

```ts
async function notifyBudgetThreshold(b: Budget, pct: number, spent: number) {
  // Audit
  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { budgetId: b.id, pct, spentUsd: spent, limitUsd: b.limitUsd },
  });

  // Emit webhook
  await eventBus.emit({
    type: 'budget.threshold_crossed',
    organisationId: b.organisationId,
    payload: { budgetId: b.id, scope: b.scope, scopeId: b.scopeId,
                pct, spentUsd: spent, limitUsd: b.limitUsd },
    actor: { type: 'service', id: 'cost-watcher' },
  });

  // Channel dispatch (alert_channels jsonb on budget)
  for (const ch of b.alertChannels as ChannelSpec[]) {
    await channelDispatcher.send({
      channel: ch,
      subject: `Budget ${b.scope} at ${pct}%`,
      bodyHtml: renderBudgetAlertHtml(b, pct, spent),
      sourceType: 'subscription',
      sourceId: b.id,
      organisationId: b.organisationId,
    });
  }
}
```

### 4.12 Cost-aware rate limiting

When a user is consistently expensive, slow them down before they
hit the hard cap:

```ts
async function maybeSlowdownExpensiveUser(orgId: string, userId: string) {
  // Look at last hour's spend by this user
  const recent = await master_db_connection.query(`
    SELECT SUM(estimated_cost_usd) AS spent
    FROM query_execution_log
    WHERE organisation_id = $1 AND user_id = $2
      AND occurred_at > now() - interval '1 hour'`,
    [orgId, userId]);

  const spent = Number(recent[0]?.spent ?? 0);
  if (spent > 50) {     // $50/hour soft threshold
    // Throttle this user's queries to 1/sec
    await redis.set(`cost-throttle:${userId}`, '1', 'EX', 3600);
  }
}
```

Query middleware checks the throttle flag and delays accordingly.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/cost/overview` | Org cost summary (today / this week / month / forecast) |
| GET | `/admin/cost/by-datasource` | Per-datasource breakdown |
| GET | `/admin/cost/by-user` | Top-N expensive users |
| GET | `/admin/cost/by-surface` | dataset/analysis/dashboard/adhoc |
| GET | `/admin/cost/queries` | Top 50 expensive queries with details |
| GET | `/admin/cost/forecast` | Projected month-end |
| GET | `/admin/budgets` | List budgets |
| POST | `/admin/budgets` | Create |
| PUT | `/admin/budgets/:id` | Update |
| DELETE | `/admin/budgets/:id` | Remove |
| POST | `/admin/budgets/:id/resume` | Resume after hard-limit pause |
| GET | `/admin/pricing-profile` | Org pricing config |
| PUT | `/admin/pricing-profile` | Update |
| POST | `/datasources/:id/snowflake-autosuspend` | Snowflake auto-suspend config |

## 6. FE specs

### 6.1 Cost dashboard

Admin → Cost & budgets:

```
Cost & budgets

  This month so far:           $1,247.83
  Projected month-end:         $3,891   (──[63%]─────)
  Last month:                  $4,205

  By datasource:
    Snowflake (prod-warehouse)   $987.12
    BigQuery (analytics)         $231.50
    Postgres (legacy-db)         $29.21

  By user (top 5):
    Sarah Lee     $342.10
    Bob Smith     $189.04
    Eng-Bot       $145.99
    Alice Chen    $122.50
    ...

  By surface:
    Dashboard renders   $612.10
    AI queries          $310.50
    Adhoc SQL           $189.00
    Dataset refresh     $136.23

  Active budgets:
    ⚠  Org total $5K/mo        $1,247 / $5,000  (25%)
    ✓  Snowflake $2K/mo        $987   / $2,000  (49%)
    ⚠  Sarah Lee $500/mo       $342   / $500    (68%)

  [+ Create budget]   [Configure pricing]
```

### 6.2 Per-dashboard cost panel

When viewing a dashboard, a "Cost" tab shows:

```
Cost (this dashboard)

  Avg per render:    $0.18
  Renders this week: 432
  Total this week:   $77.76

  Last 7 days:       [── line chart ──]

  Top contributing queries:
    SELECT FROM big_table WHERE ...   $0.12 avg
    SELECT FROM other ...             $0.06 avg

  Cache hit ratio:   71% (good)

  Suggestions:
   ▸ Add an analyses snapshot to reduce 312 renders/week
   ▸ A materialised view on big_table would cut $0.10 per render
```

### 4.7's idea (cost telemetry) closes the loop with module 25's
AI to offer optimisation suggestions.

### 6.3 Budget editor

```
Create budget

  Scope:        ◉ Organisation total
                ○ Specific datasource: [▾]
                ○ Specific user:       [▾]

  Period:       ◉ Month  ○ Week  ○ Day

  Limit:        $ [5000.00]

  Behaviour:    ☑ Alert at [50, 80, 100] % of limit
                ☑ Hard limit — block queries above 100%
                ☐ Auto-pause Snowflake warehouses on breach

  Alert channels:
                ☑ Email me (alice@acme.com)
                ☑ #cost-alerts (Slack)
                ☐ Webhook

  [Cancel]  [Create]
```

## 7. Validators

```ts
export const createBudgetSchema = z.object({
  scope: z.enum(['org','datasource','user']),
  scopeId: z.string().uuid().optional(),
  period: z.enum(['day','week','month']),
  limitUsd: z.number().min(1).max(1_000_000),
  hardLimit: z.boolean().default(false),
  autoPause: z.boolean().default(false),
  alertThresholdsPct: z.array(z.number().int().min(1).max(200)).default([50,80,100]),
  alertChannels: z.array(channelSpecSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.scope !== 'org' && !data.scopeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeId'],
      message: 'validation.budget.scopeId.required',
    });
  }
});

export const updatePricingProfileSchema = z.object({
  bigquery_usd_per_tib: z.number().min(0).max(100).optional(),
  snowflake_usd_per_credit: z.number().min(0).max(100).optional(),
  cpu_usd_per_hour: z.number().min(0).max(100).optional(),
  redshift_usd_per_node_hour: z.number().min(0).max(100).optional(),
});

export const updateSnowflakeAutosuspendSchema = z.object({
  autoSuspendSec: z.number().int().min(60).max(86400),
});
```

## 8. Test plan

```
CO-INST-H-01    BigQuery query writes bytesScanned to query_execution_log
CO-INST-H-02    Snowflake query writes credits (when QUERY_HISTORY catches up)
CO-INST-H-03    Postgres query writes durationMs
CO-INST-H-04    failed query writes status=error

CO-EST-H-01     BigQuery cost: 100 GiB → ~$0.625
CO-EST-H-02     Snowflake cost: 5 credits → $10 at $2/credit
CO-EST-H-03     Postgres cost: 1h → $0.20 at default cpu_usd_per_hour

CO-DRY-H-01     BigQuery dry-run returns bytes
CO-DRY-N-01     large query above threshold → 400 unless confirmExpensive=true

CO-BUDG-H-01    create budget → row in budget table
CO-BUDG-H-02    spend approaches 80% → alert sent once
CO-BUDG-H-03    spend crosses 100% with hard_limit → next query 400
CO-BUDG-H-04    hard limit + auto-pause → warehouse suspended
CO-BUDG-H-05    resume budget → unpause warehouse
CO-BUDG-N-01    budget scope=user without scopeId → 400

CO-ROLL-H-01    daily rollup aggregates query_execution_log
CO-ROLL-H-02    re-running rollup updates same day (idempotent)

CO-FCST-H-01    forecast based on 30 days returns projected
CO-FCST-N-01    < 7 days of data → returns basedOnDays only

CO-ATTR-H-01    dashboard cost endpoint sums queries with that surface_id
CO-ATTR-H-02    user cost endpoint includes all surfaces

CO-WH-EVENT-H-01 budget threshold crossed → webhook event 'budget.threshold_crossed' fires

CO-THROTTLE-H-01 user above hourly soft threshold → queries throttled

CO-PRICE-H-01   admin updates BigQuery rate → cost recalculated on next query
```

## 9. Migration & rollout

1. Phase 1 — `query_execution_log` table + `instrumentedExecute`
   wrapper applied to every datasource query.
2. Phase 2 — pricing profile + estimateCost.
3. Phase 3 — daily rollup + cost dashboard.
4. Phase 4 — BigQuery dry-run + threshold gate.
5. Phase 5 — budgets + enforcement + alerts.
6. Phase 6 — Snowflake auto-pause + auto-suspend config.
7. Phase 7 — forecast + per-dashboard cost panel.
8. Phase 8 — cost-aware throttling.

Per-org `enableCostObservability` flag (some customers don't want
the noise — defer until paid tier).

## 10. Open questions

- **Cost reconciliation with the vendor's actual bill**. Our
  estimate vs Snowflake's bill might drift; reconcile monthly via
  vendor billing API. Defer.
- **Per-query "I'm willing to spend $X" override**. Power-user
  feature — defer.
- **Cost as a metric in the semantic layer** ("show me cost by
  dashboard over time" via the AI). Eventually.
- **Optimal warehouse size selection**. Snowflake exposes
  `AUTO_SCALE`. We could recommend sizes based on query history.
  v2.
- **Multi-tier pricing**. Snowflake credits cost different
  amounts on different plans (Standard / Enterprise / Business
  Critical). Plan field on pricing_profile to capture this.
- **Reserved capacity** — committed credits vs on-demand. We
  treat each query as on-demand for estimation; document.

## 11. References

- BigQuery dry-run: <https://cloud.google.com/bigquery/docs/dry-run-queries>
- Snowflake `QUERY_HISTORY`: <https://docs.snowflake.com/en/sql-reference/account-usage/query_history>
- Snowflake `AUTO_SUSPEND`: <https://docs.snowflake.com/en/user-guide/warehouses-considerations#starting-suspending-resuming>
- Snowflake credits pricing: <https://www.snowflake.com/pricing/>
- simple-statistics (linear regression): <https://github.com/simple-statistics/simple-statistics>
- AWS Cost Explorer (concept): <https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html>

## Appendix · Review additions

- **Cost forecast** via 30-day linear regression — §4.8.
- **BigQuery dry-run** to estimate before executing — §4.3.
- **Snowflake auto-pause** on hard-limit breach — §4.5.
- **Pricing profile** admin-editable — §4.2.
- **Daily rollup table** for fast dashboards — §4.7.
- **Per-dashboard cost panel** — §6.2.
- **Cost-aware throttling** — §4.12.
- **Budget alerts** reusing module 16's channels — §4.11.
- **Webhook event** `budget.threshold_crossed` — §4.11.
