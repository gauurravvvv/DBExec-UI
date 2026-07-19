The caveman skill isn't installed here, so I'll proceed. This is a code-block/document deliverable anyway (the directive exempts code and written docs from caveman phrasing). Producing the requirements corpus section now.

## data-scale

Production-readiness requirements for the DBExec Analyses module covering data volume, query performance, rendering scale, and numerical correctness. Every item is tagged **[table-stakes]** (a BI tool is broken without it) or **[advanced]** (differentiator / hard to build well).

### Requirements Checklist

**A. Server-side aggregation & query pushdown**
- A1. **[table-stakes]** Push `GROUP BY` to the database; ship only the aggregated result grid to the browser, never raw rows grouped in JS.
- A2. **[table-stakes]** Support two connection modes: cached/extract (snapshot, scheduled refresh) and live/direct (query source at render time).
- A3. **[advanced]** Composite / hybrid model: pre-aggregated cache for common grains + direct detail table for drill-through, with aggregation-aware query routing.
- A4. **[advanced]** Dual storage mode (table lives in both cache and direct; engine picks cheaper path per query).

**B. Row limits, sampling & truncation transparency**
- B1. **[table-stakes]** A default `LIMIT` on every generated query (prevents runaway pulls / browser OOM).
- B2. **[table-stakes]** Visible "showing top N of M" / truncation banner whenever a result is clipped. Silent truncation is a correctness bug.
- B3. **[advanced]** Separate display limit from query limit from export limit (protect browser without crippling data pull / export).
- B4. **[advanced]** Sampling mode for authoring/preview (`TABLESAMPLE` / random LIMIT), labeled "sampled," full query on publish.

**C. Downsampling & binning for dense charts**
- C1. **[table-stakes]** Server-side time-bucketing (`date_trunc`/`time_bucket`) to display granularity before charting time series.
- C2. **[table-stakes]** Server-side binning / histogram / 2D-density aggregation for scatter and dense distribution charts.
- C3. **[advanced]** LTTB (Largest-Triangle-Three-Buckets) shape-preserving downsampling for line charts.
- C4. **[advanced]** Chart-type-specific downsampler selection (LTTB for line, min/max-per-bucket for anomaly, average for smooth trend, density-bin for scatter).

**D. Table rendering at scale**
- D1. **[table-stakes]** Never full-DOM-render large result sets: server-side pagination or virtual scroll.
- D2. **[advanced]** Virtual scroll / windowing (constant DOM node count regardless of size).
- D3. **[advanced]** Virtual scroll fused with server-side chunked fetch (infinite scroll for warehouse-scale tables).

**E. Caching, refresh & async execution**
- E1. **[table-stakes]** Result-set caching keyed by query signature; identical repeat queries return instantly.
- E2. **[advanced]** Model materialization / persistence (write aggregated model back to warehouse or app store).
- E3. **[advanced]** Incremental refresh (refresh only changed/recent partition).
- E4. **[advanced]** Async / non-blocking query execution (background job queue for queries that outlast HTTP timeout).
- E5. **[advanced]** Lazy metadata trees (schemas → tables → columns on expand, not up-front introspection).
- E6. **[advanced]** Progressive / deferred rendering (coarse render first, refine on arrival; run off-screen widget queries on scroll-in).

**F. Categorical scale**
- F1. **[table-stakes]** Top-N + "Other" bucket computed server-side, remainder rolled up (not dropped) so totals stay correct.
- F2. **[table-stakes]** Color palette capped ~6–10 distinct colors; overflow to "Other" or alternate encoding.
- F3. **[advanced]** High-cardinality axis handling: detect, warn ("8,412 distinct values — showing top 20"), offer search + virtualized/scrollable long-tail axis.
- F4. **[advanced]** Deterministic category→color assignment (stable hash / fixed domain) across charts and refreshes.

**G. Correctness: time & calendar**
- G1. **[table-stakes]** Explicit timezone semantics: store UTC, convert at display, be explicit about the zone `date_trunc` runs in.
- G2. **[advanced]** Fiscal / non-Gregorian / 4-4-5 / ISO-week calendars via a date-dimension table for correct YTD / prior-period / WTD.
- G3. **[advanced]** Week-boundary & DST-aware period alignment (bucket on civil calendar, not fixed 86,400s windows).

**H. Null / empty / error UX**
- H1. **[table-stakes]** Distinguish the four "no data" states: empty result, nulls-within-data, all-null measure, not-yet-loaded (skeleton).
- H2. **[table-stakes]** Explicit null-treatment choice, labeled: line gap vs. zero vs. "(blank)" category (never silent coerce-to-zero).
- H3. **[table-stakes]** Surface DB query errors legibly in the panel (syntax / permission / timeout), not a generic failure.
- H4. **[advanced]** Actionable error remediation (timeout → "add a filter"; row-limit → "narrow or export"; name offending step).

**I. Approximate query processing**
- I1. **[advanced]** HyperLogLog approximate distinct-count (`APPROX_DISTINCT`), including mergeable sketches for roll-ups.
- I2. **[advanced]** t-digest / q-digest approximate percentiles (`APPROX_PERCENTILE`).
- I3. **[table-stakes-for-honesty]** Label approximate results ("≈" / footnote); offer exact-mode toggle for reconciliation.

**J. Export at scale**
- J1. **[table-stakes]** Format-appropriate export (CSV streaming; XLSX row-bounded; PDF/PNG = rendered snapshot).
- J2. **[table-stakes]** Streaming (row-by-row cursor) CSV export with flat memory as the default path.
- J3. **[advanced]** Async export pipeline (background job → object storage → signed download URL / notification).

### Gap Table

| Requirement | DBExec status | Priority | Effort (BE?) |
|---|---|---|---|
| A1 Server-side GROUP BY / pushdown | **have** — aggregation encoding (dim/measure/aggregate/percentile) works | — | — |
| A2 Cached/extract vs live/direct modes | **missing** — all queries appear live; no extract/snapshot store (dashboard-snapshot model is planned, not built) | P1 | L (BE) |
| A3 Composite/hybrid aggregation routing | **missing** | P2 | L (BE) |
| A4 Dual storage mode | **missing** | P2 | L (BE) |
| B1 Default LIMIT on every query | **partial/unknown** — must verify a hard default exists on chart queries | P0 | S (BE) |
| B2 Truncation "top N of M" banner | **missing** (likely) — no evidence of truncation surfacing | P0 | S (FE, small BE to return total/clipped flag) |
| B3 Separate display/query/export limits | **missing** | P1 | M (BE) |
| B4 Sampling preview mode | **missing** | P2 | M (BE) |
| C1 Server-side time-bucketing | **partial** — aggregation exists; explicit time-bucket-to-pixel-granularity not confirmed | P0 | M (BE) |
| C2 Server-side binning/histogram/density | **partial** — histogram chart type wired, but confirm binning is server-side not client | P1 | M (BE) |
| C3 LTTB line downsampling | **missing** | P1 | M (BE preferred; FE fallback) |
| C4 Chart-type-specific downsampler | **missing** | P2 | L (BE) |
| D1 No full-DOM table render | **partial** — app-custom-table uses infinite scroll (per custom-table-standard) | P1 | M |
| D2 Virtual scroll/windowing | **partial** — infinite scroll exists; confirm true DOM windowing | P1 | M (FE) |
| D3 Virtual scroll + chunked server fetch | **partial** — infinite scroll implies chunked fetch; verify for Analyses table/pivot chart | P1 | M (FE+BE) |
| E1 Result-set caching | **missing** (likely) — no cache layer noted | P0 | M (BE) |
| E2 Model materialization/persistence | **missing** | P2 | L (BE) |
| E3 Incremental refresh | **missing** | P2 | L (BE) |
| E4 Async query execution | **missing** — synchronous request/response only | P1 | L (BE) |
| E5 Lazy metadata trees | **partial/unknown** — verify schema/table/column introspection is lazy | P2 | M (BE) |
| E6 Progressive/deferred widget render | **missing** — dashboards likely load all widgets at once | P2 | M (FE) |
| F1 Top-N + "Other" bucket | **missing** — no Top-N rollup that preserves totals | P0 | M (BE) |
| F2 Palette cap ~6–10 | **partial** — palette swatches flagged as a gap; no cardinality guard | P1 | S (FE) |
| F3 High-cardinality axis warn + search | **missing** | P1 | M (FE+BE) |
| F4 Deterministic cross-chart color | **missing** — ECharts theme/palette work flagged; no stable domain mapping | P1 | S (FE) |
| G1 Explicit timezone semantics | **missing/unknown** — no TZ policy confirmed; high correctness risk | P0 | M (BE) |
| G2 Fiscal / non-Gregorian calendars | **missing** — no date-dimension table | P2 | L (BE) |
| G3 Week-boundary / DST alignment | **missing** | P2 | M (BE) |
| H1 Four "no data" states distinguished | **partial** — likely has loading + empty, not all four | P0 | S (FE) |
| H2 Explicit labeled null treatment | **missing** (likely) | P1 | S (FE, minor BE) |
| H3 Legible query-error surfacing | **partial** — verify DB errors reach the panel vs. generic toast | P0 | S (FE+BE) |
| H4 Actionable error remediation | **missing** | P2 | M (FE) |
| I1 HLL approximate distinct-count | **missing** — passthrough to warehouse if source supports it | P2 | M (BE) |
| I2 t-digest approximate percentiles | **partial** — percentile aggregate exists; exact only, not approx/mergeable | P2 | M (BE) |
| I3 Approximate-result labeling | **missing** (moot until I1/I2) | P2 | S (FE) |
| J1 Format-appropriate export | **partial/unknown** — confirm CSV/XLSX/PNG export exists for charts | P1 | M (BE+FE) |
| J2 Streaming CSV export | **missing** (likely) — confirm not materialize-in-memory | P1 | M (BE) |
| J3 Async export pipeline | **missing** | P2 | L (BE) |

### Must-have for production (P0 shortlist)

These are the correctness-and-safety floor — without them a chart can silently lie or OOM the browser/server:

1. **B1 — Default LIMIT on every generated query.** Guarantee a hard row ceiling so no chart can pull unbounded rows. (Verify one already exists; if not, add it.)
2. **B2 — Truncation transparency banner.** When a result is clipped, show "showing top N of M." Silent truncation = the user believes a partial chart is complete.
3. **C1 — Server-side time-bucketing to display granularity.** Bucket time series in SQL (`date_trunc`/`time_bucket`) so you fetch one row per pixel-column, not per event.
4. **E1 — Result-set caching.** Cache aggregated results by query signature; without it, every filter/tab interaction re-hits the warehouse.
5. **F1 — Top-N + "Other" bucket (totals-preserving).** A categorical chart over thousands of members must roll the tail into "Other" without dropping it, or it is both unreadable and wrong.
6. **G1 — Explicit timezone semantics.** Store UTC, convert at display, pin the bucketing zone. A daily chart bucketed in the wrong zone shifts counts across midnight — a correctness liability.
7. **H1 / H3 — Empty-vs-null-vs-loading states + legible query-error surfacing.** Distinguish "no data for filters" from a blank canvas, and show the actual DB error (timeout, permission) in the panel.

**Priorities requiring immediate verification against the codebase (status "partial/unknown"):** B1 (is there a hard default LIMIT?), C1/C2 (is bucketing/binning server-side?), D1–D3 (is the Analyses table truly windowed + chunked?), H3 (do DB errors reach the panel?), J1/J2 (does streaming export exist?). Several of these may already be satisfied; they are P0/P1 because a false assumption here is a production incident.