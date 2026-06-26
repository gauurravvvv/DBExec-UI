# Cost observability & budgets

> Implementation companion to research module 27. Pins
> per-query telemetry, pricing profiles, BigQuery dry-run
> cost estimation, budgets at org / datasource / user scope
> with auto-pause, and per-dashboard cost panel.

**Status:** 🔴 not in product.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

For warehouses with usage-based pricing (BigQuery, Snowflake,
Redshift Serverless, Athena, Databricks SQL serverless), the
DBExec query bill is a real risk. One bad dashboard at scale =
five-figure surprise on Friday.

The system needs to:

1. Log every query's resource use (bytes scanned, credits used).
2. Estimate cost from a configurable pricing profile.
3. Optionally dry-run before execute (BigQuery).
4. Enforce per-(org, datasource, user) budgets.
5. Auto-pause warehouses (Snowflake) on hard-limit breach.

---

## 1. Data model

```sql
CREATE TABLE query_execution_log (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL,
  user_id       UUID,
  datasource_id UUID NOT NULL,
  engine        TEXT NOT NULL,                          -- 'postgres' | 'bigquery' | 'snowflake' | …
  source_kind   TEXT NOT NULL,                          -- 'dashboard_tile' | 'analysis_preview' | 'export' | 'ai_tool' | …
  source_id     UUID,
  query_hash    TEXT NOT NULL,
  bytes_scanned BIGINT,
  bytes_returned BIGINT,
  duration_ms   INTEGER,
  credits_used  REAL,                                    -- Snowflake
  cost_usd      REAL,
  cache         BOOLEAN NOT NULL DEFAULT false,
  rls_rules_applied INTEGER,
  correlation_id TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qel_org_at ON query_execution_log(org_id, at DESC);
CREATE INDEX idx_qel_ds_at  ON query_execution_log(datasource_id, at DESC);
CREATE INDEX idx_qel_user_at ON query_execution_log(user_id, at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE pricing_profile (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organisation(id) ON DELETE CASCADE,   -- null = global default
  engine        TEXT NOT NULL,
  unit          TEXT NOT NULL,                          -- 'tb_scanned' | 'credit' | 'dpu_hour' | …
  unit_cost_usd REAL NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  scope_kind    TEXT NOT NULL CHECK (scope_kind IN ('org','datasource','user')),
  scope_id      UUID,
  period        TEXT NOT NULL CHECK (period IN ('day','week','month')),
  amount_usd    REAL NOT NULL,
  alert_threshold_pct REAL NOT NULL DEFAULT 80,
  hard_limit    BOOLEAN NOT NULL DEFAULT false,
  auto_pause_warehouse BOOLEAN NOT NULL DEFAULT false,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_state (
  budget_id     UUID NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  spent_usd     REAL NOT NULL DEFAULT 0,
  last_alert_at TIMESTAMPTZ,
  is_paused     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (budget_id, period_start)
);

CREATE TABLE cost_daily (
  org_id        UUID NOT NULL,
  datasource_id UUID,
  date          DATE NOT NULL,
  query_count   INTEGER NOT NULL,
  bytes_scanned BIGINT,
  credits_used  REAL,
  cost_usd      REAL,
  PRIMARY KEY (org_id, datasource_id, date)
);
```

---

## 2. Per-query telemetry

The query processor (module 04) emits a log row on every
execute. Cost computed from the latest pricing profile:

```typescript
export async function logQueryExecution(args: {
  orgId: string; userId?: string; datasourceId: string; engine: string;
  sourceKind: string; sourceId?: string; queryHash: string;
  bytesScanned?: number; bytesReturned?: number; durationMs: number;
  creditsUsed?: number; cache: boolean; rlsRulesApplied: number;
  correlationId?: string;
}): Promise<void> {
  const profile = await loadPricingProfile(args.orgId, args.engine);
  const cost = computeCost(args, profile);

  await connection.getRepository('QueryExecutionLog').save({
    ...args, costUsd: cost,
  });

  // Increment budgets
  await incrementBudgets(args.orgId, args.userId, args.datasourceId, cost);
}

function computeCost(args: any, profile: PricingProfile | null): number {
  if (!profile) return 0;
  if (profile.unit === 'tb_scanned') {
    return (args.bytesScanned ?? 0) / 1024 ** 4 * profile.unitCostUsd;
  }
  if (profile.unit === 'credit') {
    return (args.creditsUsed ?? 0) * profile.unitCostUsd;
  }
  return 0;
}
```

---

## 3. BigQuery dry-run

Before execute, optionally call BigQuery's dry-run to learn
`totalBytesProcessed`:

```typescript
import { BigQuery } from '@google-cloud/bigquery';

export async function bqDryRun(sql: string, params: any[], ds: Datasource): Promise<number> {
  const client = new BigQuery({ projectId: ds.config.projectId, credentials: ds.config.credentials });
  const [job] = await client.createQueryJob({
    query: sql, params,
    dryRun: true, useLegacySql: false,
  });
  const stats = job.metadata.statistics;
  return Number(stats.totalBytesProcessed ?? 0);
}
```

The execute path checks against a per-org "max bytes scanned
per query" threshold and refuses if exceeded:

```typescript
const bytes = await bqDryRun(sql, params, ds);
const cost = bytes / 1024 ** 4 * profile.unitCostUsd;

if (cost > org.maxQueryCostUsd) {
  throw new Error(`COST_THRESHOLD_EXCEEDED: ${cost.toFixed(2)} > ${org.maxQueryCostUsd}`);
}
```

Snowflake has no built-in dry-run; we estimate from
`SYSTEM$ESTIMATE_QUERY_ACCELERATION` for accelerated queries.

---

## 4. Budget enforcement

```typescript
export async function incrementBudgets(
  orgId: string, userId: string | undefined, datasourceId: string, costUsd: number,
): Promise<void> {
  if (costUsd <= 0) return;

  const budgets = await loadActiveBudgets(orgId, userId, datasourceId);
  for (const b of budgets) {
    const periodStart = startOfPeriod(b.period, new Date());
    const state = await upsertState(b.id, periodStart, costUsd);

    const usagePct = (state.spentUsd / b.amountUsd) * 100;

    if (usagePct >= b.alertThresholdPct && !state.lastAlertAt) {
      await notify({
        orgId, userId: b.createdBy, category: 'admin', severity: 'warning',
        title: `Budget ${b.id} at ${Math.round(usagePct)}%`,
        body: `$${state.spentUsd.toFixed(2)} of $${b.amountUsd} (${b.period})`,
        link: `/admin/quota#budget-${b.id}`,
      });
      await markAlerted(b.id, periodStart);
    }

    if (b.hardLimit && usagePct >= 100 && !state.isPaused) {
      await pauseBudget(b);
      await notify({
        orgId, userId: b.createdBy, category: 'admin', severity: 'critical',
        title: `Budget ${b.id} hard limit hit`,
        body: 'Queries paused. Adjust budget to resume.',
      });
    }
  }
}

async function pauseBudget(b: Budget): Promise<void> {
  await connection.getRepository('BudgetState').update(
    { budgetId: b.id, periodStart: startOfPeriod(b.period, new Date()) },
    { isPaused: true });
  if (b.autoPauseWarehouse && b.scopeKind === 'datasource') {
    await pauseSnowflakeWarehouse(b.scopeId!);
  }
}
```

The query processor checks budgets before execute:

```typescript
const paused = await isBudgetPaused(orgId, userId, datasourceId);
if (paused) throw new Error('BUDGET_PAUSED');
```

---

## 5. Snowflake warehouse auto-pause

```typescript
// src/services/cost/snowflakePause.ts
export async function pauseSnowflakeWarehouse(datasourceId: string): Promise<void> {
  const ds = await loadDatasourceWithConn(datasourceId);
  const pool = await getPool(ds.orgId, ds.connectionId);
  const wh = ds.config.warehouse;
  await pool.query(`ALTER WAREHOUSE "${wh}" SUSPEND`);
}
```

Resuming on budget reset or admin override fires
`ALTER WAREHOUSE … RESUME`.

---

## 6. Daily rollup + forecast

Cron at 02:00 UTC per region:

```typescript
export async function rollupCostDaily(date: Date): Promise<void> {
  await connection.query(`
    INSERT INTO cost_daily (org_id, datasource_id, date, query_count, bytes_scanned, credits_used, cost_usd)
    SELECT org_id, datasource_id, $1::date,
           COUNT(*), SUM(bytes_scanned), SUM(credits_used), SUM(cost_usd)
    FROM query_execution_log
    WHERE at >= $1::date AND at < ($1::date + INTERVAL '1 day')
    GROUP BY org_id, datasource_id
    ON CONFLICT (org_id, datasource_id, date) DO UPDATE
      SET query_count=EXCLUDED.query_count, bytes_scanned=EXCLUDED.bytes_scanned,
          credits_used=EXCLUDED.credits_used, cost_usd=EXCLUDED.cost_usd;
  `, [date.toISOString().slice(0, 10)]);
}
```

Forecast: 30-day linear regression on `cost_daily.cost_usd`,
projected to month-end. Shown in admin quota panel.

---

## 7. Per-dashboard cost panel

For any dashboard, show:

```
Cost (last 7 days)
  ┌────────────────────────────────────┐
  │     ▁▂▃▆▅▃▄  $42.18 total          │
  └────────────────────────────────────┘
  Top tiles by cost:
   1. Revenue heatmap      $18.20  ↑ 23%
   2. Cohort retention      $9.40   ↓  5%
   3. Conversion funnel     $6.10  ↑ 12%
   [show all 12]
```

Query joins `query_execution_log` filtered by
`source_kind='dashboard_tile'` and `source_id=<dashboardVisualId>`.

---

## 8. Controller — budget create

```typescript
// src/controllers/cost/createBudget.ts
const createBudget = async (req: Request, res: Response) => {
  const { scopeKind, scopeId, period, amountUsd, alertThresholdPct, hardLimit, autoPauseWarehouse } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    if (autoPauseWarehouse && scopeKind !== 'datasource') {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, COST_MSG.AUTO_PAUSE_DS_ONLY);
    }
    const b = await connection.getRepository('Budget').save({
      orgId: orgData.orgId, scopeKind, scopeId, period,
      amountUsd, alertThresholdPct: alertThresholdPct ?? 80,
      hardLimit: !!hardLimit, autoPauseWarehouse: !!autoPauseWarehouse,
      isEnabled: true, createdBy: loggedInId,
    });
    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.BUDGET, action: AUDIT_ACTIONS.CREATE,
      entityName: 'Budget', entityId: b.id,
      metadata: { scopeKind, period, amountUsd, hardLimit, autoPauseWarehouse },
    });
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, COST_MSG.OK, b);
  } catch (err: any) {
    Logger.error(`Create budget failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 9. Observability (of the cost system itself)

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_query_cost_usd_total` | counter | `org`, `engine` | running cost |
| `dbexec_query_bytes_scanned_total` | counter | `org`, `engine` | byte burn |
| `dbexec_budget_alert_total` | counter | `org`, `severity` | alerts |
| `dbexec_budget_paused_total` | counter | `org` | hard-limit fires |
| `dbexec_warehouse_paused_total` | counter | `org`, `datasource` | auto-pause |
| `dbexec_cost_dry_run_total` | counter | `engine`, `outcome` | dry-run reliability |
| `dbexec_cost_threshold_rejected_total` | counter | `engine` | pre-execute rejections |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| User runs many small queries to evade per-query threshold | Budget aggregates over period; threshold checked together |
| Adversarial dashboard to bankrupt org | Cap per dashboard tiles' frequency (refresh interval ≥ 30s); per-user concurrent-query cap |
| Manipulated pricing profile | Pricing profile edits audit-logged; super-admin only for global; org-admin only for org-level |
| Cost panel reveals query-text via hash | Hash is not reversible; details require entity-read perm |
| Auto-pause race | Two concurrent over-limit queries can both fire pause; idempotent (`SUSPEND` on already-suspended warehouse no-ops) |
| Snowflake account-level admin needed to pause | Service-account roles documented; orgs without granted role get a warning |

---

## 11. Runbook

**Symptom: budget keeps hitting.**
1. `cost_daily` shows which datasource. Look at top-cost
   dashboards/tiles via the per-dashboard panel.
2. Often: a stuck dashboard polling every 10s. Bump
   minimum refresh interval.

**Symptom: BigQuery dry-run estimates wildly off.**
1. Dry-run gives `totalBytesProcessed`; actual scan can be
   smaller (BQ optimisations). Treat as upper bound.

**Symptom: pause didn't fire.**
1. Permission missing on Snowflake service role:
   `GRANT OPERATE ON WAREHOUSE <wh> TO ROLE dbexec`. Document
   prerequisite at onboarding.

**Symptom: forecast looks crazy.**
1. Spike in one day skews linear regression. Filter outliers
   (drop top/bottom 5%); P50 forecast instead of linear.

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| logQueryExecution (write) | 5 ms | 20 ms | 100 ms |
| BudgetEnforcement (read + increment) | 3 ms | 15 ms | 50 ms |
| BigQuery dry-run | 200 ms | 1 s | 10 s |
| Daily rollup (1M rows) | 5 s | 30 s | 5 min |
| Cost panel render (1 dashboard) | 80 ms | 250 ms | 1 s |
| Forecast (per org) | 30 ms | 100 ms | 500 ms |

---

## 13. Migration & rollout

1. **Migrations:** `query_execution_log`, `pricing_profile`,
   `budget`, `budget_state`, `cost_daily`.
2. **Seed:** default pricing profiles per engine.
3. **Feature flag:** `feature.cost_observability`.
4. **First**: telemetry only (no enforcement). Soak 2 weeks.
5. **Then**: budgets + alerts (no hard limits).
6. **Then**: hard limits + auto-pause (opt-in per org).

---

## 14. Open questions

1. **Multi-tier pricing** — BQ has flat-rate & on-demand;
   Snowflake has standard/enterprise/etc. Profile model
   supports it but UI is rudimentary.
2. **Per-team budgeting** — group-scope budgets. Add as a
   scope_kind once groups have spending attribution.
3. **Anomaly detection on cost** — "this dashboard's cost
   doubled overnight". Tap module 25 anomaly detector.

---

## 15. References

- [27-cost-observability.md](../research/modules/27-cost-observability.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- BigQuery pricing + dry-run docs
- Snowflake `SYSTEM$ESTIMATE_QUERY_ACCELERATION`
- Snowflake `ALTER WAREHOUSE SUSPEND/RESUME`
