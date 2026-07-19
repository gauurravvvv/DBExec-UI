## chart-types

### 1. Requirements checklist (complete, by family)

Tier marked per market research. DBExec target = production BI parity.

**Comparison**
- [table-stakes] Bar (horizontal)
- [table-stakes] Column (vertical bar)
- [table-stakes] Grouped / clustered bar-column
- [table-stakes] Stacked bar-column
- [table-stakes] 100% stacked bar-column
- [advanced] Range / floating bar
- [advanced] Diverging / bidirectional bar
- [advanced] Population pyramid
- [advanced] Pictograph / isotype

**Trend**
- [table-stakes] Line
- [table-stakes] Multi-series line
- [table-stakes] Spline / smoothed line
- [advanced] Step line
- [table-stakes] Area
- [table-stakes] Stacked area
- [table-stakes] 100% stacked area
- [advanced] Streamgraph / themeriver
- [advanced] Horizon chart
- [advanced] Area range / band
- [table-stakes] Sparkline
- [advanced] Fan chart / forecast cone

**Part-to-whole**
- [table-stakes] Pie
- [table-stakes] Donut
- [advanced] Semi-circle / gauge-style pie
- [table-stakes] Treemap
- [advanced] Sunburst
- [advanced] Icicle / partition
- [advanced] Marimekko / Mekko
- [advanced] Waffle / square pie
- [advanced] Nested / concentric pie

**Distribution**
- [table-stakes] Histogram
- [table-stakes] Box plot
- [advanced] Violin plot
- [advanced] Density / KDE
- [advanced] Ridgeline / joyplot
- [advanced] Strip / jitter plot
- [advanced] Beeswarm
- [advanced] Dot plot (Wilkinson)
- [advanced] Q-Q plot
- [advanced] ECDF
- [advanced] 2D histogram / density heatmap

**Correlation / relationship**
- [table-stakes] Scatter
- [table-stakes] Bubble
- [advanced] Scatter + trend/regression line
- [advanced] Hexbin
- [advanced] 2D density / contour
- [advanced] Connected scatter
- [advanced] Scatter matrix (SPLOM)
- [advanced] Correlation matrix heatmap
- [advanced] Parallel coordinates

**Ranking**
- [table-stakes] Sorted / ranked bar
- [advanced] Lollipop
- [advanced] Cleveland dot plot
- [advanced] Dumbbell / DNA
- [advanced] Slope chart
- [advanced] Bump chart
- [table-stakes] Ranked list table (inline bars)
- [advanced] Bar chart race
- [advanced] Pareto

**Flow / network**
- [advanced] Sankey
- [advanced] Alluvial
- [advanced] Chord
- [advanced] Network / node-link graph
- [advanced] Arc diagram
- [table-stakes] Funnel
- [advanced] Retention / cohort flow

**Hierarchy**
- [advanced] Tree / node-link tree
- [advanced] Dendrogram
- [table-stakes] Treemap (dup of §3)
- [advanced] Sunburst / icicle (dup of §3)
- [advanced] Circle packing
- [table-stakes] Indented / tree table

**KPI / single-value**
- [table-stakes] Big number / scorecard
- [table-stakes] KPI with delta / trend indicator
- [table-stakes] KPI + sparkline
- [table-stakes] Gauge (radial)
- [advanced] Bullet chart
- [table-stakes] Progress bar / linear gauge
- [advanced] Solid gauge / activity ring
- [table-stakes] Trend-indicator tile (delta chip)

**Tabular**
- [table-stakes] Plain data table
- [table-stakes] Pivot / cross-tab / matrix
- [table-stakes] Table with in-cell bars
- [table-stakes] Heatmap / conditional-format table
- [advanced] Sparkline table (trend column)
- [table-stakes] Highlight table
- [table-stakes] Matrix heatmap (2D dimensional)

**Geospatial**
- [table-stakes] Choropleth / filled region map
- [table-stakes] Point / pin map
- [table-stakes] Proportional-symbol / bubble map
- [advanced] Density / heat map
- [advanced] Hexbin / grid-bin map
- [advanced] Flow / connection map
- [advanced] Cluster map
- [advanced] Layered filled + point map
- [advanced] Custom polygon / geoshape
- [advanced] Tile / cartogram (hex-tile)
- [advanced] 3D / extruded map
- [advanced] Isoline / contour map

**Time-specialized**
- [advanced] Calendar heatmap
- [advanced] Gantt / timeline
- [advanced] Candlestick (OHLC)
- [advanced] OHLC bar
- [advanced] Waterfall (table-stakes in finance-heavy tools)
- [advanced] Event / swimlane timeline
- [advanced] Cycle plot
- [advanced] Time heatmap (hour × day)

**Radial / polar**
- [table-stakes] Radar / spider
- [advanced] Polar area / rose / Nightingale
- [advanced] Radial bar / circular bar
- [advanced] Radial / polar line
- [advanced] Wind rose
- [advanced] Circular / radial heatmap
- [table-stakes] Radial gauge (dup of KPI)
- [advanced] Circular dendrogram / radial tree

**Combination / composite**
- [table-stakes] Combo (bar + line)
- [table-stakes] Dual-axis (secondary Y)
- [advanced] Bar + line + area composite
- [advanced] Pareto (dup of §6)
- [advanced] Overlay / layered marks
- [table-stakes] Small multiples / trellis / faceting
- [table-stakes] Reference lines / bands / forecast overlays
- [advanced] Error bars

**Statistical / specialized**
- [table-stakes] Heatmap (generic matrix)
- [advanced] Confusion matrix
- [advanced] Control chart (SPC)
- [advanced] Word cloud
- [advanced] Liquid-fill gauge
- [advanced] 3D surface / scatter / bar
- [advanced] Ternary plot
- [advanced] Contour / density surface
- [advanced] Boxplot + jitter overlay
- [advanced] Regression / trend-line component

---

### 2. Gap table (Requirement | DBExec status | Priority | Effort + BE)

DBExec today (~24 wired): bar, column, stacked, line, area, combo, pie, donut, funnel, treemap, sunburst, scatter, bubble, histogram, boxplot, gauge, radar, heatmap, sankey, waterfall, candlestick, kpi-number, table, pivot.

| Requirement | Status | Priority | Effort + BE |
|---|---|---|---|
| Bar (horizontal) | have | P0 | S, no BE |
| Column (vertical) | have | P0 | S, no BE |
| Grouped / clustered bar | partial (via multi-measure; verify series-split by 2nd dim) | P0 | S, BE: confirm 2-dim encoding |
| Stacked bar-column | have | P0 | S, no BE |
| 100% stacked bar-column | partial (stack yes; % normalize toggle unclear) | P0 | S, BE: none (client normalize) |
| Range / floating bar | missing | P2 | M, BE: 2-measure min/max encoding |
| Diverging / bidirectional bar | missing | P1 | M, no BE (signed values) |
| Population pyramid | missing | P2 | M, no BE |
| Pictograph / isotype | missing | P2 | M, no BE |
| Line | have | P0 | S, no BE |
| Multi-series line | have | P0 | S, no BE |
| Spline / smoothed | partial (ECharts `smooth` flag toggle) | P1 | S, no BE |
| Step line | missing | P2 | S, no BE |
| Area | have | P0 | S, no BE |
| Stacked area | partial (area + stack combo; verify wired) | P1 | S, no BE |
| 100% stacked area | partial | P1 | S, no BE |
| Streamgraph / themeriver | missing | P2 | M, no BE |
| Horizon chart | missing | P2 | L, no BE |
| Area range / band | missing | P1 | M, BE: 2-measure (lower/upper) |
| Sparkline | missing (axis-less micro) | P1 | S, no BE |
| Fan chart / forecast cone | missing | P2 | L, BE: forecast compute |
| Pie | have | P0 | S, no BE |
| Donut | have | P0 | S, no BE |
| Semi-circle pie | missing | P2 | S, no BE |
| Treemap | have | P1 | S, no BE |
| Sunburst | have | P1 | S, no BE |
| Icicle / partition | missing | P2 | M, no BE |
| Marimekko / Mekko | missing | P2 | L, BE: dual-measure width+height |
| Waffle / square pie | missing | P2 | M, no BE |
| Nested / concentric pie | missing | P2 | M, no BE |
| Histogram | have | P0 | S, BE: binning (verify server vs client) |
| Box plot | have | P1 | S, BE: quartile compute (verify) |
| Violin plot | missing | P2 | L, BE: KDE compute |
| Density / KDE | missing | P2 | L, BE: KDE compute |
| Ridgeline / joyplot | missing | P2 | L, BE: KDE |
| Strip / jitter plot | missing | P2 | M, no BE |
| Beeswarm | missing | P2 | L, no BE |
| Dot plot (Wilkinson) | missing | P2 | M, no BE |
| Q-Q plot | missing | P2 | L, BE: quantile compute |
| ECDF | missing | P2 | M, BE: cumulative compute |
| 2D histogram / density heatmap | missing | P2 | M, BE: 2D binning |
| Scatter | have | P0 | S, no BE |
| Bubble | have | P0 | S, no BE |
| Scatter + trend/regression line | missing | P1 | M, BE: regression fit (or client) |
| Hexbin | missing | P2 | L, BE: hex binning |
| 2D density / contour | missing | P2 | L, BE: density |
| Connected scatter | missing | P2 | M, no BE |
| Scatter matrix (SPLOM) | missing | P2 | L, no BE |
| Correlation matrix heatmap | missing | P2 | M, BE: corr matrix compute |
| Parallel coordinates | missing | P2 | M, no BE |
| Sorted / ranked bar | partial (sort control exists? verify) | P0 | S, BE: order-by (likely have) |
| Lollipop | missing | P2 | S, no BE |
| Cleveland dot plot | missing | P2 | S, no BE |
| Dumbbell / DNA | missing | P2 | M, no BE |
| Slope chart | missing | P2 | M, no BE |
| Bump chart | missing | P2 | M, no BE |
| Ranked list table (inline bars) | partial (table + in-cell bars — verify) | P1 | S, no BE |
| Bar chart race | missing | P2 | L, no BE |
| Pareto | missing | P1 | M, BE: cumulative % compute |
| Sankey | have | P1 | S, BE: source/target/flow shape |
| Alluvial | missing | P2 | M, BE: multi-stage |
| Chord | missing | P2 | L, BE: matrix |
| Network / node-link graph | missing | P2 | L, BE: edge list |
| Arc diagram | missing | P2 | M, BE: edge list |
| Funnel | have | P0 | S, no BE |
| Retention / cohort flow | missing | P1 | L, BE: cohort compute |
| Tree / node-link tree | missing | P2 | M, BE: parent-child |
| Dendrogram | missing | P2 | L, BE: clustering |
| Circle packing | missing | P2 | M, no BE |
| Indented / tree table | missing | P1 | M, BE: hierarchy shape |
| Big number / scorecard | have | P0 | S, no BE |
| KPI + delta / trend indicator | partial (number yes; delta vs prior/target?) | P0 | S, BE: prior-period compute |
| KPI + sparkline | missing | P1 | S, no BE |
| Gauge (radial) | have | P1 | S, no BE |
| Bullet chart | missing | P1 | M, no BE (target + bands) |
| Progress bar / linear gauge | missing | P1 | S, no BE |
| Solid gauge / activity ring | missing | P2 | S, no BE |
| Trend-indicator tile (delta chip) | partial (see KPI delta) | P1 | S, BE: prior-period |
| Plain data table | have | P0 | S, no BE |
| Pivot / cross-tab / matrix | have | P0 | M, BE: cross-tab agg (verify subtotals) |
| Table with in-cell bars | partial (verify) | P1 | S, no BE |
| Heatmap / conditional-format table | partial (heatmap chart yes; table conditional-format?) | P1 | M, no BE |
| Sparkline table | missing | P2 | M, no BE |
| Highlight table | partial (== heatmap table) | P1 | S, no BE |
| Matrix heatmap (2D) | have (heatmap) | P1 | S, no BE |
| Choropleth / filled map | missing | P0 | L, BE: geo-join / region codes |
| Point / pin map | missing | P0 | L, BE: lat-lon fields |
| Proportional-symbol / bubble map | missing | P1 | L, BE: lat-lon + measure |
| Density / heat map (geo) | missing | P2 | L, BE: lat-lon |
| Hexbin / grid-bin map | missing | P2 | L, BE: geo |
| Flow / connection map | missing | P2 | L, BE: O-D pairs |
| Cluster map | missing | P2 | L, no BE (client cluster) |
| Layered filled + point map | missing | P2 | L, BE: geo |
| Custom polygon / geoshape | missing | P2 | L, BE: geometry store |
| Tile / cartogram | missing | P2 | L, no BE |
| 3D / extruded map | missing | P2 | L, BE: geo |
| Isoline / contour map | missing | P2 | L, BE: geo |
| Calendar heatmap | missing | P1 | M, no BE (date × measure) |
| Gantt / timeline | missing | P1 | M, BE: start/end date fields |
| Candlestick (OHLC) | have | P2 | S, BE: OHLC 4-measure shape |
| OHLC bar | missing | P2 | S, no BE |
| Waterfall | have | P1 | S, no BE |
| Event / swimlane timeline | missing | P2 | M, BE: event spans |
| Cycle plot | missing | P2 | M, no BE |
| Time heatmap (hour × day) | partial (via heatmap + date-parts) | P1 | S, BE: date-part extract |
| Radar / spider | have | P1 | S, no BE |
| Polar area / rose / Nightingale | missing | P2 | S, no BE |
| Radial bar / circular bar | missing | P2 | M, no BE |
| Radial / polar line | missing | P2 | M, no BE |
| Wind rose | missing | P2 | M, no BE |
| Circular / radial heatmap | missing | P2 | M, no BE |
| Circular dendrogram | missing | P2 | L, BE: clustering |
| Combo (bar + line) | have | P0 | S, no BE |
| Dual-axis (secondary Y) | partial (combo exists; explicit 2nd-axis binding?) | P0 | S, no BE |
| Bar + line + area composite | partial (combo extensible) | P1 | S, no BE |
| Overlay / layered marks | missing | P2 | L, no BE |
| Small multiples / trellis / faceting | missing | P1 | L, BE: facet grouping |
| Reference lines / bands / forecast overlays | missing (flagged gap) | P0 | M, BE: none for constants; compute for avg/forecast |
| Error bars | missing | P2 | M, BE: variance compute |
| Heatmap (generic matrix) | have | P1 | S, no BE |
| Confusion matrix | missing | P2 | M, no BE |
| Control chart (SPC) | missing | P2 | L, BE: control limits |
| Word cloud | missing | P2 | M, no BE |
| Liquid-fill gauge | missing | P2 | S, no BE |
| 3D surface / scatter / bar | missing | P2 | L, no BE (ECharts-GL) |
| Ternary plot | missing | P2 | L, no BE |
| Contour / density surface | missing | P2 | L, BE: density |
| Boxplot + jitter overlay | missing | P2 | M, no BE |
| Regression / trend-line component | missing | P1 | M, BE: fit (or client) |

**Cross-cutting requirements (apply to many/all chart types, not a single type):**

| Requirement | Status | Priority | Effort + BE |
|---|---|---|---|
| Data labels on every cartesian/pie/bar type | partial (flagged: not everywhere) | P0 | M, no BE |
| Reference lines/bands on all cartesian types | missing (flagged) | P0 | M, BE: compute for avg/median |
| Legend controls (position/show/interact) | partial | P1 | S, no BE |
| Axis config (min/max/log/dual/format) | partial | P0 | M, no BE |
| Color palette + swatch picker | partial (flagged) | P0 | S, no BE |
| ECharts theme (light/dark, brand) | missing (flagged) | P1 | M, no BE |
| Format live-preview (number/date/currency) | missing (flagged) | P1 | M, no BE |
| Cross-filter unification (click-to-filter) | partial (flagged) | P1 | L, some BE |
| Null / empty / error state per chart | partial | P0 | S, no BE |
| Tooltip config + formatting | partial | P1 | S, no BE |

---

### 3. Must-have for production (the P0 shortlist)

These are the items a serious BI buyer checks first; DBExec cannot ship "Analyses GA" without them.

**Chart types (P0):**
1. **Core cartesian** — bar, column, grouped bar, stacked bar, 100% stacked bar, line, multi-series line, area, combo, dual-axis. *(mostly HAVE; close the grouped-2nd-dim, 100%-normalize, and explicit dual-axis-binding gaps — all small.)*
2. **Part-to-whole** — pie, donut. *(HAVE.)*
3. **Scatter + bubble.** *(HAVE.)*
4. **Histogram.** *(HAVE; verify server-side binning.)*
5. **Sorted/ranked bar.** *(verify sort control.)*
6. **KPI family** — big number, KPI-with-delta/trend. *(number HAVE; delta-vs-prior/target needs BE prior-period compute — this is the one P0 KPI gap.)*
7. **Tabular** — data table, pivot/cross-tab. *(HAVE; verify pivot subtotals.)*
8. **Geospatial baseline** — choropleth, point map, bubble map. *(MISSING entirely — the single largest P0 hole; requires BE geo-field/region-code support. Large effort but table-stakes; no serious BI tool ships without at least choropleth + pin map.)*
9. **Funnel.** *(HAVE.)*

**Cross-cutting (P0 — block GA regardless of chart count):**
10. **Data labels available on every applicable chart type** (not a subset).
11. **Reference lines / bands** on all cartesian charts (constant + computed average/median). BE only for computed lines.
12. **Axis configuration** (min/max, log, number/date format, dual-axis binding).
13. **Color palette control with swatch picker.**
14. **Null / empty / error states** rendered per chart (no blank/crashing panels).

**Honest summary:** DBExec's ~24 wired types already satisfy the *chart-count* portion of table-stakes for §1–4, §9–10, and combos. The genuine P0 blockers are **(a) geospatial — completely missing and unavoidable for parity, needs BE**, and **(b) the cross-cutting polish layer (data labels everywhere, reference lines, axis/format/palette config, empty states)** which is what separates "demo" from "production." Everything in §5–8, §12–13, §15 advanced is legitimately P1/P2 — differentiators, not blockers. The two highest-leverage BE investments are the **geo-field pipeline** (unlocks the whole map family) and the **prior-period/computed-value engine** (unlocks KPI-delta, reference averages, Pareto cumulative, and forecast bands in one stroke).