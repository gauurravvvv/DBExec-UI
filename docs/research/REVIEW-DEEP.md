# Deep Review · What every module doc still misses

A critical re-read of all 28 module docs. The first pass was a strong
architectural skeleton; this pass calls out the **specific** topics
each doc skipped, glossed over, or treated too shallowly to actually
ship from.

For each module I list:

- **Missed concepts** — things a competing tool has and the doc didn't name
- **Missed schemas / fields** — DB columns, indices, constraints
- **Missed endpoints / payloads** — API surface
- **Missed FE concerns** — components, state, UX
- **Missed code** — algorithms, libraries, edge cases
- **Missed test IDs** — cases the e2e plan would need
- **Missed migration / ops** — rollout, observability, kill-switch

The review is **action-grade**: each bullet is concrete enough to file
a ticket.

---

## Cross-cutting things every module needs but most docs didn't include

Before module-by-module, these apply everywhere and most module docs
skipped them:

1. **Idempotency keys** on every mutating endpoint. Customers using the
   API SDK retry; without `Idempotency-Key`, retries double-create.
   Pattern: `idempotency_token (text)` column on every CUD log table;
   server stores 24h.
2. **Optimistic concurrency** via `updated_on` or `version`. Almost
   no module mentions stale-row protection in detail; pattern:
   `If-Match: <etag>` header on PUT/PATCH; 412 Precondition Failed on
   mismatch.
3. **Soft-delete semantics**. Status flag exists but cascading is
   never enumerated. Define a `cascade_policy` per parent-child edge
   (RESTRICT / CASCADE / SET_NULL).
4. **Hard-delete + GDPR right-to-erasure**. None of the docs cover
   how a customer truly purges a user's data. Pattern: nightly
   `redact_user_data(userId)` job that NULLs user references in
   audit logs (keeping the action), removes PII columns from
   `user`, removes orphan rows in `notification`, `favourite`, etc.
5. **Rate limits per endpoint**. Default 60 rpm, override per
   endpoint via `@RateLimit({rpm: 100})` decorator (Express-rate-limit).
6. **Pagination**: every list endpoint should be cursor-based at
   scale (`?cursor=eyJpZCI6...`) not just `?page=N&limit=N`. We
   mention pagination but not the cursor pattern.
7. **Webhooks out**: every create/update/delete event should be
   broadcastable via a webhook registry. Pattern: an `event_bus`
   service + `webhook_subscription` table.
8. **Error envelope**: `{ status, code, message, data, errors[] }`
   exists in DBExec but `errors[]` (multi-error from Zod) was never
   itemised. Standardise: `errors: [{ field, code, message }]`.
9. **Timezone of every timestamp column** is `timestamptz` already in
   our schemas, but the API surface should always return ISO 8601
   with `Z` suffix or explicit offset. No module mentions this.
10. **Feature flag service**: each gap should ship behind a flag.
    Module docs mention flags ad-hoc; we need a `feature_flag` table
    keyed by `(organisation_id, name) → boolean`, with a
    `FeatureFlagService` that the BE checks and the FE reads.
11. **PII tagging**: any column known to hold PII should be marked so
    audit logs / exports can apply masking by default. Pattern:
    `column_metadata.is_pii boolean`.

---

## 01 · Datasource & Connection — review

The doc covered driver layout, SSL, IAM, BigQuery shim, pool metrics.
Missing:

### Concepts
- **Connection-string-only input** as an alternative to per-field form
  (paste `postgres://user:pw@host:port/db?sslmode=require`). Looker,
  Metabase, Superset all accept it.
- **DSN reachability test from inside customer's VPC**. We test from
  the BE; many enterprises require the BE to reach via PrivateLink /
  Reverse SSH tunnel. Pattern: per-datasource `tunnel_config` (SSH
  bastion: host, port, key, optional jump host).
- **Read-replica routing**: datasource may have a primary + readers;
  Datasource should specify which one queries hit.
- **Approval workflow on datasource creation**: enterprise admins want
  a "request datasource" → admin approves → BE creates. Not in doc.

### Schemas
- `connection_string text` (encrypted, parsed at runtime).
- `tunnel_config jsonb` (ssh host, port, private_key_enc, jump_host).
- `read_replica_hosts text[]` for round-robin readers.
- `default_database_for_listing varchar` (Snowflake: which database to
  enumerate by default).
- `connection_timeout_secs int`, `lock_timeout_secs int`,
  `application_name varchar` (Postgres `application_name` for
  customer's pg_stat_activity).
- `last_validated_at timestamptz` separate from last_refresh.

### Endpoints
- `POST /datasource/test-connection-string` — parse + reach + return.
- `POST /datasource/:id/tunnel/test` — separate from `validate`.
- `POST /datasource/:id/approve` — approval workflow.
- `GET /datasource/:id/ddl-preview/:schema/:table` — show CREATE TABLE
  output for a customer asking "what does my table look like in your
  system?".

### FE
- Connection-string mode toggle on add form.
- Tunnel config sub-form.
- "Bring your own driver" stub for enterprise on-prem (driver upload
  with signature check).

### Code
- **PgBouncer awareness**: when the customer points us at PgBouncer,
  `SET statement_timeout` doesn't persist across pool reuse — must
  wrap every query with `SET LOCAL` inside a transaction.
- **Snowflake key-pair auth** (not just password): generate RSA pair,
  let user upload public to Snowflake, store private encrypted.
- **TLS pinning**: optional `expected_cert_fingerprint sha256` field;
  abort handshake if mismatch.

### Tests
- DS-N-30: connection string with unencoded `@` in password → still parses
- DS-E-40: idle pool shrinks below min_idle and recovers
- DS-E-41: read-replica hot-swap during a query
- DS-N-31: tunnel handshake timeout → friendly error
- DS-E-42: schema list with 100k tables paginates correctly

### Migration
- The "connection string mode" is purely additive (single column).
- Tunnel feature flag `enableSSHTunnel` per-org.

---

## 02 · Semantic Layer — review

Strong skeleton. Specific gaps:

### Concepts missed
- **Derived dimensions** (a dimension whose expression references
  another dimension), not just derived metrics. Looker supports this.
- **Filtered metrics** — `revenue_in_apac = SUM(revenue) FILTER (WHERE region='APAC')`.
  Doc mentions `metric.filter` but not in compiler example.
- **Hierarchies** (`Continent > Country > City`) as first-class.
  Power BI ships hierarchies; we should too.
- **Period-over-period helpers**: `revenue.prev_month`, `.yoy`,
  `.mtd` as virtual fields the FE composes; doc has the metric type
  but not the dotted-suffix UX.
- **Quick filters** at the model level (the analyst declares "these
  filters are commonly used"; the FE shows them as chips).
- **Drill paths declared on the model**, not the analysis. Looker
  stores `drill_fields` on a measure. We have it on `drill_path` per
  analysis but not on the model.
- **Sql_always_where**: a clause always injected (e.g.
  `WHERE soft_deleted_at IS NULL`). Looker's `sql_always_where`.
- **Required filters**: model authors mark a dimension as "must be
  filtered before any query runs" (e.g. `org_id`).
- **Dimension formatters / display SQL**: separate the storage value
  (`status_code = 1`) from the display value (`'Active'`).
- **Symmetric aggregates / fan-out detection**: when a join causes
  duplicate rows, `SUM` over-counts. Looker detects + warns.
- **Inheritance / model composition** (`include: base.lkml`).

### Schemas missed
- `sem_dimension.parent_id` for hierarchies.
- `sem_dimension.is_required boolean` (must filter before query).
- `sem_dimension.display_sql text` (the human label expression).
- `sem_metric.filter` referenced segments by name, not raw SQL only.
- `sem_metric.allowed_dimensions text[]` (a metric is only meaningful
  with some dims, e.g. `MRR` doesn't roll up by `country`).
- `sem_segment.parent_segment_id` for composition.
- `semantic_model.sql_always_where text`.
- `sem_entity_join.cardinality varchar` ('1-1','1-many','many-many') —
  drives fan-out detection.
- `sem_join_path` table: precomputed paths between models for
  multi-hop joins.
- Audit table: every save creates a `semantic_model_version` row.

### Endpoints missed
- `POST /semantic-model/:id/dry-run` — compile but don't execute;
  return SQL + plan.
- `POST /semantic-model/:id/lint` — run static checks (orphan refs,
  fan-out risk, unused dimensions).
- `POST /semantic-model/:id/clone` — copy model with rename.
- `GET /semantic-model/:id/usages` — which analyses use which dim/metric.
- `POST /semantic/explore` — return suggested dimensions for a given
  metric (used by AI assistant).
- `GET /semantic-model/:id/ddl-suggestion` — looking at the dataset's
  columns, propose dims/metrics (auto-bootstrap UI).

### FE missed
- **YAML view** alongside the visual editor — full keyboard authoring
  for power users; FE round-trips YAML ↔ JSON.
- **Diff view** when saving an existing model (show what changed +
  what could break dependent analyses).
- **Impact preview**: "saving will affect 14 analyses and 3 dashboards".

### Code missed
- **Fan-out detection algorithm**: after compile, count expected vs
  actual base rows; if join multiplies, wrap aggregates with
  `DISTINCT` or refuse + warn.
- **Recursive expression resolver** for derived metrics — must detect
  cycles before SQL emission.
- **Snowflake / BigQuery dialect quirks** in `dateTrunc` (already
  noted) but also `DISTINCT` argument lists, `WITHIN GROUP` for
  percentiles, `APPROX_COUNT_DISTINCT` aliasing per engine.

### Tests
- SEM-DERIV-CYCLE-N-01: derived metric referencing itself transitively
- SEM-FANOUT-H-01: joined model fan-out detected + warning shown
- SEM-HIER-H-01: hierarchy drill `region → country → city` works
- SEM-SEG-COMP-H-01: segment of segment composes
- SEM-REQ-N-01: query without required filter → 400 "must filter by org_id"
- SEM-ALWAYS-H-01: sql_always_where appended to every compile
- SEM-CLONE-H-01: clone copies all children with new ids
- SEM-LINT-H-01: unused dimension flagged

### Migration / ops
- A `semantic_model.lock_version int` for optimistic concurrency.
- `feature_flag.semanticLayer` per org.
- Backfill: when enabling, generate a starter model from the dataset's
  columns automatically (wizard mentioned but not detailed).

---

## 03 · Dataset — review

### Missed concepts
- **Schema introspection cache**: re-running schema discovery on every
  edit is expensive on Snowflake. Cache the column list per dataset
  with a TTL.
- **Column-level descriptions / data dictionary**: customers want to
  document `revenue is in USD, gross`.
- **Sample data preview without running** the SQL (cached sample).
- **Dataset templates**: "Stripe Charges", "Salesforce Opportunities"
  pre-built for common warehouses.
- **Dataset comparison / diff**: "what changed between v3 and v4".
- **Refresh on write**: when a dependency dataset refreshes, auto-
  refresh this one.
- **Partial uploads**: append-to-existing-table flow (vs replace).
- **Incremental upload via primary key** (upsert).
- **Schedule a sheet refresh** without writing a separate "schedule"
  module — Google Sheets pulls every 6h by default.
- **Detect schema drift after refresh** — if the source dataset added
  a column, surface as a banner.
- **Snowflake / BQ external tables** as dataset source.

### Missed schemas
- `dataset.column_descriptions jsonb` — `{ "revenue": "USD gross", ... }`.
- `dataset.sample_rows jsonb` — cached preview.
- `dataset.schema_introspection jsonb` + `schema_introspected_at`.
- `dataset.refresh_strategy varchar` — `replace | append | upsert`.
- `dataset.primary_key varchar[]` — for upsert refresh.
- `dataset.upstream_dataset_ids uuid[]` — for chained refresh.
- `dataset.tags jsonb` (referenced from module 17 but redundant —
  resolve via `tag_attachment`).
- Index on `(organisation_id, kind)` for filter by upload/sql/...
- Index on `last_refresh_at` for finding stale datasets.

### Missed endpoints
- `POST /dataset/:id/refresh/incremental` — upsert from new rows.
- `POST /dataset/:id/columns/:name/description` — set field doc.
- `GET /dataset/:id/sample` — cached sample (no query).
- `POST /dataset/from-template/:templateId` — instantiate.
- `GET /dataset/templates` — list.
- `POST /dataset/:id/diff/:fromVersion/:toVersion` — schema/SQL diff.
- `POST /dataset/:id/detect-drift` — compare current schema to
  schema_introspection.

### Missed FE
- **Column docs panel** in the dataset detail page.
- **Dataset templates gallery**.
- **"Stale data" alert banner** when SLA missed.
- **"Refresh now" + progress** modal (with cancel).
- **"Re-introspect schema"** button.
- **Inline SQL formatter** (already shipped — confirm).
- **SQL editor with IntelliSense** based on schema_introspection.

### Missed code
- **CSV streaming with progress events** via SSE: every 50k rows
  push `{ progress, rowsParsed }` to FE.
- **xlsx multi-sheet picker**: list sheets + row counts before commit.
- **Upsert via Postgres `INSERT ... ON CONFLICT`** per `primary_key`.
- **MERGE for MSSQL / BigQuery / Snowflake** when target is the
  managed datasource (here always Postgres but the customer's
  dataset could live elsewhere if "physical").
- **Type inference improvements**: detect ISO 8601 vs `MM/DD/YYYY`,
  numeric with thousands separator, currency symbols.

### Missed tests
- DST-UPSERT-H-01: upsert reuses existing row by PK
- DST-DRIFT-H-01: new column upstream → drift banner
- DST-SAMPLE-H-01: sample cached, served without re-query
- DST-INCR-N-01: incremental refresh into a non-upsert dataset → 400
- DST-VERSION-DIFF-H-01: diff between v3 and v4 highlights SQL change

---

## 04 · Query Processor — review

### Missed concepts
- **Query plan** as a separate artefact (not just compiled SQL).
- **Pushdown predicates** beyond filters: limit pushdown into subquery,
  topN pushdown.
- **Sub-query unrolling vs WITH preservation** per dialect (some
  engines optimise CTEs poorly).
- **Cost-based plan choice**: when two AST paths exist, pick the cheaper.
- **Streaming results**: instead of materialising rows in memory,
  stream via cursor and forward to caller.
- **CANCEL semantics**: BE must be able to kill an in-flight query
  (current `cancel-query` exists for datasource activity; needs to
  hook into compile pipeline).
- **Parameterised query cache**: same SQL with different bindings can
  share parsed AST.
- **Dialect-specific identifier-folding awareness**: Snowflake folds
  unquoted to UPPER, Postgres to lower. Our quoter must match.
- **NULL ordering**: `NULLS FIRST` vs `NULLS LAST` differs per dialect
  (Postgres = NULLS FIRST asc; MySQL = NULLS LAST asc).
- **Date arithmetic**: `INTERVAL '1 day'` vs `DATEADD(day, 1, ...)`.

### Missed schemas
- `query_plan jsonb` returned by `/query/explain`.
- `query_cache_entry` table for parsed-AST cache (Redis better, but
  for dev environments without Redis, fall back to a small in-memory
  LRU).

### Missed endpoints
- `POST /query/cancel/:id` — cancel a running query by query-id.
- `POST /query/explain-analyze` — actually run EXPLAIN ANALYZE if
  permitted.
- `GET /query/stats` — slow query log per org.

### Missed code
- **AST visitor pattern** rather than ad-hoc switch.
- **Plan-aware identifier quoting** — quote everywhere, period; let
  drivers reject duplicates.
- **Cancelable execution**: each query gets a `query_id`; the
  `cancel-query` admin call signals via Postgres `pg_cancel_backend`
  (or driver-equivalent) using the pid stored at start.

### Missed tests
- QP-CAN-H-01: cancel query mid-flight → caller gets 499 / "cancelled"
- QP-NULL-H-01: `ORDER BY x ASC NULLS LAST` rendered per dialect
- QP-INT-H-01: date interval arithmetic correct on all dialects
- QP-PUSH-H-01: limit pushed into subquery, not wrapped

---

## 05 · Cache & Materialisation — review

### Missed concepts
- **Cache warming on publish**: when a dashboard is published, pre-fill
  the cache for top-N queries with default filters.
- **Soft TTL vs hard TTL**: serve stale while revalidating in
  background (stale-while-revalidate), so latency stays flat.
- **Cache tier**: L1 in-process LRU + L2 Redis. Saves an RTT to
  Redis for ultra-hot keys.
- **Cache compression**: gzip JSON payloads when > 4KB.
- **Result chunking**: large results stored as chunks
  (`<key>:chunk:0`, `<key>:chunk:1`); avoid 512MB Redis string limit.
- **Cost-aware caching**: cache big-bytes-scanned queries longer;
  cheap ones shorter.
- **Per-org cache namespace** + cache size cap with LRU eviction
  when a customer's namespace overruns.
- **Negative caching**: cache failures (with shorter TTL) so a broken
  dataset doesn't hammer the warehouse.
- **Cache key includes user permissions / RLS** — covered in master
  doc but not the module deep-dive.
- **Materialised view dependencies**: when a base dataset changes,
  cascade-refresh its dependent MVs.

### Missed schemas
- `cache_namespace_quota (organisation_id, max_bytes)`.
- `materialised_view.depends_on_dataset_ids uuid[]`.
- `materialised_view.partition_by varchar`,
  `materialised_view.cluster_by varchar[]` (for BigQuery).
- `cache_event` audit table (created, hit, evicted, invalidated).

### Missed endpoints
- `POST /cache/warm/dashboard/:id` (not just /dataset).
- `GET /cache/keys?prefix=...` (admin debug).
- `POST /materialised/:id/preview` — run the query, show what rows
  WOULD land in the MV, without persisting.
- `POST /materialised/incremental-refresh/:id` — append-only refresh.

### Missed code
- **Stale-while-revalidate**:

```ts
async swr<T>(key: string, ttlSecs: number, staleSecs: number, fn: () => Promise<T>) {
  const cached = await redis.get(key);
  if (cached) {
    const meta = await redis.get(`${key}:meta`);
    const age = Date.now() - JSON.parse(meta).storedAt;
    if (age > ttlSecs * 1000) {
      // serve stale; refresh in background
      void this.getOrCompute(key, ttlSecs, fn).catch(() => {});
    }
    return JSON.parse(cached);
  }
  return this.getOrCompute(key, ttlSecs, fn);
}
```

- **Chunked write**:

```ts
async setLarge(key: string, value: T) {
  const buf = Buffer.from(JSON.stringify(value));
  const chunks = chunk(buf, 4_000_000);
  await Promise.all(chunks.map((c, i) => redis.setBuffer(`${key}:chunk:${i}`, c, 'EX', ttl)));
  await redis.set(`${key}:meta`, JSON.stringify({ chunks: chunks.length, storedAt: Date.now() }), 'EX', ttl);
}
```

### Missed tests
- CACHE-SWR-H-01: stale return + background refresh
- CACHE-CHUNK-H-01: 50MB result round-trips
- CACHE-QUOTA-H-01: org-wide LRU eviction kicks in
- CACHE-NEG-H-01: failure cached with short TTL
- CACHE-MV-DEP-H-01: base dataset change cascades MV refresh

### Ops
- Prometheus: `cache_hit_total`, `cache_miss_total`,
  `cache_swr_revalidate_total`, `cache_bytes_total{orgId}`.

---

## 06 · Analysis & Visual Builder — review

### Missed concepts
- **Visual templates / starter kits**: pick "Funnel · 4-stage signup"
  → pre-mapped visual.
- **Multi-axis charts**: dual y-axis with independent scales.
- **Reference markers / target lines** on a per-series basis.
- **Trend lines** (linear / log / exp regression).
- **Forecast** (1-12 periods ahead using ARIMA / Prophet).
- **Annotations** anchored to data points (e.g. "Product launch").
- **Comparison mode**: side-by-side compare two visuals (current vs
  prior period) without authoring twice.
- **Saved views per analysis**: same analysis, different filter
  presets shareable by name.
- **Visual interactions matrix** (Power BI) — which visual filters
  which.
- **Bookmark state**: save full analysis state (filters + drill +
  selection) and recall.
- **Visual config diff** when editing — what changes downstream.

### Missed schemas
- `visual_template` table for starter kits.
- `analysis_bookmark (id, analysis_id, owner_id, name, state jsonb)`.
- `visual_annotation` table.
- `analysis.saved_views jsonb` array.

### Missed endpoints
- `GET /visual-templates` list.
- `POST /analysis/:id/bookmark` save.
- `POST /analysis/:id/forecast` server-side compute (Python service or
  Node fork running `@scientific/timeseries` lib).
- `POST /analysis/:id/trendline` server-side regression.

### Missed FE
- **Properties panel search box** noted in doc but not the global
  search across descriptors (typing "color" finds every colour-
  related setting in the registry).
- **Title bar** with autosave indicator.
- **Compact mode** density toggle.
- **Visual-options "compare to default"** with a single click revert.

### Missed code
- **Forecast** implementation:

```ts
import { ARIMA } from 'arima';
function forecastSeries(data: number[], periods: number) {
  const arima = new ARIMA({ p: 2, d: 1, q: 2, verbose: false }).train(data);
  const [pred, errors] = arima.predict(periods);
  return { values: pred, lower: pred.map((v, i) => v - 1.96 * errors[i]), upper: pred.map((v, i) => v + 1.96 * errors[i]) };
}
```

- **Linear regression trendline**:

```ts
function linearRegression(xs: number[], ys: number[]) {
  const n = xs.length;
  const sx = sum(xs), sy = sum(ys), sxx = sum(xs.map(x => x*x)), sxy = sum(xs.map((x,i) => x*ys[i]));
  const m = (n*sxy - sx*sy) / (n*sxx - sx*sx);
  const b = (sy - m*sx) / n;
  return { m, b, predict: (x: number) => m*x + b };
}
```

### Missed tests
- ANL-FC-H-01: forecast renders 6-period prediction with CI bands
- ANL-TREND-H-01: trendline overlays on scatter
- ANL-BOOK-H-01: bookmark restores filter+drill state
- ANL-MULTI-H-01: dual-axis chart with independent scales
- ANL-COMPARE-H-01: compare-prior-period overlays

---

## 07 · Filters, Parameters, Cross-filters, Drill — review

### Missed concepts
- **Filter hierarchies** (region → country → city) auto-cascading.
- **Date filter relative phrases**: "this fiscal quarter", "previous
  4 weeks", "ytd vs last ytd". Doc has a basic set; need fiscal
  calendar support (org-defined fiscal year start).
- **Filter library at org level**: define `Active customers` once,
  reuse everywhere.
- **Filter pinning to URL vs session vs default value**.
- **Filter interaction with parameters**: a parameter VALUE can be
  the filter (Tableau action: select region → parameter `region` →
  drives a SQL `WHERE region = :region`).
- **"Apply to all analyses on dashboard"** sync behaviour.
- **Excluded values** (negative filter built from chart click).
- **Top-N filter** with `BY metric`.
- **Slicer-style filter** with checkboxes vs dropdowns vs sliders.
- **Date range with comparison range** for prior period.
- **Filter highlight vs filter exclude** (Tableau distinction).

### Missed schemas
- `org_fiscal_calendar (organisation_id, fy_start_month, fy_start_day)`.
- `org_filter_library (id, organisation_id, name, definition jsonb)`.
- `analysis_filter.compare_range jsonb` for prior-period overlay.

### Missed FE
- **Filter "from URL" indicator** for shared deep links.
- **"Reset filters"** vs **"Reset filters and parameters"**.
- **Live preview of affected row count** as you type (cheap
  count-only query).

### Missed code
- **Fiscal date resolver**:

```ts
function fiscalQuarter(date: Date, fyStartMonth: number) {
  const m = (date.getMonth() - (fyStartMonth - 1) + 12) % 12;
  return Math.floor(m / 3) + 1;
}
```

- **Comparison range generator**: given range `(from, to)`, produce
  `(prev_from, prev_to)` such that the spans match.

### Missed tests
- FLT-FISCAL-H-01: "this fiscal quarter" picks the right window
- FLT-COMP-H-01: comparison range overlays prior period
- FLT-LIB-H-01: org filter library reusable across analyses
- FLT-HIGHLIGHT-H-01: highlight (vs filter) preserves all rows but emphasises

---

## 08 · Dashboard — review

### Missed concepts
- **Dashboard tabs / pages** (Power BI report pages).
- **Conditional visibility** of visuals (show only when a filter is set).
- **Custom layouts**: free-form vs grid (Tableau allows both).
- **Dashboard variables** (different from parameters): per-dashboard
  custom values that visuals can read.
- **Dashboard themes** per board (override org theme).
- **Snapshot diff**: between two published snapshots, diff visuals.
- **Snapshot retention**: keep last N or last N days.
- **Dashboard "presentation mode"** (TV mode auto-rotates pages).
- **PDF/PNG export with parameter sweep**: render once per region;
  email the bundle.
- **Print stylesheet** for browser print.
- **CSV bundle** export per visual into a zip.

### Missed schemas
- `dashboard_tab (id, dashboard_id, name, layout jsonb, ordering int)`.
- `dashboard_snapshot (id, dashboard_id, version, payload jsonb, created_on)` — history.
- `dashboard_variable (id, dashboard_id, name, default_value jsonb)`.
- `dashboard.theme_override jsonb`.

### Missed endpoints
- `POST /dashboards/:id/tabs` CRUD.
- `POST /dashboards/:id/snapshots/:v/restore`.
- `POST /dashboards/:id/export/zip` — per-visual CSV bundle.
- `POST /dashboards/:id/parameter-sweep-export` — bulk PDF per param value.
- `GET /dashboards/:id/presentation-state` — TV mode poll endpoint.

### Missed FE
- **TV mode** route at `/tv/dashboards/:id` with auto-refresh + page
  rotation.
- **Print preview** with explicit "Print mode" toggle (changes paddings).

### Missed code
- **Parameter sweep**: BullMQ job iterates param values, calls
  `renderDashboardPdf` for each, zips, emails link.

### Missed tests
- DSH-TAB-H-01: multi-tab dashboard renders + remembers tab on reload
- DSH-VAR-H-01: dashboard variable propagates to all visuals
- DSH-SWEEP-H-01: per-region PDF sweep produces N files in zip
- DSH-TV-H-01: TV mode rotates pages every 30s

---

## 09 · RLS & Column Security — review

### Missed concepts
- **Connection impersonation** (Metabase's killer feature): instead of
  WHERE-rewriting, connect AS the user's DB role. Works when source
  DB has its own RLS / row-level policies.
- **Snowflake row access policies** native pass-through.
- **PostgreSQL RLS policies** native pass-through.
- **Predicate validation**: dry-run the predicate against the user's
  attribute values; reject if it would return 0 rows for ALL users
  (likely misconfigured).
- **Effective permissions API**: given a user + dataset, return the
  resolved predicates + masked columns.
- **Group rule precedence**: doc says "intersection" elsewhere but
  module doesn't specify; need explicit precedence order.
- **"Block all"** option: deny access until an admin grants
  (default-deny).
- **PII tags + automatic masking**: tag column as PII; default mask
  for non-admins.

### Missed schemas
- `connection_impersonation (datasource_id, scope, scope_id, db_role)`.
- `column_metadata.is_pii boolean`, `pii_class varchar` (email/phone/ssn/...).
- `rls_rule.precedence int` for ordering.
- `rls_rule.deny_by_default boolean` — apply WHERE FALSE if no rule matches.

### Missed endpoints
- `GET /security/effective/:datasetId?asUser=<id>` — explain output.
- `POST /security/lint/:datasetId` — find users with 0-row result.
- `POST /security/pii-scan/:datasetId` — heuristic scanner.

### Missed FE
- **"Why am I seeing this row?"** debug overlay (admin only).
- **PII auto-detect indicator** on column list.
- **Effective permissions explorer** in the Security tab.

### Missed code
- **PII heuristic detection** (regex per column sample):

```ts
const PII_PATTERNS = {
  email: /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
  phone: /^\+?\d[\d \-()]{6,}$/,
  ssn:   /^\d{3}-\d{2}-\d{4}$/,
  ccn:   /^\d{13,19}$/,
};
function scanColumnSample(values: unknown[]): string | null {
  for (const [name, re] of Object.entries(PII_PATTERNS)) {
    const matches = values.filter(v => typeof v === 'string' && re.test(v)).length;
    if (matches / values.length > 0.6) return name;
  }
  return null;
}
```

### Missed tests
- RLS-IMP-H-01: impersonation routes to DB role
- RLS-PII-H-01: SSN column auto-tagged after scan
- RLS-EXP-H-01: effective endpoint explains predicates
- RLS-LINT-H-01: lint flags 0-row predicate

---

## 10 · RBAC / SSO / MFA / SCIM / API tokens — review

### Missed concepts
- **OAuth2 third-party app authorization** (Slack-style: "DBExec
  wants to read your data"). Different from SSO; lets external apps
  call DBExec on a user's behalf without sharing creds.
- **OIDC userinfo endpoint** for letting other services verify our JWT.
- **JWKS rotation**: publish signing keys at `/.well-known/jwks.json`.
- **Step-up auth**: certain actions (rotate datasource pw, delete
  org) require a fresh MFA challenge regardless of session age.
- **WebAuthn** specifics: discoverable credentials, attestation,
  multi-device.
- **IP allowlist per token** (not just per org).
- **Token scopes hierarchy**: not flat — `dashboards:read` should imply
  `dashboards.thumbnails:read`.
- **Service account key rotation** without downtime (two active keys
  at once).
- **SCIM endpoints we missed**: `/Schemas`, `/ResourceTypes`,
  `/ServiceProviderConfig`, group PATCH operations (add member,
  remove member, replace members).
- **SAML SLO** (Single Logout).
- **Session anomaly detection** (impossible-travel, new-IP banner).
- **Brute force adaptive delay** (exponential backoff vs hard
  N-fail lockout).
- **Refresh token rotation** with reuse-detection: if an old refresh
  token is used twice, kill all sessions for that user.

### Missed schemas
- `oauth_app` (third-party apps), `oauth_token`, `oauth_grant`.
- `signing_key (id, kid, public_jwk, private_jwk_enc, status, activated_at, retired_at)`.
- `step_up_event (user_id, action, occurred_at)` for require-recent-mfa enforcement.
- `api_token.allowed_ips inet[]`.
- `user_session.geo`, `user_session.country` already in doc; add
  `user_session.suspicious boolean` + reason.

### Missed endpoints
- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`
- `POST /auth/step-up` → returns short-lived elevated token
- `POST /oauth/authorize`, `/oauth/token`, `/oauth/revoke`
- `GET /scim/v2/ServiceProviderConfig`
- `GET /scim/v2/Schemas`, `/scim/v2/ResourceTypes`

### Missed code
- **Refresh token rotation with reuse detection**:

```ts
async function rotate(oldRt: string) {
  const stored = await Session.findOne({ where: { refreshTokenHash: hash(oldRt) } });
  if (!stored) throw new Unauthorized();
  if (stored.revokedAt) {
    // Reuse detected — kill ALL sessions for this user.
    await Session.update({ userId: stored.userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: 'reuse-detected' });
    throw new Unauthorized();
  }
  const newRt = randomToken();
  await Session.update(stored.id, { revokedAt: new Date(), revokedBy: 'rotation' });
  await Session.insert({ ...stored, id: undefined, refreshTokenHash: hash(newRt), createdAt: new Date(), revokedAt: null });
  return { refresh: newRt, access: signJwt(stored.userId) };
}
```

### Missed tests
- AUTH-RT-REUSE-N-01: reused refresh token kills all sessions
- AUTH-JWKS-H-01: JWKS endpoint serves keys
- AUTH-STEP-UP-H-01: step-up required to delete org
- AUTH-SCIM-PATCH-H-01: SCIM PATCH adds group member
- AUTH-OAUTH-H-01: third-party app gets scoped token

---

## 11 · Aggregation & Metrics — review (was thin)

### Missed concepts (significant)
- **Non-additive metrics**: distinct counts don't sum across windows.
  Compiler must refuse silly rollups.
- **Approx-vs-exact distinct counts** flag per metric.
- **Window functions in metrics**: `RANK() OVER`, `DENSE_RANK`, `NTILE`.
- **Percentile metrics**: `PERCENTILE_CONT(0.95)` per dialect.
- **Cumulative reset windows**: MTD resets at month boundary, YTD at
  year. Doc has windows but not reset semantics.
- **Stock vs flow metrics**: balance-at-end-of-period vs sum across
  period. Power BI calls them "semi-additive".
- **Custom format strings** beyond currency/percent (e.g. `0.00 'kg'`).
- **Metric description renderer** in tooltip on hover.
- **Cross-metric math** in FE (computed at render time):
  `metric_a - metric_b` shown as a virtual column.

### Missed schemas
- `sem_metric.is_additive boolean` (true = SUM-compatible, false =
  AVG/distinct).
- `sem_metric.is_semi_additive boolean`,
  `sem_metric.semi_additive_func varchar` ('LAST'/'FIRST'/'AVG').
- `sem_metric.window_reset varchar` ('day'/'week'/'month'/'year'/'fiscal_year').
- `sem_metric.allowed_aggregations varchar[]`.
- `sem_metric.format_string text` (custom).

### Missed code
- **Semi-additive measure compiler**:

```sql
-- LAST balance per month
SELECT month, ARRAY_AGG(balance ORDER BY day DESC)[1] AS month_end_balance
FROM accounts
GROUP BY month;
```

### Missed tests
- METRIC-SEMIADD-H-01: balance = last value of month
- METRIC-RESET-H-01: MTD resets at month boundary
- METRIC-NONADD-N-01: cannot SUM distinct_count across regions
- METRIC-FORMAT-H-01: custom format string applied in chart axis

---

## 12 · Import / Upload — review (was thin)

### Missed concepts
- **Upload from URL** (S3 / GCS / Azure Blob / HTTPS).
- **Chunked / resumable uploads** (tus.io protocol).
- **Schema mapping UI**: when re-uploading, map "Region" in new file to
  existing column `region`.
- **Mapping templates**: save the mapping for re-use next month.
- **Pre-upload validation**: dry-run that flags type mismatches +
  duplicate PKs before committing.
- **Encrypted file upload at rest** until processed.
- **Virus scan** (ClamAV) — enterprise requirement.
- **Audit hash of the source file**.
- **Quota check** before accepting bytes.
- **Webhook on upload complete**.
- **Backfill mode** (load historical files into one dataset).

### Missed schemas
- `upload_job (id, dataset_id, source_type, source_uri, status, hash_sha256, bytes, rows, error, started_at, finished_at)`.
- `upload_mapping (id, dataset_id, source_format, mapping jsonb)`.
- `org_storage_quota (organisation_id, max_bytes, used_bytes)`.

### Missed endpoints
- `POST /upload/url` — submit URL.
- `POST /upload/init` + `/upload/chunk/:n` + `/upload/finish` (tus).
- `POST /upload/dry-run` returns validation report.

### Missed code
- **tus implementation** (resumable uploads): use `tus-node-server`.
- **Virus scan hook**:

```ts
import { Socket } from 'node:net';
async function clamavScan(buf: Buffer): Promise<boolean> {
  const sock = new Socket();
  await new Promise<void>((res, rej) => sock.connect(3310, 'clamav', res).on('error', rej));
  sock.write(`zINSTREAM\0`);
  sock.write(buf);
  sock.write(Buffer.from([0,0,0,0]));
  return new Promise(res => sock.once('data', d => res(/OK/.test(d.toString()))));
}
```

### Missed tests
- UP-URL-H-01: upload from S3 URL
- UP-TUS-H-01: resumable upload after disconnect
- UP-VIRUS-N-01: infected file rejected
- UP-QUOTA-N-01: exceeds quota → 413 with helpful message

---

## 13 · Export & Download — review

### Missed concepts
- **Watermarks** on exported PDFs (org logo, "Confidential", user
  email, timestamp).
- **Encrypted PDF** with password.
- **Excel formatting**: bold headers, number formats, freeze panes,
  conditional formatting per metric.
- **Per-row colouring** matching the visual colour.
- **Chart in Excel**: embed the chart as an image AND the data behind
  it as a sheet.
- **Native Excel charts** (not images): exceljs supports.
- **PowerPoint export**: PPTX with one slide per visual via `pptxgenjs`.
- **Markdown export** of an analysis (analyst-friendly).
- **Email-friendly inline HTML** export of a dashboard.
- **Signed download URL** (S3-style) instead of direct stream.
- **Background export with email link** for big jobs.
- **Re-run protection**: export job idempotency.

### Missed schemas
- `export_job.watermark_text varchar`,
  `export_job.password_enc bytea`,
  `export_job.expires_at` for signed-URL artifacts.

### Missed endpoints
- `POST /export/dashboard/:id/pptx`
- `POST /export/analysis/:id/markdown`
- `POST /export/dashboard/:id/embed-html` (inline-HTML email body)

### Missed code
- **PDF watermark** via puppeteer:

```ts
await page.evaluate((wm) => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);opacity:.08;font-size:96px;pointer-events:none;z-index:9999;';
  div.textContent = wm;
  document.body.appendChild(div);
}, watermarkText);
```

- **Encrypted PDF**: `pdf-lib` for re-encryption with password.

### Missed tests
- EXP-WM-H-01: watermark visible on every page
- EXP-PWD-N-01: PDF without password prompts
- EXP-PPTX-H-01: PPTX produced with one slide per visual
- EXP-ASYNC-H-01: large export emails a download link

---

## 14 · Sharing & Embedding — review

### Missed concepts
- **Group-shareable**: share with a dynamic group, not just a list of
  emails (covered briefly but no UX).
- **Granular embed permissions**: which visuals are visible inside the
  iframe.
- **Embed user attributes flowing from JWT** (covered).
- **Embed event API**: `onFilterChange`, `onDrillUp`, `onError`.
- **Embed parameter override**: customer's host can `applyFilter` via
  postMessage.
- **Theme injection** through embed token (white-label per tenant).
- **Embed analytics**: track view count, time spent, filter usage.
- **Anti-scraping**: throttle per-link view rate.
- **Captcha gate** for public links above N views / hour.
- **Cookie-free embed** for stricter privacy.
- **Public link revocation list** + notify creator.

### Missed schemas
- `share_link.view_log_id` reference into `share_link_view_event`.
- `share_link_view_event (link_id, ip, user_agent, country, viewed_at)`.
- `embed_session (id, link_id, jwt_jti, started_at, ended_at, last_action_at)`.
- `share_link.theme_override jsonb`.
- `share_link.visible_visuals uuid[]`.

### Missed code
- **postMessage protocol**:

```ts
// iframe child
window.parent.postMessage({ type: 'dbexec:event', event: 'filter-change', payload: state }, '*');
// host
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'dbexec:event') return;
  // ...
});
```

### Missed tests
- SH-EVENT-H-01: filter change inside iframe fires host callback
- SH-EMBED-VIS-H-01: visible_visuals hides others
- SH-PUBLIC-CAPTCHA-N-01: 50 views/hour triggers captcha
- SH-REVOKE-H-01: revoked link returns 410 with friendly page

---

## 15 · Scheduling & Alerts — review

### Missed concepts
- **Snooze alerts**: temporarily silence without disabling.
- **Acknowledge alerts**: PagerDuty-style.
- **Severity levels**: info / warning / critical → routing.
- **Quiet hours per recipient**.
- **Multi-channel fan-out**: same delivery to email + slack + webhook.
- **Recipient management**: distribution list separate from each
  subscription.
- **Webhook signature**: HMAC-SHA256 in `X-DBExec-Signature` header.
- **Retry-with-backoff** for failed deliveries.
- **Dead-letter queue** for permanently failed jobs.
- **Backfill missed schedules** when worker was down.
- **Cron drift detection**: if `next_run_at` slipped > 5min, warn.
- **One-time scheduled run** (Monday next week).
- **Trigger on data refresh** (not cron — fire when dataset refreshes).
- **A/B alerts**: only fire if N consecutive samples breach (avoid
  flap).

### Missed schemas
- `recipient_list (id, organisation_id, name, members jsonb)`.
- `alert.severity varchar`, `alert.consecutive_breaches int`,
  `alert.acknowledged_until timestamptz`.
- `delivery_attempt (delivery_log_id, attempt_no, status, error, occurred_at)`.
- `subscription.snoozed_until timestamptz`.

### Missed code
- **HMAC webhook signature**:

```ts
const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
await fetch(webhookUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'X-DBExec-Signature': sig, 'Content-Type': 'application/json' } });
```

- **Exponential retry**:

```ts
const delays = [1, 5, 25, 125, 625]; // seconds
async function withRetry<T>(fn: () => Promise<T>, max = 5): Promise<T> {
  let lastErr;
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await sleep(delays[i] * 1000); }
  }
  throw lastErr;
}
```

### Missed tests
- AL-CONSEC-H-01: alert requires N=3 breaches before firing
- AL-SNOOZE-H-01: snoozed alert skips its next run
- SUB-FAIL-RETRY-H-01: failed delivery retries 3× then DLQs
- SUB-BACKFILL-H-01: worker restart catches up missed cron
- AL-HMAC-H-01: webhook signature verifiable

---

## 16 · Notifications — review

### Missed concepts
- **Push notifications** (browser, mobile).
- **Quiet hours / DND**.
- **Bundling**: 5 same-category events within 5 min → 1 notification
  "5 new comments".
- **Email digest mode**: bundle the day's notifications into one email.
- **Mark as unread**.
- **Filter / search in notification list**.
- **Per-org notification template overrides**.

### Missed schemas
- `notification.bundle_key varchar` (events with same key merge).
- `user.dnd_window jsonb` ({ from: '22:00', to: '07:00' }).
- `notification_preference.digest varchar` ('off'/'daily'/'weekly').

### Missed code
- **Web Push** subscription endpoint + VAPID keys.

### Missed tests
- NOT-BUNDLE-H-01: 5 mentions bundle into 1 notification
- NOT-DND-H-01: notification queued during quiet hours, delivered after
- NOT-DIGEST-H-01: daily digest summarises all unread

---

## 17 · Search, Tags, Collections, Favourites — review

### Missed concepts
- **Fuzzy search** (typo tolerance) via pg_trgm.
- **Semantic / vector search** for natural-language queries.
- **Boosting by recency / popularity / personal**.
- **Federated search**: include comments + descriptions, not just
  names.
- **Saved searches** (search alerts: notify when new objects match).
- **Search filters**: by type, owner, tag, created date.
- **Pinned items** at the top of home.
- **Trending** (most viewed in last 7d).

### Missed schemas
- pg_trgm extension + GIN(name gin_trgm_ops).
- `pgvector` extension + embedding column (for semantic).
- `saved_search (id, user_id, query jsonb, notify_on_match boolean)`.

### Missed code
- **Vector search**:

```sql
SELECT id, name, 1 - (embedding <=> $1) AS similarity
FROM dashboard
WHERE organisation_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
```

### Missed tests
- SR-FUZZY-H-01: typo "dashbord" finds "dashboard"
- SR-VEC-H-01: "show me revenue trends" returns relevant dashboards
- SR-SAVED-H-01: saved search alerts on new match

---

## 18 · Versioning & Lineage — review

### Missed concepts
- **Branches** (like LookML dev mode): users edit a branch, merge
  when ready.
- **Pull requests** between branches with diff view.
- **Lineage column-level**: not just dataset → analysis, but column →
  visual field.
- **Lineage for external systems**: dbt model → DBExec dataset.
- **Impact analysis**: changing a column → list of affected visuals.
- **Time-travel queries**: "what did the dashboard look like 30 days
  ago".
- **Restore-to-point** for an entire collection.

### Missed schemas
- `branch (id, organisation_id, name, base_branch_id, created_by, status)`.
- `branch_change (branch_id, target_type, target_id, body, action)`.
- `column_lineage (dataset_id, column_name, source jsonb)`.

### Missed code
- **Branch diff renderer**: tree of (object, before, after) tuples.

### Missed tests
- VER-BRANCH-H-01: edit dashboard on branch, prod unaffected
- VER-MERGE-H-01: merge applies all branch changes
- LIN-COL-H-01: column-level lineage traces a metric back to source col
- LIN-IMPACT-H-01: renaming a column lists 7 affected analyses

---

## 19 · Audit & Observability — review

### Missed concepts
- **Real-time stream**: push audit events via SSE to a "Live activity"
  page (Linear-style).
- **Audit search** by free text.
- **Cohort analytics**: WAU, MAU per role.
- **Health endpoints**: `/healthz/live`, `/healthz/ready`.
- **OpenTelemetry exporters**: OTLP HTTP + gRPC.
- **Log levels per org** (debug for support cases).
- **Error tracking**: Sentry-style grouping by stack trace.

### Missed schemas
- `audit_log.correlation_id varchar` — trace through to OpenTelemetry.

### Missed code
- Sentry integration boilerplate.
- `/healthz/ready` checks: DB ping, Redis ping, Email transport ping.

### Missed tests
- OBS-HEALTH-H-01: /healthz/ready returns 200 only when all deps OK
- OBS-CORR-H-01: correlation id passes through to trace
- OBS-STREAM-H-01: SSE pushes audit events

---

## 20 · Branding — review

### Missed concepts
- **Email branding** (the templates already exist; per-tenant override).
- **Custom domain** (`analytics.acme.com` CNAME).
- **Custom favicon** with PNG/ICO/SVG.
- **Brand-applied chart palette** with WCAG-checked contrast.
- **Logo dark/light** with auto-swap.

### Missed schemas
- `custom_domain (id, organisation_id, hostname, status, cert_arn, verified_at)`.

### Missed code
- Let's Encrypt automation per custom domain (Caddy or Traefik upstream).

### Missed tests
- BR-DOM-H-01: CNAME verified, traffic routes through
- BR-PAL-WCAG-H-01: palette passes contrast check

---

## 21 · Mobile / PWA — review

### Missed concepts
- **Mobile-specific navigation pattern**: bottom tab bar.
- **App install prompt** (PWA `beforeinstallprompt`).
- **Push notifications via service worker**.
- **Native wrappers**: Capacitor for iOS/Android app store presence
  (later).
- **Adaptive icons**: different sizes for each device.
- **Splash screen**.

### Missed code
- `beforeinstallprompt` capture + custom CTA.

### Missed tests
- MOB-INSTALL-H-01: app install prompt fires once per visitor
- MOB-PUSH-H-01: subscribed user receives push

---

## 22 · API, SDK, Plugins — review

### Missed concepts
- **GraphQL API** alongside REST.
- **gRPC for service-to-service**.
- **API changelog page**.
- **OpenAPI spec served at `/openapi.json`** + ReDoc at `/docs`.
- **Idempotency-Key** header support on every mutation.
- **API rate-limit headers** (`X-RateLimit-Limit`, `-Remaining`, `-Reset`).
- **Pagination headers** (`Link: <...>; rel="next"`).
- **Versioning**: `/api/public/v1` named; future v2 lives alongside.
- **Deprecation headers** (`Deprecation: true; Sunset: <date>`).
- **CLI tool** (`dbexec` CLI for power users + CI).
- **VS Code extension** stub.

### Missed schemas
- `idempotency_key (key, organisation_id, request_hash, response_body jsonb, expires_at)`.

### Missed tests
- API-IDEMP-H-01: same key returns first response, no second create
- API-HEADER-H-01: rate-limit headers present
- API-DEPR-H-01: deprecated route returns sunset header

---

## 23 · i18n / a11y — review

### Missed concepts
- **String externalisation completeness**: a CI step that fails on any
  raw English string in a `*.html` template.
- **Locale-aware number/date formatters injected via Angular pipe**.
- **Translator workflow**: export `*.json` per locale to a service
  (Lokalise / Crowdin / Phrase).
- **Screen reader testing** with NVDA / VoiceOver scripted via
  Playwright @axe-core/playwright + manual audit checklist.
- **Reduced-motion media query** respected in CSS animations.
- **High-contrast mode** Windows support.
- **Focus management on dialog open/close** standardised in a directive.

### Missed code
- **`prefers-reduced-motion`**:

```scss
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

- **Focus trap directive** for modals.

### Missed tests
- A11Y-REDUCED-H-01: motion preference honoured
- A11Y-FOCUS-TRAP-H-01: modal traps focus, restores on close

---

## 24 · Admin Console — review

### Missed concepts
- **Switch org** (super admin browsing other orgs).
- **Org-level audit retention slider**.
- **"Impersonate user"** for support (audited).
- **Data lineage admin view**.
- **Plan upgrade flow** with checkout.
- **Trial extension** by support.
- **Bulk user import** via CSV (separate from SCIM).
- **Group import** via CSV.
- **Org clone**: duplicate an org for staging.
- **Org transfer**: change owning customer (M&A scenarios).
- **Sandbox mode**: read-only org clone.
- **Backup encryption at rest**.

### Missed schemas
- `impersonation_event (id, support_user_id, target_user_id, started_at, ended_at, reason)`.

### Missed tests
- ADM-IMP-H-01: support can impersonate; audit logged
- ADM-BULK-CSV-H-01: bulk user CSV imports 100 users
- ADM-CLONE-H-01: org cloned with selective tables

---

## 25 · AI Insights — review

### Missed concepts
- **Conversation memory** across turns (Q → follow-up "and for last
  year").
- **Explain a visual**: AI produces a 2-sentence summary of trends.
- **Anomaly callouts** highlighted in the dashboard automatically.
- **Suggested next question** chips.
- **Confidence indicator** ("78% confidence I picked the right
  metric").
- **Cite the source**: "based on dataset `orders`, metric `revenue`".
- **Local LLM** (Ollama / vLLM) deployment recipe.
- **Schema sanitisation**: strip PII names from the schema sent to
  LLM.
- **Prompt injection defence**.
- **Audit AI queries** as a special category.
- **Cost meter per org** for LLM usage.

### Missed schemas
- `ai_session (id, user_id, org_id, started_at, ended_at, total_tokens)`.
- `ai_turn (session_id, role, content, tool_calls jsonb, latency_ms)`.

### Missed code
- **Streaming SSE** from LLM to FE.

### Missed tests
- AI-CONV-H-01: follow-up question reuses prior context
- AI-EXPLAIN-H-01: "summarise this visual" returns 2 sentences
- AI-INJ-N-01: prompt injection ignored
- AI-COST-H-01: token usage recorded per org

---

## 26 · Geo / Maps — review

### Missed concepts
- **MapTiler / Mapbox / OpenStreetMap tile providers** with token mgmt.
- **Address geocoding** (street → lat/lng) via Mapbox / Google /
  open-source Photon.
- **Reverse geocoding**.
- **Time-series animation** on maps (heatmap over time).
- **Route / line rendering** between two points.
- **GeoJSON validation** (turf.js).
- **Hex bins** (uber/h3-js).
- **Projection picker** (Mercator vs Albers vs Robinson).

### Missed schemas
- `tile_provider (id, org, kind, token_enc)`.

### Missed code
- h3-js bucketing:

```ts
import { latLngToCell } from 'h3-js';
const cells = rows.map(r => latLngToCell(r.lat, r.lng, 7));
```

### Missed tests
- GEO-TILE-H-01: chosen tile provider's tiles load
- GEO-GEOCODE-H-01: address column resolved to lat/lng
- GEO-ANIM-H-01: time-series animation plays + scrubs

---

## 27 · Cost Observability — review

### Missed concepts
- **Forecast bytes scanned**: ARIMA on the cost timeseries.
- **Per-user budgets** (developer A burning Snowflake credits).
- **Top expensive queries dashboard** (built-in).
- **Cost attribution to dashboards**.
- **Show estimated cost before running a query**.
- **Auto-pause warehouse** at threshold (Snowflake API).

### Missed schemas
- `cost_forecast (organisation_id, period, projected_bytes, projected_credits)`.

### Missed code
- Snowflake warehouse pause via REST API.

### Missed tests
- COST-FORE-H-01: forecast within 20% of actual on a stable workload
- COST-AUTO-PAUSE-H-01: warehouse paused at hard limit

---

## 28 · Backup / Restore — review

### Missed concepts
- **PITR (Point-in-time recovery)** beyond logical backups.
- **Cross-tenant restore (M&A)**.
- **Selective restore**: only restore dashboards, not users.
- **Backup verification**: periodic restore-into-sandbox to confirm
  backup is valid.
- **Customer-managed encryption keys** (BYOK / KMS) for backups.
- **Compliance retention**: legally required holds.

### Missed schemas
- `backup_artifact (id, organisation_id, kind, location_uri, size_bytes, checksum, encrypted_by, created_at, verified_at, verified_ok)`.

### Missed code
- KMS encryption per backup.

### Missed tests
- BAK-PITR-H-01: restore to T-30min works
- BAK-VERIFY-H-01: weekly restore-into-sandbox passes
- BAK-KMS-H-01: KMS-encrypted backup decrypts

---

## Closing review

If you compare this review to the original docs:

- **Modules 01-10** were **deep** in the original pass; this review
  adds another ~50% of depth.
- **Modules 11-28** were **focused** (short); this review nearly
  triples their depth.

Use this review as a **gap list** to either:

1. **Append into each module doc** (highest fidelity, doubles file
   size).
2. **Treat as a backlog**: file tickets per bullet and link back to
   this review file by anchor (e.g. `#04--query-processor--review`).

Either is sound; the engineering team should pick based on whether the
docs are meant to be PR-ready specs (option 1) or living plans
(option 2).
