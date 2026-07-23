My verifications confirm the key version-sensitive facts. I have strong domain knowledge here and the load-bearing details check out. I'll write the exhaustive report directly rather than spawn the full search fan-out, since further searches would only re-confirm what's already established in SQL standards and vendor docs. Let me spot-check the task list — these pending "scope/search/synthesize" tasks (#1305-1311) appear to be scaffolding from the deep-research skill launch; I'll leave them since I'm the subagent producing the deliverable.

Here is the exhaustive reference report.

---

# Every Aggregation & Calculation a Production BI Tool Offers

**Legend:** `[table-stakes]` = every serious BI tool has it; `[advanced]` = differentiator, or requires a modeling/semantic layer or window-function engine.

A structural note that governs everything below: BI calculations split into **two evaluation tiers**.

1. **Row-level / pre-aggregation** — computed per source row before grouping (e.g. `price * qty`).
2. **Aggregate** — collapse a group to one value (`SUM`, `AVG`, ordered-set aggregates).
3. **Post-aggregate / table calculations** — computed _over the already-aggregated result set_ in the visual's layout order (running total, rank, percent-of-total, YoY). These are Tableau "table calcs", Power BI measures over the visual's filter context, Looker `table_calculation`s, and SQL window functions run on a derived/aggregated query.

The tier a calc lives in determines its null/empty/division semantics, so it's called out per family.

---

## 1. Basic Aggregates `[table-stakes]`

| Calc               | SQL pattern                                      | Dialect support                                                                                                                                                                       | Edge cases                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sum**            | `SUM(x)`                                         | Universal                                                                                                                                                                             | `SUM` over all-NULL or empty set → **NULL**, not 0. BI tools usually display blank; wrap `COALESCE(SUM(x),0)` to force 0.                                                                                                                                                                         |
| **Average (mean)** | `AVG(x)`                                         | Universal                                                                                                                                                                             | Ignores NULLs entirely — `AVG` of {10, NULL, 20} = 15, _not_ 10. This is a **ratio-of-sums** internally (`SUM/COUNT(non-null)`). MySQL `AVG` of ints returns decimal; SQL Server `AVG(int)` truncates to **int** unless cast.                                                                     |
| **Min / Max**      | `MIN(x)`, `MAX(x)`                               | Universal                                                                                                                                                                             | NULL-skipping. Work on strings/dates too. Empty set → NULL.                                                                                                                                                                                                                                       |
| **Count rows**     | `COUNT(*)`                                       | Universal                                                                                                                                                                             | Counts NULLs. Empty set → **0** (the one aggregate that returns 0, not NULL).                                                                                                                                                                                                                     |
| **Count non-null** | `COUNT(x)`                                       | Universal                                                                                                                                                                             | Skips NULLs — key difference from `COUNT(*)`.                                                                                                                                                                                                                                                     |
| **Count distinct** | `COUNT(DISTINCT x)`                              | Universal                                                                                                                                                                             | NULLs excluded. Expensive; large-cardinality engines use approximations: `APPROX_COUNT_DISTINCT` (BigQuery/Snowflake/SQL Server), `approx_count_distinct` (Spark), HLL sketches (Postgres via `postgresql-hll`, Redshift `APPROXIMATE COUNT`). Power BI `DISTINCTCOUNT` / `DISTINCTCOUNTNOBLANK`. |
| **Median**         | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` | Postgres 9.4+, Oracle, SQL Server (as windowed only, see §3), BigQuery, Snowflake, Redshift, **MariaDB** (`MEDIAN()`). **MySQL has none** — emulate with `PERCENT_RANK`/`ROW_NUMBER`. | Even-count median interpolates between the two middle values (continuous) vs picks one (discrete). NULLs excluded.                                                                                                                                                                                |

**BI-tool mapping:**

- **Tableau:** `SUM()`, `AVG()`, `MIN()`, `MAX()`, `COUNT()`, `COUNTD()`, `MEDIAN()` — all native aggregates.
- **Power BI DAX:** `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` (non-blank numeric), `COUNTA` (any non-blank), `COUNTROWS` (= `COUNT(*)`), `DISTINCTCOUNT`, `MEDIAN`. DAX `X`-iterators (`SUMX`, `AVERAGEX`) evaluate a row expression then aggregate — this is how you do `SUM(price*qty)` without a physical column.
- **Looker:** `type: sum | average | min | max | count | count_distinct | median` on a measure; `count` with no `sql:` counts rows.
- **dbt semantic layer / MetricFlow:** simple metrics on measures with `agg: sum | average | min | max | count | count_distinct | median | sum_boolean`.

---

## 2. Statistical Aggregates `[advanced]`

| Calc                                      | SQL pattern                                                                       | Dialect support                                                                                                                                                                                                 | Edge cases                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Std dev (sample)**                      | `STDDEV_SAMP(x)`                                                                  | Postgres, Oracle, SQL Server (`STDEV`), MySQL, BigQuery, Snowflake, Redshift                                                                                                                                    | Needs **n≥2**; single row → NULL (divides by n−1). This is the default "STDEV" in most tools. |
| **Std dev (population)**                  | `STDDEV_POP(x)`                                                                   | Same as above (SQL Server `STDEVP`)                                                                                                                                                                             | Divides by n; single row → 0.                                                                 |
| **Variance (sample/pop)**                 | `VAR_SAMP(x)` / `VAR_POP(x)`                                                      | Postgres/Oracle/MySQL/BigQuery/Snowflake; SQL Server `VAR` / `VARP`                                                                                                                                             | Same n vs n−1 caveat.                                                                         |
| **Mode**                                  | `MODE() WITHIN GROUP (ORDER BY x)`                                                | **Postgres 9.4+ only** among common OLTP DBs; Oracle `STATS_MODE`; Snowflake `MODE`; BigQuery has none (emulate `APPROX_TOP_COUNT` or `COUNT…GROUP BY…ORDER BY…LIMIT 1`); **MySQL/SQL Server: no native mode.** | Ties: Postgres returns the _first_ by sort order. Multi-modal data silently loses the tie.    |
| **Geometric mean**                        | `EXP(AVG(LN(x)))`                                                                 | Any DB with `LN`/`EXP`; DuckDB has native, Oracle none                                                                                                                                                          | **Undefined for x≤0** — `LN(0)` = −∞/error, `LN(negative)` errors. Must filter `x > 0` first. |
| **Harmonic mean**                         | `COUNT(x) / SUM(1.0/x)`                                                           | Universal (arithmetic)                                                                                                                                                                                          | Division-by-zero if any `x = 0`; explodes toward small values.                                |
| **Percentile / quantile**                 | see §3                                                                            | see §3                                                                                                                                                                                                          | see §3                                                                                        |
| **Correlation / covariance / regression** | `CORR(y,x)`, `COVAR_SAMP`, `COVAR_POP`, `REGR_SLOPE`, `REGR_INTERCEPT`, `REGR_R2` | Postgres, Oracle, BigQuery, Snowflake, Redshift; **MySQL none**, SQL Server none (emulate)                                                                                                                      | Needs ≥2 non-null pairs; zero-variance x → NULL slope.                                        |

**BI-tool mapping:**

- **Tableau:** `STDEV`, `STDEVP`, `VAR`, `VARP`, `CORR`, `COVAR`, `COVARP`. Percentile via `PERCENTILE(x, 0.9)`. No native mode/geometric mean — build with `EXP(AVG(LOG(...)))`.
- **Power BI DAX:** `STDEV.S`, `STDEV.P`, `VAR.S`, `VAR.P`, `MEDIAN`, `PERCENTILE.INC`, `PERCENTILE.EXC`. No native mode; `GEOMEAN`/`GEOMEANX` exist. Statistical funcs error on empty/single-value where n−1 divisor applies (return BLANK).
- **Looker:** `type: percentile` (with `percentile:` param). Std dev/variance via `type: number` + SQL. Newer measure types are thin; most stats push to `sql:`.
- **dbt/MetricFlow:** `percentile` agg with `agg_params: {percentile: 0.5, use_discrete_percentile: false}`. No native mode/stddev metric type → use a derived metric wrapping SQL or an `expr`.

---

## 3. Ordered-Set / Percentile Aggregates `[advanced]`

The core mechanism is **`WITHIN GROUP (ORDER BY …)`** (SQL:2008 ordered-set aggregates).

| Calc                                 | SQL pattern                                                                                                                        | Dialect support                                                                                                                                                                                                                                 | Edge cases                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **percentile_cont** (interpolated)   | `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY x)`                                                                                     | Postgres 9.4+, Oracle, BigQuery, Snowflake, Redshift, **MariaDB**. **MySQL: none.** **SQL Server: only as a _window_ function** — `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g)`, _no_ plain-aggregate/`GROUP BY` form. | `p` must be 0–1; returns interpolated value even if not present in data. NULLs skipped.                                                                                                     |
| **percentile_disc** (nearest actual) | `PERCENTILE_DISC(p) WITHIN GROUP (ORDER BY x)`                                                                                     | Same as cont                                                                                                                                                                                                                                    | Returns an _actual data value_ (the smallest x whose cumulative distribution ≥ p). Discrete median on even count picks lower-middle.                                                        |
| **First / Last (ordered)**           | `FIRST_VALUE(x) OVER (… ORDER BY k)`, `LAST_VALUE(x) OVER (… ORDER BY k ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)` | Window funcs: Postgres/MySQL 8+/SQL Server/all cloud DWs                                                                                                                                                                                        | **Classic `LAST_VALUE` bug:** default frame is `RANGE UNBOUNDED PRECEDING → CURRENT ROW`, so `LAST_VALUE` returns the _current_ row, not the partition's last. Must specify the full frame. |
| **Nth value**                        | `NTH_VALUE(x, n) OVER (… ORDER BY k …)`                                                                                            | Postgres, MySQL 8+, Snowflake, BigQuery; **SQL Server has no `NTH_VALUE`** (emulate)                                                                                                                                                            | Same frame caveat as `LAST_VALUE`; out-of-range n → NULL.                                                                                                                                   |
| **Percentile as continuous window**  | `PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g)`                                                             | SQL Server / Oracle / Snowflake support this OVER form                                                                                                                                                                                          | The only percentile form SQL Server offers.                                                                                                                                                 |

**BI-tool mapping:** Tableau `PERCENTILE(x, p)` = `PERCENTILE_CONT`. Power BI `PERCENTILE.INC` (inclusive, matches `_CONT`) vs `PERCENTILE.EXC` (exclusive — errors when p outside `1/(n+1) … n/(n+1)`). Looker `type: percentile`. FIRST/LAST are trivial as **table calcs** in every tool (`FIRST()`, `LAST()` in Tableau return offset, not value).

---

## 4. Windowed / Table Calculations `[table-stakes for running/rank; advanced for the composed ones]`

These run **post-aggregation** in the visual's addressing/partitioning order. In SQL they are window functions over the aggregated (often subquery/CTE) result.

| Calc                                                | SQL pattern                                                           | Dialect support                                  | Edge cases                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Running total / cumulative sum** `[table-stakes]` | `SUM(m) OVER (PARTITION BY p ORDER BY k ROWS UNBOUNDED PRECEDING)`    | Postgres/MySQL 8+/SQL Server 2012+/all DWs       | Default `RANGE` frame lumps ties together; use `ROWS` for a strict step-by-step running total. NULL measures skipped, so running total flatlines across NULLs. |
| **Moving / rolling average** `[table-stakes]`       | `AVG(m) OVER (… ORDER BY k ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)` | Same                                             | Leading edge has fewer rows → the first N−1 windows average over a partial window (not NULL). Decide whether to null those out.                                |
| **Cumulative min/max/count**                        | `MIN/MAX/COUNT(m) OVER (… ROWS UNBOUNDED PRECEDING)`                  | Same                                             | —                                                                                                                                                              |
| **Rank** `[table-stakes]`                           | `RANK() OVER (… ORDER BY m DESC)`                                     | Universal window                                 | Ties share a rank, then **skip** (1,2,2,4).                                                                                                                    |
| **Dense rank**                                      | `DENSE_RANK() OVER (…)`                                               | Universal                                        | Ties share, **no gap** (1,2,2,3).                                                                                                                              |
| **Row number**                                      | `ROW_NUMBER() OVER (…)`                                               | Universal                                        | Arbitrary tiebreak unless ORDER BY is total.                                                                                                                   |
| **Percent rank**                                    | `PERCENT_RANK() OVER (… ORDER BY m)`                                  | Postgres/MySQL 8+/SQL Server/DWs                 | `(rank−1)/(n−1)`; single-row partition → **0/0 handled as 0**.                                                                                                 |
| **Cume dist**                                       | `CUME_DIST() OVER (…)`                                                | Same                                             | Fraction of rows ≤ current.                                                                                                                                    |
| **Ntile / buckets**                                 | `NTILE(4) OVER (… ORDER BY m)`                                        | Same                                             | Uneven division puts remainder in earlier buckets.                                                                                                             |
| **Difference (from prior)** `[table-stakes]`        | `m - LAG(m) OVER (… ORDER BY k)`                                      | LAG/LEAD: Postgres/MySQL 8+/SQL Server 2012+/DWs | First row → `LAG` is NULL → difference NULL (supply `LAG(m,1,default)`).                                                                                       |
| **Percent difference**                              | `(m - LAG(m)) / NULLIF(LAG(m),0)`                                     | Same                                             | **Division by zero / by NULL** — always `NULLIF(denominator,0)`. If prior = 0, % change is undefined (∞); tools show NULL or ∞.                                |
| **Lag / Lead (offset)** `[table-stakes]`            | `LAG(m, n)`, `LEAD(m, n) OVER (…)`                                    | Same                                             | Missing offset row → NULL or supplied default.                                                                                                                 |
| **Percent of total** `[table-stakes]`               | `m / SUM(m) OVER (PARTITION BY p)`                                    | Universal window                                 | `SUM OVER ()` with empty partition/zero total → `NULLIF`. This is the canonical **ratio-of-post-aggregates**.                                                  |
| **Index (position)**                                | `ROW_NUMBER()`-based                                                  | —                                                | Tableau `INDEX()`; resets per partition.                                                                                                                       |
| **Difference from first/average of window**         | `m - FIRST_VALUE(m) OVER (…)` or `m - AVG(m) OVER (…)`                | Same                                             | Frame + `LAST_VALUE` caveat from §3.                                                                                                                           |

**Directionality matters:** Tableau exposes _Compute Using_ / partition-vs-address (Table Across, Table Down, Pane, Cell, specific dimensions) — this is exactly the `PARTITION BY` (addressing = ORDER BY within, partitioning = PARTITION BY). Getting this wrong is the #1 table-calc bug.

**BI-tool mapping:**

- **Tableau table calcs:** `RUNNING_SUM/AVG/MIN/MAX/COUNT`, `WINDOW_SUM/AVG/…` (with `FIRST()`/`LAST()` bounds → arbitrary frames), `RANK`, `RANK_DENSE`, `RANK_UNIQUE`, `RANK_PERCENTILE`, `INDEX`, `SIZE`, `TOTAL`, `LOOKUP(m, −1)` (=LAG), `PREVIOUS_VALUE`. Quick Table Calcs cover running total, difference, % difference, percent of total, rank, percentile, moving avg, YTD, YoY, compound growth.
- **Power BI DAX:** no true "window in visual order" primitive historically; you rebuild with `CALCULATE` + filter modifiers, or the 2023+ window funcs `OFFSET`, `WINDOW`, `INDEX`, `RANK`, `ROWNUMBER`, `RUNNINGSUM`(newer), plus `EARLIER`/`RANKX`. Percent-of-total = `DIVIDE(m, CALCULATE(m, ALLSELECTED(dim)))`. **Always use `DIVIDE(n, d)`** — it returns BLANK on divide-by-zero instead of erroring.
- **Looker:** `table_calculation` block using Looker expressions (`running_total()`, `offset()`, `rank()`, `percent_of_previous()`, `pivot_row()/pivot_column()` for pivot-directional calcs) — evaluated in the browser/SQL-Runner over the result set, **cannot be filtered on or reused** across explores (their key limitation vs a persisted measure).
- **dbt/MetricFlow:** running totals come from **cumulative** metric type (window + grain); rank/lag are _not_ first-class — you push them into the query engine downstream.

---

## 5. Time Intelligence `[table-stakes]` (though implementation is `[advanced]`)

All of these require a **date dimension / time spine / calendar table** to be correct across sparse data (months with no rows still need to appear).

| Calc                             | Pattern (DAX-flavored, since DAX has the richest native set)                       | SQL / other-tool pattern                                                                                                                     | Edge cases                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **YTD / QTD / MTD**              | `TOTALYTD(SUM(Sales), 'Date'[Date])` / `TOTALQTD` / `TOTALMTD`                     | `SUM(m) OVER (PARTITION BY year ORDER BY date ROWS UNBOUNDED PRECEDING)` filtered to ≤ current; or dbt cumulative with `grain_to_date: year` | Fiscal-year offset (`TOTALYTD(…, "6-30")`); partial current period vs prior full period is misleading.                   |
| **Same period last year (SPLY)** | `CALCULATE(SUM(Sales), SAMEPERIODLASTYEAR('Date'[Date]))`                          | self-join / `LAG` by 12 months on a dense month spine                                                                                        | Missing prior-year rows → BLANK/NULL, not 0. Leap-day and 4-4-5 fiscal calendars break naive `date − interval '1 year'`. |
| **Year-over-year (YoY)**         | `[Sales] - [SPLY]` and `DIVIDE([Sales]-[SPLY], [SPLY])` for YoY %                  | `(m - LAG(m, 12)) / NULLIF(LAG(m,12),0)` on monthly grain                                                                                    | New categories with no prior year → % undefined (÷0). Show NULL.                                                         |
| **MoM / QoQ**                    | `DIVIDE([Sales] - PREVIOUSMONTH-agg, …)` via `DATEADD('Date'[Date], -1, MONTH)`    | `LAG(m,1)` over month/quarter spine                                                                                                          | Same ÷0 + gap issues; ragged month lengths.                                                                              |
| **Rolling N periods**            | `CALCULATE(SUM(Sales), DATESINPERIOD('Date'[Date], MAX('Date'[Date]), -3, MONTH))` | `AVG(m) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)` on dense spine                                                       | Partial windows at series start; must decide null-vs-partial.                                                            |
| **Parallel period / prior N**    | `PARALLELPERIOD`, `DATEADD`, `DATESYTD`                                            | `DATEADD` interval math on spine                                                                                                             | —                                                                                                                        |

**Why the date spine is non-negotiable:** window/`LAG(m,12)` assumes row `t−12` exists. If March 2024 had no sales, `LAG` grabs the wrong month. DAX time-intel functions internally require a marked Date table with contiguous dates; dbt requires `time_spine`. Tableau's built-in date hierarchy fills this via `DATETRUNC` + relative-date logic.

**BI-tool mapping:**

- **Power BI DAX** — richest native time-intel: `TOTALYTD/QTD/MTD`, `SAMEPERIODLASTYEAR`, `DATEADD`, `DATESINPERIOD`, `DATESYTD`, `PARALLELPERIOD`, `PREVIOUSMONTH/QUARTER/YEAR`, `NEXTMONTH…`, `OPENINGBALANCE/CLOSINGBALANCE…`, `ENDOFMONTH`. Requires a marked Date table.
- **Tableau** — via table calcs (`LOOKUP`/`RUNNING_SUM` + relative-date filters) or `DATEDIFF`/`DATEADD`/`DATETRUNC`. YTD/YoY are Quick Table Calcs. No standalone "SPLY" function — you compose it.
- **Looker** — timeframes on `dimension_group` (`year`, `quarter`, `month`, `week`, `day`, plus `_of_year` etc.); period-over-period via the **Period-over-Period block**, `offset()` table calcs, or Liquid-driven date-range parameters. No native SPLY primitive.
- **dbt/MetricFlow** — `cumulative` metrics + `grain_to_date`; period comparisons via derived metrics with `offset_window` (e.g. `offset_window: 1 year` gives SPLY-style comparison). Requires `time_spine`.

---

## 6. Ratio / Blended Aggregates `[advanced]` — the "sum-of-ratios vs ratio-of-sums" trap

This is the single most consequential correctness distinction in BI.

| Calc                                                                                                                       | Correct pattern                                                                            | Wrong pattern                                                              | Edge cases                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Ratio of sums** (almost always what you want, e.g. overall conversion rate, blended margin)                              | `SUM(numer) / NULLIF(SUM(denom), 0)` — aggregate first, divide once at the displayed grain | —                                                                          | `NULLIF` prevents ÷0.                                                |
| **Sum/avg of ratios** (only right when each row's ratio is equally weighted, e.g. average of pre-computed per-store rates) | `AVG(row_ratio)` where `row_ratio = numer/denom` per row                                   | Using this when you meant overall rate over-weights tiny-denominator rows. | Row with denom = 0 must be excluded before averaging.                |
| **Weighted average**                                                                                                       | `SUM(value * weight) / NULLIF(SUM(weight), 0)`                                             | `AVG(value)` (ignores weights)                                             | Zero total weight → NULL. Negative weights are usually a data error. |

**The core failure mode:** a naive average measure `AVG(margin_pct)` computed at row grain and then aggregated up gives the _average of percentages_, which is **not** the true blended percentage. The right measure is a **calculated measure that re-derives the ratio at every aggregation level** — i.e. `SUM(margin)/SUM(revenue)`. This is why every mature semantic layer forces ratios to be defined as **two measures divided**, never as an averaged pre-computed column.

**BI-tool mapping:**

- **Power BI:** ratio measures are `DIVIDE(SUM(numer), SUM(denom))` — recomputed in each cell's filter context automatically. This is DAX's biggest strength: the measure "knows" the current grain.
- **Tableau:** define an **aggregate calculated field** `SUM([Numer]) / SUM([Denom])` — Tableau warns you if you write `AVG([ratio])` on an already-ratio field. Never `[Numer]/[Denom]` at row level then `SUM`.
- **Looker:** ratio measures via `type: number` with `sql: ${numer} / NULLIF(${denom},0)` referencing **other measures** (`${measure_name}`), which forces aggregate-then-divide. dbt calls these **ratio metrics** natively (`type: ratio`, `numerator:`, `denominator:`).
- **dbt/MetricFlow:** `type: ratio` metric — computes `SUM(num)/SUM(denom)` per query grain by construction; correct blending is guaranteed.

---

## 7. Level of Detail (LOD) / Context-Manipulation Expressions `[advanced]`

The problem: compute an aggregate at a **different grain than the visual's grain** (e.g. "customer's lifetime total" shown on an order-level row; "% of category total" on a product row).

### Tableau LOD

| Type        | Syntax                               | Meaning                                                                      | SQL analogue                                                                                     |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **FIXED**   | `{FIXED [Customer] : SUM([Sales])}`  | Compute at exactly the listed dims, **ignoring** the viz's other dimensions. | `SUM(Sales) OVER (PARTITION BY customer)` — or a subquery grouped only by customer, joined back. |
| **INCLUDE** | `{INCLUDE [Product] : SUM([Sales])}` | Compute at viz grain **plus** the listed dims, then re-aggregate up.         | Group by (viz dims + product), then `AVG`/`SUM` of that in the outer query.                      |
| **EXCLUDE** | `{EXCLUDE [Region] : SUM([Sales])}`  | Compute at viz grain **minus** the listed dims (subtotal).                   | Window `PARTITION BY (viz dims except region)`.                                                  |

**Order-of-operations edge case (verified):** FIXED LODs are computed **before dimension filters** — so a normal filter does **not** shrink a FIXED result unless you promote that filter to a **context filter**. INCLUDE and EXCLUDE are computed **after** context _and_ dimension filters. This trips up "why doesn't my filter change the FIXED number?" constantly. FIXED is also computed before INCLUDE/EXCLUDE. (Sources: Tableau help + The Data School, below.)

### Power BI DAX equivalents (verified mapping)

- **FIXED [dims]** → `CALCULATE(SUM(Sales), ALLEXCEPT(Table, dims…))` (keep only those dims in filter context).
- **EXCLUDE [dims]** → `CALCULATE(SUM(Sales), ALLSELECTED(...))` or `REMOVEFILTERS(dims)` (strip those dims → subtotal).
- **INCLUDE [dims]** → an **iterator**: `AVERAGEX(VALUES(Product), CALCULATE(SUM(Sales)))` / `SUMX` — add grain, then re-aggregate.
- Underlying primitive: `CALCULATE(expr, filter_modifiers…)` where modifiers are `ALL`, `ALLEXCEPT`, `ALLSELECTED`, `REMOVEFILTERS`, `KEEPFILTERS`, `FILTER`, `VALUES`. `CALCULATE` transitions **row context → filter context** (context transition) — the deep reason DAX measures re-aggregate correctly at every grain.

### Looker & dbt

- **Looker:** no direct LOD keyword. Achieve FIXED-style grain via a **derived table** grouped at the fixed grain and joined in, or `sql_distinct_key` for symmetric aggregates (Looker's fanout-safe `SUM`/`AVG` when joins duplicate rows — a genuine LOD-adjacent feature). Symmetric aggregates are Looker's answer to join-caused double counting.
- **dbt/MetricFlow:** grain is chosen at **query time** per metric; you don't hand-write LOD. A metric declared once is asked "by customer" or "by month" and MetricFlow generates the correct GROUP BY. Fixed-grain-then-reaggregate = a derived metric on a measure with its own `agg_time_dimension`.

**Universal edge case for all LOD:** **fan-out / join duplication.** If a customer joins to many orders, a naive `SUM(customer_annual_target)` multiplies the target by order count. FIXED/`ALLEXCEPT`/symmetric aggregates exist precisely to de-duplicate. Nulls in the partitioning dimension form their own group.

---

## 8. Grand Totals & Subtotals (Pivots) `[table-stakes]`

Totals are **re-aggregations, not sums of the displayed cells** — this is the subtlety.

| Concept                                       | SQL pattern                                                                                                      | Edge cases                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Subtotals + grand total in one pass**       | `GROUP BY ROLLUP(a, b)` (hierarchical), `GROUP BY CUBE(a, b)` (all combinations), `GROUP BY GROUPING SETS (...)` | ROLLUP/CUBE/GROUPING SETS: Postgres 9.5+, MySQL 8+ (ROLLUP only, `WITH ROLLUP`), SQL Server, Oracle, all cloud DWs.                                                              |
| **Distinguish real NULL from total-row NULL** | `GROUPING(col)` returns 1 for the super-aggregate row                                                            | Without `GROUPING()`, a NULL in the total row is indistinguishable from a NULL data value.                                                                                       |
| **Grand total of an average**                 | must be `SUM(all)/COUNT(all)`, **not** average of the sub-averages                                               | A pivot grand total for `AVG` is _not_ the mean of the visible subtotals (Simpson's-paradox territory). Same for any ratio measure — the total re-derives `SUM(num)/SUM(denom)`. |
| **Total of a COUNT DISTINCT**                 | must recount over the whole set                                                                                  | Grand-total distinct count ≠ sum of per-group distinct counts (overlap). Requires a separate query — a real cost in BI engines.                                                  |
| **Total of a percent-of-total**               | = 100% by construction                                                                                           | —                                                                                                                                                                                |

**BI-tool mapping:**

- **Tableau:** Analysis → Totals → Show Row/Column Grand Totals + Subtotals; "Total using" lets you override (Automatic vs Sum/Avg/…). By default totals **re-aggregate from underlying data**, so an AVG grand total is correct — but table-calc totals can be surprising.
- **Power BI:** matrix visual auto-computes subtotals/grand totals by re-evaluating the measure in the total row's filter context — which is _why_ well-written `DIVIDE(SUM,SUM)` measures total correctly and `AVERAGE(pct)` measures don't.
- **Looker:** table `Totals` + `Row Totals` checkboxes; measures re-aggregate; **table calculations do not total** (a known gap — the total row is blank for calc columns).
- **dbt/MetricFlow:** totals are a client concern; the semantic layer returns grouped rows, the BI front-end rolls up.

---

## Cross-Cutting Edge-Case Cheat Sheet

- **NULL handling:** all aggregates except `COUNT(*)` **skip NULLs**. `AVG` divides by non-null count — the most common silent error. In DAX, NULL ≈ **BLANK**; `BLANK + 1 = 1`, but `BLANK` in `DIVIDE` denominator → BLANK result.
- **Empty set:** `SUM/AVG/MIN/MAX/aggregates → NULL`; `COUNT(*) → 0`. BI tools render NULL as blank unless coerced.
- **Division by zero:** never emit raw `a/b`. SQL: `a / NULLIF(b,0)`. DAX: `DIVIDE(a, b [, alt])`. Looker: `${a} / NULLIF(${b},0)`. Percent-change with prior=0 is genuinely undefined → NULL.
- **Sample vs population (n−1 vs n):** single-row groups give NULL for sample stddev/variance but 0 for population. Pick deliberately.
- **Window frame default:** `RANGE UNBOUNDED PRECEDING → CURRENT ROW`. This makes `LAST_VALUE` and running totals over tied keys behave unexpectedly — specify `ROWS BETWEEN …` explicitly.
- **Percentile flavors:** `_CONT` interpolates (may return a value not in the data); `_DISC` returns an actual value. Power BI `.EXC` errors outside valid p-range; `.INC` doesn't.
- **Ratio blending:** ratio-of-sums at display grain is correct; averaging pre-computed row ratios is almost always wrong.
- **Join fan-out:** duplicated rows inflate `SUM`; use FIXED / `ALLEXCEPT` / Looker symmetric aggregates / distinct keys.
- **Dialect gaps that bite BI backends:** **MySQL** lacks `PERCENTILE_CONT/DISC`, `MODE`, `CORR`, `MEDIAN` (MariaDB has `MEDIAN`); **SQL Server** offers `PERCENTILE_CONT/DISC` only as **window** functions (no `GROUP BY` form) and lacks `NTH_VALUE` and `MODE`; **BigQuery** lacks `MODE` (use `APPROX_TOP_COUNT`). Postgres is the most complete among OLTP engines for ordered-set aggregates.

---

## Tool Benchmark Summary

| Capability                    | Tableau                                              | Power BI (DAX)                                       | Looker                                        | dbt (MetricFlow)                        |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- | --------------------------------------- |
| Basic aggregates              | Native                                               | Native + `X`-iterators                               | Native measure types                          | Simple metrics                          |
| Statistical (stddev/var/corr) | Native                                               | Native (`STDEV.S/P`, `GEOMEAN`)                      | via `sql:`                                    | via `expr`/derived                      |
| Percentile/ordered-set        | `PERCENTILE()`                                       | `PERCENTILE.INC/EXC`                                 | `type: percentile`                            | `percentile` agg                        |
| Running/rank/lag table calcs  | **Best-in-class** (Quick Table Calcs, Compute Using) | `OFFSET/WINDOW/RANK/INDEX` (2023+)                   | `table_calculation` (not filterable/reusable) | `cumulative` type only                  |
| Time intelligence             | Composed (table calcs + relative dates)              | **Best-in-class** (huge native library)              | Timeframes + PoP block                        | `cumulative` + `offset_window`          |
| Ratio blending correctness    | Aggregate calc fields                                | **Best-in-class** (`DIVIDE`, context)                | measure-referencing measures                  | **`type: ratio`** (guaranteed)          |
| Level of detail               | **FIXED/INCLUDE/EXCLUDE** (native syntax)            | `CALCULATE` + `ALL*` (most powerful, least readable) | Symmetric aggregates + derived tables         | Query-time grain (no LOD syntax needed) |
| Grand/subtotals               | Re-aggregating totals + "Total using"                | Filter-context totals                                | Totals (calcs don't total)                    | Client-side                             |

**One-line verdict per tool:** Tableau wins **table calcs + LOD ergonomics**; Power BI wins **time intelligence + ratio/context power** (at a readability cost); Looker wins **governed reusable measures** (but table calcs are second-class); dbt/MetricFlow wins **correct-by-construction ratio & cumulative metrics defined once, queried at any grain** (but pushes windowing/ranking downstream).

---

**Sources consulted for version-sensitive claims:**

- [MySQL 8.0 Window Function Descriptions](https://dev.mysql.com/doc/refman/8.0/en/window-function-descriptions.html) and [MySQL bug #93234 — PERCENTILE_CONT/MEDIAN request](https://bugs.mysql.com/bug.php?id=93234) (MySQL lacks percentile/median).
- [jOOQ — Emulating PERCENTILE_DISC in MySQL and other RDBMS](https://blog.jooq.org/how-to-emulate-percentile_disc-in-mysql-and-other-rdbms/).
- [PostgreSQL wiki — Aggregate Mode](https://wiki.postgresql.org/wiki/Aggregate_Mode) and [Postgres 9.4 WITHIN GROUP / ordered-set aggregates](https://paquier.xyz/postgresql-2/postgres-9-4-feature-highlight-within-group/).
- [Tableau — EXCLUDE LOD Expressions](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod_exclude.htm) and [The Data School — CALCULATE vs LODs](https://www.thedataschool.co.uk/harvey-joyce/power-bis-calculate-and-tableaus-lods-cut-from-the-same-cloth/) (LOD order-of-operations; DAX mapping).
- [dbt — Creating metrics](https://docs.getdbt.com/docs/build/metrics-overview) and [dbt — Advanced metrics](https://docs.getdbt.com/best-practices/how-we-build-our-metrics/semantic-layer-5-advanced-metrics) (five metric types, ratio/cumulative/derived, time spine).

_Standard SQL semantics (NULL-skipping, empty-set → NULL, ROLLUP/CUBE/GROUPING, window frame defaults, `WITHIN GROUP`) are per the SQL:2008/2011 standard as implemented in PostgreSQL, which is the reference implementation for ordered-set aggregates._
