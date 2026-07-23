The caveman skill isn't available in this subagent context, so I'll proceed normally. This is a bounded technical survey I can answer comprehensively from established knowledge of these tools. I'll produce the exhaustive catalogue directly.

# The Complete Catalogue of BI / Analytics Chart Types

A production survey across **Tableau, Power BI, Looker, Metabase, Superset, Hex, Sigma, Qlik, ThoughtSpot, Observable Plot, Highcharts, ECharts, AntV/G2, and Plotly.**

**Legend:** `[table-stakes]` = ships in essentially every serious BI tool; a product without it looks incomplete. `[advanced]` = differentiator / power-user / niche; present in a subset of tools or requiring extensions.

**Data-shape notation:** D = dimension (categorical/discrete field), M = measure (numeric/aggregated field), T = temporal/ordered field. "1D × 1M" means one dimension crossed with one measure.

---

## 1. Comparison (magnitude across categories)

| Chart                                 | Data shape                     | When to use                                                                                                                | Tier             |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Bar chart (horizontal)**            | 1D × 1M                        | Compare a measure across categories; horizontal preferred when labels are long or categories are many                      | `[table-stakes]` |
| **Column chart (vertical bar)**       | 1D × 1M                        | Same as bar but vertical; default when few categories or when the axis reads left-to-right (e.g. months)                   | `[table-stakes]` |
| **Grouped / clustered bar-column**    | 2D × 1M (or 1D × ≥2M)          | Compare sub-categories side by side within each group; a second dimension splits each bar                                  | `[table-stakes]` |
| **Stacked bar-column**                | 2D × 1M (or 1D × ≥2M)          | Show composition _and_ total per category; segments stack to the total                                                     | `[table-stakes]` |
| **100% stacked bar-column**           | 2D × 1M                        | Compare _proportional_ composition across categories (each bar = 100%); use when relative share matters more than absolute | `[table-stakes]` |
| **Range / floating bar (gap bar)**    | 1D × 2M (min, max)             | Show a span between two values per category (e.g. low–high, start–end)                                                     | `[advanced]`     |
| **Diverging bar (bidirectional)**     | 1D × 1M (signed) or 2D         | Positive/negative values from a central baseline; sentiment (agree/disagree), net change, population pyramids              | `[advanced]`     |
| **Population pyramid**                | 1D (age band) × 2 series (M/F) | Age-sex distribution; two diverging horizontal bar sets sharing a central axis                                             | `[advanced]`     |
| **Pictograph / isotype (unit chart)** | 1D × 1M                        | Communicate counts via repeated icons for infographic-style reporting                                                      | `[advanced]`     |

---

## 2. Trend (change over an ordered/continuous axis, usually time)

| Chart                         | Data shape                        | When to use                                                                                                                | Tier                            |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Line chart**                | T × 1M (×1D for multi-series)     | Trend of a continuous measure over time/ordered axis; the workhorse of time series                                         | `[table-stakes]`                |
| **Multi-series line**         | T × 1M × 1D                       | Compare several series' trends on a shared axis                                                                            | `[table-stakes]`                |
| **Spline / smoothed line**    | T × 1M                            | Same as line but curve-interpolated; cosmetic, for smoother reads                                                          | `[table-stakes]`                |
| **Step line (stepped)**       | T × 1M                            | Values that hold constant then jump (rates, inventory, state changes)                                                      | `[advanced]`                    |
| **Area chart**                | T × 1M                            | Emphasize magnitude/volume under a trend line                                                                              | `[table-stakes]`                |
| **Stacked area**              | T × 1M × 1D                       | Composition of a total over time (absolute)                                                                                | `[table-stakes]`                |
| **100% stacked area**         | T × 1M × 1D                       | Composition share over time (each period = 100%)                                                                           | `[table-stakes]`                |
| **Streamgraph (themeriver)**  | T × 1M × 1D                       | Stacked-area variant centered on a wiggle baseline; many overlapping series where shape/flow matters more than exact value | `[advanced]`                    |
| **Horizon chart**             | T × 1M × many-D (small multiples) | Dense compact time series; bands + color layering fits many series in little vertical space                                | `[advanced]`                    |
| **Area range / band chart**   | T × 2M (lower, upper)             | Confidence intervals, min/max envelopes, forecast bands around a line                                                      | `[advanced]`                    |
| **Sparkline**                 | T × 1M (inline, axis-less)        | Micro-trend inside a table cell, KPI card, or text; no axes/labels                                                         | `[table-stakes]` (see also KPI) |
| **Fan chart (forecast cone)** | T × 1M + intervals                | Probabilistic forecast with widening uncertainty bands                                                                     | `[advanced]`                    |

---

## 3. Part-to-Whole (composition of a single total)

| Chart                                          | Data shape                                               | When to use                                                                                                    | Tier                                 |
| ---------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Pie chart**                                  | 1D × 1M                                                  | Share of a whole across a few categories (≤5–6 recommended)                                                    | `[table-stakes]`                     |
| **Donut / doughnut**                           | 1D × 1M                                                  | Pie with a hole; center often holds a KPI/total label                                                          | `[table-stakes]`                     |
| **Semi-circle / gauge-style pie**              | 1D × 1M                                                  | Half-pie for dashboard-header composition                                                                      | `[advanced]`                         |
| **Treemap**                                    | hierarchical D (1–n levels) × 1M (+optional M for color) | Nested part-to-whole where area encodes size; good for many categories & hierarchy                             | `[table-stakes]` (advanced in a few) |
| **Sunburst (radial treemap)**                  | hierarchical D × 1M                                      | Multi-level hierarchy as concentric rings; drill from center outward                                           | `[advanced]`                         |
| **Icicle / partition (rectangular sunburst)**  | hierarchical D × 1M                                      | Same hierarchy as sunburst but as stacked rectangles (horizontal or vertical)                                  | `[advanced]`                         |
| **Marimekko / Mekko (variable-width stacked)** | 2D × 2M (width = one M, height = share)                  | Two-dimensional composition: segment width encodes group size, height encodes share; market-structure analysis | `[advanced]`                         |
| **Waffle / square pie (10×10 grid)**           | 1D × 1M                                                  | Part-to-whole as a filled grid of cells; friendly for percentages                                              | `[advanced]`                         |
| **Nested / concentric pie**                    | 2D × 1M                                                  | Two hierarchical levels as inner/outer rings                                                                   | `[advanced]`                         |
| **Stacked bar as part-to-whole**               | 1D × 1M                                                  | A single 100% stacked bar is often the _recommended replacement_ for a pie                                     | `[table-stakes]`                     |

---

## 4. Distribution (shape/spread of values)

| Chart                                     | Data shape                 | When to use                                                                                    | Tier                                         |
| ----------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Histogram**                             | 1M (binned)                | Distribution of a single continuous variable; frequency per bin                                | `[table-stakes]`                             |
| **Box plot (box-and-whisker)**            | 1M (×1D to compare groups) | Median, quartiles, outliers; compare distributions across groups compactly                     | `[table-stakes]` (advanced in lighter tools) |
| **Violin plot**                           | 1M × 1D                    | Box plot + kernel density; shows full distribution shape per group                             | `[advanced]`                                 |
| **Density plot (KDE)**                    | 1M                         | Smoothed continuous distribution; overlay multiple groups                                      | `[advanced]`                                 |
| **Ridgeline (joyplot)**                   | 1M × 1D (many groups)      | Stacked overlapping density curves to compare distributions across many categories/time slices | `[advanced]`                                 |
| **Strip plot / jitter plot**              | 1M × 1D                    | Every raw point plotted (jittered) per category; small-n distributions                         | `[advanced]`                                 |
| **Beeswarm**                              | 1M (×1D)                   | Non-overlapping point distribution; strip plot without overplotting                            | `[advanced]`                                 |
| **Dot plot (Wilkinson / frequency dots)** | 1M binned                  | Distribution via stacked dots; small datasets                                                  | `[advanced]`                                 |
| **Q-Q plot**                              | 2M (quantiles)             | Compare a distribution against a theoretical one (normality checks)                            | `[advanced]`                                 |
| **ECDF (cumulative distribution)**        | 1M                         | Cumulative proportion ≤ x; percentile reads                                                    | `[advanced]`                                 |
| **2D histogram / heatmap density**        | 2M (binned × binned)       | Distribution over two continuous variables (see also correlation)                              | `[advanced]`                                 |

---

## 5. Correlation / Relationship (two-or-more numeric variables)

| Chart                                   | Data shape                  | When to use                                                                                       | Tier             |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| **Scatter plot**                        | 2M (×1D for color/shape)    | Relationship/correlation between two measures; cluster & outlier spotting                         | `[table-stakes]` |
| **Bubble chart**                        | 3M (x, y, size) (+1D color) | Scatter with a third measure encoded as marker size                                               | `[table-stakes]` |
| **Scatter with trend/regression line**  | 2M + fit                    | Show direction/strength of correlation with a fitted line (linear/loess)                          | `[advanced]`     |
| **Hexbin (hexagonal binning)**          | 2M                          | Scatter with too many points; bins aggregate density into hexagons                                | `[advanced]`     |
| **2D density / contour plot**           | 2M                          | Smoothed density contours for dense bivariate data                                                | `[advanced]`     |
| **Connected scatter**                   | 2M ordered by T             | Scatter whose points are connected in time order (path through a 2-variable space)                | `[advanced]`     |
| **Scatter plot matrix (SPLOM / pairs)** | ≥3M                         | All pairwise scatters in a grid; multivariate exploration                                         | `[advanced]`     |
| **Correlation matrix heatmap**          | ≥3M                         | Pairwise correlation coefficients as a colored matrix                                             | `[advanced]`     |
| **Parallel coordinates**                | ≥3M (×1D)                   | Compare many numeric dimensions per record across parallel axes; multivariate patterns/clustering | `[advanced]`     |
| **Andrews / radar for multivariate**    | ≥3M                         | Profile comparison across many measures (see radial)                                              | `[advanced]`     |

---

## 6. Ranking (ordered position emphasis)

| Chart                            | Data shape                   | When to use                                                                          | Tier             |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| **Sorted bar / column (ranked)** | 1D × 1M sorted               | The default ranking view; sort bars descending                                       | `[table-stakes]` |
| **Lollipop chart**               | 1D × 1M                      | Cleaner alternative to bars for rankings; line + dot reduces ink                     | `[advanced]`     |
| **Dot plot (Cleveland)**         | 1D × 1M (×1D for two points) | Rank comparison; single dots or two-dot "dumbbell" per category                      | `[advanced]`     |
| **Dumbbell / DNA chart**         | 1D × 2M                      | Compare two points (before/after, actual/target) per category with a connecting line | `[advanced]`     |
| **Slope chart (slopegraph)**     | 1D × 2M (two time points)    | Rank/value change between exactly two periods; slope direction = change              | `[advanced]`     |
| **Bump chart**                   | 1D × M over T (ranks)        | Rank _position_ changes over time (e.g. leaderboard across seasons)                  | `[advanced]`     |
| **Ordered / ranked list table**  | 1D × ≥1M                     | Top-N tabular ranking with inline bars                                               | `[table-stakes]` |
| **Bar chart race (animated)**    | 1D × M over T                | Animated ranking over time; presentation/storytelling                                | `[advanced]`     |
| **Pareto chart**                 | 1D × 1M + cumulative %       | Ranked bars + cumulative line; 80/20 analysis                                        | `[advanced]`     |

---

## 7. Flow / Relationship-network (movement, connections)

| Chart                         | Data shape                     | When to use                                                                                   | Tier                                 |
| ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Sankey diagram**            | source-D, target-D × 1M (flow) | Flows/transfers between nodes where width = volume; funnels-as-flow, energy/traffic/user-path | `[advanced]`                         |
| **Alluvial diagram**          | ≥2 categorical stages × 1M     | Sankey variant emphasizing category membership changes across ordered stages                  | `[advanced]`                         |
| **Chord diagram**             | matrix (D × D) × 1M            | Bidirectional flows among a set of entities arranged on a circle (migration, trade)           | `[advanced]`                         |
| **Network / node-link graph** | edge list (node, node, weight) | Relationships/connections; social graphs, dependencies, topologies                            | `[advanced]`                         |
| **Arc diagram**               | edge list                      | 1D node layout with arcs for connections; sequence relationships                              | `[advanced]`                         |
| **Funnel chart**              | ordered stages × 1M            | Sequential drop-off through a process (marketing/sales/conversion)                            | `[table-stakes]` (advanced in a few) |
| **Retention / cohort flow**   | cohort-D × period-T × 1M       | Retention curves per acquisition cohort; often a heatmap-table                                | `[advanced]`                         |

---

## 8. Hierarchy (parent-child structure)

| Chart                                          | Data shape              | When to use                                                      | Tier                          |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------- | ----------------------------- |
| **Tree / node-link tree diagram**              | parent-child edges      | Org charts, taxonomies, file trees; explicit hierarchy layout    | `[advanced]`                  |
| **Dendrogram**                                 | hierarchical clustering | Clustering/phylogenetic-style nested grouping with merge heights | `[advanced]`                  |
| **Treemap**                                    | hierarchical D × 1M     | Hierarchy where area = size (also part-to-whole §3)              | `[table-stakes]`/`[advanced]` |
| **Sunburst / icicle / partition**              | hierarchical D × 1M     | Radial or rectangular multi-level hierarchy (also §3)            | `[advanced]`                  |
| **Circle packing**                             | hierarchical D × 1M     | Nested circles; area = size, containment = hierarchy             | `[advanced]`                  |
| **Indented / hierarchical table (tree table)** | hierarchical D × ≥1M    | Expandable/collapsible rows; the tabular way to show hierarchy   | `[table-stakes]`              |

---

## 9. KPI / Single-Value (one number in focus)

| Chart                                     | Data shape                      | When to use                                                                   | Tier                                 |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| **Big number / single value / scorecard** | 1M (aggregate)                  | Headline metric on a dashboard                                                | `[table-stakes]`                     |
| **KPI with comparison / trend indicator** | 1M + prior M (delta, %, ▲▼)     | Metric vs prior period/target with up/down arrow and color                    | `[table-stakes]`                     |
| **KPI + sparkline**                       | 1M + T×1M                       | Headline number with an inline mini-trend                                     | `[table-stakes]`                     |
| **Gauge (radial gauge / speedometer)**    | 1M + range/target               | Progress toward a target on a dial; executive dashboards                      | `[table-stakes]` (advanced in a few) |
| **Bullet chart**                          | 1M + target + qualitative bands | Compact, information-dense gauge alternative (actual vs target vs thresholds) | `[advanced]`                         |
| **Progress bar / linear gauge**           | 1M (0–100% or vs goal)          | Simple completion/goal attainment                                             | `[table-stakes]`                     |
| **Solid gauge / activity ring**           | 1M (%)                          | Circular progress fill                                                        | `[advanced]`                         |
| **Trend-indicator tile (delta chip)**     | 1M + delta                      | Number + colored ▲/▼ change badge                                             | `[table-stakes]`                     |

---

## 10. Tabular (row/column detail, aggregation grids)

| Chart                                        | Data shape              | When to use                                                                                | Tier             |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| **Plain data table**                         | ≥1D × ≥1M               | Precise values, detail rows, export                                                        | `[table-stakes]` |
| **Pivot table / cross-tab / matrix**         | ≥2D (rows × cols) × ≥1M | Aggregate a measure across two dimensional axes with subtotals; the spreadsheet-grade view | `[table-stakes]` |
| **Table with in-cell bars (bar-in-table)**   | 1D × 1M                 | Ranked table with proportional bars in a column                                            | `[table-stakes]` |
| **Heatmap table (conditional-format table)** | 2D × 1M                 | Color-shade cells by value; magnitude at a glance across a grid                            | `[table-stakes]` |
| **Sparkline table (trend column)**           | 1D × (T×1M)             | A mini line/bar per row for per-entity trend                                               | `[advanced]`     |
| **Highlight table (Tableau term)**           | 2D × 1M                 | Cross-tab whose cells are colored by measure                                               | `[table-stakes]` |
| **Matrix heatmap (2D dimensional heatmap)**  | 2D × 1M                 | Category × category grid colored by measure (e.g. hour × weekday)                          | `[table-stakes]` |

---

## 11. Geospatial (maps)

| Chart                                           | Data shape                        | When to use                                                          | Tier             |
| ----------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- | ---------------- |
| **Choropleth (filled/region map)**              | geo-region-D × 1M                 | Measure shaded by region/country/state/ZIP; rates & densities        | `[table-stakes]` |
| **Point / symbol map (pin map)**                | lat-lon (or geocoded D)           | Individual located events/assets                                     | `[table-stakes]` |
| **Proportional-symbol / bubble map**            | lat-lon × 1M                      | Sized markers per location encoding a measure                        | `[table-stakes]` |
| **Heat map (density map)**                      | lat-lon (× weight)                | Continuous density of points across geography                        | `[advanced]`     |
| **Hexbin / grid-bin map**                       | lat-lon (× M)                     | Aggregate many points into hex/grid tiles over the map               | `[advanced]`     |
| **Flow / connection map (great-circle lines)**  | origin-lat-lon → dest-lat-lon × M | Movement between locations (routes, migration, shipments)            | `[advanced]`     |
| **Cluster map (marker clustering)**             | lat-lon                           | Auto-group dense pins at zoom levels                                 | `[advanced]`     |
| **Filled + point dual map (layered)**           | region-D × 1M + lat-lon           | Choropleth base with a point/bubble layer on top                     | `[advanced]`     |
| **Custom polygon / geoshape map**               | custom geometry × 1M              | Sales territories, store floorplans, custom regions                  | `[advanced]`     |
| **Tile / cartogram (hex-tile / value-by-area)** | geo-D × 1M                        | Equal-area distortion so small regions stay visible (hex-state maps) | `[advanced]`     |
| **3D / extruded map (column map)**              | geo × 1M (height)                 | Extruded columns per location; deck.gl-style volumetric geo          | `[advanced]`     |
| **Isoline / contour map**                       | lat-lon × 1M                      | Continuous surfaces (elevation, weather)                             | `[advanced]`     |

---

## 12. Time-Specialized (temporal structures beyond the basic line)

| Chart                         | Data shape                              | When to use                                                                                             | Tier                                                             |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Calendar heatmap**          | date × 1M                               | Daily values laid out as a calendar grid (GitHub-contributions style); seasonality/day-of-week patterns | `[advanced]`                                                     |
| **Gantt / timeline chart**    | task-D × (start-T, end-T) (+dependency) | Project schedules, durations, event spans, resource timelines                                           | `[advanced]`                                                     |
| **Candlestick (OHLC)**        | T × 4M (open, high, low, close)         | Financial price movement per period                                                                     | `[advanced]`                                                     |
| **OHLC bar chart**            | T × 4M                                  | Same as candlestick, bar-style tick marks                                                               | `[advanced]`                                                     |
| **Waterfall chart**           | ordered D × 1M (signed)                 | Running cumulative total via sequential +/− contributions (bridge charts, P&L walk)                     | `[advanced]` (table-stakes in finance-heavy tools like Power BI) |
| **Event / swimlane timeline** | lane-D × T (events)                     | Discrete events along parallel lanes over time                                                          | `[advanced]`                                                     |
| **Cycle plot**                | T (nested season × cycle) × 1M          | Seasonal sub-series (e.g. month-over-month within each year)                                            | `[advanced]`                                                     |
| **Time heatmap (hour × day)** | 2 temporal-D × 1M                       | Activity intensity by hour-of-day vs day-of-week                                                        | `[advanced]`                                                     |

---

## 13. Radial / Polar (angular coordinate systems)

| Chart                                         | Data shape                      | When to use                                                                               | Tier                          |
| --------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| **Radar / spider / star chart**               | 1D (axes) × ≥1M (×1D series)    | Compare multiple entities across several normalized measures (profiles)                   | `[table-stakes]`/`[advanced]` |
| **Polar area / rose / Nightingale (coxcomb)** | 1D × 1M                         | Category magnitude in polar coordinates; cyclical categories (compass directions, months) | `[advanced]`                  |
| **Radial bar / circular bar**                 | 1D × 1M                         | Bars wrapped around a circle; compact many-category or aesthetic dashboards               | `[advanced]`                  |
| **Radial line / polar line**                  | angular-T × 1M                  | Cyclical time series (24-hour clock, seasonal) plotted on a polar axis                    | `[advanced]`                  |
| **Wind rose**                                 | direction-D × magnitude-M (×1D) | Directional frequency/magnitude distribution (meteorology)                                | `[advanced]`                  |
| **Circular / radial heatmap**                 | 2D × 1M in polar                | Cyclical two-dimensional intensity                                                        | `[advanced]`                  |
| **Radial / circular gauge**                   | 1M                              | (see KPI §9)                                                                              | `[table-stakes]`              |
| **Circular dendrogram / radial tree**         | hierarchy                       | Hierarchy laid out radially                                                               | `[advanced]`                  |

---

## 14. Combination / Dual-Axis / Composite

| Chart                                           | Data shape                       | When to use                                                                        | Tier                                                          |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Combo chart (bar + line)**                    | 1D/T × ≥2M                       | Two related measures of different scales/types (e.g. revenue bars + margin % line) | `[table-stakes]`                                              |
| **Dual-axis (secondary Y-axis)**                | 1D/T × 2M                        | Two measures with different units/ranges sharing an X-axis                         | `[table-stakes]`                                              |
| **Bar + line + area composite**                 | T × ≥3M                          | Layered multi-encoding dashboards                                                  | `[advanced]`                                                  |
| **Pareto (bar + cumulative line)**              | 1D × 1M + cum%                   | 80/20 diagnostic (also §6)                                                         | `[advanced]`                                                  |
| **Overlay / layered (Tableau layered marks)**   | flexible                         | Freely stacked mark layers (e.g. scatter + reference band)                         | `[advanced]`                                                  |
| **Small multiples / trellis / faceting**        | (any chart) × faceting-D         | Repeat one chart across a dimension's values in a grid; compare patterns cleanly   | `[table-stakes]` (as a feature) / `[advanced]` (rich control) |
| **Reference lines / bands / forecast overlays** | base chart + constant/computed M | Targets, averages, thresholds, forecast/trend/ CI overlays on any chart            | `[table-stakes]`                                              |
| **Error bars**                                  | base chart + ± M                 | Uncertainty/variance markers on bars/points/lines                                  | `[advanced]`                                                  |

---

## 15. Statistical / Analytical / Specialized (present mainly in analytics-heavy & code-first tools — Superset, Hex, Plotly, ECharts, Observable Plot, Highcharts)

| Chart                                   | Data shape                      | When to use                                                                                       | Tier                                        |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Heatmap (generic matrix)**            | 2D × 1M                         | Any two-axis intensity grid (correlation, confusion matrix, activity)                             | `[table-stakes]`                            |
| **Confusion matrix**                    | 2D (actual × predicted) × count | ML classification evaluation                                                                      | `[advanced]`                                |
| **Control chart (SPC: X̄, R, p-charts)** | T × 1M + control limits         | Process monitoring against statistical limits                                                     | `[advanced]`                                |
| **Funnel / conversion (with %)**        | ordered stage × 1M              | Multi-step conversion analysis                                                                    | `[table-stakes]` in product-analytics tools |
| **Word cloud**                          | term-D × frequency-M            | Text frequency visualization (often discouraged, but shipped)                                     | `[advanced]`                                |
| **Gauge/liquid-fill**                   | 1M (%)                          | Stylized single-value fill (ECharts specialty)                                                    | `[advanced]`                                |
| **Sankey/graph/tree/themeriver**        | see §7–8                        | ECharts/G2/Plotly first-class series                                                              | `[advanced]`                                |
| **3D surface / 3D scatter / 3D bar**    | 3M (x, y, z)                    | Scientific/engineering surfaces; Plotly & ECharts-GL                                              | `[advanced]`                                |
| **Ternary plot**                        | 3M summing to 100%              | Composition of three parts (geology, chemistry)                                                   | `[advanced]`                                |
| **Contour / density surface**           | 2M × 1M (z)                     | Continuous 2D field                                                                               | `[advanced]`                                |
| **Sunburst-drill / zoomable treemap**   | hierarchy                       | Interactive hierarchical drilldown                                                                | `[advanced]`                                |
| **Boxplot + jitter overlay**            | 1M × 1D                         | Distribution + raw points together                                                                | `[advanced]`                                |
| **Regression / trend-line component**   | 2M                              | Auto-fitted statistical layer (Tableau trend lines, Plotly trendline, Observable Plot regression) | `[advanced]`                                |

---

## Tool-by-tool coverage notes (where the boundaries actually fall)

- **Tableau / Power BI / Qlik** — cover essentially all of §1–4, §9–11, §14 as built-ins; §7 flow, §12 gantt/waterfall/candlestick, §13 radar and networks come via extensions/custom visuals (Power BI marketplace, Tableau extensions, Qlik extension bundle). Power BI treats **waterfall, funnel, gauge, KPI, ribbon (a bump-like stacked flow)** as core visuals.
- **Looker** — strong on §1–3, §9–11, combos; Sankey, network, treemap, waterfall, sunburst, calendar via the "Custom Visualizations" / marketplace layer.
- **Metabase** — deliberately lean: bar, line, area, combo, pie, row, scatter, funnel, map (region/pin/grid), pivot, table, gauge, progress, trend/number, waterfall, sankey (newer). Skips most of §4–8 advanced statistical charts.
- **Superset** — very broad: everything in §1–14 plus SPC-ish, sankey, chord, graph, treemap, sunburst, partition/icicle, bubble, big-number-with-trendline, deck.gl geo suite (scatter, arc, hexagon, grid, path, polygon, screengrid, heatmap, 3D).
- **Hex / Sigma** — notebook/spreadsheet-first; wrap Plotly/Vega/ECharts, so effectively expose the full library catalogue including §15 statistical + 3D; Sigma emphasizes pivot/table + standard business charts natively.
- **ThoughtSpot** — search-driven auto-charting: bar, column, line, area, scatter, bubble, pie, donut, heatmap, geo, KPI, pivot, waterfall, funnel, sankey, treemap, spider/radar, pareto, candlestick; picks chart automatically from the query shape.
- **Observable Plot** — grammar-of-graphics marks (dot, line, bar, area, rect, cell, tick, rule, arrow, link, density, contour, hexbin, boxplot, geo); composes any of §1–8, §11, §15 from primitives rather than named chart types.
- **Highcharts** — named-series catalogue covering §1–14 including gantt, stock/candlestick/OHLC, sankey, dependency-wheel (chord), organization (tree), network graph, streamgraph, wind-rose (polar), bullet, funnel/pyramid, solid gauge, treemap, sunburst, packedbubble, heatmap, tilemap (hex/geo), boxplot, error bars, arearange, columnrange, waterfall, item chart (parliament/pictograph).
- **ECharts** — line, bar, pie, scatter, effectScatter, radar, tree, treemap, sunburst, boxplot, candlestick, heatmap, map (geo), parallel, lines (flow), graph (network), sankey, funnel, gauge, pictorialBar, themeRiver (streamgraph), custom series; plus **ECharts-GL** for 3D bar/scatter/surface/globe.
- **AntV / G2** — grammar-of-graphics (interval, line, area, point, cell, link, polygon, edge, path, schema) that composes bar/line/area/pie/rose/radar/heatmap/sankey/chord/sunburst/treemap/boxplot/violin/gauge/wordcloud; G6 handles networks, X6 handles diagrams.
- **Plotly** — the widest single library: all 2D families plus 3D (scatter3d, surface, mesh, isosurface, cone), statistical (box, violin, histogram, histogram2d/contour, splom, ecdf), maps (choropleth, scattergeo, densitymapbox, choroplethmapbox), financial (candlestick, OHLC), specialized (sankey, parcoords, parcats, sunburst, treemap, icicle, funnel, waterfall, indicator/gauge/bullet, carpet, ternary, polar/radar, contour).

---

## Consolidated "what a production BI tool must ship" checklist

**Table-stakes core (~25):** bar, column, grouped bar, stacked bar, 100% stacked bar, line, multi-series line, area, stacked area, 100% stacked area, pie, donut, treemap, histogram, scatter, bubble, sorted/ranked bar, funnel, big-number KPI, KPI delta/trend indicator, gauge, progress bar, data table, pivot/cross-tab, heatmap table, choropleth map, point map, bubble map, combo (bar+line), dual-axis, sparkline, small multiples, reference lines.

**Expected-advanced (differentiators, ~40+):** box plot, violin, density, ridgeline, streamgraph, horizon, area-range/band, waterfall, candlestick/OHLC, gantt, calendar heatmap, sankey, alluvial, chord, network graph, arc diagram, sunburst, icicle/partition, circle packing, tree/dendrogram, marimekko, waffle, lollipop, dumbbell, slope, bump, pareto, bullet, radar, polar/rose, radial bar, wind rose, hexbin (scatter & map), 2D density/contour, parallel coordinates, SPLOM, correlation-matrix heatmap, flow map, density map, hex-tile/cartogram, 3D surface/scatter, ternary, word cloud, pictograph/isotype, bar-chart-race.

**Files:** none written — full catalogue returned above.
