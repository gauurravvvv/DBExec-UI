# DBExec — build-order plan

> How to pick which module to ship next. Eight phases, ordered
> by dependency + customer impact. Each phase names the modules,
> says **why now**, links the research & implementation docs,
> and lists the concrete deliverables.

**Last updated:** 2026-06-26.

---

## 0. How to read this plan

Three rules I followed when ordering:

1. **Foundations first.** If module B reads module A's
   entities, A ships first. Otherwise B's tests have to mock
   A and you ship the same code twice.
2. **One customer-visible win per phase.** A phase that
   doesn't end with a demo-able feature is hard to defend.
3. **Risk-front-loaded.** Anything with regulatory teeth
   (RLS, audit, GDPR) ships early — refactoring those into a
   live product is twice as painful.

Per-phase shape:

- **Goal** — what's true at end of phase.
- **Modules** — research doc + implementation companion.
- **Why now** — what unlocks, what depends.
- **Customer-visible deliverable** — the "we shipped X" line.
- **Exit criteria** — what must be true before the next phase.

See [`research/00-INDEX.md`](research/00-INDEX.md) for the full
module catalogue and dependency graph; see
[`research/GLOSSARY.md`](research/GLOSSARY.md) for terms used
below.

---

## Phase 0 — Stabilise what's already in product

**Goal:** harden today's code before adding to it.

Today: the codebase already has dashboards, analyses, datasets,
charts, role-based UI. The audit pass identified a stack of
correctness bugs (`docs/hardening/`). Fix those before stacking
new features on top.

| Module | Research | Implementation | Effort |
|---|---|---|---|
| existing modules (focus on Dataset / Analysis / Dashboard / RLS) | — | [`hardening/PLAN-FOUR-MODULES-HARDENING.md`](hardening/PLAN-FOUR-MODULES-HARDENING.md), [`hardening/CODE-READ-FINDINGS.md`](hardening/CODE-READ-FINDINGS.md) | M |

**Why now:** every later phase trusts these to behave. Don't
build a semantic layer on top of a buggy dataset editor.

**Deliverable:** zero P0 / P1 from the hardening plan
outstanding; CI green; type-check clean.

**Exit criteria:** the four hardening lists are closed; e2e
suite passes on master.

---

## Phase 1 — Foundations (security, exec, data shape)

**Goal:** the trust + correctness substrate every later phase
sits on. Three modules, all P0.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 10 | Auth / SSO / MFA / SCIM / API tokens | [`research/modules/10-auth-rbac-sso.md`](research/modules/10-auth-rbac-sso.md) | [`implementation/AUTH-SSO-MFA-SCIM.md`](implementation/AUTH-SSO-MFA-SCIM.md) | L |
| 04 | Query processor / dialect compiler | [`research/modules/04-query-processor.md`](research/modules/04-query-processor.md) | [`implementation/QUERY-PROCESSOR.md`](implementation/QUERY-PROCESSOR.md) | L |
| 09 | RLS & column security | [`research/modules/09-rls-column-security.md`](research/modules/09-rls-column-security.md) | [`implementation/RLS-COLUMN-SECURITY.md`](implementation/RLS-COLUMN-SECURITY.md) | L |

**Why this order within the phase:**

1. **10 Auth first.** API tokens unblock public API consumers
   and SCIM unblocks IT. Customers won't even start a POC
   without SAML. Ship in the sub-order recommended in §9 of
   that doc: API tokens → MFA (TOTP) → SAML → OIDC → WebAuthn
   → SCIM.
2. **04 Query processor.** Every read path you'll touch later
   compiles through this. Refactor today's ad-hoc per-engine
   code into the dialect-adapter shape before semantic layer +
   metrics need it.
3. **09 RLS.** Sits above 04 (RLS is a plan-rewrite hook).
   Without 04 in place first, RLS has to thread through two
   query paths — duplicated work.

**Customer-visible deliverable:** "Sign in with Okta. Your
data is filtered by your territory. Your warehouse is BigQuery
or Snowflake or Postgres and it just works."

**Exit criteria:**
- SSO works for at least SAML + one IdP (Okta).
- TOTP MFA opt-in.
- At least 3 dialect adapters live (PG, BQ, SF).
- One RLS rule per dataset can restrict rows; one column mask
  works end-to-end.
- Hash-chained audit (from Phase 3) is not yet required — but
  every controller in Phase 1 should be writing the
  correlation_id field even before the chain ships.

---

## Phase 2 — Reusable data shape

**Goal:** authors define metrics + dimensions once, in one place,
used by every analysis / dashboard / AI tool.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 02 | Semantic layer | [`research/modules/02-semantic-layer.md`](research/modules/02-semantic-layer.md) | [`implementation/SEMANTIC-LAYER.md`](implementation/SEMANTIC-LAYER.md) | L |
| 11 | Aggregation & metrics | [`research/modules/11-aggregation-metrics.md`](research/modules/11-aggregation-metrics.md) | [`implementation/AGGREGATION-METRICS.md`](implementation/AGGREGATION-METRICS.md) | M-L |
| 03 | Dataset (v2) | [`research/modules/03-dataset.md`](research/modules/03-dataset.md) | [`implementation/DATASET.md`](implementation/DATASET.md) | M |

**Why this order:**

1. **02 first.** It's the noun the metric compiler binds to.
2. **11 second.** Bolt the nine metric kinds onto the model.
3. **03 third.** Dataset improvements (PII flag, params,
   relations) build on the semantic layer hooks and feed
   uploaded data into the model.

**Why this phase before customer-visible features:** every
P0 customer use case (AI, scheduled reports, cost telemetry,
charts) eventually wants a consistent definition of "revenue".
Without 02, you build that consistency into every consumer
separately and they drift.

**Customer-visible deliverable:** "An analyst defines `revenue`
once. Every dashboard, every alert, every AI query uses the
same definition. We catch non-additive misuse at lint time."

**Exit criteria:**
- An org can publish at least one semantic model.
- A dashboard tile uses a semantic intent (not raw SQL).
- Lint catches the eight rules listed in
  [`implementation/SEMANTIC-LAYER.md §4`](implementation/SEMANTIC-LAYER.md).
- Five of nine metric kinds are GA (simple, ratio, derived,
  percentile, approx_distinct). The other four can ship in
  Phase 4.

---

## Phase 3 — Compliance plumbing

**Goal:** SOC2 / GDPR / enterprise security questionnaire
answers ship in product, not in a sales deck. Three modules.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 19 | Audit & observability | [`research/modules/19-audit-observability.md`](research/modules/19-audit-observability.md) | [`implementation/AUDIT-OBSERVABILITY.md`](implementation/AUDIT-OBSERVABILITY.md) | M |
| 28 | Backup & restore | [`research/modules/28-backup-restore.md`](research/modules/28-backup-restore.md) | [`implementation/BACKUP-RESTORE.md`](implementation/BACKUP-RESTORE.md) | L |
| 01 | Datasource & connection (v2) | [`research/modules/01-datasource-connection.md`](research/modules/01-datasource-connection.md) | [`implementation/DATASOURCE-CONNECTION.md`](implementation/DATASOURCE-CONNECTION.md) | M |

**Why this order within the phase:**

1. **19 first.** Hash-chained audit + correlation IDs +
   `/healthz` `/readyz` `/statusz`. Every other module's
   compliance story leans on this.
2. **28 second.** KMS envelope encryption + BYOK +
   verify-restore. The infra rest-of-Phase-3 (and Phase 7 —
   admin) builds on this.
3. **01 third.** Pool + secrets + health-check + schema cache.
   Easy compared to 19 / 28 and unblocks Phase 4.

**Customer-visible deliverable:** "Auditor can pull a tamper-
evident log of who touched what, when. We back up nightly, we
verify the backups restore, and we encrypt with your KMS key
if you bring one."

**Exit criteria:**
- Hash-chain verify-endpoint returns OK over a 30-day window.
- `/healthz` / `/readyz` / `/statusz` split live.
- Nightly verify-restore is green for at least 2 weeks.
- BYOK supported for at least one KMS provider (AWS first).

---

## Phase 4 — Authoring & consumption (the daily-driver UX)

**Goal:** the authoring loop is fast, predictable, and full
of the right affordances. Five modules.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 06 | Analysis & visual builder | [`research/modules/06-analysis-visual-builder.md`](research/modules/06-analysis-visual-builder.md) | [`implementation/ANALYSIS-VISUAL-BUILDER.md`](implementation/ANALYSIS-VISUAL-BUILDER.md) | L |
| 07 | Filters / parameters / cross-filters / drill | [`research/modules/07-filters-actions.md`](research/modules/07-filters-actions.md) | [`implementation/CROSS-TAB-DRILL-THROUGH.md`](implementation/CROSS-TAB-DRILL-THROUGH.md) | M |
| 08 | Dashboard (multi-tab) | [`research/modules/08-dashboard.md`](research/modules/08-dashboard.md) | [`implementation/MULTI-TAB-DASHBOARD.md`](implementation/MULTI-TAB-DASHBOARD.md) | L |
| 05 | Cache & materialisation | [`research/modules/05-cache-materialisation.md`](research/modules/05-cache-materialisation.md) | [`implementation/CACHE-MATERIALISATION.md`](implementation/CACHE-MATERIALISATION.md) | M |
| 13 | Export & download | [`research/modules/13-export-download.md`](research/modules/13-export-download.md) | [`implementation/PER-TAB-SCHEDULED-EXPORTS.md`](implementation/PER-TAB-SCHEDULED-EXPORTS.md) | M |

**Why this order:**

1. **06 first.** The chart-type-change reconciler + the
   encoding-vs-config split fix today's biggest UX bug class.
2. **07 second.** Cross-filter, drill, and the
   `visual_action` table are short hops from 06.
3. **08 third.** Multi-tab + URL state + live mode. Builds on
   the analysis pieces.
4. **05 fourth.** Once the dashboard is live, cache is what
   keeps it fast. Without 05, dashboards re-query everything
   on every view.
5. **13 fifth.** Export depends on the dashboard being stable.

**Customer-visible deliverable:** "An analyst builds a
multi-tab dashboard with cross-filter and drill-through.
Opens fast (cache). Exports as PDF, watermarked, on schedule."

**Exit criteria:**
- Cross-filter works on at least bar/line/heatmap.
- Multi-tab dashboard URL state is browser-back / shareable.
- Cache hit rate on a busy dashboard ≥ 60%.
- A scheduled PDF export with cover sheet + tab-per-page
  ships to a real inbox.

---

## Phase 5 — Distribution

**Goal:** customers don't just consume DBExec inside DBExec.
They subscribe, share, embed.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 15 | Scheduling, subscriptions, alerts | [`research/modules/15-scheduling-alerts.md`](research/modules/15-scheduling-alerts.md) | [`implementation/PER-TAB-SCHEDULED-EXPORTS.md`](implementation/PER-TAB-SCHEDULED-EXPORTS.md) | M |
| 16 | Notifications | [`research/modules/16-notifications.md`](research/modules/16-notifications.md) | [`implementation/NOTIFICATIONS.md`](implementation/NOTIFICATIONS.md) | M |
| 14 | Sharing & embedding | [`research/modules/14-share-embed.md`](research/modules/14-share-embed.md) | [`implementation/SHARE-EMBED.md`](implementation/SHARE-EMBED.md) | L |

**Why this order:**

1. **15 + 16 paired.** Subscriptions are the most common
   notification source; they share the BullMQ scheduler and
   the channel dispatcher. Build them together.
2. **14 third.** Once subscriptions are stable, public/embed
   links use the same render pipeline (module 13). The JWT
   replay-protection + per-link CSP work is its own week.

**Customer-visible deliverable:** "Weekly PDF lands in
finance@acme.com on Monday at 7am. Sales rep gets a Slack
notification when their pipeline crosses threshold. Customer-
facing dashboard embedded in the customer's portal."

**Exit criteria:**
- Three channels live: email, Slack, webhook.
- DND + critical-override paths tested.
- Public-link mode + embed mode both have a design partner.

---

## Phase 6 — Discovery & collaboration

**Goal:** as the org grows past 50 dashboards, people can find
things, see history, and pick up each other's work.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 17 | Search / tags / collections / favourites | [`research/modules/17-search-catalogue.md`](research/modules/17-search-catalogue.md) | [`implementation/SEARCH-CATALOGUE.md`](implementation/SEARCH-CATALOGUE.md) | M-L |
| 18 | Versioning & lineage | [`research/modules/18-versioning-lineage.md`](research/modules/18-versioning-lineage.md) | [`implementation/VERSIONING-LINEAGE.md`](implementation/VERSIONING-LINEAGE.md) | L |
| 12 | Import & upload | [`research/modules/12-import-upload.md`](research/modules/12-import-upload.md) | [`implementation/IMPORT-UPLOAD.md`](implementation/IMPORT-UPLOAD.md) | L |

**Why this order:**

1. **17 first.** Cmd-K palette + hybrid search. Becomes
   essential the moment an org has 200+ entities.
2. **18 second.** Per-entity version tables, diff viewer,
   lineage edges, impact preview.
3. **12 third.** Self-serve upload (managed Postgres,
   resumable tus, column inference). Strictly speaking
   independent of 17/18, but pairs well with this phase's
   "people get more done on their own" theme.

**Customer-visible deliverable:** "Cmd-K finds anything in 2
keystrokes. Every change is versioned with a diff. Delete a
dataset and see what breaks before confirming. Upload a CSV
and chart it in a minute."

**Exit criteria:**
- Cmd-K p95 < 250 ms.
- Rollback works on dataset, analysis, dashboard.
- A 100 MB CSV upload + first chart in < 60 s end-to-end.

---

## Phase 7 — Enterprise & platform polish

**Goal:** the answers an enterprise procurement team needs.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 24 | Admin console & org settings | [`research/modules/24-admin-console.md`](research/modules/24-admin-console.md) | [`implementation/ADMIN-CONSOLE.md`](implementation/ADMIN-CONSOLE.md) | L |
| 20 | Branding & white-label | [`research/modules/20-branding.md`](research/modules/20-branding.md) | [`implementation/BRANDING.md`](implementation/BRANDING.md) | M-L |
| 23 | i18n & a11y | [`research/modules/23-i18n-a11y.md`](research/modules/23-i18n-a11y.md) | [`implementation/I18N-A11Y.md`](implementation/I18N-A11Y.md) | L |
| 22 | API / SDK / plugins | [`research/modules/22-api-sdk-plugins.md`](research/modules/22-api-sdk-plugins.md) | [`implementation/API-SDK-PLUGINS.md`](implementation/API-SDK-PLUGINS.md) | L |
| 27 | Cost observability | [`research/modules/27-cost-observability.md`](research/modules/27-cost-observability.md) | [`implementation/COST-OBSERVABILITY.md`](implementation/COST-OBSERVABILITY.md) | M |

**Why this order:**

1. **24 first.** Unified admin shell + impersonation + GDPR.
   Sales blocker for enterprise.
2. **20 second.** Token-driven branding + ACME auto-TLS for
   custom domain.
3. **23 third.** ICU MessageFormat + axe-core in CI. Don't
   ship to non-English markets without this. Going from "we
   support i18n" to "ja-JP localised" then becomes a content
   exercise, not a code exercise.
4. **22 fourth.** Public API + OpenAPI + SDK + webhooks +
   plugin runtime. Unlocks automation customers.
5. **27 fifth.** Cost telemetry + budgets + auto-pause. Needed
   only when paid-warehouse customers are real revenue.

**Customer-visible deliverable:** "Customer logo on the
dashboard, customer's domain in the address bar, in their
language, with their MSP's API integration, with budgets that
auto-pause the warehouse."

**Exit criteria:**
- Admin shell replaces all scattered admin pages.
- One white-label design partner live on custom domain.
- Spanish + French + German bundles GA.
- API v1 frozen + OpenAPI published + JS SDK on npm.
- Budgets fire alerts in soak.

---

## Phase 8 — Reach & intelligence

**Goal:** the things that take DBExec from "another BI" to
"the BI". Three modules.

| # | Module | Research | Implementation | Effort |
|---|---|---|---|---|
| 21 | Mobile / PWA | [`research/modules/21-mobile-pwa.md`](research/modules/21-mobile-pwa.md) | [`implementation/MOBILE-PWA.md`](implementation/MOBILE-PWA.md) | M |
| 26 | Geo, maps, specialty charts | [`research/modules/26-geo-maps.md`](research/modules/26-geo-maps.md) | [`implementation/GEO-MAPS.md`](implementation/GEO-MAPS.md) | M |
| 25 | AI insights & dashboard generation | [`research/modules/25-ai-insights.md`](research/modules/25-ai-insights.md) + [`implementation/AI-DASHBOARD-GENERATION.md`](implementation/AI-DASHBOARD-GENERATION.md) | L |

**Why this order:**

1. **21 first.** PWA + biometric unlock is light if all the
   substrate (auth, branding, notifications) is in place.
2. **26 second.** Tile providers, choropleth, point map, H3
   heatmap. The specialty chart family unlocks logistics +
   retail customers.
3. **25 last.** AI dashboard generation needs the semantic
   layer (Phase 2), RLS (Phase 1), search (Phase 6), cost
   telemetry (Phase 7) to all be solid. Shipping it earlier
   means building hacks for each missing dependency.

**Customer-visible deliverable:** "Exec opens the app on a
phone in airplane mode and sees yesterday's KPIs. Logistics
team sees million-point GPS heatmap. Analyst types 'sales by
region for Q2' and a dashboard appears."

**Exit criteria:**
- PWA installable + offline read works on iOS + Android.
- H3 heatmap handles 1M points in < 2 s.
- AI generation produces working dashboards on three demo
  semantic models, > 80% acceptance rate.

---

## Cross-cutting work (every phase)

These run alongside, not in their own phase:

- **Audit log + correlation IDs** — every new endpoint goes
  through `auditLogger.logAuditToOrg` from day one. The hash
  chain (Phase 3) only adds tamper-evidence; the writes start
  earlier.
- **OpenTelemetry** — initialise from Phase 1; every controller
  span is automatic.
- **Feature flags** — every P0 ships behind a flag from
  [`implementation/ADMIN-CONSOLE.md §8`](implementation/ADMIN-CONSOLE.md);
  remove flag after a clean soak.
- **Migrations** — additive only until Phase 7 backfills. No
  destructive migrations during a phase that's actively
  shipping.

---

## Why not other orders

A few alternative orderings I considered and rejected:

- **"Ship AI generation in Phase 1 — it's the demo."** No.
  Without the semantic layer, AI hallucinates schema. Without
  RLS, AI leaks PII. Without cost obs, AI burns the budget.
  Wait.
- **"Ship the public API in Phase 2 — devtools first."** Public
  API stability is a one-way door. Stabilise the entity model
  first (Phases 2 & 4) so the API isn't pinned to old shapes.
- **"Ship mobile PWA in Phase 2 — quick win."** PWA needs
  notifications (16), branding (20), auth (10). Shipping
  before those means re-shipping the manifest endpoint, the
  push registration, and the install prompt for each later
  feature.
- **"Ship cost obs in Phase 1 — finance asked."** Cost telemetry
  matters only when you have customers on usage-priced
  warehouses *and* there's a budget to enforce. Both are Phase
  4 / 5 problems.

---

## Per-phase risk register

| Phase | Top risk | Mitigation |
|---|---|---|
| 0 | Hardening backlog drift | timebox to 3 weeks; cut what doesn't move customer outcomes |
| 1 | SSO IdP variance | start with Okta only; document allowed SAML/OIDC quirks |
| 2 | Semantic layer scope creep | ship only the 9 metric kinds we picked; defer derived chains, time-grain shift |
| 3 | Audit hash-chain perf at scale | per-org `pg_advisory_xact_lock` benchmarked at 1M rows before GA |
| 4 | Cache invalidation correctness | versioned invalidation + every test runs with cache OFF + cache ON |
| 5 | Embed JWT replay across regions | jti TTL == JWT TTL; tested across two regions in soak |
| 6 | Search drift on rapid edits | indexer lag SLO + alert; nightly reconciliation cron |
| 7 | i18n CI flakiness | enforce as warning for 2 weeks before blocking; on-ramp existing English |
| 8 | AI provider outage | provider abstraction + circuit-breaker + fallback model |

---

## How long it actually takes (rough)

Single full-stack engineer, no parallelism:

| Phase | Wall time |
|---|---|
| 0 | 3 weeks |
| 1 | 8 weeks |
| 2 | 6 weeks |
| 3 | 6 weeks |
| 4 | 10 weeks |
| 5 | 6 weeks |
| 6 | 7 weeks |
| 7 | 10 weeks |
| 8 | 7 weeks |
| **Total** | **~63 weeks** |

With two engineers running independent tracks, drop to
~38 weeks via the parallel tracks below.

### Parallel tracks (two engineers)

- **Track A — backend depth:** 04 → 09 → 02 → 11 → 05 → 19 → 28 → 15 → 22 → 27.
- **Track B — frontend + customer surface:** 10 → 06 → 07 → 08 → 13 → 16 → 14 → 17 → 18 → 24 → 20 → 23 → 21 → 26 → 25.

Sync points: end of Phase 1 (auth + query infra merge into FE),
end of Phase 4 (cache integration + multi-tab finalise), end of
Phase 7 (admin / API publish).

---

## What to do today

If you have one engineer-week and want a definitive
"next-step":

1. Read [`hardening/PLAN-FOUR-MODULES-HARDENING.md`](hardening/PLAN-FOUR-MODULES-HARDENING.md).
   Pick the 3 most-impactful items. Ship them.
2. Then start Phase 1 with API tokens
   ([`implementation/AUTH-SSO-MFA-SCIM.md §4`](implementation/AUTH-SSO-MFA-SCIM.md)).
3. Set up the [`implementation/AUDIT-OBSERVABILITY.md §3`](implementation/AUDIT-OBSERVABILITY.md)
   correlation-ID middleware in the same PR.

That's enough to compound. Every later module benefits.

---

## References

- Module index: [`research/00-INDEX.md`](research/00-INDEX.md)
- Glossary: [`research/GLOSSARY.md`](research/GLOSSARY.md)
- BE-first reference (real Express+TypeORM code per P0 gap):
  [`be-implementation/DBEXEC-BE-IMPLEMENTATION.md`](be-implementation/DBEXEC-BE-IMPLEMENTATION.md)
- Hardening backlog: [`hardening/`](hardening/)
- QA spec docs: [`qa/`](qa/)
