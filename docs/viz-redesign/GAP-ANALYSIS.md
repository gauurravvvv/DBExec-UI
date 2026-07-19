# DBExec Visualization Tool — Gap Analysis & Redesign Spec

> Produced 2026-07-17 from a fan-out audit of the DBExec viz code + market-standard
> research against Tableau, Power BI, Metabase, Superset, Looker, Mode, and modern
> tools (Hex, Sigma, Preset, Observable Plot). Four focus areas, each with: what we
> have today, the market must-have checklist ([table-stakes] vs [nice-to-have]), an
> honest gap table (have / partial / missing + P0/P1/P2), and stack-specific
> (Angular 18 + PrimeNG 19 + ECharts) redesign recommendations.
>
> **DBExec already ships 24 chart types.** The weak point is NOT chart coverage —
> it is the config-panel UX, the chart card chrome / ECharts theme, and the
> interaction model. This doc is diagnosis + plan; no code changed. See
> `visual-box-mockup` artifact for the proposed redesign visual.

## Contents
1. [Config Panel UX](#config-panel-ux)
2. [Chart Visual Polish & Card Chrome](#chart-visual-polish--card-chrome)
3. [Chart Types & Per-Chart Features](#chart-types--per-chart-features)
4. [Interaction Model](#interaction-model)

---


## Config Panel UX

DBExec's visualization config panel is a single monolithic sidebar (`visual-config-sidebar.component.html`, 4,181 lines / 67 sections) plus a separate chart-picker + field-role sidebar (`visuals-chart-sidebar`). It is functionally deep but structurally flat — a breadth-first property sheet rather than a task-oriented, progressively-disclosed editor. This section inventories what exists, states the market bar, maps the gap honestly, and gives stack-specific redesign steps.

---

### 1. What DBExec has today

**Structure & layout primitives**
- Single vertical-scroll sidebar; no top-level tabs, no Data-vs-Format split.
- Layout CSS vocabulary: `config-section` (67), `config-group` (236 — label + control vertical stack), `config-row` (110 — label + right-aligned compact control), `config-subsection` (5 — nested conditional container), `config-card` (2 — repeating-row container), `sidebar-divider` (1), `section-title` (per-section h3-like heading).
- Sections gated by `*ngIf` on `focusedVisual.chartType` and `config` keys. Hidden controls are removed from the DOM, not disabled.
- No accordion / collapse. No search box. No section anchor nav. Everything applicable is always expanded.

**Data / encoding controls (Data section, D4 server aggregation)**
- Dimension dropdown, Measure dropdown (numeric-filtered), Aggregate dropdown (DB-driven reference data + `NONE` pseudo-entry), Percentile input (1–99, conditional on `aggregate='percentile'`).
- Combo extra-measures CRUD: per-measure `config-card` (column dropdown + aggregate dropdown + alias input + delete); `addComboMeasure()` / `updateComboMeasure()` / `removeComboMeasure()`.

**Field-to-encoding assignment (separate `visuals-chart-sidebar`)**
- NOT drag-drop shelves. Role-slot + field-tree-click model.
- `getRoleSlots()` → chart-specific role set from `getChartRoles(chartType)`; required slots first, optional after; each slot carries `key`, `label` (i18n), `required`, `multi`.
- Slot row shows label + bound-column chip(s) + clear ✕. Click slot toggles `activeAxisSelection`; parent's field-tree click calls `setRoleOnVisual(visual, role, columnName)`. Multi roles (indicators/dimensions/valueColumns) append/splice chips.
- Field tree lives in a physically separate sidebar from the role slots.

**Analytics section (E1, cartesian families only)**
- Dual-axis toggle → right-axis-name input + series editor (`config-card` per series: name / type bar|line / yAxisIndex 0|1 / delete).
- Trend dropdown (none/linear/log/poly/movingAverage/forecast) with conditional window / forecastPeriods / degree sliders.
- Quick Calc dropdown (running_total / percent_of_total / difference / percent_difference / moving_average / rank) + conditional window slider.
- Compare Mode dropdown (none / previous_period / same_period_last_year) + conditional dateColumn dropdown.
- Small Multiples toggle → facet-column dropdown + max-cols slider (1–6).

**Data & Format section (Slice C, cartesian)**
- Sort (by none/dimension/measure/value + direction), Limit (top/bottom + count slider 1–1000), Stacking (none/total/percent), Null handling (gap/connect/zero).
- Value format object: kind (auto/number/currency/percent/date), target (value/label), decimals (0–6), currency code (3-char), date pattern, thousands toggle.
- Axis scale: type (linear/log) + Y min/max nullable inputs.

**Presentation sections (chart-capability gated)**
- Histogram (bins, show counts); Interaction / cross-filter (E2: enable + target mode same-tab/dashboard/visuals + sibling multiselect); Table options (compact / striped / row numbers); Table columns (per-column visibility toggle, humanized label); Axis (show X/Y, grid, labels + text, X rotation, autoscale, min/max, boundary gap, inverse X/Y); Data labels (show, position, font size, content); Legend (show + position + type, dynamic title); Tooltip (enable inverted, trigger, axis pointer); Gradient (fill toggle); Animation (enable, duration, easing); Interactive (data zoom, toolbox).
- Chart-type-specific blocks (60+): Bar, Line/Area, Pie, Radar/Polar, Gauge, Card, Scatter/Effect-scatter, plus Funnel/Sankey/Tree/Treemap/Sunburst/Graph. Each an `*ngIf` island of sliders/toggles/dropdowns.

**Architecture & state**
- `ChangeDetectionStrategy.OnPush` + `ngDoCheck` JSON-snapshot diffing to catch PrimeNG synthetic events; emits `configChanged` via microtask defer.
- Config is an untyped blob on `focusedVisual.config`; 40+ getter/setter pairs normalize null/undefined boundaries; lists immutably swapped.
- No formal schema, no state machine, no undo/redo, no per-section reset, no defaults restore. Chart-type switch does not remap dimension/measure fields.
- Controls all wrapped in shared `app-custom-*` (dropdown/number/toggle/input/multiselect/calendar). i18n: 40+ dropdown arrays localized at init and re-localized on language change.

---

### 2. What the market standard requires (must-have checklist)

Each item tagged **[table-stakes]** (a mature BI config panel is judged broken without it) or **[nice-to-have]** (differentiator / polish).

**Structure**
1. Split into **Data/Encoding vs Format/Style** regions (top tabs or clearly divided), Data first. **[table-stakes]**
2. Sort every control by the **re-query test** — changes the query → Data; only repaints → Format. **[table-stakes]**
3. **Collapsible accordion sections** with headers inside each tab; most **collapsed by default**. **[table-stakes]**
4. **Section names identical across all chart types** — same control, same place, every time. **[table-stakes]**
5. Separate **chart-intrinsic** formatting from **container/chrome** formatting (title, background, border, padding). **[nice-to-have]**

**Field assignment**
6. **Named wells/dropzones** labelling the encoding role (Axis, Value, Color, Size, Detail, Tooltip). **[table-stakes]**
7. Accept **both drag-and-drop and click-to-pick**; allow dropping onto the empty chart directly. **[nice-to-have]** (drag) / click-to-pick **[table-stakes]**
8. Dropped fields render as **interactive pills** — click to change aggregate / date-trunc / sort / label / remove; drag to reorder. **[table-stakes]** for aggregate-on-pill, **[nice-to-have]** for reorder-drag.
9. **Enforce channel cardinality** (single vs multi-field wells) in the UI. **[table-stakes]**
10. **Wells change per chart type**; selecting a chart reveals only valid encodings. **[table-stakes]**

**Progressive disclosure**
11. **Reveal-when-relevant**, preferring **disabled-with-tooltip over hidden** for context-dependent controls. **[nice-to-have]**
12. A guided **chart-type picker** indicating which types are valid for current fields (Show-Me). **[nice-to-have]**
13. **Search box** over sections/controls once the panel exceeds ~15 sections. **[table-stakes at DBExec's scale]** (67 sections).
14. An **escape hatch to raw config** (ECharts option JSON / advanced editor). **[nice-to-have]**

**Format quality**
15. **Number & date format editors** with live preview (precision, separators, currency/percent, prefix/suffix, truncation). **[table-stakes]**
16. **Axis controls**: title toggle+text, scale type, min/max, label rotation, dual-axis. **[table-stakes]**
17. **Color**: named + custom palettes, per-series override, conditional/data-driven color. **[table-stakes]** for palettes+per-series, **[nice-to-have]** for data-driven.
18. **Per-column table config**: hide (eye), drag-reorder, per-column format sub-panel, conditional-format rules. **[table-stakes]** for hide+format, **[nice-to-have]** for reorder.
19. **Labels/legend/tooltip** toggles, positioning, customizable tooltip fields. **[table-stakes]** toggles/position, **[nice-to-have]** custom tooltip fields.

**Behaviour & feel**
20. **Format changes repaint instantly, never re-query** (debounced, client-side). **[table-stakes]**
21. **Reset-to-default per section** and a **clear-all fields+formatting** action. **[table-stakes]** for reset, **[nice-to-have]** for clear-all.
22. Config maps **1:1 to a serializable schema object** → free undo/redo, templating, copy-between-charts. **[nice-to-have]** (foundational; unlocks 23+).
23. **On-object / in-context editing** so config lives next to the chart. **[nice-to-have]**

---

### 3. Gap table

| Capability | DBExec status | Priority |
|---|---|---|
| Data-vs-Format top-level split (checklist #1) | **missing** — one flat scroll, presentation and query controls interleaved | **P0** |
| Re-query sorting rule for controls (#2) | **missing** — no `renderTrigger`-style classification; aggregation sits near styling | **P0** |
| Collapsible accordion sections, collapsed-by-default (#3) | **missing** — 67 always-expanded `config-section`s | **P0** |
| Section names consistent across chart types (#4) | **partial** — shared sections (Axis/Legend/Tooltip) are consistent, but 60+ chart-specific islands each define their own local ordering/naming | **P1** |
| Chart-intrinsic vs container/chrome formatting split (#5) | **missing** — no "General/Container" grouping; title/background/border scattered or absent | **P1** |
| Named encoding wells (#6) | **partial** — role slots exist (`getRoleSlots`) and are labelled, but read as a settings list, not as wells/dropzones | **P1** |
| Drag-and-drop + click-to-pick assignment (#7) | **partial** — click-to-pick via slot→tree works; no drag-drop; field tree is in a separate sidebar (poor adjacency) | **P1** (drag P2) |
| Interactive pills with inline aggregate/sort/trunc (#8) | **partial** — bound columns render as chips with clear ✕, but chip is not clickable for aggregate/date-trunc; aggregate lives in a far-away Data dropdown | **P0** |
| Channel cardinality enforcement (#9) | **have** — `multi` flag on slots drives append vs replace | **P2** (already covered) |
| Wells change per chart type (#10) | **have** — `getChartRoles(chartType)` returns per-type slots | **P2** (already covered) |
| Reveal-when-relevant, disabled-with-tooltip (#11) | **partial** — reveal-when-relevant via `*ngIf` yes; disabled-with-tooltip no (controls vanish, no explanation) | **P1** |
| Guided chart-type picker / Show-Me (#12) | **missing** — chart picker exists but does not validate against current field roles | **P2** |
| Search across panel (#13) | **missing** — no filter box over 67 sections | **P0** (scale makes this mandatory) |
| Escape hatch to raw ECharts option JSON (#14) | **missing** — no advanced editor; GUI is a hard ceiling | **P2** |
| Number/date format editor w/ live preview (#15) | **partial** — `valueFormat` object has kind/decimals/currency/date/thousands, but no live sample preview, no prefix/suffix | **P1** |
| Axis controls (#16) | **have** — title text, scale type, min/max, rotation, dual-axis all present | **P2** (polish only) |
| Color palettes + per-series override + conditional (#17) | **partial** — `colorScheme` default exists; conditional-formatting rules exist (`addConditionalRule`); no visible palette swatches, no per-series color picker preview | **P1** |
| Per-column table config (#18) | **partial** — visibility toggle + humanized label present; no drag-reorder, no per-column format sub-panel (ties to task #1027) | **P1** |
| Labels / legend / tooltip controls (#19) | **have** — full toggle+position+type coverage | **P2** (polish) |
| Format repaint never re-queries (#20) | **partial** — `configChanged` fires uniformly; parent cannot distinguish repaint-only from re-query mutations, so styling changes may trigger avoidable work | **P0** |
| Reset-to-default per section / clear-all (#21) | **missing** — no reset anywhere | **P1** |
| Config as serializable schema (#22) | **missing** — untyped `config` blob, 40+ hand-written getter/setters, no undo/redo | **P1** (foundational) |
| On-object / in-context editing (#23) | **missing** — config only in the distant rail | **P2** |
| Header / separator / sectioning visual quality (user-flagged) | **partial/below-standard** — lone `sidebar-divider`, plain `section-title` h3s, no sticky header, no group affordance; reads as an unstyled property dump | **P0** |

---

### 4. Concrete redesign recommendations for DBExec

These are stack-specific: PrimeNG 19 components, ECharts option surface, and the existing `config-section` / `config-group` / `config-row` / `sidebar-divider` structure. Ordered P0 → P2.

#### 4.1 Fix the header, separators, and sectioning (P0 — the user-flagged eyesore)

The current panel reads as "below standard" because of three concrete things: a single hairline `sidebar-divider`, plain `<h3>`-style `section-title` labels with no hierarchy, and every section forced open. Fix in place without a rewrite:

- **Sticky panel header.** Replace the lone divider with a persistent header bar at the top of the sidebar: focused-visual name + chart-type icon on the left, and on the right an overflow menu (`p-menu`) holding "Reset section", "Reset all", "Advanced JSON". Give it `position: sticky; top: 0` inside the scroll container, a solid background, and a bottom `1px` border that reads as the primary separator — retire the ad-hoc `sidebar-divider`.
- **Convert `config-section` → PrimeNG `p-accordion` panels.** Each of the 67 sections becomes a `p-accordionpanel` with the `section-title` promoted to the `p-accordionheader`. Set `[multiple]="true"` so several can be open at once, and drive `[value]` (open-tab array) from a small `openSections: string[]` on the component so open/closed state survives chart re-render and language change. Default state: only **Data** and the current chart-type's **primary options** panel open; everything else collapsed. This alone removes the "4,181-line wall" feeling.
- **Section header affordance.** Add to each accordion header: a leading category icon (data / analytics / axis / style), a right-aligned count/summary chip (e.g. "3 set") so a collapsed section still tells you if it holds non-default values, and a per-section reset icon-button that only appears when the section differs from defaults.
- **Group typography, not just dividers.** Introduce a two-level visual rhythm: accordion-header (section) → optional `config-subsection` caption inside. Style `section-title` as a small-caps / uppercase tracked label at reduced weight (matches most modern BI rails), and drop inline `<hr>`-style dividers between `config-group`s in favour of consistent vertical spacing tokens. The goal: separation comes from spacing + accordion chrome, not from lines.
- **`config-row` vs `config-group` consistency.** Right now 110 compact rows and 236 stacked groups mix within one section. Pick the rule: boolean toggles and single dropdowns → `config-row` (label left, control right); anything with a sub-control, slider with a live value, or multi-line input → `config-group` (stacked). Apply mechanically so the eye learns one layout per control shape.

#### 4.2 Introduce Data vs Format tabs sorted by the re-query test (P0 — checklist #1, #2, #20)

- **Two `p-tabs` (PrimeNG 19 `p-tablist`/`p-tabpanel`) at the top of the sidebar: `Data` and `Format`.** Data leads. The `visuals-chart-sidebar` role slots + field tree fold into the Data tab so encoding and aggregation live together (fixes the "field tree in a separate sidebar" adjacency gap, #7).
- **Classify every section with a boolean `reQueries`.** Data tab = sections whose mutation changes the SQL: dimension/measure/aggregate/percentile, combo measures, sort, limit/top-N, stacking, null-handling-that-affects-query, quick-calc, compare-mode, small-multiples facet, histogram bins. Format tab = pure repaint: axis chrome, labels, legend, tooltip, gradient, animation, colors, chart-type cosmetic options, table striping/compact.
- **Make `configChanged` carry the classification** so the parent stops over-rendering (#20). Change the emit to `configChanged.emit({ config, requiresRequery: boolean })`; format-only mutations skip the server round-trip and just re-run `chart.setOption(...)`. Today `ngDoCheck` JSON-diffs blindly and the parent can't tell — this is the single highest-leverage behavioural fix. Keep the OnPush + snapshot machinery; only enrich the event payload.

#### 4.3 Add a config search box (P0 — checklist #13)

At 67 sections, blind scrolling is the dominant complaint. Add a `p-iconfield` search input pinned under the sticky header. Build a static index at init: `{ sectionKey, controlLabel, keywords[] }` per control (you already localize 40+ label arrays — index those same strings). On input, auto-expand matching accordion panels and dim non-matches, or render a flat filtered result list. Because labels are already i18n-resolved at init, re-index on language change alongside the existing `localizeDropdownOptions()` call.

#### 4.4 Make bound fields interactive pills (P0 — checklist #8)

The role-slot chip should become the control surface for its own aggregate, not a passive tag:

- Wrap each bound column in a `p-chip` (or the shared `app-chip`) that, on click, opens a `p-popover` sub-editor: **column ▸ aggregate ▸ (percentile value | date-truncation) ▸ alias ▸ remove**. This pulls the Data-section aggregate dropdown *onto the field it applies to* and makes combo/extra-measure CRUD feel native rather than a detached `config-card` list.
- Show the aggregate inline on the chip label: `SUM(Revenue)`, `AVG(Latency)`, `P95(Duration)`. This is the "aggregation pill" the audit found missing and is the biggest single discoverability win.
- Reuse existing setters (`updateComboMeasure`, `setRoleOnVisual`, `percentileValue`) as the popover's write path — no new state model required for a first cut.

#### 4.5 Consistent, per-type sections + disabled-with-tooltip (P1 — #4, #11)

- **Normalize the 60+ chart-specific islands** to a shared section template so "Bar options", "Line/Area options", "Pie options" all use the same header, ordering convention (geometry → labels → cosmetic), and control layout. Same setting → same place → same name across types.
- **Replace vanishing `*ngIf` controls with `[disabled]` + tooltip** where a control is only inapplicable due to a sibling setting (not due to chart type). Example: smoothness slider when `smooth=false` should show disabled with tooltip "Enable Smooth curve to adjust smoothness", not disappear. Keep `*ngIf` for genuinely chart-type-irrelevant controls. PrimeNG controls already support `[disabled]` + `pTooltip`; wrap the `app-custom-*` shells to forward both.

#### 4.6 Format polish: live preview, palettes, per-column tables (P1 — #15, #17, #18)

- **Number/date format live sample.** Under the `valueFormat` group, render a read-only sample line ("1,234.56 → $1.2K" / "2026-07-18 → Jul 18") recomputed from the current format object. Add prefix/suffix inputs. This turns an abstract dropdown set into a WYSIWYG.
- **Palette swatches.** Replace the bare `colorScheme` dropdown with a swatch-strip picker (render each palette as a row of color squares) + a custom-palette editor using `p-colorpicker` per stop. Add a per-series color override list keyed off resolved series names, writing into the ECharts `color[]` / per-series `itemStyle.color`.
- **Per-column table sub-panel (ties to task #1027).** In the Table Columns section, each column row gets: eye toggle (have), display-name input, description, and a per-column format popover reusing the `valueFormat` editor. Add drag-reorder via `pDraggable`/`pDroppable` writing column order back to config. Conditional formatting already exists (`addConditionalRule`) — surface it per-column here rather than globally.

#### 4.7 Reset, defaults, and schema foundation (P1 — #21, #22)

- **Per-section + global reset.** Define a `CHART_CONFIG_DEFAULTS[chartType]` map. The per-section reset icon (4.1) diffs the section's keys against defaults to decide visibility and to perform the reset; the header overflow menu holds "Reset all formatting" (Format-tab keys only) and "Clear fields" (Data-tab roles). This is cheap given config is already a plain object.
- **Type the config blob incrementally.** The untyped `focusedVisual.config` + 40+ hand-written getters is the root cause of no-undo, no-templating, and fragile chart-type switches. Introduce a `VisualConfig` interface and a single `patchConfig(path, value)` writer that all setters funnel through. Once every mutation flows through one serializable path you get undo/redo (keep a bounded history stack), copy-config-between-visuals, and safe chart-type migration (map shared keys, drop unknown) almost for free. This is foundational for #23 (on-object editing) later. Do it behind the existing getter/setter API so the template needn't change in the same pass.

#### 4.8 Escape hatch + Show-Me (P2 — #12, #14)

- **Advanced ECharts JSON editor** at the bottom of the Format tab (collapsed accordion panel): a code editor bound to a `config.echartsOverride` object deep-merged into the generated option. Gives power users a ceiling instead of a wall; low effort since the render path already builds an ECharts option.
- **Field-aware chart picker.** Extend `visuals-chart-sidebar`'s picker so `getChartRoles` is inverted: given the currently bound fields, grey out chart types whose required roles can't be satisfied — DBExec's Show-Me equivalent.

**Sequencing.** Ship 4.1 (header/separator/sectioning) and 4.3 (search) first — they are pure presentation over the existing DOM and directly answer the user's "below standard" flag with the least risk. Then 4.2 + 4.4 (tabs + pills) for the structural leap, 4.5–4.7 for parity, 4.8 for polish.


---


## Chart Visual Polish & Card Chrome

DBExec renders every dashboard/analysis visual inside a `.visual-box` card that wraps a `app-chart-renderer` dispatcher, which in turn fans out to `app-echart-visual` (ECharts), `app-configurable-card-chart` (KPI cards), or `app-table-visual` (tables/pivots). The chrome, the render pipeline, and the config panel around these are functional but sit below the polish bar set by Tableau, Power BI, Looker Studio, Metabase, Superset, Hex, and Sigma. This section inventories what exists, states the market must-haves, maps the gaps honestly, and gives concrete, stack-specific redesign moves.

---

### 1. What DBExec has today

**Card container (`.visual-box`)**
- Real card frame: `var(--card-background)` fill, `1.5px solid var(--border-color)` border, `var(--radius-lg)` corners, `0 1px 4px var(--shadow-color)` resting shadow escalating to `0 4px 16px` on hover.
- Rich interaction states already wired: `.focused` (primary border + double-ring shadow + z elevation), `.resizing` (primary border, z-index 50), `.dragging` (opacity 0.4 + scale 0.97), `.disabled` (opacity 0.35 + grayscale), `.drop-target` (dashed primary border + tinted bg).
- Fixed 36px header (`.visual-inline-title`): `0 10px` padding, `var(--space-3)` gap, `card-background` fill, `1px` bottom border, `grab`/`grabbing` cursor doubling as the drag handle for reordering.
- Body (`.visual-body`) with a `.chart-click-guard` event wrapper and `padding: var(--space-0)` (0px) — chart is flush to the frame edges.

**Header actions (`.visual-action-buttons`, 7+ icon buttons crammed into the 36px bar)**
- Cross-filter toggle (`pi pi-filter`, `.active` state), legacy maximize (`pi pi-window-maximize`), focus/expand overlay (`pi pi-expand`), duplicate (`pi pi-copy` with loading spinner), export PNG (`pi pi-image`, ECharts only, 2× pixelRatio via `getPngDataUrl()`), export CSV (`pi pi-file-export`, always available), move-to-tab (`pi pi-arrow-right-arrow-left` + `.move-tab-menu` overlay, multi-tab only), delete (`pi pi-times`). All `app-button size="sm" variant="icon"` with `tooltipPosition="top"`.

**Render dispatch (`app-chart-renderer`)**
- Three-branch `*ngIf` on `isTableChartType` / `isCardChartType` / ECharts-with-`hasRequiredChartFields`. Inputs `configVersion`/`dataVersion` drive shallow-clone vs data re-read; `chartSelect` output for cross-filter.

**ECharts render (`app-echart-visual`)**
- `renderReady` gate: `glReady` (dynamic `echarts-gl` import for GL types) + `mapReady` (world.json GeoJSON + `registerMap()`); spinner via `#glLoading` template.
- `initOpts { renderer:'canvas', useDirtyRect:true }`, full-replace `[options]` vs incremental `[merge]`, size = inputs − 10px, `chartInit`/`chartClick` events.
- **All legend / tooltip / axis / color styling is ECharts default** — no DBExec theme registered.

**Card chart (`app-configurable-card-chart`)**
- CSS Grid `repeat(auto-fill, minmax(140px,1fr))`, `.card-item` (80px min, `radius-md`, hover `translateY(-2px)`), 4px top `.card-band` (opacity 0.7), `.card-value` (`fs-h1`, semibold), `.card-label` (`fs-label`, ellipsis, opacity 0.85), `cardFadeIn` keyframe when `.animated`. Config surface: `cardColor / bandColor / textColor / emptyColor / innerPadding / animations / colorScheme`.

**Table visual (`app-table-visual`)**
- PrimeNG `p-table.modern-table`, virtual scroll >100 rows, flat + pivot/crosstab modes, auto column derivation + numeric inference + humanized labels, density (`.is-compact` 32px) + `.is-striped`, per-cell conditional formatting (`resolveConditionalStyle()`), server-side subtotal/grand-total footer rows, distinct empty/no-columns/no-match states, `tabular-nums` on numerics, em-dash for null.

**States**
- Table has all four states. But card-level (`.visual-content-placeholder`, `.visual-loading-placeholder`, `.visual-error-placeholder`, `--missing-field` variant) are text + generic `pi-spinner` only: no skeleton/shimmer, no retry button, no error-detail expander, no CTA button.

---

### 2. What the market standard requires

Each item marked **[table-stakes]** (every benchmark tool ships it; users will read its absence as "unfinished") or **[nice-to-have]** (differentiator; 2–3 tools ship it).

**A. Card chrome / anatomy**
- Header with insight-led **title** (≤8 words) **[table-stakes]** + optional **subtitle** for source/timeframe/units as a separately styled block **[table-stakes]**.
- Single **kebab `⋮` overflow menu** consolidating secondary actions instead of a row of raw icons **[table-stakes]**.
- Optional **divider** between header and plot with independent spacing control **[nice-to-have]** (Power BI ships it explicitly).
- Frame = background + 1px border + 8–12px radius + optional soft shadow, all tokenized and light/dark-matched **[table-stakes]**.
- **Per-side padding** token (≈16px card, 8px header→plot) **[table-stakes]**.
- Edit-mode **resize handles (corner + edge) + drag grip** with no content jitter **[table-stakes]**.
- **Footer/caption** slot (notes, last-updated) **[nice-to-have]**.

**B. Card-local typography scale**
- Title 16/600, subtitle 13/400 muted, axis 12, tick/legend 11–12, tooltip headline 13–14 bold + secondary 11–12 muted; never <11px **[table-stakes]**.
- **Tabular figures** everywhere numbers align **[table-stakes]**.

**C. Legend**
- Present, near the chart, position configurable **[table-stakes]**.
- **Click-to-toggle** series with de-emphasized hidden state **[table-stakes]**.
- Auto-hide + **direct labeling** for single series / ≤4 points **[nice-to-have]**.
- 8-position + font-size control (Sigma-level) **[nice-to-have]**.

**D. Tooltip**
- On hover **and keyboard focus**, consistent placement, never blocks the mark **[table-stakes]** (keyboard = a11y table-stakes).
- Dimension context + exact value, ≤2–3 metrics, bold headline + muted secondary, right-aligned numbers, full precision **[table-stakes]**.
- Custom tooltip fields / viz-in-tooltip **[nice-to-have]**.

**E. Axis & gridlines**
- Gridlines gray-200, 1px, horizontal-only default, per-axis toggle **[table-stakes]**.
- Axis labels with **units**, auto-skip crowded ticks, no forced rotation on narrow cards **[table-stakes]**.
- Data marks ≥3:1, data text ≥4.5:1 contrast **[table-stakes]**.

**F. Color**
- Dashboard-level **palette token inherited by all cards** **[table-stakes]**.
- Categorical ≤7 colors, ordered by lightness, avoid red-green, sequential single-hue / diverging orange-blue defaults **[table-stakes]**.
- Meaning never by color alone — line style / pattern / shape / label **[table-stakes]** (a11y).

**G. Formatting defaults**
- Locale-aware numbers/currency/dates **[table-stakes]**.
- Compact notation on axes (1.2k / 3.4M), full in tooltip **[table-stakes]**.
- Per-field format override that doesn't mutate the dataset **[nice-to-have]**.
- Time-series granularity label + switch **[nice-to-have]**.

**H. State coverage (all four, inside the card frame)**
- **Loading:** skeleton/shimmer >300ms, never a bare axis/blank box **[table-stakes]**.
- **No-data:** "No data" + guidance, chrome preserved **[table-stakes]**.
- **Empty/unconfigured:** prompt to pick metric/fields **[table-stakes]**.
- **Error:** message **+ retry**, optional details expander, header error icon **[table-stakes]**.
- Entrance animation respects `prefers-reduced-motion` **[table-stakes]** (a11y).

**I. Accessibility backstop**
- Interactive marks keyboard-navigable, ≥44px tap area **[table-stakes]**.
- Per-chart aria-label / text summary + table alternative **[nice-to-have]** (aria-label table-stakes, table-alt nice).
- CSV + image export for data-heavy charts **[table-stakes]** (DBExec already has this).

---

### 3. Gap table

| Capability | DBExec status | Priority |
|---|---|---|
| Card frame (bg / border / radius / shadow) | **Have** — `.visual-box` is solid, with more states than most tools | — |
| Interaction states (hover/focus/resize/drag/drop) | **Have** — genuinely strong, keep | — |
| Insight-led title | **Partial** — title renders but no explicit size (inherits `.visual-inline-title`), no `fs-label`, no descriptive guidance | P1 |
| Subtitle (source / timeframe / units) block | **Missing** — no subtitle slot anywhere | P1 |
| Kebab `⋮` overflow menu | **Missing** — 7+ raw icons crammed in 36px bar instead of a menu | **P0** |
| Header→plot divider + spacing control | **Partial** — 1px border exists, no spacing token/control | P2 |
| Per-side card padding | **Partial** — body is `space-0` (0px), chart flush to edges | **P0** |
| Resize handles (corner + edge) | **Partial** — invisible hit areas, corner-only, shows only on hover/focus | P1 |
| Footer / caption slot | **Missing** | P2 |
| Card-local type scale | **Partial** — placeholder text uses `fs-label` (too small), icon sizing inconsistent across states, no title size | P1 |
| Tabular figures | **Have** (tables) / **Missing** (ECharts labels & tooltips) | P1 |
| Legend present + near chart | **Partial** — ECharts default position, not DBExec-tuned | P1 |
| Legend click-to-toggle | **Partial** — ECharts default `legend.selectedMode` on, but unstyled/unverified | P1 |
| Direct labeling for single series | **Missing** | P2 |
| Tooltip themed (hierarchy, right-align, ≤3 metrics) | **Missing** — raw ECharts default tooltip | **P0** |
| Tooltip keyboard-reachable | **Missing** — hover-only | P1 (a11y) |
| Gridlines subtle / horizontal-only | **Missing** — ECharts default (both axes, default gray) | **P0** |
| Axis units + auto-skip + no forced rotation | **Partial** — ECharts auto-skips; units/rotation not governed | P1 |
| Contrast (marks ≥3:1, text ≥4.5:1) | **Missing** — depends on unmanaged ECharts palette | P1 (a11y) |
| Dashboard palette token inherited by charts | **Missing** — no ECharts theme registered; `colorScheme` on cards only | **P0** |
| Categorical ≤7 / lightness order / no red-green | **Missing** — ECharts default 9-color palette | **P0** |
| Meaning not by color alone (pattern/shape) | **Missing** | P1 (a11y) |
| Locale-aware number/date formatting | **Partial** — tables format; ECharts axis/label/tooltip do not | P1 |
| Compact axis notation (1.2k / 3.4M) | **Missing** for ECharts axes | P1 |
| Per-field format override (non-mutating) | **Missing** | P2 |
| Loading = skeleton/shimmer | **Missing** — generic `pi-spinner` only | P1 |
| No-data state (card charts) | **Partial** — card has empty color; ECharts branch shows nothing when fields present but rows empty | **P0** |
| Empty/unconfigured prompt | **Have** — `.visual-content-placeholder` (but under-styled) | P1 (polish) |
| Error + retry + detail expander | **Partial** — text-only, no retry, no expander | **P0** |
| `prefers-reduced-motion` respect | **Missing** — `cardFadeIn` + ECharts animation unconditional | P1 (a11y) |
| Marks keyboard-navigable / 44px tap | **Missing** | P2 (a11y) |
| Per-chart aria-label / text summary | **Missing** | P1 (a11y) |
| CSV + PNG export | **Have** | — |

**Honest headline:** the *card shell* is above average (states + drag/resize/focus are better than Metabase or Superset out of the box). The **render layer is the weak spot** — everything downstream of `echarts` directive is stock ECharts defaults: palette, legend, tooltip, gridlines, axis formatting. That is where DBExec reads as "below standard," compounded by the **0px body padding** (charts touch the border), the **icon-soup header** (no kebab), and **missing error-retry / loading-skeleton**.

---

### 4. Concrete redesign recommendations for DBExec

Grouped so each maps to a real file/component in the stack.

#### 4.1 Register a DBExec ECharts theme (the single highest-leverage fix — P0)

Everything in §3 marked "ECharts default" collapses into one root cause: no theme. Create `src/app/shared/echarts/dbexec-theme.ts` and register it once at bootstrap, then pass `[theme]="'dbexec'"` on the `echarts` directive in `echart-visual.component.html`. Drive it from the same CSS custom properties the cards use so light/dark stay in sync (read them via `getComputedStyle(document.documentElement)` at theme-build time, or mirror the token values).

```ts
// dbexec-theme.ts — registered via echarts.registerTheme('dbexec', dbexecTheme)
export const dbexecTheme = {
  // ≤7 categorical, lightness-ordered, no red-green (Tableau-10-style)
  color: ['#4C78A8','#F58518','#54A24B','#B279A2','#72B7B2','#EECA3B','#9D755D'],
  textStyle: { fontFamily: 'Inter, sans-serif' },
  grid: { top: 32, right: 16, bottom: 32, left: 48, containLabel: true },
  categoryAxis: {
    axisLine:  { show: true, lineStyle: { color: 'var(--border-color)' } },
    axisTick:  { show: false },
    splitLine: { show: false },                    // no vertical gridlines
    axisLabel: { color: 'var(--secondary-color)', fontSize: 12, hideOverlap: true },
  },
  valueAxis: {
    axisLine:  { show: false },
    splitLine: { show: true, lineStyle: { color: 'var(--border-color)', width: 1, opacity: 0.5 } }, // gray-200 horizontal only
    axisLabel: { color: 'var(--secondary-color)', fontSize: 12,
                 formatter: (v: number) => compactNumber(v) },   // 1.2k / 3.4M on axes
  },
  legend: {
    top: 4, type: 'scroll', icon: 'roundRect',
    textStyle: { color: 'var(--text-color)', fontSize: 12 },
    selectedMode: true,                             // click-to-toggle (verify styling)
  },
  tooltip: {
    backgroundColor: 'var(--card-background)',
    borderColor: 'var(--border-color)', borderWidth: 1,
    textStyle: { color: 'var(--text-color)', fontSize: 12 },
    extraCssText: 'border-radius:8px; box-shadow:0 4px 16px var(--shadow-color); padding:8px 10px;',
    // valueFormatter → full precision + tabular via CSS on the tooltip host
  },
};
```

Specifics this closes:
- **Palette (P0):** cap at 7, lightness-ordered, red-green avoided. Feed the dashboard-level palette in so all cards inherit one source of truth — expose it as a dashboard setting and merge into the theme's `color` before register, matching Superset/Looker's "inherit from dashboard" model.
- **Gridlines (P0):** `valueAxis.splitLine` on at 1px/opacity 0.5, `categoryAxis.splitLine` off — horizontal-only, subtle.
- **Tooltip (P0):** themed background/border/radius/shadow that matches the card. Add a `valueFormatter` for locale + full precision; use a monospaced/`tabular-nums` `extraCssText` font-feature so digits align. Keep to ≤3 series rows.
- **Compact axis notation (P1):** `valueAxis.axisLabel.formatter = compactNumber`; keep full precision in tooltip.
- **Reduced motion (P1):** in `echart-visual.component.ts`, gate `animation` on `!window.matchMedia('(prefers-reduced-motion: reduce)').matches` when building `chartOption`.
- **aria-label (P1):** ECharts supports `aria: { enabled: true, decal: { show: true } }` — this simultaneously turns on a screen-reader summary **and** decal patterns, closing "meaning not by color alone" (P1 a11y) for free. Turn it on in the theme.

#### 4.2 Fix the card body padding (P0)

`.visual-body` currently uses `padding: var(--space-0)`. Give it `padding: var(--space-4)` (16px) so charts breathe, and let the ECharts `grid` above handle inner axis spacing. For tables, keep 0 (tables manage their own cell padding) — apply the padding via a `:not(.is-table)` modifier or a body-variant class set by `chart-renderer` based on `isTableChartType`.

#### 4.3 Collapse the header icon-soup into a kebab (P0)

The 36px `.visual-inline-title` with 7+ `app-button` icons is the most visible "below standard" tell. Restructure the header to: **[drag grip] · [title + subtitle stack] · [1–2 primary icons] · [`⋮` kebab]**.

- Use PrimeNG `p-menu` (popup) or the existing `p-tieredMenu` triggered by a single `pi pi-ellipsis-v` `app-button`. Move duplicate, export PNG, export CSV, move-to-tab, delete, cross-filter-toggle into the kebab `MenuItem[]` (with icons + tooltips → now menu labels, which is better UX than icon-guessing).
- Keep **only** focus/expand (`pi pi-expand`) and, when relevant, the cross-filter toggle as inline icons — everything else in the menu. This also solves the a11y label problem (menu items are self-labeling).
- Add the **subtitle** here as a second line under the title (source/dataset/timeframe). This closes P1 subtitle + gives you a natural home for the **data-source badge** market gap.
- Title styling: set explicit `font-size: var(--fs-body)` (14–16) `font-weight: var(--fw-semibold)`, subtitle `var(--fs-micro)` muted (`--secondary-color`). Bump header height from fixed 36px to `min-height: 40px; height: auto` so a two-line title+subtitle fits.

#### 4.4 State components inside the card frame (P0 error/no-data, P1 loading)

Build three small shared components (or ng-templates) that all live inside `.visual-body` so the card chrome never reflows:

- **Loading skeleton** (P1): replace the generic `pi-spinner` in `#glLoading` and `.visual-loading-placeholder` with a PrimeNG `p-skeleton` shimmer shaped like the chart (a few `p-skeleton` bars for bar/line, a `p-skeleton shape="circle"` for pie/gauge, rows for tables). Gate on >300ms so fast loads don't flash.
- **No-data (P0):** the ECharts branch (`hasRequiredChartFields` true but zero rows) currently renders an empty canvas. Add an explicit check in `chart-renderer` / `echart-visual` — when the series is empty, render a "No data for the current filters" state with an icon and a "Clear filters" CTA, keeping the header.
- **Error + retry (P0):** upgrade `.visual-error-placeholder` to include an `app-button` "Retry" (re-emits the load) and a `p-accordion`/`<details>` "Details" expander with the raw message. Add a header error icon (`pi pi-exclamation-triangle` in the title bar) mirroring Power BI's per-visual info/warn/error icons.

#### 4.5 Visible resize + drag affordances (P1)

Currently corner-only, hover/focus-only, invisible hit areas. Add a persistent low-opacity **corner grip glyph** (bottom-right, `pi pi-window-maximize` rotated or a custom 3-dot handle) that solidifies on hover, plus a **left-edge drag grip** (`pi pi-bars` / six-dot dots) in the header so the drag target is discoverable rather than "grab the whole title." Match the focus ring you already have on `.focused`.

#### 4.6 The config panel — header / separator / sectioning (the flagged item)

The user called the config panel's `config-section` / `config-group` / `sidebar-divider` structure "below standard." The problem is almost always **flat hierarchy with no visual grouping weight** — sections read as an undifferentiated stack. Concrete fixes, PrimeNG-native:

- **Replace bare `sidebar-divider` lines with titled, collapsible sections.** Use PrimeNG `p-accordion` (or `p-panel [toggleable]="true"`) so each `config-section` is a real collapsible group with a clear header, a chevron, and remembered open/closed state. A row of hairline dividers between anonymous groups is what makes it feel unfinished; a named collapsible header ("Axes", "Series & Colors", "Legend", "Labels", "Formatting") gives Power-BI-style navigable structure.
- **Give section headers real weight:** header row = `var(--fs-label)` uppercase or `var(--fw-semibold)`, `var(--secondary-color)`, `letter-spacing: 0.02em`, with `var(--space-5)` top padding and a **single** hairline under the header — not dividers scattered between every control. One divider per section boundary, not per control.
- **Standardize `config-group` as a labeled field row:** label (`fs-label`, muted) left or stacked above the control, control right/full-width, consistent `var(--space-4)` vertical rhythm. Right now inconsistent spacing between groups is a large part of the "below standard" read — lock it to one gap token.
- **Section iconography:** small leading `pi` icon per section header (`pi pi-chart-bar` Axes, `pi pi-palette` Colors, `pi pi-list` Legend) — matches Metabase/Hex config surfaces and aids scanning.
- **Sticky section + search:** for charts with many options, add a sticky mini-nav or a `p-iconField` search that filters visible config groups (Hex/Sigma do this). P2 but high polish.
- **Contextual grouping by chart type:** hide irrelevant sections (no "Legend" for a single-series KPI card, no "Axes" for pie) so the panel length tracks the chart — reuse the existing role-spec that powers `hasRequiredChartFields`.
- **Divider treatment:** wherever a divider is genuinely needed, use `1px solid var(--border-color)` at reduced opacity with generous `var(--space-5)` margin — never back-to-back dividers, never a divider immediately under a section header (the header's own underline is the separator).

#### 4.7 Card-chart (KPI) polish (P1)

- Add `tabular-nums` + locale formatting to `.card-value` (currently raw `formatValue`).
- Add the missing states to `configurable-card-chart` (loading skeleton tiles, error) so it matches the table's completeness.
- Respect `prefers-reduced-motion` on the `cardFadeIn` keyframe (`@media (prefers-reduced-motion: reduce){ .animated{ animation:none } }`).

#### 4.8 Typography normalization (P1)

Create card-local type tokens and apply across all state placeholders and headers so the scale is consistent: title `--fs-body`/`--fw-semibold`, subtitle/axis `--fs-label`, tick/legend `--fs-micro`→bump to 11–12px floor, placeholder main text to `--fs-body` (not `--fs-label`), placeholder icons standardized to one size (`--fs-h1`) across empty/loading/error. Never render chart text below 11px.

**Sequencing:** ship §4.1 (theme) + §4.2 (padding) + §4.3 (kebab) + §4.4 error/no-data first — these are the four P0s that account for essentially all of the "below standard" perception with the least code (one theme file, one padding token, one header refactor, three state components). §4.6 config-panel restructure is the second wave and is what the user specifically flagged. Everything else is P1/P2 polish layered on the same structures.


---


## Chart Types & Per-Chart Features

DBExec already ships an unusually broad chart catalogue — the gap is not *coverage*, it is *config-surface polish*, *feature parity on the P0/P1 per-chart controls*, and the *visual quality of the config panel itself*. This section separates those honestly.

---

### 1. What DBExec has today

**Chart-type coverage (from `charts.constants.ts` + `echarts-option-builder.ts`):**

- **54 declared chart types, 54 wired end-to-end.** No stubs, no placeholder entries in the picker — every type renders with at least baseline config.
- **Bar family (8):** vertical, horizontal, 2D (grouped) both orientations, stacked both orientations, normalized (100%) both orientations.
- **Line & area (7 usable):** line, line-stacked, line-step, area, area-stacked, area-normalized, polar.
- **Pie/donut family (7):** pie, pie-advanced, pie-grid, donut, half-donut, nested-pie, rose.
- **Gauges (2):** radial gauge, linear-gauge.
- **Statistical / multi-measure (3):** combo (bar+line, dual-axis capable), histogram (auto-binned), box-chart.
- **Scatter/bubble (3):** scatter, bubble, effect-scatter.
- **Distribution & composition (7):** funnel, sunburst, waterfall, sankey, tree, theme-river, tree-map.
- **Heatmaps & maps (4):** heat-map, world-map, map3d, polygons3d.
- **Specialized 2D (4):** pictorial-bar, bar-polar, radar, candlestick.
- **3D cartesian (4):** bar3d, line3d, scatter3d, surface.
- **GL / 3D scale-out (6):** globe, scattergl, linesgl, graphgl, flowgl, lines3d.
- **Graph & flow (2):** graph, flow-lines.
- **Matrix/special + table (3):** parallel, number-card, table (with pivot mode).

**Per-chart features already wired (production-ready):**

- **Data labels** — full config on cartesian (font, color, content = value/percent/custom); position + rotation on pie; value on gauge; cell text + pivot totals on table.
- **Dual-axis** — combo only. `config.dualAxis = { series:[{name,type,yAxisIndex}], rightAxisName }`, per-series bar/line switch, right-axis naming.
- **Trend lines & forecast** — linear, log, polynomial, moving-average, forecast, via `config.trend`; on bar/line/area/combo/histogram.
- **Reference lines & bands** — lines for mean/median/min/max/percentile/fixed; shaded bands with color+label; `config.referenceLines[]` / `config.referenceBands[]`; multiple per chart.
- **Stacking** — none / stack / normalize (100%) via `config.stacking`.
- **Per-series color** — 12 named palettes (`config.colorScheme`), gradient fills, conditional-format color overrides.
- **Number & date formatting** — decimals, thousands separator, currency code, date tokens, percent, via `config.valueFormat`.
- **Conditional formatting** — rule engine (=, !=, <, >, <=, >=, in, not-in, contains) over value/category/percentile, effects on text + background; applies to charts and table cells.
- **Small multiples** — cartesian only, facet-by-column grid via `config.smallMultiples`.
- **Sort & limit** — Top-N / Bottom-N + sort by measure via `config.limitMode` / `limitN` / `sortBy` / `sortDir` (cartesian).
- **Null handling** — gap / connect / zero via `config.nullHandling` (cartesian).
- **Axis scale** — linear/log + manual bounds (`yAxisScaleType`, `yScaleMin/Max`) (cartesian).
- **Legend control** — position/type/scroll.
- **Drill / cross-filter** — click event to parent, `config.interaction.crossFilter`, targets same-tab/dashboard/explicit-visual.
- **Accessibility** — 10-locale i18n, keyboard nav, tooltips, color-blind-safe palettes.

**Known internal gaps (from the audit):** dual-axis limited to combo; trend/small-multiples cartesian-only; 3D view-angle config exists (`viewAlpha/viewBeta/viewDistance`) but is **not exposed in the sidebar**; table has no column reorder, no multi-column sort, no in-cell bars, read-only cells; PNG export only (no SVG); no arbitrary text annotations; tooltip not fully templatable; single-point cross-filter select only; no runtime series math (A+B as new series).

---

### 2. What the market standard requires

Benchmarked across Tableau, Power BI, Metabase, Superset, Looker, Sigma, Hex, Observable Plot.

**Chart types — table-stakes (a serious BI tool that lacks any of these looks incomplete):**

- Bar / column, incl. grouped and stacked — **[table-stakes]**
- Line, multi-series — **[table-stakes]**
- Area — **[table-stakes]**
- Pie / donut — **[table-stakes]**
- Scatter — **[table-stakes]**
- Single-value / KPI card — **[table-stakes]**
- Plain data table — **[table-stakes]**
- Pivot / crosstab **with subtotals + grand totals** — **[table-stakes]**
- Histogram — **[table-stakes]**
- Combo (bar + line) — **[table-stakes]**
- At least one filled-region (choropleth) map — **[table-stakes]**

**Chart types — strongly expected (STD) to be credible against the leaders:**

- 100% stacked, stacked area, treemap, funnel, waterfall, box plot, heatmap, bubble, gauge, point/symbol map, highlight table, **sparkline** — **[nice-to-have but expected]**

**Chart types — opportunistic:**

- Sankey, sunburst, radar, bullet, timeline/Gantt, network/graph, candlestick, density map, deck.gl 3D — **[nice-to-have]**

**Per-chart features — the P0 must-have gate (a chart engine is not credible until all present):**

1. Data labels **with number-format control** — **[table-stakes]**
2. Dual / secondary axis + manual min/max + axis titles — **[table-stakes]**
3. Constant (fixed-value) reference lines — **[table-stakes]**
4. Per-series color + per-series axis assignment + stacking mode (none/stacked/100%) — **[table-stakes]**
5. Table / pivot conditional formatting (cell color rules) — **[table-stakes]**
6. Sort by measure + Top-N + viz-level filters + interactive legend — **[table-stakes]**
7. Hover tooltips — **[table-stakes]**
8. Full number formatting (decimals, separators, currency, %, date tokens) — **[table-stakes]**
9. Line null handling (gap vs connect) — **[table-stakes]**

**Per-chart features — P1, the bar to match the leaders:**

- Computed reference lines (avg/median/percentile), reference bands, trend lines, drill-down, drill-through, cross-filter, **per-series chart type**, number abbreviation (1.2K/3.4M), "Others" bucket for Top-N remainder, **customizable tooltips**, log scale, label position control, series reorder, line style/width/marker, in-cell data bars, negative-number style, locale-aware formatting, categorical/continuous axis toggle — **[nice-to-have but expected in a mature tool]**

**Per-chart features — P2, differentiators (ship selectively):**

- Forecast with confidence interval, anomaly/outlier detection, error bars, small multiples with independent scales, icon/status sets, date densification (fill time-series gaps), label-only-min/max/first/last — **[nice-to-have]**

---

### 3. Gap table

Honest read: DBExec **exceeds** the market on raw chart-type breadth and on several P1/P2 analytics (trend, forecast, reference bands, small multiples, conditional formatting). The real deficits cluster in **table/pivot depth**, **axis/tooltip config exposure**, and **Top-N/"Others" + abbreviation** — plus the config-panel *presentation* itself.

| Capability | DBExec status | Priority |
|---|---|---|
| **CHART TYPES** | | |
| Bar/column (grouped, stacked, 100%) | Have | P0 must |
| Line, multi-series, stacked | Have | P0 must |
| Area / stacked / 100% area | Have | P0 must |
| Pie / donut / half-donut / rose / nested | Have | P0 must |
| Scatter / bubble / effect-scatter | Have | P0 must |
| KPI / single-value card (`number-card`) | Have (basic) | P0 must |
| KPI with target + delta-vs-prior + inline sparkline | **Missing** (card shows value only) | P1 should |
| Plain data table | Have | P0 must |
| Pivot / crosstab | Have (flat-array render, client-side) | P0 must |
| Pivot **subtotals + grand totals** | **Partial / unverified** (no SQL aggregation; flat render) | P0 must |
| Highlight (heat-colored) table | Have (conditional formatting on cells) | P1 should |
| In-cell data bars / mini-sparklines in table | **Missing** | P1 should |
| Histogram | Have | P0 must |
| Combo (bar + line, dual-axis) | Have | P0 must |
| Filled-region map (choropleth) | Have (world-map / map3d) | P0 must |
| Point/symbol + bubble map | Have (GL scatter/geo) | P1 should |
| Custom GeoJSON boundaries (org-specific regions) | **Missing / unverified** | P1 should |
| Treemap, funnel, waterfall, box, heatmap, gauge | Have | P1 should |
| Sparkline (standalone inline mini-trend visual) | **Missing** (line exists, no compact sparkline variant) | P1 should |
| Sankey, sunburst, radar, network/graph, candlestick, parallel | Have | P2 nice |
| Bullet chart | **Missing** (linear-gauge is closest) | P2 nice |
| Timeline / Gantt | **Missing** | P2 nice |
| **PER-CHART FEATURES** | | |
| Data labels + number-format control | Have | P0 must |
| Label position (inside/outside/auto) | Partial (pie yes; cartesian limited) | P1 should |
| Show total-of-stack label | **Missing / unverified** | P1 should |
| Text annotations / callouts on canvas | **Missing** (only ref-line labels) | P1 should |
| Dual / secondary axis | Partial (**combo only**; not on generic bar/line) | P0 must |
| Manual axis min/max + tick interval | Partial (min/max yes; **explicit tick interval missing**) | P0 must |
| Axis title / unit override | Have | P0 must |
| Log scale | Have | P1 should |
| Reversed axis / categorical-continuous toggle | **Missing / unverified** | P1 should |
| Constant reference line | Have | P0 must |
| Computed reference line (avg/median/percentile) | Have | P1 should |
| Reference band / shaded region | Have | P1 should |
| Trend line (linear/poly/log/MA) | Have (cartesian only) | P1 should |
| Forecast (with confidence interval) | Partial (forecast yes; **CI band unverified**) | P2 nice |
| Anomaly / outlier detection | **Missing** | P2 nice |
| Error bars | **Missing** | P2 nice |
| Per-series color | Have | P0 must |
| Per-series chart type | Have (combo) | P1 should |
| Per-series axis assignment → secondary | Partial (combo only) | P0 must |
| Stacking none/stacked/100% | Have | P0 must |
| Series display order / reorder | **Missing / unverified** | P1 should |
| Line style / width / marker toggle | **Partial / unverified** | P1 should |
| Custom brand palette / diverging-sequential scales | Have (12 schemes) | P1 should |
| Chart conditional formatting (color by rule/threshold) | Have | P1 should |
| Table cell background/font color rules | Have | P0 must |
| Icon sets / status indicators (tables) | **Missing** | P2 nice |
| Sort by dimension / by measure | Have | P0 must |
| Top-N / Bottom-N | Have | P0 must |
| **"Others" bucket for Top-N remainder** | **Missing** | P1 should |
| Chart-level (viz) filters | Have | P0 must |
| Interactive legend show/hide series | Have | P1 should |
| Hover tooltip | Have | P0 must |
| **Customizable tooltip (fields/format/template)** | Partial (follows data format; **not templatable**) | P1 should |
| Drill-down hierarchy | Partial (via cross-filter, not true level-expand) | P1 should |
| Drill-through to detail | Have | P1 should |
| Cross-filter (click → filter others) | Have (**single-select only**) | P1 should |
| Cross-filter multi-select | **Missing** | P2 nice |
| Small multiples / facet grid | Have (cartesian only) | P2 nice |
| Small multiples independent scales | **Missing / unverified** | P2 nice |
| Decimals / separators / currency / % / date tokens | Have | P0 must |
| **Number abbreviation (1.2K / 3.4M / 1.1B)** | **Missing / unverified** | P1 should |
| Prefix / suffix / custom format string | Partial | P1 should |
| Negative-number style (parens/red) | **Missing / unverified** | P1 should |
| Locale-aware formatting | Have (10 locales) | P1 should |
| Line null handling (gap/connect/zero) | Have | P0 must |
| Treat-null-as-zero toggle | Have | P1 should |
| Show/hide empty categories | **Missing / unverified** | P1 should |
| Null placeholder text in tables | **Partial / unverified** | P1 should |
| Date densification (fill time gaps) | **Missing** | P2 nice |
| **3D view-angle config (alpha/beta/distance)** | **Partial — engine supports it, sidebar does NOT expose it** | P1 should |
| Export to SVG | **Missing** (PNG only) | P2 nice |
| Table column reorder | **Missing** | P1 should |
| Table multi-column sort | **Missing** (single column) | P1 should |

**Bottom-line verdict:** DBExec passes almost the entire **P0 must-have gate** — the only genuine P0 risks are (a) **dual/secondary axis being confined to `combo`** rather than available as a per-series toggle on any bar/line chart, (b) **pivot subtotals/grand-totals not being provably computed** (flat-array table render), and (c) **manual tick interval**. Everything else failing is P1/P2. The bigger practical problem the user is feeling is not the feature list — it is that **the config panel that exposes all this looks below standard**, and several already-built engine capabilities (3D angles, abbreviation, per-series controls) are **not surfaced in the UI**.

---

### 4. Concrete redesign recommendations for DBExec

Specific to the Angular 18 + PrimeNG + ECharts stack and the existing `config-section` / `config-group` / `sidebar-divider` / visual-card structure.

#### 4.1 Close the P0 gaps first (engine + wiring)

1. **Generalize dual-axis beyond `combo`.** Move the per-series axis assignment out of the combo-only path in `echarts-option-builder.ts` into `applyCartesianAnalytics()`. Add `config.series[i].yAxisIndex` (0|1) and a `config.axes.secondary = { name, min, max, scaleType, format }` block. Render the second `yAxis` whenever any series sets `yAxisIndex:1`. This turns "dual-axis only on combo" into "dual-axis on any bar/line/area", matching Metabase/Sigma.
2. **Add explicit tick interval + `splitNumber`.** Extend the axis config group with `config.axes.y.interval` and `config.axes.y.tickCount`, mapped to ECharts `yAxis.interval` / `splitNumber`. Small change, closes a P0.
3. **Prove pivot subtotals/grand-totals.** The table visual renders a flat array — add a grouping pass (row-group subtotal rows + a grand-total footer row) in `table-visual.component.ts`, or push aggregation to the query layer. Expose `config.table.showSubtotals` / `showGrandTotal`. This is the single most important credibility fix in the table family.

#### 4.2 Surface capabilities the engine already has (pure UI wiring — cheapest wins)

4. **Expose 3D view angle.** Engine reads `viewAlpha/viewBeta/viewDistance`; add a "3D View" `config-section` (visible only for `isThreeD(type)`) with three PrimeNG `p-slider` controls bound to those keys. Zero engine work.
5. **Expose number abbreviation + negative style.** Add to the existing `valueFormat` group: a PrimeNG `p-select` for `abbreviation` (none / K-M-B / auto) and a `p-select` for negative style (minus / parens / red). Wire into the existing formatter.
6. **Expose per-series controls** (color, chart-type, axis, line style) as a repeatable `config-group` list — one row per series — using `p-colorpicker`, `p-select`, and a marker/dash toggle. The combo path already proves per-series type works; generalize the same UI.

#### 4.3 New P1 features worth building

7. **"Others" bucket** for Top-N: add `config.limitOthers = true`; in the limit post-processor, sum the tail into a synthetic "Others" category. ~20 lines.
8. **Templatable tooltip:** add `config.tooltip.template` (a token string like `{category}: {value} ({percent})`) and a formatter function in the option builder. Ship a small token-picker chip row in the sidebar.
9. **Standalone KPI card upgrade** (`number-card`): add target, delta-vs-prior-period, and an inline ECharts sparkline. This is table-stakes-adjacent and currently value-only.
10. **Table column reorder + multi-sort:** PrimeNG `p-table` supports `reorderableColumns` and `sortMode="multiple"` natively — enabling both is largely a template flag flip plus persisting the column order into `config`.
11. **Standalone sparkline visual + in-cell table bars** — both are compact ECharts instances; the in-cell bar is a `cellTemplate` with a mini bar div driven by cell value / column-max.

#### 4.4 Config-panel redesign (the "looks below standard" problem)

This is where the user's pain is sharpest. The current `config-section` / `config-group` / `sidebar-divider` scheme reads as an undifferentiated stack of controls with weak hierarchy. Fix the *information architecture and chrome*, not just spacing:

- **Replace flat `sidebar-divider` rules with collapsible section headers.** Use PrimeNG `p-accordion` (or `p-panel` with `toggleable`) so each `config-section` becomes a titled, collapsible group: **Data**, **Series & Colors**, **Axes**, **Labels & Tooltip**, **Analytics** (ref lines/trend/forecast), **Formatting**, **Conditional Formatting**, **Interactions**. A hairline `<hr>` between raw controls is the thing that reads as amateur; a titled collapsible header with a chevron and a count/summary reads as a product.
- **Give each section header a left accent + icon + one-line summary.** e.g. "Axes · Linear, 0–100, dual" as muted secondary text under the title so the panel is scannable when collapsed. This is the highest-leverage single change.
- **Filter sections by chart type.** Today most controls appear to render regardless of type. Drive section visibility off the `charts.constants.ts` predicates (`isCartesian`, `isPie`, `isThreeD`, `isTable`) so a pie chart never shows "Null handling" or "Dual axis". Fewer, relevant controls read as far more polished than a long always-on list.
- **Two-column control rows for paired inputs.** Min/Max, decimals/separator, prefix/suffix should sit on one row via a CSS grid `config-row` (2-col), not stacked. Halves vertical length and groups semantically-paired fields.
- **Standardize control primitives.** Pick one PrimeNG control per data shape and use it everywhere: `p-select` (single enum), `p-multiselect` (series list), `p-inputnumber` with `showButtons` (bounds/decimals), `p-colorpicker` (colors), `p-toggleswitch` (booleans — not checkboxes), `p-slider` (angles/opacity). Consistency of control type across sections is what "standard" tools have and DBExec currently lacks.
- **Sticky section header + search.** For a 1,600-line sidebar, add a top "Search settings" `p-iconfield` that filters visible control labels, and keep the chart-title/type row pinned. Power BI's format pane search is the reference.
- **Reset-to-default affordance per section.** A small ghost "reset" icon-button in each section header (writes the section's keys back to defaults) — cheap, and signals maturity.
- **Live preview coupling.** Debounce config writes (~150 ms) so the ECharts `setOption(..., { notMerge:false })` re-render feels immediate; a laggy panel reads as low-quality regardless of feature depth.

**Visual-card chrome (the container around each chart):**

- **Consistent card header:** title (editable inline), a right-aligned overflow `p-menu` (⋯) holding Export ▸ PNG/SVG/CSV, Duplicate, Edit, Delete — instead of scattered buttons. Add **SVG export** here (ECharts `renderer:'svg'` instance or `getConnectedDataURL`) to close that P2.
- **State chrome:** explicit empty state ("No data for current filters"), loading skeleton (PrimeNG `p-skeleton`), and error state — rather than a blank canvas. Missing states are a common "below standard" tell.
- **Selection/cross-filter affordance:** when a point is click-selected for cross-filter, show a small "filtering others by X ✕" chip on the card so the interaction is legible; this also sets up the multi-select upgrade.
- **Consistent internal padding + title/legend rhythm** driven by design tokens so every card in a dashboard aligns to the same grid — inconsistent per-card padding is what makes a dashboard look unfinished.

**Priority order for the redesign work:** (1) config-panel accordion/section-header + type-filtering rework — highest perceived-quality gain for least code; (2) surface already-built engine capabilities (§4.2); (3) P0 engine gaps (dual-axis generalization, pivot totals, tick interval); (4) P1 feature builds (Others bucket, templatable tooltip, KPI upgrade, table reorder/multi-sort); (5) card-chrome states + SVG export; (6) P2 differentiators.


---


## Interaction Model

The interaction model is where a BI tool either feels like a live, explorable surface or a static picture of data. DBExec has built a genuinely capable interaction substrate — cross-filtering, a drill model, zoom, legend toggles, per-visual export — but the model is unevenly wired across chart types, split between two divergent implementations (Dashboard vs Analyses), and missing the author-facing controls and the config-panel chrome that make these behaviors discoverable and governable. This section inventories what exists, states the market bar, maps the gap honestly, and gives concrete, stack-specific redesign moves.

---

### 1. What DBExec has today

**Cross-filter (click a mark → filter siblings)**
- Two separate implementations with different semantics:
  - **Dashboard** — `DashboardCrossFilter` (`/dashboard/services/dashboard-interaction.ts`). Single active cross-filter, last-click-wins. Configurable targets (`'same-tab' | 'dashboard' | {visualIds[]}`). Applies as a category `EQUALS` predicate on the clicked column/value. State object `DashboardCrossFilterState { sourceVisualId, sourceTabId, columnName, value, targets }`. Cleared manually or on tab switch.
  - **Analyses** — `AnalysisInteractionService` (signal-based bus). Multi-filter model (one per source visual, replace-on-repeat), accumulates across different sources, auto-applies to all sibling visuals, converts to run-query filters via `toRunQueryFilters()`.
- Event path: ECharts click → `EchartVisualComponent.onChartClick()` → `@Output() chartSelect` → `ChartRendererComponent` bubble → view/edit host handler → re-run affected visuals. Table rows emit the same `chartSelect` via `onRowClick(row)`.
- Value extraction: ECharts `{name, value}` uses `name` as category; table `{row}` uses first column value. Both normalized by `extractClickedValue()`.
- Toolbar shows a cross-filter badge + a manual "clear" chip.

**Drill-down / drill-through**
- Ordered `DrillLevel[]` stack (`{columnName, parentColumn, value, label}`) with breadcrumb UI; click any ancestor to ascend (`drillUpTo(index)` / `drillUpOne()`).
- Driven by `visual.drillDimensions`; `drillDown()` pops the next dimension and scopes the parent column by the clicked value.
- Treemap has native ECharts drill-through (`treemapNodeClick: 'zoomToNode'`, `leafDepth`, optional `treemapBreadcrumb`).
- Model is largely **Analyses-only** and only fully realized for a subset of chart types.

**Hover & tooltip**
- Tooltips on by default, all chart types. Config: `tooltipDisabled`, `tooltipTrigger ('item'|'axis'|'none')`, `tooltipPrecision (0–6)`. Rendered `appendToBody` to avoid card clipping. Axis crosshair on line/bar/scatter.
- No hover-sync across siblings; no per-chart-type custom tooltip formatters.

**Zoom & pan**
- Data zoom: `dataZoom`, `dataZoomType ('slider'|'inside'|'both')`, `dataZoomThrottle (100ms)`, `dataZoomFilterMode ('filter'|'weakFilter'|'empty')`. Re-queries to visible range. Zoom-reset in the interactive legend toolbar.
- Pan: 3D charts rotate/zoom via mouse; 2D charts do not pan. No brush/lasso selection (ECharts supports it; not exposed).

**Legend**
- `legend` toggle (default on), position (`top|bottom|left|right`), type (`scroll` default `| plain`), optional `legendTitle` + `legendPosition`. Native click-to-toggle series visibility. Scroll arrows on overflow. No isolate/focus-on-click.

**Emphasis**
- `emphasisScale` (grow hovered element); `emphasis` focus mode defaults per type (`'series'` for bar/line, `'self'` for pie/treemap).

**Table-specific**
- Single-column click-to-sort; row click emits `chartSelect`; virtual scroll >100 rows; conditional cell formatting (`conditionalFormatting[]`); density toggle (`tableCompact`); column visibility (`tableHiddenColumns[]`); striped rows; row numbers.
- No multi-sort, no column reorder/resize, no in-header filter inputs, no subtotals (grand totals only).

**Cards (KPI)**
- Static big-number; client-aggregated from post-filter rows; optional target comparison arrow. No interactivity.

**Auto-refresh**
- `autoRefreshSeconds` from render response; pauses behind the blocking pre-load gate; countdown in toolbar; stops on destroy, restarts on filter/gate change.

**Export & formatting**
- Per-visual PNG; dashboard PDF/PNG/CSV; conditional formatting (cell rules + reference lines); ECharts default animation via merge-mode `setOption`.

---

### 2. What the market standard requires

Each item is tagged **[table-stakes]** (a dashboard without it reads as broken/dated) or **[nice-to-have]** (differentiator; design for it now, ship later).

**Selection & filtering**
- Click-to-cross-filter, including click-again-to-clear and modifier-click (ctrl/cmd/shift) multi-select. **[table-stakes]**
- Visible active-filter chip bar (each chip shows origin + value, individually removable) and a clear-all affordance. **[table-stakes]**
- Dashboard-level filter/parameter bar (dropdowns, date range, search) with explicit scope over which visuals it targets. **[table-stakes]**
- Predictable, visible composition between in-chart cross-filters and the dashboard filter bar (AND-combined, combined state shown). **[table-stakes]**
- Explicit **cross-filter vs cross-highlight** choice, per source→target pair (the Power BI "Edit Interactions" model: Filter / Highlight / None). **[table-stakes for the *concept*; highlight itself nice-to-have]**
- Author-facing "edit interactions" matrix deciding which visual affects which. **[nice-to-have]**

**Hierarchy & detail**
- Drill-down on author-defined hierarchies within the same chart, with breadcrumb + drill-up, visually distinct from drill-through. **[table-stakes]**
- Drill-to-detail ("see the rows") via right-click/menu on any mark. **[table-stakes]** — cheapest high-value feature.
- Drill-through to another view/page that receives the clicked context as its filters, with a back affordance. **[nice-to-have]**
- Custom click destination (internal view or URL) with clicked values templated in; per-column for tables. **[nice-to-have]**

**Direct manipulation & hover**
- Hover tooltips with correct number/date formatting on every mark. **[table-stakes]**
- Legend click to toggle/isolate a series. **[table-stakes]**
- Brush/zoom/pan on continuous axes and maps, with reset-zoom; drag-select emits a range cross-filter. **[table-stakes for zoom/reset; brush-to-filter nice-to-have]**
- Hover-sync (shared crosshair + matching tooltip point across aligned time-series). **[nice-to-have]**
- Rich hover (viz-in-tooltip / tooltip-as-page). **[nice-to-have]**

**State, chrome & trust**
- Per-chart loading state on re-query and an explicit "no data for this selection" empty state. **[table-stakes]**
- Active-state visibility: selected marks stay selected, source is indicated. **[table-stakes]**
- Keyboard + a11y baseline: tab to charts/legend/filters, Enter/Space activate, Esc clears, arrow-key mark traversal, visible focus ring, ARIA roles + screen-reader data-table fallback, `prefers-reduced-motion`. **[table-stakes as a bar; genuine differentiator in practice]**
- Bookmarks / saved view state; parameter/set actions; action chaining; cross-dataset cross-filtering; write-back actions. **[nice-to-have]**

---

### 3. Gap table

| Capability | DBExec status | Priority |
|---|---|---|
| Click-to-cross-filter (basic) | **Have** (both surfaces, but two divergent engines) | P0 — unify |
| Click-again-to-clear a cross-filter | **Partial** (manual clear chip; not click-source-again) | P1 |
| Modifier-click multi-select (ctrl/shift) | **Missing** (Analyses accumulates only across *different* sources; no additive select within one chart) | P1 |
| Active-filter chip bar (origin + value, removable) | **Partial** (single badge + one clear chip; not a full per-constraint chip bar) | P0 |
| Clear-all affordance | **Have** (manual clear) | — |
| Dashboard-level filter/parameter bar | **Missing from this layer** (no unified in-dashboard filter chrome described) | P0 |
| Cross-filter ↔ dashboard-filter composition, visible combined state | **Missing** (no combined-state surface) | P0 |
| Cross-filter vs cross-highlight (the concept + config) | **Missing** (only destructive filter; no highlight, no author toggle) | P0 (design surface) / P1 (highlight impl) |
| Edit-interactions matrix (which visual affects which) | **Partial** (dashboard has `targets` in data; no author UI) | P1 |
| Drill-down on hierarchies (in-chart, breadcrumb) | **Partial** (`DrillLevel[]` model + breadcrumb exist; Analyses-only, subset of chart types, treemap native) | P1 |
| Drill-to-detail ("see these rows") | **Missing** (row-level raw view on a mark not wired) | P0 — cheapest win |
| Drill-through to another view w/ carried context | **Missing** | P2 |
| Custom click destination (URL / internal / per-column) | **Missing** | P2 |
| Hover tooltips (formatted) | **Have** (precision + trigger configurable) | — |
| Hover-sync across time-series | **Missing** | P2 |
| Rich hover (viz-in-tooltip) | **Missing** | P2 |
| Legend click → toggle series | **Have** (native) | — |
| Legend click → isolate/focus | **Missing** | P2 |
| Zoom (data slider + inside) + reset | **Have** | — |
| Pan on 2D charts | **Missing** (3D only) | P2 |
| Brush/lasso → range cross-filter | **Missing** (ECharts capable; unexposed) | P1 |
| Per-chart loading state on re-query | **Partial** (auto-refresh gate exists; per-visual re-query spinner not confirmed) | P1 |
| "No data for this selection" empty state | **Missing / unconfirmed** | P0 |
| Active-selection persistence + source indication | **Partial** (source badge on dashboard; selected marks not held) | P1 |
| Keyboard + a11y baseline | **Missing** | P1 (differentiator lane) |
| Table: multi-sort / reorder / resize / header filters / subtotals | **Missing** | P2 |
| Bookmarks / saved view state | **Missing** (ties to existing snapshot + saved-query models) | P2 |
| Parameter/set actions, action chaining, write-back | **Missing** | P2 |
| Export (PNG/PDF/CSV) | **Have** | — |

**Honest read:** DBExec is *ahead* of most home-grown dashboards on the mechanical primitives (cross-filter, zoom, drill model, export) but *behind* on the three things that make interactions feel finished: (a) a single, visible **active-state surface** (chip bar + combined filter state + selection persistence), (b) the **author-facing governance** layer (edit-interactions, highlight-vs-filter, hierarchy definition UI), and (c) the **cheap, expected escape hatches** (drill-to-detail, empty states). The two-engine split (Dashboard `DashboardCrossFilter` vs Analyses `AnalysisInteractionService`) is the highest-leverage structural debt: it doubles the surface area for every capability below and guarantees behavior drift.

---

### 4. Concrete redesign recommendations for DBExec

#### 4.1 Unify on a single interaction primitive (the source→target action model)

Adopt Tableau's schema as one data structure and make cross-filter, highlight, drill-through, and URL actions all instances of it — stored on the dashboard/analysis definition, not hard-coded per chart:

```ts
interface VisualAction {
  id: string;
  source: { visualId: string; trigger: 'select' | 'hover' | 'menu' };
  type: 'filter' | 'highlight' | 'drill-down' | 'drill-through' | 'url';
  target:
    | { kind: 'same-tab' }
    | { kind: 'dashboard' }
    | { kind: 'visuals'; visualIds: string[] }
    | { kind: 'view'; ref: string }          // drill-through
    | { kind: 'url'; template: string };      // {{column}} interpolation
  fieldMapping?: { sourceColumn: string; targetColumn: string }[];
  onClear: 'show-all' | 'leave-filtered' | 'exclude-all';
}
```

- **Collapse the two engines.** Fold `DashboardCrossFilter` and `AnalysisInteractionService` into one `InteractionService` that emits `VisualAction` resolutions and produces run-query filters via a single `toRunQueryFilters()`. Keep the signal-based bus (it's the better of the two). This kills the divergence and lets `type: 'highlight'` slot in without touching each chart.
- **Highlight vs filter is a lifecycle branch, not a new chart.** `filter` re-runs the target query; `highlight` keeps the existing ECharts result and only restyles marks via `dispatchAction({ type: 'highlight'/'downplay' })` + a `blur` emphasis state. Build the branch now even if highlight ships later — retrofitting it means rewriting each chart's query lifecycle.

#### 4.2 Fix the active-state surface (the thing that reads as "below standard")

- **Replace the single badge with a real chip bar.** One PrimeNG `p-chip` per active constraint, each `[removable]="true"`, label formatted `Column: Value`, plus a leading "Source: <visual title>" chip for the cross-filter origin, and a trailing "Clear all" `p-button text`. Render it as a sticky strip under the dashboard toolbar so combined state (dashboard-filter constraints AND in-chart cross-filters) is always one glance.
- **Persist the selected mark.** On `select`, hold the ECharts selection (`selectedMode: 'single'`, `dispatchAction({type:'select'})`) so the source mark stays visibly selected; clear on Esc or source re-click. This makes click-again-to-clear work and gives users the "what did I click" feedback they currently lack.
- **Per-visual re-query + empty states.** During cross-filter re-runs, each visual card shows its own overlay spinner (PrimeNG `p-skeleton` or a `p-progressSpinner` in the card chrome), and on zero rows renders a dedicated empty state inside the card ("No data for this selection" + a "clear this filter" link) instead of a blank canvas.

#### 4.3 The config panel — sectioning, headers, separators (explicitly flagged)

The current `config-section` / `config-group` / `sidebar-divider` structure reads below standard because it leans on flat dividers and unstyled headers. Concrete fixes within the existing structure:

- **Give each `config-section` a real header, not a divider.** Use a `p-accordion` (or `p-panel` with `toggleable`) per section (Data · Interactions · Legend · Axes · Tooltip · Formatting), so sections **collapse** — the config panel is long and a flat stack of dividers is why it feels dated. Header = 13px semibold label + a small monochrome icon + an optional right-aligned "count of set options" badge so authors see at a glance which sections are configured.
- **Retire `sidebar-divider` as the primary separator.** Replace hairline `<hr>`-style dividers between groups with **grouped cards**: each `config-group` becomes a subtly bordered container (`border: 1px solid var(--surface-border); border-radius: 8px; padding`) with a 12px uppercase-tracked group label. Whitespace and containment, not lines, do the separating — this is the single biggest perceived-quality lift.
- **Standardize the control row.** Every setting is one row: left-aligned label (with a `pTooltip` "?" info icon for non-obvious options like `dataZoomFilterMode`), right-aligned control. Controls map to PrimeNG consistently: booleans → `p-inputSwitch` (not checkboxes), enums → `p-selectButton` for ≤3 options / `p-dropdown` for more, numerics like `tooltipPrecision` → `p-inputNumber` with `showButtons`, colors → `p-colorPicker`. Align all controls to a right rail so the panel scans as a clean two-column grid.
- **Add an Interactions section that surfaces the action model.** Today interaction behavior is scattered/implicit. Give it a first-class section: a per-visual "Emits cross-filter" `p-inputSwitch`, a "Receives" `p-inputSwitch`, a **Filter / Highlight / None** `p-selectButton` (the Power BI choice, even if Highlight is disabled with a "coming soon" tag), and a "Drill dimensions" `p-orderList` / `p-multiSelect` to author the hierarchy that feeds `drillDimensions`. This turns invisible config into an explicit, governable surface.
- **Empty/disabled affordance.** When a chart type can't support a setting (e.g. pan on a pie), render the row disabled with a `pTooltip` explaining why, rather than hiding it — predictability over surprise.

#### 4.4 ECharts-level wiring (specific option changes)

- **Drill-to-detail (P0, cheap):** add a context-menu (`event.event.event.preventDefault()` on ECharts `contextmenu`, or a PrimeNG `p-contextMenu` bound to the card) with "See these records" → open a `p-dialog` running the existing raw/saved-query executor filtered to the mark's `{column, value}`. Reuses the saved-query executor already in the codebase — near-zero new backend.
- **Brush → range cross-filter (P1):** enable `brush: { toolbox: ['lineX'], throttleType: 'debounce' }` on line/bar/scatter; on `brushSelected`, translate the coordinate range into a `BETWEEN` predicate and emit it as a `VisualAction` of `type: 'filter'`. This is the natural companion to the zoom slider you already ship.
- **Hover-sync (P2):** for aligned time-series, connect chart instances with `echarts.connect(groupId)` and mirror `axisPointer` via `dispatchAction({type:'showTip'})` on the sibling instances keyed by x-value. Gate behind a dashboard-level "link time cursors" toggle.
- **Legend isolate (P2):** on legend click, if a modifier is held, `dispatchAction({type:'legendUnSelect'})` all-but-clicked (isolate) instead of the native single-series toggle.

#### 4.5 Ship order

1. **Unify the two engines** into one `VisualAction`-based `InteractionService` (structural; unblocks everything).
2. **Chip bar + clear-all + selection persistence + empty/loading states** (the "looks finished" tier).
3. **Config-panel restructure** (accordion sections, grouped cards, standardized control rows, Interactions section).
4. **Drill-to-detail** (cheap, high value, reuses executor).
5. **Hierarchy drill-down UI** feeding the existing `DrillLevel[]` model, wired for all 2D chart types (not just treemap).
6. **Brush-to-filter**, then **highlight mode** (lifecycle branch), then **drill-through-to-view** (reuses snapshot + saved-query context parameter-passing).
7. **a11y baseline** — the open competitive lane: keyboard-navigable marks, ARIA data-table fallback per chart, focus management, `prefers-reduced-motion`. Cheaper to build in during this pass than to bolt on later.


---

