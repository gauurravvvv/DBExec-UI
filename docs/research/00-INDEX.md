# DBExec — Deep Research · Per-Module Index

The master overview lives in [`../DBEXEC-DEEP-RESEARCH.md`](../DBEXEC-DEEP-RESEARCH.md).
This folder splits it into one deep-dive per module. Each module
doc now follows the same structure:

```
0. Context — where this fits in the platform
1. Industry baseline — how Tableau / Looker / Superset / Metabase / Power BI do it
2. DBExec today — what we have, with file paths
3. Gap matrix — itemised with severity (P0/P1/P2) and effort (S/M/L)
4. Target architecture — BE + FE + DB + integration
5. Schemas + migrations
6. APIs — endpoint by endpoint, request/response shapes
7. UI specs — component tree, state, interaction
8. Code recipes — copy-paste-ready
9. Test plan — happy/neg/edge IDs that match e2e/docs/modules/
10. Migration & rollout — flags, backfills, ordering
11. Open questions
12. References — external docs cited
13. Appendix · Review additions — items from the deep-review pass
```

## Modules

| # | Module | Depends on | Unblocks |
|---|---|---|---|
| 01 | [Datasource & Connection](modules/01-datasource-connection.md) | — | every read path |
| 02 | [Semantic Layer](modules/02-semantic-layer.md) | 01 | 06, 11, 25 |
| 03 | [Dataset](modules/03-dataset.md) | 01, 02 | 06, 12 |
| 04 | [Query Processor / Compiler](modules/04-query-processor.md) | 02 | every query path |
| 05 | [Cache & Materialisation](modules/05-cache-materialisation.md) | 04 | 06, 08, 25 |
| 06 | [Analysis & Visual Builder](modules/06-analysis-visual-builder.md) | 02, 03, 04 | 07, 08 |
| 07 | [Filters, Parameters, Cross-filters, Drill](modules/07-filters-actions.md) | 06 | 08, 25 |
| 08 | [Dashboard](modules/08-dashboard.md) | 06, 07 | 13, 14, 15 |
| 09 | [RLS & Column Security](modules/09-rls-column-security.md) | 03, 04 | every read path |
| 10 | [RBAC, SSO, MFA, SCIM, API Tokens](modules/10-auth-rbac-sso.md) | — | every authed surface |
| 11 | [Aggregation & Metrics](modules/11-aggregation-metrics.md) | 02, 04 | 06, 25 |
| 12 | [Import & Upload](modules/12-import-upload.md) | 03, 05 | self-serve analyst flows |
| 13 | [Export & Download](modules/13-export-download.md) | 08, 06, 03, 05 | 15, 16 |
| 14 | [Sharing & Embedding](modules/14-share-embed.md) | 08, 06, 10, 09, 20 | customer-facing analytics |
| 15 | [Scheduling, Subscriptions, Alerts](modules/15-scheduling-alerts.md) | 13, 16, 08, 05, 10 | daily ops use cases |
| 16 | [Notifications](modules/16-notifications.md) | 10, 15, 08 | 21, "Notify me when…" UX |
| 17 | [Search, Tags, Collections, Favourites](modules/17-search-catalogue.md) | 03, 06, 08, 10 | Cmd-K, documentation portal |
| 18 | [Versioning, Git Sync, Lineage](modules/18-versioning-lineage.md) | 03, 06, 08, 10 | compliance audits, blame |
| 19 | [Audit, Observability, Telemetry](modules/19-audit-observability.md) | every write path | SOC2 / HIPAA |
| 20 | [Theming, Branding, White-label](modules/20-branding.md) | — | white-label customers |
| 21 | [Mobile, PWA, Offline](modules/21-mobile-pwa.md) | 10, 16, 08 | exec-on-the-go |
| 22 | [Public API, SDKs, Plugins, Custom Viz](modules/22-api-sdk-plugins.md) | 10, 19, every module | customer automation |
| 23 | [i18n, Accessibility](modules/23-i18n-a11y.md) | every FE module | non-English, WCAG AA |
| 24 | [Admin Console & Org Settings](modules/24-admin-console.md) | 10, 19, 20, 28 | enterprise procurement |
| 25 | [AI Insights / NL Q&A](modules/25-ai-insights.md) | 02, 09, 17, 10, 19 | self-serve "ask the data" |
| 26 | [Geo, Maps, Specialty Charts](modules/26-geo-maps.md) | 06, 01, 05 | logistics, location dashboards |
| 27 | [Cost Observability & Budgets](modules/27-cost-observability.md) | 01, 19, 04 | paid-warehouse customers |
| 28 | [Backup, Restore, Multi-region](modules/28-backup-restore.md) | 24, 19, 10 | BCDR, GDPR, data residency |

**Total:** 28 modules · ~21,000 lines of per-module deep dives,
plus the master overview, deep-review, glossary, and BE-implementation
reference.

## How to read this

- **Building a feature** → open the module doc, jump to §4 (Target
  architecture) and §8 (Code recipes). Each module's `Depends on`
  and `Unblocks` columns tell you what else needs to ship.
- **Triaging an existing bug** → §2 (DBExec today) and §3 (Gap matrix)
  tell you what's already in code, and what's known to be missing.
- **Writing tests** → §9 (Test plan) lists the case IDs that the
  e2e module docs and Playwright suite use.
- **Deploying a change** → §10 (Migration & rollout) for the order
  and feature-flag gates.

## Related docs

- [`../DBEXEC-DEEP-RESEARCH.md`](../DBEXEC-DEEP-RESEARCH.md) —
  master overview with the cross-cutting gap matrix.
- [`REVIEW-DEEP.md`](REVIEW-DEEP.md) — the second-pass critical
  review; items the first pass missed and why.
- [`99-REVIEW.md`](99-REVIEW.md) — coverage summary across all
  modules.
- [`GLOSSARY.md`](GLOSSARY.md) — terms that appear across many
  modules (snapshot, semantic model, org-DB boundary, etc.).
- [`../be-implementation/DBEXEC-BE-IMPLEMENTATION.md`](../be-implementation/DBEXEC-BE-IMPLEMENTATION.md)
  — the single-file BE-first implementation reference. 3,258
  lines of real Express+TypeORM code, one section per module's
  P0/P1 gaps.
- [`../implementation/MULTI-TAB-DASHBOARD.md`](../implementation/MULTI-TAB-DASHBOARD.md)
  — the multi-tab dashboard companion (model 08 extended).
- [`../qa/`](../qa/) — QA spec docs (test case IDs, preconditions,
  expected outcomes) — one file per module.
- [`../hardening/`](../hardening/) — code-read findings and the
  4-module hardening plan for Dataset / Analysis / Dashboard / RLS.

## Cross-module entity map

A reverse index — which module owns each major entity, and which
modules reference it.

| Entity | Owned by | Referenced by |
|---|---|---|
| `organisation` | 10 | every module |
| `user`, `group`, `role` | 10 | 09, 14, 16, 17, 22, 24, 25 |
| `datasource_s`, `datasource_config_s`, `connection` | 01 | 03, 06, 08, 27 |
| `dataset`, `dataset_field`, `dataset_field_relation` | 03 | 02, 06, 08, 09, 11, 12, 13, 17, 18, 25, 28 |
| `analysis`, `analysis_filter`, `analysis_visual`, `analysis_visual_config` | 06 | 07, 08, 13, 18 |
| `dashboard`, `dashboard_tab`, `dashboard_visual`, `dashboard_filter`, `dashboard_field` | 08 | 13, 14, 15, 18 |
| `rls_rule`, `column_security`, `user_attribute` | 09 | 06, 08, 13, 14, 25 |
| `semantic_model`, `sem_dimension`, `sem_metric`, `sem_entity`, `sem_join`, `sem_segment` | 02 | 06, 11, 25 |
| `audit_log`, `audit_log_s`, `login_activity` | 19 | every write path, 22, 24 |
| `subscription`, `alert`, `delivery_log` | 15 | 13, 16, 22 |
| `notification`, `notification_preference`, `push_subscription`, `user_dnd` | 16 | 10, 15, 21 |
| `share_link`, `share_link_view`, `embed_app` | 14 | 08, 06 |
| `api_token`, `service_account`, `webhook_endpoint` | 22 | every public-API consumer |
| `search_doc`, `tag`, `collection`, `favourite`, `recent_view`, `saved_search` | 17 | every searchable entity |
| `lineage_edge`, `dataset_version`, `dashboard_version`, `analysis_version` | 18 | 03, 06, 08 |
| `feature_flag` | 0 (cross-cutting) | every module gated by a flag |
| `org_branding`, `brand_asset`, `org_custom_domain` | 20 | 13, 14, 16, 21 |
| `export_job` | 13 | 15, 22 |
| `ai_session`, `ai_turn`, `ai_feedback`, `org_ai_config` | 25 | 02, 09, 17 |
| `tile_provider`, `org_geo_config`, `org_geojson` | 26 | 06, 08 |
| `query_execution_log`, `cost_daily`, `budget`, `pricing_profile` | 27 | 01, 19, 04 |
| `backup_artifact`, `restore_job`, `org_backup_retention`, `org_byok_key` | 28 | 24, 19, 10 |
| `impersonation_session`, `gdpr_request`, `org_clone_job` | 24 | 10, 19 |

## P0 gap heat map

Each module's gap matrix gets summarised in the master doc; this is
the cross-module heat map for "what's the most impactful next
build":

| Module | P0 gaps |
|---|---|
| 02 Semantic Layer | full model entity + Zod + lint |
| 04 Query Processor | dialect adapters for SF/BQ/MySQL/MSSQL/Oracle |
| 05 Cache | Redis-backed result cache + invalidation |
| 06 Analysis | parameter entity + cross-filter + drill |
| 07 Filters | dashboard filter bar + URL state + relative dates |
| 08 Dashboard | live mode + PDF export + embed |
| 09 RLS | column-level + masking + user attributes |
| 10 Auth | SSO (SAML/OIDC), MFA, SCIM, API tokens |
| 11 Metrics | derived/cumulative/conversion compilers |
| 12 Upload | CSV/XLSX with quota + idempotency |
| 13 Export | sync + async + audit + watermark |
| 14 Share/Embed | three modes + JWT verify + CSP |
| 15 Scheduling | BullMQ scheduler + email/Slack/webhook channels |
| 16 Notifications | category prefs + DND + bundling + SSE |
| 17 Search | tsvector + pgvector + Cmd-K palette |
| 18 Versioning | dataset/dashboard versions + diff + rollback |
| 19 Audit | hash chain + correlation IDs + health endpoints |
| 20 Branding | token model + light/dark + custom domain auto-TLS |
| 21 Mobile | manifest + service worker + mobile layout |
| 22 API | token model + OpenAPI + Idempotency-Key + webhooks |
| 23 i18n | CI guard + ICU MessageFormat + axe-core |
| 24 Admin | unified shell + GDPR + impersonation + bulk |
| 25 AI | tool-calling + sanitiser + session/turn + budget |
| 26 Geo | tile provider config + choropleth + H3 heatmap |
| 27 Cost | telemetry + budgets + BigQuery dry-run |
| 28 Backup | logical backup + verify-restore + KMS |

## How the modules connect (layers)

```
┌────────────────────────────────────────────────────────────────┐
│  L7 — Customer surfaces                                        │
│  14 Share/Embed · 22 API/SDK · 21 Mobile/PWA                   │
├────────────────────────────────────────────────────────────────┤
│  L6 — Discovery & collaboration                                │
│  17 Search/Catalogue · 18 Versioning · 24 Admin · 19 Audit     │
├────────────────────────────────────────────────────────────────┤
│  L5 — Consumption                                              │
│  08 Dashboard · 13 Export · 15 Scheduling · 16 Notifications   │
│  25 AI Insights · 26 Geo/Specialty charts                      │
├────────────────────────────────────────────────────────────────┤
│  L4 — Authoring                                                │
│  06 Analysis/Visual Builder · 07 Filters/Actions               │
│  11 Aggregation/Metrics · 12 Upload                            │
├────────────────────────────────────────────────────────────────┤
│  L3 — Data model                                               │
│  02 Semantic Layer · 03 Dataset                                │
├────────────────────────────────────────────────────────────────┤
│  L2 — Execution                                                │
│  04 Query Processor · 05 Cache · 27 Cost Observability         │
├────────────────────────────────────────────────────────────────┤
│  L1 — Connection                                               │
│  01 Datasource · 09 RLS · 10 Auth/SSO                          │
├────────────────────────────────────────────────────────────────┤
│  L0 — Platform                                                 │
│  20 Branding · 23 i18n/a11y · 28 Backup/Restore                │
└────────────────────────────────────────────────────────────────┘
```

A change at layer L cascades upward. A new dialect in layer L2
unlocks new datasources in L1, more dataset shapes in L3, and
new visual options in L4. A breaking change at L3 (semantic
model rename) ripples through every layer above.

## Implementation docs → modules they pin down

The research modules say *what to build*. The implementation
docs say *exactly how* — controller code, migrations, FE
components, runbooks, threat models. Two flavours of
companion:

- **Per-module companion** — one per research module, pins
  every section of that module down to ship.
- **Feature-slice companion** — spans multiple modules to ship
  one named feature.

### Feature-slice companions

| Doc | Spans modules |
|---|---|
| [Multi-tab dashboard](../implementation/MULTI-TAB-DASHBOARD.md) | 08 |
| [Per-tab scheduled exports](../implementation/PER-TAB-SCHEDULED-EXPORTS.md) | 13, 15, 08 |
| [Cross-tab drill-through](../implementation/CROSS-TAB-DRILL-THROUGH.md) | 07, 08, 09, 14 |
| [AI dashboard generation](../implementation/AI-DASHBOARD-GENERATION.md) | 25, 02, 06, 08, 09, 27 |

### Per-module companions (one per research module)

| # | Research module | Implementation companion |
|---|---|---|
| 01 | Datasource & Connection | [DATASOURCE-CONNECTION](../implementation/DATASOURCE-CONNECTION.md) |
| 02 | Semantic Layer | [SEMANTIC-LAYER](../implementation/SEMANTIC-LAYER.md) |
| 03 | Dataset | [DATASET](../implementation/DATASET.md) |
| 04 | Query Processor | [QUERY-PROCESSOR](../implementation/QUERY-PROCESSOR.md) |
| 05 | Cache & Materialisation | [CACHE-MATERIALISATION](../implementation/CACHE-MATERIALISATION.md) |
| 06 | Analysis & Visual Builder | [ANALYSIS-VISUAL-BUILDER](../implementation/ANALYSIS-VISUAL-BUILDER.md) |
| 07 | Filters / Actions | covered via [CROSS-TAB-DRILL-THROUGH](../implementation/CROSS-TAB-DRILL-THROUGH.md) |
| 08 | Dashboard | [MULTI-TAB-DASHBOARD](../implementation/MULTI-TAB-DASHBOARD.md) |
| 09 | RLS & Column Security | [RLS-COLUMN-SECURITY](../implementation/RLS-COLUMN-SECURITY.md) |
| 10 | Auth / SSO / MFA / SCIM | [AUTH-SSO-MFA-SCIM](../implementation/AUTH-SSO-MFA-SCIM.md) |
| 11 | Aggregation & Metrics | [AGGREGATION-METRICS](../implementation/AGGREGATION-METRICS.md) |
| 12 | Import & Upload | [IMPORT-UPLOAD](../implementation/IMPORT-UPLOAD.md) |
| 13 | Export & Download | [PER-TAB-SCHEDULED-EXPORTS](../implementation/PER-TAB-SCHEDULED-EXPORTS.md) |
| 14 | Sharing & Embedding | [SHARE-EMBED](../implementation/SHARE-EMBED.md) |
| 15 | Scheduling & Alerts | [PER-TAB-SCHEDULED-EXPORTS](../implementation/PER-TAB-SCHEDULED-EXPORTS.md) |
| 16 | Notifications | [NOTIFICATIONS](../implementation/NOTIFICATIONS.md) |
| 17 | Search / Catalogue | [SEARCH-CATALOGUE](../implementation/SEARCH-CATALOGUE.md) |
| 18 | Versioning & Lineage | [VERSIONING-LINEAGE](../implementation/VERSIONING-LINEAGE.md) |
| 19 | Audit & Observability | [AUDIT-OBSERVABILITY](../implementation/AUDIT-OBSERVABILITY.md) |
| 20 | Branding & White-label | [BRANDING](../implementation/BRANDING.md) |
| 21 | Mobile / PWA | [MOBILE-PWA](../implementation/MOBILE-PWA.md) |
| 22 | API / SDK / Plugins | [API-SDK-PLUGINS](../implementation/API-SDK-PLUGINS.md) |
| 23 | i18n / a11y | [I18N-A11Y](../implementation/I18N-A11Y.md) |
| 24 | Admin Console | [ADMIN-CONSOLE](../implementation/ADMIN-CONSOLE.md) |
| 25 | AI Insights | [AI-DASHBOARD-GENERATION](../implementation/AI-DASHBOARD-GENERATION.md) |
| 26 | Geo / Maps / Specialty | [GEO-MAPS](../implementation/GEO-MAPS.md) |
| 27 | Cost Observability | [COST-OBSERVABILITY](../implementation/COST-OBSERVABILITY.md) |
| 28 | Backup & Restore | [BACKUP-RESTORE](../implementation/BACKUP-RESTORE.md) |

### Integration-ready coverage

All 28 modules now have an implementation companion. Each companion
follows the same 14-section structure: problem statement, data
model, API surface, controller stub (with audit + master-DB-close),
FE component skeleton, observability metrics + traces, security &
threat model, operational runbook, performance budget, migration
& rollout, open questions, references.

For a feature that spans modules (e.g. "AI generates a multi-tab
dashboard with cross-tab drill-through and per-tab scheduled
exports"), follow the *feature-slice* companions in the previous
table — they bridge across modules.

## Conventions

- **Severity**: `P0` (blocks adoption), `P1` (table stakes), `P2` (nice-to-have).
- **Effort**: `S` (≤3 days), `M` (1–2 weeks), `L` (1+ month).
- DB schema is Postgres-flavoured (DBExec's master + shared DBs are
  Postgres). Equivalent MySQL/MSSQL paths called out when needed.
- File paths assume DBExec-UI/DBExec-API layout.
- Code is TypeScript unless explicitly otherwise.
- Endpoint envelope follows `sendResponse(res, status, code, msg, data)`
  — DBExec's existing convention.
- All endpoints assume `AuthMiddleware → VerifyResource →
  VerifyDatabase → ZodValidation → controller` order (DBExec's
  existing chain).
