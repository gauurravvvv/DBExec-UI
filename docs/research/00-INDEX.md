# DBExec — Deep Research · Per-Module Index

The master overview lives in `../DBEXEC-DEEP-RESEARCH.md`. This folder
splits it into one deep-dive per module. Each module doc is structured
the same way:

```
0. Context — where this fits in the platform
1. Industry baseline — how Tableau / Looker / Superset / Metabase / Power BI do it
2. DBExec today — what we have, with file paths
3. Gaps — itemised
4. Target architecture — BE + FE + DB + integration
5. Schemas + migrations
6. APIs — endpoint by endpoint, request/response shapes
7. UI specs — component tree, state, interaction
8. Code recipes — copy-paste-ready
9. Test plan — happy/neg/edge IDs that match e2e/docs/modules/
10. Migration & rollout — flags, backfills, ordering
11. Open questions
```

## Modules

| # | Module | File |
|---|---|---|
| 01 | Datasource & Connection | `01-datasource-connection.md` |
| 02 | Semantic Layer | `02-semantic-layer.md` |
| 03 | Dataset | `03-dataset.md` |
| 04 | Query Processor / Compiler | `04-query-processor.md` |
| 05 | Cache & Materialisation | `05-cache-materialisation.md` |
| 06 | Analysis & Visual Builder | `06-analysis-visual-builder.md` |
| 07 | Filters, Parameters, Cross-filters, Drill | `07-filters-actions.md` |
| 08 | Dashboard | `08-dashboard.md` |
| 09 | RLS & Column Security | `09-rls-column-security.md` |
| 10 | RBAC, SSO, MFA, SCIM, API Tokens | `10-auth-rbac-sso.md` |
| 11 | Aggregation & Metrics | `11-aggregation-metrics.md` |
| 12 | Import / Upload / ETL-lite | `12-import-upload.md` |
| 13 | Export & Download | `13-export-download.md` |
| 14 | Sharing & Embedding | `14-share-embed.md` |
| 15 | Scheduling, Subscriptions, Alerts | `15-scheduling-alerts.md` |
| 16 | Notifications | `16-notifications.md` |
| 17 | Search, Tags, Collections, Favourites | `17-search-catalogue.md` |
| 18 | Versioning, Git Sync, Lineage | `18-versioning-lineage.md` |
| 19 | Audit, Observability, Telemetry | `19-audit-observability.md` |
| 20 | Theming, Branding, White-label | `20-branding.md` |
| 21 | Mobile, PWA, Offline | `21-mobile-pwa.md` |
| 22 | Public API, SDKs, Plugins, Custom Viz | `22-api-sdk-plugins.md` |
| 23 | i18n, Accessibility | `23-i18n-a11y.md` |
| 24 | Admin Console & Org Settings | `24-admin-console.md` |
| 25 | AI Insights / NL Q&A | `25-ai-insights.md` |
| 26 | Geo, Maps, Specialty Charts | `26-geo-maps.md` |
| 27 | Cost Observability & Query Budgets | `27-cost-observability.md` |
| 28 | Backup, Restore, Multi-region | `28-backup-restore.md` |

## How to read

- Read modules in order if you want the full picture.
- If you're building one feature, the module doc is self-contained
  enough to scope and ticket the work without cross-referencing.
- Cross-module dependencies are called out at the top of each doc
  under "Depends on" and "Unblocks".

## Conventions used in all docs

- DB schema is Postgres-flavoured (DBExec's master + shared DBs are
  Postgres). Equivalent MySQL/MSSQL paths called out when needed.
- File paths assume DBExec-UI/DBExec-API layout.
- Code is TypeScript unless explicitly otherwise.
- Endpoint envelope follows `sendResponse(res, status, code, msg, data)`
  — DBExec's existing convention.
- All endpoints assume `AuthMiddleware → VerifyResource →
  VerifyDatabase → ZodValidation → controller` order (DBExec's
  existing chain).
