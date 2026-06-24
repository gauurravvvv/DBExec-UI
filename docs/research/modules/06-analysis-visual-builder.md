# 06 · Analysis & Visual Builder

> The authoring surface. Customers spend most of their creation time
> here. DBExec ships 73 chart types — good. But the property panel is
> procedural, parameters/cross-filters/drill aren't wired, and there's
> no declarative registry.

**Depends on:** Dataset (03), Semantic Layer (02 optional)
**Unblocks:** Dashboard (08), Filters (07)
**Maturity:** 🟡

---

## 1. Industry baseline

- **Tableau** — Show Me library + Marks card.
- **Power BI** — Visualisations pane + Format pane.
- **Looker** — Visualisation tab in Explore.
- **Metabase** — Visualisation chooser + settings.
- **Superset** — Chart type picker + Customize pane.

All converge on: chart type registry + slot mapping + property panel.

## 2. DBExec today

| Surface | Status | File |
|---|---|---|
| Edit page | ✅ | `src/app/modules/analyses/components/edit-analyses/` |
| Chart picker | ✅ | `visuals-chart-sidebar/` |
| Field tray | ✅ | role-based slots |
| Property panel | 🟡 procedural | `visual-config-sidebar/` |
| ECharts builder | 🟡 imperative | `shared/helpers/echarts-option-builder.ts` |
| Filter bar | ✅ | `analysis-filters/` |
| Parameters | ❌ | — |
| Drill | ❌ | — |
| Cross-filters | ❌ | — |
| Action bus | ❌ | — |

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| ANL-G01 | Declarative `VisualSpec` registry | P1 |
| ANL-G02 | Property panel auto-rendered from descriptors | P1 |
| ANL-G03 | Parameters (named variables) | P0 |
| ANL-G04 | Cross-filter action bus | P0 |
| ANL-G05 | Drill-down stack with breadcrumb | P0 |
| ANL-G06 | Custom-viz plugin loader | P1 |
| ANL-G07 | Multi-visual stories (Tableau-Stories pattern) | P2 |
| ANL-G08 | Conditional formatting (red/green by threshold) | P1 |
| ANL-G09 | Annotations (per-visual notes) | P2 |
| ANL-G10 | Reference lines / bands | P1 |
| ANL-G11 | Forecast / trend overlay | P2 |
| ANL-G12 | Visual title + caption + footnote | P1 |
| ANL-G13 | Visual options "Apply to all" | P2 |

## 4. Target architecture

### 4.1 VisualSpec registry

```ts
// shared/visualisations/registry.ts
export interface VisualSpec {
  chartType: string;
  family: ChartFamily;
  description: string;
  roles: Role[];                    // required + optional field slots
  defaultOptions(ctx: VisualCtx): EChartsOption;
  properties: PropertyDescriptor[];
  supportsCrossFilter: boolean;
  supportsDrill: boolean;
  supportsTime: boolean;
  minSeries: number;
  maxSeries?: number;
}

export type Role = {
  id: string;                       // 'xAxis', 'yAxis', 'series', 'lng', 'lat'
  label: string;
  type: 'dim' | 'metric' | 'either';
  multiple: boolean;
  required: boolean;
};

export type PropertyDescriptor = {
  key: string;                      // 'legend.show' (option path)
  label: string;
  group: 'general' | 'axes' | 'series' | 'legend' | 'tooltip' | 'animation' | 'misc';
  control: 'toggle' | 'select' | 'color' | 'colorScheme' | 'number' | 'slider' | 'text' | 'expression';
  default: unknown;
  optionPath: string;               // dot path to set in EChartsOption
  enum?: { value: unknown; label: string }[];
  min?: number; max?: number; step?: number;
  appliesWhen?: (ctx: VisualCtx) => boolean;
};
```

### 4.2 Auto-rendered property panel

```ts
// FE: visual-config-sidebar.component.ts
for (const prop of spec.properties) {
  if (prop.appliesWhen && !prop.appliesWhen(ctx)) continue;
  switch (prop.control) {
    case 'toggle':
      this.renderToggle(prop);
      break;
    case 'select':
      this.renderSelect(prop);
      break;
    // ...
  }
}
```

Toggling a property:

```ts
onPropertyChange(prop: PropertyDescriptor, value: unknown) {
  set(this.visual.options, prop.optionPath, value);
  this.markOptionsChanged();        // bubble to the canvas → re-render
}
```

Toggling OFF removes the path completely (no merge-leak):

```ts
onPropertyOff(prop: PropertyDescriptor) {
  unset(this.visual.options, prop.optionPath);
  this.markOptionsChanged();
}
```

### 4.3 Parameters

```sql
CREATE TABLE analysis_parameter (
  id            uuid PRIMARY KEY,
  analysis_id   uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  name          varchar(64) NOT NULL,
  label         varchar(128),
  type          varchar(16) NOT NULL,         -- text|number|date|enum
  default_val   text,
  enum_values   text[],
  bind_to_field varchar(128),                  -- optional dataset column for autocomplete
  UNIQUE (analysis_id, name)
);
```

Parameter usage in SQL: `{{ param.region }}` placeholders substituted
at compile time.

### 4.4 Action bus

```ts
// FE: shared/services/action-bus.service.ts
@Injectable({ providedIn: 'root' })
export class ActionBus {
  private subject = new Subject<DashboardAction>();
  emit(a: DashboardAction) { this.subject.next(a); }
  on(predicate: (a: DashboardAction) => boolean) {
    return this.subject.pipe(filter(predicate));
  }
}

export type DashboardAction =
  | { type: 'cross-filter'; sourceVisualId: string; field: string; value: unknown }
  | { type: 'drill-down'; sourceVisualId: string; dim: string; value: unknown }
  | { type: 'drill-up'; sourceVisualId: string; dim: string }
  | { type: 'param-change'; name: string; value: unknown };
```

Visuals subscribe + rebuild query with extra predicates.

### 4.5 Drill stack

```ts
interface DrillState {
  hierarchy: string[];               // ['region', 'country', 'city']
  pinned: { dim: string; value: unknown }[];  // ['region=APAC', 'country=Japan']
}
```

Rendered as breadcrumb above the visual.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET   | `/visualisations/registry` | List specs (used by FE picker) |
| POST  | `/analyses/:id/parameters` | Add parameter |
| GET   | `/analyses/:id/parameters` | List |
| PUT   | `/analyses/:id/parameters/:pid` | Update |
| DELETE | `/analyses/:id/parameters/:pid` | Delete |
| POST  | `/analyses/:id/drill` | Push a drill action (server-side validation) |

## 6. UI specs

### 6.1 New panes

- **Parameters pane** — list parameters, edit defaults, drag into SQL.
- **Cross-filter indicator** — small badge "Filtered by: region=APAC"
  on any visual receiving a cross-filter; click to clear.
- **Drill breadcrumb** — `Region › APAC › Country › Japan ›` above
  the visual; clicking a crumb pops the stack.

### 6.2 Property panel improvements

- Grouped tabs (General · Axes · Series · Legend · Tooltip · Animation
  · Misc).
- Search box at top.
- "Apply to all visuals on this analysis" button.
- "Reset to defaults" button.

## 7. Code recipes

### 7.1 Bar chart VisualSpec example

```ts
// shared/visualisations/bar.spec.ts
export const barSpec: VisualSpec = {
  chartType: 'bar',
  family: 'bar',
  description: 'Compare categorical values',
  roles: [
    { id: 'xAxis', label: 'X axis', type: 'dim', multiple: false, required: true },
    { id: 'yAxis', label: 'Y axis', type: 'metric', multiple: true, required: true },
    { id: 'series', label: 'Series', type: 'dim', multiple: false, required: false },
  ],
  supportsCrossFilter: true,
  supportsDrill: true,
  supportsTime: true,
  minSeries: 1,
  defaultOptions: (ctx) => ({
    xAxis: { type: 'category' },
    yAxis: { type: 'value' },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    series: ctx.metrics.map(m => ({
      type: 'bar',
      name: m.name,
      data: ctx.rows.map(r => r[m.name]),
    })),
  }),
  properties: [
    {
      key: 'legend.show', label: 'Show legend', group: 'legend',
      control: 'toggle', default: true, optionPath: 'legend.show',
    },
    {
      key: 'legend.position', label: 'Legend position', group: 'legend',
      control: 'select', default: 'top', optionPath: 'legend.position',
      enum: [
        { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' },
        { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' },
      ],
      appliesWhen: ctx => ctx.options?.legend?.show !== false,
    },
    {
      key: 'tooltip.show', label: 'Show tooltip', group: 'tooltip',
      control: 'toggle', default: true, optionPath: 'tooltip.show',
    },
    {
      key: 'dataZoom.inside', label: 'Inside zoom', group: 'misc',
      control: 'toggle', default: false, optionPath: 'dataZoom[0].type',
    },
    {
      key: 'animation', label: 'Animation', group: 'animation',
      control: 'toggle', default: true, optionPath: 'animation',
    },
    {
      key: 'series.stack', label: 'Stack series', group: 'series',
      control: 'toggle', default: false, optionPath: 'series.*.stack',
    },
  ],
};
```

Register at boot:

```ts
import { PLUGINS } from './registry';
import { barSpec } from './bar.spec';
import { lineSpec } from './line.spec';
// ...
PLUGINS.register(barSpec);
PLUGINS.register(lineSpec);
```

### 7.2 Cross-filter wiring

```ts
// FE: echart-visual.component.ts
ngAfterViewInit() {
  this.echartsInstance.on('click', ev => {
    if (!this.spec.supportsCrossFilter) return;
    this.actionBus.emit({
      type: 'cross-filter',
      sourceVisualId: this.visual.id,
      field: ev.componentSubType === 'series' ? ev.seriesName : ev.name,
      value: ev.data?.value ?? ev.name,
    });
  });

  this.actionBus.on(a => a.type === 'cross-filter')
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(filter => {
      if (filter.sourceVisualId === this.visual.id) return;
      this.localFilters.push({ field: filter.field, op: 'eq', value: filter.value });
      this.rebuildQuery();
    });
}
```

## 8. Test plan

E2E IDs:

- **ANL-PROP-H-01** — toggle legend on/off, getOption() round-trip
- **ANL-PROP-H-02** — change legend position dropdown updates option
- **ANL-CROSS-H-01** — click bar in visual A → visual B re-renders filtered
- **ANL-DRILL-H-01** — drill from region→country on a bar chart
- **ANL-PARAM-H-01** — declare param, reference in SQL, change value, re-render
- **ANL-PROP-N-01** — toggling a property OFF removes the option path (merge-leak guard)
- **ANL-CROSS-E-01** — cross-filter cleared on "clear all"
- **ANL-DRILL-E-01** — drill stack survives reload (URL state)
- **ANL-PARAM-E-01** — param with enum default = first allowed value

## 9. Migration & rollout

1. Build registry alongside existing imperative builder. Migrate bar
   family first as pilot (G ANL-G01).
2. Auto-render panel for migrated families only; legacy families keep
   the imperative panel until migrated.
3. Parameters: ship behind flag `enableAnalysisParameters`.
4. Cross-filter + drill: ship together as "Interactivity v1".

## 10. Open questions

- Should custom plugins ship as runtime npm packages (Webpack
  federation) or as JSON-only descriptors that map to a fixed
  ECharts option? Recommend descriptors first — safer sandbox.
