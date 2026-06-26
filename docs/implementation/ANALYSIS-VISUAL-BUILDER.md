# Analysis & visual builder

> Implementation companion to research module 06. Pins how an
> analyst takes a dataset, picks fields, picks a chart type,
> tunes the visual, and saves an *analysis* (a reusable named
> visualisation that dashboards embed).

**Status:** 🟡 partial — 70+ chart types render in product;
field-to-role mapping is bug-prone, parameters are missing,
cross-filter is missing.
**Effort:** L (~4 weeks — touch surface area is large).

---

## 0. Problem statement

An analysis is the unit a dashboard composes from. It binds:

- A data shape (a dataset or a semantic intent).
- A field-to-role mapping (which column is the x-axis, which
  is the size, which is the colour, which is hidden).
- A chart type (bar, line, heatmap, sankey, ...).
- Per-visual config (axis options, palette, tooltip, sort,
  drill).
- Filters (analysis-local).
- Parameters (placeholders bound at run-time).

Today we have the entity, the chart-type picker, and field
sidebars — but the mapping is bug-prone (wrong field falls into
wrong role on chart-type change), parameters don't exist as
an entity, and cross-filtering between visuals on the same
analysis isn't wired.

---

## 1. Data model

```sql
CREATE TABLE analysis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  dataset_id      UUID REFERENCES dataset(id),               -- nullable when semantic-only
  semantic_model_id UUID REFERENCES semantic_model(id),       -- nullable when dataset-based
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  intent          JSONB,                                       -- when semantic-driven
  owner_user_id   UUID NOT NULL REFERENCES "user"(id),
  source_kind     TEXT,                                         -- 'manual' | 'ai_generated' | 'cloned'
  source_ai_session_id UUID,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (dataset_id IS NOT NULL OR semantic_model_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_analysis_slug ON analysis(org_id, slug);

CREATE TABLE analysis_visual (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  chart_type    TEXT NOT NULL,                                  -- 'bar', 'line', ...
  display_order SMALLINT NOT NULL DEFAULT 0,
  -- Field-to-role mapping
  encoding      JSONB NOT NULL,                                  -- { x: 'region', y: 'revenue', size: null, ... }
  -- Visual options (chart-type-specific)
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Stored for AI explainability
  ai_explanation TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_av_analysis ON analysis_visual(analysis_id);

CREATE TABLE analysis_filter (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  field_name    TEXT NOT NULL,                                  -- dataset_field.name
  op            TEXT NOT NULL,
  value         JSONB,
  relative      TEXT,                                            -- 'this_week' | 'last_30d' | …
  is_required   BOOLEAN NOT NULL DEFAULT false,
  display_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE analysis_parameter (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  data_type     TEXT NOT NULL,
  default_value JSONB,
  allowed_values JSONB,
  is_required   BOOLEAN NOT NULL DEFAULT false,
  display_order SMALLINT NOT NULL DEFAULT 0
);
```

---

## 2. The encoding shape

The `encoding` JSON on `analysis_visual` is the single source
of truth for which field goes into which role. Roles vary by
chart type — defined in
`src/app/modules/analyses/constants/charts.constants.ts`'s
`CHART_ROLES`.

```jsonc
// bar chart
{
  "x":       "region",
  "y":       "revenue",
  "series":  "product",      // colour-by
  "tooltip": ["margin", "units"]
}

// scatter
{
  "x":    "marketing_spend",
  "y":    "revenue",
  "size": "deals_count",
  "color": "region"
}

// sankey
{
  "source": "stage_from",
  "target": "stage_to",
  "value":  "count"
}
```

When the user changes chart type, the builder runs
`reconcileEncoding(oldEncoding, oldType, newType)`:
keep fields whose role exists in both; map common semantics
(`x` → `category` / `name` / `source` depending on target type);
clear roles that no longer apply. Bug surface today; the
research module 06 doc has a dedicated reconciler design.

---

## 3. Config shape per chart type

Every chart type has a config schema (Zod). Examples:

```typescript
// bar config
export const BarConfig = z.object({
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  stack: z.enum(['none', 'normal', 'percent']).default('none'),
  sortBy: z.enum(['none', 'value_asc', 'value_desc', 'label']).default('none'),
  showLabels: z.boolean().default(false),
  labelPosition: z.enum(['inside', 'outside', 'top']).default('outside'),
  showLegend: z.boolean().default(true),
  legendPosition: z.enum(['top', 'right', 'bottom', 'left']).default('top'),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  yAxisFormat: z.string().optional(),               // d3-format spec
  yAxisLog: z.boolean().default(false),
  palette: z.string().default('default'),
  inverse: z.boolean().default(false),
  dataZoom: z.boolean().default(false),
  emphasis: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
});
```

Per-type schemas live in
`src/app/modules/analyses/constants/chart-config-schemas/<type>.ts`
and are validated on save. **This is the fix for today's
biggest UX bug** — toggle X, doesn't actually flow into the
ECharts option, no warning.

---

## 4. Compile → ECharts option

```typescript
export function buildOption(
  visual: AnalysisVisual,
  rows: DataRow[],
  fields: DatasetField[],
  ctx: { theme: 'light' | 'dark'; palette: Palette },
): EChartOption {
  const builder = builderFor(visual.chartType);     // function per type
  return builder(visual.encoding, visual.config, rows, fields, ctx);
}
```

The single-builder-per-type approach replaces today's
giant-switch `echarts-option-builder.ts`. Each `<type>.builder.ts`
file:

- Validates encoding has required roles.
- Transforms rows (group, pivot, sort) per chart-type needs.
- Emits a fresh ECharts option object — no merging from a stale
  one. This is the *merge-leak* fix from earlier bug work.

```typescript
// src/app/shared/builders/bar.builder.ts
export const buildBarOption: ChartBuilder = (encoding, config, rows, fields, ctx) => {
  if (!encoding.x || !encoding.y) {
    return { series: [], xAxis: {}, yAxis: {}, _empty: true };
  }
  const xField = fields.find(f => f.name === encoding.x)!;
  const yField = fields.find(f => f.name === encoding.y)!;
  const seriesField = encoding.series ? fields.find(f => f.name === encoding.series) : null;

  const groups = groupBy(rows, r => r[encoding.x]);
  const series = seriesField
    ? makeStackedSeries(rows, encoding.x, encoding.y, encoding.series, config)
    : [makeSingleSeries(rows, encoding.x, encoding.y, config)];

  return {
    grid: { left: 60, right: config.showLegend && config.legendPosition === 'right' ? 120 : 40,
            top: 40, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: Array.from(groups.keys()),
      inverse: !!config.inverse,
      name: config.xAxisLabel ?? xField.displayName,
      nameLocation: 'middle', nameGap: 30,
    },
    yAxis: {
      type: config.yAxisLog ? 'log' : 'value',
      name: config.yAxisLabel ?? yField.displayName,
      axisLabel: { formatter: config.yAxisFormat ? d3Formatter(config.yAxisFormat) : undefined },
    },
    series: series.map(s => ({
      ...s,
      type: 'bar',
      stack: config.stack !== 'none' ? '_stack_' : undefined,
      label: { show: config.showLabels, position: config.labelPosition },
      emphasis: { focus: config.emphasis ? 'series' : 'none' },
      animation: !config.reducedMotion,
    })),
    legend: { show: config.showLegend, [config.legendPosition]: 10 },
    dataZoom: config.dataZoom
      ? [{ type: 'inside' }, { type: 'slider' }]
      : [],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    color: paletteFor(config.palette, ctx.theme),
  };
};
```

---

## 5. Controller stub

```typescript
// src/controllers/analysis/addAnalysis.ts
const addAnalysis = async (req: Request, res: Response) => {
  const { name, slug, datasetId, semanticModelId, intent, visuals, filters, parameters } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    // Validate intent if semantic
    if (semanticModelId && intent) {
      const v = await validateIntent(intent, semanticModelId, connection);
      if (!v.ok) { await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, ANALYSIS_MSG.BAD_INTENT, { errors: v.errors }); }
    }
    // Validate per-visual config
    for (const v of visuals) {
      const schema = configSchemaFor(v.chartType);
      const parsed = schema.safeParse(v.config);
      if (!parsed.success) { await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, ANALYSIS_MSG.BAD_CONFIG); }
    }
    const analysis = await connection.transaction(async (tx: any) => {
      const a = await tx.getRepository('Analysis').save({
        orgId: orgData.orgId, datasetId, semanticModelId, intent,
        name, slug, ownerUserId: loggedInId, status: 'draft',
      });
      for (let i = 0; i < visuals.length; i++) {
        const v = visuals[i];
        await tx.getRepository('AnalysisVisual').save({
          analysisId: a.id, chartType: v.chartType, encoding: v.encoding,
          config: v.config ?? {}, displayOrder: i,
        });
      }
      for (const f of filters ?? []) await tx.getRepository('AnalysisFilter').save({ analysisId: a.id, ...f });
      for (const p of parameters ?? []) await tx.getRepository('AnalysisParameter').save({ analysisId: a.id, ...p });
      return a;
    });
    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.ANALYSIS,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'Analysis',
      entityId: analysis.id,
      metadata: { visualCount: visuals.length, source: intent ? 'semantic' : 'dataset' },
    });
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, ANALYSIS_MSG.CREATED, analysis);
  } catch (err: any) {
    Logger.error(`Add analysis failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 6. FE — the builder

Existing `edit-analyses.component.ts` is the surface. The
restructure:

```
┌──────────────┬────────────────────────────────┬──────────────────┐
│  Fields      │  Chart canvas                   │  Properties      │
│  (left)      │  (centre)                       │  (right, tabbed) │
│              │                                 │   Type | Encode  │
│  ▾ orders     │                                 │   Format | Filter│
│   • id        │   ┌─────────────────────┐       │                   │
│   • amount    │   │                     │       │  Chart: Bar      │
│   • region    │   │                     │       │  Stack: ◉ none   │
│   • status    │   │     (chart)         │       │  Sort:  desc     │
│              │   │                     │       │  Palette: default│
│  ▾ customers  │   │                     │       │  Show legend: ✓  │
│   • id        │   └─────────────────────┘       │                   │
│   • country   │                                 │   Test mapping:  │
│              │  Drag fields to roles below:    │   X=region        │
│              │  [X: region]  [Y: amount]       │   Y=amount        │
│              │  [Series: ____]                 │   Series=(none)   │
└──────────────┴────────────────────────────────┴──────────────────┘
```

State service uses signals; every encoding/config patch
re-runs `buildOption()` and pushes to the chart with **replace**
semantics (not merge — fixes leak class).

---

## 7. Cross-filter (intra-analysis)

When two or more visuals share an analysis, clicking on one
filters the others.

```typescript
// On click event
function onCellClick(sourceVisualId: string, cell: ECEventParams) {
  const dims = extractDimsFromCell(cell, visualEncoding[sourceVisualId]);
  setCrossFilter(state, { sourceVisualId, dims });
}

// State has a crossFilter slot per analysis
interface AnalysisRuntime {
  crossFilter: null | { sourceVisualId: string; dims: Record<string, unknown> };
}

// When building options for a non-source visual, append the cross-filter to its row set
function rowsForVisual(visualId: string, allRows: DataRow[], runtime: AnalysisRuntime): DataRow[] {
  if (!runtime.crossFilter || runtime.crossFilter.sourceVisualId === visualId) return allRows;
  return allRows.filter(row => Object.entries(runtime.crossFilter!.dims)
    .every(([col, val]) => row[col] === val));
}
```

Click again on the same cell → clear the filter. Click outside
chart area → clear.

---

## 8. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_analysis_save_ms` | histogram | — | save latency |
| `dbexec_analysis_render_ms` | histogram | `chart_type` | option-build cost |
| `dbexec_analysis_chart_type_changes_total` | counter | `from`, `to` | reconciler stress test |
| `dbexec_analysis_config_validation_fail_total` | counter | `chart_type`, `code` | catch schema drift |
| `dbexec_analysis_crossfilter_fired_total` | counter | `analysis` | usage |
| `dbexec_analysis_count` | gauge | `org`, `status` | per-org counts |

---

## 9. Security & threat model

| Threat | Mitigation |
|---|---|
| Author writes a malicious dataset_field reference | Encoding fields validated against `dataset_field` on save |
| XSS via chart title / config text | Angular bindings auto-escape; ECharts `formatter` callbacks sanitised |
| Cross-analysis filter via URL leaks RLS data | Cross-filter scoped to one analysis only |
| Stored XSS in `ai_explanation` | Treated as plain text, never as innerHTML |
| Re-binding to a deleted dataset | ON DELETE RESTRICT on dataset; reassign required |

---

## 10. Runbook

**Symptom: chart renders blank after type change.**
1. Reconciler dropped required role. Re-add field; future
   prevention via "missing required role" inline warning.

**Symptom: bar stacks wrong.**
1. `config.stack === 'normal'` but encoding has no `series`
   role. The validator should catch this on save; the build
   step degrades to single-series.

**Symptom: cross-filter doesn't clear.**
1. Source visual unmounted before click handler fired.
   Reproduces under SSR; ensure handlers are registered after
   chart `finished` event.

---

## 11. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Save analysis (5 visuals) | 250 ms | 800 ms | 5 s |
| Render option (1 visual, 1k rows) | 8 ms | 30 ms | 200 ms |
| Render option (1 visual, 100k rows) | 80 ms | 250 ms | 1 s |
| Cross-filter apply (re-render 4 visuals) | 50 ms | 200 ms | 1 s |
| Chart-type change | 100 ms | 300 ms | 1 s |

---

## 12. Migration & rollout

1. **Migrations:** add `analysis_parameter`; ensure `analysis_visual`
   has `encoding` + `config` columns (split out from the legacy
   blob if needed).
2. **Backfill:** convert legacy single-config-blob analyses into
   `(encoding, config)` pair by running the reconciler.
3. **Feature flag:** `feature.analysis_v2`. Editor reads new
   shape; legacy renderer remains for read-only views of
   un-migrated analyses.

---

## 13. Open questions

1. **Field calculation in builder** — author-defined columns
   (`amount - cost`) without leaving the editor. v2 via
   `dataset_field` calc rows (module 03 has a slot).
2. **Drill-down (intra-analysis)** — clicking a year drills to
   quarters within the same chart. Different from cross-filter;
   different from cross-tab nav. Defer.
3. **Sub-chart composition** — small-multiples / faceted
   charts. Echarts supports via `grid: []`; needs encoding
   `facet` role.

---

## 14. References

- [06-analysis-visual-builder.md](../research/modules/06-analysis-visual-builder.md)
- [02-semantic-layer.md](../research/modules/02-semantic-layer.md)
- [03-dataset.md](../research/modules/03-dataset.md)
- [07-filters-actions.md](../research/modules/07-filters-actions.md)
- [CROSS-TAB-DRILL-THROUGH.md](CROSS-TAB-DRILL-THROUGH.md)
- ECharts option reference
