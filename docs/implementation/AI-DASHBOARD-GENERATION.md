# AI dashboard generation

> Implementation companion to research modules 25 (AI Insights),
> 02 (Semantic Layer), 06 (Analysis), and 08 (Dashboard). This
> doc pins how "generate me a dashboard about Q2 sales" actually
> becomes a real, RLS-aware, multi-tab DBExec dashboard — without
> letting the LLM write a single line of SQL.

**Status:** 🔴 not in product. P1 (the rest of AI Insights is the
baseline; dashboard generation is the showcase feature).
**Effort:** L (~3 weeks for an engineer plus a designer pass).

---

## 0. Problem statement

The user types a natural-language ask and expects a working
dashboard in seconds:

> "Build me a sales dashboard for Q2 with revenue by region, top
> 10 products, and a daily-revenue trend."

What we will *not* do:
- Let the LLM emit SQL strings.
- Let the LLM see raw row data.
- Let the LLM bypass RLS.
- Generate dashboards faster than we can guarantee correctness.

What we *will* do:
- Have the LLM emit a structured *plan* (JSON) of analyses to
  build, each one a semantic-layer query intent.
- Compile each intent ourselves using our trusted query
  processor (module 04). That's how the rules of the platform
  — RLS, masking, dialect — stay enforced.
- Lay the resulting visuals out on a multi-tab dashboard with
  deterministic geometry.
- Stream progress to the user so generation feels live, not
  blocking.

This implementation doc rides on top of the rest of module 25
(provider abstraction, tool-calling, sanitiser, token budget,
session/turn model). Read [25-ai-insights.md](../research/modules/25-ai-insights.md)
first.

---

## 1. End-to-end flow

```
                 user types ask
                       │
                       ▼
       POST /ai/generate-dashboard  (SSE)
                       │
                       ▼
           ┌──────────────────────────┐
           │ 1. Load semantic model   │
           │    (sanitised, no PII)   │
           └──────────────────────────┘
                       │
                       ▼
           ┌──────────────────────────┐
           │ 2. Tool-calling loop     │
           │    LLM ⇄ tools           │
           │    - describe_model      │
           │    - fetch_dim_values    │
           │    - propose_plan        │
           │    - revise_plan         │
           └──────────────────────────┘
                       │
                       ▼
           ┌──────────────────────────┐
           │ 3. Validate plan         │
           │    (Zod + lints +        │
           │     dry-run compile)     │
           └──────────────────────────┘
                       │
                       ▼
           ┌──────────────────────────┐
           │ 4. Materialise           │
           │    create analyses,      │
           │    visuals, dashboard,   │
           │    tabs (one tx)         │
           └──────────────────────────┘
                       │
                       ▼
           ┌──────────────────────────┐
           │ 5. Run dry queries       │
           │    (LIMIT 1, RLS as user)│
           │    to verify shape       │
           └──────────────────────────┘
                       │
                       ▼
           ┌──────────────────────────┐
           │ 6. Stream events to FE:  │
           │    - tab.created         │
           │    - visual.created      │
           │    - visual.ready        │
           │    - dashboard.ready     │
           └──────────────────────────┘
                       │
                       ▼
              FE navigates user to the new
              dashboard in author mode
```

---

## 2. The plan format

The LLM produces a JSON object validated by Zod. **This is the
contract.** Everything downstream depends on it being correct.

```ts
const DashboardPlan = z.object({
  name:       z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tabs: z.array(z.object({
    label:    z.string().min(1).max(40),
    visuals:  z.array(z.object({
      title:        z.string().min(1).max(120),
      chartType:    z.enum([
                      'bar', 'line', 'area', 'pie',
                      'kpi', 'table', 'heatmap', 'scatter',
                      'sankey', 'treemap', 'sunburst',
                      'choropleth', 'gauge',
                    ]),
      intent:       SemanticIntent,           // ↓ defined next
      layoutHint:   z.enum(['full', 'half', 'third', 'quarter']),
      sortHint:     z.enum(['asc', 'desc', 'none']).default('none'),
      explanation:  z.string().max(300),      // for the "Why this chart?" hint
    })).min(1).max(8),
    layout:   z.enum(['stacked', 'grid', 'masonry']).default('grid'),
  })).min(1).max(5),
  defaultFilters: z.array(z.object({
    dimension: z.string(),
    values:    z.array(z.union([z.string(), z.number()])).optional(),
    relative:  z.enum(['this_quarter', 'last_quarter', 'last_30d', 'last_7d', 'ytd']).optional(),
  })).default([]),
});

const SemanticIntent = z.object({
  semanticModelId: z.string().uuid(),
  metrics: z.array(z.object({
    metricId: z.string().uuid(),               // sem_metric.id
    alias:    z.string().optional(),
  })).min(1).max(5),
  dimensions: z.array(z.object({
    dimensionId: z.string().uuid(),            // sem_dimension.id
    bucket:      z.enum(['none', 'day', 'week', 'month', 'quarter', 'year']).optional(),
  })).max(4),
  filters: z.array(z.object({
    dimensionId: z.string().uuid(),
    op:          z.enum(['eq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'relative']),
    value:       z.unknown(),                   // shape depends on op; refined separately
  })).max(10),
  limit:    z.number().int().min(1).max(10_000).default(1000),
  orderBy:  z.array(z.object({
    field:    z.string(),                       // metric alias or dimension name
    dir:      z.enum(['asc', 'desc']),
  })).max(3).default([]),
});
```

The intent uses **IDs only**, never raw column or table names.
That means:
- The LLM must call `describe_semantic_model` first to learn the
  IDs and what they mean.
- Validation can resolve every ID against the actual model and
  reject hallucinated ones at the boundary.

---

## 3. Tools the LLM gets

(All defined in detail in research module 25. The dashboard
generator adds two new ones.)

| Tool | Purpose |
|---|---|
| `describe_semantic_model(modelId)` | Returns the sanitised model: entities, dimensions (with descriptions), metrics (with descriptions + units). |
| `fetch_dimension_values(dimensionId, search?)` | Returns up to 50 sample values for a dimension. Used by the LLM to confirm "APAC" is a real value of `region` before filtering on it. |
| `propose_dashboard_plan(plan)` | Submits a plan. Server validates and either echoes the plan back or returns a list of validation errors for the LLM to fix. |
| `revise_dashboard_plan(plan)` | Like propose but for a follow-up correction turn. Resets validation state. |
| `explain_visual_choice(visualSpec)` | Returns the platform's own recommendation for a chart type given the (metrics, dimensions) shape, so the LLM can sanity-check. |

The LLM is *forbidden* from emitting tool calls other than these.
The provider abstraction enforces this — any other tool name in
the model's response is dropped with a logged warning.

---

## 4. Server-side validation

The plan endpoint runs these checks in order, all server-side:

1. **Zod parse** — shape conformance. Reject 400 with a list of
   `{ path, code, message }` so the LLM can fix in the next turn.
2. **Model resolution** — every `semanticModelId`, `metricId`,
   `dimensionId` must exist and belong to an org the user can
   read. RLS is **not** evaluated here; we just check
   visibility.
3. **Metric × dimension compatibility** — for each visual,
   ensure the chosen metrics can be grouped by the chosen
   dimensions according to the semantic model's join graph.
   Reject any visual whose join is undefined.
4. **Filter shape** — for each filter, the `value` shape must
   match the `op` (e.g. `between` requires 2-element array).
5. **Chart-type sanity** — for each visual, run the chart-pick
   heuristic that powers `suggest_visual_for` and emit a
   warning (not a reject) if the LLM picked a chart type the
   heuristic strongly disagrees with. The warning surfaces in
   the FE side panel as "We'd recommend a bar chart instead —
   apply?"
6. **Dry-run compile** — for each intent, the query processor
   compiles it to SQL with the user's RLS context applied and
   `LIMIT 1`. We don't *run* the query yet; we want to catch
   "RLS hides everything for this user, this visual will be
   empty" before showing them an empty dashboard. We log a
   warning per-visual.
7. **Per-org policy** — chart-type allowlist (some orgs disable
   pie charts, etc.); max-visuals-per-tab (default 8); max-tabs
   (default 5); model usage allowed.

Validation runs as a tool result for the LLM. If it fails, we
*return the errors to the LLM* and let it `revise_dashboard_plan`.
We cap at 3 revisions per session to prevent infinite loops.

---

## 5. Materialisation (single transaction)

When validation passes, materialise the plan in one transaction:

```ts
await ctx.tx.transaction(async (tx) => {
  const dashboard = await tx.repo(Dashboard).create({
    name: plan.name,
    description: plan.description,
    orgId: ctx.user.orgId,
    createdBy: ctx.user.id,
    sourceKind: 'ai_generated',
    sourceAiSessionId: ctx.aiSessionId,
  });

  for (let ti = 0; ti < plan.tabs.length; ti++) {
    const tabSpec = plan.tabs[ti];
    const tab = await tx.repo(DashboardTab).create({
      dashboardId: dashboard.id,
      label: tabSpec.label,
      displayOrder: ti,
      layout: tabSpec.layout,
    });

    const slots = layoutSlots(tabSpec.layout, tabSpec.visuals.map(v => v.layoutHint));
    for (let vi = 0; vi < tabSpec.visuals.length; vi++) {
      const v = tabSpec.visuals[vi];
      const analysis = await tx.repo(Analysis).create({
        name:        v.title,
        datasetId:   resolveDatasetForModel(v.intent.semanticModelId),
        intent:      v.intent,                // stored, not compiled
        createdBy:   ctx.user.id,
        sourceKind:  'ai_generated',
        sourceAiSessionId: ctx.aiSessionId,
      });

      await tx.repo(AnalysisVisual).create({
        analysisId:  analysis.id,
        chartType:   v.chartType,
        config:      defaultVisualConfig(v.chartType, v.intent),
      });

      await tx.repo(DashboardVisual).create({
        dashboardTabId: tab.id,
        analysisId:     analysis.id,
        position:       slots[vi],
        sortHint:       v.sortHint,
        aiExplanation:  v.explanation,        // surfaced as "?" tooltip
      });
    }
  }

  for (const f of plan.defaultFilters) {
    await tx.repo(DashboardFilter).create({
      dashboardId: dashboard.id,
      dimensionId: f.dimension,
      defaultValues: f.values,
      defaultRelative: f.relative,
    });
  }
});
```

Idempotency: the endpoint takes an `Idempotency-Key` header. Same
key + same body = same dashboard returned without re-creating.

---

## 6. Streaming events

The endpoint is SSE. Events emitted, in order:

| Event | Payload | Notes |
|---|---|---|
| `session.started` | `{ aiSessionId }` | Returned immediately. |
| `tool.call` | `{ tool, args }` | One per LLM tool invocation; lets FE show "Looking up region values…" |
| `tool.result` | `{ tool, ok, summary }` | Truncated server-side; never includes raw rows. |
| `plan.proposed` | `{ plan, warnings }` | First valid plan. |
| `dashboard.created` | `{ dashboardId }` | After tx commits. |
| `tab.created` | `{ tabId, label, order }` | Per tab. |
| `visual.created` | `{ visualId, tabId, title, chartType, position }` | Per visual. |
| `visual.ready` | `{ visualId, runtimeMs, rowCount }` | After first dry-run query completes. |
| `dashboard.ready` | `{ dashboardId, viewUrl }` | Final event; FE redirects. |
| `error` | `{ code, message, retryable }` | Terminal except on validation errors during revision. |

The FE shows a wizard with three panes:

1. Left — the LLM's running narrative ("I'm building a Sales
   dashboard with 3 tabs… checking that 'APAC' is a real region…").
2. Centre — a live preview of the dashboard being assembled.
3. Right — a checklist of tabs and visuals; each gains a green
   tick as its `visual.ready` arrives.

---

## 7. Layout solver

`layoutSlots(layout, hints)` is a deterministic function that
returns absolute grid positions for each visual:

```ts
type GridSlot = { x: number; y: number; w: number; h: number };

function layoutSlots(layout: 'stacked' | 'grid' | 'masonry', hints: LayoutHint[]): GridSlot[] {
  const W = 12, H_FULL = 6, H_HALF = 5, H_THIRD = 4;
  if (layout === 'stacked') {
    let y = 0;
    return hints.map(h => {
      const slot = { x: 0, y, w: W, h: H_FULL };
      y += H_FULL;
      return slot;
    });
  }
  if (layout === 'grid') {
    // place by hint: 'full' takes a row; 'half' pairs up; 'third'
    // triples; 'quarter' quads. fill row-by-row.
    ...
  }
  if (layout === 'masonry') {
    // 12-col, packed left-right top-bottom with hint→width map.
    ...
  }
}
```

Deterministic so re-generating the same plan gives the same
layout, so re-running for tests is stable, and so authors editing
a generated dashboard see predictable geometry.

---

## 8. RLS, masking, and the safety net

Every materialised analysis stores the semantic *intent*. When a
user opens the dashboard, the query processor compiles the intent
*for that user's RLS context*. So the same generated dashboard
shows different rows to different users — which is exactly what
a real dashboard does.

Three safety nets specifically for AI-generated content:

1. **No raw values in the plan**. The plan filter values come
   from `fetch_dimension_values`, which is RLS-resolved at call
   time. So the LLM cannot embed a value it should not have
   seen.
2. **No bypass of column masking**. The semantic model's
   sanitiser drops masked columns from `describe_semantic_model`.
   The LLM literally cannot reference them.
3. **Per-org policy gate**. Orgs can disable AI generation
   entirely (`feature.ai_dashboard_generate`) or restrict it to
   specific roles (`role.ai_author`).

---

## 9. FE — entry points

Two doorways:

1. **Global "Generate dashboard"** in the top bar, behind the
   `feature.ai_dashboard_generate` flag. Opens the wizard with
   an empty prompt.
2. **From the Cmd-K palette** (search module 17), typing
   "generate" surfaces a "Generate dashboard about…" action.
3. **From an existing dashboard's overflow menu**, a "Clone
   with AI rework" entry that pre-fills the prompt with the
   current dashboard's structure.

Wizard:

```
┌────────────────────────────────────────────────────────────┐
│  Generate a dashboard                                       │
│                                                             │
│  What do you want to see?                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ "Sales dashboard for Q2 with revenue by region, top │  │
│  │  10 products, and a daily revenue trend."           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Semantic model:  [Sales — Acme   ▼]                        │
│  Audience:        [Me  ▼]    (controls RLS context)         │
│                                                             │
│                       [ Cancel ]  [ Generate ⚡ ]            │
└────────────────────────────────────────────────────────────┘
```

After clicking Generate, the page transitions to the
three-pane preview (§6), then redirects to the dashboard.

---

## 10. Edge cases

| # | Scenario | Expected |
|---|---|---|
| A1 | Ask references a metric not in any visible semantic model | LLM tool-result says "no matching metric"; plan refuses; surface "Couldn't find a matching dataset" to user |
| A2 | Ask is ambiguous ("sales") | LLM uses `describe_semantic_model` to enumerate models; asks user a one-question clarification via a `clarify` event |
| A3 | Plan validation fails 3 times | Stop; show last LLM message + errors; offer "Edit prompt and try again" |
| A4 | RLS empties every visual at dry-run | Surface warning at top of generated dashboard: "Some visuals may be empty for users with limited row access." |
| A5 | Org disables pie charts | Plan validation downgrades to bar; LLM is informed via revision turn |
| A6 | Idempotency replay | Same key returns existing dashboard ID, doesn't re-create |
| A7 | LLM emits raw SQL string | Provider abstraction strips it before reaching us; logged as a violation |
| A8 | Plan exceeds max visuals | Reject 400 `PLAN_TOO_LARGE`; LLM revises |
| A9 | Slow LLM (> 30s for first plan) | Stream a `still_working` heartbeat every 5s so the FE doesn't timeout the SSE |
| A10 | User closes the wizard mid-stream | Server cancels the LLM stream, rolls back any pending tx, audits as `ai.cancel` |

---

## 11. Cost & rate-limit

- Each generation counts as one *AI session*; sessions are
  rate-limited per user per hour (default 10/hr) and per org per
  day (default 200/day).
- Token budget per session is capped (default 60k input + 8k
  output combined). Exceeding it = terminate stream with
  `error: BUDGET_EXCEEDED`.
- Cost telemetry (module 27): every `ai.session` writes a
  `query_execution_log` row with `engine='ai'` and the
  computed dollar cost from the provider's token pricing.

---

## 12. Test plan

`docs/qa/ai-dashboard-generation.md` houses `AIDG-001` …
`AIDG-040`. Headline:

- `AIDG-001` happy path — "Sales dashboard for Q2 with revenue
  by region" → produces 1 tab with KPI + bar + line; all visuals
  have non-zero `rowCount` for the test user.
- `AIDG-010` filter values from `fetch_dimension_values` — assert
  the LLM never invents a region name that isn't in the
  tool-returned list.
- `AIDG-020` chart-type warning — force the LLM to pick a pie
  for a 1-metric × 50-value dimension; assert the warning fires
  and the FE offers the bar swap.
- `AIDG-030` RLS empty net — generate as a restricted user
  whose RLS filters everything out; assert the warning banner
  shows.
- `AIDG-040` idempotency — same key + same body → same dashboard
  id; different body → fresh.

---

## 13. Migration & rollout

1. Migration: `Dashboard`, `Analysis`, `DashboardVisual` get
   nullable `source_kind` + `source_ai_session_id` columns for
   auditability. No data motion needed.
2. Feature flag: `feature.ai_dashboard_generate`. Default OFF
   except for design-partner orgs.
3. Soak: 1 week on internal orgs.
4. Beta: design-partner orgs for 2 weeks. Collect
   thumbs-up/down on the generated dashboards via the existing
   `ai_feedback` table.
5. GA: enable for all orgs whose admin opts in via the AI
   settings page.

---

## 14. Open questions

1. **"Edit my dashboard with AI"**: a follow-up that takes the
   *existing* dashboard plus a prompt ("add a YoY column") and
   emits a *diff* the user can approve. Big feature in its own
   right; out of scope here.
2. **Conversational refinement**: the wizard could be a chat
   instead of single-prompt. Defer; one-shot generation is
   already a leap. Cmd-K + chat could be the v2 entry.
3. **Sharing AI sessions**: should a generated dashboard show
   "Built by AI on prompt: …" attribution on the title? Probably
   yes; cheap and improves provenance. Add as part of GA.
4. **Multi-language prompts**: with module 23 (i18n), prompts
   in non-English work as-is (the LLM is multilingual); but the
   generated dashboard *names* should localise. Use the user's
   preferred locale for the LLM's system message.

---

## 15. References

- [25-ai-insights.md §4](../research/modules/25-ai-insights.md)
- [02-semantic-layer.md §4](../research/modules/02-semantic-layer.md)
- [06-analysis-visual-builder.md §4](../research/modules/06-analysis-visual-builder.md)
- [08-dashboard.md §4](../research/modules/08-dashboard.md)
- [09-rls-column-security.md §4](../research/modules/09-rls-column-security.md)
- [27-cost-observability.md §4](../research/modules/27-cost-observability.md)
- [MULTI-TAB-DASHBOARD.md](MULTI-TAB-DASHBOARD.md)
