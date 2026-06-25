# DBExec — Cross-Module Glossary

Terms that appear across many module docs but are defined nowhere
in particular. Use this as the canonical source; the module docs
should link here rather than re-define.

Sorted alphabetically. Each entry: term, one-line definition,
where it's used, and (where useful) a pointer to the deeper
discussion.

---

## Additive metric

A metric where the value of the whole equals the sum of the parts.
`SUM(revenue)` is additive — `SUM` over the union equals the union
of `SUM`s. `COUNT_DISTINCT(user_id)` is *not* additive; you cannot
add the distinct counts of two partitions to get the distinct count
of the union.

See [11-aggregation-metrics §4](modules/11-aggregation-metrics.md#4-target-architecture)
for the additive/semi-additive/non-additive resolution algorithm.

## ACME (Automated Certificate Management Environment)

The RFC 8555 protocol for automated TLS certificate issuance. DBExec
uses it for custom-domain auto-TLS via Let's Encrypt. See
[20-branding §4](modules/20-branding.md).

## Approximate distinct

Cardinality estimate via HyperLogLog (or warehouse-native
`APPROX_COUNT_DISTINCT`). Used when exact `COUNT DISTINCT` is too
slow on large warehouses. Trades < 2% error for 100× throughput.
Bound to its own metric kind in module 11.

## Audit log (hash-chained)

Append-only log where row N stores `sha256(prev_hash ‖ canonical(N))`.
Tampering with any past row breaks the chain at that row and every
row after. Verified by re-walking. Defined in
[19-audit-observability §4–5](modules/19-audit-observability.md).

## BYOK (Bring Your Own Key)

Customer-supplied KMS key used for envelope encryption of their
data at rest. DBExec generates the per-object DEK; the customer's
KMS wraps the DEK. Defined in [28-backup-restore §4](modules/28-backup-restore.md).

## Canonical SQL

The compiled, parameterised SQL string the query processor produces
from a semantic intent — with stable column ordering, no inlined
literals, and no comments. Used as the cache key (after hashing
with the resolved RLS context). Defined in
[04-query-processor §4](modules/04-query-processor.md).

## Caveman mode

The user's global directive (from `/Users/gaurav.goel/.claude/CLAUDE.md`)
that conversational responses use compressed pidgin English while
code blocks, commits, PRs, and docs stay in normal English. Not a
product concept; relevant only to how this assistant communicates.

## Compiled query

See *Canonical SQL*.

## Connection (in DBExec sense)

A physical pool of DB credentials, named, attached to a datasource.
Multiple connections per datasource model "the same database, with
different DB users". The connection a query uses is resolved at
query time from `(datasource, role/user)`. See
[01-datasource-connection §4](modules/01-datasource-connection.md).

## Correlation ID

A 26-char ULID-ish string set in `X-Correlation-Id` by the API
gateway and propagated through every log line, audit row, queue
job, webhook call, and trace span for one logical request. Lets
you reconstruct an entire flow across services. Defined in
[19-audit-observability §4](modules/19-audit-observability.md).

## Cross-filter

When clicking a value on one visual filters every other visual on
the same dashboard tab (and optionally sibling tabs). Distinct from
*drill-through* (which navigates to a different analysis with
context). Defined in [07-filters-actions §4](modules/07-filters-actions.md).

## CSP frame-ancestors

The HTTP header that tells the browser which origins may embed
this response in an `<iframe>`. DBExec emits a per-share-link
frame-ancestors so that an embed link only renders inside the
customer's allowed origin. See [14-share-embed §4](modules/14-share-embed.md).

## Datasource (`datasource_s`)

The org-DB row that describes a logical analytic database — name,
engine type, default connection, schemas exposed. Owned by module
01.

## Dataset (`dataset`)

A reusable, named, semantically-typed view onto a datasource. Has
a name, a SQL or built-up query, a list of fields with type
annotations, and an RLS resolver. Owned by module 03.

## DEK / KEK

Data Encryption Key / Key Encryption Key. In KMS envelope
encryption, each object has its own DEK that encrypts the bytes,
and the DEK is itself wrapped by a customer-controlled KEK. Used
for backups (module 28), brand assets (20), and any signed export.

## Dialect

A specific SQL flavour (Postgres / MySQL / MSSQL / Oracle / Snowflake
/ BigQuery / Redshift / Athena / Databricks). The query processor
has one *dialect adapter* per dialect. Defined in
[04-query-processor §4](modules/04-query-processor.md).

## Drill-through

Click-through from a visual cell to a pre-configured target —
another analysis with the clicked dimension prefilled, a URL with
templated params, or a raw row preview. Distinct from *cross-filter*.
Defined in [07-filters-actions §4](modules/07-filters-actions.md).

## Embed App

A `share_link` of mode `embed`, bound to a registered
`embed_app` (= one customer integration with its own allowed
origins, JWT signing key, and audit subject). One customer can
own many embed apps. See [14-share-embed §4](modules/14-share-embed.md).

## ETag

Cache validator the API returns with cacheable responses. DBExec
uses strong ETags computed from the canonical query hash + RLS
context, so that two users on the same dashboard get different
ETags if their RLS resolves to different SQL. Defined in
[05-cache-materialisation §4](modules/05-cache-materialisation.md).

## Feature flag

`feature_flag` rows let us enable/disable a behaviour per org, per
user, or globally. Stored in the master DB. Every new P0 ships
behind a flag; the flag is removed once GA. Cross-cutting.

## GFS retention

Grandfather-Father-Son backup retention: keep 7 daily / 4 weekly /
12 monthly / 7 yearly. Used in module 28 for backup pruning.

## H3 cell

A hexagonal cell at one of 16 resolutions in Uber's H3 spatial
index. DBExec uses H3 to bucket millions of `(lat,lng)` points
into renderable counts. Defined in [26-geo-maps §4](modules/26-geo-maps.md).

## HMAC-signed webhook

Outbound webhook where the body is signed with
`HMAC-SHA256(secret, timestamp ‖ body)` and the signature is sent
in `X-DBExec-Signature: t=<ts>,v1=<hex>`. Receivers reject
signatures outside a 5-min replay window. Defined in
[15-scheduling-alerts §4](modules/15-scheduling-alerts.md)
and [22-api-sdk-plugins §4](modules/22-api-sdk-plugins.md).

## Idempotency-Key

Request header (UUID) that tells the API "if you've seen this key
in the last 24h, replay the prior response instead of executing
again". Required on every state-changing public-API endpoint.
Defined in [22-api-sdk-plugins §4](modules/22-api-sdk-plugins.md).

## Impersonation

An admin acting as another user temporarily. UI shows a pink banner;
every audit row written during the session has
`actor_user_id = admin` and `subject_user_id = impersonated`. See
[24-admin-console §4](modules/24-admin-console.md).

## Live mode (dashboard)

Dashboard view where every visual re-queries against current data
on each open and on a configurable poll interval. Contrast with
*snapshot mode* where the dashboard renders a captured point-in-time
result set. Defined in [08-dashboard §4](modules/08-dashboard.md).

## Managed datasource

A Postgres database owned by DBExec, into which uploaded CSV/XLSX
files are materialised — schema per org, table per upload. Lets
analysts "just upload a spreadsheet" without provisioning their
own warehouse. Defined in [12-import-upload §4](modules/12-import-upload.md).

## Master DB vs Shared / Org DB

DBExec is multi-tenant. The *master DB* holds org records,
super-admin users, billing, feature flags, and pointers to each
org's *shared / org DB*. The *shared / org DB* (one per org) holds
that org's datasets, analyses, dashboards, users, audit log, etc.
Almost every entity in these docs is in the shared DB; master
entities are the exception.

## Org-DB boundary

The principle that no API call may read or write across two
orgs' shared DBs without an explicit, audit-logged super-admin
operation. Enforced by `VerifyResourceMiddleware` +
`VerifyDatabaseMiddleware`. See [10-auth-rbac-sso §4](modules/10-auth-rbac-sso.md).

## Parameter

A user-supplied or context-supplied value that the query processor
binds into the compiled SQL. Modelled as `analysis_parameter` rows
with type, default, allowed-values rule, and a name. Distinct from
*filter* (which constrains the result set without changing the
shape). Defined in [06-analysis-visual-builder §4](modules/06-analysis-visual-builder.md)
and [07-filters-actions §4](modules/07-filters-actions.md).

## PITR (Point-in-time recovery)

Restoring a database to its state at an arbitrary timestamp using
WAL replay. Postgres + WAL archiving = the BCDR feature in module 28.

## pgvector

Postgres extension storing dense float vectors with cosine /
L2 distance operators. DBExec uses it for hybrid search ranking
(module 17) and AI semantic recall (module 25).

## Plugin (custom viz / transform / channel)

User-supplied code that runs in a sandboxed iframe (for viz/transforms)
or via a webhook (for channels). Versioned, signed, scope-checked.
Defined in [22-api-sdk-plugins §4](modules/22-api-sdk-plugins.md).

## prefers-reduced-motion

CSS media query that turns off non-essential animations. Required
for WCAG 2.1 SC 2.3.3. Used across every animated component in the
FE. Defined in [23-i18n-a11y §4](modules/23-i18n-a11y.md).

## Quota

Per-org cap on a measurable resource: rows queried per day,
storage GB, scheduled emails per month, API requests per minute,
seats. Tracked in module 24, surfaced in module 27 for paid
warehouses.

## Replay protection (JWT)

A JWT can be intercepted; replay protection means the token can
only be exchanged once. DBExec stores the `jti` of every signed
embed token in Redis with the same TTL as the token, and rejects
any token whose `jti` is already present. See
[14-share-embed §4](modules/14-share-embed.md).

## RLS resolver

A function `(user, dataset) → list of filter predicates` that
takes a logged-in user and the dataset they're about to query,
and returns the WHERE-clause fragments that must be appended.
Resolves group memberships, user attributes, and column masks.
Defined in [09-rls-column-security §4](modules/09-rls-column-security.md).

## Semantic Layer / Semantic Model

A reusable, declarative description of a business model:
entities (= tables with primary keys), joins between them,
dimensions (= attributes that can be grouped), and metrics (=
aggregations with additivity rules). The query processor compiles
a semantic *intent* to canonical SQL using the model. Defined in
[02-semantic-layer.md](modules/02-semantic-layer.md).

## Semi-additive metric

A metric that's additive across some dimensions but not others.
E.g., `inventory_on_hand` adds across warehouses but not across
days. The metric kind in module 11 declares which dimensions are
additive.

## SCIM (System for Cross-domain Identity Management)

The RFC 7644 protocol for provisioning users/groups from an IdP
(Okta, Azure AD) into a downstream app. DBExec exposes a SCIM 2.0
endpoint on `/scim/v2/...`. Defined in [10-auth-rbac-sso §4](modules/10-auth-rbac-sso.md).

## Snapshot

A captured point-in-time copy of an analysis result, a dashboard
state, or an entire org. Used for: scheduled email of "yesterday's
numbers", paused exec dashboards, audit snapshots for compliance.
Snapshot dashboards do not re-query — they replay the stored
result. Defined in
[`../research/modules/dashboard-snapshot-model.md`](modules/dashboard-snapshot-model.md)
(if present, else [08-dashboard](modules/08-dashboard.md)).

## SSO (SAML / OIDC)

Single Sign-On — the customer's IdP authenticates the user;
DBExec receives a signed assertion / token. SAML for older
enterprises, OIDC for modern apps. Defined in
[10-auth-rbac-sso §4](modules/10-auth-rbac-sso.md).

## SSRF guard

Server-Side Request Forgery protection: when DBExec fetches a URL
on behalf of a user (URL upload, webhook callbacks, AI providers,
brand-asset URL), it resolves the hostname, rejects RFC1918,
loopback, link-local, and known cloud-metadata IPs, and uses a
pinned DNS resolver to avoid TOCTOU. Cross-cutting.

## Tile provider

A map-tile source — OSM, Mapbox, MapTiler, Google. DBExec lets
each org pick a provider per-map (with credential storage and per-
tile-call cost telemetry). Defined in [26-geo-maps §4](modules/26-geo-maps.md).

## tsvector

Postgres full-text search type. Combined with `pg_trgm` (trigram
similarity) and `pgvector` (semantic) for the hybrid ranker.
Defined in [17-search-catalogue §4](modules/17-search-catalogue.md).

## User attribute

A key-value pair attached to a user (e.g. `region=APAC`,
`territory=NSW`) that the RLS resolver can read to compute filters.
Sourced from SSO claims, SCIM payload, or admin entry. Defined
in [09-rls-column-security §4](modules/09-rls-column-security.md).

## VAPID

Voluntary Application Server Identification — the RFC 8292
protocol that lets DBExec push Web Push notifications without an
intermediary. Keys per environment, rotated annually. Defined in
[16-notifications §4](modules/16-notifications.md).

## Verify-restore

Weekly cron job that picks the latest backup, restores it into a
sandbox Postgres schema, runs a row-count and checksum check,
records pass/fail, and emails on failure. Catches the silent
"backups all green but unrestorable" failure mode. Defined in
[28-backup-restore §4](modules/28-backup-restore.md).

## Watermark

Translucent text overlay (e.g. "Confidential · gaurav@acme · 2026-06-26")
on exported PDFs and rendered images. Per-org configurable;
mandatory for high-risk shares. Defined in
[13-export-download §4](modules/13-export-download.md).

## WCAG 2.1 AA

The accessibility standard DBExec targets: AA-level success
criteria for perceivable / operable / understandable / robust.
Audited via axe-core in CI plus quarterly manual review. Defined
in [23-i18n-a11y §4](modules/23-i18n-a11y.md).

## WebAuthn / FIDO2

Passwordless biometric authentication (Face ID, Touch ID,
hardware keys). DBExec uses it for MFA second factor and for
biometric unlock on mobile. Defined in
[10-auth-rbac-sso §4](modules/10-auth-rbac-sso.md) and
[21-mobile-pwa §4](modules/21-mobile-pwa.md).
