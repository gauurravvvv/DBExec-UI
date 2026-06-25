# 12 · Filters / Parameters / Cross-filters / Drill — Deep Test Cases

## Fixtures
- Analysis with 3 visuals (Bar / Line / Pie) all over `chart_demo`.
- Time column `sold_at`.

## Filter bar — happy
- **FLT-H-01** · Category dropdown for region → all visuals re-render. P0
- **FLT-H-02** · Numeric range slider for sales → drag updates. P0
- **FLT-H-03** · Time range datepicker with preset chip "Last 7 days". P0
- **FLT-H-04** · Numeric equality (sales = 1000). P1
- **FLT-H-05** · Time equality (single date). P1
- **FLT-H-06** · List control (multi-checkbox). P1
- **FLT-H-07** · Text control (LIKE). P1
- **FLT-H-08** · Textarea (multi-line LIKE). P1
- **FLT-H-09** · Reorder filters by drag; sequence persists. P1
- **FLT-H-10** · Mandatory filter blocks canvas until value selected. P1
- **FLT-H-11** · Disable filter; greyed; not applied. P1
- **FLT-H-12** · Delete filter; canvas re-renders without it. P1

## Filter bar — negative
- **FLT-N-01** · filterType not in enum → 400. P0
- **FLT-N-02** · controlType not in enum → 400. P0
- **FLT-N-03** · Column not in dataset → 400. P0
- **FLT-N-04** · Batch with one invalid row → whole batch rejected. P0
- **FLT-N-05** · `sequence` negative → reject. P1
- **FLT-N-06** · Name > 100 → tooLong. P1
- **FLT-N-07** · Name empty → required. P0
- **FLT-N-08** · Column > 255 → tooLong. P1
- **FLT-N-09** · nullOption not in enum → reject. P1
- **FLT-N-10** · Update id from another org's analysis → 404. P0

## Filter bar — edge
- **FLT-E-01** · nullOption=NULLS_ONLY on non-nullable column → empty result. P1
- **FLT-E-02** · PATCH only `isEnabled` preserves other fields. P1
- **FLT-E-03** · Two filters on same column with conflicting ranges → intersection. P1
- **FLT-E-04** · Cascading filter (region narrows country options). P1
- **FLT-E-05** · Column dropped from dataset → filter hidden flagged. P1
- **FLT-E-06** · URL deep-link with filter state loads pre-applied. P1
- **FLT-E-07** · Time-zone aware → values in UTC, display in user locale. P1
- **FLT-E-08** · Numeric range with min > max → swapped or rejected. P1
- **FLT-E-09** · Slider with 0 distinct values → fallback control. P2
- **FLT-E-10** · 50 filters on one analysis → bar scrolls. P2

## Parameters
- **FLT-PARAM-H-01** · Param value substitutes in SQL. P0
- **FLT-PARAM-H-02** · Enum default = first allowed value. P1
- **FLT-PARAM-N-01** · Value outside enum → reject. P1
- **FLT-PARAM-N-02** · Param name pattern violation → reject. P1

## Cross-filters
- **FLT-CROSS-H-01** · Click bar A → filter applied to B and C. P0
- **FLT-CROSS-H-02** · Clear all → cross-filters removed. P0
- **FLT-CROSS-H-03** · Cross-filter scope: exclude visual D. P1
- **FLT-CROSS-N-01** · Cross-filter on chart that doesn't support → silent no-op. P2

## Drill
- **FLT-DRILL-H-01** · Drill region → country. P0
- **FLT-DRILL-H-02** · Drill-up (breadcrumb click). P1
- **FLT-DRILL-H-03** · Drill state survives reload (URL). P1
- **FLT-DRILL-N-01** · Drill on column missing post-edit → graceful. P1
- **FLT-DRILL-E-01** · Three-level drill (region → country → city) works. P1

## Fiscal date filters
- **FLT-FISCAL-H-01** · "This fiscal quarter" with FY start Feb 1 picks right window. P1
- **FLT-FISCAL-E-01** · Org with default FY=Jan 1 unchanged behaviour. P2

## URL state
- **FLT-URL-H-01** · Filters + params + drill all encoded; recipient loads same view. P0
- **FLT-URL-N-01** · Tampered URL ignored. P1

## Security
- **FLT-S-01** · Filter values parameterised (no SQL injection). P0 🟣
- **FLT-S-02** · Cross-org cascading values → 404. P0 🟣

## Performance
- **FLT-P-01** · 20 filters resolve their distinct values in parallel < 2s. P1 ⚡

## Regression buckets
- Cross-filter or drill changes → FLT-CROSS-*, FLT-DRILL-*
- URL state service → FLT-URL-H-01
