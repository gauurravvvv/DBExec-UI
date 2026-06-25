# DBExec QA · Deep Test Case Index

This directory carries **deep test case documentation** for every
module. Where the existing `e2e/docs/modules/*.md` files are quick spec
lists (one line per ID), these docs are full **executable test plans**
QA engineers can pick up and run by hand or convert into Playwright
specs.

Each module's deep test doc follows the same shape:

```
1. Scope               — what this module covers, what is intentionally out
2. Fixtures            — preconditions: users, orgs, data seeds, env
3. Test taxonomy       — happy / negative / edge / security / performance
4. Test cases          — one numbered case per ID, with:
     - ID
     - Title (one-liner)
     - Severity (P0 / P1 / P2)
     - Prerequisites (data + state)
     - Steps (numbered actions)
     - Expected result (observable)
     - Postconditions (cleanup or carry-over)
     - Linked spec sections in docs/research/modules/<n>.md
     - Linked code paths in DBExec-API / DBExec-UI
5. Regression buckets  — which subsets to run when X changes
6. Open questions
```

## Index

| # | Module | File | Cases (target) |
|---|---|---|---|
| 01 | Auth (login / OTP / set-password / refresh / logout) | `01-auth.md` | ~120 |
| 02 | Organisation + System Admin | `02-organisation.md` | ~70 |
| 03 | Users / Roles / Groups | `03-users-roles-groups.md` | ~110 |
| 04 | Datasources | `04-datasources.md` | ~100 |
| 05 | Connections | `05-connections.md` | ~50 |
| 06 | Access Manager | `06-access.md` | ~45 |
| 07 | RLS Rules + Column Security | `07-rls.md` | ~60 |
| 08 | Datasets (SQL + builder + custom fields + upload) | `08-datasets.md` | ~130 |
| 09 | Semantic Layer | `09-semantic.md` | ~70 |
| 10 | Query Processor / Cache | `10-query-cache.md` | ~50 |
| 11 | Analyses + Visual Builder | `11-analyses.md` | ~100 + chart matrix |
| 12 | Filters / Parameters / Drill / Cross-filter | `12-filters-actions.md` | ~80 |
| 13 | Dashboards | `13-dashboards.md` | ~70 |
| 14 | Sharing & Embedding | `14-share-embed.md` | ~50 |
| 15 | Subscriptions / Alerts / Schedules | `15-scheduling-alerts.md` | ~60 |
| 16 | Export / Download | `16-export.md` | ~40 |
| 17 | Notifications | `17-notifications.md` | ~30 |
| 18 | Search / Tags / Collections / Favourites | `18-search.md` | ~30 |
| 19 | Audit Logs / Login Activity | `19-audit.md` | ~30 |
| 20 | Announcements | `20-announcements.md` | ~25 |
| 21 | Profile + Sessions + MFA | `21-profile-mfa.md` | ~40 |
| 22 | SSO / SCIM / API Tokens | `22-sso-scim-api.md` | ~50 |
| 23 | Layout / Sidebar / Permissions | `23-layout.md` | ~40 |
| 24 | Branding / Theming / White-label | `24-branding.md` | ~25 |
| 25 | Mobile / PWA / Offline | `25-mobile.md` | ~20 |
| 26 | Public API / SDK / Plugins | `26-api-sdk.md` | ~40 |
| 27 | i18n + a11y | `27-i18n-a11y.md` | ~30 |
| 28 | Admin Console / Backup / GDPR | `28-admin.md` | ~30 |
| 29 | AI Insights | `29-ai.md` | ~25 |
| 30 | Geo / Maps | `30-geo.md` | ~20 |
| 31 | Cost Observability | `31-cost.md` | ~20 |
| 32 | Cross-cutting Security & Performance | `99-cross-cutting.md` | ~50 |

Tabs / Sections / Prompts / Query Builders deliberately omitted per
project decision (covered indirectly through Datasets module 08).

## Conventions

- **ID shape**: `<MOD>-<CLASS>-<NN>` (or `<MOD>-<SUBJECT>-<CLASS>-<NN>`
  for sub-areas). Classes: H (happy), N (negative), E (edge), S
  (security), P (performance), A (a11y), I (i18n).
- **Severity**: P0 = ship-blocker; P1 = major; P2 = minor.
- **Steps** are numbered and stated as imperatives.
- **Expected** is **observable** — what the tester sees, not what the
  code does internally.
- **Postconditions** include cleanup so test runs are repeatable.

## Universal fixtures (every test assumes these exist)

| Fixture | Identifier | Notes |
|---|---|---|
| Org | `TestOrg` | Default dev seed |
| Master admin | `master_admin` / `Pass@1234` | Has every permission |
| Standard user | `eve_user` / `Pass@1234` | Default member role |
| Read-only user | `reader_user` / `Pass@1234` | View-only role |
| Postgres datasource | `pg_local` | Points at the local Postgres |
| Snowflake datasource | `sf_test` | Optional; skip tests if unset |
| Sample dataset | `chart_demo` | 5,040-row demo table |

Tests that need additional fixtures call them out in their
`Prerequisites` section.

## How to use

- **Manual QA pass**: read the module doc top-to-bottom. Run each case
  in order. Mark P / F / S (skipped) with reason.
- **Automation**: each ID maps to a Playwright test in
  `e2e/tests/*.spec.ts`. Adding a case here means adding it to the
  corresponding `e2e/docs/modules/*.md` spec list AND running
  `npm run e2e:generate` to materialise.
- **Regression triage**: see each module's "Regression buckets" for
  which subset to run when a specific area changes.
