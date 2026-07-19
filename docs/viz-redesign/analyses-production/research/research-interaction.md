I have exhaustive primary-source coverage. The task list is from the parent DBExec project and not mine to manage. Synthesizing the final report now.

# The Complete Interaction Model of Production BI Dashboards & Authoring

Benchmarked across **Tableau, Power BI, Metabase, Apache Superset, Sigma, Hex**. Every primitive is labeled **[table-stakes]** (baseline expectation for a credible modern BI tool) or **[advanced]** (differentiator / power feature). Claims are drawn from vendor primary docs where possible; sources listed at the end.

---

## 0. The two mental models you must not conflate

There are two distinct "worlds" of interaction, and BI tools implement them very differently:

1. **Consumption-time interactions** — what a *viewer* does with a published dashboard (click a bar → filter, hover → tooltip, right-click → drill). These are cheap, transient, per-session.
2. **Author-time interaction *wiring*** — what a *builder* configures so that consumption interactions do the right thing (Tableau "actions", Power BI "visual interactions" + drillthrough targets, Metabase "click behavior", Sigma "actions", Superset feature flags).

Tableau, Power BI, and Sigma expose a rich **author-configurable action layer**. Metabase exposes a lighter **click-behavior** layer. Superset leans on **automatic behaviors gated by feature flags**. Hex leans on **automatic/zero-config cross-filtering plus notebook-level parameters**. This distinction drives the whole matrix below.

---

## 1. Cross-filter vs. Cross-highlight

These are the two most-confused primitives. The semantic line is precise.

### Cross-filter [table-stakes]
Selecting a mark **removes** non-matching data from other visuals — same effect as applying a filter. Row set shrinks.

- **Power BI**: cross-filtering "actively removes data that doesn't apply to your selection." Applies by default to visuals like **line charts, scatter charts, and maps** — "only the related data remains visible." [PBI-filters]
- **Superset**: "bi-directional binding of charts and dashboards for instant filtration — a chart emits a cross filter to the dashboard, which relays it to other appropriately scoped charts." [Superset-drill]
- **Metabase**: implemented via **click behavior → "Update a dashboard filter"** — clicking a chart element writes to a dashboard parameter, which refreshes connected cards. [MB-interactive]
- **Sigma**: "cross-element filtering — a user clicks a data point in one chart, Sigma applies a filter to another chart using the dimension value of the clicked point." [Sigma-actions]
- **Hex**: viewers "visually filter any chart and automagically cross filter other elements **without any backend mapping**" — auto-detected. [Hex-changelog]
- **Tableau**: the **Filter action** ("use the data from one view to filter data in another"). [Tableau-actions]

### Cross-highlight [table-stakes for Tableau/PBI; not universal]
Selecting a mark **dims** non-matching data but **keeps every data point visible** — shows *contribution/part-to-whole*, not *focus*.

- **Power BI**: "highlighting doesn't remove the unrelated data. Instead it highlights the related data. The rest remains visible but dimmed." Default for **column and bar charts**. Deselect by clicking the value again or empty space. [PBI-filters]
- **Tableau**: the **Highlight action** — "call attention to marks of interest by dimming all others." [Tableau-actions]
- **Metabase / Superset / Hex**: **no first-class dim-others cross-highlight**. They cross-*filter*. (Legend-based highlight exists in some chart engines, but dashboard-wide highlight-without-removal is not a core primitive.) → **[advanced / gap]** for these three.

> **Author control (who wires it):**
> - **Power BI**: `Format → Edit interactions` per source-visual → choose **Filter / Highlight / None** for each target; can enable **bidirectional** cross-filtering between visuals. [PBI-interactions]
> - **Tableau**: add a Filter or Highlight action in `Dashboard → Actions`, choose source sheets, target sheets, trigger (hover/select/menu), and clearing behavior.
> - **Metabase**: per-card **click behavior** in edit mode.
> - **Superset**: toggle cross-filter emission per chart; scope which charts receive it (**"appropriately scoped"**).

---

## 2. Drill-down vs. Drill-through (the second big confusion)

| Concept | Definition | Stays on page? |
|---|---|---|
| **Drill-down** | Navigate *within a hierarchy* in the *same* visual (Category → Sub-category → Product). | Yes |
| **Drill-through** | Jump to a *different* detail page/sheet/report, carrying the clicked context as a filter. | No — navigates away |
| **Drill-to-detail / row-detail** | View the *underlying raw rows* behind an aggregate. | Modal/new view |

### Drill-down (hierarchy, in place) [table-stakes]
- **Power BI**: "**drill mode** moves through hierarchy levels within a single visual" — explicitly distinguished from drillthrough. Drill up/down/expand-next-level buttons on the visual. [PBI-drillthrough]
- **Tableau**: hierarchy `+`/`−` on the axis header; also buildable via **parameter actions** (click Technology → filter to Technology → reveal its sub-categories). [Tableau-params, AimpointDigital]
- **Superset**: **Drill Down** requires a *pre-defined hierarchy*; the newer **Drill By** does **not** — right-click a chart element, pick any dataset column to group by, opens a modal adding a `GROUP BY` + filter. Drill By is the "hierarchyless, flexible" evolution. Needs `DRILL_BY` feature flag + `can_drill`/`can_write`/`can_samples` perms. [Superset-drill, Superset-search]
- **Metabase**: **"Break out by [time / location / category]"** in the drill menu — adds a grouping dimension (query-builder questions only, not native SQL). Plus **"Zoom in"** on histograms/binned/maps and **"See this [period] by [smaller period]"** on time series. [MB-drillthrough]
- **Sigma**: **drill-down control** + drilldown paths defined on control elements. [Sigma-controls]
- **Hex**: drill via **"View data"** on aggregated/date-truncated charts → raw unaggregated rows. [Hex-search]

### Drill-through (to a detail sheet / another page) [table-stakes for enterprise; advanced elsewhere]
- **Power BI** — the reference implementation:
  - Author builds a **destination page**, drags a field into the **Drillthrough filters** well.
  - PBI **auto-adds a Back button**.
  - Viewer **right-clicks a data point → Drillthrough → [page]**; destination opens **filtered to the clicked context**.
  - Can also be triggered by a **Drillthrough button** (action = Drillthrough, with conditional show/hide).
  - **Keep all filters** toggle carries the source page's filter context.
  - **Cross-report drillthrough** [advanced] — jump to a *different report* in the same workspace (must be enabled in settings; matching field names/types). [PBI-drillthrough]
- **Tableau**: **Go to Sheet** navigation action → other worksheet/dashboard/story in the workbook, carrying the selection as a filter. [Tableau-actions]
- **Metabase**: **Custom destinations** click behavior → go to a dashboard, saved question, or external URL; **pass clicked column values / current filter values** into the destination's parameters (`{{ColumnName}}` syntax). [MB-interactive]
- **Sigma**: actions **"Navigate in this workbook"**, **"Open Sigma doc"** (another workbook), **"Open link"**. [Sigma-actions]
- **Superset**: cross-dashboard navigation is weaker; drill-to-detail (below) is the primary detail path. → **[gap]** vs PBI/Tableau.
- **Hex**: navigate across app tabs / project filters; no formal "drillthrough page" object → **[advanced/partial]**.

### Drill-to-row-detail / view underlying records [table-stakes]
- **Superset**: **Drill to Detail** — right-click any chart → modal of the **atomic underlying rows** for the applied filter (e.g., click a country on an invoices chart → individual invoices). `DRILL_TO_DETAIL` flag; available all viz types. Known bug historically: "Drill to Detail by" could ignore applied filters (Issue #28562). [Superset-drill, Superset-issue]
- **Metabase**: **"View details"** (rows w/ a primary key), **"View these records"** (the rows behind an aggregate), **"View related records"** (foreign-key follow). [MB-drillthrough]
- **Power BI**: right-click visual → **Show data point as a table** / **See records**.
- **Hex**: **"View data"** / view-and-explore-underlying-data on any chart or table. [Hex-search]
- **Tableau**: **View Data** (the data window) on a mark → summary + underlying rows.
- **Sigma**: **Drill to detail** via context menu on tables/charts. [Sigma-actions]

---

## 3. Tooltips

### Tooltip on hover [table-stakes]
Every tool shows a data tooltip on hover of a mark. Authors can customize which fields appear.

### Hover-sync across charts [advanced]
Hovering one chart highlights the corresponding point in sibling charts (shared crosshair). Strongest in code-grade chart libs; in BI:
- **Superset** (ECharts-based) supports synchronized tooltips within compatible chart types. [Superset-echarts]
- **Hex** chart cells support linked hover within a cell. [Hex-charts]
- Tableau/Power BI: limited native cross-chart hover-sync — usually achieved via **highlight actions / cross-highlight** on *select*, not pure hover.

### Tooltips-as-mini-charts (report tooltips) [advanced — Power BI signature feature]
Power BI's **report/tooltip pages**: author designs a dedicated **tooltip page** with its *own visuals*; on hover over a mark, that mini-report pops up filtered to the hovered context — "more complex and detailed visualizations within the tooltip." Also supports **drillthrough-style tooltip** gateways. This is a genuine differentiator; most competitors only offer field-list tooltips. [PBI-search, FasterCapital]
- Sigma/Hex/Metabase/Superset: **field-value tooltips only** → **[gap]**.

---

## 4. Brush / Zoom / Pan / Range selection

- **Brush selection (rubber-band select multiple marks)** [table-stakes]: Tableau (lasso/rectangle marquee), Power BI (Ctrl-drag select), Superset/ECharts (brush), Hex (select datapoints → new filtered set). [Hex-charts]
- **Zoom / Pan** [table-stakes for maps; advanced for cartesian]: universal on **maps**; on cartesian axes, strongest in ECharts-based Superset (dataZoom slider) and Hex chart cells. Tableau/Power BI zoom is more limited on standard charts.
- **Range selection / axis brush → filter** [advanced]: drag a range on an axis to filter (time-range brush). Superset dataZoom, Hex visual filter. Tableau via **set actions "proportional brushing."**
- **Proportional brushing** [advanced — Tableau signature]: **Set actions** let a selection in one view define a set; other views color/size marks by "in-set vs out-of-set" proportions. [Tableau-sets]

---

## 5. Click-to-filter & Legend interactions

- **Click-to-filter** [table-stakes]: click a mark → filter the dashboard. All six support it (Tableau filter action, PBI cross-filter, Metabase update-dashboard-filter click behavior, Superset cross-filter, Sigma on-select action, Hex cross-filter).
- **Legend toggle (show/hide a series)** [table-stakes]: click a legend entry to hide/show that series — standard in chart engines (ECharts/Superset, Hex, Power BI legend).
- **Legend highlight (dim others, keep all)** [advanced]: clicking legend *highlights* rather than *removes* — Tableau **highlighter** on a legend; Power BI legend cross-highlight. Distinct from toggle.
- **Legend-item drill** [advanced]: Metabase lets you act on a **legend item** — "View these records / Break out by" for the *entire series*. [MB-drillthrough]

---

## 6. Parameter controls & what-if

### Basic parameter/control types [table-stakes]
Single-select, multi-select, range/slider, date, date-range, text input, boolean toggle:
- **Tableau**: **Parameters** (single value) + **Filter controls** (multi). Parameters are single-value by design; multi-select needs sets/filters. [Tableau-params]
- **Power BI**: **Slicers** (list/dropdown/range slider/relative-date/hierarchy) + **What-if parameters**.
- **Metabase**: **Dashboard filters** — text, number, date (incl. relative + range), location, ID; single & multi. [MB-filters]
- **Superset**: **Filter box / native dashboard filters** — value, range, time-range, time-grain.
- **Sigma**: **Control elements** — list, dropdown, date, number-range, text, checkbox, top-N; referenceable as parameters in calc columns. [Sigma-controls]
- **Hex**: **Input parameters** (dropdown, slider, date, text, multiselect) driving SQL/Python; **Project filters** (UI-first). [Hex-docs, Hex-filters]

### What-if parameters [advanced]
A parameter that feeds a *calculation* so viewers model scenarios:
- **Power BI**: **What-if parameter** creates a generated table + measure; a slider drives it; visuals recompute live. [PBI-whatif]
- **Tableau**: parameter → calc field → "what-if" (e.g., click a product to apply its discount to a revenue forecast). [Tableau-params]
- **Sigma/Hex**: control/input drives a formula/notebook → native what-if.
- **Metabase/Superset**: weaker — parameters mostly filter, not recompute arbitrary scenario math → **[gap]**.

### Dynamic axis / measure swap via parameter [advanced]
Let viewers switch *which* measure or dimension a chart shows:
- **Power BI**: **Field parameters** — swap measures OR dimensions from a slicer; mix both. **July 2025**: hierarchy-state persistence when switching (matrix keeps expand/collapse). Before that, switching collapsed the hierarchy. [PBI-fieldparams]
- **Tableau**: classic **swap-measures-using-parameters** pattern (parameter + CASE calc). [Tableau-swap]
- **Sigma**: change element columns/groupings/axis via action. [Sigma-actions]
- **Hex**: input parameter → chart cell axis binding.
- **Metabase/Superset**: limited; typically requires separate cards → **[gap]**.

---

## 7. Dashboard Actions (the author-wiring layer)

**Tableau's action taxonomy is the canonical reference.** Six action types, with a defined execution order (**Parameter → Set → Filter → Go to Sheet → Highlight → Go to URL**): [Tableau-actions]

| Tableau action | Effect | Class |
|---|---|---|
| **Filter** | Data from one view filters another | [table-stakes] |
| **Highlight** | Dim all but marks of interest | [table-stakes] |
| **Go to URL** | Hyperlink to web/file, `<Field>` params | [table-stakes] |
| **Go to Sheet** (navigation) | Navigate to worksheet/dashboard/story | [table-stakes] |
| **Change Parameter** (parameter action) | Click a mark → set a parameter value | [advanced] |
| **Change Set Values** (set action) | Click marks → change set membership | [advanced] |

Each action has a **trigger**: **Hover**, **Select**, or **Menu** — plus a **clearing rule** (keep filter / show all / exclude all values on deselect).

**Cross-tool mapping of the action layer:**

| Action intent | Tableau | Power BI | Metabase | Superset | Sigma | Hex |
|---|---|---|---|---|---|---|
| Filter action | ✅ Filter action | Cross-filter (Edit interactions) | Click→update filter | Cross-filter (flag) | Cross-element filter action | Auto cross-filter |
| Highlight action | ✅ Highlight action | Cross-highlight (Edit interactions) | ❌ | ❌ | ⚠ limited | ❌ |
| URL action | ✅ Go to URL | Web URL button / link | Custom dest = URL | Limited | ✅ Open link | Via markdown/link |
| Navigate action | ✅ Go to Sheet | Page navigation button / drillthrough | Custom dest = dashboard/question | ⚠ weak | ✅ Navigate in workbook | Tabs / project filters |
| Parameter action | ✅ Change Parameter | Field/what-if via bookmarks/buttons | ⚠ via filter | ❌ | ✅ Set control value | ✅ Set input |
| Set action | ✅ Change Set Values | ❌ (no set concept) | ❌ | ❌ | ⚠ via input tables | ⚠ via selection sets |
| Write-back action | ❌ | ❌ (native) | ⚠ (Actions) | ❌ | ✅ Input-table insert/update/delete | ✅ (Python write) |

Sigma is unusually rich on the write side: actions can **insert/update/delete input-table rows, call stored procedures, invoke Sigma agents, fire iframe/plugin events, export to Slack/webhook/cloud storage** — pushing "dashboard" toward "decision app." [Sigma-actions]

---

## 8. Bookmarks / Saved views / Personal views

- **Power BI**: **Bookmarks** [advanced] — capture full report state (filters, slicers, selection, cross-highlight, visibility, sort, drill level, spotlight). **Personal** vs **Report** bookmarks; chain into **buttons** and **navigators** for guided storytelling; can respond to slicer values. [PBI-search]
- **Tableau**: **Custom Views** (personal saved filter/param state) + workbook bookmarks (Desktop) → per-user saved state.
- **Metabase**: filter selections in a dashboard are shareable via URL; **"Reset to default"** returns to author defaults; can bookmark items in the nav. Personal view persistence is lighter.
- **Superset**: URL-encoded filter state / permalinks; "Save as" a dashboard copy.
- **Sigma**: **Bookmarks** on workbooks (saved control/filter state) [advanced].
- **Hex**: shared app URLs encode parameter state; project filters persist per view.

**Verdict:** first-class, state-capturing bookmarks are a **Power BI/Sigma [advanced]** strength; others rely on URL state.

---

## 9. Keyboard navigation, shortcuts, accessibility

- **Power BI** [table-stakes+]: extensive keyboard nav (Tab/arrows through visuals & data points), **Alt+Shift+F1** accessibility checker context, screen-reader/ARIA, high-contrast, focus mode, "Show data" via keyboard; accessibility is a documented pillar.
- **Tableau** [table-stakes]: keyboard navigation for published views, WCAG-oriented accessible viz mode.
- **Metabase / Superset / Sigma / Hex**: baseline keyboard support (tab through controls, enter to activate), but **deep data-point keyboard navigation + screen-reader parity is weaker** → **[advanced/gap]** relative to Power BI.

**Reading/Editing mode split (auth model that gates interactions):**
- **Power BI**: **Reading view** (interact with existing filters, save personal view, cannot add filters) vs **Editing view** (add any filter, wire interactions). [PBI-filters]
- **Metabase**: **View** vs **edit mode** (pencil) — click behavior only configurable in edit. [MB-interactive]

---

## 10. Undo / Redo & the selection model

- **Undo/Redo** [table-stakes in authoring; rare in consumption]: Tableau (full authoring undo stack), Power BI Desktop (Ctrl+Z authoring), Sigma/Hex (authoring undo). **Consumption-time undo** (revert a viewer's interaction) is generally handled by **"Reset to default"** (Power BI, Metabase) rather than a true undo stack. [PBI-filters, MB]
- **Selection model** [table-stakes]:
  - Single click = select one mark (usually replaces selection).
  - **Ctrl/Cmd-click** = additive multi-select; **Shift-drag / marquee** = range/brush select.
  - Click empty space / re-click = **deselect**.
  - Power BI: re-select or empty-space click clears cross-highlight. [PBI-filters]
  - Tableau: selection drives whichever actions are wired to "Select"; sticky vs. auto-clear governed by the action's clearing rule.
  - Metabase: a single click surfaces the **drill-through menu** (unless click behavior overrides it to filter/navigate). [MB-interactive]

---

## 11. Set actions — the Tableau deep cut [advanced]

**Set actions** (`Change Set Values`) let a viewer's on-viz selection rewrite the members of a **set**, which then drives calcs, colors, filters, or reference bands elsewhere. Canonical uses:
- **Proportional brushing** (part-to-whole of a selection),
- **Asymmetric drill-down**,
- **"Keep only these" persistent selections**,
- Custom what-if grouping.

No direct equivalent in Power BI (no set object), Metabase, or Superset. Sigma/Hex approximate via input tables / selection sets. This is the strongest single-tool interaction differentiator. [Tableau-sets, Tableau-params]

---

## 12. Master comparison matrix

Legend: ✅ first-class · ⚠ partial/workaround · ❌ absent · **[TS]** table-stakes · **[ADV]** advanced

| Primitive | Class | Tableau | Power BI | Metabase | Superset | Sigma | Hex |
|---|---|---|---|---|---|---|---|
| Cross-filter | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (auto) |
| Cross-highlight (dim, keep all) | TS/ADV | ✅ | ✅ | ❌ | ❌ | ⚠ | ❌ |
| Drill-down (hierarchy in place) | TS | ✅ | ✅ | ✅ | ✅ (Drill Down + Drill By) | ✅ | ⚠ |
| Drill-through (to detail page/sheet) | TS/ADV | ✅ Go to Sheet | ✅✅ (best) | ✅ custom dest | ⚠ | ✅ navigate | ⚠ tabs |
| Cross-report / cross-workbook drill | ADV | ⚠ | ✅ | ⚠ | ❌ | ✅ Open doc | ⚠ |
| Drill-to-row-detail | TS | ✅ View Data | ✅ | ✅ | ✅ Drill to Detail | ✅ | ✅ View data |
| Tooltip on hover | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hover-sync across charts | ADV | ⚠ | ⚠ | ❌ | ✅ (ECharts) | ⚠ | ✅ |
| Tooltip-as-mini-chart (report tooltip) | ADV | ⚠ (viz-in-tooltip) | ✅✅ (signature) | ❌ | ❌ | ❌ | ❌ |
| Brush / marquee select | TS | ✅ | ✅ | ⚠ | ✅ | ✅ | ✅ |
| Zoom / pan (cartesian) | ADV | ⚠ | ⚠ | ❌ | ✅ dataZoom | ⚠ | ✅ |
| Range/axis brush → filter | ADV | ✅ (set) | ⚠ | ❌ | ✅ | ⚠ | ✅ |
| Click-to-filter | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Legend toggle (hide series) | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Legend highlight (dim) | ADV | ✅ | ✅ | ❌ | ⚠ | ⚠ | ⚠ |
| Single-select control | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-select control | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Range/slider control | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Date / date-range control | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| What-if parameter (recompute) | ADV | ✅ | ✅ | ⚠ | ❌ | ✅ | ✅ |
| Dynamic measure/dimension swap | ADV | ✅ (calc) | ✅ Field params | ⚠ | ⚠ | ✅ | ✅ |
| Filter action (author-wired) | TS | ✅ | ✅ Edit interactions | ✅ click behavior | ✅ flag | ✅ action | ✅ |
| Highlight action | ADV | ✅ | ✅ | ❌ | ❌ | ⚠ | ❌ |
| URL action | TS | ✅ | ✅ | ✅ | ⚠ | ✅ | ⚠ |
| Navigate/go-to-sheet action | TS | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ |
| Parameter action (click sets param) | ADV | ✅ | ⚠ (buttons/bookmarks) | ⚠ | ❌ | ✅ | ✅ |
| Set action | ADV | ✅✅ (unique) | ❌ | ❌ | ❌ | ⚠ | ⚠ |
| Write-back / data mutation action | ADV | ❌ | ❌ | ⚠ | ❌ | ✅✅ (input tables) | ✅ (Python) |
| Bookmarks / saved views | ADV | ✅ Custom Views | ✅✅ Bookmarks | ⚠ URL | ⚠ permalink | ✅ | ⚠ URL |
| Personal (per-user) saved state | ADV | ✅ | ✅ | ✅ save view | ⚠ | ✅ | ⚠ |
| Deep keyboard nav + a11y | TS/ADV | ✅ | ✅✅ (best) | ⚠ | ⚠ | ⚠ | ⚠ |
| Reset-to-default | TS | ⚠ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Authoring undo/redo | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-select selection model (Ctrl/Shift) | TS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 13. Per-tool interaction personality (one-liners for design decisions)

- **Tableau** — richest *declarative action model*; the only tool with **set actions** + **parameter actions** as the composable primitive; hover/select/menu triggers with explicit clearing rules.
- **Power BI** — best **drillthrough (incl. cross-report)**, best **report tooltips (mini-charts)**, best **bookmarks**, best **field/what-if parameters**, best **accessibility**; interaction wiring is per-visual **Edit interactions** (Filter/Highlight/None).
- **Metabase** — the cleanest **click-behavior** model (3 options: drill menu / custom destination / update filter) and the most *automatic* drill-through menu; native-SQL cards lose query-rewriting drills.
- **Superset** — **feature-flagged** power drills (**Drill to Detail**, **Drill By**), **bi-directional scoped cross-filters**, ECharts zoom; weaker on cross-highlight and cross-report navigation.
- **Sigma** — the **20-category action engine** turns dashboards into **decision apps** (write-back to input tables, stored procs, exports, agents); cross-element filtering + drill controls.
- **Hex** — **zero-config auto cross-filtering** + notebook **input parameters/project filters**; every chart/table is drillable/explorable; interaction model blends BI with data-app/Python.

---

## 14. If you're building DBExec's interaction model — the priority ladder

**Ship first (table-stakes; you cannot be credible without these):** click-to-filter, cross-filter with author-controllable per-target interaction (filter/highlight/none), tooltip-on-hover with field config, hierarchy drill-down, drill-to-row-detail, single/multi/range/date controls, legend toggle, multi-select selection model (Ctrl/Shift), reset-to-default, authoring undo/redo.

**Fast-follow differentiators (advanced, high ROI):** cross-highlight (dim-others), drill-through to a detail sheet carrying context + Back, dynamic measure/dimension swap via parameter, what-if parameters, bookmarks/saved views, parameter actions (click a mark → set a param).

**Long-tail power features:** report-tooltip mini-charts (PBI-style), set actions / proportional brushing (Tableau-style), cross-report/cross-dashboard drill, write-back actions (Sigma-style), deep keyboard/a11y parity, axis-brush zoom/pan.

---

## Sources

- [Tableau-actions] Tableau — *Actions* (types, execution order): https://help.tableau.com/current/pro/desktop/en-us/actions.htm
- [Tableau-params] Tableau — *Use Parameters to Make Views More Interactive* / *Parameter Actions*: https://help.tableau.com/current/pro/desktop/en-us/changing-views-using-parameters.htm · https://help.tableau.com/current/pro/desktop/en-us/actions_parameters.htm
- [Tableau-swap] Tableau — *Example: Swap Measures Using Parameters*: https://help.tableau.com/current/pro/desktop/en-us/parameters_swap.htm
- [Tableau-sets] Tableau — *Set Actions* (proportional brushing): https://help.tableau.com/current/pro/desktop/en-us/actions_sets.htm
- [AimpointDigital] *Interactive Tableau Dashboards: Drill Downs Using Parameters*: https://www.aimpointdigital.com/blog/tableau-dashboards-drill-downs-using-parameters
- [PBI-filters] Microsoft Learn — *Filters and highlighting in Power BI reports* (cross-filter vs cross-highlight, Reading/Editing, reset): https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-filters-and-highlighting
- [PBI-interactions] Microsoft Learn — *Change how visuals interact*: https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions
- [PBI-drillthrough] Microsoft Learn — *Drillthrough in Power BI Reports* (drill mode vs drillthrough, back button, cross-report): https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough
- [PBI-fieldparams] Microsoft Learn — *Use Field Parameters* (+ July 2025 hierarchy persistence): https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-field-parameters
- [PBI-whatif] Microsoft Learn — *Use Parameters to Visualize Variables (What-if)*: https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-what-if
- [PBI-search] Graphed — *What is Cross Highlighting in Power BI*: https://www.graphed.com/blog/what-is-cross-highlighting-in-power-bi · [FasterCapital] *Cross-filtering through Power BI Tooltips*: https://fastercapital.com/content/Cross-filtering--Mastering-Cross-filtering-through-Power-BI-Tooltips.html
- [MB-interactive] Metabase — *Dashboard interactivity / click behavior*: https://www.metabase.com/docs/latest/dashboards/interactive
- [MB-drillthrough] Metabase — *Drill-through* (full menu options): https://www.metabase.com/docs/latest/questions/visualizations/drill-through
- [MB-filters] Metabase — *Dashboard filters*: https://www.metabase.com/docs/latest/dashboards/filters · [MB cross-filter tutorial] https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/dashboards/cross-filtering
- [Superset-drill] Preset — *From Drill Down to Drill By*: https://preset.io/blog/drill-down-and-drill-by/
- [Superset-search / Superset-issue] Apache Superset — Drill workflows discussion: https://github.com/apache/superset/discussions/37095 · *Drill to Detail ignores filters* #28562: https://github.com/apache/superset/issues/28562
- [Superset-echarts] Preset — *Enhancing Superset Visualization Plugins*: https://preset.io/blog/enhancing-superset-visualization-plugins-part-1/
- [Sigma-actions] Sigma — *Intro to actions*: https://help.sigmacomputing.com/docs/intro-to-actions · InterWorks *Sigma Action Guide*: https://interworks.com/blog/2025/07/24/the-sigma-action-guide/
- [Sigma-controls] Sigma — *Intro to control elements* · *Create cross-element filters* · *Drill down control*: https://help.sigmacomputing.com/docs/intro-to-control-elements · https://help.sigmacomputing.com/docs/create-cross-element-filters · https://help.sigmacomputing.com/docs/drill-down-control
- [Hex-docs / Hex-filters] Hex — *App builder* · *Project filters* · *Filter cells*: https://hex.tech/product/app-builder/ · https://learn.hex.tech/docs/share-insights/apps/project-filters · https://learn.hex.tech/docs/explore-data/cells/transform-cells/filter-cells
- [Hex-charts / Hex-changelog / Hex-search] Hex — *New chart cells* · *3.0 auto cross-filter changelog* · *View & explore underlying data*: https://hex.tech/blog/new-chart-cells/ · https://learn.hex.tech/changelog/2023-10-05 · https://learn.hex.tech/changelog/2023-09-07

**Confidence notes:** cross-filter/highlight semantics, PBI drillthrough mechanics, Tableau action taxonomy, Metabase drill menu, and Superset drill flags are drawn from **vendor primary docs** (high confidence). Hover-sync, zoom/pan, and legend-highlight granularity vary by chart engine and version and are marked ⚠ where behavior is conditional. The "advanced/gap" labels for Metabase/Superset/Hex on cross-highlight and report-tooltips reflect absence in current docs, not a guarantee it will never ship.