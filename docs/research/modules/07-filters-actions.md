# 07 · Filters, Parameters, Cross-filters, Drill

> The interactivity layer. Static charts are reports; interactive
> charts are tools. Tableau, Power BI, Looker, Metabase all spend
> disproportionate UI on this. DBExec has filters; everything else
> is missing.

**Depends on:** Analysis (06), Dataset (03), Semantic Layer (02)
**Unblocks:** Dashboard (08), Embed (14)
**Maturity:** 🟡 filters only

---

## 1. Industry baseline

| Concept | Tableau | Power BI | Looker | Superset |
|---|---|---|---|---|
| Filter | Filter shelf | Filter pane | `filters:` | Filter box |
| Parameter | Parameter | What-if param | Filter or template var | Native filter param |
| Cross-filter | Action filter | Visual interactions | n/a (filter scope) | Native filter scope |
| Drill | Hierarchical drill | Drill-through | Linked Explore | Drill to detail |
| URL filter | Dashboard URL params | URL parameters | URL parameters | URL state |

## 2. DBExec today

- **Per-analysis filters** with category / numeric / time controls.
- **Per-dashboard filters** — not implemented (each dashboard inherits
  analysis filters).
- **Parameters** — not implemented.
- **Cross-filters** — not implemented.
- **Drill** — not implemented.
- **URL state** — only the dashboard id; no filter / param / drill
  state.

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| FLT-G01 | Cross-filter (click visual A → filter visual B) | P0 |
| FLT-G02 | Drill-down + drill-up hierarchy | P0 |
| FLT-G03 | Parameters (named variables) | P0 |
| FLT-G04 | Dashboard filter bar (separate from analysis filters) | P0 |
| FLT-G05 | URL-state for filters / params / drill | P0 |
| FLT-G06 | Cascading filters (A narrows B's options) | P1 |
| FLT-G07 | "All time" / "Last 7d" / "MTD" preset chips on date filter | P0 |
| FLT-G08 | "Apply" button mode (vs auto-apply) | P1 |
| FLT-G09 | Filter highlight on visual (vs filter out) | P1 |
| FLT-G10 | Filter scope (which visuals this filter affects) | P1 |
| FLT-G11 | Top-N filter | P1 |
| FLT-G12 | Wildcard / regex filter on strings | P2 |
| FLT-G13 | Relative date filter ("last 30 days" follows wall clock) | P0 |

## 4. Target architecture

### 4.1 Schema additions

```sql
-- Already exists: analysis_filter
-- Add dashboard_filter:
CREATE TABLE dashboard_filter (
  id              uuid PRIMARY KEY,
  dashboard_id    uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  name            varchar(64) NOT NULL,
  filter_type     varchar(32) NOT NULL,
  control_type    varchar(32) NOT NULL,
  column_name     varchar(255) NOT NULL,
  default_value   jsonb,
  config          jsonb,
  scope           jsonb,                       -- { analyses: [...], excludeAnalyses: [...] }
  sequence        int NOT NULL DEFAULT 0,
  is_enabled      boolean NOT NULL DEFAULT true,
  is_mandatory    boolean NOT NULL DEFAULT false
);

-- Parameters at analysis level
CREATE TABLE analysis_parameter (...);   -- (see module 06)

-- Drill hierarchy at analysis level
CREATE TABLE drill_path (
  id            uuid PRIMARY KEY,
  analysis_id   uuid NOT NULL,
  name          varchar(64),
  fields        text[] NOT NULL,            -- ordered drill order
  hierarchy     varchar(64)
);
```

### 4.2 URL state encoding

```
/app/dashboards/<id>?f.region=APAC,EMEA&f.created_at=last_30d&p.threshold=1000&drill=region|product
```

Parsed by a `UrlStateService`. Persisted on every filter/param/drill
change via `Router.navigate([...], { queryParams, queryParamsHandling: 'merge' })`.

### 4.3 Filter cascade

A filter on `region` narrows the candidate values for `country`:

```ts
async function dependentValues(analysisId: string, targetField: string, scope: FilterClause[]) {
  // SELECT DISTINCT <targetField> FROM <dataset> WHERE <scope predicates>
}
```

Cascading is opt-in per filter pair (otherwise N filters × N filters
balloons).

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/analyses/:id/parameters` | Add param |
| POST | `/dashboards/:id/filters` | Add dashboard-level filter |
| POST | `/dashboards/:id/filters/values` | Resolve filter dependent values |
| POST | `/analyses/:id/drill/paths` | Save drill paths |
| POST | `/analyses/:id/drill/action` | Server-side validation of a drill action |

## 6. UI specs

### 6.1 Filter scope picker

Each filter has a "Applies to" multi-select listing the analyses on
the dashboard. Default: all. Power BI calls this "Sync slicers".

### 6.2 Filter mode

- **Auto-apply** (default) — each control change re-queries.
- **Manual** — user clicks Apply; useful for slow data sources.
  Toggle lives at the dashboard level.

### 6.3 Date filter preset chips

`Today` `Yesterday` `Last 7 days` `Last 30 days` `Last 90 days`
`Month-to-date` `Quarter-to-date` `Year-to-date` `Custom range`

## 7. Code recipes

### 7.1 Resolving relative dates

```ts
export function resolveRelativeDate(token: string, now = new Date()): { from: Date; to: Date } {
  switch (token) {
    case 'today':       return { from: startOfDay(now), to: endOfDay(now) };
    case 'last_7d':     return { from: addDays(now, -7), to: now };
    case 'last_30d':    return { from: addDays(now, -30), to: now };
    case 'mtd':         return { from: startOfMonth(now), to: now };
    case 'ytd':         return { from: startOfYear(now), to: now };
    default:            return { from: parseDate(token), to: now };
  }
}
```

### 7.2 Cascading filter values

```ts
// POST /dashboards/:id/filters/values
// body: { targetField, scope: FilterClause[] }
export default async function dependentValues(req, res) {
  const dashboard = await Dashboard.findOne({ where: { id: req.params.id } });
  const targetField = req.body.targetField;
  const scope = req.body.scope || [];

  // Pick the first analysis as the dataset source (cross-dataset is V2).
  const analysis = await Analyses.findOne({
    where: { id: dashboard.layout.analyses[0] },
  });
  const dataset = await Dataset.findOne({ where: { id: analysis.datasetId } });

  const compiler = new SemanticCompiler(...);
  const sql = compiler.compile({
    semanticModelId: dataset.semanticModelId,
    metrics: [],
    dimensions: [targetField],
    filters: scope,
    limit: 1000,
  }, ctx);

  const pool = await pools.acquire(dataset.datasourceId);
  const { rows } = await pool.query(sql.sql, sql.bindings);
  return sendResponse(res, true, CODE.SUCCESS, 'ok',
    rows.map(r => r[targetField]));
}
```

## 8. Test plan

- **FLT-CROSS-H-01** — click bar A → filter applied to all other visuals
- **FLT-CROSS-H-02** — clear all → all cross-filters removed
- **FLT-DRILL-H-01** — drill region → country shows country column
- **FLT-DRILL-H-02** — back-button drill-up
- **FLT-PARAM-H-01** — param reference in SQL substitutes value
- **FLT-URL-H-01** — share URL with filter state → recipient loads same view
- **FLT-CASCADE-H-01** — region=APAC narrows country list
- **FLT-CROSS-N-01** — cross-filter on non-supported chart (table) silently no-ops
- **FLT-DRILL-E-01** — drill on column that doesn't exist post-edit → graceful

## 9. Migration & rollout

1. URL state service + relative date resolver — Phase 1.
2. Cross-filter + drill ship together behind `enableInteractivity`.
3. Parameters ship after semantic layer to share the substitution
   pipeline.

## 10. Open questions

- Should drill jump to a different analysis (drill-through)? Yes,
  separate spec under "drill paths" (Power BI's drillthrough pattern).

## Appendix · Review additions

- **Filter hierarchies** auto-cascading.
- **Fiscal calendar** for relative dates (`this fiscal Q`).
- **Org filter library** — reusable filter defs.
- **Filter from URL vs session vs default** layered resolution.
- **Parameter-as-filter** (Tableau pattern).
- **Sync slicers** across analyses on a dashboard.
- **Excluded values** (negative chip from a chart click).
- **Top-N filter** with `BY metric`.
- **Comparison range** for prior-period overlays.
- **Highlight vs filter exclude** (Tableau distinction).
- **Affected row count preview** while typing.

### Schema delta

```sql
CREATE TABLE org_fiscal_calendar (organisation_id PK, fy_start_month int, fy_start_day int);
CREATE TABLE org_filter_library (id, organisation_id, name, definition jsonb);
ALTER TABLE analysis_filter ADD COLUMN compare_range jsonb;
```

### Tests

- FLT-FISCAL-H-01 — this fiscal quarter picks right window
- FLT-COMP-H-01 — comparison range overlays prior
- FLT-LIB-H-01 — org filter library reusable
- FLT-HIGHLIGHT-H-01 — highlight preserves all rows
