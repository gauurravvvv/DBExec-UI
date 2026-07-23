## aggregations

> Scope: everything a production BI tool computes on top of grouped data — from `SUM` to level-of-detail expressions to pivot grand totals. DBExec today does core aggregates plus a percentile encoding; nearly everything above tier-1 is missing. This section is the exhaustive checklist and the honest gap map.

---

### Requirements Checklist (complete, by family)

**1. Basic aggregates**

- [table-stakes] Sum
- [table-stakes] Average (mean) — ratio-of-sums, NULL-skipping
- [table-stakes] Min / Max (numeric, string, date)
- [table-stakes] Count rows (`COUNT(*)`, counts NULLs, empty→0)
- [table-stakes] Count non-null (`COUNT(x)`)
- [table-stakes] Count distinct (+ approx-distinct for high cardinality)
- [table-stakes] Median

**2. Statistical aggregates**

- [advanced] Std dev — sample and population
- [advanced] Variance — sample and population
- [advanced] Mode
- [advanced] Geometric mean
- [advanced] Harmonic mean
- [advanced] Correlation / covariance / linear-regression aggregates

**3. Ordered-set / percentile aggregates**

- [advanced] `percentile_cont` (interpolated)
- [advanced] `percentile_disc` (nearest actual value)
- [advanced] First / Last / Nth value (ordered)

**4. Windowed / table calculations (post-aggregate)**

- [table-stakes] Running total / cumulative sum
- [table-stakes] Moving / rolling average
- [advanced] Cumulative min / max / count
- [table-stakes] Rank (with ties→skip)
- [advanced] Dense rank
- [advanced] Row number
- [advanced] Percent rank
- [advanced] Cume dist
- [advanced] Ntile / bucketing
- [table-stakes] Difference from prior (LAG-based)
- [table-stakes] Percent difference (with ÷0 guard)
- [table-stakes] Lag / Lead (arbitrary offset)
- [table-stakes] Percent of total
- [advanced] Index / position within partition
- [advanced] Difference from first / from window average
- [advanced] Directional compute-using (partition vs address control) — the UX that makes table calcs usable

**5. Time intelligence** (all require a date spine / calendar table)

- [table-stakes] YTD / QTD / MTD
- [table-stakes] Same period last year (SPLY)
- [table-stakes] Year-over-year (value + %)
- [table-stakes] MoM / QoQ
- [table-stakes] Rolling N periods
- [advanced] Parallel period / prior-N period arithmetic
- [advanced] Fiscal-calendar offset support (fiscal year start, 4-4-5)

**6. Ratio / blended aggregates**

- [advanced] Ratio-of-sums measure (`SUM/SUM` re-derived at every grain) — the correctness cornerstone
- [advanced] Weighted average (`SUM(v*w)/SUM(w)`)
- [advanced] Guardrails against sum/avg-of-ratios mistake

**7. Level of detail / context manipulation**

- [advanced] FIXED-grain aggregate (`PARTITION BY listed dims`, ignore viz grain)
- [advanced] INCLUDE-grain aggregate (viz grain + extra dims, re-aggregate up)
- [advanced] EXCLUDE-grain aggregate (viz grain − dims, subtotal)
- [advanced] Fan-out / join-duplication safety (symmetric aggregates or distinct-key dedup)
- [advanced] Correct filter order-of-operations for LOD (pre- vs post-filter)

**8. Grand totals & subtotals (pivot)**

- [table-stakes] Row/column grand totals
- [table-stakes] Subtotals (ROLLUP)
- [advanced] Cross-tab all-combinations (CUBE / GROUPING SETS)
- [table-stakes] Totals re-aggregate from source (AVG/ratio total ≠ mean of subtotals)
- [advanced] Distinct-count grand total (separate recount, not sum of group distincts)
- [advanced] `GROUPING()` flag to distinguish total-row NULL from data NULL

**Cross-cutting correctness requirements (apply to all families)**

- [table-stakes] NULL-skipping semantics documented + consistent
- [table-stakes] Empty-set semantics (NULL vs 0) consistent
- [table-stakes] Division-by-zero guard everywhere (`NULLIF` / DIVIDE)
- [advanced] Sample-vs-population selector where relevant
- [advanced] Explicit window-frame control (ROWS vs RANGE)
- [advanced] Percentile flavor selector (cont vs disc)
- [advanced] Dialect-gap handling (MySQL no percentile/median/mode/corr; SQL Server percentile only as window; BigQuery no mode) — the BE must emulate or degrade gracefully

---

### Gap Table

| Requirement                                        | DBExec status                                                 | Priority | Effort (+BE?)                   |
| -------------------------------------------------- | ------------------------------------------------------------- | -------- | ------------------------------- |
| **Basic aggregates**                               |                                                               |          |                                 |
| Sum                                                | have                                                          | —        | —                               |
| Average                                            | have                                                          | —        | —                               |
| Min / Max                                          | have                                                          | —        | —                               |
| Count rows                                         | have                                                          | —        | —                               |
| Count non-null                                     | partial (may collapse into count rows)                        | P1       | S +BE                           |
| Count distinct                                     | have (verify NULL-exclusion)                                  | —        | —                               |
| Approx count distinct (high-cardinality)           | missing                                                       | P2       | M +BE (dialect-specific)        |
| Median                                             | partial (percentile encoding exists; expose as median preset) | P1       | S +BE                           |
| **Statistical**                                    |                                                               |          |                                 |
| Std dev (sample/pop)                               | missing                                                       | P1       | S +BE                           |
| Variance (sample/pop)                              | missing                                                       | P2       | S +BE                           |
| Mode                                               | missing                                                       | P2       | M +BE (dialect gaps)            |
| Geometric mean                                     | missing                                                       | P2       | M +BE (x>0 guard)               |
| Harmonic mean                                      | missing                                                       | P2       | M +BE (÷0 guard)                |
| Correlation / covariance / regression              | missing                                                       | P2       | M +BE (MySQL/SQLServer emulate) |
| **Ordered-set / percentile**                       |                                                               |          |                                 |
| percentile_cont                                    | have (percentile encoding)                                    | —        | —                               |
| percentile_disc                                    | partial (likely only cont)                                    | P1       | S +BE                           |
| First / Last / Nth ordered value                   | missing                                                       | P2       | M +BE                           |
| **Windowed / table calcs**                         |                                                               |          |                                 |
| Running total / cumulative sum                     | missing                                                       | **P0**   | M +BE                           |
| Moving / rolling average                           | missing                                                       | **P0**   | M +BE                           |
| Cumulative min/max/count                           | missing                                                       | P2       | S +BE                           |
| Rank                                               | missing                                                       | **P0**   | M +BE                           |
| Dense rank                                         | missing                                                       | P1       | S +BE                           |
| Row number                                         | missing                                                       | P1       | S +BE                           |
| Percent rank                                       | missing                                                       | P2       | S +BE                           |
| Cume dist                                          | missing                                                       | P2       | S +BE                           |
| Ntile / buckets                                    | missing                                                       | P2       | S +BE                           |
| Difference from prior                              | missing                                                       | **P0**   | M +BE                           |
| Percent difference (÷0 guarded)                    | missing                                                       | **P0**   | M +BE                           |
| Lag / Lead (offset)                                | missing                                                       | P1       | S +BE                           |
| Percent of total                                   | missing                                                       | **P0**   | M +BE                           |
| Index / position                                   | missing                                                       | P2       | S (FE table calc)               |
| Diff from first / window avg                       | missing                                                       | P2       | M +BE                           |
| Directional compute-using UX                       | missing                                                       | P1       | L (FE+BE)                       |
| **Time intelligence**                              |                                                               |          |                                 |
| Date spine / calendar table                        | missing (prerequisite)                                        | **P0**   | L +BE                           |
| YTD / QTD / MTD                                    | missing                                                       | **P0**   | M +BE (needs spine)             |
| Same period last year (SPLY)                       | missing                                                       | **P0**   | M +BE (needs spine)             |
| YoY (value + %)                                    | missing                                                       | **P0**   | M +BE                           |
| MoM / QoQ                                          | missing                                                       | P1       | M +BE                           |
| Rolling N periods                                  | missing                                                       | P1       | M +BE                           |
| Parallel / prior-N period                          | missing                                                       | P2       | M +BE                           |
| Fiscal-calendar offset                             | missing                                                       | P2       | M +BE                           |
| **Ratio / blended**                                |                                                               |          |                                 |
| Ratio-of-sums measure (SUM/SUM at grain)           | missing                                                       | **P0**   | M +BE                           |
| Weighted average                                   | missing                                                       | P1       | S +BE                           |
| Sum/avg-of-ratios guardrail                        | missing                                                       | P1       | S (FE warn)                     |
| **Level of detail**                                |                                                               |          |                                 |
| FIXED-grain aggregate                              | missing                                                       | P1       | L +BE                           |
| INCLUDE-grain aggregate                            | missing                                                       | P2       | L +BE                           |
| EXCLUDE-grain aggregate                            | missing                                                       | P2       | L +BE                           |
| Fan-out / join-dup safety (symmetric agg)          | missing (risk today if joins fan out)                         | P1       | L +BE                           |
| LOD filter order-of-operations                     | missing                                                       | P2       | M +BE                           |
| **Grand totals & subtotals**                       |                                                               |          |                                 |
| Row/column grand totals                            | partial (pivot exists; verify re-aggregation)                 | **P0**   | M +BE                           |
| Subtotals (ROLLUP)                                 | missing                                                       | P1       | M +BE                           |
| CUBE / GROUPING SETS                               | missing                                                       | P2       | M +BE                           |
| Totals re-aggregate from source (not sum-of-cells) | unknown — **must audit**                                      | **P0**   | M +BE                           |
| Distinct-count grand total (recount)               | missing                                                       | P1       | M +BE                           |
| GROUPING() total-row flag                          | missing                                                       | P2       | S +BE                           |
| **Cross-cutting correctness**                      |                                                               |          |                                 |
| NULL-skipping documented/consistent                | partial                                                       | P1       | S +BE                           |
| Empty-set (NULL vs 0) consistent                   | partial                                                       | P1       | S +BE                           |
| Division-by-zero guard everywhere                  | unknown — **must audit**                                      | **P0**   | S +BE                           |
| Sample-vs-population selector                      | missing                                                       | P2       | S (FE+BE)                       |
| Explicit window-frame control                      | missing                                                       | P2       | M +BE                           |
| Percentile flavor selector (cont/disc)             | missing                                                       | P1       | S +BE                           |
| Dialect-gap emulation/degrade                      | unknown — **must audit**                                      | P1       | L +BE                           |

---

### Must-Have for Production (the P0 shortlist)

These are the items that make DBExec credible as a BI tool rather than a chart renderer. Ordered by dependency:

1. **Division-by-zero audit + guard everywhere** — cheapest, highest-trust. Any `a/b` in aggregation or percent math must be `NULLIF`/DIVIDE. Wrong numbers silently shipped is the worst failure mode. (S)
2. **Totals re-aggregate from source — audit the pivot** — confirm grand totals/AVG totals recompute from underlying data, not sum the visible cells. If they sum cells, every AVG/ratio total is wrong. (M)
3. **Core table calcs: running total, moving average, rank, difference-from-prior, percent-difference, percent-of-total** — these six are what users expect the moment they see a time series or a ranked bar chart. All lean on window functions over the aggregated result. (M each, shared engine)
4. **Ratio-of-sums measure type** — a first-class "measure ÷ measure, re-derived at grain" calc. Without it, blended rates (conversion, margin) are computed as avg-of-percentages and are simply wrong. (M)
5. **Date spine + core time intelligence: YTD/MTD, SPLY, YoY** — the single most-requested BI capability; requires the calendar-table prerequisite, so start it early. Rolling-N and MoM/QoQ follow once the spine exists. (L for spine, M per calc)

Everything in group 3–5 should share **one server-side window/time engine** so the config panel exposes them as presets rather than one-off encodings. The two audits (items 1–2) gate trust and must land before advertising any of the new calcs.

**Honest caveats on "have" claims:** the audit items marked _unknown_ (÷0 guarding, total re-aggregation, dialect-gap behavior) are the ones most likely to be silently broken today given the ECharts-first, encoding-driven history. They are marked P0/P1 precisely because a confident-but-wrong number is worse than a missing feature — verify before trusting the existing aggregation path.
