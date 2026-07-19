# How Production BI Tools Handle Every Data Type in Charts + Tables

*Deep-research synthesis benchmarking Tableau, Power BI, and Looker (LookML). Claims verified against primary vendor docs where possible; each type covers **detection → formatting → sorting → filtering → aggregation → visual encoding**. Markers: **[table-stakes]** = every serious BI tool does this; **[advanced]** = differentiator / not universal.*

---

## 0. The Master Abstraction: Role vs. Type

Every one of the three tools separates two orthogonal ideas, and any engine you build should too:

| Concept | Tableau | Power BI | Looker |
|---|---|---|---|
| **Physical type** | Data type (int/float/string/date/datetime/bool/geographic) | Data type (Whole/Decimal/Fixed-decimal/Text/Date/Time/DateTime/Boolean) | SQL type behind the `sql:` param |
| **Analytical role** | Dimension vs. Measure; Discrete (blue) vs. Continuous (green) | Column vs. Measure; plus **Data Category** (semantic tag) | `dimension` vs. `measure`; plus `type:` (string/number/tier/yesno/time…) |
| **Semantic hint** | Geographic Role, Default aggregation, Fiscal-year start | Data Category (Address, City, Web URL, Image URL, Barcode…) | `map_layer_name`, `value_format_name`, `sql_latitude` |

**Key principle: the physical type constrains the legal set of roles; the role + semantic hint drives formatting, aggregation, and which visual channels are offered.** ([Tableau: Dimensions & Measures](https://help.tableau.com/current/pro/desktop/en-us/datafields_typesandroles.htm), [Tableau field-type detection](https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm))

The discrete/continuous distinction (Tableau's blue/green) is the single most under-copied idea: **discrete = headers/panes/distinct-color-swatches; continuous = axis/gradient.** It is independent of dimension/measure — you can have a continuous dimension (a date on an axis) or a discrete measure (a binned count as a header). Build your engine so "role" and "continuous-vs-discrete" are separate flags.

---

## 1. Numeric — int / float / decimal / currency / percent / scientific

### Detection **[table-stakes]**
- Tableau: numeric → **Measure** by default (auto-aggregated on drop); integer-vs-float inferred from values. Mixed-value columns are typed by scanning the **first 10,000 rows (Excel) / 1,024 rows (CSV)** ([Tableau detection](https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm)). **Watch out:** IDs, ZIP codes, year numbers get mis-detected as measures — every tool has this failure mode, so let the user override role.
- Power BI: Whole Number / Decimal / **Fixed Decimal (currency, 4 dp internal)** / Percentage are distinct storage types.
- Looker: `type: number` for non-aggregated numeric dimensions; measures use `type: sum/average/count/…`.

### Formatting **[table-stakes]**
Both major format grammars are **VBA/Excel-style placeholder strings** — adopt this, it's the de-facto standard:

| Token | Meaning | Example |
|---|---|---|
| `0` | digit-or-zero (forces leading/trailing zeros) | `00000` → `00042` |
| `#` | digit-or-nothing | `#,##0` → `1,234,567` |
| `.` | decimal point (locale-swapped) | `#,##0.00` |
| `,` | thousands sep; **trailing comma = scale by 1000** | `##0,,` → 100M shown as `100` |
| `%` | **multiply by 100** + append `%` | `0.0%` → `15.6%` |
| `E+ E- e+ e-` | scientific | `0.00E+00` → `1.23E+06` |
| `$ € literal` | currency / literal chars | `$#,##0.00` |
| `;` sections | positive;negative;zero;null | `#,##0.00;(#,##0.00);"Zero"` |

([Power BI custom format strings](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-custom-format-strings)) — this page is the single best token reference; the negative-in-parentheses and the "trailing comma scales by 1000" behaviors are non-obvious and worth replicating.

- **Named/predefined formats** [table-stakes]: General Number, Currency, Fixed, Standard, Percent, Scientific. Looker mirrors this with `value_format_name: usd, usd_0, percent_2, decimal_1, …` plus raw `value_format: "$#,##0.00"`.
- **Locale** [table-stakes]: decimal/thousands/currency separators and symbol follow **system/report locale**, not the format string. `.` and `,` are *roles*, not literal glyphs.
- **Display-unit auto-scaling (K/M/B)** [advanced but expected]: Power BI applies this at the *visual* level independently of the format string — a classic gotcha where `#,##0` still shows `12K` until Display Units = None ([same doc, "unwanted automatic scaling"](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-custom-format-strings)). Lesson: **keep an auto-scale toggle separate from the format string.**
- **Dynamic format strings** [advanced]: Power BI lets a measure return its own format via DAX (e.g., switch °C/°F by slicer). Looker/Tableau lack a true equivalent.

### Sorting **[table-stakes]**
Natural numeric ordering. Currency/percent sort on underlying value, not formatted text.

### Filtering **[table-stakes]**
Range (min/max), slider, ≥/≤/between, top-N, "at least/at most." Continuous → range/slider; if bucketed → checklist.

### Aggregation **[table-stakes]**
SUM, AVG, MIN, MAX, COUNT, COUNT DISTINCT, MEDIAN, STDEV/STDEVP, VAR/VARP, PERCENTILE. **Percent and currency are additive; ratios/rates are NOT** — a well-built engine flags "do-not-SUM" fields (Tableau's default-aggregation property, Looker's `type: average` measures). [advanced]: percentile & running/window aggregates (running sum, moving average, % of total).

### Visual encoding **[table-stakes]**
Quantitative → **position (best), length/size, color *value/saturation* (sequential gradient)**. Numeric is the only type that legitimately drives a continuous axis or a size channel. Percent-of-whole → stacked bar / treemap / pie. ([UW viz curriculum](https://observablehq.com/@uwdata/data-types-graphical-marks-and-visual-encoding-channels), [CSE442 visual encoding](https://courses.cs.washington.edu/courses/cse442/25au/lectures/CSE442-VisualEncoding.pdf))

### Binning numeric → categorical **[table-stakes]**
- Tableau **Bins** (fixed size); Power BI **Grouping & Binning** (bin size or bin count) ([Power BI binning](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-grouping-and-binning)); Looker **`type: tier`** with `tiers: [0, 50000, 100000, 200000]` and four label styles (`classic` "T02 [10,20)", `interval` "[10,20)", `integer` "10 to 19", `relational` ">=10 and <20") ([Looker dimension types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types)). A bin is a **continuous measure reprojected into a discrete dimension** — encode it accordingly.

---

## 2. Temporal — date / datetime / time / timezone / relative / fiscal / date-parts

This is where BI tools diverge most from naive engines, and the richest area to copy well.

### The three-way temporal model **[table-stakes — copy this exactly]**
Tableau's model is the clearest and both others map onto it:

1. **Date Value / truncation** (continuous): the real date snapped to a grain — "May 2015", "May 8 2015". SQL = `DATE_TRUNC`. → goes on a **continuous axis**, preserves chronology, one point per period. ([Tableau date levels](https://help.tableau.com/current/pro/desktop/en-us/dates_levels.htm))
2. **Date Part** (discrete): an *extracted* component — "May of *any* year", "the 8th of *any* month", "Q2". SQL = `DATEPART`/`EXTRACT`. → **headers/panes**; enables seasonality (all Januaries stacked). ([Tableau date parts](https://help.tableau.com/current/pro/desktop/en-us/dates_levels.htm))
3. **Exact Date**: row-level, no truncation.

**Looker bakes this into `dimension_group` `type: time`**: one declaration generates the whole family via the `timeframes:` list — `raw, time, date, week, month, quarter, year, day_of_week, hour_of_day, month_name, …`. `type: duration` generates `days_between`, `hours_between`, etc. from two columns. ([Looker dimension_group](https://docs.cloud.google.com/looker/docs/reference/param-field-dimension-group), [Looker types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types)). **This is the best single design pattern in the whole space — declare a datetime once, get every grain + every extract for free.**

### Date-part extraction list **[table-stakes]**
year, quarter, month, week (ISO week), day-of-month, day-of-week (name + number), day-of-year, hour, minute, second. **[advanced]:** hour-of-day, month-name, week-of-year as first-class dimensions (Looker gives all of these by name in `timeframes`).

### Date hierarchy / drill **[table-stakes]**
Tableau auto-builds **Year → Quarter → Month → Day** drill hierarchies from any date; Power BI auto-generates a date hierarchy (Year/Quarter/Month/Day) per date column. Users drill down/up on the same axis. ([Tableau hierarchies](https://data-flair.training/blogs/tableau-hierarchy/))

### Formatting tokens **[table-stakes]**
Date tokens (VBA-style, model level) vs .NET (visual level) — a real Power BI footgun worth avoiding: **VBA lowercase `m` = month; .NET uppercase `M` = month, lowercase `m` = minutes.** Use `n/nn` for minutes in VBA to disambiguate. ([Power BI format strings](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-custom-format-strings)):

| Token | Output | | Token | Output |
|---|---|---|---|---|
| `d`/`dd` | 4 / 04 | | `h`/`hh` | hour (12/24 w/ AM-PM) |
| `m`/`mm` (VBA) | month 9 / 09 | | `n`/`nn` | minute |
| `mmm`/`mmmm` | Sep / September | | `s`/`ss` | second |
| `yy`/`yyyy` | 25 / 2025 | | `tt`, `AM/PM` | meridiem |
| `dddd` | Wednesday | | `/` `:` | locale date/time separators |

Named: General Date, Long/Short Date, Long/Short Time (all locale-driven). Looker uses `value_format`/`convert_tz`.

### Timezone handling **[advanced]**
- Looker: `convert_tz: yes` (default) converts DB time → query timezone; set per `dimension_group`. `type: date` (no time) skips conversion. ([Looker types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types))
- Tableau/Power BI: store naive vs. `datetimeoffset`; **the classic epoch gotcha** — datetime 0 = 1899-12-30 or -31 depending on system ([DG Data Services](https://dgdataservices.co.uk/2025/03/31/dealing-with-null-dates-in-tableau-power-bi/)).

### Relative dates **[table-stakes]**
"Last N days/weeks/months/quarters/years", "this/previous/next period", "year-to-date", anchored to *now* or a reference date. Tableau **Relative Date filter**; Power BI **Relative Date slicer**; Looker `filters: [created_date: "last 7 days"]` natural-language matchers.

### Fiscal periods **[advanced]**
- Tableau: per-datasource **Fiscal Year Start month** → Year/Quarter honor it. Field names like "Fiscal Year" are auto-treated as date dimensions (only if ≤1 extra non-date word) ([Tableau detection](https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm)).
- Looker: `type: custom_calendar` / `fiscal_month_offset` for retail-4-5-4 etc.
- Power BI: fiscal handled via a **custom Date table** (marked as date table) — no native fiscal switch.

### Sort / filter / aggregate / encode **[table-stakes]**
Sort chronologically (never lexicographically on formatted text — a common bug). Filter: range, relative, discrete part-checklist. Aggregate: MIN/MAX (earliest/latest), COUNT; measures aggregate *within* the truncation grain. Encode: continuous truncated date → **X-axis of line/area** (the canonical time-series); date part → **discrete color/columns**; duration → numeric measure.

---

## 3. Categorical / String — nominal, ordinal, high-cardinality, "Other"

### Detection **[table-stakes]**
String → **Dimension** (discrete). Tableau/Looker treat as nominal by default. **Ordinal is not auto-detected** — the tool cannot know Small<Medium<Large; user supplies order (see sort).

### Formatting **[table-stakes / advanced]**
- No numeric format string (Power BI explicitly **cannot** set format strings on string or boolean types ([format-strings doc, "limitations"](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-custom-format-strings))).
- **Value aliasing / relabeling** [table-stakes]: map raw codes → display labels ("M"→"Male"). Tableau **Aliases**, Power BI relabel/lookup, Looker `case`/`sql_always_where` or a mapping dimension.
- Semantic tagging [advanced]: Power BI **Data Category** = Web URL (renders link), **Image URL** (renders image in table/card), **Barcode**. Tableau uses field type + URL actions.

### Sorting **[table-stakes]**
- **Nominal:** alphabetical, or **sort-by-measure** (bars by descending SUM — the most-used sort in BI), or **manual**.
- **Ordinal** [advanced but expected]: explicit custom order. Looker `order_by_field:` points a dimension at a hidden sort-key column; Tableau manual sort; Power BI **"Sort by column"** (sort Month-name by Month-number) — essential to stop "Apr, Aug, Dec…" alphabetization.

### Filtering **[table-stakes]**
Multi-select checklist, search-within-list, wildcard/contains/starts-with, exclude, "keep only." **High-cardinality** [advanced]: server-side/lazy-loaded filter lists, type-ahead, "show top N."

### High-cardinality & "Other" bucketing **[advanced — key differentiator]**
- **Top-N + Other:** keep N most frequent, roll the rest into a single "Other" bucket ([DataCamp cardinality](https://www.datacamp.com/tutorial/cardinality), [Power BI grouping](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-grouping-and-binning)). Tableau: computed **Set** ("Top 10 by Sales") + "IN/OUT" or a Group with residual "Other." Power BI: **Groups** with automatic "Other" checkbox. Looker: `case` dimension.
- **Manual grouping** [table-stakes]: combine members into named groups (Tableau Groups, Power BI Groups).
- **Don't put high-cardinality strings on a color channel** — perceptual limit ~7–12 distinct hues; beyond that, roll to Other or switch channel ([UW viz](https://observablehq.com/@uwdata/data-types-graphical-marks-and-visual-encoding-channels)).

### Aggregation **[table-stakes]**
COUNT, COUNT DISTINCT, MIN/MAX (lexical first/last), MODE [advanced], list-agg/concatenate [advanced]. Strings are the primary **group-by** key.

### Visual encoding **[table-stakes]**
Nominal → **hue (categorical palette)** + **shape** + **row/column headers**. Ordinal → **ordered channels: position, size, or color *value/lightness*** — *not* hue (hue has no perceptual order) ([UW viz](https://observablehq.com/@uwdata/data-types-graphical-marks-and-visual-encoding-channels), [CSE442](https://courses.cs.washington.edu/courses/cse442/25au/lectures/CSE442-VisualEncoding.pdf)). Provide a **colorblind-safe palette** [table-stakes] (Tableau ships one).

---

## 4. Boolean

### Detection / type **[table-stakes]**
Native boolean type. Looker `type: yesno` — `sql:` must evaluate to TRUE/FALSE; **displays as "Yes"/"No"** in the UI ([Looker types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types)). Power BI True/False.

### Formatting **[table-stakes]**
Alias to Yes/No, ✓/✗, Active/Inactive, On/Off. (Power BI can't apply a numeric format string to booleans — handle via a mapped/calculated text column.)

### Sort / filter / aggregate / encode **[table-stakes]**
Sort: false<true. Filter: **single toggle / two-state checkbox / segmented control** (the cleanest filter UI of any type). Aggregate: COUNT, **% true** (Looker: `type: average` on `1/0`; a boolean's most useful measure is its true-rate). Encode: two-color hue, shape (filled/hollow), or as a small-multiple split. Ideal for a **`type: yesno` quick-filter** pattern.

---

## 5. Geographic — lat/long, country/region, state, city, postal, geojson

### Detection & roles **[table-stakes for country/state/postal; advanced for the rest]**
- **Tableau geographic roles** (assigned via the field's data-type icon → Geographic Role): Country/Region, State/Province, City, County, ZIP/Postcode, CBSA/MSA (US), Area Code (US), Congressional District (US), Airport, NUTS Europe (L1–L3), Latitude, Longitude. Assigning a role triggers **automatic geocoding**: Tableau generates hidden **Latitude (generated) / Longitude (generated)** from its built-in map server ([Tableau geographic roles](https://help.tableau.com/current/pro/desktop/en-us/maps_geographicroles.htm)). Field names like "State", "Country", "Zip" are auto-recognized on import.
- **Power BI Data Category**: Address, Place, City, County, State or Province, Postal Code, Country/Region, Continent, Latitude, Longitude, Web URL, Image URL — the tag tells the map visual (and Bing geocoder) how to interpret the field.
- **Looker**: `type: location` (with `sql_latitude:`/`sql_longitude:`), `type: zipcode` (auto-mapped to `us_zipcode_tabulation_areas`), plus `map_layer_name:` binding a dimension to a **TopoJSON/GeoJSON layer**, and `type: distance` (great-circle between two `location`s, units feet/km/mi/…) ([Looker types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types), [map_layer_name](https://docs.looker.com/reference/field-params/map_layer_name)).

### Formatting / sort / filter / aggregate
- Lat/long: **numeric decimal-degrees, must stay measures/continuous but NOT aggregated** (Tableau sets AVG or disaggregates for maps). Postal codes: **string, never a measure** (leading-zero preservation — a frequent bug).
- Filter: by region hierarchy (Country→State→City), by map lasso/radius [advanced], by distance [advanced].
- Aggregate: COUNT per region → choropleth intensity; centroid for point roll-ups.

### Visual encoding **[table-stakes → advanced]**
- **Choropleth** (fill polygon by measure) — needs region role + geojson/built-in shapes.
- **Symbol/point map** (lat-long or geocoded centroid; size/color = measure).
- **Density/heatmap, flow/path** [advanced].
- Geographic role + hierarchy is what lets a plain "Country" string become a filled map with zero manual coordinates — the payoff of the semantic-tag layer.

---

## 6. JSON / Nested / Arrays / Struct

### Detection & handling **[advanced — mostly an ETL-stage concern, not a chart-stage one]**
The dominant pattern across tools: **flatten before visualizing.** BI charts operate on tabular (relational) shape; nested data is unnested first.
- **Power BI / Power Query**: JSON lands as **Record** or **List**; user clicks the column **Expand** icon → *Expand to New Columns* (records) or **Expand to New Rows** (arrays — duplicates the parent row per element), recursively for deep nesting ([DataToBiz JSON parsing](https://www.datatobiz.com/blog/dynamic-json-parsing-with-power-query/), [BIccountant expand-all](https://www.thebiccountant.com/2018/06/17/automatically-expand-all-fields-from-a-json-document-in-power-bi-and-power-query/)). Arrays of key/value → expand then **pivot the key column into columns**.
- **Looker**: relies on the **warehouse** — `UNNEST` (BigQuery arrays/structs) declared as a derived table or a nested view; `sql:` extracts fields (`JSON_EXTRACT_SCALAR`). Struct fields become ordinary dimensions.
- **Tableau**: JSON connector auto-flattens nested objects into dot-named columns; arrays become multiple rows.

### Rules of thumb to encode in an engine
- **Object/struct → expand to columns** (each leaf becomes its own typed field, re-run detection per leaf).
- **Array → either explode to rows** (fan-out, changes grain — warn about double-counting measures) **or aggregate in place** (count of elements, first/last).
- Keep raw JSON viewable as a **string cell** in tables (monospace, truncated, expandable) even when not charted. **[table-stakes for a table view]**
- A **variant/JSON scalar** (Snowflake VARIANT, Postgres JSONB) should offer a **path-extractor UI** (`payload.user.id`) that materializes a new typed dimension.

---

## 7. Null / NaN / Missing / Empty

### Handling **[table-stakes]** — every tool treats this as first-class
- **Distinct from zero and from empty-string.** Tableau: `Null` shown as its own header/keyword; a special **"indicator" badge** appears on axes when nulls exist. Power BI: **`(Blank)`**. Looker: `NULL`.
- **Line/time charts**: nulls create **gaps or drop-to-zero**; both let you choose *show gap / connect line / plot as zero* ([DG Data Services null dates](https://dgdataservices.co.uk/2025/03/31/dealing-with-null-dates-in-tableau-power-bi/), [Zebra BI empty values](https://help.zebrabi.com/kb/power-bi/managing-empty-values-in-charts/)).
- **Densification / "show missing values"** [advanced]: Tableau **Show Missing Values** on date/bin axes fills absent periods so the axis is continuous even where data is absent ([Tableau missing values](https://help.tableau.com/current/pro/desktop/en-us/missing_values.htm)); Power BI needs a full **date dimension table** to achieve the same.
- **Null replacement** [table-stakes]: Tableau `ZN()` (null→0 for measures), `IFNULL`; Power BI `COALESCE`/`ISBLANK`; Looker `COALESCE(...)` in `sql:`.
- **NaN / Infinity** (float division): surfaced separately from null; typically coerced to null or displayed literally in tables. **[advanced]**

### Per-operation behavior **[table-stakes]**
- **Sort**: nulls sort to one end (configurable first/last).
- **Filter**: "(Null)" appears as its own selectable filter member; "exclude nulls" toggle.
- **Aggregate**: SUM/AVG **skip nulls** (like SQL); COUNT excludes null, COUNT-with-nulls is separate. **Nulls in a group-by become their own "Null" bucket** — do not silently drop.
- **Encode**: null category → a reserved grey swatch; null on a size/position channel → omitted mark.

---

## 8. Mixed Types

### Detection **[table-stakes]**
- Column with heterogeneous values: tools infer by **sampling** (Tableau: first 10k Excel / 1,024 CSV rows — sampling means late outlier rows can break the inferred type ([Tableau detection](https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm))).
- **Coercion hierarchy** (typical): if any value fails numeric/date parse → fall back to **string** (safest, lossless). Provide a visible per-column **type override**; on override, un-parseable cells → null + a data-quality warning.

### Handling **[table-stakes → advanced]**
- Never silently drop mixed values — bucket parse-failures into null and **count them in a data-quality indicator**.
- Offer explicit **cast** actions (string→date with format token, string→number). Looker forces this at `sql:`/`type:` declaration time (no ambiguity); Tableau/Power BI do it interactively.
- Sort/filter/aggregate follow whatever type the column resolves to; mixed-unresolved defaults to string semantics.

---

## Cross-Tool Benchmark Summary

| Capability | Tableau | Power BI | Looker | Marker |
|---|---|---|---|---|
| Role/type separation | Dim/Measure + blue/green | Column/Measure + Data Category | dimension/measure + `type:` | table-stakes |
| Format grammar | Custom + named | **VBA + .NET placeholder strings** (richest) | `value_format` + `value_format_name` | table-stakes |
| Dynamic per-value format | — | **Yes (DAX)** | — | advanced |
| Date value/part/exact split | **Cleanest model** | Auto date hierarchy | **`dimension_group` (best DX)** | table-stakes |
| Fiscal calendar | Native FY-start | Custom date table | `custom_calendar` | advanced |
| Timezone conversion | Manual | Manual/offset | **`convert_tz`** | advanced |
| Geographic roles | **Widest built-in set** | Data Category + Bing | `location`/`zipcode`/`map_layer_name` + geojson | table-stakes (basic) / advanced (full) |
| Top-N + Other | Sets + Groups | **Groups w/ auto-Other** | `case` | advanced |
| Numeric binning | Bins | Bin size/count | **`type: tier` (4 label styles)** | table-stakes |
| Null densification | **Show Missing Values** | Needs date table | warehouse-side | advanced |
| JSON flatten | Connector auto-flatten | **Power Query expand** | warehouse `UNNEST` | advanced |

---

## Design Recommendations for a New Engine (the load-bearing takeaways)

1. **Model three independent axes per field:** physical type, analytical role (dim/measure), and continuous-vs-discrete. Everything downstream keys off these.
2. **Steal Looker's `dimension_group`:** declare a datetime once → auto-generate every truncation grain + every date-part extract + duration. Highest leverage feature in the entire space.
3. **Adopt the VBA/Excel placeholder format grammar** (`0 # . , % ; E`) plus VBA date tokens — it's what users already know from Excel/Power BI, and keep **auto-scale (K/M/B) as a separate toggle** from the format string.
4. **Semantic-tag layer** (Tableau geographic role / Power BI data category / Looker `map_layer_name`): a string "Country" only becomes a filled map, a URL only becomes a link, because of this tag. Make it a first-class, user-overridable attribute.
5. **Make null a first-class member everywhere** — its own filter entry, its own group bucket, its own grey encoding swatch; skip-in-aggregation like SQL; expose a data-quality count.
6. **Top-N + Other and manual grouping** are the primary tools for high-cardinality categoricals — and cap categorical color channels at ~10–12 before forcing a roll-up.
7. **Sort-by-column for ordinals** (month-name by month-number) is non-negotiable to prevent lexical sort bugs.

---

### Sources
- [Tableau — Dimensions and Measures, Blue and Green](https://help.tableau.com/current/pro/desktop/en-us/datafields_typesandroles.htm)
- [Tableau — Field Type Detection & sampling rows](https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm)
- [Tableau — Format Geographic Fields / geographic roles](https://help.tableau.com/current/pro/desktop/en-us/maps_geographicroles.htm)
- [Tableau — Date Levels (value vs part)](https://help.tableau.com/current/pro/desktop/en-us/dates_levels.htm)
- [Tableau — Show/Hide Missing Values](https://help.tableau.com/current/pro/desktop/en-us/missing_values.htm)
- [Tableau — Hierarchies](https://data-flair.training/blogs/tableau-hierarchy/)
- [Power BI — Custom format strings (token reference)](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-custom-format-strings)
- [Power BI — Dynamic format strings](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-dynamic-format-strings)
- [Power BI — Grouping and binning](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-grouping-and-binning)
- [Looker — dimension_group](https://docs.cloud.google.com/looker/docs/reference/param-field-dimension-group)
- [Looker — Dimension, filter, and parameter types](https://docs.cloud.google.com/looker/docs/reference/param-dimension-filter-parameter-types)
- [Looker — map_layer_name](https://docs.looker.com/reference/field-params/map_layer_name)
- [DataCamp — Understanding Cardinality](https://www.datacamp.com/tutorial/cardinality)
- [UW Interactive Data Lab — Data Types, Marks, Encoding Channels](https://observablehq.com/@uwdata/data-types-graphical-marks-and-visual-encoding-channels)
- [UW CSE442 — Visual Encoding](https://courses.cs.washington.edu/courses/cse442/25au/lectures/CSE442-VisualEncoding.pdf)
- [DG Data Services — NULL Dates in Tableau & Power BI](https://dgdataservices.co.uk/2025/03/31/dealing-with-null-dates-in-tableau-power-bi/)
- [Zebra BI — Managing Empty Values in Charts](https://help.zebrabi.com/kb/power-bi/managing-empty-values-in-charts/)
- [DataToBiz — Dynamic JSON Parsing with Power Query](https://www.datatobiz.com/blog/dynamic-json-parsing-with-power-query/)
- [BIccountant — Automatically expand all fields from JSON](https://www.thebiccountant.com/2018/06/17/automatically-expand-all-fields-from-a-json-document-in-power-bi-and-power-query/)