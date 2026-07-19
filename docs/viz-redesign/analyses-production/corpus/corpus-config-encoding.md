## config-encoding

Per-chart configuration and encoding surface for the DBExec Analyses module. Scope: encoding channels, axis/series config, data labels, legend, tooltip, color, reference lines/annotations, number/date formatting, sort+Top-N, null handling, small multiples, drill. This is the config sidebar that drives each ECharts render.

DBExec today: ECharts, ~24 chart types, flat 67-section config sidebar, server-side aggregation encoding (dimension/measure/aggregate/percentile), filters/parameters/tabs, draft-save + per-tab visuals. Below is honest ground-truth against the market benchmark.

---

### Requirements checklist

#### 1. Encoding channels
- [table-stakes] X / Y position channels (mandatory pair)
- [table-stakes] Color channel — discrete (per-member) + continuous (gradient)
- [table-stakes] Size channel (scatter/bubble)
- [advanced] Size mapping modes: Automatically / By range / From zero
- [table-stakes] Shape channel — basic marker glyph per category
- [advanced] Custom image-based shape palettes
- [table-stakes] Detail / Group channel — split marks without color/legend
- [advanced] Explicit "Detail" channel adding LOD granularity without color (Tableau signature)
- [table-stakes] Tooltip fields (fields shown on hover, no visual encoding)
- [table-stakes] Label / Text channel (value printed on/near mark)
- [table-stakes] Row / Column facets (small multiples) as a stated feature
- [advanced] Arbitrary row×column trellis
- [table-stakes] Dual / secondary axis (combo)
- [advanced] Synchronized vs independent dual-axis toggle
- [advanced] Path channel — mark connect order; line type Linear/Step/Jump; pattern Solid/Dashed/Dotted
- [table-stakes] Angle (pie slice — implicit in chart type)

#### 2. Axis configuration
- [table-stakes] Axis title — custom text, show/hide, font
- [table-stakes] Scale: linear
- [table-stakes] Scale: logarithmic (configurable base)
- [advanced] Scale: symmetric log (handles negatives/zero)
- [table-stakes] Scale: time/date with date-aware ticks
- [table-stakes] Min / Max fixed range — either or both ends independently
- [advanced] Reversed axis
- [table-stakes] Gridlines — major/minor, color, style, show/hide
- [table-stakes] Tick / mark number format
- [advanced] Tick marks at fixed powers/intervals
- [table-stakes] Tick label rotation
- [advanced] Label interval / skip (every Nth)
- [advanced] Sync vs independent scale for dual axis
- [table-stakes] Axis orientation (horizontal/vertical) + position (opposite side)
- [advanced] Separate number format for axis vs tooltip

#### 3. Series configuration
- [table-stakes] Per-series color override
- [table-stakes] Per-series chart type (combo: line + bar)
- [table-stakes] Per-series axis assignment (secondary axis)
- [table-stakes] Stacking mode — None / Stacked / 100%
- [table-stakes] Series order (reorder → stack + legend + z-order)
- [advanced] Drag-and-drop series reorder

#### 4. Data labels
- [table-stakes] Show / hide
- [table-stakes] Position (auto / inside end / outside end / inside center / inside base)
- [table-stakes] Content — value / category / percent / multiple fields
- [table-stakes] Format — number/date, decimals, units, font, color
- [advanced] Stack total labels (distinct from per-segment)
- [advanced] Conditional-color labels (data-driven)
- [advanced] Overflow / collision handling — auto-hide, overflow text, density %
- [advanced] Label only min/max/first/last/selected

#### 5. Legend
- [table-stakes] Show / hide
- [table-stakes] Position — top/bottom/left/right (+ inside)
- [table-stakes] Legend title — custom, show/hide
- [advanced] Type: plain vs scroll
- [advanced] Legend margin / spacing
- [table-stakes] Interactive click-to-highlight
- [advanced] Click-to-filter series
- [advanced] Separate legend per encoding channel (color/size/shape)

#### 6. Tooltip
- [table-stakes] Default tooltip auto-populated from encoded fields
- [table-stakes] Add custom fields without encoding
- [table-stakes] Custom template with field-insert
- [advanced] Report-page / viz-in-tooltip
- [advanced] Tooltip behavior — responsive vs on-hover, enable/disable
- [advanced] Command buttons in tooltip (Keep Only, Exclude, View Data)

#### 7. Color
- [table-stakes] Categorical palettes
- [table-stakes] Sequential palettes
- [table-stakes] Diverging palettes
- [advanced] Settable diverging midpoint
- [table-stakes] Per-value color override (pin category → color)
- [advanced] Conditional / data-driven color (fx rules / gradient / by-field) — the fx engine
- [advanced] Continuous color stepped/binned (N steps)
- [advanced] Colorblind-safe palettes as first-class named schemes (Okabe-Ito, Viridis/Cividis, RdBu)
- [table-stakes] Do not force red-green
- [table-stakes] Opacity / transparency slider
- [advanced] Mark border & halo
- [advanced] Custom palette import / config-injected schemes

#### 8. Reference lines / bands / regions
- [table-stakes] Constant reference line (fixed value)
- [table-stakes] Computed: average
- [table-stakes] Computed: median
- [table-stakes] Computed: min / max
- [advanced] Computed: sum / total
- [advanced] Computed: percentile (multiple instances)
- [table-stakes] Reference band (shaded between two values)
- [advanced] Reference distribution (gradient/shaded)
- [advanced] Percentages / percentiles / quantiles / std-dev distributions
- [advanced] Box plot config (whisker method, show marks/outliers)
- [advanced] Scope: cell / pane / table
- [table-stakes] Trend line — linear
- [advanced] Trend model choice (log/exp/polynomial) + confidence bands + R²/p-value
- [advanced] Forecast — length, confidence interval, seasonality
- [advanced] Error bars — by field or by percentage
- [advanced] Anomaly detection
- [table-stakes] Line value label
- [advanced] Line label modes — none/value/computation/custom
- [table-stakes] Line/band formatting — type, color, weight, fill

#### 9. Annotations
- [advanced] Point / mark annotation
- [advanced] Area / region annotation
- [advanced] Free-text annotation with leader line
- [advanced] Annotation from another dataset/layer (event/interval overlay)

#### 10. Number / date formatting
- [table-stakes] Decimals
- [table-stakes] Thousands separator
- [table-stakes] Display units (K/M/B/auto)
- [table-stakes] Currency (standard & custom)
- [table-stakes] Percentage
- [table-stakes] Custom format string (D3 / #,##0.0 patterns)
- [table-stakes] Negative value styling (parens/red/sign)
- [table-stakes] Prefix / suffix
- [table-stakes] Date format — custom patterns, locale
- [advanced] Per-element format override (axis vs tooltip vs label)

#### 11. Sorting + Top-N + "Other" bucketing
- [table-stakes] Sort ascending / descending by dimension or measure
- [table-stakes] Manual / custom sort order (drag)
- [advanced] Nested / multi-level sort
- [table-stakes] Top-N filter by measure
- [advanced] Native "Other" bucket in Top-N (direction / count / rank measure)
- [advanced] Series limit (distinct from row limit)
- [table-stakes] Row limit (perf guard)

#### 12. Null handling
- [table-stakes] Null on continuous line — gap / bridge-connect / drop-to-zero
- [table-stakes] Show null as zero (ZN)
- [advanced] Special-values placement / null indicator
- [advanced] Show / hide empty rows & columns
- [table-stakes] Null label text (N/A, —)

#### 13. Small multiples / trellis
- [table-stakes] Facet by one dimension
- [advanced] Row × column 2-D trellis
- [table-stakes] Grid dimensions control (rows/cols count)
- [advanced] Shared vs independent axes across panels
- [advanced] Per-panel title / gridline / background styling

#### 14. Drill hierarchies
- [table-stakes] Defined hierarchy (drill path)
- [table-stakes] Drill down / up
- [advanced] Expand next level alongside current
- [advanced] Drill-through to another view/page
- [advanced] Breadcrumb trail
- [table-stakes] Cross-filter / highlight from selection (dashboard level)

---

### Gap table

| Requirement | DBExec status | Priority | Effort (BE?) |
|---|---|---|---|
| **Encoding channels** | | | |
| X / Y position | have (dimension/measure encoding) | P0 | — |
| Color channel discrete + gradient | partial (categorical works; continuous gradient uneven) | P0 | M (BE for gradient bins) |
| Size channel (scatter/bubble) | have | P1 | S |
| Size mapping modes (auto/by-range/from-zero) | missing | P2 | M |
| Shape channel basic | partial (scatter symbols only) | P2 | S |
| Custom image shape palettes | missing | P2 | L |
| Detail / Group channel | partial (group-by exists via extra dimension) | P1 | M (BE grouping) |
| Explicit LOD Detail (no color) | missing | P2 | L (BE) |
| Tooltip fields (extra, unencoded) | partial (default tooltip; no add-field) | P1 | M (BE carries field) |
| Label / Text channel | partial (labels on some types) | P0 | M |
| Row/Column facets (small multiples) | missing | P1 | L (BE faceted query) |
| Arbitrary row×col trellis | missing | P2 | L (BE) |
| Dual / secondary axis (combo) | have (combo type wired) | P1 | S |
| Sync vs independent dual axis | missing | P2 | S |
| Path (connect order, line type, pattern) | partial (line types via chart choice) | P2 | S |
| Angle (pie) | have (implicit) | — | — |
| **Axis** | | | |
| Axis title show/hide/font | partial (title yes; font uneven) | P1 | S |
| Scale linear | have | P0 | — |
| Scale logarithmic | partial (ECharts supports; not all types exposed) | P1 | S |
| Scale symmetric log | missing | P2 | S |
| Scale time/date | partial | P1 | M (BE date typing) |
| Min/Max fixed (independent ends) | partial (min/max exists; independent-end uneven) | P1 | S |
| Reversed axis | missing | P2 | S |
| Gridlines major/minor/style | partial (on/off; limited style) | P1 | S |
| Tick number format | partial (tied to global format) | P1 | S |
| Tick marks at fixed powers | missing | P2 | S |
| Tick label rotation | partial | P1 | S |
| Label interval / skip Nth | missing | P2 | S |
| Axis orientation + position | partial (orientation via chart type) | P1 | S |
| Separate axis vs tooltip format | missing | P2 | M |
| **Series** | | | |
| Per-series color override | partial (palette applies; per-series pin uneven) | P0 | M |
| Per-series chart type (combo) | have | P1 | S |
| Per-series secondary-axis assignment | partial (combo only) | P1 | M |
| Stacking None/Stacked/100% | partial (stacked yes; 100% uneven) | P0 | M (BE for 100% normalize) |
| Series order | partial (query order; no manual) | P1 | M |
| Drag-and-drop series reorder | missing | P2 | M |
| **Data labels** | | | |
| Show / hide | partial (some chart types only) | P0 | M |
| Position (5 modes) | partial (default only) | P1 | S |
| Content (value/category/percent/multi) | partial (value only) | P1 | M |
| Format (number/date/font/color) | partial (global format) | P1 | S |
| Stack total labels | missing | P2 | M |
| Conditional-color labels | missing | P2 | M |
| Overflow / density collision | missing | P2 | L |
| Label only min/max/first/last | missing | P2 | M |
| **Legend** | | | |
| Show / hide | have | P0 | — |
| Position 4-way + inside | partial (top/bottom common; full 4-way uneven) | P1 | S |
| Legend title | partial | P1 | S |
| Type plain vs scroll | partial (ECharts scroll available) | P2 | S |
| Legend margin/spacing | missing | P2 | S |
| Interactive click-to-highlight | partial (ECharts default toggle) | P1 | S |
| Click-to-filter series | missing | P2 | M |
| Separate legend per channel | missing | P2 | M |
| **Tooltip** | | | |
| Default tooltip | have | P0 | — |
| Add custom fields | missing | P1 | M (BE carries field) |
| Custom template field-insert | missing | P1 | M |
| Report-page / viz-in-tooltip | missing | P2 | L |
| Tooltip behavior responsive/on-hover | missing | P2 | S |
| Command buttons in tooltip | missing | P2 | L |
| **Color** | | | |
| Categorical palettes | have | P0 | — |
| Sequential palettes | partial (some heatmap gradients) | P1 | S |
| Diverging palettes | partial | P1 | S |
| Settable diverging midpoint | missing | P2 | S |
| Per-value color override | missing | P1 | M |
| Conditional / data-driven color (fx engine) | missing | P1 | L (BE evaluates rules) |
| Continuous color stepped/binned | missing | P2 | M |
| Colorblind-safe named palettes | missing | P1 | S |
| Do not force red-green | partial (depends on default palette) | P1 | S |
| Opacity / transparency | partial (per-type) | P1 | S |
| Mark border & halo | missing | P2 | S |
| Custom palette import | missing | P2 | M |
| **Reference lines / bands** | | | |
| Constant reference line | missing (flagged in prior audit) | P0 | M (BE optional) |
| Computed average | missing | P0 | M (BE compute) |
| Computed median | missing | P1 | M (BE) |
| Computed min/max | missing | P1 | M (BE) |
| Computed sum/total | missing | P2 | M (BE) |
| Computed percentile (multi) | missing | P2 | M (BE) |
| Reference band | missing | P1 | M |
| Reference distribution | missing | P2 | L (BE) |
| Distribution %/percentile/quantile/std-dev | missing | P2 | L (BE) |
| Box plot config | partial (boxplot type wired; no whisker/outlier config) | P2 | M (BE) |
| Scope cell/pane/table | missing | P2 | L (BE) |
| Trend line linear | missing | P1 | M (BE regression) |
| Trend model choice + confidence + stats | missing | P2 | L (BE) |
| Forecast (length/CI/seasonality) | missing | P2 | L (BE) |
| Error bars (field/percentage) | missing | P2 | M (BE) |
| Anomaly detection | missing | P2 | L (BE) |
| Line value label | missing | P1 | S |
| Line label modes (none/value/computation/custom) | missing | P2 | S |
| Line/band formatting | missing | P1 | S |
| **Annotations** | | | |
| Point / mark annotation | missing | P2 | M |
| Area / region annotation | missing | P2 | M |
| Free-text annotation + leader | missing | P2 | M |
| Annotation from other layer (event/interval) | missing | P2 | L (BE) |
| **Number / date formatting** | | | |
| Decimals | partial (global format engine) | P0 | S |
| Thousands separator | partial | P0 | S |
| Display units K/M/B | partial | P1 | S |
| Currency standard & custom | partial | P1 | S |
| Percentage | partial | P1 | S |
| Custom format string (D3) | missing | P1 | M |
| Negative value styling | missing | P2 | S |
| Prefix / suffix | partial | P1 | S |
| Date format patterns/locale | partial | P1 | M |
| Per-element format override | missing | P2 | M |
| **Sorting + Top-N + Other** | | | |
| Sort asc/desc by dim or measure | partial (measure sort; dim uneven) | P0 | S (BE order-by) |
| Manual / custom sort order | missing | P1 | M (BE) |
| Nested / multi-level sort | missing | P2 | M (BE) |
| Top-N by measure | partial (aggregation supports; UI uneven) | P0 | M (BE) |
| Native "Other" bucket | missing | P1 | M (BE rollup) |
| Series limit (distinct) | missing | P2 | M (BE) |
| Row limit (perf guard) | partial (implicit query cap) | P1 | S (BE) |
| **Null handling** | | | |
| Line gap / connect / zero | partial (ECharts default gap) | P1 | S |
| Show null as zero (ZN) | partial (via calc field) | P1 | S (BE) |
| Special-values placement | missing | P2 | M |
| Show/hide empty rows & cols | missing | P2 | M (BE) |
| Null label text | missing | P1 | S |
| **Small multiples** | | | |
| Facet by one dimension | missing | P1 | L (BE) |
| Row × col 2-D trellis | missing | P2 | L (BE) |
| Grid dimensions control | missing | P1 | M |
| Shared vs independent axes | missing | P2 | M |
| Per-panel styling | missing | P2 | M |
| **Drill hierarchies** | | | |
| Defined hierarchy drill path | missing | P1 | L (BE) |
| Drill down / up | missing | P1 | L (BE) |
| Expand next level | missing | P2 | M (BE) |
| Drill-through to another view | missing | P2 | L (BE) |
| Breadcrumb trail | missing | P2 | S |
| Cross-filter / highlight from selection | partial (filters exist; not click-driven cross-filter) | P1 | L (BE + wiring) |

---

### Must-have for production (P0 shortlist)

These are the baseline no serious BI user forgives missing. Ship these before calling Analyses production-ready:

1. **X / Y encoding** — already have; verify across all 24 chart types.
2. **Color channel: discrete + continuous gradient** — categorical works; close the continuous-gradient gap (BE bins).
3. **Label / Text channel + data-label show/hide** — labels must work on *every* cartesian type, not a subset. (prior audit flagged "data labels everywhere")
4. **Stacking None / Stacked / 100%** — 100%-stacked normalization needs BE support; today uneven.
5. **Per-series color override** — pin a series to a color reliably, beyond palette rotation.
6. **Legend show/hide** — have.
7. **Default tooltip** — have.
8. **Categorical palettes** — have; verify colorblind-default (do not force red-green).
9. **Constant + average reference line** — currently *missing entirely*; flagged in prior audit as a gap on all cartesian types. This is the single most visible P0 hole — every competitor has it, DBExec has none.
10. **Number formatting core** — decimals, thousands separator, display units, percentage — the global format engine exists but must be reliably wired per-encoding-element.
11. **Sort (dim + measure) + Top-N by measure** — measure sort partial, dim sort + Top-N UI uneven; both are table-stakes.
12. **Null on line: gap vs zero vs connect** — ECharts defaults to gap; expose the toggle.

**The one glaring P0 hole:** reference lines (constant + average). Every benchmark tool ships them; DBExec ships none. Build constant + average + median + min/max with a value label and basic formatting first — it is the highest-visibility, lowest-controversy win in this domain.

**Honest summary:** DBExec's encoding *foundation* (dimension/measure/aggregate + ~24 types) is solid, but the per-chart *config surface* is shallow — most rows above are "partial" because a global setting exists but is not wired per-element, or the capability is chart-type-specific rather than universal. The bulk of remaining work is FE config-panel wiring on top of the existing ECharts render; the genuinely BE-heavy items are: continuous-color bins, 100%-stack normalize, facet/trellis queries, computed reference lines, Top-N + "Other" rollup, drill hierarchies, and the fx data-driven color engine.