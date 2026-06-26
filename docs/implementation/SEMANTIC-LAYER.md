# Semantic layer

> Implementation companion to research module 02 (Semantic Layer).
> The semantic layer is the *missing middle* in DBExec today: the
> place where business definitions live so every analyst, alert,
> and AI tool computes the same numbers the same way. This doc
> pins exactly what to ship, in what order, with what code.

**Status:** 🔴 not in product. P0 — every other build (06, 11, 25)
depends on this.
**Effort:** L (~4 weeks for one engineer).

---

## 0. Problem statement

Today, two analysts on the same dataset both write
`SUM(amount)` for "revenue". One forgets to filter
`status = 'paid'`. The dashboards diverge by 12%. A week of
finance time goes into reconciliation. This is the bug a
semantic layer prevents.

**What we will ship:**

- A first-class `semantic_model` entity (named, versioned,
  owned by a team, scoped to one or more datasets).
- Reusable building blocks: entity, dimension, metric, segment,
  join.
- A compiler step that takes a *semantic intent* (chose metrics
  + dimensions + filters) and emits canonical SQL.
- A FE author UI to build/edit the model.
- A linter that catches the common mistakes (metric without
  filter, ambiguous join path, non-additive metric used in a
  context it shouldn't be).

**What we will NOT ship in v1:**

- Lookml-equivalent inheritance / extends. Defer.
- Multi-fact handling (Looker's "symmetric aggregates"). Defer.
- Computed dimensions in SQL templates beyond simple
  expressions. Defer.

---

## 1. Data model

Seven entities. All in the org / shared DB.

### 1.1 `semantic_model`

```sql
CREATE TABLE semantic_model (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  primary_dataset_id UUID NOT NULL REFERENCES dataset(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES "user"(id),
  status        TEXT NOT NULL DEFAULT 'draft'      -- 'draft' | 'published' | 'archived'
                  CHECK (status IN ('draft', 'published', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_sem_model_slug ON semantic_model(slug);
```

### 1.2 `sem_entity` (one row per logical table in the model)

```sql
CREATE TABLE sem_entity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                     -- 'orders'
  dataset_id    UUID NOT NULL REFERENCES dataset(id),
  primary_key   TEXT NOT NULL,                     -- 'order_id' (column on dataset)
  is_primary    BOOLEAN NOT NULL DEFAULT false,    -- exactly one per model
  description   TEXT
);

CREATE UNIQUE INDEX uq_sem_entity_name ON sem_entity(model_id, name);
CREATE INDEX idx_sem_entity_model ON sem_entity(model_id);
```

### 1.3 `sem_join` (declared joinability between entities)

```sql
CREATE TABLE sem_join (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  left_entity   UUID NOT NULL REFERENCES sem_entity(id),
  right_entity  UUID NOT NULL REFERENCES sem_entity(id),
  kind          TEXT NOT NULL                      -- 'inner' | 'left' | 'one_to_many' (semantic, not SQL)
                  CHECK (kind IN ('inner', 'left', 'one_to_many')),
  on_expr       TEXT NOT NULL,                     -- 'orders.customer_id = customers.id'
  CHECK (left_entity <> right_entity)
);

CREATE INDEX idx_sem_join_model ON sem_join(model_id);
```

### 1.4 `sem_dimension`

```sql
CREATE TABLE sem_dimension (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES sem_entity(id),
  name          TEXT NOT NULL,                     -- 'region'
  label         TEXT NOT NULL,                     -- 'Region'
  type          TEXT NOT NULL                      -- 'string' | 'number' | 'date' | 'timestamp' | 'boolean'
                  CHECK (type IN ('string', 'number', 'date', 'timestamp', 'boolean')),
  expr          TEXT NOT NULL,                     -- column name OR a SQL expr (e.g. 'LOWER(region)')
  description   TEXT,
  is_hidden     BOOLEAN NOT NULL DEFAULT false,
  is_pii        BOOLEAN NOT NULL DEFAULT false,
  cardinality_hint INTEGER                          -- approximate distinct count, used for chart-pick heuristic
);

CREATE UNIQUE INDEX uq_sem_dim_name ON sem_dimension(model_id, name);
CREATE INDEX idx_sem_dim_entity ON sem_dimension(entity_id);
```

### 1.5 `sem_metric`

```sql
CREATE TABLE sem_metric (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                     -- 'revenue'
  label         TEXT NOT NULL,                     -- 'Revenue'
  kind          TEXT NOT NULL                      -- 9 kinds, see module 11
                  CHECK (kind IN ('simple', 'ratio', 'derived', 'cumulative',
                                  'conversion', 'prior_period', 'window',
                                  'percentile', 'approx_distinct')),
  expr          JSONB NOT NULL,                    -- kind-specific shape (see §1.7)
  entity_id     UUID REFERENCES sem_entity(id),    -- additivity scope; NULL = derived-only metric
  format        TEXT NOT NULL DEFAULT 'number',    -- 'number' | 'currency' | 'percent' | 'duration'
  format_args   JSONB,                              -- e.g. {decimals:2, currencyCode:'USD'}
  description   TEXT,
  is_hidden     BOOLEAN NOT NULL DEFAULT false,
  additive_along JSONB,                             -- ['time','region']: dims along which this is additive
  non_additive_along JSONB                          -- dims along which this is NOT additive
);

CREATE UNIQUE INDEX uq_sem_metric_name ON sem_metric(model_id, name);
```

### 1.6 `sem_segment` (reusable named WHERE clause)

```sql
CREATE TABLE sem_segment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                     -- 'paid_orders'
  label         TEXT NOT NULL,
  expr          TEXT NOT NULL,                     -- 'orders.status = ''paid'''
  description   TEXT,
  is_required   BOOLEAN NOT NULL DEFAULT false     -- if true, always applied
);

CREATE UNIQUE INDEX uq_sem_segment_name ON sem_segment(model_id, name);
```

### 1.7 `sem_metric.expr` shape (per kind)

```jsonc
// simple
{ "agg": "sum", "column": "amount" }

// ratio — two parts, division at result time
{
  "numerator":   { "agg": "sum", "column": "discount" },
  "denominator": { "agg": "sum", "column": "amount" }
}

// derived — formula over other metrics
{
  "formula": "{revenue} - {cost}",
  "deps":    ["revenue", "cost"]
}

// cumulative — running total over time dim
{ "agg": "sum", "column": "amount", "windowOver": "day_dim" }

// conversion — funnel rate
{
  "from": "step_1_event",
  "to":   "step_2_event",
  "withinHours": 24
}

// prior_period — comparison
{
  "base":   "revenue",
  "period": "year"
}

// window — generic OLAP frame
{
  "agg": "avg",
  "column": "amount",
  "windowOver": "day_dim",
  "frame": { "preceding": 6, "following": 0 }
}

// percentile
{ "column": "duration_ms", "p": 0.95, "method": "discrete" }

// approx_distinct
{ "column": "user_id", "method": "hll" }
```

### 1.8 Versioning

Reuses module 18 (Versioning) — every save creates a
`semantic_model_version` row with a JSON snapshot. Rollback is a
`POST /version/rollback/:versionId`.

---

## 2. API surface

```
POST   /semantic-model/add
GET    /semantic-model/get/:orgId/:id
GET    /semantic-model/list/:orgId
PATCH  /semantic-model/update/:id
DELETE /semantic-model/delete/:id
POST   /semantic-model/:id/publish
POST   /semantic-model/:id/archive

POST   /semantic-model/:id/dimension/add
PATCH  /semantic-model/:id/dimension/:dimId
DELETE /semantic-model/:id/dimension/:dimId
POST   /semantic-model/:id/metric/add
PATCH  /semantic-model/:id/metric/:metricId
DELETE /semantic-model/:id/metric/:metricId
POST   /semantic-model/:id/entity/add
POST   /semantic-model/:id/join/add
POST   /semantic-model/:id/segment/add

POST   /semantic-model/:id/lint          -- run all validators, return issues list
POST   /semantic-model/:id/compile-intent -- compile a SemanticIntent → SQL (preview)
GET    /semantic-model/:id/preview/:dimensionId?search=foo  -- distinct values
```

All payloads validated with Zod (referenced in the per-route
validation middleware).

---

## 3. The compiler (the heart of this module)

`src/services/semantic/semanticCompiler.ts`. Pure function.

```typescript
import { SemanticModel, SemanticIntent, Dialect } from './types';
import { resolveJoinPath } from './joinPathSolver';
import { renderDimensionExpr, renderMetricExpr } from './exprRenderer';
import { applyRls } from './rlsHook';

export interface CompiledQuery {
  sql:        string;
  params:     Array<{ name: string; value: unknown }>;
  selectMap:  Record<string, string>;  // alias → original metric/dim name
  warnings:   Array<{ code: string; message: string }>;
}

export async function compileIntent(
  model: SemanticModel,
  intent: SemanticIntent,
  ctx: { dialect: Dialect; user: AuthUser; preview?: boolean },
): Promise<CompiledQuery> {
  const warnings: CompiledQuery['warnings'] = [];

  // 1. Resolve entities referenced
  const usedDims    = intent.dimensions.map(d => findDim(model, d.dimensionId));
  const usedMetrics = intent.metrics.map(m => findMetric(model, m.metricId));
  const usedFilters = intent.filters.map(f => findDim(model, f.dimensionId));
  const allRefs = [...usedDims, ...usedFilters].map(d => d.entityId)
                  .concat(usedMetrics.map(m => m.entityId).filter(Boolean));

  const entities = uniqueEntities(model, allRefs);

  // 2. Determine join path
  const joinPath = resolveJoinPath(model, entities);
  if (joinPath.ambiguous) {
    warnings.push({ code: 'AMBIGUOUS_JOIN', message: joinPath.reason });
  }

  // 3. Render SELECT
  const selectParts: string[] = [];
  const selectMap: Record<string, string> = {};
  usedDims.forEach((d, i) => {
    const alias = `dim_${i}`;
    selectParts.push(`${renderDimensionExpr(d, intent.dimensions[i].bucket)} AS "${alias}"`);
    selectMap[alias] = d.name;
  });
  usedMetrics.forEach((m, i) => {
    const alias = `met_${i}`;
    selectParts.push(`${renderMetricExpr(m, ctx.dialect)} AS "${alias}"`);
    selectMap[alias] = m.name;
  });

  // 4. Render FROM with join path
  const fromClause = renderFrom(joinPath, ctx.dialect);

  // 5. Render WHERE
  const whereParts: string[] = [];
  for (const f of intent.filters) {
    whereParts.push(renderFilter(f, model, ctx.dialect));
  }
  for (const seg of intent.segmentIds ?? []) {
    whereParts.push(`(${findSegment(model, seg).expr})`);
  }
  // Always-applied required segments
  for (const seg of model.segments.filter(s => s.is_required)) {
    whereParts.push(`(${seg.expr})`);
  }
  // RLS hook
  const rls = await applyRls(model, ctx.user);
  if (rls.predicate) whereParts.push(rls.predicate);

  // 6. Render GROUP BY (every dim that isn't aggregated)
  const groupByParts = usedDims.map((_, i) => `"dim_${i}"`);

  // 7. Render ORDER BY
  const orderByParts = (intent.orderBy ?? []).map(o => `"${o.field}" ${o.dir.toUpperCase()}`);

  // 8. Additivity check
  for (const m of usedMetrics) {
    const dims = intent.dimensions.map(d => findDim(model, d.dimensionId).name);
    if (m.non_additive_along?.some((nd: string) => dims.includes(nd))) {
      warnings.push({
        code: 'NON_ADDITIVE_USE',
        message: `Metric '${m.name}' is non-additive along ${m.non_additive_along.join(',')}; result may be incorrect`,
      });
    }
  }

  // 9. Assemble
  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${fromClause}`,
    whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    groupByParts.length ? `GROUP BY ${groupByParts.join(', ')}` : '',
    orderByParts.length ? `ORDER BY ${orderByParts.join(', ')}` : '',
    intent.limit ? `LIMIT ${intent.limit}` : '',
  ].filter(Boolean).join('\n');

  return { sql, params: rls.params ?? [], selectMap, warnings };
}
```

The compiler **never** receives raw column names from a user. It
receives semantic IDs which it resolves through the model. That's
how SQL injection is impossible-by-design.

---

## 4. Linter

Runs on `POST /lint` and on every save. Returns an array of
issues with `severity` (`error`, `warning`, `info`).

| Rule | Severity | Description |
|---|---|---|
| `entity_no_primary` | error | At least one entity must have `is_primary = true` |
| `duplicate_dim_name` | error | Two dimensions can't share `(model, name)` |
| `metric_unknown_column` | error | Metric `expr.column` must exist on the entity's dataset |
| `metric_unknown_dep` | error | Derived metric's `deps` must reference real metric names |
| `join_no_path` | error | Required entity not reachable from primary entity by declared joins |
| `join_ambiguous` | warning | Two valid paths between same entities |
| `non_additive_missing_along` | warning | Non-additive metric must declare its non-additive dims |
| `pii_dim_no_mask` | warning | PII dimension referenced but no column mask in module 09 |
| `unused_entity` | info | Entity declared but not referenced by any dim/metric |
| `circular_derived` | error | Derived metric depends on itself transitively |
| `expr_unparseable` | error | `expr` field doesn't parse as an expression in the configured dialect |

---

## 5. Controller stub (publish)

```typescript
// src/controllers/semantic/publishSemanticModel.ts
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { SEMANTIC_MSG, GENERIC } from '../../constants/response.messages';
import { auditLogger } from '../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../constants/audit.constants';
import { lintModel } from '../../services/semantic/linter';
import { saveModelVersion } from '../../services/versioning/saveModelVersion';
import Logger from '../../utility/logger';

const publishSemanticModel = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    const model = await loadFullModel(connection, id);
    if (!model) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.NOT_FOUND, SEMANTIC_MSG.NOT_FOUND);
    }

    // Lint must be clean of errors (warnings allowed)
    const lintResult = await lintModel(connection, model);
    const errors = lintResult.issues.filter(i => i.severity === 'error');
    if (errors.length) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST,
        SEMANTIC_MSG.LINT_FAILED, { errors });
    }

    await connection.transaction(async (tx: any) => {
      // Snapshot version
      await saveModelVersion(tx, model, { actorUserId: loggedInId });
      // Flip status
      await tx.getRepository('SemanticModel').update(
        { id }, { status: 'published', updatedAt: new Date() });
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.SEMANTIC_MODEL,
      action: AUDIT_ACTIONS.PUBLISH,
      entityName: 'SemanticModel',
      entityId: id,
      metadata: { warnings: lintResult.issues.filter(i => i.severity === 'warning') },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, SEMANTIC_MSG.PUBLISHED);
  } catch (err: any) {
    Logger.error(`Publish semantic model failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default publishSemanticModel;
```

---

## 6. FE — author UI

A new top-level route `/app/semantic/...` with three panels:

```
┌──────────────┬──────────────────────────────┬─────────────────┐
│ Entities     │  Selected: orders            │ Inspector       │
│  ✓ orders    │   ┌────────────────────────┐ │  Metric Editor  │
│  ✓ customers │   │ Dimensions             │ │  -------------- │
│  + entity    │   │  • status              │ │  Name: revenue  │
│              │   │  • region              │ │  Kind: simple   │
│ Joins        │   │  • signup_month        │ │  Agg:  sum      │
│ orders ↔ cu… │   │  + dimension           │ │  Col:  amount   │
│ + join       │   │                        │ │                 │
│              │   │ Metrics                │ │  Additive along:│
│ Segments     │   │  • revenue (sum)       │ │   ✓ time        │
│  paid_orders │   │  • orders_count (cnt)  │ │   ✓ region      │
│  + segment   │   │  • aov (ratio)         │ │   ✗ status      │
│              │   │  + metric              │ │                 │
│              │   │                        │ │  [Save]  [Test] │
│              │   │ Segments               │ │                 │
│              │   │  • paid_orders         │ │  Test compile:  │
│              │   └────────────────────────┘ │   SELECT SUM(a…)│
└──────────────┴──────────────────────────────┴─────────────────┘
       [Lint: 0 errors, 2 warnings]       [Publish]
```

Component breakdown:

```
src/app/modules/semantic/
├── components/
│   ├── semantic-editor/          # top-level shell
│   ├── entity-panel/             # left list
│   ├── entity-detail/            # centre
│   ├── dimension-editor/         # right inspector when dim selected
│   ├── metric-editor/            # right inspector when metric selected
│   ├── join-editor/              # modal
│   ├── segment-editor/           # modal
│   ├── compile-preview/          # SQL preview, run "test"
│   ├── lint-panel/               # bottom bar
│   └── publish-modal/            # confirm + show warnings
├── services/
│   ├── semantic.service.ts       # HTTP
│   ├── semantic-state.service.ts # signal-based state (RxJS Subject)
│   └── compile-preview.service.ts
└── models/
    ├── semantic-model.model.ts
    ├── semantic-intent.model.ts
    └── lint-issue.model.ts
```

`semantic-state.service.ts` skeleton:

```typescript
import { Injectable, signal, computed } from '@angular/core';
import { SemanticModel, Dimension, Metric } from '../models';

@Injectable({ providedIn: 'root' })
export class SemanticStateService {
  private _model = signal<SemanticModel | null>(null);
  private _selected = signal<{ kind: 'dim' | 'metric' | 'join' | 'segment'; id: string } | null>(null);
  private _dirty = signal(false);
  private _lintIssues = signal<LintIssue[]>([]);

  readonly model = this._model.asReadonly();
  readonly selected = this._selected.asReadonly();
  readonly dirty = this._dirty.asReadonly();
  readonly lintIssues = this._lintIssues.asReadonly();
  readonly errorCount = computed(() =>
    this._lintIssues().filter(i => i.severity === 'error').length);
  readonly canPublish = computed(() => this.errorCount() === 0 && !this._dirty());

  load(m: SemanticModel): void { this._model.set(m); this._dirty.set(false); }
  select(s: typeof this._selected extends signal<infer T> ? T : never): void { this._selected.set(s); }
  patchDimension(id: string, patch: Partial<Dimension>): void { /* … */ this._dirty.set(true); }
  patchMetric(id: string, patch: Partial<Metric>): void { /* … */ this._dirty.set(true); }
}
```

---

## 7. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_semantic_compile_total` | counter | `org`, `model`, `outcome` | compile attempts |
| `dbexec_semantic_compile_ms` | histogram | `model` | compile latency |
| `dbexec_semantic_lint_issue_total` | counter | `rule`, `severity` | which rules fire — leading indicator of teaching gaps |
| `dbexec_semantic_models_published` | gauge | `org` | currently-published count per org |
| `dbexec_semantic_intent_warnings_total` | counter | `code` | per warning kind (NON_ADDITIVE_USE etc.) |

Structured log on compile:

```json
{
  "evt": "semantic.compile",
  "model_id": "sm_abc",
  "user_id": "u_xyz",
  "dialect": "postgres",
  "metric_count": 2,
  "dim_count": 3,
  "filter_count": 4,
  "compile_ms": 14,
  "warnings": ["NON_ADDITIVE_USE"]
}
```

---

## 8. Security & threat model

| Threat | Mitigation |
|---|---|
| SQL injection via dimension `expr` (author-controlled) | `expr` parsed against an AST whitelist on save; only column refs + a defined set of functions (LOWER, COALESCE, CAST, …) allowed. Any unknown identifier rejected. |
| Author exposes a PII column via a derived dimension | PII dims tagged at the entity dataset (module 09); compiler refuses to render in a context where the user lacks the masking role |
| Cross-org model reference | `model_id` joins always scoped by `org_id`; cross-org dim/metric IDs simply don't resolve |
| Linter bypass via direct entity edit | Publish always reruns lint server-side; lint state at FE is advisory only |
| Metric formula `eval` injection | Derived metric formulas parsed by a custom expression parser (no `eval`, no `new Function`) |
| RLS bypass via segment | Segments are appended to WHERE; they CANNOT shorten an RLS predicate, only add to it. Documented and tested |
| Model used after dataset deleted | `dataset_id` ON DELETE RESTRICT; deleting a dataset that backs a published model is rejected with the dependency list |

---

## 9. Operational runbook

**Symptom: published model returns wrong numbers for one metric.**
1. Open the model in author mode, click the metric, hit "Test compile".
2. Inspect the SELECT clause. Mismatch usually = wrong `agg` or
   missing required segment.
3. If the SQL looks right, run against the source DB directly —
   the issue may be source data.

**Symptom: compile times spike.**
1. Check `dbexec_semantic_compile_ms` p99 by `model`. The model
   with the largest join graph is usually the offender.
2. The join-path solver is BFS; deep graphs slow it. Add a
   `join_path_hint` on the model that pins the canonical path.

**Symptom: linter false-positives.**
1. Lint rules are versioned. Roll forward by editing
   `src/services/semantic/linter/<rule>.ts` and bumping
   `LINTER_VERSION` so older saved warnings are recomputed.

---

## 10. Performance budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Lint full model (50 dims, 30 metrics) | 80 ms | 250 ms | 1 s |
| Compile a single intent (5 dims, 3 metrics) | 12 ms | 40 ms | 200 ms |
| Save model (all entities + dims + metrics) | 250 ms | 800 ms | 3 s |
| Publish (lint + version snapshot + flip status) | 400 ms | 1.2 s | 5 s |
| Distinct-value preview (per dim) | 200 ms | 1 s | 5 s |

Compile time matters because it's on the hot path of every
analysis run, every dashboard tile load, every AI tool call.
40ms p95 is the bar.

---

## 11. Migration & rollout

1. **Migration:** create the 6 tables (`semantic_model`,
   `sem_entity`, `sem_join`, `sem_dimension`, `sem_metric`,
   `sem_segment`). Idempotent.
2. **No backfill** — semantic models start empty per org.
3. **Feature flag:** `feature.semantic_layer`. Gates the FE
   route + the API endpoints.
4. **Auto-import flow** (P1, ship after the FE author UI is
   stable): a one-button "Import from dataset" that infers an
   entity + dimensions + a few simple-sum/count metrics from a
   dataset. Reduces author friction from hours to minutes.
5. **Soak:** internal org first. Then design partners. Then GA.
6. **Removal of the flag** ties to module 06 (analysis builder)
   consuming the semantic model — that's the integration the
   user actually sees.

---

## 12. Open questions

1. **Multi-fact models** — when "orders" and "events" both
   exist and an analyst wants both metrics. v1: separate
   models. v2: symmetric aggregates a la Looker.
2. **Time-grain shifting** — should the compiler auto-shift a
   monthly metric to a daily query if the dim asks for it?
   Defer; complex and error-prone. Force the author to declare
   per-grain metrics explicitly.
3. **Caching layer integration** — the cache key (module 05)
   must include the model version. Open how aggressively to
   invalidate on model edits.

---

## 13. References

- [02-semantic-layer.md](../research/modules/02-semantic-layer.md)
- [04-query-processor.md](../research/modules/04-query-processor.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [11-aggregation-metrics.md](../research/modules/11-aggregation-metrics.md)
- [18-versioning-lineage.md](../research/modules/18-versioning-lineage.md)
- dbt MetricFlow docs (kind taxonomy reference)
- Looker LookML reference (entity/join model)
