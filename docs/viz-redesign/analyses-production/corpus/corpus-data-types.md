The caveman skill isn't available in this subagent environment. I'll proceed with the task directly, writing the requirements corpus section in normal prose (technical documentation is a code-block/normal-writing carve-out anyway).

## data-types

*Production-readiness requirements for how the DBExec Analyses module detects, formats, sorts, filters, aggregates, and visually encodes every data type. Benchmarked against Tableau, Power BI, and Looker. Markers: **[table-stakes]** = every serious BI tool does this; **[advanced]** = differentiator.*

---

### Design foundation: three independent field axes

Before per-type requirements, the engine must model three orthogonal properties per field. Everything downstream keys off these. DBExec today has only a partial `dimension/measure/aggregate/percentile` encoding — it lacks a true role model and has no continuous-vs-discrete flag at all.

- **[table-stakes]** Physical type per field (int, float, decimal, currency, percent, string, date, datetime, time, boolean, geographic, json/nested, null).
- **[table-stakes]** Analytical role: Dimension vs. Measure, user-overridable (IDs/ZIPs/years mis-detect as measures — every tool has this failure, so override is mandatory).
- **[table-stakes]** Continuous vs. Discrete flag, independent of role (continuous dimension = date on axis; discrete measure = binned count as header). Drives axis-vs-header and gradient-vs-swatch encoding.
- **[advanced]** Semantic hint layer (geographic role / URL / image / barcode / map-layer), first-class and user-overridable.
- **[table-stakes]** Default-aggregation property per measure, including a "do-not-SUM" flag for ratios/rates/percentages.

---

### 1. Numeric (int / float / decimal / currency / percent / scientific)

**Detection**
- **[table-stakes]** Numeric → Measure by default; int-vs-float inferred from values.
- **[table-stakes]** Sample-based type inference with a documented row cap; user role override (IDs, ZIPs, year numbers must be demotable to dimension).

**Formatting**
- **[table-stakes]** VBA/Excel placeholder format grammar: `0` `#` `.` `,` `%` `E+/E-` `$/€/literal` and `;`-delimited positive;negative;zero;null sections.
- **[table-stakes]** Trailing-comma = scale-by-1000; `%` = multiply-by-100-and-append.
- **[table-stakes]** Named presets: General Number, Currency, Fixed, Standard, Percent, Scientific.
- **[table-stakes]** Locale-driven decimal/thousands/currency separators (`.` and `,` are roles, not glyphs).
- **[advanced]** Display-unit auto-scale (K/M/B) as a toggle **separate** from the format string.
- **[advanced]** Dynamic per-value/per-measure format string.
- **[table-stakes]** Live format preview in the config panel.

**Sorting** — **[table-stakes]** natural numeric order; currency/percent sort on underlying value not formatted text.

**Filtering** — **[table-stakes]** range/slider, ≥/≤/between, top-N, at-least/at-most; continuous→range, bucketed→checklist.

**Aggregation**
- **[table-stakes]** SUM, AVG, MIN, MAX, COUNT, COUNT DISTINCT, MEDIAN, STDEV/STDEVP, VAR/VARP.
- **[table-stakes]** "Do-not-SUM" flag for ratios/percentages.
- **[advanced]** PERCENTILE, running sum, moving average, % of total.

**Binning** — **[table-stakes]** numeric→categorical bins (fixed size or bin count) with tier label styles; a bin is a continuous measure reprojected as discrete dimension.

**Visual encoding** — **[table-stakes]** position (primary), length/size, sequential-color gradient; only type that legitimately drives a continuous axis or size channel; percent-of-whole → stacked/treemap/pie.

---

### 2. Temporal (date / datetime / time / timezone / relative / fiscal / date-parts)

**The three-way temporal model — [table-stakes], copy exactly**
- **[table-stakes]** Date **truncation/value** (continuous, `DATE_TRUNC`, one point per period, continuous axis).
- **[table-stakes]** Date **part** (discrete, `EXTRACT`/`DATEPART`, enables seasonality — all Januaries stacked).
- **[table-stakes]** Exact date (row-level, no truncation).
- **[advanced]** Looker-style `dimension_group`: declare a datetime once → auto-generate every grain + every part + duration. (Highest-leverage feature in the space; DBExec has none of this.)

**Date-part extraction** — **[table-stakes]** year, quarter, month, ISO week, day-of-month, day-of-week (name+number), day-of-year, hour, minute, second. **[advanced]** hour-of-day, month-name, week-of-year as first-class dimensions.

**Hierarchy/drill** — **[table-stakes]** auto Year→Quarter→Month→Day drill on a single axis.

**Formatting** — **[table-stakes]** VBA date tokens (`d/dd`, `mmm/mmmm`, `yy/yyyy`, `dddd`, `hh`, `nn` for minutes, `tt`); named General/Long/Short Date & Time; locale-driven separators. **Never lexicographically sort formatted dates** (common bug).

**Timezone** — **[advanced]** `convert_tz`-style conversion DB→query TZ; date-only skips conversion; epoch/null-date gotcha handling.

**Relative dates** — **[table-stakes]** last-N days/weeks/months/quarters/years, this/prev/next period, YTD, anchored to now or reference date.

**Fiscal** — **[advanced]** per-datasource fiscal-year-start; fiscal quarter/year honoring it.

**Sort/filter/aggregate/encode** — **[table-stakes]** chronological sort; range + relative + part-checklist filters; MIN/MAX = earliest/latest; measures aggregate within grain; truncated date → line/area X-axis; date part → discrete color/columns.

---

### 3. Categorical / String (nominal / ordinal / high-cardinality)

**Detection** — **[table-stakes]** string → Dimension (nominal); ordinal not auto-detected, user supplies order.

**Formatting** — **[table-stakes]** value aliasing/relabel (M→Male); no numeric format string on strings. **[advanced]** semantic tags (Web URL → link, Image URL → thumbnail, Barcode).

**Sorting** — **[table-stakes]** alphabetical, sort-by-measure (bars by descending SUM — most-used sort in BI), manual. **[advanced]** ordinal via sort-by-column / order-by-field (month-name by month-number — non-negotiable to stop "Apr, Aug, Dec" bug).

**Filtering** — **[table-stakes]** multi-select checklist, search-within, contains/starts-with/wildcard, exclude, keep-only. **[advanced]** high-cardinality server-side/lazy filter lists, type-ahead, show-top-N.

**High-cardinality & "Other"** — **[advanced]** Top-N + auto "Other" bucket; manual grouping into named groups; cap categorical color channel at ~10–12 hues before forcing roll-up.

**Aggregation** — **[table-stakes]** COUNT, COUNT DISTINCT, MIN/MAX lexical; primary group-by key. **[advanced]** MODE, list-agg/concat.

**Visual encoding** — **[table-stakes]** nominal → categorical hue + shape + headers; ordinal → ordered channel (position/size/lightness, **not** hue); colorblind-safe palette.

---

### 4. Boolean

- **[table-stakes]** Native boolean type; displays as Yes/No.
- **[table-stakes]** Alias to Yes/No, ✓/✗, Active/Inactive, On/Off.
- **[table-stakes]** Sort false<true; filter as toggle/two-state/segmented control (cleanest filter UI of any type).
- **[table-stakes]** Aggregate COUNT and **% true** (true-rate = boolean's most useful measure).
- **[table-stakes]** Encode two-color hue, filled/hollow shape, or small-multiple split.

---

### 5. Geographic (lat/long / country / state / city / postal / geojson)

- **[table-stakes]** Geographic roles: Country/Region, State/Province, City, ZIP/Postal, Latitude, Longitude. **[advanced]** County, CBSA/MSA, area code, airport, NUTS.
- **[table-stakes]** Auto-recognize field names ("State", "Country", "Zip") on import; auto-geocode role→generated lat/long.
- **[table-stakes]** Postal codes stay string (leading-zero preservation bug); lat/long stay continuous measures but NOT summed.
- **[table-stakes]** Filter by region hierarchy Country→State→City. **[advanced]** map lasso/radius/distance filters.
- **[table-stakes basic / advanced full]** Choropleth (region fill by measure), symbol/point map. **[advanced]** density/heatmap, flow/path, map-layer binding to GeoJSON/TopoJSON.

*(DBExec has no map/geo at all today — flagged as a known gap.)*

---

### 6. JSON / Nested / Arrays / Struct

- **[advanced]** Object/struct → expand-to-columns; re-run detection per leaf.
- **[advanced]** Array → explode-to-rows (warn: changes grain, double-counts measures) OR aggregate-in-place (count/first/last).
- **[table-stakes for table view]** Raw JSON viewable as monospace, truncated, expandable string cell.
- **[advanced]** Path-extractor UI (`payload.user.id`) materializing a new typed dimension from VARIANT/JSONB.

---

### 7. Null / NaN / Missing / Empty

- **[table-stakes]** Null distinct from zero and empty-string; own header/keyword/`(Blank)`.
- **[table-stakes]** Line/time-chart null handling choice: show gap / connect / plot-as-zero.
- **[advanced]** Densification / show-missing-values to fill absent periods on date/bin axes.
- **[table-stakes]** Null replacement (ZN/IFNULL/COALESCE) in calc fields.
- **[advanced]** NaN/Infinity surfaced separately from null.
- **[table-stakes]** Null sorts to a configurable end; appears as own selectable filter member + exclude-nulls toggle; SUM/AVG skip nulls; null group-by → own "Null" bucket (never silently dropped); reserved grey encoding swatch; data-quality count.

---

### 8. Mixed Types

- **[table-stakes]** Sample-based inference with documented row cap; late-outlier caveat.
- **[table-stakes]** Coercion hierarchy: parse-failure → fall back to string (lossless); visible per-column type override.
- **[table-stakes]** Never silently drop mixed values — un-parseable → null + data-quality indicator count.
- **[table-stakes→advanced]** Explicit cast actions (string→date with token, string→number).

---

### Gap Table

| Requirement | DBExec status | Priority | Effort (BE?) |
|---|---|---|---|
| **Foundation: physical-type/role/continuous-discrete tri-axis model** | partial (only dim/measure/aggregate encoding) | P0 | L (BE) |
| User-overridable dimension/measure role | partial | P0 | M (BE) |
| Continuous vs. discrete flag | missing | P0 | M (BE) |
| Default-aggregation + "do-not-SUM" flag per measure | partial (field-metadata is UI-only dead columns per prior audit) | P1 | M (BE) |
| Semantic-hint layer (geo role / URL / image / barcode) | missing | P1 | M (BE) |
| **Numeric: core aggregates (SUM/AVG/MIN/MAX/COUNT/CDISTINCT)** | have | — | — |
| Numeric: MEDIAN/STDEV/VAR | partial (percentile exists) | P1 | S (BE) |
| VBA/Excel format grammar (`0 # . , % ; E`) | missing | P0 | M (mostly FE) |
| Named numeric presets (Currency/Percent/Scientific/Fixed) | missing | P0 | S (FE) |
| Locale-driven separators | missing | P1 | M (FE) |
| Format live-preview in config | missing (flagged gap) | P1 | S (FE) |
| Display-unit auto-scale (K/M/B) toggle separate from format | missing | P1 | S (FE) |
| Dynamic per-value format string | missing | P2 | M (BE) |
| Numeric binning (fixed size / bin count) | have (histogram) partial as reusable dimension | P1 | M (BE) |
| Running sum / moving avg / % of total | missing | P2 | M (BE) |
| **Temporal: three-way value/part/exact model** | missing | P0 | L (BE) |
| Date-part extraction (year…second, dow, month-name) | partial (likely truncation-only) | P0 | M (BE) |
| `dimension_group`-style auto-family generation | missing | P2 | L (BE) |
| Date hierarchy / drill Y→Q→M→D | missing | P1 | M (BE+FE) |
| VBA date format tokens + named presets | missing | P1 | S (FE) |
| Chronological (not lexical) date sort | partial (verify) | P0 | S (BE) |
| Relative-date filters (last-N, YTD, this/prev period) | partial (filters exist; relative semantics unclear) | P0 | M (BE) |
| Timezone conversion (`convert_tz`) | missing | P2 | M (BE) |
| Fiscal calendar / FY-start | missing | P2 | M (BE) |
| **Categorical: group-by + COUNT/CDISTINCT** | have | — | — |
| Value aliasing / relabel | missing | P1 | M (BE+FE) |
| Sort-by-measure (descending SUM) | partial (verify) | P0 | S (BE) |
| Sort-by-column for ordinals (month-name by number) | missing | P0 | M (BE) |
| Contains/starts-with/wildcard string filters | partial | P1 | S (BE) |
| High-cardinality lazy/type-ahead filter lists | missing | P1 | M (BE) |
| Top-N + auto "Other" bucket | missing | P1 | M (BE) |
| Manual grouping into named groups | missing | P2 | M (BE) |
| Colorblind-safe palette + swatch UI | missing (flagged gap) | P1 | S (FE) |
| Cap color channel ~10–12 + roll-to-Other | missing | P2 | S (FE) |
| **Boolean: native type + Yes/No display** | partial (verify) | P1 | S |
| Boolean alias (✓/✗, Active/Inactive) | missing | P2 | S (FE) |
| Boolean single-toggle/segmented filter UI | missing | P1 | S (FE) |
| Boolean % true measure | missing | P1 | S (BE) |
| **Geo: geographic roles + auto-geocode** | missing (flagged gap) | P1 | L (BE) |
| Choropleth + symbol/point map | missing (flagged gap) | P1 | L (BE+FE) |
| Postal-as-string / lat-long-not-summed guards | missing | P1 | S (BE) |
| Region-hierarchy / distance / lasso filters | missing | P2 | L (BE) |
| **JSON: raw JSON as expandable string cell (table)** | missing | P2 | S (FE) |
| JSON expand-to-columns / explode-to-rows | missing | P2 | L (BE) |
| JSON path-extractor UI | missing | P2 | L (BE) |
| **Null: distinct from zero/empty, own bucket** | partial (verify group-by null handling) | P0 | M (BE) |
| Null as selectable filter member + exclude toggle | partial | P1 | S (BE) |
| SUM/AVG skip-null (SQL semantics) | likely have (SQL passthrough) | P1 | S (verify BE) |
| Line-chart null handling (gap/connect/zero) | missing | P1 | S (FE) |
| Null grey encoding swatch | missing | P2 | S (FE) |
| Densification / show-missing-values | missing | P2 | L (BE+FE) |
| Data-quality null/parse-fail count | missing | P2 | M (BE) |
| **Mixed: sample inference + string fallback** | partial (DB-driven, warehouse types) | P1 | M (BE) |
| Per-column type override + cast actions | missing | P1 | M (BE) |
| Mixed parse-fail → null + DQ warning | missing | P2 | M (BE) |

---

### Must-have for production (the P0 shortlist)

These are the load-bearing gaps that block credible "handles every data type" positioning. Each is P0:

1. **Tri-axis field model** — physical type + user-overridable role (dim/measure) + continuous-vs-discrete flag. Everything else keys off this; without it the engine cannot correctly decide axis-vs-header or gradient-vs-swatch. (L, BE-heavy)
2. **Role override** — demote mis-detected ID/ZIP/year numerics from measure to dimension. Universal failure mode; non-negotiable. (M, BE)
3. **VBA/Excel numeric format grammar + named presets (Currency/Percent/Scientific/Fixed)** — the de-facto standard users already know from Excel/Power BI; currently missing entirely. (M, mostly FE)
4. **Temporal three-way model (truncation value / date part / exact)** with the core date-part extraction set — the single biggest divergence from a naive engine and the backbone of every time-series and seasonality chart. (L, BE)
5. **Chronological date sort + relative-date filters (last-N / YTD / this-prev-period)** — lexical date sort is a shipping bug; relative dates are table-stakes for any dashboard. (S–M, BE)
6. **Sort-by-measure and sort-by-column for ordinals** — descending-SUM is the most-used sort in BI; month-name-by-number stops the "Apr, Aug, Dec" alphabetization bug. (S–M, BE)
7. **Null as first-class member** — distinct from zero/empty, own group-by bucket (never silently dropped), own filter member, SQL skip-in-aggregation. (M, BE)

Notes on honesty: DBExec has solid core numeric aggregation and 24 chart types wired, but the entire **type-semantics layer is thin** — formatting grammar, temporal model, role/continuous separation, sort intelligence, null-as-member, and geo are all missing or UI-only-dead (per the aggregation/field-metadata audit). The P0 list above is where "chart tool" becomes "BI tool."