# Per-Chart Configuration & Encoding Surface of Production BI Tools

**Benchmark scope:** Tableau (Marks card + Format pane + Analytics pane), Power BI (Format pane + Analytics pane), Apache Superset (Data + Customize tabs), Hex (chart cell). Every capability is tagged **[table-stakes]** (baseline across most tools) or **[advanced]** (a differentiator only some tools expose). This is written as a build-against checklist for a new BI/viz module.

---

## Legend of tool coverage

Where useful, a `T / PBI / SS / Hex` marker shows which tools expose the knob natively (not via workarounds/DAX/custom visuals). Anything that requires DAX or a custom visual is called out as such and treated as **not native**.

---

## 1. Encoding channels [table-stakes core, some channels advanced]

The atomic decision: what data drives what visual property. Tableau's Marks card is the reference model here — every other tool is a subset or a relabel of it.

| Channel                                   | What it does                                                                                                                            | Tool support                                                                                                                                                                            | Tier                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **X / Y (position)**                      | Primary spatial mapping; the two mandatory channels                                                                                     | T (Columns/Rows shelves) / PBI (X/Y axis wells) / SS (X-axis, metrics) / Hex (X/Y)                                                                                                      | [table-stakes]                                                                                                        |
| **Color**                                 | Discrete field → distinct color per member; continuous field → gradient                                                                 | All four                                                                                                                                                                                | [table-stakes]                                                                                                        |
| **Size**                                  | Bubble/scatter size; also bar width, line thickness, pie size in Tableau; continuous mapping via "Automatically / By range / From zero" | T (rich), PBI (limited, mostly bubble/scatter), SS (bubble), Hex (bubble)                                                                                                               | [table-stakes] for scatter; [advanced] for the auto/by-range/from-zero mapping modes (Tableau)                        |
| **Shape**                                 | Unique marker glyph per category; custom shape palettes from image files; 10 default shapes then repeat                                 | T (rich, custom palettes), PBI (marker shape per series, limited), Hex (limited)                                                                                                        | [table-stakes] for basic marker shape; [advanced] for custom image-based shape palettes (Tableau)                     |
| **Detail / Group**                        | Adds granularity (splits marks) without changing axes or adding a legend                                                                | T (Detail), Hex ("color by"/group), SS (dimensions/groupby), PBI (implicit via legend/details well)                                                                                     | [table-stakes] concept; the explicit "Detail" channel that adds LOD without color is [advanced] (Tableau's signature) |
| **Tooltip**                               | Fields shown on hover; add fields without visual encoding                                                                               | All four                                                                                                                                                                                | [table-stakes]                                                                                                        |
| **Label / Text**                          | Value printed on/next to the mark; "Text" is the mark type for cross-tabs                                                               | All four                                                                                                                                                                                | [table-stakes]                                                                                                        |
| **Row / Column facets (small multiples)** | Trellis the view by a dimension                                                                                                         | T (Rows/Columns pills, native + unlimited), PBI ("Small multiples" well, native, up to 6×6 grid), Hex (vertical + horizontal faceting, max 100 subplots), SS (limited/plugin-dependent) | [table-stakes] as a stated feature; true arbitrary row×column trellis is [advanced] (Tableau)                         |
| **Dual / secondary axis**                 | Two measures, independent scales, layered                                                                                               | T (dual axis + Synchronize Axis), PBI (line-and-column combo / secondary Y), SS (Mixed Time-Series chart), Hex (second Y-axis)                                                          | [table-stakes] for combo; independent vs **synchronized** dual axis toggle is [advanced]                              |
| **Path**                                  | Order in which line/polygon marks connect; line type Linear/Step/Jump; pattern Solid/Dashed/Dotted (Tableau 23.2+)                      | T only (native), others via chart-type choice                                                                                                                                           | [advanced]                                                                                                            |
| **Angle**                                 | Pie slice angle                                                                                                                         | T (Angle shelf), others implicit in pie chart type                                                                                                                                      | [table-stakes] (implicit)                                                                                             |

**Design takeaway:** Ship X/Y/Color/Size/Detail(group)/Tooltip/Label as the universal channel set. Facets, dual-axis, and shape are the next tier. Path/Angle are chart-type-specific and can be implicit.

---

## 2. Axis configuration

| Capability                                     | Detail                                                                                              | Tool support                                                                                               | Tier                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Axis title**                                 | Custom text, show/hide, font                                                                        | All four                                                                                                   | [table-stakes]                                                                                 |
| **Scale: linear**                              | Default                                                                                             | All four                                                                                                   | [table-stakes]                                                                                 |
| **Scale: logarithmic**                         | Tableau: log with configurable base (>1) + **Symmetric log** for datasets containing negatives/zero | T (incl. symmetric log), PBI (log on Y for some charts), SS (logarithmic axis toggle), Hex (scale styling) | [table-stakes] for log; **symmetric log** (handles negatives) is [advanced] (Tableau)          |
| **Scale: time/date**                           | Continuous date axis with date-aware ticks                                                          | All four                                                                                                   | [table-stakes]                                                                                 |
| **Min / Max (fixed range)**                    | Fixed start/end; **fix one end only** (e.g. start at 0, auto max)                                   | T (Fixed start / Fixed end, either or both), PBI (Y-axis Min/Max), SS (X/Y bounds), Hex (axis bounds)      | [table-stakes]                                                                                 |
| **Reversed axis**                              | Invert value order                                                                                  | T (native), others limited                                                                                 | [advanced]                                                                                     |
| **Gridlines**                                  | Major/minor, color, style, show/hide                                                                | All four (PBI gridlines, SS minor split lines)                                                             | [table-stakes]                                                                                 |
| **Tick / mark format**                         | Automatic / Fixed (at specified power/interval) / None; number format on ticks                      | T (Automatic/Fixed powers/None), PBI, SS, Hex (tick counts)                                                | [table-stakes] for basic; explicit "tick marks at powers of N" control is [advanced] (Tableau) |
| **Tick label rotation**                        | Angle the axis labels                                                                               | T, PBI, SS (label rotation), Hex                                                                           | [table-stakes]                                                                                 |
| **Label interval / skip**                      | Show every Nth label to avoid crowding                                                              | SS (label interval), PBI (concatenate/skip), T (auto)                                                      | [advanced]                                                                                     |
| **Sync vs independent (dual axis)**            | Force both axes to same scale, or keep independent                                                  | T (Synchronize Axis toggle), Hex (independent by default), PBI (align to combo)                            | [advanced]                                                                                     |
| **Axis position / orientation**                | Axis on opposite side; chart orientation (horizontal/vertical)                                      | SS (axis position + chart orientation), PBI (flip), T                                                      | [table-stakes] for orientation                                                                 |
| **Separate number format for axis vs tooltip** | Axis abbreviated (1M), tooltip full                                                                 | T (documented pattern), PBI (per-element)                                                                  | [advanced]                                                                                     |

---

## 3. Series configuration

| Capability                        | Detail                                                             | Tool support                                                                                                              | Tier                                                                      |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Per-series color**              | Override color of individual series                                | All four (Hex per-series palette or custom hex/CSS; SS via label_colors JSON)                                             | [table-stakes]                                                            |
| **Per-series chart type (combo)** | e.g. line + bar on one chart                                       | PBI (line-and-clustered-column), SS (Mixed chart), Hex (per-series type), T (via dual axis + mark type per pill)          | [table-stakes]                                                            |
| **Per-series axis assignment**    | Put a series on secondary axis                                     | Hex (second Y-axis), PBI (combo), SS (Mixed), T (dual axis)                                                               | [table-stakes]                                                            |
| **Stacking mode**                 | None / Stacked / 100% stacked                                      | All four (Hex: grouped/stacked/100%; T: Stack Marks toggle)                                                               | [table-stakes]                                                            |
| **Series order**                  | Drag-reorder series; controls stack order + legend order + z-order | Hex (drag-and-drop reorder), PBI (via legend sort/field order), SS (legend order — historically limited), T (sort/manual) | [table-stakes] for reordering; drag-and-drop series reorder is [advanced] |

---

## 4. Data labels

| Capability                        | Detail                                                                                                                                | Tool support                                                         | Tier                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| **Show / hide**                   | Toggle labels on/off                                                                                                                  | All four                                                             | [table-stakes]                         |
| **Position**                      | PBI: Auto / Inside end / Outside end / Inside center / Inside base; on stacked charts only inside-series                              | PBI (5 positions), T (label alignment/placement), SS, Hex            | [table-stakes]                         |
| **Content**                       | Which field(s) — value, category, percent, or multiple                                                                                | All four (PBI "detail labels"; Hex per-color + stacked-total labels) | [table-stakes]                         |
| **Format**                        | Number/date format, decimals, units, font, color                                                                                      | All four                                                             | [table-stakes]                         |
| **Stack total labels**            | Label the total on top of a stacked bar (distinct from per-segment)                                                                   | Hex (separate stacked-totals control), PBI (total labels), T         | [advanced]                             |
| **Conditional-color labels**      | Data-driven label color (fx rules/gradient)                                                                                           | PBI (Data labels → Values → Color, rules/gradient), T (via calc)     | [advanced]                             |
| **Overflow / collision handling** | PBI: auto-hide colliding labels; **Overflow text** forces spill past shape edge; **label density %** (0–100) controls how many render | PBI (explicit overflow + density), T (auto declutter), SS/Hex (auto) | [advanced] — PBI is the reference here |
| **Label only min/max/last/first** | Selective labeling (e.g. line-end labels)                                                                                             | T (label min/max/line ends/selected), PBI (limited)                  | [advanced]                             |

---

## 5. Legend

| Capability                                  | Detail                                          | Tool support                                                           | Tier                                                        |
| ------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Show / hide**                             | Toggle                                          | All four                                                               | [table-stakes]                                              |
| **Position**                                | Top / bottom / left / right (+ inside variants) | All four (SS orientation + margin; PBI top/bottom/left/right + center) | [table-stakes]                                              |
| **Legend title**                            | Custom title, show/hide                         | All four                                                               | [table-stakes]                                              |
| **Type: plain vs scroll**                   | Scrollable legend when many series              | SS (plain/scroll), others auto                                         | [advanced]                                                  |
| **Legend margin/spacing**                   | Space around legend                             | SS (margin), PBI (spacing)                                             | [advanced]                                                  |
| **Interactive (click to highlight/filter)** | Click legend entry to isolate/dim series        | T (highlight), PBI (cross-highlight), SS (ECharts toggle), Hex         | [table-stakes] for highlight; filter-on-click is [advanced] |
| **Legend for color vs size vs shape**       | Separate legends per encoding channel           | T (multiple legend cards), others single                               | [advanced]                                                  |

---

## 6. Tooltip

| Capability                      | Detail                                                   | Tool support                                                                                                                                       | Tier                                                                                                                    |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Default tooltip**             | Auto-populated from encoded fields                       | All four                                                                                                                                           | [table-stakes]                                                                                                          |
| **Add custom fields**           | Drag extra fields into tooltip without encoding them     | All four (T Tooltip shelf, PBI Tooltips well, SS, Hex custom entries)                                                                              | [table-stakes]                                                                                                          |
| **Custom template / rich text** | Static + dynamic text, formatting, inserted field values | T (rich template editor with inserted fields + formatting), PBI (report-page tooltips = full mini-report), SS (rich tooltip toggle), Hex (limited) | [table-stakes] for field-insert templates; **report-page / viz-in-tooltip** is [advanced] (PBI, Tableau viz-in-tooltip) |
| **Tooltip behavior**            | Responsive (instant) vs On-Hover; enable/disable         | T (Responsive / On Hover), others fixed                                                                                                            | [advanced]                                                                                                              |
| **Command buttons in tooltip**  | Keep Only, Exclude, Group, Create Set, View Data         | T only                                                                                                                                             | [advanced]                                                                                                              |

---

## 7. Color

| Capability                             | Detail                                                                                                                       | Tool support                                                                                                                          | Tier                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Categorical palettes**               | Distinct hue per category                                                                                                    | All four (SS categorical schemes; T palettes; PBI theme colors; Hex palettes)                                                         | [table-stakes]                                                                              |
| **Sequential palettes**                | Single-hue light→dark for ordered/continuous                                                                                 | All four (SS sequential schemes; Viridis/Cividis common)                                                                              | [table-stakes]                                                                              |
| **Diverging palettes**                 | Two hues meeting at neutral midpoint (with settable center)                                                                  | T (diverging with midpoint), PBI (diverging in conditional format), SS, Hex                                                           | [table-stakes] for palette; **settable diverging midpoint** is [advanced]                   |
| **Per-value color override**           | Pin a specific category to a specific color                                                                                  | T (Edit Colors → assign), PBI (per-data-point color), SS (label_colors JSON), Hex (custom hex per series)                             | [table-stakes]                                                                              |
| **Conditional / data-driven color**    | Color by rules (if X then red) or by a _different_ measure                                                                   | PBI (fx: rules / gradient / field value — the reference), T (calc on Color / KPI shapes), SS (limited), Hex (limited)                 | [advanced] — PBI's fx conditional formatting is the benchmark                               |
| **Continuous color: stepped / binned** | Discrete color steps vs smooth gradient; # of steps                                                                          | T (stepped color, N steps), PBI (gradient), SS                                                                                        | [advanced]                                                                                  |
| **Colorblind-safe palettes**           | Ship validated schemes: Okabe-Ito / Wong (categorical), Viridis/Cividis (sequential), RdBu/PiYG (diverging); avoid red-green | T (ships Color Blind palette), most tools ship at least one; ColorBrewer is the canonical source                                      | [advanced] as a _first-class named feature_; [table-stakes] to at least not force red-green |
| **Opacity / transparency**             | Mark opacity slider                                                                                                          | T (Color → Opacity), PBI (transparency), SS, Hex                                                                                      | [table-stakes]                                                                              |
| **Mark border & halo**                 | Border color/width; halo behind marks (esp. maps)                                                                            | T (Effects: Border + Halo), others limited                                                                                            | [advanced]                                                                                  |
| **Custom palette import**              | User-defined palettes / config-injected schemes                                                                              | SS (EXTRA_CATEGORICAL/SEQUENTIAL_COLOR_SCHEMES config; 6.0 Theme Management), T (Preferences.tps), PBI (theme JSON), Hex (custom CSS) | [advanced]                                                                                  |

---

## 8. Reference lines / bands / regions

Tableau is the reference implementation; Power BI's Analytics pane is a close second; Superset and Hex are lighter.

| Capability                                                       | Detail                                                                                         | Tool support                                                                                                           | Tier                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Constant reference line**                                      | Line at a fixed value                                                                          | T, PBI (X/Y constant line), SS (annotation), Hex (reference line X/Y)                                                  | [table-stakes]                                                                         |
| **Computed: average**                                            | Line at mean                                                                                   | T, PBI (average line)                                                                                                  | [table-stakes]                                                                         |
| **Computed: median**                                             | Line at median                                                                                 | T, PBI (median line)                                                                                                   | [table-stakes]                                                                         |
| **Computed: min / max**                                          | Extremes                                                                                       | T, PBI (min/max lines)                                                                                                 | [table-stakes]                                                                         |
| **Computed: sum / total**                                        | Aggregate over underlying data                                                                 | T (Sum, Total)                                                                                                         | [advanced]                                                                             |
| **Computed: percentile**                                         | e.g. 25/50/75th; **multiple instances** on one chart                                           | T (percentile), PBI (percentile line; multiple instances allowed)                                                      | [advanced]                                                                             |
| **Reference band**                                               | Shaded region between two constant/computed values                                             | T (bands, with fill above/below), PBI (shaded area between lines), Hex (limited)                                       | [table-stakes] for T/PBI; overall [advanced]                                           |
| **Reference distribution**                                       | Gradient/shaded distribution along axis                                                        | T only                                                                                                                 | [advanced]                                                                             |
| **Percentages / percentiles / quantiles / std-dev distribution** | Shade at % values, at percentiles, into N tiles, or ±N σ around mean                           | T only (distribution options)                                                                                          | [advanced]                                                                             |
| **Box plot**                                                     | Whiskers = 1.5×IQR (schematic) or max extent (skeletal); hide/show underlying marks + outliers | T (native box plot config)                                                                                             | [advanced]                                                                             |
| **Scope: cell / pane / table**                                   | Where the line computes/applies                                                                | T (Cell / Pane / Table)                                                                                                | [advanced]                                                                             |
| **Trend line**                                                   | Model types: Linear, Logarithmic, Exponential, Polynomial; confidence bands; R²/p-value        | T (4 models + confidence + stats), PBI (trend line, simpler), SS (regression annotation)                               | [table-stakes] for a linear trend; **model choice + confidence + stats** is [advanced] |
| **Forecast**                                                     | Predict future periods; forecast length; confidence interval; seasonality                      | T (exponential smoothing, seasonality), PBI (line charts only; length + confidence interval), SS (Prophet forecasting) | [advanced]                                                                             |
| **Error bars**                                                   | By field (upper/lower, absolute/relative, symmetrical) or by percentage                        | PBI (both methods, native), T (via measures)                                                                           | [advanced]                                                                             |
| **Anomaly detection**                                            | Auto-flag outliers on time series                                                              | PBI (Analytics pane anomaly detection)                                                                                 | [advanced]                                                                             |
| **Line label options**                                           | None / Value / Computation (name+calc) / Custom (with inserted values)                         | T (4 modes), PBI (data label on line), Hex (label option)                                                              | [table-stakes] for value label; custom/computation label is [advanced]                 |
| **Line/band formatting**                                         | Type, color, weight; fill above/below                                                          | T (full), PBI (style/color/dash), Hex (color/style)                                                                    | [table-stakes]                                                                         |

---

## 9. Annotations

| Capability                                | Detail                                   | Tool support                                                                                 | Tier       |
| ----------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| **Point / mark annotation**               | Callout pinned to a specific data point  | T (Annotate → Point), PBI (limited via text boxes / smart narrative), SS (annotation layers) | [advanced] |
| **Area / region annotation**              | Callout for a region                     | T (Annotate → Area)                                                                          | [advanced] |
| **Free-text annotation**                  | Floating text with leader line           | T (Annotate → Mark/Point/Area), SS (formula/interval/event annotations), Hex                 | [advanced] |
| **Annotation from another dataset/layer** | e.g. overlay event markers by date range | SS (annotation layers: formula, interval, event, time-series overlay)                        | [advanced] |

**Note:** Annotations are broadly **[advanced]** — Tableau and Superset are strongest; Power BI is weak natively.

---

## 10. Number / date formatting

| Capability                       | Detail                                                     | Tool support                                                              | Tier           |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | -------------- |
| **Number: decimals**             | Decimal places                                             | All four                                                                  | [table-stakes] |
| **Number: thousands separator**  | Comma/space grouping                                       | All four                                                                  | [table-stakes] |
| **Number: display units**        | K / M / B / auto scaling                                   | PBI (display units), T (Units), SS (D3 format), Hex                       | [table-stakes] |
| **Currency (standard & custom)** | Symbol, decimals, negative style, prefix/suffix, separator | T (Currency Standard/Custom), PBI, SS (via format string)                 | [table-stakes] |
| **Percentage**                   | %, decimals                                                | All four                                                                  | [table-stakes] |
| **Custom format string**         | e.g. `#,##0.0"M";(#,##0.0)` / D3 format codes              | T (custom), PBI (custom format string), SS (D3 number + time format), Hex | [table-stakes] |
| **Negative value styling**       | Parentheses, red, sign                                     | T (Custom currency), PBI                                                  | [table-stakes] |
| **Prefix / suffix**              | Units text before/after                                    | T, PBI (via format), SS                                                   | [table-stakes] |
| **Date format**                  | Custom date/time patterns, locale                          | All four (SS D3 time format)                                              | [table-stakes] |
| **Per-element format override**  | Axis vs tooltip vs label formatted differently             | T, PBI                                                                    | [advanced]     |

---

## 11. Sorting + Top-N + "Other" bucketing

| Capability                      | Detail                                                   | Tool support                                                                                                                | Tier                                                   |
| ------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Sort ascending / descending** | By dimension (alphabetical) or by measure                | All four (Hex: alphabetical / measure-based / custom; SS "Sort by" + "Sort ascending")                                      | [table-stakes]                                         |
| **Manual / custom sort order**  | Drag categories into a specific order                    | T (manual sort), Hex (custom sort), PBI (limited to one sort column)                                                        | [table-stakes] for T/Hex; [advanced] overall           |
| **Nested / multi-level sort**   | Sort within groups                                       | T, PBI (nested via workaround)                                                                                              | [advanced]                                             |
| **Top-N filter**                | Keep top/bottom N by a measure                           | T (Top N filter, native), PBI (Top N filter, native), SS (series limit + sort), Hex (Top N: direction, count, rank measure) | [table-stakes]                                         |
| **"Other" bucket**              | Roll remaining into a single "Other" category            | Hex (native "Other" bucket toggle in Top N), PBI (**requires DAX**, not native), T (via Set → "Other"), SS (limited)        | [advanced] — Hex native is the standout; PBI needs DAX |
| **Series limit**                | Cap number of series/subgroups (distinct from row limit) | SS (series limit + series-limit-metric to order by), others via Top-N                                                       | [advanced]                                             |
| **Row limit**                   | Cap total rows/marks fetched (perf guardrail)            | SS (row limit — note: sort applies only within fetched rows), Hex/T/PBI (implicit/query)                                    | [table-stakes] as a perf guard                         |

**Design takeaway:** Sort (dim + measure), Top-N, and a native **"Other" bucket** together are the single biggest UX win — most tools force DAX/calc gymnastics for "Other," so building it native is a differentiator. Keep **series limit** and **row limit** as distinct concepts.

---

## 12. Null handling

| Capability                         | Detail                                          | Tool support                                                                                                                             | Tier                    |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Null on continuous line**        | Gap (default) vs bridge/connect vs drop-to-zero | T ("Show at Default Value" → connect/zero; default = gap for accuracy), PBI (line: "Gap"/"Zero"/"Continue"), SS (ECharts null mode), Hex | [table-stakes]          |
| **Show null as zero (ZN)**         | Replace nulls with 0                            | T (ZN() function), PBI (measure), SS/Hex (transform)                                                                                     | [table-stakes] via calc |
| **Special-values placement**       | Where nulls land on an axis (edge indicator)    | T (null indicator "N nulls" in corner + choose show at default/hide/filter)                                                              | [advanced]              |
| **Show/hide empty rows & columns** | Display categories with no data                 | T ("Show Missing Values"/empty rows & columns), PBI ("Show items with no data")                                                          | [advanced]              |
| **Null label text**                | Custom text for null (e.g. "N/A", "—")          | T (Format → null values), PBI                                                                                                            | [table-stakes]          |

---

## 13. Small multiples / trellis

| Capability                                           | Detail                                 | Tool support                                                                                           | Tier                                          |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Facet by one dimension**                           | Split into a strip/grid of subplots    | PBI (Small multiples well, native), Hex (vertical or horizontal facet), T (Rows/Columns), SS (limited) | [table-stakes] as a named feature (PBI/Hex/T) |
| **Row × column (2-D trellis)**                       | Facet by two dimensions simultaneously | T (native, unlimited via pills), Hex (vertical + horizontal), PBI (single field, arranged into grid)   | [advanced]                                    |
| **Grid dimensions control**                          | Rows/cols count                        | PBI (up to 6×6, scroll for overflow), Hex (max 100 subplots)                                           | [table-stakes]                                |
| **Shared vs independent axes across panels**         | Sync scales or free each               | T (control), PBI (shared), Hex                                                                         | [advanced]                                    |
| **Per-panel titles / gridline / background styling** | Style the small-multiple chrome        | PBI (small-multiple title + border + background), T                                                    | [advanced]                                    |

---

## 14. Drill hierarchies

| Capability                                  | Detail                                                   | Tool support                                                                                                    | Tier                              |
| ------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Defined hierarchy**                       | Group fields into a drill path (e.g. Country→State→City) | T (drag to create hierarchy, +/- expand), PBI (hierarchy in field well), SS (limited)                           | [table-stakes] (T/PBI)            |
| **Drill down / up**                         | Click to go a level deeper / back                        | PBI (drill down/up buttons, drill-through), T (expand +/-), Hex (group-by swap)                                 | [table-stakes] (T/PBI)            |
| **Expand next level**                       | Add the next level alongside current (not replace)       | PBI ("Expand all down one level"), T                                                                            | [advanced]                        |
| **Drill-through to another view/page**      | Right-click → jump to detail page filtered to context    | PBI (drill-through pages, native), T (actions/URL actions), SS (dashboard cross-filter)                         | [advanced]                        |
| **Breadcrumb trail**                        | Show levels traversed                                    | PBI (only via custom visuals e.g. xViz), not native                                                             | [advanced]                        |
| **Cross-filter / highlight from selection** | Click a mark → filter other charts                       | PBI (native cross-filter/highlight), T (dashboard actions), SS (dashboard cross-filters), Hex (cell reactivity) | [table-stakes] at dashboard level |

---

## Cross-tool synthesis: what "table-stakes" actually means for your build

If you build **only the [table-stakes] rows**, you match the common denominator of all four tools. Concretely, the minimum viable per-chart config surface is:

1. **Encoding:** X, Y, Color (discrete gradient + gradient), Size, Detail/Group, Tooltip fields, Label. Dual-axis + facet as fast-follow.
2. **Axis:** title, linear/log/time scale, fixed min/max (both ends independently), gridlines, tick number-format, label rotation.
3. **Series:** per-series color, combo type, secondary-axis assignment, stacking (none/stacked/100%), reorder.
4. **Data labels:** show/hide, position, content field, number format.
5. **Legend:** show/hide, 4-way position, title, click-to-highlight.
6. **Tooltip:** default + add custom fields + field-insert template.
7. **Color:** categorical + sequential + diverging palettes, per-value override, opacity, at least one colorblind-safe scheme shipped.
8. **Reference lines:** constant + average + median + min/max, with a value label.
9. **Formatting:** decimals, thousands separator, display units (K/M/B), currency, percent, custom format string, date patterns, null-as-text.
10. **Sort + Top-N:** sort by dim or measure, Top-N by measure, row limit.
11. **Null:** line gap vs zero vs connect.
12. **Drill:** at least dashboard-level cross-filter.

**The [advanced] rows are where you pick differentiators.** The highest-leverage advanced features to steal, by source of excellence:

- **From Tableau:** the Detail channel (LOD without color), reference _distributions_ + box plots + scope (cell/pane/table), trend-model choice with confidence+stats, symmetric-log axis, custom-shape palettes, rich tooltip with inserted fields.
- **From Power BI:** the **fx conditional/data-driven color** engine (rules + gradient + by-field), Analytics-pane percentile/error-bars/anomaly/forecast as first-class toggles, data-label **overflow + density** collision controls.
- **From Hex:** the **native "Other" bucket** in Top-N (with direction/count/rank-measure), drag-and-drop series reorder, per-series custom hex/CSS, style copy/paste across charts.
- **From Superset:** **series limit vs row limit** as distinct guardrails, series-limit-order metric, annotation layers (formula/interval/event/overlay), config-injected custom palettes, contribution/percentage metrics.

**Single biggest native-feature gap across the market** (build it native and you leapfrog): a clean **Top-N + "Other" bucket** that works without DAX/calc, and a **fx-style data-driven color** editor. Those two are where every tool either forces workarounds or is a paid/advanced tier.

---

## Sources

Tableau: [Marks properties](https://help.tableau.com/current/pro/desktop/en-us/viewparts_marks_markproperties.htm), [Shelves & Cards reference](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm), [Add Detail](https://help.tableau.com/current/pro/desktop/en-us/add_detail.htm), [Reference Lines/Bands/Distributions/Boxes](https://help.tableau.com/current/pro/desktop/en-us/reference_lines.htm), [Analytics Pane](https://help.tableau.com/current/pro/desktop/en-gb/environ_workspace_analytics_pane.htm), [Multiple measures / dual axis](https://help.tableau.com/current/pro/desktop/en-us/multiple_measures.htm), [Edit Axes](https://help.tableau.com/current/pro/desktop/en-us/formatting_editaxes.htm), [Format Numbers & Null Values](https://help.tableau.com/current/pro/desktop/en-us/formatting_specific_numbers.htm), [Show/Hide Missing Values](https://help.tableau.com/current/pro/desktop/en-us/missing_values.htm), [Axis vs tooltip number format](https://kb.tableau.com/articles/howto/displaying-different-number-format-in-the-axis-and-tooltip).

Power BI: [Conditional formatting in visuals](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-conditional-formatting), [Formatting color & axis properties](https://learn.microsoft.com/en-us/power-bi/visuals/service-getting-started-with-color-formatting-and-axis-properties), [Analytics pane](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-analytics-pane), [Small multiples](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-small-multiples), [Interact with small multiples](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-small-multiples-interact), [Reference lines/error bars/forecasting (PL-300)](https://trustedinstitute.com/concept/power-bi-data-analyst-pl-300/visualize-and-analyze-the-data/use-reference-lines-forecasting/), [Top N + Others (Goodly)](https://goodly.co.in/top-n-and-others-power-bi/), [Top N + Other (SQLBI)](https://www.sqlbi.com/articles/filtering-the-top-products-alongside-the-other-products-in-power-bi/), [Data label overflow/density (Erik Svensen)](https://eriksvensen.wordpress.com/2024/04/09/powerbi-make-sure-the-data-label-is-visible-in-a-bar-chart/), [xViz Advanced Trellis (breadcrumb/drill)](https://xviz.com/blogs/advanced-trellis-small-multiples-key-features-power-bi-visual/).

Superset: [Exploring Data (official)](https://superset.apache.org/docs/using-superset/exploring-data/), [Chart Customization (DataOS)](https://dataos.info/interfaces/superset/chart_customization/), [Customise your chart (Handbook)](https://superset-handbook.readthedocs.io/en/latest/make_charts/customise_chart.html), [Customizing chart colors (Preset)](https://preset.io/blog/customizing-chart-colors-with-superset-and-preset/), [Series-limit order metric commit](https://github.com/apache/superset/commit/ecb951bb7474b9c829d0eef12792f6c146757dba), [Theming (6.0)](https://superset.apache.org/admin-docs/configuration/theming/).

Hex: [Chart cells (official)](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells). Vega-Lite (Hex's underlying grammar): [Encoding](https://vega.github.io/vega-lite/docs/encoding.html), [Scale](https://vega.github.io/vega-lite/docs/scale.html), [Axis](https://vega.github.io/vega-lite/docs/axis.html).

Color: [Colorblind-safe palettes](https://colorblind.io/guides/colorblind-safe-palettes), [Sequential/diverging/categorical guide (CleanChart)](https://www.cleanchart.app/blog/color-palette-types-data-visualization), [NKI colorblind-friendly guidelines](https://www.nki.nl/about-us/responsible-research/guidelines-color-blind-friendly-figures).
