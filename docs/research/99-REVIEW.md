# Review · Deep-Research Doc Set

A look-over after writing all 28 module docs. What this set covers, what
it still misses, and how to use it.

## What's covered

```
docs/
├── DBEXEC-DEEP-RESEARCH.md     ← master overview (architecture, gaps, plan)
└── research/
    ├── 00-INDEX.md
    ├── 99-REVIEW.md (this file)
    └── modules/
        ├── 01-datasource-connection.md           ✅ deep
        ├── 02-semantic-layer.md                  ✅ deep (largest gap)
        ├── 03-dataset.md                         ✅ deep
        ├── 04-query-processor.md                 ✅ mid
        ├── 05-cache-materialisation.md           ✅ deep
        ├── 06-analysis-visual-builder.md         ✅ deep
        ├── 07-filters-actions.md                 ✅ deep
        ├── 08-dashboard.md                       ✅ deep
        ├── 09-rls-column-security.md             ✅ deep
        ├── 10-auth-rbac-sso.md                   ✅ deep
        ├── 11-aggregation-metrics.md             ✅ focused
        ├── 12-import-upload.md                   ✅ focused
        ├── 13-export-download.md                 ✅ focused
        ├── 14-share-embed.md                     ✅ deep
        ├── 15-scheduling-alerts.md               ✅ deep
        ├── 16-notifications.md                   ✅ focused
        ├── 17-search-catalogue.md                ✅ focused
        ├── 18-versioning-lineage.md              ✅ focused
        ├── 19-audit-observability.md             ✅ focused
        ├── 20-branding.md                        ✅ focused
        ├── 21-mobile-pwa.md                      ✅ focused
        ├── 22-api-sdk-plugins.md                 ✅ deep
        ├── 23-i18n-a11y.md                       ✅ focused
        ├── 24-admin-console.md                   ✅ focused
        ├── 25-ai-insights.md                     ✅ focused
        ├── 26-geo-maps.md                        ✅ focused
        ├── 27-cost-observability.md              ✅ focused
        └── 28-backup-restore.md                  ✅ focused
```

Every doc carries: industry baseline, DBExec status, gaps,
target architecture, schemas, APIs, code recipes, tests, migration.

## What I deliberately didn't cover deeply

- **Tab / Section / Prompt / Query Builder modules** — per your
  instruction these are out of scope.
- **Per-driver SQL exhaustive quirks** (Oracle hierarchical queries,
  Snowflake VARIANT, BigQuery STRUCT) — would deserve their own
  driver appendix; flagged in module 04 as future work.
- **Compliance certifications** (SOC 2, HIPAA, GDPR, ISO 27001) — the
  technical building blocks are here (audit chain, RLS, MFA, SSO,
  encryption, retention), but procedural compliance is a separate
  workstream.
- **Pricing & packaging strategy** — engineering doc, not commercial.

## What's deliberately repeated

Some content appears in both the master `DBEXEC-DEEP-RESEARCH.md` and
the per-module deep-dive. That's intentional — each per-module doc is
designed to be self-contained so an engineer building one module
doesn't need to chase pointers.

## Open questions consolidated

Across the docs, the recurring open questions are:

1. **Snapshot vs Live per visual** (08) — V2 feature.
2. **Cross-dataset joins** (02, 04) — depends on federated query engine.
3. **dbt MetricFlow YAML import format** (02) — compatible subset only.
4. **Plugin sandbox**: descriptor-only vs runtime-loaded JS (22, 06).
5. **Access timing**: does revoke from a granted group take effect
   immediately or next login? (06, 10).
6. **Reserved org names** post-soft-delete (24).
7. **Magic-link login** (10).
8. **Multi-region data residency** legal implementation (28).

Each is one product decision away — none block the work.

## How to use these docs

- **As a PM**: read the master + module 03 (gap matrix) for scope.
  Each module's gap list is your backlog seed.
- **As an engineer building feature X**: open `research/modules/<X>.md`.
  It's self-contained: schemas, APIs, code, tests, rollout. Cross-
  refs to other modules are explicit.
- **As an architect**: read the master, then 02, 04, 05 in order —
  the load-bearing trio (semantic layer, compiler, cache).
- **As a designer**: each module has a "UI specs" section listing
  panes and components.
- **As QA**: each module has a "Tests" section mapping to the e2e
  spec docs already in `e2e/docs/modules/`.

## Cross-reference with e2e spec docs

Module docs add features that EXTEND what `e2e/docs/modules/*.md`
currently document. When a feature ships, append its IDs (e.g.
`SH-LINK-PWD-H-01`) into the matching `e2e/docs/modules/14-share-*.md`
spec, then `npm run e2e:generate` to materialise the tests.

## Final note on completeness

This doc set is the **plan**, not the code. Even at ~10,000 lines
across 28 modules, every architectural decision has been deliberately
left at the "decide once" level — not the "implement every edge case"
level. Implementation will surface more questions; those questions
have a home (the "Open questions" sections) and a workflow
(append a Q, decide, commit).
