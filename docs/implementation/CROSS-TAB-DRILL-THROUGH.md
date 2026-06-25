# Cross-tab drill-through

> Implementation companion to research modules 07 (Filters /
> Parameters / Cross-filters / Drill) and 08 (Dashboard /
> multi-tab). This doc pins the exact data model, routing
> conventions, and FE state for "click on a bar in the Sales
> tab → land on the Pipeline tab with that region pre-filtered".

**Status:** 🔴 not in product. P1.
**Effort:** M (1–2 weeks).

---

## 0. Problem statement

DBExec already has, in research, two related concepts:

- **Cross-filter** (intra-tab): click cell on visual A → apply
  predicate to visuals B, C, D on the same tab.
- **Drill-through** (extra-tab): click cell → navigate elsewhere,
  carrying context.

The product gap is the *cross-tab* variant: navigation stays
inside the same dashboard but lands on a different tab, with
the clicked-cell's dimension values prefilled into the target
tab's filters.

Example:

> User looks at the **Sales by Region** bar chart on the
> *Overview* tab. They click the "APAC" bar. The dashboard
> switches to the *Regional Detail* tab and the tab's
> `region` filter is set to `APAC`.

This is what every mature BI product calls "tab navigation
actions" or "dashboard actions" (Tableau's phrase). It's where
multi-tab dashboards earn their keep — without it, a multi-tab
dashboard is just a stack of independent reports.

---

## 1. Data model

One new entity (`visual_action`), one URL convention.

### 1.1 `visual_action` (new)

```sql
CREATE TABLE visual_action (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- the source visual on which this action is configured
  visual_id         UUID NOT NULL REFERENCES analysis_visual(id) ON DELETE CASCADE,
  -- the dashboard context this action applies in (nullable = any
  -- dashboard that uses this visual)
  dashboard_id      UUID REFERENCES dashboard(id) ON DELETE CASCADE,

  name              TEXT NOT NULL,
  trigger           TEXT NOT NULL                   -- 'click' | 'dblclick' | 'menu'
    CHECK (trigger IN ('click', 'dblclick', 'menu')),
  kind              TEXT NOT NULL                   -- 'tab_nav' | 'drill_through' | 'url' | 'raw_rows'
    CHECK (kind IN ('tab_nav', 'drill_through', 'url', 'raw_rows')),

  -- shape varies by `kind`. validated in API layer.
  config            JSONB NOT NULL,

  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  display_order     SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_va_visual ON visual_action(visual_id);
CREATE INDEX idx_va_dashboard ON visual_action(dashboard_id);
```

### 1.2 `config` shape per kind

```ts
// kind = 'tab_nav'  — same-dashboard tab jump (the cross-tab case)
{
  targetTabId: string;                // dashboard_tab.id
  dimMap: Array<{                     // map clicked column → target filter
    sourceColumn: string;             // 'region' on the clicked visual
    targetFilterId: string;           // dashboard_filter.id on target tab
  }>;
  scrollToVisualId?: string;          // optional: scroll to a specific visual
}

// kind = 'drill_through' — cross-analysis jump
{
  targetAnalysisId: string;
  targetTabId?: string;
  paramMap: Array<{
    sourceColumn: string;
    targetParameterId: string;        // analysis_parameter.id
  }>;
}

// kind = 'url' — external URL
{
  urlTemplate: string;                // 'https://crm.acme.com/account/{{account_id}}'
  newTab: boolean;
}

// kind = 'raw_rows' — open the raw-rows slide-over for the clicked cell
{
  limit: number;                      // default 100
  columns?: string[];                 // null = all dataset columns
}
```

### 1.3 URL state convention

We already encode dashboard state in the URL (the multi-tab work
established `?tab=<tabId>&p.region=APAC`). Cross-tab nav is a
URL-state mutation — it doesn't introduce new routes:

```
/dashboard/<id>?tab=<targetTabId>&f.<filterId>=<encodedValues>&scroll=<visualId>
```

That means: a cross-tab nav is "browser-reproducible" — copying
the URL after the click reproduces the state. Critically, the
existing dashboard filter resolver picks up the URL state without
any new code path.

---

## 2. Click → URL → state flow

```
┌──────────────────┐    onClickHandler(echart params)
│  Source visual   │ ───────────────────────────────────────┐
│ (echart canvas)  │                                        │
└──────────────────┘                                        ▼
                                              ┌─────────────────────────┐
                                              │ resolveAction(visualId,│
                                              │   clickPayload)         │
                                              └─────────────────────────┘
                                                          │
                                                          ▼
                                  ┌─────────────────────────────────────┐
                                  │ Build target URL state              │
                                  │   - targetTabId                     │
                                  │   - filter overrides (from dimMap)  │
                                  │   - scrollToVisualId                │
                                  └─────────────────────────────────────┘
                                                          │
                                                          ▼
                                          router.navigateByUrl(targetUrl)
                                                          │
                                                          ▼
                            (dashboard subscribes to route → applies tab + filters)
```

### 2.1 Resolver pseudo-code

```ts
function resolveAction(
  visualId: string,
  echartParams: ECEventParams,
  dashboardCtx: DashboardCtx,
): ResolvedAction | null {
  const action = visualActionsFor(visualId, dashboardCtx.dashboardId)
    .find(a => a.is_enabled && matchesTrigger(a.trigger, echartParams.event));

  if (!action) return null;

  const cellDims = dimsFromEchartClick(echartParams);     // { region: 'APAC', ... }

  switch (action.kind) {
    case 'tab_nav': return buildTabNavUrl(action.config, cellDims, dashboardCtx);
    case 'drill_through': return buildDrillThroughUrl(action.config, cellDims);
    case 'url': return buildExternalUrl(action.config, cellDims);
    case 'raw_rows': return openRawRowsSheet(action.config, cellDims, visualId);
  }
}
```

### 2.2 dimsFromEchartClick

ECharts gives us `params.data` (the original row) for most chart
types and `params.value` for sparse cases. We normalise to a
`{ column: value }` map by reading the visual's
`dataset_field_meta` for the chart's encoding:

```ts
function dimsFromEchartClick(p: ECEventParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const encoding = p.encoding ?? {};   // ECharts encoding spec
  // For each role (x, y, value, ...), look up the field name the
  // visual was configured with and store the cell's value for it.
  ...
  return out;
}
```

The visual sidebar already knows the field-per-role mapping —
the resolver reads from the same source so we never store the
mapping twice.

---

## 3. API surface

```
POST   /visual-action/add
PATCH  /visual-action/update/:id
DELETE /visual-action/delete/:id
GET    /visual-action/list/:visualId
POST   /visual-action/reorder
```

`POST /add` body:

```ts
const Body = z.object({
  visualId:    z.string().uuid(),
  dashboardId: z.string().uuid().optional(),    // null = global to visual
  name:        z.string().min(1).max(80),
  trigger:     z.enum(['click', 'dblclick', 'menu']),
  kind:        z.enum(['tab_nav', 'drill_through', 'url', 'raw_rows']),
  config:      z.unknown(),                     // refined per-kind below
  displayOrder: z.number().int().min(0).default(0),
});

// Discriminated config refinement
const TabNavConfig = z.object({
  targetTabId: z.string().uuid(),
  dimMap: z.array(z.object({
    sourceColumn:   z.string(),
    targetFilterId: z.string().uuid(),
  })).min(1),
  scrollToVisualId: z.string().uuid().optional(),
});
// + DrillThroughConfig, UrlConfig, RawRowsConfig
```

Validation in the controller:
- `tab_nav`: `targetTabId` must belong to the dashboard the
  action is scoped to. Reject `BAD_REQUEST_TAB_NOT_IN_DASHBOARD`
  otherwise.
- For each `dimMap` entry: the `sourceColumn` must exist in the
  source visual's encoded fields; the `targetFilterId` must
  belong to the target tab (or be a tab-level filter on the
  target). Reject `BAD_REQUEST_BAD_DIM_MAP` otherwise.

Audit: every action create/update/delete writes an `audit_log`
row with module `VISUAL_ACTION`, kind in `metadata.kind`.

---

## 4. FE — author UI

The author UI lives in the visual properties sidebar (`visual-config-sidebar.component`),
under a new "Actions" accordion. Following the existing
sidebar's pattern:

```
[Actions ▼]
  ┌────────────────────────────────────────────┐
  │ Sales → Regional Detail            🟢 ON   │
  │ Trigger: click  ·  Kind: Tab nav            │
  │ Maps: region → Region filter                │
  │                                        ✏︎ 🗑│
  ├────────────────────────────────────────────┤
  │ + Add action                                │
  └────────────────────────────────────────────┘
```

**+ Add action** opens a modal wizard with three steps:

1. **Trigger + kind** — radio for `click`/`dblclick`/`menu`,
   radio for `tab_nav`/`drill_through`/`url`/`raw_rows`.
2. **Target** — kind-specific:
   - `tab_nav`: a dropdown of dashboard tabs (excluding the
     current tab), an optional "scroll to" visual picker.
   - `drill_through`: search-as-you-type analysis picker, then
     tab picker if the target dashboard has tabs.
   - `url`: textarea for the URL template + new-tab checkbox.
   - `raw_rows`: row limit slider + column multi-select.
3. **Mapping** — table of source columns × target filters/params
   with auto-suggest if names match.

A live "Preview" panel shows the URL state the action would
produce for a sample cell. When the author saves, we write the
`visual_action` row.

---

## 5. Runtime: consuming the click

The existing `echart-visual` component already emits
`(echartEvent)`. The dashboard subscribes:

```ts
// dashboard-tab.component.ts
onVisualEvent(visualId: string, ev: ECEventParams): void {
  const resolved = this.actionResolver.resolve(visualId, ev, this.ctx);
  if (!resolved) return;
  switch (resolved.kind) {
    case 'navigate':
      this.router.navigateByUrl(resolved.targetUrl, { state: { source: visualId } });
      break;
    case 'open-url':
      window.open(resolved.url, resolved.newTab ? '_blank' : '_self');
      break;
    case 'open-raw-rows':
      this.rawRowsService.open(resolved);
      break;
  }
}
```

When the router fires with the new URL, the dashboard's URL-state
sync (already wired for the multi-tab work) reads `?tab=...&f.<id>=...`
and re-runs the queries.

---

## 6. Visual cues

A small interaction signal goes a long way:

- Hovering a visual that has any action attached shows a subtle
  cursor change (`cursor: pointer` on the canvas — already true
  for cross-filter chains, so no regression).
- A tiny `↗︎` icon overlays the top-right corner when actions
  exist, with a tooltip listing them ("Click a bar to drill to
  Regional Detail").
- In author mode, a coloured ring (CSS `outline: 2px dashed var(--primary)`) appears around visuals
  with actions so the author can spot the wired-up ones at a
  glance.

Accessibility:
- Click actions must also be keyboard-reachable: `Enter` /
  `Space` on a focused chart cell triggers the same action.
- The `↗︎` icon's tooltip is real text in an `aria-label`.

---

## 7. Edge cases

| # | Scenario | Expected |
|---|---|---|
| C1 | Target tab deleted | Action remains in DB but is grey-listed in UI; runtime no-ops with a console warning |
| C2 | Target filter deleted | Same — grey-listed |
| C3 | Author maps two source columns to the same target filter | Reject at validation: `BAD_REQUEST_DUPLICATE_TARGET_FILTER` |
| C4 | Source column not present in the clicked row's encoding (e.g. user clicked a tooltip-only series) | Skip the mapping silently for that entry; if all mappings skip, no-op the action |
| C5 | Cross-filter and tab-nav both configured | Cross-filter applies first (intra-tab visual state), then the tab-nav fires; documented order |
| C6 | RLS hides the target tab from the current user | Show a non-blocking toast "You don't have access to the Regional Detail tab" instead of navigating |
| C7 | Embedded dashboard | Tab-nav actions work; URL actions opt-in per embed app config (default disallow `target=_blank` for security) |
| C8 | The same visual used on two dashboards with different actions | Actions are scoped by `(visualId, dashboardId)`; the resolver picks the matching one |
| C9 | Mobile / touch | Tap fires `click`; long-press fires `menu`; double-tap is unreliable on mobile so dblclick actions auto-fall-back to click on touch devices |
| C10 | Action chains (A → B → C) | Allowed; we use the standard router navigation, so chains naturally work via further click → resolveAction calls |

---

## 8. Test plan

`docs/qa/cross-tab-drill-through.md` will house `CTDT-001` …
`CTDT-030`. Headline:

- `CTDT-001` happy path: bar on tab 1 → click APAC → URL is
  `?tab=<t2>&f.<region>=APAC&scroll=<v>` → tab 2 renders with
  region filter set, viewport scrolled to v.
- `CTDT-002` keyboard: focus cell + Enter → same outcome.
- `CTDT-010` deleted target tab: action grey-listed, click no-ops
  + toast.
- `CTDT-020` chain: A click → tab 2; tab 2 click → tab 3.
- `CTDT-030` embed: action fires inside iframe; URL action
  blocked when embed_app config disallows external navigation.

---

## 9. Migration & rollout

1. Migration: `CREATE TABLE visual_action`.
2. No backfill needed — the table starts empty.
3. Feature flag: `feature.visual_actions` gates both author UI
   and runtime resolver.
4. Soak on the internal demo dashboard first.
5. Document on the product help site.
6. Remove flag after two weeks of green.

---

## 10. Open questions

1. **Click on multi-series cells**: when a stacked bar represents
   multiple series, which series's value flows through the
   mapping? Today: the *clicked* series's encoding wins; the
   author can pick a different series via a "Apply to: stack
   total / clicked series / category" radio in the wizard.
   Defer to v2 if surface area is tight.
2. **Hover preview vs nav**: should hover preview the
   destination? Could be a power-user feature; gather requests
   first.
3. **History stack**: navigating tab → tab pushes router
   history. Should a "Back" arrow appear on the destination?
   The browser's back button already works (we use real URL
   state), so probably not.

---

## 11. Controller stub (BE)

`src/controllers/visualAction/addVisualAction.ts`. Per-kind
validation is in `Joi`/Zod middleware; the controller does the
business checks (tab-belongs-to-dashboard, filter-belongs-to-tab)
that need DB lookup.

```typescript
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { VISUAL_ACTION_MSG, GENERIC } from '../../constants/response.messages';
import { auditLogger } from '../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../constants/audit.constants';
import Logger from '../../utility/logger';

const addVisualAction = async (req: Request, res: Response) => {
  const { visualId, dashboardId, name, trigger, kind, config, displayOrder } = req.body;
  const { orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    const visual = await connection.getRepository('AnalysisVisual')
      .findOne({ where: { id: visualId } });
    if (!visual) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.NOT_FOUND, VISUAL_ACTION_MSG.VISUAL_NOT_FOUND);
    }

    // Per-kind business validation
    if (kind === 'tab_nav') {
      const tab = await connection.getRepository('DashboardTab')
        .findOne({ where: { id: config.targetTabId, dashboardId } });
      if (!tab) {
        await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, VISUAL_ACTION_MSG.TAB_NOT_IN_DASHBOARD);
      }

      // Resolve all targetFilterIds → ensure they belong to this dashboard or this tab
      const filterIds = config.dimMap.map((m: any) => m.targetFilterId);
      const filters = await connection.getRepository('DashboardFilter')
        .createQueryBuilder('f')
        .where('f.id IN (:...ids)', { ids: filterIds })
        .andWhere('(f.dashboardId = :dashId OR f.dashboardTabId = :tabId)',
                  { dashId: dashboardId, tabId: tab.id })
        .getMany();
      if (filters.length !== filterIds.length) {
        await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, VISUAL_ACTION_MSG.BAD_DIM_MAP);
      }

      // sourceColumn must exist on the visual's encoded fields
      const encoded = new Set(visual.encodedFieldNames ?? []);
      for (const m of config.dimMap) {
        if (!encoded.has(m.sourceColumn)) {
          await master_db_connection.close();
          return sendResponse(res, false, CODE.BAD_REQUEST,
            `${VISUAL_ACTION_MSG.UNKNOWN_SOURCE_COLUMN}: ${m.sourceColumn}`);
        }
      }
    } else if (kind === 'drill_through') {
      // similar resolution for analysis_parameter
    }

    const action = await connection.getRepository('VisualAction').save({
      visualId, dashboardId, name, trigger, kind, config,
      displayOrder: displayOrder ?? 0,
      isEnabled: true,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.VISUAL_ACTION,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'VisualAction',
      entityId: action.id,
      metadata: { kind, trigger, sourceVisualId: visualId },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, VISUAL_ACTION_MSG.CREATED, action);
  } catch (err: any) {
    Logger.error(`Add visual action failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default addVisualAction;
```

## 12. FE — the resolver service

`src/app/modules/dashboards/services/visual-action-resolver.service.ts`.
One singleton service, injected into the dashboard tab component.
Pure logic — no HTTP — so it's trivially unit-testable.

```typescript
import { Injectable } from '@angular/core';
import { ECEventParams } from '../models/echart-event.model';
import { VisualAction } from '../models/visual-action.model';
import { DashboardCtx } from '../models/dashboard-ctx.model';

export interface ResolvedAction {
  kind: 'navigate' | 'open-url' | 'open-raw-rows';
  targetUrl?: string;
  url?: string;
  newTab?: boolean;
  visualId?: string;
  cellDims?: Record<string, unknown>;
  rowFilters?: Array<{ column: string; op: 'eq'; value: unknown }>;
  columns?: string[] | null;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class VisualActionResolverService {
  resolve(
    visualId: string,
    ev: ECEventParams,
    ctx: DashboardCtx,
  ): ResolvedAction | null {
    const action = ctx.actions
      .filter(a => a.visualId === visualId && a.isEnabled)
      .filter(a => this.matchesTrigger(a.trigger, ev.event))
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];

    if (!action) return null;

    const cellDims = this.dimsFromEchartClick(ev, ctx.visualEncoding[visualId]);
    if (!cellDims || Object.keys(cellDims).length === 0) return null;

    switch (action.kind) {
      case 'tab_nav': return this.buildTabNav(action, cellDims, ctx);
      case 'drill_through': return this.buildDrillThrough(action, cellDims);
      case 'url': return this.buildExternalUrl(action, cellDims);
      case 'raw_rows': return this.buildRawRows(action, cellDims, visualId);
    }
  }

  private matchesTrigger(trigger: string, event: string): boolean {
    if (trigger === event) return true;
    // Touch fall-back: configured 'dblclick' degrades to 'click' on touch
    if (trigger === 'dblclick' && event === 'click' && this.isTouch()) return true;
    return false;
  }

  private dimsFromEchartClick(
    ev: ECEventParams,
    encoding: Record<string, string>, // role → fieldName
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // ECharts gives us `params.data` for bar/line/scatter
    if (ev.data && typeof ev.data === 'object') {
      for (const [role, field] of Object.entries(encoding)) {
        if (field in (ev.data as object)) {
          out[field] = (ev.data as Record<string, unknown>)[field];
        }
      }
    }
    // Pie/treemap: params.name is the dimension value
    if (Object.keys(out).length === 0 && ev.name && encoding.category) {
      out[encoding.category] = ev.name;
    }
    return out;
  }

  private buildTabNav(
    action: VisualAction,
    cellDims: Record<string, unknown>,
    ctx: DashboardCtx,
  ): ResolvedAction {
    const cfg = action.config as { targetTabId: string; dimMap: any[]; scrollToVisualId?: string };
    const params = new URLSearchParams();
    params.set('tab', cfg.targetTabId);
    for (const m of cfg.dimMap) {
      if (m.sourceColumn in cellDims) {
        params.set(`f.${m.targetFilterId}`, this.encodeFilterValue(cellDims[m.sourceColumn]));
      }
    }
    if (cfg.scrollToVisualId) params.set('scroll', cfg.scrollToVisualId);
    return {
      kind: 'navigate',
      targetUrl: `/dashboard/${ctx.dashboardId}?${params.toString()}`,
    };
  }

  private buildDrillThrough(action: VisualAction, cellDims: Record<string, unknown>): ResolvedAction {
    const cfg = action.config as { targetAnalysisId: string; targetTabId?: string; paramMap: any[] };
    const params = new URLSearchParams();
    if (cfg.targetTabId) params.set('tab', cfg.targetTabId);
    for (const m of cfg.paramMap) {
      if (m.sourceColumn in cellDims) {
        params.set(`p.${m.targetParameterId}`, this.encodeFilterValue(cellDims[m.sourceColumn]));
      }
    }
    return {
      kind: 'navigate',
      targetUrl: `/analysis/${cfg.targetAnalysisId}?${params.toString()}`,
    };
  }

  private buildExternalUrl(action: VisualAction, cellDims: Record<string, unknown>): ResolvedAction {
    const cfg = action.config as { urlTemplate: string; newTab: boolean };
    const url = cfg.urlTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = cellDims[key];
      return v == null ? '' : encodeURIComponent(String(v));
    });
    return { kind: 'open-url', url, newTab: cfg.newTab };
  }

  private buildRawRows(
    action: VisualAction,
    cellDims: Record<string, unknown>,
    visualId: string,
  ): ResolvedAction {
    const cfg = action.config as { limit: number; columns?: string[] };
    return {
      kind: 'open-raw-rows',
      visualId,
      cellDims,
      rowFilters: Object.entries(cellDims).map(([col, val]) => ({ column: col, op: 'eq', value: val })),
      limit: cfg.limit ?? 100,
      columns: cfg.columns ?? null,
    };
  }

  private encodeFilterValue(v: unknown): string {
    if (Array.isArray(v)) return encodeURIComponent(JSON.stringify(v));
    return encodeURIComponent(String(v));
  }

  private isTouch(): boolean {
    return 'ontouchstart' in window;
  }
}
```

Unit tests for this service cover every kind × cell-shape
combination. Because there's no HTTP, the test file is a few
dozen lines per kind.

## 13. Observability

Action firing emits a structured `evt: 'visual_action.fired'`
log line. We sample at 100% for first-week soak, then drop to
10% sampling once volume scales.

```json
{
  "evt": "visual_action.fired",
  "action_id": "va_abc",
  "kind": "tab_nav",
  "trigger": "click",
  "source_visual": "vis_src",
  "target_tab": "tab_target",
  "mapped_dims": 2,
  "correlation_id": "01HXY..."
}
```

Metrics:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_visual_action_fired_total` | counter | `kind`, `trigger` | usage by feature |
| `dbexec_visual_action_no_resolve_total` | counter | `reason` | `cell_empty`, `target_deleted`, `dim_mismatch` |
| `dbexec_visual_action_resolve_ms` | histogram | `kind` | resolver latency (should stay sub-1ms) |

The "no resolve" counter is the leading indicator: a spike on
`reason='target_deleted'` means a customer just deleted a tab
that many actions point at, and we should auto-disable or warn
proactively.

## 14. Security & threat model

| Threat | Mitigation |
|---|---|
| Action navigates to a tab the user can't see (RLS) | Resolver checks tab visibility against the user's resolved RLS context before navigating; non-blocking toast on deny |
| URL action template contains attacker-injected fragment | Template substitution `urlencode`s every value; no raw HTML rendering; `urlTemplate` must match `^https?://` and pass per-org allowlist if `embed_app.disallow_external_links = true` |
| Cell dim value is null/undefined → ends up as the literal string "undefined" | Substitution skips null/undefined; if every value skips, the action no-ops |
| Author maps two source columns to the same target filter | Reject at validation (`BAD_REQUEST_DUPLICATE_TARGET_FILTER`) |
| Drill-through into an analysis the user can't access | The downstream analysis page enforces RLS; resolver doesn't bypass anything — worst case is a "permission denied" landing |
| Embed mode: malicious parent page intercepts the action | Tab nav stays inside the iframe (`router.navigateByUrl`); URL actions emit a `postMessage` to the parent so the parent decides; both controlled by `embed_app` config |
| Stored XSS via action `name` displayed in author UI | The action name is rendered as text (`{{ action.name }}` in Angular templates auto-escapes); no `[innerHTML]` ever |
| URL template length DoS | Validation caps `urlTemplate` length at 1024 chars |

## 15. Performance budget

| Operation | Target | Hard ceiling |
|---|---|---|
| Resolver compute (click → ResolvedAction) | p99 < 1 ms | 5 ms |
| Tab nav (click → first paint of target tab) | p95 < 250 ms (cached) / 1.5 s (cold) | 5 s |
| Cross-tab filter apply (URL state → query re-run) | p50 < 800 ms | reuses module 04 budget |

The resolver runs synchronously on the click handler, so latency
shows up as input lag. The 1 ms p99 target is what gives the
click an immediate, native feel.

## 16. References

- [07-filters-actions.md §4](../research/modules/07-filters-actions.md)
- [08-dashboard.md §4](../research/modules/08-dashboard.md)
- [09-rls-column-security.md §4](../research/modules/09-rls-column-security.md)
- [14-share-embed.md §4](../research/modules/14-share-embed.md)
- [MULTI-TAB-DASHBOARD.md](MULTI-TAB-DASHBOARD.md)
- Tableau "Dashboard actions" docs (terminology reference).
