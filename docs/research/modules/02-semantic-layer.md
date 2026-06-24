# 02 · Semantic Layer

> The biggest gap in DBExec today. Every modern BI tool defines
> metrics, dimensions, and entities **once** and reuses them
> everywhere. DBExec stores raw SQL per dataset.

**Depends on:** Datasource (01), Dataset (03)
**Unblocks:** Query Compiler (04), Aggregations (11), Filters (07),
Drill (07), AI Q&A (25), Aggregate Awareness (cache 05)
**DBExec maturity:** 🔴 partial. Calc fields exist. Metric/dimension
typing, entities, joins do not.

---

## 0. Context

In Looker, a typical analyst experience:

```yaml
# In a .view.lkml file
view: orders {
  sql_table_name: ecommerce.orders
  measure: revenue {
    type: sum
    sql: ${TABLE}.revenue ;;
    value_format: "$#,##0"
  }
  dimension: region {
    type: string
    sql: ${TABLE}.region ;;
  }
  dimension_group: created {
    type: time
    timeframes: [date, week, month, quarter, year]
    sql: ${TABLE}.created_at ;;
  }
}
```

An end-user just picks `revenue` + `region` + `created_month` from a
dropdown. The compiler emits SQL.

DBExec currently asks the user to write the SQL. Every reporting tool
fixes this with a semantic layer.

## 1. Industry baseline

| Tool | Schema language | Primitives | Storage |
|---|---|---|---|
| Looker | LookML | view, dimension, measure, explore | Git repo |
| dbt Labs | YAML (MetricFlow) | semantic_model, entity, dimension, metric | dbt project |
| Cube | JavaScript / YAML | cube, dimension, measure, segment | code |
| Metabase | JSON | model, field, metric, segment | DB |
| Superset | Python objects | SqlaTable, SqlMetric, TableColumn | DB |
| Power BI | DAX | tables, columns, measures, relationships | model files |

**Common ground**:

- **Entity / Model** — a logical table, with join keys.
- **Dimension** — column to group by; typed.
- **Metric / Measure** — aggregation; has expression + agg function.
- **Filter / Segment** — reusable predicate.
- **Join** — declared between entities, used by compiler.
- **Time grain** — special dimension family (day/week/month/...).

DBExec should adopt the same vocabulary.

## 2. DBExec today

| Concept | DBExec | File |
|---|---|---|
| Logical table | `Dataset` (single SQL) | `shared/db/shared_entity/dataset.entity.ts` |
| Field metadata | `DatasetField` (calc fields only) | `shared_entity/dataset_field.entity.ts` |
| Metric / measure | ❌ | — |
| Dimension typing | ❌ (everything is "column") | — |
| Entity / join keys | ❌ | — |
| Time grain | ❌ | — |
| Reusable filter / segment | 🟡 (per analysis only) | `analysis_filter` |
| Join declarations | ❌ (must inline in SQL) | — |

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| SEM-G01 | Schema for `semantic_model`, `entity`, `dimension`, `metric` | P0 |
| SEM-G02 | TypeScript compiler that consumes the schema | P0 |
| SEM-G03 | UI editor for semantic models (visual, not YAML) | P0 |
| SEM-G04 | Filter/segment reuse across analyses | P1 |
| SEM-G05 | Joins between datasets | P1 |
| SEM-G06 | Derived/ratio/cumulative/conversion metric types | P1 |
| SEM-G07 | Aggregate-aware metric routing (see cache 05) | P1 |
| SEM-G08 | Optional YAML export for git-friendly review | P2 |
| SEM-G09 | dbt MetricFlow import (one-shot adapter) | P2 |

## 4. Target architecture

### 4.1 Data model

```
                ┌─────────────────────────┐
                │  SemanticModel          │
                │  - dataset_id           │
                │  - name, description    │
                │  - primary_entity       │
                │  - default_time_column  │
                └─────────┬───────────────┘
                          │ 1:N
        ┌─────────────────┼────────────────┐
        │                 │                │
   ┌────▼──┐         ┌────▼─────┐    ┌────▼──┐
   │Entity │         │Dimension │    │ Metric│
   │       │         │          │    │       │
   └───┬───┘         └──────────┘    └───────┘
       │
       │ 1:N
   ┌───▼────────┐
   │ EntityJoin │
   │ - to_model │
   │ - on       │
   └────────────┘
```

### 4.2 Compiler integration

```
User picks metric=revenue, dim=region, time=month, filter=region IN ('APAC')

         │
         ▼
┌────────────────────────────┐
│ SemanticCompiler.compile() │
│                            │
│  resolve metric & dim refs │
│  build AST                 │
│  inject RLS predicates     │
│  pick base or aggregate    │
│  print dialect SQL         │
└──────────┬─────────────────┘
           │
           ▼
       SQL → connection pool → rows → cache → response
```

## 5. Schemas + migrations

### 5.1 semantic-model.sql

```sql
BEGIN;

CREATE TABLE semantic_model (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  dataset_id      uuid NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  description     text,
  primary_entity  varchar(128),
  default_time_column varchar(128),
  created_by      uuid NOT NULL,
  created_on      timestamptz NOT NULL DEFAULT now(),
  updated_on      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, dataset_id, name)
);

CREATE TABLE sem_entity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  type            varchar(16) NOT NULL,           -- primary | foreign | unique
  column_name     varchar(128) NOT NULL,
  UNIQUE (semantic_model_id, name)
);

CREATE TABLE sem_dimension (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  type            varchar(16) NOT NULL,           -- string | numeric | time | bool | geo
  expression      text NOT NULL,
  time_grain      varchar(16),                    -- day|week|month|quarter|year (type=time)
  label           varchar(128),
  format          varchar(32),                    -- 'currency', 'percent', 'date', ...
  description     text,
  hidden          boolean NOT NULL DEFAULT false,
  UNIQUE (semantic_model_id, name)
);

CREATE TABLE sem_metric (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  kind            varchar(16) NOT NULL,           -- simple | ratio | derived | cumulative | conversion
  expression      text NOT NULL,
  agg             varchar(16),                    -- sum|count|count_distinct|avg|min|max|...
  filter          text,
  numerator_id    uuid REFERENCES sem_metric(id),  -- for ratio metrics
  denominator_id  uuid REFERENCES sem_metric(id),
  window          varchar(32),                    -- '7d', '30d', 'mtd' — for cumulative
  conversion      jsonb,                          -- { event_a, event_b, within_days } — conversion
  label           varchar(128),
  format          varchar(32),
  description     text,
  hidden          boolean NOT NULL DEFAULT false,
  UNIQUE (semantic_model_id, name)
);

CREATE TABLE sem_segment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  expression      text NOT NULL,                  -- reusable WHERE predicate
  description     text,
  UNIQUE (semantic_model_id, name)
);

CREATE TABLE sem_entity_join (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_model_id   uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  to_model_id     uuid NOT NULL REFERENCES semantic_model(id) ON DELETE CASCADE,
  type            varchar(16) NOT NULL,           -- many_to_one | one_to_many | one_to_one
  on_expression   text NOT NULL,                  -- '${from}.user_id = ${to}.id'
  relationship    varchar(64),                    -- 'belongs_to', 'has_many', ...
  is_required     boolean NOT NULL DEFAULT false
);

CREATE INDEX ON semantic_model (organisation_id, dataset_id);
CREATE INDEX ON sem_dimension (semantic_model_id);
CREATE INDEX ON sem_metric (semantic_model_id);

COMMIT;
```

## 6. APIs

### 6.1 CRUD endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/semantic-model` | Create |
| GET  | `/semantic-model/list/:datasetId` | List for dataset |
| GET  | `/semantic-model/:id` | Get with all children |
| PUT  | `/semantic-model/:id` | Update model metadata |
| DELETE | `/semantic-model/:id` | Delete |
| POST | `/semantic-model/:id/dimension` | Add dimension |
| PUT  | `/semantic-model/:id/dimension/:dimId` | Update |
| DELETE | `/semantic-model/:id/dimension/:dimId` | Delete |
| POST | `/semantic-model/:id/metric` | Add metric |
| PUT  | `/semantic-model/:id/metric/:metricId` | Update |
| DELETE | `/semantic-model/:id/metric/:metricId` | Delete |
| POST | `/semantic-model/:id/validate` | Static validation |
| POST | `/semantic/query` | Run a semantic query (separate from CRUD) |
| POST | `/semantic-model/import-dbt` | Import dbt MetricFlow YAML |
| GET  | `/semantic-model/:id/export-yaml` | YAML export |

### 6.2 Semantic-query endpoint

```ts
// POST /semantic/query
interface SemanticQueryRequest {
  semanticModelId: string;
  metrics:     string[];        // metric names
  dimensions:  string[];        // dimension names
  filters:     FilterClause[];
  segments?:   string[];        // segment names to apply
  orderBy?:    { field: string; dir: 'asc' | 'desc' }[];
  limit?:      number;
  offset?:     number;
  timeRange?:  { dim: string; from: string; to: string };
}

interface SemanticQueryResponse {
  columns: { name: string; type: string; format?: string }[];
  rows:    Record<string, unknown>[];
  meta: {
    cacheHit:    boolean;
    sqlCompiled: string;       // for "show SQL" UI
    cacheKey:    string;
    durationMs:  number;
    rowCount:    number;
    truncated:   boolean;
  };
}
```

## 7. UI specs

### 7.1 Semantic Model editor

Lives at `/app/datasets/:id/semantic`. Three panes:

```
┌──────────────────────────────────────────────────────────────┐
│  Semantic Model: Orders                          [Save]      │
├──────────────────────────────────────────────────────────────┤
│  Entities                Dimensions             Metrics      │
│  ┌────────────────┐      ┌────────────────┐     ┌──────────┐ │
│  │ • order (PK)   │      │ • region (str) │     │ • revenue│ │
│  │ • customer FK  │      │ • created_at   │     │   sum    │ │
│  │   [+ entity]   │      │   (time, day)  │     │ • orders │ │
│  └────────────────┘      │ • status (str) │     │   count  │ │
│                          │   [+ dim]      │     │ • aov    │ │
│                          └────────────────┘     │   ratio  │ │
│                                                  │ [+ metric│ │
│                                                  └──────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Add Metric modal

Form fields:

- **Name** (snake_case, unique within model)
- **Label** (display)
- **Kind** (radio): Simple | Ratio | Derived | Cumulative | Conversion
- For Simple:
  - **Aggregation** dropdown: SUM, COUNT, COUNT DISTINCT, AVG, MIN, MAX, MEDIAN
  - **Expression** SQL editor (column ref or formula)
- For Ratio:
  - **Numerator** metric picker
  - **Denominator** metric picker
- For Derived:
  - **Expression** referencing other metrics by `{name}`
- For Cumulative:
  - **Base metric**, **Window** (`7d`/`30d`/`mtd`/`ytd`)
- For Conversion:
  - **Event A** metric, **Event B** metric, **Within** N days
- **Filter** (optional WHERE)
- **Format** dropdown (currency/percent/integer/decimal/custom)
- **Description**
- **Hidden** toggle

### 7.3 Analysis builder integration

Today the visual builder lets users pick raw columns. After semantic
layer ships:

- **Field tray** shows two tabs: "Semantic" (dimensions + metrics from
  the dataset's semantic model) and "Raw" (dataset columns, advanced).
- Dropping a metric into the y-axis slot picks the metric's default
  aggregation.
- Dropping a dimension into the x-axis slot picks the right time grain.

## 8. Code recipes

### 8.1 Compile entry point

```ts
// shared/services/semanticCompiler/index.ts
export class SemanticCompiler {
  constructor(
    private modelRepo: SemanticModelRepository,
    private rlsService: RlsService,
    private dialectAdapter: DialectAdapter,
  ) {}

  async compile(
    req: SemanticQueryRequest,
    ctx: { caller: AuthCtx; dialect: string },
  ): Promise<CompiledSQL> {
    const model = await this.modelRepo.findById(req.semanticModelId);
    if (!model) throw new NotFoundError('semantic model');
    if (model.organisationId !== ctx.caller.organisationId)
      throw new NotFoundError('semantic model');

    const ast = this.buildAst(req, model);
    const rls = await this.rlsService.predicatesFor(model.datasetId, ctx.caller);
    return this.dialectAdapter.print(ast, { ...ctx, rls, model });
  }

  private buildAst(req: SemanticQueryRequest, model: SemanticModelFull): QueryAst {
    const select: SelectAst[] = [];
    const groupBy: number[] = [];

    req.dimensions.forEach((name, i) => {
      const d = model.dimensions.find(x => x.name === name);
      if (!d) throw new BadRequestError(`unknown dimension ${name}`);
      select.push({ kind: 'dim', dim: d });
      groupBy.push(i + 1);
    });
    req.metrics.forEach(name => {
      const m = model.metrics.find(x => x.name === name);
      if (!m) throw new BadRequestError(`unknown metric ${name}`);
      select.push({ kind: 'metric', metric: m, model });
    });
    return {
      select,
      from: { kind: 'dataset', sql: model.datasetSql },
      where: req.filters,
      groupBy,
      orderBy: req.orderBy,
      limit: req.limit,
      offset: req.offset,
    };
  }
}
```

### 8.2 Dialect adapter (Postgres path)

```ts
// shared/services/semanticCompiler/postgres.ts
export class PostgresDialect implements DialectAdapter {
  print(ast: QueryAst, ctx: PrintCtx): CompiledSQL {
    const bindings: unknown[] = [];
    const selectParts = ast.select.map(s => this.renderSelect(s, bindings));
    const fromSql = `(${ast.from.sql})`;
    const whereParts: string[] = [];
    if (ast.where?.length) {
      whereParts.push(this.renderFilters(ast.where, bindings, ctx));
    }
    if (ctx.rls.length) whereParts.push(...ctx.rls);
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const groupBy = ast.groupBy.length ? `GROUP BY ${ast.groupBy.join(', ')}` : '';
    const orderBy = ast.orderBy?.length
      ? `ORDER BY ${ast.orderBy.map(o => `${q(o.field)} ${o.dir.toUpperCase()}`).join(', ')}`
      : '';
    const limit  = ast.limit  ? `LIMIT ${ast.limit}`   : '';
    const offset = ast.offset ? `OFFSET ${ast.offset}` : '';

    const sql = [
      `WITH base AS (${fromSql})`,
      `SELECT ${selectParts.join(', ')}`,
      `FROM base`,
      where, groupBy, orderBy, limit, offset,
    ].filter(Boolean).join('\n');

    return { sql, bindings, cacheKey: hash({ ast, rls: ctx.rls }) };
  }

  private renderSelect(s: SelectAst, b: unknown[]): string {
    if (s.kind === 'dim') {
      const expr = s.dim.type === 'time'
        ? `DATE_TRUNC('${s.dim.timeGrain || 'day'}', ${s.dim.expression})`
        : s.dim.expression;
      return `${expr} AS ${q(s.dim.name)}`;
    }
    // metric
    const m = s.metric;
    switch (m.kind) {
      case 'simple':
        return `${m.agg!.toUpperCase()}(${m.expression}) AS ${q(m.name)}`;
      case 'ratio': {
        const num = m.numerator;
        const den = m.denominator;
        return `(${num.agg!.toUpperCase()}(${num.expression})::numeric / NULLIF(${den.agg!.toUpperCase()}(${den.expression}), 0)) AS ${q(m.name)}`;
      }
      case 'derived':
        return `(${m.expression}) AS ${q(m.name)}`;
      case 'cumulative':
        // Implemented as a window over the model's default_time_column
        return `SUM(${m.expression}) OVER (ORDER BY ${q(s.model.defaultTimeColumn!)} ROWS BETWEEN ${this.windowBound(m.window!)} PRECEDING AND CURRENT ROW) AS ${q(m.name)}`;
      case 'conversion':
        throw new NotImplementedError('conversion metrics — see Q4 roadmap');
    }
  }

  private windowBound(w: string): string {
    const m = /^(\d+)d$/.exec(w);
    if (m) return `INTERVAL '${m[1]} days'`;
    if (w === 'mtd') return `INTERVAL '1 month'`;
    if (w === 'ytd') return `INTERVAL '1 year'`;
    throw new Error(`unsupported window: ${w}`);
  }
}
```

### 8.3 Static validator

Run on save; catches typos before runtime:

```ts
export async function validateSemanticModel(m: SemanticModelDraft) {
  const errors: ValidationError[] = [];
  for (const dim of m.dimensions) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(dim.name))
      errors.push({ where: `dim.${dim.name}`, msg: 'name must be snake_case' });
    if (dim.type === 'time' && !dim.timeGrain)
      errors.push({ where: `dim.${dim.name}`, msg: 'time dimension needs grain' });
  }
  for (const met of m.metrics) {
    if (met.kind === 'simple' && !met.agg)
      errors.push({ where: `metric.${met.name}`, msg: 'simple metric needs agg' });
    if (met.kind === 'ratio' && (!met.numeratorId || !met.denominatorId))
      errors.push({ where: `metric.${met.name}`, msg: 'ratio needs numerator + denominator' });
  }
  // Reference resolution: ensure derived expressions reference existing metrics.
  const metricNames = new Set(m.metrics.map(x => x.name));
  for (const met of m.metrics.filter(x => x.kind === 'derived')) {
    const refs = (met.expression.match(/\{(\w+)\}/g) || []).map(s => s.slice(1, -1));
    for (const r of refs)
      if (!metricNames.has(r))
        errors.push({ where: `metric.${met.name}`, msg: `unknown ref {${r}}` });
  }
  return errors;
}
```

## 9. Test plan

E2E IDs:

- **SEM-H-01** — create model with 2 dims + 1 metric → 200
- **SEM-H-02** — semantic query returns rows with correct aliases
- **SEM-H-03** — time-grain dimension rolls daily data into months
- **SEM-N-01** — duplicate dim name → 400
- **SEM-N-02** — derived metric with unknown ref → validate 400
- **SEM-N-03** — semantic query referencing unknown metric → 400
- **SEM-N-04** — cross-org model id → 404
- **SEM-E-01** — model with 50 metrics → editor renders + validates
- **SEM-E-02** — ratio metric with denominator=0 → NULL row, no /0
- **SEM-E-03** — RLS predicate appended correctly

## 10. Migration & rollout

1. Migration creates 6 new tables. Empty by default.
2. Existing datasets continue working without a semantic model.
3. Feature flag `enableSemanticLayer` per org. When off, the editor
   route is hidden.
4. Visual builder shows the "Semantic" tab only if the dataset has a
   model; otherwise, fall back to raw columns (current behaviour).
5. When the flag is enabled, recommend an "Auto-generate from columns"
   wizard that inspects the dataset's columns and creates a starter
   model (every numeric column → SUM metric, every string → string
   dimension, every timestamp → time dimension with `day` grain).

## 11. Open questions

- **Where do semantic models live for git-sync?** YAML export +
  optional sync via `/git-sync` later (G27). For now keep in DB.
- **Should we adopt MetricFlow's YAML format verbatim** so dbt projects
  can import 1:1? Pro: ecosystem alignment. Con: ties us to dbt's
  evolution. Recommend a **compatible-subset** import path.
- **Cross-dataset joins** — out of scope for V1; revisit Q3 (see
  module 04 query compiler).
