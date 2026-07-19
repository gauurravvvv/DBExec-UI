No matter. Here is the synthesized report.

---

# Data Scale, Performance & Correctness in Production BI Charts

A benchmarked survey of how Tableau, Power BI, Superset, and Metabase keep charts fast, scalable, and correct. Each technique is tagged **[table-stakes]** (a BI tool is broken without it) or **[advanced]** (differentiator / hard-to-build).

---

## 1. The Core Architectural Decision: Server-Side Aggregation vs. Client Rendering

The single most important scale principle: **aggregate on the server (or in a fast engine), render only the aggregated result on the client.** A chart should never ship raw rows to the browser and group them in JavaScript.

**[table-stakes] Push the GROUP BY to the database.** Every serious BI tool generates a `SELECT dims, agg(measures) ... GROUP BY dims` and sends *only the result grid* to the browser. A bar chart of "revenue by region" over 500M rows returns ~10 rows. This is "query pushdown."

- **Power BI Import mode** copies data into **VertiPaq**, a columnar in-memory store with ~10:1 compression; every interaction runs against the local cache in milliseconds on datasets up to hundreds of millions of rows. ([metricasoftware](https://metricasoftware.com/power-bi-storage-modes-import-directquery-and-composite-for-enterprise-models/))
- **Tableau extracts (Hyper)** are the analogous columnar snapshot — see §3.
- **Superset & Metabase** are thin query layers: they compile the chart definition to SQL and push it to the warehouse. The engine does the aggregation.

**[table-stakes] Two connection modes: cached/extract vs. live/direct.**
- **Extract / Import**: fast, decoupled from the source, refreshed on schedule. Best for small-to-medium data (hundreds of thousands to low millions of rows for Tableau Hyper; up to hundreds of millions for VertiPaq). ([graphed](https://www.graphed.com/blog/what-is-tableau-hyper-extract), [darwinapps](https://www.darwinapps.com/blog/tableau-live-vs-extract/))
- **Live / DirectQuery**: query the source at render time. Only as fast as the source; best when the source is a powerful MPP warehouse (Snowflake, BigQuery, Redshift, Vertica) or when data must stay in place for freshness/governance. ([phData](https://www.phdata.io/blog/best-practices-for-optimizing-snowflake-for-tableau-extract-versus-live-connection/))

**[advanced] Composite / hybrid models — the best of both.** Power BI's composite model mixes an **Import aggregation table** (covers ~80% of common query grains, answered from VertiPaq in ms) with a **DirectQuery detail table** for drill-through. The engine transparently routes each query to the right layer; well-designed aggregation tables reach **80–95% cache-hit rates**. **Dual storage mode** keeps a table in both VertiPaq and DirectQuery, and the engine picks the cheaper path per query to avoid cross-source join overhead. **Hybrid tables** partition one table into recent (DirectQuery, near-real-time) + historical (Import) slices. ([powerbiconsulting](https://powerbiconsulting.com/blog/power-bi-composite-models-import-directquery-guide-2026), [Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about), [Microsoft Learn - composite](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-composite-models))

---

## 2. Row Limits, Sampling & "Showing Top N" Transparency

Because a browser can't render millions of DOM points and a warehouse can't stream unbounded results, **every tool clamps result size** — and the good ones tell the user when they did.

### Documented row limits (verified)

| Tool | Limit | Value | Meaning |
|---|---|---|---|
| **Superset** | `ROW_LIMIT` | 50,000 | Default max rows per **chart** query |
| **Superset** | `SQL_MAX_ROW` | 100,000 | Hard ceiling for **any** analytical query |
| **Superset** | `DISPLAY_MAX_ROW` | 10,000 | Max rows rendered in SQL Lab UI (does *not* cap CSV export) |
| **Superset** | `DEFAULT_SQLLAB_LIMIT` | 1,000 | Default SQL Lab limit (user-overridable in UI) |
| **Superset** | `SAMPLES_ROW_LIMIT` | 1,000 | Rows in the "Samples/Results" data preview panel |
| **Metabase** | Aggregated query API cap | < 1,048,575 | Hard row ceiling (Excel-row-count derived) |
| **Metabase** | Default GUI display | 2,000 (chart) / 10,000 (download-in-app) | Notebook/question result caps |
| **Power BI** | DirectQuery intermediate result | 1,000,000 | Any query/intermediate op returning >1M rows **fails** (raisable on Premium) |
| **Power BI** | CSV export | 30,000 | From Desktop/Service |
| **Power BI** | XLSX export | 150,000 | From Desktop/Service |
| **Power BI** | DirectQuery export | 16 MB | Data-size cap regardless of rows |
| **Tableau Server** | "Download full data" | 200,000 (default, admin-configurable) | Desktop "Download Data" has no hard cap |

Sources: [Superset PR #16683 / config.py](https://www.mail-archive.com/commits@superset.apache.org/msg06435.html), [Superset issue #5390](https://github.com/apache/superset/issues/5390), [Metabase env vars](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables), [Power BI DirectQuery](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about), [Power BI export limits](https://community.dynamics.com/blogs/post/?postid=4f2c499a-3cfa-488f-bffc-29659cbbdce2), [Tableau community](https://community.tableau.com/s/question/0D54T00000n6frdSAA/).

**[table-stakes] A default LIMIT on every generated query.** Prevents a mistyped chart from pulling a billion rows and OOM-ing the browser or the server.

**[table-stakes] "Showing top N" / truncation transparency.** When a result is clipped, the tool must *visibly* say so — Superset shows a "limit reached" banner; a table-chart shows "showing 50,000 of N rows." Silently truncating is a correctness bug: the user thinks they're seeing everything.

**[advanced] Separate display limit from query/export limit.** Superset's split (`DISPLAY_MAX_ROW` 10k for the browser, `SQL_MAX_ROW` 100k for the query, and CSV export uncapped by display) is the reference pattern: protect the browser from OOM without crippling the data pull.

**[advanced] Sampling for exploration.** Show a fast, statistically-representative sample (e.g., `TABLESAMPLE`, or `ORDER BY random() LIMIT n`) during authoring/preview, then run the full query on publish. Must be labeled "sampled" so nobody reads exact numbers off a sample.

---

## 3. Tableau Hyper & Extract Optimization

**[advanced] Hyper is a real columnar, JIT-compiling, main-memory database — not a flat file.** Acquired by Tableau in 2016, Hyper originated as the HyPer research system at TU Munich. Its distinguishing engineering:

- **Columnar storage** — column values stored together, so aggregating one column reads only that column's pages, slashing I/O. ([help.tableau.com](https://help.tableau.com/current/pro/desktop/en-us/perf_extracts.htm))
- **Morsel-driven parallelism** — data split into ~10K-row "morsels" dispatched to a shared worker-thread pool, giving NUMA-aware, near-linear scaling with core count. ([Leis et al., SIGMOD 2014](https://db.in.tum.de/~leis/papers/morsels.pdf))
- **JIT compilation to LLVM/native code** — queries compile to machine code rather than being tree-walked, eliminating interpreter overhead on hot loops. ([HyPer paper](http://sites.computer.org/debull/A12mar/p46.pdf))
- **Result vs. old TDE format**: ~**5× faster queries, ~3× faster extract creation**. ([graphed](https://www.graphed.com/blog/what-is-tableau-hyper-extract))

**[table-stakes] Extract benefits**: after creation, the primary DB is hit only on scheduled refresh, freeing the OLTP source from constant dashboard load. ([darwinapps](https://www.darwinapps.com/blog/tableau-live-vs-extract/))

**[table-stakes] Extract hygiene / query optimization** ([Tableau checklist](https://www.perceptive-analytics.com/tableau-optimization-checklist-and-guide/), [help.tableau.com](https://help.tableau.com/current/pro/desktop/en-us/perf_extracts.htm)):
- Hide unused fields before extracting (Hyper won't materialize them).
- Aggregate to visible dimensions / roll up dates to the needed grain.
- Use extract filters to drop rows you'll never chart.
- Materialize calculated fields into the extract so they aren't recomputed per query.

**When live wins**: if the source is a tuned MPP warehouse, a live connection lets you exploit its compute and elastic scale rather than bottlenecking on a single Hyper file (best for hundreds of thousands to low millions of rows). ([phData](https://www.phdata.io/blog/best-practices-for-optimizing-snowflake-for-tableau-extract-versus-live-connection/))

---

## 4. Power BI: VertiPaq, DirectQuery & Aggregations

**[advanced] VertiPaq columnar cache** — Import mode's engine; ~10:1 compression, millisecond scans on hundreds of millions of rows. Default choice for interactivity. ([metricasoftware](https://metricasoftware.com/power-bi-storage-modes-import-directquery-and-composite-for-enterprise-models/))

**[table-stakes] DirectQuery guardrails** (all verified from [Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about)):
- **1,000,000-row intermediate limit** — any query/intermediate op exceeding it **fails** (raisable on Premium via *Max Intermediate Row Set Count*).
- **4-minute per-query timeout** in the service; visuals that exceed it fail.
- **Performance targets**: aim for visual refresh **< 5s**; **> 30s degrades usability**.
- **Long-text columns > 32,764 chars unsupported.**
- **Default 10 concurrent connections** per source (Pro/Report Server; Premium depends on SKU).
- **Query folding is mandatory** — Power Query steps must fold into a single native query; nonfoldable steps (some custom functions, CTEs, stored procs) break DirectQuery or force Import.
- **Case-sensitivity trap**: the engine is case-*insensitive*; against a case-sensitive source, values differing only by case are treated as duplicates → **undefined results**. Normalize casing at source.

**[table-stakes] Query-reduction UX for DirectQuery**: an **Apply button** on slicers/filters (defer querying until the user commits), disable cross-highlighting where latency hurts, limit visuals per page, apply key filters early to stay under the 1M limit.

**[advanced] User-defined & automatic aggregations**: pre-aggregated Import tables that Power BI transparently substitutes when the query grain matches; **80–95% cache-hit rates** in practice. Complemented by **dynamic M parameters** (push user selections into the source predicate) and **result caching** on capacity. ([powerbiconsulting](https://powerbiconsulting.com/blog/directquery-optimization-large-databases-power-bi-2026))

---

## 5. Downsampling for Line & Scatter Charts (LTTB)

A 5M-point time series can't be drawn on a 1200px canvas — most points overlap a single pixel. Naïve "every Nth point" skips peaks and lies about the shape. **LTTB (Largest-Triangle-Three-Buckets)** is the industry-standard fix.

**[advanced] LTTB** (Steinarsson, 2013 MSc thesis, TU Munich lineage) ([rajnandan.com](https://rajnandan.com/posts/largest-triangle-three-buckets-downsampling/), [Steinarsson thesis via lttb-py](https://github.com/devoxi/lttb-py)):
- Split the series into `resolution` equal-width buckets.
- In each bucket, pick the one point forming the **largest triangle** with the previously-kept point and the average of the next bucket.
- **O(n), single pass, deterministic** (same input → same output, which matters for reproducibility and caching). ([timescaledb-toolkit](https://github.com/timescale/timescaledb-toolkit/blob/main/docs/lttb.md))
- Preserves peaks, valleys, sharp inflections, and trend changes — the visually load-bearing features — while cutting point count 100×+.
- Available natively in TimescaleDB (`lttb(time, value, resolution)`), and in Python/JS/C++/Java libraries. ([lttbc](https://github.com/dgoeries/lttbc), [lttb-cpp](https://github.com/parkertomatoes/lttb-cpp))

**[table-stakes] Server-side binning / histogram aggregation for scatter & dense charts.** Rather than shipping 5M (x,y) points, aggregate into a 2D grid / hexbin / heatmap-density on the server and render the bins. For distributions, compute histogram buckets in SQL (`width_bucket`, `FLOOR(x/binwidth)`). This is O(rows) on the server, O(bins) on the client.

**[table-stakes] Time-bucket rollups.** For time series, `date_trunc`/`time_bucket` to the display granularity (hour/day/week) *in the query* so you fetch one row per pixel-column, not per event.

**[advanced] Choose the downsampler by chart type**: LTTB for line (shape-preserving); min/max-per-bucket for anomaly/spike detection (guarantees extremes survive); average-per-bucket for smooth trends; density binning for scatter. A one-size downsampler misrepresents some chart types.

---

## 6. Tables: Pagination vs. Virtual Scroll

**[table-stakes] Never render all rows into the DOM.** 50,000 `<tr>` nodes = jank, high memory, slow first paint. Two strategies:

- **Server-side pagination** — fetch page N of M (`LIMIT/OFFSET` or keyset). Predictable memory; requires a round-trip per page; total count needs a separate `COUNT(*)`. ([microlaunch](https://microlaunch.net/h/how-to-handle-large-datasets-in-react-tables-with-virtual-scrolling-and-pagination))
- **[advanced] Virtual scroll / windowing** — render only the ~20–30 rows in the viewport (+buffer), keeping DOM-node count constant regardless of dataset size; padding elements simulate full scroll height. Yields smooth 60fps on very large lists. Libraries: **TanStack Virtual**, **react-window**. ([dev.to virtualization](https://dev.to/lalitkhu/rendering-massive-tables-at-lightning-speed-virtualization-with-virtual-scrolling-2dpp), [openreplay](https://blog.openreplay.com/virtual-scrolling-high-performance-interfaces/))

**[advanced] Virtual scroll + server pagination together.** The winning pattern for warehouse-scale tables: virtualize the DOM for smoothness *and* fetch data in server-side chunks (infinite scroll / windowed fetch) so you never hold the whole result client-side. ([syncfusion](https://react.syncfusion.com/react-ui/data-grid/scrolling/virtual-scroll/)) Note: pure virtual scroll assumes the full dataset is available client-side — for warehouse scale you must page the *data* even while virtualizing the *rendering*.

---

## 7. Caching, Incremental Refresh & Progressive Loading

**[table-stakes] Result-set caching.** Cache the chart's aggregated result keyed by the query signature; identical repeat queries return instantly. Superset uses a configurable cache (Redis/Memcached/S3/filesystem) with `RESULTS_BACKEND` for SQL Lab async results (MessagePack + PyArrow serialization). ([Superset caching docs](https://superset.apache.org/admin-docs/configuration/cache/), [async-queries](https://superset.apache.org/admin-docs/configuration/async-queries-celery/)) Power BI service caches visual/tile/result sets.

**[advanced] Materialization / model persistence.** Metabase's **model persistence** writes model results back to the warehouse as real tables (cron-refreshed), so downstream questions read a pre-computed table instead of re-running the query. Cached results live in the app DB; persisted models live in the warehouse. (Caveat: incompatible with row/column security & impersonation.) ([Metabase model persistence](https://www.metabase.com/docs/latest/data-modeling/model-persistence))

**[advanced] Incremental refresh.** Refresh only the changed/recent partition instead of reloading the whole extract. Power BI incremental refresh + real-time DirectQuery on the latest partition (Hybrid tables) is the reference implementation; Pro allows 8 scheduled refreshes/day, Premium/PPU up to 48. ([Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about))

**[advanced] Async / non-blocking query execution.** Long queries run as background jobs so the web tier isn't held open. **Superset async via Celery + Redis** runs SQL Lab queries in the background (default up to a **6-hour** ceiling before Celery kills them), streaming results to the results backend. ([Superset async-queries-celery](https://superset.apache.org/admin-docs/configuration/async-queries-celery/)) Essential once queries can outlast an HTTP/gateway timeout.

**[advanced] Lazy / progressive loading.**
- **Lazy metadata trees** — fetch schemas → tables → columns on expand, not all at once (avoids introspecting a 10,000-table warehouse up front).
- **Progressive chart render** — draw a coarse/sampled version immediately, refine as full results arrive.
- **Defer off-screen widgets** — a dashboard runs queries for visuals as they scroll into view, not all at page load.

---

## 8. Categorical Scale: Top-N + "Other", High-Cardinality Color/Axis

**[table-stakes] Top-N + "Other" bucket.** A bar chart of "sales by customer" with 40,000 customers is unreadable and slow. Compute the top N on the server (`ORDER BY measure DESC LIMIT N`) and roll the remainder into a single **"Other"** category — *without dropping it*, so totals stay correct. ([Atlassian grouped-bar guide](https://www.atlassian.com/data/charts/grouped-bar-chart-complete-guide), [cleanchart](https://www.cleanchart.app/blog/data-visualization-color-palettes))

**[table-stakes] Cap the color palette at ~6–10.** Viewers can't reliably match legend swatches beyond ~8 distinct colors; the practical ceiling is 10. Beyond that, bundle minor categories into "Other" or switch the encoding (color → small multiples, or category → axis position). ([Atlassian color guide](https://www.atlassian.com/data/charts/how-to-choose-colors-data-visualization), [Yellowfin](https://www.yellowfinbi.com/best-practice-guide/charts-visualizations/chart-color-use-best-practices), [Cloudscape](https://cloudscape.design/foundation/visual-foundation/data-vis-colors/))

**[advanced] High-cardinality axis handling.** For a categorical axis with thousands of members: default to Top-N, offer search/filter to find a specific member, and use a scrollable/virtualized axis for the long tail rather than cramming every label. Detect high cardinality and *warn* ("column has 8,412 distinct values — showing top 20") instead of rendering an illegible chart.

**[advanced] Deterministic color assignment.** Map category → color by a stable hash or fixed domain so the same category keeps its color across charts and refreshes (avoids "region A is blue here, orange there").

---

## 9. Correctness: Timezone & Fiscal-Calendar Handling

Scale is worthless if the numbers are wrong. Time is the top correctness hazard.

**[table-stakes] Explicit timezone semantics.** Store UTC, convert at display; be explicit about which zone `date_trunc('day', ts)` runs in — a "daily" chart bucketed in UTC vs. local time shifts every count across the midnight boundary. Power BI manages TZ via DAX + Power Query transforms. ([gcomsolutions](https://gcomsolutions.co.uk/guides/power-bi-guides-for-professionals/power-bi-for-finance-professionals/2-2-creating-calculated-columns-and-measures/2-2-2-handling-time-intelligence-in-financial-models/))

**[advanced] Fiscal & non-Gregorian calendars.** Fiscal years often start July 1 / Oct 1, not Jan 1; retail uses 4-4-5 week calendars; weeks may start Sun/Mon (ISO). Correct time-intelligence (YTD, prior-period, WTD) requires a **date dimension table** carrying fiscal year/quarter/period/week columns rather than deriving from the Gregorian date. Power BI's new **calendar-based time intelligence** (preview, 2025) lets one date table hold Gregorian + ISO + fiscal calendars simultaneously, with functions like `TOTALWTD`. ([SQLBI](https://www.sqlbi.com/articles/introducing-calendar-based-time-intelligence-in-dax/), [Microsoft Power BI blog](https://powerbi.microsoft.com/en-us/blog/calendar-based-time-intelligence-time-intelligence-tailored-preview/), [databear](https://databear.com/power-bi-custom-calendars/))

**[advanced] Week-boundary & period-alignment correctness.** Comparing "this week vs. last week" must align on the same fiscal week definition; DST transitions mean some local "days" have 23/25 hours — bucket on the intended civil calendar, not fixed 86,400-second windows.

---

## 10. Null / Empty-Result UX & Error Surfacing

**[table-stakes] Distinguish the four "no data" states.**
1. **Empty result** (query ran, zero rows) → "No data for the selected filters," not a blank canvas or a broken axis.
2. **Null values within data** → decide and *label* the treatment: skip in line (gap) vs. zero vs. "(blank)" category. Nulls silently coerced to 0 corrupt averages and totals.
3. **All-null measure** → explicit message, not `NaN`/`Infinity` axes.
4. **Not-yet-loaded** → skeleton/loading state distinct from "empty."

**[table-stakes] Surface query errors to the user, legibly.** Show the DB error (syntax, permission denied, timeout) in the chart/panel, not a generic "something went wrong." Superset/Metabase surface the underlying SQL error; Power BI DirectQuery surfaces timeout failures. Include enough to act on (e.g., "query exceeded 4-minute timeout — add a filter").

**[advanced] Actionable error remediation.** Pair the error with a fix: timeout → "reduce range / add filter"; row-limit hit → "showing top 50k, narrow the query or export"; folding failure → name the offending step. Turns a dead-end into a next action.

---

## 11. Approximate Query Processing (Accuracy Tradeoffs)

Exact `COUNT(DISTINCT)` and exact percentiles are among the most expensive operations at scale (they need to see every value / sort everything). Sketches trade a tiny, bounded error for orders-of-magnitude speed and memory.

**[advanced] HyperLogLog (HLL) for approximate distinct-count.** Estimates cardinality with **~0.01–0.6% average relative error**; counting billions of distinct items at ~1% error takes **~6 KB** — a **>1,000,000× space reduction** vs. exact. ([Facebook Engineering / Presto](https://engineering.fb.com/2018/12/13/data-infrastructure/hyperloglog/)) Exposed as `APPROX_DISTINCT` (Presto/Trino), `APPROX_COUNT_DISTINCT` (BigQuery/Snowflake), and HLL functions in Redshift.
- **[advanced] HLL's killer feature: mergeable sketches.** Compute a daily HLL sketch, then *union* seven daily sketches to get a weekly distinct count without rescanning raw data — enables incremental, roll-up-friendly distinct counts across years. ([AWS Redshift HLL](https://aws.amazon.com/blogs/big-data/use-hyperloglog-for-trend-analysis-with-amazon-redshift/), [Google Cloud HLL++](https://cloud.google.com/blog/products/data-analytics/using-hll-speed-count-distinct-massive-datasets)) Tableau's own research team has written on distinct-counting via sketches. ([Tableau blog](https://www.tableau.com/blog/hyperloglog-and-beyond-distinct-counting-data-sketching-researcher))
- Newer variants (UltraLogLog, ExaLogLog) push space efficiency further. ([UltraLogLog arXiv](https://arxiv.org/pdf/2308.16862), [ExaLogLog arXiv](https://arxiv.org/pdf/2402.13726))

**[advanced] t-digest / q-digest for approximate percentiles.** `APPROX_PERCENTILE` uses digest sketches to estimate p50/p95/p99 cheaply; reported **~45× faster percentiles** on Postgres/Citus with t-digest vs. exact. ([Microsoft/Citus t-digest](https://techcommunity.microsoft.com/blog/adforpostgresql/diary-of-an-engineer-delivering-45x-faster-percentiles-using-postgres-citus--t-d/1685102), [Facebook Engineering](https://engineering.fb.com/2018/12/13/data-infrastructure/hyperloglog/)) Also mergeable across partitions.

**[table-stakes-for-honesty] Label approximate results.** If a KPI card shows an HLL estimate, mark it "≈" or footnote the method — a finance number the user reads as exact but is ±1% is a correctness liability. Offer an exact-mode toggle for reconciliations.

---

## 12. Export at Scale & Streaming vs. Batch

**[table-stakes] Format-appropriate export.**
- **CSV** — the scale workhorse; stream row-by-row so memory stays flat regardless of size. (Superset's `DISPLAY_MAX_ROW` deliberately does *not* cap CSV.)
- **Excel/XLSX** — bounded by the format (max **1,048,576 rows/sheet**); Power BI caps XLSX export at **150,000** rows, CSV at **30,000**, and DirectQuery export at **16 MB**. ([Power BI export limits](https://community.dynamics.com/blogs/post/?postid=4f2c499a-3cfa-488f-bffc-29659cbbdce2), [walshamsolutions](https://www.walshamsolutions.com/powerbi-30-000-row-export-limit-workaround))
- **PDF/PNG** — snapshot of the *rendered* visual, not the data; server-side headless-browser render for consistency.
- Tableau: Desktop "Download Data" is uncapped; Server "Download full data" defaults to **200,000** (admin-configurable); crosstab export always produces `.xlsx` preserving the visual structure. ([Tableau community](https://community.tableau.com/s/question/0D54T00000n6frdSAA/), [csvshift](https://csvshift.com/tableau-to-csv/))

**[table-stakes] Streaming (row-by-row) vs. batch (materialize-then-send) export.**
- **Streaming** — server reads the DB cursor and writes to the HTTP response incrementally; constant memory; the only viable path for large CSV. Preferred default.
- **Batch/async** — for very large or slow exports, run as a background job and deliver a download link / email when ready (avoids HTTP timeouts). This mirrors §7's async execution: large exports are just long-running queries.

**[advanced] Async export pipeline.** Large export → enqueue Celery/worker job → stream to object storage (S3) → notify user with a signed URL. Decouples export size from request-timeout limits entirely.

---

## 13. Consolidated Table-Stakes vs. Advanced

**[table-stakes] — a BI tool is broken without these:**
- Server-side GROUP BY / query pushdown
- Extract/cached **and** live/direct connection modes
- Default LIMIT on every query + visible truncation banner
- Server-side time-bucketing & binning before charting
- Pagination or virtual scroll for tables (no full-DOM render)
- Result-set caching
- Top-N + "Other" bucket; palette capped ~6–10 colors
- Explicit timezone semantics
- Empty-result / null / loading states distinguished; legible error surfacing
- Format-appropriate, streaming CSV export

**[advanced] — differentiators / hard to build well:**
- Composite/hybrid/dual storage models with aggregation-aware routing (Power BI)
- Columnar JIT engine (Hyper morsels+LLVM; VertiPaq compression)
- LTTB / chart-type-specific downsampling
- Virtual scroll fused with server-side chunked fetch
- Model materialization/persistence & incremental refresh
- Async query execution + async export pipeline
- Lazy metadata trees & progressive rendering
- HLL distinct-count (mergeable sketches) + t-digest percentiles, with honesty labeling
- Fiscal / non-Gregorian / week-based time intelligence via date-dimension tables
- Deterministic cross-chart color assignment; high-cardinality axis with search + virtualization

---

## Tool Scorecard

| Capability | Tableau | Power BI | Superset | Metabase |
|---|---|---|---|---|
| Columnar engine | Hyper (LLVM JIT, morsels) | VertiPaq (~10:1) | Delegated to warehouse | Delegated to warehouse |
| Cached vs. live | Extract / Live | Import / DirectQuery / Hybrid / Dual | Cache + async | App-cache + model persistence |
| Aggregation routing | — | User-defined + automatic aggregations (80–95% hit) | — | Models |
| Default row limit | 200k server download | 1M DQ intermediate | 50k chart / 100k max | ~2k display / <1.05M cap |
| Async execution | Server backgrounder | Capacity | Celery (6h ceiling) | — |
| Incremental refresh | Extract incremental | Incremental + real-time hybrid | — | — |
| Approx functions | Sketch research; warehouse passthrough | Warehouse passthrough | Warehouse passthrough | Warehouse passthrough |

---

## Sources

- [Power BI — DirectQuery limits & guidance (Microsoft Learn)](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-directquery-about)
- [Power BI — Composite models (Microsoft Learn)](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-composite-models)
- [Power BI storage modes — metricasoftware](https://metricasoftware.com/power-bi-storage-modes-import-directquery-and-composite-for-enterprise-models/) · [composite guide — powerbiconsulting](https://powerbiconsulting.com/blog/power-bi-composite-models-import-directquery-guide-2026) · [DirectQuery optimization — powerbiconsulting](https://powerbiconsulting.com/blog/directquery-optimization-large-databases-power-bi-2026)
- [Power BI export limits — Dynamics community](https://community.dynamics.com/blogs/post/?postid=4f2c499a-3cfa-488f-bffc-29659cbbdce2) · [walshamsolutions](https://www.walshamsolutions.com/powerbi-30-000-row-export-limit-workaround)
- [Tableau Live vs Extract — DarwinApps](https://www.darwinapps.com/blog/tableau-live-vs-extract/) · [Hyper extract — Graphed](https://www.graphed.com/blog/what-is-tableau-hyper-extract) · [Use Extracts — help.tableau.com](https://help.tableau.com/current/pro/desktop/en-us/perf_extracts.htm) · [Snowflake+Tableau — phData](https://www.phdata.io/blog/best-practices-for-optimizing-snowflake-for-tableau-extract-versus-live-connection/) · [Optimization checklist — Perceptive](https://www.perceptive-analytics.com/tableau-optimization-checklist-and-guide/)
- [Morsel-driven parallelism — Leis et al. (TUM)](https://db.in.tum.de/~leis/papers/morsels.pdf) · [HyPer paper](http://sites.computer.org/debull/A12mar/p46.pdf) · [Tableau Data Engine — help.tableau.com](https://help.tableau.com/current/server/en-us/data_engine2_intro.htm)
- [Superset async queries via Celery](https://superset.apache.org/admin-docs/configuration/async-queries-celery/) · [caching](https://superset.apache.org/admin-docs/configuration/cache/) · [global max row limit PR #16683](https://www.mail-archive.com/commits@superset.apache.org/msg06435.html) · [SQL Lab limit issue #5390](https://github.com/apache/superset/issues/5390) · [FAQ](https://superset.apache.org/user-docs/faq/)
- [Metabase model persistence](https://www.metabase.com/docs/latest/data-modeling/model-persistence) · [environment variables (row limits)](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables) · [SQL performance tuning](https://www.metabase.com/learn/grow-your-data-skills/data-landscape/sql-performance-tuning)
- [LTTB — TimescaleDB toolkit docs](https://github.com/timescale/timescaledb-toolkit/blob/main/docs/lttb.md) · [LTTB explainer — rajnandan.com](https://rajnandan.com/posts/largest-triangle-three-buckets-downsampling/) · [lttb-py](https://github.com/devoxi/lttb-py) · [lttbc (C-ext)](https://github.com/dgoeries/lttbc)
- [Virtual scrolling — dev.to](https://dev.to/lalitkhu/rendering-massive-tables-at-lightning-speed-virtualization-with-virtual-scrolling-2dpp) · [openreplay](https://blog.openreplay.com/virtual-scrolling-high-performance-interfaces/) · [Syncfusion virtual scroll](https://react.syncfusion.com/react-ui/data-grid/scrolling/virtual-scroll/) · [React tables — microlaunch](https://microlaunch.net/h/how-to-handle-large-datasets-in-react-tables-with-virtual-scrolling-and-pagination)
- [HLL in Presto — Facebook Engineering](https://engineering.fb.com/2018/12/13/data-infrastructure/hyperloglog/) · [HLL Redshift — AWS](https://aws.amazon.com/blogs/big-data/use-hyperloglog-for-trend-analysis-with-amazon-redshift/) · [HLL++ BigQuery — Google Cloud](https://cloud.google.com/blog/products/data-analytics/using-hll-speed-count-distinct-massive-datasets) · [t-digest percentiles — Microsoft/Citus](https://techcommunity.microsoft.com/blog/adforpostgresql/diary-of-an-engineer-delivering-45x-faster-percentiles-using-postgres-citus--t-d/1685102) · [distinct counting — Tableau blog](https://www.tableau.com/blog/hyperloglog-and-beyond-distinct-counting-data-sketching-researcher) · [UltraLogLog](https://arxiv.org/pdf/2308.16862) · [ExaLogLog](https://arxiv.org/pdf/2402.13726)
- [Time intelligence & fiscal calendars — SQLBI](https://www.sqlbi.com/articles/introducing-calendar-based-time-intelligence-in-dax/) · [Microsoft Power BI blog](https://powerbi.microsoft.com/en-us/blog/calendar-based-time-intelligence-time-intelligence-tailored-preview/) · [databear custom calendars](https://databear.com/power-bi-custom-calendars/)
- [Color/Top-N best practices — Atlassian](https://www.atlassian.com/data/charts/how-to-choose-colors-data-visualization) · [grouped bar](https://www.atlassian.com/data/charts/grouped-bar-chart-complete-guide) · [Yellowfin](https://www.yellowfinbi.com/best-practice-guide/charts-visualizations/chart-color-use-best-practices) · [Cloudscape data-vis colors](https://cloudscape.design/foundation/visual-foundation/data-vis-colors/) · [cleanchart palettes](https://www.cleanchart.app/blog/data-visualization-color-palettes)

*Confidence notes:* Numeric limits for Power BI DirectQuery (1M rows, 4-min timeout, 32,764 chars, 10 connections) are from Microsoft Learn (primary, high confidence). Superset defaults (ROW_LIMIT 50k, SQL_MAX_ROW 100k, DISPLAY_MAX_ROW 10k, DEFAULT_SQLLAB_LIMIT 1k) are from Superset config/PR sources (high confidence; verify against your deployed version as these are runtime-configurable). Metabase display defaults (~2k) vary by version/edition — treat as directional. Tableau Hyper 5×/3× figures are vendor/secondary (medium confidence).