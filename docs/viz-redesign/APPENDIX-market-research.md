# Appendix — Market-Standard Research (raw)

> The per-focus-area research the gap analysis draws on. Benchmark tools cited inline.

# Config Panel

I now have solid, current, tool-specific detail across every tool named in the brief. I have enough to write the authoritative reference. Let me compose the final deliverable.

---

# The Config Panel: A Standard Reference for BI Visualization-Settings UX

A cross-tool benchmark of how leading analytics products let users assign fields to a chart and then format it — and a concrete checklist for what a modern config panel must have. This is a research reference written for the DBExec visualization redesign (task #1295).

---

## 1. The two-axis mental model every tool converges on

Strip away branding and every mature tool splits chart configuration along the **same two axes**:

| Axis                | Question it answers                                         | Triggers a re-query?                        | Common names                                                                                                           |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Encoding / Data** | _What_ data appears and how it maps to visual channels      | Yes — changing this re-runs the query       | Marks + shelves (Tableau), Build (Power BI), Data tab (Superset/Metabase), Setup (Looker Studio), Properties (Sigma)   |
| **Format / Style**  | _How_ it looks — colors, fonts, axes, labels, number format | No — pure presentation, applied client-side | Format pane (Power BI), Customize (Superset), Display/Style/Formatting (Metabase), Style (Looker), Format (Sigma/Mode) |

This split is the single most important structural decision. Superset even encodes it _programmatically_: its `ControlPanelsContainer` decides whether a control belongs in the Data tab by checking whether that control's `renderTrigger` is `false` (i.e. it forces a new query) or is explicitly marked `tabOverride: 'data'` ([Superset design proposal](https://github.com/apache/superset/discussions/14275)). The rule that falls out of this: **anything that changes the SQL goes in Data; anything that only re-paints goes in Format.** DBExec should adopt exactly this test as the sorting function for controls.

Two tools deliberately _don't_ tab-split and instead stack everything in one scroll (Tableau's Marks card, Hex's config panel). That works only when the encoding surface is small and visual (see §2).

---

## 2. How fields get assigned to encodings — four interaction idioms

This is where the tools diverge most, and where "polish" is most visible.

### Idiom A — Drag-to-shelf (Tableau, the archetype)

Fields are dragged from a Data pane onto named **shelves**: Columns and Rows define the axes; the **Marks card** holds the visual-channel shelves — **Color, Size, Label, Detail, Tooltip, Shape** ([Tableau Shelves & Cards](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm)). Dropped fields become **pills** that are themselves interactive: click for a context menu (change aggregation, sort, edit), drag to reorder or move between shelves.

Two subtleties worth stealing:

- **Cardinality rules per channel.** Color, Label, Detail, and Tooltip accept _multiple_ fields; Size and Shape accept exactly _one_ ([Tableau Marks](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties.htm)). The UI enforces this — dropping a second field on Size replaces the first.
- **The Marks card mutates with mark type.** The available channels change based on whether the mark is a bar, line, circle, or map ([mark-type behavior](https://medium.com/@deepak.holla/how-do-the-properties-in-the-marks-card-vary-based-on-the-mark-type-selected-or-present-in-the-fb1c375270ab)). Selecting "Pie" reveals an **Angle** shelf that doesn't exist for bars. Progressive disclosure by chart type, not just by basic/advanced.

Tableau also ships **"Show Me"** — a chart-picker that inspects the fields currently in play and highlights which chart types are _valid_ for that combination, greying out the rest. This is guided disclosure: the tool tells you what's possible before you commit.

### Idiom B — Named buckets / field wells (Power BI, Looker Studio, Mode)

Instead of a freeform card, fields drop into **labelled wells** that name their role. Power BI's **Build pane** shows wells that _change per visual_: a bar chart exposes **Axis / Legend / Values**, a different visual exposes different wells ([Power BI report editor tour](https://learn.microsoft.com/en-us/power-bi/create-reports/service-the-report-editor-take-a-tour)). Looker Studio's **Setup tab** is the same pattern — drag fields into Dimension / Metric / Sort wells ([Looker Studio Setup vs Style](https://docs.cloud.google.com/looker/docs/editing-visualizations-new-explore-experience)). Mode's builder uses explicit **X-axis / Y-axis / Color drop zones** and does date-math and aggregation **on the fly as you drop** ([Mode drag-and-drop charts](https://mode.com/blog/drag-and-drop-charts/)).

Power BI shipped two refinements in 2024 that are directly relevant:

- **On-object interaction**: the Build button lives _on the visual_ itself, not only in a side rail, so you configure in place ([on-object interaction](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction)).
- **Empty-well hinting**: cards that only become relevant once a field is present are now _shown greyed with a tooltip explaining what to add to enable them_, rather than hidden entirely ([new Format pane](https://powerbi.microsoft.com/en-us/blog/introducing-the-new-format-pane-preview/)). This solves the classic "where did that option go?" problem.

### Idiom C — Dropdown pickers (Superset, Metabase)

No canvas drag. Each encoding is a **dropdown/multiselect** in the Data tab: pick the temporal column, pick the metric, pick the group-by dimension ([Superset exploring data](https://superset.apache.org/docs/using-superset/exploring-data/)). This is faster for keyboard users and far easier to build, but loses the spatial intuition of shelves. Superset's metric pickers open a **popover sub-editor** (choose column → aggregate → optional label / SQL), which recovers some of the pill richness.

### Idiom D — Hybrid pill-in-dropzone (Hex, Sigma — the modern synthesis)

The newest tools merge B and A. Hex's rebuilt chart cell lets you **drag fields into the config panel _or_ directly into the chart's empty state**, and the dropped fields become **clickable pills** that change aggregate type and date-truncation inline; series can be dragged to reorder or reassigned to a second Y-axis ([Hex new chart cells](https://hex.tech/blog/new-chart-cells/), [Hex chart cells docs](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells)). Sigma organizes the same idea under a **Properties tab** (chart type + source columns) beside a **Format tab** ([Sigma intro to charts](https://help.sigmacomputing.com/docs/intro-to-visualizations)).

**Recommendation for DBExec:** Idiom D is the current state of the art and the right target — **dropzone wells that accept drag _and_ click-to-pick, producing interactive pills** with inline aggregate/format menus. It gives beginners dropdowns, power users drag, and keeps the spatial role-labelling of wells.

---

## 3. How the panel is sectioned

### Tabs at the top level

The dominant pattern is **2–5 top tabs**, always leading with data:

- Metabase: **Data · Display · Axes · Formatting · Style** (tabs vary by chart; a plugin per chart type declares which sections it owns) ([Metabase visualization overview](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results)).
- Superset & Looker Studio & Sigma & Mode: two tabs (**Data/Setup/Properties + Customize/Style/Format**).
- Power BI: **Build + Format** tabs, with Format further split into **Visual** vs **General** sub-tabs (see below).

### Collapsible sections inside a tab

Within a tab, controls are grouped into **collapsible accordion sections** with clear headers. Superset added these deliberately (["add collapsible Control sections"](https://github.com/apache/superset/pull/3354)) and made **most sections collapsed by default** so the panel opens uncluttered — Query section first, filters pulled to the top ([Explore control panel improvements](https://github.com/apache/superset/issues/11916)). Looker Studio's Style tab uses the same **expandable sections**, named identically to the classic tab names for muscle-memory continuity ([Looker editing visualizations](https://docs.cloud.google.com/looker/docs/editing-visualizations-new-explore-experience)).

Superset's other structural principle is worth stating verbatim as a design goal: **the same kind of control should live under the same-named section across every chart type**, so users build a stable spatial map ([design proposal](https://github.com/apache/superset/issues/11916)). Inconsistent section placement per chart is the #1 thing that makes a config panel feel amateur.

### Power BI's Visual-vs-General split

Power BI's Format pane divides every card into **Visual-specific** (only relevant to this chart type — e.g. bar rounding) vs **General** (the container: title, background, border, shadow, padding — identical across all visuals) ([format pane model](https://learn.microsoft.com/en-us/power-bi/developer/visuals/format-pane-general)). This is a clean third axis of grouping that DBExec should copy: **chart-intrinsic formatting** separated from **container/chrome formatting**.

### Per-column configuration

Tables get a dedicated pattern: Metabase's **Columns tab** lists every visible column with an **eye icon to hide** and **drag-to-reorder**; clicking a column header (or its gear) opens a **per-column Formatting sub-panel** ([Metabase tables](https://www.metabase.com/docs/latest/questions/visualizations/table)). Conditional formatting is its own tab with rule-based single-color/color-range editors. This maps directly onto DBExec task #1027 (per-column display name + description + format hints).

---

## 4. Progressive disclosure — basic vs advanced

Every polished panel hides complexity until asked:

- **Collapse-by-default** (Superset): advanced sections are shut on open; the common 80% is visible, the rest one click away.
- **Contextual reveal by chart type** (Tableau Marks card, Power BI dynamic cards): options appear _only when applicable_. Power BI's 2024 refinement is the tell — instead of hiding, it now **shows the card disabled with a tooltip saying what to add to enable it** ([new Format pane](https://powerbi.microsoft.com/en-us/blog/introducing-the-new-format-pane-preview/)). Reveal-when-relevant beats hide-completely because it teaches.
- **Contextual reveal by field presence**: a Legend/Color format section only materializes once a field sits in the color well.
- **Escape hatch to raw config** (Superset): a full **ECharts Option Editor** at the bottom of the Customize tab for ECharts-based charts, so power users can drop to the underlying library's JSON when the GUI runs out ([Superset exploring data](https://superset.apache.org/docs/using-superset/exploring-data/)). Provide a ceiling, not a wall.
- **Search across the panel** (Power BI): a search box over format cards — essential once the panel exceeds ~15 sections ([format pane search](https://powerbi.microsoft.com/en-us/blog/introducing-the-new-format-pane-preview/)).

### The declarative counterpoint — Observable Plot

Observable Plot has **no config panel at all**; the "panel" is the marks + channels API in code (`Plot.barY(data, {x, y, fill})`). Every GUI above is essentially a visual front-end onto exactly this grammar-of-graphics vocabulary — mark type + channel encodings + scales. The lesson for a config-panel designer: **your panel's sections should mirror a clean declarative schema** (marks / encodings / scales / legends / labels). If the panel maps 1:1 to a serializable config object, state, undo, templating, and copy-paste-between-charts all come nearly free. DBExec should design the config _object_ first and generate the panel from it.

---

## 5. Format sub-panels — the polish details

What separates "works" from "feels good," pulled from Mode, Metabase, and Power BI:

- **Number/date format editors** with live preview: precision, thousands separators, currency/percent, prefix/suffix, date truncation. Mode's format panel handles axis-label format, precision, and scale type (linear/log) per axis ([Mode visualizations](https://mode.com/help/articles/visualizations/)).
- **Axis controls**: title on/off + custom text, label rotation angle, scale type, min/max, dual-axis assignment (Mode, Hex's two-axis-with-multi-series model).
- **Color**: named palettes + fully custom palettes; per-series color override; conditional/data-driven color. Both Mode and Metabase expose palette pickers plus custom palettes ([Mode custom palettes](https://mode.com/blog/custom-color-palettes/)).
- **Labels & legend**: toggle data labels, legend position, tooltip field customization (Tableau's Tooltip _is_ a shelf you drop fields onto).
- **Live, debounced preview**: format changes must repaint instantly with no re-query — this is the whole point of the Data/Format split and is what makes the panel feel responsive.

---

## 6. What makes each feel polished (the "why it's good" notes)

- **Tableau** — pills are first-class objects (menu, drag, aggregate); channels enforce cardinality; the card _is the chart's identity_, mutating with mark type. Show Me guides valid choices.
- **Power BI** — on-object editing; Visual/General format split; disabled-with-tooltip cards; format search; ubiquitous reset-to-default per section.
- **Metabase** — chart-type-declared sections (each viz owns its tabs); per-column table management with hide/reorder; conditional formatting as a rule builder.
- **Superset** — programmatic Data/Customize sorting via `renderTrigger`; collapse-by-default; cross-chart section consistency; ECharts escape hatch.
- **Looker Studio** — dead-simple Setup(what)/Style(how); Style sections named identically to the legacy tabs for continuity.
- **Hex / Sigma** — the modern synthesis: drag _or_ click into wells, interactive pills with inline aggregate/trunc menus, a **one-click "clear all fields and formatting"** reset ([Hex chart cells](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells)), multi-series drag between axes.

---

## 7. Checklist — what a modern config panel MUST have

**Structure**

1. Split into **Data/Encoding** vs **Format/Style** — top tabs or clearly divided regions. Data always first/leftmost.
2. Sort every control by the **`renderTrigger` test**: changes the query → Data; only repaints → Format. (Superset)
3. Inside each tab, **collapsible accordion sections with headers**, most **collapsed by default**. (Superset)
4. **Section names identical across all chart types** — same control, same place, every time. (Superset)
5. Separate **chart-intrinsic** formatting from **container/chrome** formatting (title, background, border, padding). (Power BI Visual vs General)

**Field assignment** 6. **Named wells/dropzones** that label the encoding role (Axis, Value, Color, Size, Detail, Tooltip). (Power BI / Tableau) 7. Accept **both drag-and-drop and click-to-pick**; also allow dropping onto the **empty chart** directly. (Hex) 8. Dropped fields render as **interactive pills** — click to change aggregate, date-truncation, sort, label, or remove; drag to reorder / move between wells. (Tableau, Hex) 9. **Enforce channel cardinality** (single-field vs multi-field wells) in the UI. (Tableau) 10. **Wells change per chart type**; selecting a chart reveals only its valid encodings. (Tableau, Power BI)

**Progressive disclosure** 11. **Reveal-when-relevant**, and prefer **disabled-with-tooltip over hidden** for context-dependent controls. (Power BI) 12. A guided **chart-type picker** that indicates which types are valid for the current fields. (Tableau Show Me) 13. **Search box** over sections/controls once the panel is large. (Power BI) 14. An **escape hatch to raw config** (library JSON / advanced editor) for power users. (Superset ECharts editor)

**Format quality** 15. **Number & date format editors** with live preview (precision, separators, currency/percent, prefix/suffix, truncation). 16. **Axis controls**: title toggle+text, scale type (linear/log), min/max, label rotation, dual-axis. 17. **Color**: named + custom palettes, per-series override, conditional/data-driven color. 18. **Per-column config for tables**: hide (eye icon), drag-reorder, per-column format sub-panel, conditional-formatting rules. (Metabase) 19. **Labels/legend/tooltip** toggles and positioning; customizable tooltip fields.

**Behavior & feel** 20. **Format changes repaint instantly, never re-query** (debounced, client-side). 21. **Reset-to-default** per section and a **"clear all fields + formatting"** action. (Hex) 22. Config maps **1:1 to a serializable schema object** → free undo/redo, templating, copy-between-charts, and a declarative source of truth. (Observable Plot lesson) 23. Consider **on-object / in-context editing** so config lives next to the chart, not only in a distant rail. (Power BI 2024)

---

## Sources

- [Tableau — Shelves and Cards Reference](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm)
- [Tableau — Control the Appearance of Marks](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties.htm)
- [Tableau — Marks properties vary by mark type](https://medium.com/@deepak.holla/how-do-the-properties-in-the-marks-card-vary-based-on-the-mark-type-selected-or-present-in-the-fb1c375270ab)
- [Power BI — Format pane and formatting model](https://learn.microsoft.com/en-us/power-bi/developer/visuals/format-pane-general)
- [Power BI — Introducing the New Format Pane](https://powerbi.microsoft.com/en-us/blog/introducing-the-new-format-pane-preview/)
- [Power BI — Tour the Report Editor](https://learn.microsoft.com/en-us/power-bi/create-reports/service-the-report-editor-take-a-tour)
- [Power BI — On-object interaction](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-on-object-interaction)
- [Power BI — March 2024 Feature Summary](https://powerbi.microsoft.com/en-us/blog/power-bi-march-2024-feature-summary/)
- [Superset — Exploring Data](https://superset.apache.org/docs/using-superset/exploring-data/)
- [Superset — Design Proposal: Explore Control Panel Improvements (issue)](https://github.com/apache/superset/issues/11916)
- [Superset — Explore Control Panel Improvements (discussion)](https://github.com/apache/superset/discussions/14275)
- [Superset — Add collapsible Control sections (PR #3354)](https://github.com/apache/superset/pull/3354)
- [Metabase — Visualization overview](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results)
- [Metabase — Tables](https://www.metabase.com/docs/latest/questions/visualizations/table)
- [Looker — Configuring visualizations in the new Explore experience](https://docs.cloud.google.com/looker/docs/editing-visualizations-new-explore-experience)
- [Mode — Visualizations](https://mode.com/help/articles/visualizations/) · [Mode — Drag-and-drop charts](https://mode.com/blog/drag-and-drop-charts/) · [Mode — Custom color palettes](https://mode.com/blog/custom-color-palettes/)
- [Hex — An all-new interactive visualization experience](https://hex.tech/blog/new-chart-cells/) · [Hex — Chart cells docs](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells)
- [Sigma — Intro to charts/visualizations](https://help.sigmacomputing.com/docs/intro-to-visualizations)
- Observable Plot — declarative marks/channels grammar (config-as-schema counterpoint; no GUI panel)

**Bottom line for DBExec (task #1295):** adopt the two-tab **Data vs Format** split sorted by the re-query test; use **named dropzone wells with drag-or-click pills** (Hex/Sigma idiom); make **sections consistent across chart types and collapsed by default** (Superset); separate **chart-intrinsic from container formatting** (Power BI); and design the **config as a serializable schema object** first, rendering the panel from it (Observable Plot lesson). The checklist in §7 is the acceptance spec.

# Chart Chrome

I now have comprehensive, well-sourced material across all seven tools plus accessibility, tooltip, and formatting references. I have enough to synthesize the benchmark and produce the checklist. Let me compose the deliverable.

# Chart Card + Rendering Polish — BI Benchmark & Must-Have Checklist

Research covering the chart-card chrome and visual-rendering polish of Tableau, Power BI, Metabase, Superset, Looker/Looker Studio, Hex, and Sigma. Organized by anatomy element with per-tool patterns, then a specced checklist.

---

## 1. Chart card anatomy

The "card" is the framed container that wraps one visualization on a dashboard. The industry-convergent anatomy, top to bottom: **header (title + subtitle + kebab/actions) → optional divider → plot area → optional footer/caption**, wrapped in a **background + border + shadow** frame, with **resize/drag affordances** on the edges in edit mode.

**Per-tool patterns:**

- **Power BI** is the most explicit spec. Its "General" format tab defines the full card model: **Properties** (Height/Width in px, X/Y position, per-side **Padding**, lock aspect ratio), **Title** (title + **subtitle** as distinct sub-blocks, each with own font/size/style/color/alignment/wrap + semantic heading level for a11y, plus a **Divider** line with color/style/width, and explicit **Spacing** control between title, subtitle, divider, and plot area), **Effects** (**Background** fill + transparency, **Visual border** with color + rounded-corner radius + width, **Shadow** with color + offset + position), and a dedicated **Header icons** row (kebab "More options" `...`, focus mode, drill up/down, pin, filter, help-tooltip, comment, copy — each individually toggleable). This is the reference model to copy. ([Power BI format pane](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-format-pane-overview))
- **Tableau** works "biggest to smallest": format at workbook → worksheet → individual-mark level. Titles are editable rich text (font/size/style/color/alignment) and the guidance is **descriptive/insight-led titles with the key takeaway in the title itself**, plus deliberate ~8px spacing boxes between title and chart for a streamlined card. ([Tableau title formatting](https://help.tableau.com/current/pro/desktop/en-us/formatting_specific_titlecaption.htm), [Advanced formatting](https://datacrunchcorp.com/tableau-dashboard-formatting/), [7 formatting tips](https://depictdatastudio.com/seven-tips-for-formatting-tableau-dashboards/))
- **Hex** chart cells expose Title, configurable **axis labels defaulting to column names** (overridable in Style tab), legend, tooltip, per-series color/order/opacity, axis style/tick-count/min-max, data labels, and reference lines — a clean, modern card config surface. ([Hex chart cells](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells), [Hex new chart cells](https://hex.tech/blog/new-chart-cells/))
- **Metabase** cards default their **title to the question name**; the kebab/actions surface a palette icon for viz options and a `+` to add a series. Explicit guidance: **when many series hurt readability, split into separate cards.** ([Metabase multi-series](https://www.metabase.com/docs/latest/dashboards/multiple-series))
- **Superset 6.0** ships a full design-token theming system (design tokens, dark mode, per-dashboard theme JSON); charts expose a **Display Controls panel from the card context menu** (time grain, layers). ([Superset theming](https://superset.apache.org/admin-docs/configuration/theming/))
- **Looker Studio** puts all card chrome in a right-side **Style tab** (palette, typography, gridlines, legend, background/border with rounded corners on modern charts). ([Looker Studio style](https://www.catchr.io/university/looker-studio-lessons/charts-style), [Modern charts](https://lookercourses.com/modern-charts-in-looker-studio/))

**Convergent must-haves:** title (insight-led, ≤~8 words), optional subtitle for source/timeframe/units, kebab `...` for actions, per-side padding, background + 1px border + subtle radius + optional soft shadow, and edit-mode resize handles + drag grip.

---

## 2. Legend — placement & styling

- **Sigma** is the richest legend spec: **8 positions** (Top/Bottom/Left/Right + 4 corners), toggleable legend + separately toggleable **legend header**, label **font size 10–48pt**, text color via hex/picker, and separate color-legend vs size-legend toggles for scatter. ([Sigma legend](https://help.sigmacomputing.com/docs/format-chart-legend))
- **Hex** — show/hide + position config, per-series colors reflected in legend. ([Hex](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells))
- **Metabase** derives the legend from card/series titles so it maps series→question. ([Metabase](https://www.metabase.com/docs/latest/dashboards/multiple-series))
- **Looker Studio** styles the legend independently (display/position/alignment). ([Looker Studio](https://www.catchr.io/university/looker-studio-lessons/charts-style))
- **UX rules:** legend always visible and **near the chart** (not below a scroll fold); **make legend items clickable to toggle series**; for small datasets prefer **direct labeling** over a legend to cut eye travel. (skill rules `legend-visible`, `legend-interactive`, `direct-labeling`)

**Default recommendation:** top or right placement; interactive toggle; hide when a single series is directly labeled.

---

## 3. Tooltip design

Strong cross-tool consensus:

- **Content:** exact value(s) + dimension context; **2–3 metrics max**; readable in 3–5 seconds; don't put information _essential_ to understanding the chart only in the tooltip. ([tooltip best practices](https://nastengraph.medium.com/tooltips-in-dashboards-b0200980300d), [InterWorks say less](https://interworks.com/blog/2023/06/02/say-less-how-to-ensure-your-tooltips-add-value/))
- **Typography/hierarchy:** larger/bold for the headline value, smaller/gray for secondary; **right-align numbers** (Tableau's tab-alignment trick) so digits line up across rows. ([Tableau tooltips](https://interworks.com/blog/ccapitula/2015/02/17/tableau-essentials-formatting-tips-tooltips/))
- **Sigma & Hex** auto-select default tooltip fields (the plotted values) and let you **add custom tooltip entries** (Hex `+ Tooltip`; Sigma customizable mark tooltips). ([Sigma tooltip](https://help.sigmacomputing.com/docs/customize-chart-mark-tooltip-fields), [Hex](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells))
- **Power BI** supports both a formatted **default tooltip** (font/color/background/transparency) and a **report-page tooltip** (a mini-dashboard on hover), plus tooltip actions like drill-through. ([Power BI tooltips](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-visual-tooltips))
- **Tableau** allows a full **viz-in-tooltip**. ([Tableau viz in tooltip](https://help.tableau.com/current/pro/desktop/en-us/viz_in_tooltip.htm))
- **A11y:** tooltip content must be **keyboard-reachable**, not hover-only; positioning consistent across all cards; never overlap/block other content. (skill `tooltip-keyboard`, `tooltip-on-interact`)

---

## 4. Axis & gridline treatment

- **Looker Studio (modern charts)** separates **horizontal vs vertical gridlines** with independent color/thickness/spacing/show-hide, plus axis title styles and label rotation. ([Looker gridlines](https://www.graphed.com/blog/how-to-remove-gridlines-in-looker-studio), [Modern charts](https://www.databloo.com/blog/modern-charts-looker-studio/))
- **Hex** — axis style, tick count, explicit min/max. ([Hex](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells))
- **UX rules:** gridlines **low-contrast** (≈ gray-200) so they never compete with data; **auto-skip ticks** on small widths; axis labels carry **units** and readable scale; avoid rotated/truncated labels on mobile; data-vs-background contrast ≥ 3:1, data text labels ≥ 4.5:1. (skill `gridline-subtle`, `axis-readability`, `axis-labels`, `contrast-data`)

**Default recommendation:** horizontal gridlines only for column/line charts, gray-200 at 1px; y-axis with units; baseline (zero) emphasized slightly darker; no chart border-box.

---

## 5. Color palettes + accessibility

- **Tableau 10** is the canonical modern default: softer, "less Crayola-bright" **categorical** palette; **blue sequential** and **orange-blue diverging** by default (deliberately moving off red-green for color-vision deficiency). ([How Tableau 10 colors were designed](https://www.tableau.com/blog/colors-upgrade-tableau-10-56782), [Tableau CVD tips](https://www.tableau.com/blog/examining-data-viz-rules-dont-use-red-green-together))
- **Superset / Hex / Sigma / Looker Studio** all let dashboards define a **palette / design-token set** that individual charts inherit (Superset even disables per-chart color when inheriting from the dashboard, with a tooltip saying so). ([Superset colors](https://preset.io/blog/customizing-chart-colors-with-superset-and-preset/), [Hex custom palettes](https://hex.tech/blog/new-chart-cells/))
- **Accessibility ground truth:** keep **categorical palettes ≤ 7 colors** (ideally fewer) — colorblind-safe categorical sets rarely exceed ~4 distinct hues (ColorBrewer's CVD filter caps categorical at 4); rely on **differing lightness** so categories survive hue loss; supplement color with **line-style / pattern / shape / direct labels** — never color alone; verify against protanopia/deuteranopia/tritanopia/achromatopsia. WCAG: text 4.5:1 (AA), 7:1 (AAA); data marks ≥ 3:1. ([Accessible palettes](https://data.europa.eu/apps/data-visualisation-guide/accessible-colour-palettes), [colorblind-safe tool](https://toolsana.com/tools/colorblind-safe-palette-generator/), [Venngage guide](https://venngage.com/blog/color-blind-friendly-palette/))

---

## 6. Number & date formatting defaults

- **Power BI** has a per-visual **Data format** override (number/currency/percentage/date) that doesn't touch the model — important for calculated fields with no model format. ([Power BI format pane](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-format-pane-overview))
- **Metabase** offers value-label formatting modes: **Auto / Compact (1.2k) / Full**. ([Metabase](https://www.metabase.com/docs/latest/dashboards/multiple-series))
- **UX rules:** **locale-aware** numbers/dates/currency on axes and labels; **tabular/monospaced figures** in data columns and tooltips to prevent layout shift; **compact notation** (1.2k / 3.4M) on axes, full precision in tooltips; time-series must **label granularity** (day/week/month) and allow switching. (skill `number-formatting`, `number-tabular`, `time-scale-clarity`)

---

## 7. Empty / loading / error / no-data states

This is where most in-house tools under-invest; the vendors treat all four as distinct:

- **Loading:** skeleton/shimmer placeholder — **never an empty axis frame or blank box**; show it when load > ~300ms. (skill `loading-chart`, `progressive-loading`)
- **No-data (query ran, zero rows):** explicit "No data" message + guidance/next step, not a blank plot. (skill `empty-data-state`, `empty-states`)
- **Empty (not yet configured):** prompt to pick fields/metric.
- **Error (query/render failed):** human error message **+ retry action** (and ideally a details/expand) — not a broken/blank chart. (skill `error-state-chart`, `timeout-feedback`, `error-recovery`)

All four should live **inside the card frame**, preserving title + card chrome so the dashboard grid doesn't reflow. Power BI reinforces this with dedicated header **info/warning/error icons** per visual.

---

## Must-Have Chart-Card + Rendering-Polish Checklist

**A. Card chrome / anatomy**

- [ ] Header with **title** (insight-led, ≤ 8 words) + optional **subtitle** (source / timeframe / units) as separate styled blocks.
- [ ] **Kebab `...`** actions menu (view data, export CSV/PNG, focus/fullscreen, refresh, edit, remove) right-aligned in header.
- [ ] Optional **divider** between header and plot area with independent spacing control.
- [ ] **Frame:** background fill, **1px border**, corner radius **8–12px**, optional soft shadow — all from shared design tokens, matched light/dark.
- [ ] **Per-side padding** token (recommend **16px** card padding; **8px** header→plot gap).
- [ ] Edit mode: **resize handles** (corner + edges) and a **drag grip**; content reflows, no jitter.
- [ ] Optional **footer/caption** slot for notes/last-updated.

**B. Typography scale (card-local)**

- [ ] Title **16px / 600**, subtitle **13px / 400 muted (gray-600)**, axis labels **12px**, tick/legend labels **11–12px**, tooltip headline **13–14px bold** + secondary **11–12px gray**. Never below **11px** for chart text.
- [ ] **Tabular figures** everywhere numbers align (axes, tooltips, data labels, tables).

**C. Legend**

- [ ] Present by default; **near the chart** (top or right); position configurable.
- [ ] **Click-to-toggle** series; hidden series visibly de-emphasized.
- [ ] Auto-hide + **direct-label** when single series or ≤ ~4 points.

**D. Tooltip**

- [ ] On hover **and** keyboard focus (not hover-only); consistent placement; never blocks the mark.
- [ ] Dimension context + exact value; **≤ 2–3 metrics**; headline value bold, secondary muted; **right-aligned numbers**; full precision (tooltip) vs compact (axis).

**E. Axis & gridlines**

- [ ] Gridlines **gray-200, 1px, horizontal-only** by default; user-toggleable per axis.
- [ ] Axis labels include **units**; **auto-skip** crowded ticks; no forced label rotation on narrow cards.
- [ ] Data marks ≥ **3:1** vs background; data text labels ≥ **4.5:1**.

**F. Color**

- [ ] Dashboard-level **palette token** inherited by all cards (single source of truth).
- [ ] Categorical **≤ 7 colors**; palette ordered by lightness; **avoid red-green pairing**; default sequential = single-hue, diverging = orange-blue.
- [ ] Meaning never by color alone — pair with **line style / pattern / shape / label / icon**.

**G. Formatting defaults**

- [ ] **Locale-aware** numbers, currency, dates.
- [ ] **Compact notation** on axes (1.2k/3.4M), full in tooltip.
- [ ] Per-field format override that doesn't mutate the dataset.
- [ ] Time-series shows **granularity** and allows switching.

**H. State coverage (all four, inside the card frame)**

- [ ] **Loading:** skeleton/shimmer > 300ms; never a bare axis or blank box.
- [ ] **No-data:** "No data" + guidance, card chrome preserved.
- [ ] **Empty/unconfigured:** prompt to choose metric/fields.
- [ ] **Error:** message **+ retry**; optional details expander; header error icon.
- [ ] Chart entrance animation respects **prefers-reduced-motion**; data readable immediately.

**I. Accessibility backstop**

- [ ] Interactive marks **keyboard-navigable**, ≥ 44px tap area (or expand on touch).
- [ ] Per-chart **aria-label / text summary** of the key insight; **table alternative** available.
- [ ] Export (CSV + image) for data-heavy charts.

---

## Sources

- [Power BI — Format pane General tab (card chrome, title/subtitle/divider/spacing, effects, header icons, tooltips, alt text)](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-format-pane-overview)
- [Power BI — Visual tooltips](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-visual-tooltips)
- [Tableau — Format individual parts of the view (titles)](https://help.tableau.com/current/pro/desktop/en-us/formatting_specific_titlecaption.htm)
- [Tableau — Visual best practices](https://help.tableau.com/current/pro/desktop/en-us/visual_best_practices.htm)
- [Tableau — Advanced dashboard formatting](https://datacrunchcorp.com/tableau-dashboard-formatting/)
- [Tableau — Seven formatting tips (NASAA)](https://depictdatastudio.com/seven-tips-for-formatting-tableau-dashboards/)
- [Tableau — Tooltip formatting](https://interworks.com/blog/ccapitula/2015/02/17/tableau-essentials-formatting-tips-tooltips/)
- [Tableau — Viz in tooltip](https://help.tableau.com/current/pro/desktop/en-us/viz_in_tooltip.htm)
- [Tableau — How the Tableau 10 palettes were designed](https://www.tableau.com/blog/colors-upgrade-tableau-10-56782)
- [Tableau — Colorblind-friendly viz (avoid red-green)](https://www.tableau.com/blog/examining-data-viz-rules-dont-use-red-green-together)
- [Metabase — Charts with multiple series](https://www.metabase.com/docs/latest/dashboards/multiple-series)
- [Metabase — Tooltips](https://www.metabase.com/docs/latest/questions/visualizations/tooltips)
- [Apache Superset — Theming (design tokens, dark mode)](https://superset.apache.org/admin-docs/configuration/theming/)
- [Preset — Customizing chart colors with Superset](https://preset.io/blog/customizing-chart-colors-with-superset-and-preset/)
- [Looker Studio — Chart style panel](https://www.catchr.io/university/looker-studio-lessons/charts-style)
- [Looker Studio — Modern charts (gridlines/axes/palettes)](https://lookercourses.com/modern-charts-in-looker-studio/)
- [Looker Studio — Remove/style gridlines](https://www.graphed.com/blog/how-to-remove-gridlines-in-looker-studio)
- [Hex — Chart cells (anatomy, legend, tooltip, series, axis)](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells)
- [Hex — New interactive chart cells](https://hex.tech/blog/new-chart-cells/)
- [Sigma — Format chart legend (8 positions, font 10–48pt)](https://help.sigmacomputing.com/docs/format-chart-legend)
- [Sigma — Customize chart mark tooltip fields](https://help.sigmacomputing.com/docs/customize-chart-mark-tooltip-fields)
- [Tooltips in dashboard design (2–3 metrics, hierarchy, positioning)](https://nastengraph.medium.com/tooltips-in-dashboards-b0200980300d)
- [InterWorks — Say less: tooltips that add value](https://interworks.com/blog/2023/06/02/say-less-how-to-ensure-your-tooltips-add-value/)
- [European Data Portal — Accessible colour palettes](https://data.europa.eu/apps/data-visualisation-guide/accessible-colour-palettes)
- [Colorblind-safe palette generator](https://toolsana.com/tools/colorblind-safe-palette-generator/)
- [Venngage — Colorblind-friendly palettes](https://venngage.com/blog/color-blind-friendly-palette/)

Internal reference: `ui-ux-pro-max` skill Charts & Data ruleset (`legend-visible`, `legend-interactive`, `tooltip-on-interact`, `tooltip-keyboard`, `gridline-subtle`, `axis-readability`, `contrast-data`, `color-not-only`, `pattern-texture`, `number-formatting`, `number-tabular`, `empty-data-state`, `loading-chart`, `error-state-chart`, `animation-optional`, `direct-labeling`, `no-pie-overuse`, `export-option`) at `/Users/gaurav.goel/.claude/skills/ui-ux-pro-max`.

# Chart Types

I have all the research I need. This is a research deliverable that goes into my final response verbatim, so I'll synthesize the full checklist now. I won't touch the task list — that's the parent's job.

---

# Modern BI Chart Type + Per-Chart Feature Coverage — Benchmark & Must-Have Checklist

Benchmarked across **Tableau, Power BI, Metabase, Superset, Looker (+ Looker Studio), Hex, Sigma, Observable Plot**. Legend for the coverage column: ✅ = ships it natively, ◐ = partial / via workaround / add-on, ✕ = not native.

---

## PART 1 — Canonical Chart Type Catalogue

**Tier key:** **[TS] Table-stakes** = every serious BI tool ships it; absence is a credibility gap. **[STD] Standard** = the strong majority ship it; expected in a mature tool. **[NTH] Nice-to-have** = differentiator / specialized; ship opportunistically.

### 1A. Comparison (categorical)

| Chart                     | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ------------------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Bar (horizontal)          | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Column (vertical bar)     | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Grouped / clustered bar   | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Stacked bar/column        | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| 100% stacked bar/column   | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Combo / dual (bar + line) | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Bullet chart              | **NTH** | ✅      | ◐        | ✕        | ✕        | ✅     | ✕   | ◐     | ◐        |
| Radar / spider            | **NTH** | ✕       | ◐        | ✕        | ✅       | ✕      | ✕   | ✕     | ◐        |
| Radial / rose             | **NTH** | ◐       | ◐        | ✕        | ✅       | ✕      | ✕   | ✕     | ◐        |

### 1B. Trend / change-over-time

| Chart                         | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ----------------------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Line                          | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Multi-series line             | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Area                          | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Stacked area                  | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Sparkline (inline mini-trend) | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Step line                     | **NTH** | ◐       | ✅       | ✕        | ✅       | ◐      | ✕   | ✕     | ✅       |
| Timeline / Gantt              | **NTH** | ✅      | ◐        | ✕        | ✕        | ✅     | ✕   | ✕     | ◐        |
| Candlestick / OHLC            | **NTH** | ◐       | ◐        | ✕        | ✕        | ✕      | ✕   | ✕     | ◐        |
| Stream graph                  | **NTH** | ◐       | ◐        | ✕        | ✅       | ✕      | ✕   | ✕     | ✅       |

### 1C. Part-to-whole

| Chart                               | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ----------------------------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Pie                                 | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ◐        |
| Donut                               | **TS**  | ◐       | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ◐        |
| Treemap                             | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ✕   | ✅    | ◐        |
| Stacked/100% bar (as part-to-whole) | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Funnel                              | **STD** | ◐       | ✅       | ✅       | ✅       | ✅     | ✕   | ✅    | ◐        |
| Sunburst (hierarchical)             | **NTH** | ◐       | ◐        | ✅       | ✅       | ✕      | ✕   | ✕     | ◐        |
| Sankey / flow                       | **NTH** | ◐       | ◐        | ✅       | ✅       | ✅     | ✕   | ✅    | ◐        |
| Waterfall                           | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ✕   | ✅    | ◐        |

### 1D. Distribution

| Chart            | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ---------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Histogram        | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Box plot         | **STD** | ✅      | ◐        | ✕        | ✅       | ✅     | ✕   | ✅    | ✅       |
| Heatmap (matrix) | **STD** | ✅      | ◐        | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Density / violin | **NTH** | ◐       | ✕        | ✕        | ✕        | ✕      | ✕   | ✕     | ◐        |

### 1E. Correlation / relationship

| Chart                        | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ---------------------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Scatter plot                 | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✅       |
| Bubble (scatter + size)      | **STD** | ✅      | ✅       | ◐        | ✅       | ✅     | ◐   | ✅    | ✅       |
| Correlation matrix / heatmap | **NTH** | ◐       | ✕        | ✕        | ✅       | ◐      | ◐   | ◐     | ✅       |
| Network / graph              | **NTH** | ◐       | ◐        | ✕        | ✅       | ✕      | ✕   | ✕     | ◐        |

### 1F. KPI / single-value

| Chart                          | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ------------------------------ | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Single big number / card       | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ✕        |
| KPI (value + target + trend)   | **TS**  | ◐       | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✕        |
| Number + delta vs prior period | **STD** | ◐       | ✅       | ✅       | ✅       | ◐      | ◐   | ✅    | ✕        |
| Card + sparkline               | **STD** | ◐       | ✅       | ✅       | ◐        | ✅     | ◐   | ✅    | ✕        |
| Gauge                          | **STD** | ◐       | ✅       | ✅       | ✅       | ✅     | ✕   | ✅    | ✕        |

### 1G. Tables / pivots

| Chart                              | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ---------------------------------- | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Plain data table                   | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ◐        |
| Pivot / crosstab / matrix          | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✕        |
| Table w/ subtotals + grand totals  | **TS**  | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✕        |
| Highlight table (heat-colored)     | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ✅       |
| Table w/ in-cell bars / sparklines | **STD** | ◐       | ✅       | ◐        | ◐        | ✅     | ◐   | ✅    | ✕        |

### 1H. Maps

| Chart                          | Tier    | Tableau | Power BI | Metabase | Superset | Looker | Hex | Sigma | Obs Plot |
| ------------------------------ | ------- | ------- | -------- | -------- | -------- | ------ | --- | ----- | -------- |
| Choropleth / filled region map | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ◐   | ✅    | ◐        |
| Point / symbol map (lat-long)  | **STD** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅  | ✅    | ◐        |
| Bubble map (sized points)      | **STD** | ✅      | ✅       | ◐        | ✅       | ✅     | ◐   | ✅    | ◐        |
| Heatmap / density map          | **NTH** | ✅      | ◐        | ✅       | ✅       | ◐      | ✅  | ✅    | ◐        |
| Custom GeoJSON boundaries      | **NTH** | ◐       | ◐        | ✕        | ✅       | ◐      | ◐   | ✅    | ◐        |

### 1I. Specialized (all **NTH** unless noted)

Word cloud • Chord • Arc/edge-bundling • Parallel coordinates • Calendar heatmap • Bump/rank chart • Dot/lollipop • Marimekko/mosaic • Deck.gl 3D geo (Superset). Ship only if a customer segment demands them.

---

### Chart-type verdict — the "must-ship" list

**Non-negotiable table-stakes (a serious BI tool that lacks any of these looks incomplete):**
Bar/column (incl. grouped + stacked), Line (multi-series), Area, Pie/Donut, Scatter, Single-value/KPI card, Plain table, Pivot/crosstab, Histogram, Combo (bar+line), and at least one filled-region **map**.

**Strongly expected (STD) to be credible against the leaders:**
100% stacked, Stacked area, Treemap, Funnel, Waterfall, Box plot, Heatmap, Bubble, Gauge, Point map, Highlight table, Sparkline.

**Opportunistic (NTH):**
Sankey/Sunburst, Radar, Bullet, Timeline/Gantt, Network, Candlestick, Density map, Deck.gl.

---

## PART 2 — Per-Chart FEATURE Checklist (the harder bar)

This is where tools separate. A tool can have 40 chart types and still feel toy-grade if these are missing. Coverage marks reflect where a feature is **first-class**.

**Priority key:** **[P0]** must-have for baseline credibility • **[P1]** expected in a mature tool • **[P2]** differentiator.

### 2A. Labeling & annotation

| Feature                                        | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex | Obs Plot |
| ---------------------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- | -------- |
| Data labels (on/off)                           | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  | ✅       |
| Data-label format (decimals, prefix/suffix, %) | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   | ✅       |
| Label position (inside/outside/auto)           | **P1** | ✅      | ✅       | ◐        | ✅       | ✅     | ✅    | ◐   | ✅       |
| Show total-of-stack label                      | **P1** | ✅      | ✅       | ◐        | ◐        | ◐      | ✅    | ✕   | ◐        |
| Label only min/max/first/last/N                | **P2** | ✅      | ◐        | ✕        | ✕        | ✕      | ◐     | ✕   | ✅       |
| Text annotations / callouts on canvas          | **P1** | ✅      | ✅       | ✕        | ✅       | ◐      | ✅    | ◐   | ✅       |

### 2B. Axes

| Feature                               | Prio   | Tableau | Power BI   | Metabase | Superset | Looker | Sigma | Hex |
| ------------------------------------- | ------ | ------- | ---------- | -------- | -------- | ------ | ----- | --- |
| Dual / secondary Y-axis               | **P0** | ✅      | ✅ (combo) | ✅       | ✅       | ✅     | ✅    | ✅  |
| Independent axis scale per axis       | **P0** | ✅      | ✅         | ✅       | ✅       | ✅     | ✅    | ✅  |
| Log scale                             | **P1** | ✅      | ✅         | ✅       | ✅       | ✅     | ◐     | ✅  |
| Manual axis min/max + tick interval   | **P0** | ✅      | ✅         | ✅       | ✅       | ✅     | ✅    | ✅  |
| Axis title / unit override            | **P0** | ✅      | ✅         | ✅       | ✅       | ✅     | ✅    | ✅  |
| Synchronized / shared axis            | **P1** | ✅      | ◐          | ◐        | ◐        | ◐      | ◐     | ◐   |
| Reversed axis                         | **P2** | ✅      | ✅         | ◐        | ✅       | ✅     | ◐     | ✅  |
| Categorical vs continuous axis toggle | **P1** | ✅      | ✅         | ✅       | ✅       | ✅     | ✅    | ✅  |

### 2C. Reference / analytics overlays

| Feature                                                 | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex | Obs Plot |
| ------------------------------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- | -------- |
| Constant reference line (fixed value)                   | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   | ✅       |
| Computed reference line (avg/median/min/max/percentile) | **P1** | ✅      | ✅       | ◐        | ◐        | ◐      | ◐     | ✕   | ✅       |
| Reference band / shaded region                          | **P1** | ✅      | ◐        | ✕        | ◐        | ◐      | ◐     | ✕   | ✅       |
| Multiple ref lines per chart                            | **P1** | ✅      | ✅       | ◐        | ◐        | ◐      | ◐     | ✕   | ✅       |
| Trend line (linear/poly/exp/log)                        | **P1** | ✅      | ✅       | ◐        | ✅       | ✅     | ◐     | ✕   | ✅       |
| Forecast (with confidence interval)                     | **P2** | ✅      | ✅       | ✕        | ◐        | ◐      | ◐     | ✕   | ◐        |
| Anomaly / outlier detection                             | **P2** | ◐       | ✅       | ✕        | ✕        | ✕      | ✕     | ✕   | ✕        |
| Error bars                                              | **P2** | ✅      | ✅       | ✕        | ◐        | ◐      | ✕     | ✕   | ✅       |

### 2D. Series formatting & stacking

| Feature                                                | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| ------------------------------------------------------ | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Per-series color                                       | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Per-series chart type (this series = bar, that = line) | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Per-series axis assignment (→ secondary)               | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Stacking mode: none / stacked / 100%                   | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Series display order / reorder                         | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Line style (solid/dash), width, marker toggle          | **P1** | ✅      | ✅       | ◐        | ✅       | ✅     | ◐     | ✅  |
| Custom color palette / brand theme                     | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Diverging / sequential color scales                    | **P1** | ✅      | ✅       | ◐        | ✅       | ✅     | ✅    | ✅  |

### 2E. Conditional formatting

| Feature                                  | Prio            | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| ---------------------------------------- | --------------- | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Color by rule / threshold (charts)       | **P1**          | ✅      | ✅       | ◐        | ◐        | ✅     | ✅    | ◐   |
| Color scale / gradient by value          | **P1**          | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Table cell background / font color rules | **P0** (tables) | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| In-cell data bars                        | **P1**          | ◐       | ✅       | ✕        | ◐        | ✅     | ✅    | ◐   |
| Icon sets / status indicators            | **P2**          | ◐       | ✅       | ✕        | ✕        | ◐      | ✅    | ✕   |

### 2F. Sorting, Top-N, filtering

| Feature                             | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| ----------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Sort by dimension (A-Z)             | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Sort by measure (value, asc/desc)   | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Top-N / Bottom-N filter             | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| "Others" bucket for remainder       | **P1** | ◐       | ◐        | ◐        | ✅       | ✅     | ◐     | ✕   |
| Chart-level (viz) filters           | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Interactive legend show/hide series | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |

### 2G. Drill & interactivity

| Feature                                     | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| ------------------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Tooltip on hover                            | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Customizable tooltip (fields, format, text) | **P1** | ✅      | ✅       | ◐        | ◐        | ✅     | ✅    | ✅  |
| Drill-down hierarchy (expand a level)       | **P1** | ✅      | ✅       | ✅       | ◐        | ✅     | ✅    | ◐   |
| Drill-through (jump to detail view)         | **P1** | ✅      | ✅       | ✅       | ◐        | ✅     | ✅    | ◐   |
| Cross-filter (click chart → filter others)  | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Click-through to underlying rows            | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |

### 2H. Small multiples / faceting

| Feature                                    | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex | Obs Plot |
| ------------------------------------------ | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- | -------- |
| Small multiples / trellis / facet grid     | **P2** | ✅      | ✅       | ◐        | ✅       | ◐      | ✅    | ◐   | ✅       |
| Shared vs independent scales across facets | **P2** | ✅      | ◐        | ✕        | ◐        | ✕      | ◐     | ✕   | ✅       |

### 2I. Number formatting

| Feature                                | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| -------------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Decimal places control                 | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Thousands separator / grouping         | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Currency + symbol                      | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Percent format                         | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Abbreviation (1.2K / 3.4M / 1.1B)      | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Date/time format tokens                | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ✅  |
| Prefix / suffix / custom format string | **P1** | ✅      | ✅       | ◐        | ✅       | ✅     | ✅    | ◐   |
| Negative-number style (parens / red)   | **P1** | ✅      | ✅       | ◐        | ◐        | ✅     | ✅    | ✕   |
| Locale-aware formatting                | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |

### 2J. Null / missing-data handling

| Feature                                       | Prio   | Tableau | Power BI | Metabase | Superset | Looker | Sigma | Hex |
| --------------------------------------------- | ------ | ------- | -------- | -------- | -------- | ------ | ----- | --- |
| Line: gap vs connect-across-null              | **P0** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Treat null as zero (toggle)                   | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Show/hide empty categories ("no data" rows)   | **P1** | ✅      | ✅       | ◐        | ◐        | ◐      | ◐     | ✕   |
| Null placeholder text in tables               | **P1** | ✅      | ✅       | ✅       | ✅       | ✅     | ✅    | ◐   |
| Date densification / fill gaps in time series | **P2** | ✅      | ◐        | ◐        | ◐        | ✅     | ◐     | ✕   |

---

### Feature verdict — the "must-have" gate

A chart engine is **not credible** until every **P0** across 2A–2J is present. Concretely, the minimum viable per-chart feature set is:

1. **Data labels** with number-format control.
2. **Dual / secondary axis** + manual min/max + axis titles.
3. At least **constant reference lines**.
4. **Per-series color + per-series axis assignment + stacking mode (none/stacked/100%)**.
5. **Table/pivot conditional formatting** (cell color rules).
6. **Sort by measure + Top-N + viz-level filters + interactive legend**.
7. **Hover tooltips**.
8. **Full number formatting** (decimals, separators, currency, %, date tokens).
9. **Line null handling** (gap vs connect).

**P1 = the bar to match the market leaders** (computed reference lines, reference bands, trend lines, drill-down/through, cross-filter, per-series chart type, abbreviation formatting, "Others" bucket, custom tooltips, log scale).

**P2 = differentiators, ship selectively** (forecast + confidence band, anomaly detection, small multiples w/ independent scales, icon sets, error bars, date densification).

---

### Notable observations for the DBExec diff

- **Observable Plot** is the outlier: it's a _marks grammar_, not a chart picker — it has no KPI card, no pivot, weak maps, but unbeaten composability and faceting. Treat it as the model for the _rendering layer_, not the _feature checklist_.
- **Hex** is deliberately lean (bar/line/scatter/map/single-value/table) — it leans on notebook code for anything advanced. It sets the _floor_, not the bar.
- **Power BI's Analytics pane** is the reference implementation for reference lines / trend / forecast / anomaly — the richest single feature surface to benchmark 2C against.
- **Tableau** sets the bar for reference bands, per-mark control, tooltips, and null/densification.
- **Superset** sets the bar for _breadth_ (30+ ECharts types incl. Sankey/radar/graph/deck.gl) but is weaker on polished per-chart config UX.
- **Pivot/crosstab with subtotals + grand totals** is table-stakes everywhere except the two code-native tools — a common under-invested area worth checking in DBExec.

**Sources:** [Tableau chart types](https://help.tableau.com/current/pro/desktop/en-us/what_chart_example.htm) · [Tableau reference lines & bands](https://help.tableau.com/current/pro/desktop/en-us/reference_lines.htm) · [Tableau missing values](https://help.tableau.com/current/pro/desktop/en-us/missing_values.htm) · [Power BI visualizations overview](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview) · [Power BI Analytics pane](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-analytics-pane) · [Power BI conditional formatting](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-conditional-formatting) · [Power BI combo chart](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-combo-chart) · [Metabase visualization overview](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results) · [Metabase combo charts](https://www.metabase.com/docs/latest/questions/visualizations/combo-chart) · [Metabase maps](https://www.metabase.com/docs/latest/questions/visualizations/map) · [Superset chart plugins](https://deepwiki.com/apache/superset/3.6-chart-plugins-and-visualization) · [Superset 30 chart types](https://www.tvl-managed-superset.com/tutorials/apache-superset-types-de-graphiques) · [Looker visualization types](https://docs.cloud.google.com/looker/docs/visualization-types) · [Looker Studio chart types](https://docs.cloud.google.com/looker/docs/studio/types-of-charts-in-looker-studio) · [Sigma intro to charts](https://help.sigmacomputing.com/docs/intro-to-visualizations) · [Sigma combo charts](https://help.sigmacomputing.com/docs/combo-charts) · [Sigma KPI chart](https://help.sigmacomputing.com/docs/build-a-kpi-chart) · [Hex chart cells](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells) · [Hex single value cells](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/single-value-cells) · [Observable Plot marks](https://observablehq.com/plot/features/marks)

# Interaction

I now have current confirmation on the newer/less-stable behaviors. Combined with my established knowledge of Tableau, Power BI, and Looker, I have enough to synthesize the full benchmark and checklist. Let me produce the final research output.

---

# BI Dashboard Interaction Model — Benchmark + Must-Have Checklist

Cross-tool benchmark of the interaction models modern BI dashboards are expected to support, followed by a prioritized "must-have interactions" checklist with per-tool notes. Relevant to DBExec's viz-v2 Dashboard/Analysis layer.

---

## Part 1 — The core interaction vocabulary

Every modern BI tool converges on the same conceptual verbs, but names them differently and wires them differently. The seven axes:

1. **Cross-filter** — click a mark, the OTHER charts' underlying queries re-run filtered to that value. Destructive to the other charts' data (rows disappear).
2. **Cross-highlight** — click a mark, other charts KEEP all data but dim/fade the non-matching marks. Non-destructive; keeps context.
3. **Drill-down (hierarchy)** — stay in the same chart, descend a defined hierarchy (Year → Quarter → Month; Country → State → City). Changes granularity of the SAME viz.
4. **Drill-through (to detail / another view)** — leave the mark and go somewhere: raw underlying rows, another dashboard page, or a detail report, carrying the clicked context as a filter.
5. **Hover** — tooltips on marks; tooltip-as-mini-report; hover sync (hovering one chart highlights the matching point on sibling time-series).
6. **Direct manipulation** — brush (drag-select a region), zoom, pan on continuous axes/maps; box/lasso select.
7. **Chrome interactions** — legend click (isolate/toggle series), dashboard-level parameters & filters, and how those compose with in-chart actions; plus keyboard/a11y.

---

## Part 2 — Tool-by-tool benchmark

### Tableau (the reference implementation for "dashboard actions")

The richest and most explicit action model. Interactions are configured as **Dashboard Actions**, each with a **source**, a **run trigger** (Hover / Select / Menu), and a **target**.

- **Filter actions** — source sheet selection filters target sheet(s). This is Tableau's cross-filter. Configurable field mapping (which source field maps to which target field), and "clearing the selection" behavior (show all / leave filtered / exclude all values).
- **Highlight actions** — cross-highlight; dim non-matching marks. Can be scoped to specific fields.
- **URL actions** — open external URL with clicked values templated in (`?id=<Order ID>`); can open in new tab, browser, or a Web Page dashboard object.
- **Go-to-Sheet / Go-to-Dashboard navigation actions** — jump to another dashboard, passing context.
- **Set actions** and **Parameter actions** — click a mark to write into a Set or Parameter, enabling proportional-brushing, what-if, and dynamic-title patterns.
- **Drill-down** — via defined hierarchies (+/- on the field); date-part drilling built in.
- **Drill-through to detail** — "View Data" / underlying data pane; more commonly a navigation action to a detail sheet.
- **Tooltips** — rich, formatted; **Viz-in-Tooltip** embeds a whole mini-chart in the hover tooltip.
- **Brush/zoom** — rubber-band select; axis zoom controls; pan on maps.
- Trigger granularity (Hover vs Select vs Menu) is the thing most other tools lack.

### Power BI (the reference for the filter-vs-highlight distinction)

Power BI is the clearest at separating the two destructive/non-destructive modes, and its terminology has become the industry vocabulary.

- **Cross-highlight (default)** — clicking a bar highlights related portions of other visuals, keeping full bars visible but faded. Non-destructive.
- **Cross-filter** — same click gesture but the target visuals are actually filtered. Per-visual, per-pair configurable via **Edit Interactions** (each source→target pair can be set to Filter / Highlight / None).
- **Drill-down** — explicit drill mode toggle on a visual with a hierarchy; drill up/down, "expand next level," and "show next level." Distinct from drill-through.
- **Drill-through pages** — right-click a data point → "Drill through" → a dedicated report page built to receive that entity's context (e.g. a Customer detail page). Back-button auto-added.
- **Tooltips-as-pages (report-page tooltips)** — a whole report page rendered as the hover tooltip; the single most-copied Power BI idea.
- **Bookmarks** — capture filter/slicer/visual state as a named snapshot; power the toggle/spotlight/storytelling patterns and buttons.
- **Slicers** — the dashboard-level filter chrome; sync across pages optionally.
- **Filter pane** — hierarchy of visual / page / report / drill-through filter scopes.

### Metabase

Pragmatic, click-behavior-per-column model. Three click behaviors, chosen per card (and per column on tables):

1. **Open the drill-through menu** (default) — a context menu with "Filter by this value," "See these records" (→ raw rows), "Break out by…" (ad-hoc drill-down by a chosen dimension), "Zoom in," "X-ray."
2. **Update a dashboard filter** — this is Metabase's cross-filter; a click on chart A sets a dashboard filter that other cards consume.
3. **Go to a custom destination** — another dashboard, a saved question, or an external URL, passing clicked values / user attributes into the destination's filters. SQL-native questions only get options 2 and 3 (no auto drill menu).

- No true cross-_highlight_ (dim-in-place); cross-interaction is filter-based.
- "See these records" is the built-in drill-to-detail.

### Superset

Feature-flagged, maturing fast; three relevant features (all default-on in recent 4.x):

- **Cross-filters** (`DASHBOARD_CROSS_FILTERS`) — click a mark emits a cross-filter to the dashboard, relayed to appropriately-scoped charts; bi-directional; as of 4.1.x works across datasets. Chart-level opt-out of emitting/receiving.
- **Drill to Detail** (`DRILL_TO_DETAIL`) — right-click → tabular view of the rows powering that mark. (Historic bug: "Drill to detail by" not always respecting applied filters.)
- **Drill By** (`DRILL_BY`) — right-click → pick another column to add as a group-by; the closest to ad-hoc drill-down. Modal-based.
- Native **dashboard filters** (filter box → native filter bar) compose with cross-filters.
- Weaker on cross-highlight and on hover-sync across charts.

### Looker (LookML-governed)

Governed, semantic-layer-driven interactions.

- **Drill fields / drilling** — LookML `drill_fields` define what happens on click; opens a drill overlay (a table or another viz) filtered to the clicked context. This is both drill-down and drill-to-detail depending on the fields defined.
- **Dashboard cross-filtering** — click to filter other tiles on the dashboard (toggleable per dashboard).
- **Link/data actions** — `link` in LookML for custom destinations; **Actions/Action Hub** for write-back and outbound triggers (send to Slack, create ticket).
- **Dashboard filters** are first-class and can be wired to specific fields per tile; strong governance over what's filterable.
- Tooltips are comparatively basic; hover-sync limited.

### Sigma (spreadsheet-native, "actions + sequences")

Most flexible modern action model after Tableau.

- **Actions** (and chained **Sequences**) — user-defined interactivity within and across elements: on click/select → **Filter** other elements, **Navigate** to another page passing context, set **control** values, open a modal, run write-back. Actions can be chained conditionally.
- **Drill anywhere / drill paths** — drill down/up on most chart types; clicking a value and choosing "Drill down" swaps the axis dimension and adds the corresponding filter automatically.
- **Cross-chart actions** — charts respond to each other's selections without separate filter chrome.
- **Drill-through / drill-across** — select an element → navigate to a detail page filtered to the value; click a table value → detailed view. Positions dashboards as "decision apps."
- **Controls** = the dashboard-level parameter/filter primitive; actions can read and write them.

### Hex (notebook/app-native)

Cross-filtering came to apps relatively recently; UI-first "project filters" are the primitive.

- **Chart selections** — click-drag range select, individual mark select, legend-based filtering directly on the chart.
- **Cross-filtering** — interacting with a chart to filter offers "apply to other matching elements," creating a **project filter** that other cells/dataframes consume; can replace hand-parameterized SQL/Python.
- **Project filters / filter cells** — point-and-click filter primitive attachable to app elements and dataframes; the dashboard-level filter layer.
- **Input parameters** — the classic control layer (dropdowns/sliders) driving parameterized queries; visual filtering is positioned as a lighter-weight alternative.
- Drill-through is expressed as navigation between app pages / conditional cells rather than a dedicated feature.

---

## Part 3 — Cross-tool terminology map (the confusing part)

| Concept                           | Tableau                 | Power BI                             | Metabase                                   | Superset           | Looker                    | Sigma                              | Hex                                 |
| --------------------------------- | ----------------------- | ------------------------------------ | ------------------------------------------ | ------------------ | ------------------------- | ---------------------------------- | ----------------------------------- |
| Cross-filter (destructive)        | Filter action           | Cross-filter (via Edit Interactions) | "Update a dashboard filter" click behavior | Cross-filters      | Dashboard cross-filtering | Filter action / cross-chart action | Project filter from chart selection |
| Cross-highlight (non-destructive) | Highlight action        | Cross-highlight (default)            | — (not native)                             | — (limited)        | — (limited)               | via conditional formatting         | limited                             |
| Drill-down (hierarchy)            | Hierarchy +/-           | Drill mode                           | "Break out by" / Zoom in                   | Drill By           | Drilling (`drill_fields`) | Drill anywhere / drill path        | conditional cells                   |
| Drill-through (to rows/detail)    | View Data / nav action  | Drill-through page                   | "See these records"                        | Drill to Detail    | Drill overlay             | Drill-through / navigate           | app-page navigation                 |
| Custom destination / URL          | URL action / nav action | Buttons + drill-through              | "Go to custom destination"                 | — (URL via markup) | `link` / Action Hub       | Navigate action                    | app navigation                      |
| Rich hover                        | Viz-in-Tooltip          | Report-page tooltip                  | tooltip                                    | tooltip            | tooltip                   | tooltip                            | tooltip                             |
| Saved view state                  | (via URL/params)        | Bookmarks                            | —                                          | — (permalink)      | —                         | (bookmarks)                        | app versions                        |

---

## Part 4 — MUST-HAVE INTERACTIONS CHECKLIST

Tiered by expectation. Tier 1 = table stakes (a dashboard without these reads as broken/old). Tier 2 = expected of a serious BI tool. Tier 3 = differentiators.

### Tier 1 — Table stakes (ship or the product looks dated)

- [ ] **Click-to-cross-filter.** Clicking a mark filters sibling charts on the same dashboard. Every tool has this. Must support click-again-to-clear and click-a-second-mark-to-multi-select (ctrl/cmd or shift).
- [ ] **Clear-all / reset filters.** A visible affordance to clear active cross-filters (Superset/Sigma show active-filter chips; copy this — a filter chip bar showing what's applied, each removable).
- [ ] **Hover tooltips.** Formatted tooltip on every mark showing the dimension(s) + measure(s) with proper number/date formatting. Non-negotiable.
- [ ] **Dashboard-level filters/params.** A filter bar (dropdowns, date range, search) that scopes all/selected charts. Must define scope (which charts each filter applies to).
- [ ] **Filter interplay is well-defined.** In-chart cross-filters AND the dashboard filter bar compose predictably (AND-combined) and the user can see the combined active state. This is where most home-grown dashboards fall down.
- [ ] **Legend interactions.** Click a legend item to toggle/isolate that series. Standard everywhere; users expect it.
- [ ] **Drill-to-detail (see the rows).** Right-click or menu → "see these records" showing the raw underlying rows for a mark. Metabase "See these records" / Superset "Drill to Detail" / Tableau "View Data" are the models. Cheapest high-value feature.
- [ ] **Loading + empty states per chart.** When a cross-filter re-queries, each chart shows its own loading state, and an explicit "no data for this selection" empty state (not a blank box).

### Tier 2 — Expected of a serious BI tool

- [ ] **Explicit cross-filter vs cross-highlight choice.** Adopt Power BI's model: per source→target pair, choose Filter / Highlight / None. Even if you ship only cross-_filter_ first, design the config surface so highlight can slot in. Highlight (dim-in-place) is what keeps context on dense dashboards.
- [ ] **Edit-interactions matrix.** A dashboard-author UI to decide which chart affects which (the Power BI "Edit interactions" grid, or Superset's per-chart emit/receive toggles). Without this, cross-filtering everything-affects-everything gets chaotic on >4 charts.
- [ ] **Drill-down on hierarchies.** Author defines a hierarchy (Year→Q→Month, Country→State→City); clicking descends within the same chart; breadcrumb + drill-up. Distinguish clearly in UI from drill-through.
- [ ] **Drill-through to another view.** Click an entity → navigate to a detail dashboard/page that receives the clicked context as its filters, with an auto back-button. Power BI drill-through pages / Sigma navigate action / Metabase custom destination are the models.
- [ ] **Custom click destination (URL + internal).** Per-chart (and per-column for tables) config: default drill menu vs update-a-filter vs go-to-URL/dashboard, with clicked values templated into the destination. Metabase's per-column click behavior is the gold standard for tables.
- [ ] **Brush / zoom / pan on continuous axes.** Drag-select a time range to zoom (and to emit a range cross-filter); scroll/pinch zoom and pan on line charts and maps; a reset-zoom control.
- [ ] **Hover-sync across time-series.** Hovering one time-series chart shows a shared crosshair + matching tooltip point on all aligned time-series (the "linked cursor"). Big perceived-quality win; most home-grown dashboards miss it.
- [ ] **Active-state visibility.** Selected marks stay visibly selected; cross-filter source is indicated; filter chips list every active constraint and its origin.
- [ ] **Keyboard + a11y baseline.** Tab to each chart/legend/filter; Enter/Space to activate a mark or legend toggle; Esc to clear selection; arrow keys to move between marks; visible focus ring; tooltips reachable without hover; ARIA roles + a screen-reader data-table fallback per chart; respect `prefers-reduced-motion` for transitions. This is the axis every tool is weakest on and where you can differentiate on trust/compliance.

### Tier 3 — Differentiators (ship later; design for them now)

- [ ] **Rich hover (viz-in-tooltip / tooltip-as-page).** A mini-chart or a small templated report inside the tooltip (Tableau Viz-in-Tooltip, Power BI report-page tooltips). High wow-factor.
- [ ] **Bookmarks / saved view state.** Name and recall a full filter+drill+selection state; power toggle/spotlight/storytelling and shareable deep links. (Ties into DBExec's saved-queries + point-in-time dashboard-snapshot model already in memory.)
- [ ] **Parameter/set actions (click-to-set).** Clicking a mark writes into a parameter/control that drives titles, what-if calcs, or reference lines (Tableau parameter/set actions; Sigma actions writing controls).
- [ ] **Action chaining / sequences.** One gesture triggers an ordered set (filter + navigate + set control), optionally conditional (Sigma sequences). Turns dashboards into "decision apps."
- [ ] **Cross-dataset cross-filtering.** Cross-filters resolve across charts backed by different datasets/queries via a shared logical field (Superset 4.1+). Needs a semantic mapping layer.
- [ ] **Write-back / outbound actions.** Click → create ticket / send to Slack / update a row (Looker Action Hub, Sigma actions, Hex). Only if DBExec wants the "operational BI" positioning.

---

## Part 5 — Design guidance specific to DBExec's build

1. **Model the action as {source, trigger, target, field-mapping, on-clear}.** This is Tableau's schema and it generalizes to every other tool's feature. Store interactions as data on the dashboard definition, not as hard-coded chart behavior — it makes cross-filter, highlight, drill-through, and URL actions all the same primitive with different `target.type`.
2. **Ship the order:** cross-filter → filter-chip bar + clear-all → drill-to-detail (cheap, reuses your existing raw-query/saved-query executor) → hierarchy drill-down → drill-through-to-page → then highlight-mode and rich tooltips.
3. **Make cross-filter vs cross-highlight a first-class author toggle from day one** even if highlight is stubbed — retrofitting the destructive/non-destructive distinction later is painful because it changes each chart's query lifecycle (highlight keeps the query result and only restyles marks; filter re-queries).
4. **Drill-through should reuse the dashboard-snapshot + saved-query context** already in project memory: the destination is "a dashboard/query filtered by carried context," which is exactly the parameter-passing you already have for saved queries.
5. **a11y is the open lane.** Every commercial tool is mediocre here. Keyboard-navigable marks + ARIA data-table fallback + focus management would be a genuine, defensible differentiator, and it's cheaper to build in now than to bolt on.

---

**Sources (for the newer/less-stable behaviors verified this session):** Superset — [Preset: Drill Down to Drill By](https://preset.io/blog/drill-down-and-drill-by/), [Superset cross-filter/DRILL_BY issue #31650](https://github.com/apache/superset/issues/31650); Sigma — [Sigma: Drill into data](https://help.sigmacomputing.com/docs/drill-into-data), [Sigma: Intro to actions](https://help.sigmacomputing.com/docs/intro-to-actions), [Sigma cross-chart actions quickstart](https://quickstarts.sigmacomputing.com/guide/data_apps_cross_chart_actions/index.html); Metabase — [Metabase: Dashboard interactivity](https://www.metabase.com/docs/latest/dashboards/interactive), [Metabase: Custom destinations](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/dashboards/custom-destinations), [Metabase: Drill-through](https://www.metabase.com/docs/latest/questions/visualizations/drill-through); Hex — [Hex: Project filters](https://learn.hex.tech/docs/share-insights/apps/project-filters), [Hex: interactive visualization](https://hex.tech/blog/new-chart-cells/). Tableau, Power BI (Edit Interactions, drill-through pages, report-page tooltips, bookmarks), and Looker (drill_fields, Action Hub) behaviors are from established product knowledge.
