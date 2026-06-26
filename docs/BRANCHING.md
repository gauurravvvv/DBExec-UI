# DBExec — branching convention

> How the long-lived branches map to [`BUILD-PLAN.md`](BUILD-PLAN.md)
> and how feature/bug branches flow into them.

**Last updated:** 2026-06-26.

---

## The branch graph

```
master                          ← stable, what's running in production
  ↑ merge (no squash) at release tag
develop                         ← integration branch; PRs land here
  ↑ merge after phase exit
phase-0-hardening               ← phase containers (one per build-plan phase)
phase-1-foundations
phase-2-semantic-layer
phase-3-compliance
phase-4-authoring
phase-5-distribution
phase-6-discovery
phase-7-enterprise
phase-8-intelligence
  ↑ squash-merge feature PRs into the matching phase branch
feature/m04-dialect-bigquery    ← short-lived feature/bug branches
feature/m10-api-tokens
bugfix/cache-stampede-lock
…
```

Two usage modes:

- **Solo / small team:** branch features directly off `develop`,
  ignore the `phase-*` branches. They still exist as bookmarks
  for "what was the state at the end of phase N?".
- **Multi-engineer or QA-gated phases:** features branch off the
  matching `phase-*`, merge back into that phase branch, and the
  whole phase merges into `develop` at exit. Lets you ship one
  QA-signed bundle per phase.

Either mode works; pick per-phase, not globally.

---

## Long-lived branches

| Branch | Purpose | Who pushes | Force-push? |
|---|---|---|---|
| `master` | what's in prod | release process only | never |
| `develop` | integration | maintainers, after PR | never |
| `phase-0-hardening` | hardening container | phase owner | never |
| `phase-1-foundations` | Phase 1 container ([BUILD-PLAN](BUILD-PLAN.md#phase-1--foundations-security-exec-data-shape)) | phase owner | never |
| `phase-2-semantic-layer` | Phase 2 container | phase owner | never |
| `phase-3-compliance` | Phase 3 container | phase owner | never |
| `phase-4-authoring` | Phase 4 container | phase owner | never |
| `phase-5-distribution` | Phase 5 container | phase owner | never |
| `phase-6-discovery` | Phase 6 container | phase owner | never |
| `phase-7-enterprise` | Phase 7 container | phase owner | never |
| `phase-8-intelligence` | Phase 8 container | phase owner | never |

All nine `phase-*` branches are already created (off `develop`,
which is off `master`). They start identical to `develop` and
diverge as features land.

---

## Short-lived branches

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/<module>-<short-desc>` | `feature/m10-api-tokens`, `feature/m04-dialect-bigquery` |
| Bug fix | `bugfix/<area>-<short-desc>` | `bugfix/dataset-preview-pagination`, `bugfix/cache-stampede-lock` |
| Hardening | `harden/<area>-<short-desc>` | `harden/dataset-sql-validation` |
| Hotfix off prod | `hotfix/<short-desc>` | `hotfix/audit-chain-lock-deadlock` |
| Spike (throwaway) | `spike/<short-desc>` | `spike/snowflake-dry-run` |

**Naming rules:**

- lowercase, hyphens-not-underscores, no spaces, ≤ 50 chars.
- type prefix first (`feature/`, `bugfix/`, …) so `gh pr list`
  and IDE pickers group cleanly.
- when the work maps to a research module, include the module
  number: `m04` for query processor, `m10` for auth, `m25` for
  AI. See [`research/00-INDEX.md`](research/00-INDEX.md) for
  the numbered module catalogue.
- include the ticket id if you have one:
  `feature/m09-rls-resolver-DBX-123`.

---

## Per-phase branch map

Direct mapping from [`BUILD-PLAN.md`](BUILD-PLAN.md) phases to
the branch where their feature branches land.

| Phase | Branch | Modules | Companion docs (impl) |
|---|---|---|---|
| 0 | `phase-0-hardening` | hardening backlog | [`hardening/`](hardening/) |
| 1 | `phase-1-foundations` | 10 Auth, 04 Query, 09 RLS | [`AUTH-SSO-MFA-SCIM`](implementation/AUTH-SSO-MFA-SCIM.md), [`QUERY-PROCESSOR`](implementation/QUERY-PROCESSOR.md), [`RLS-COLUMN-SECURITY`](implementation/RLS-COLUMN-SECURITY.md) |
| 2 | `phase-2-semantic-layer` | 02 Semantic, 11 Metrics, 03 Dataset | [`SEMANTIC-LAYER`](implementation/SEMANTIC-LAYER.md), [`AGGREGATION-METRICS`](implementation/AGGREGATION-METRICS.md), [`DATASET`](implementation/DATASET.md) |
| 3 | `phase-3-compliance` | 19 Audit, 28 Backup, 01 Datasource | [`AUDIT-OBSERVABILITY`](implementation/AUDIT-OBSERVABILITY.md), [`BACKUP-RESTORE`](implementation/BACKUP-RESTORE.md), [`DATASOURCE-CONNECTION`](implementation/DATASOURCE-CONNECTION.md) |
| 4 | `phase-4-authoring` | 06 Analysis, 07 Filters, 08 Dashboard, 05 Cache, 13 Export | [`ANALYSIS-VISUAL-BUILDER`](implementation/ANALYSIS-VISUAL-BUILDER.md), [`CROSS-TAB-DRILL-THROUGH`](implementation/CROSS-TAB-DRILL-THROUGH.md), [`MULTI-TAB-DASHBOARD`](implementation/MULTI-TAB-DASHBOARD.md), [`CACHE-MATERIALISATION`](implementation/CACHE-MATERIALISATION.md), [`PER-TAB-SCHEDULED-EXPORTS`](implementation/PER-TAB-SCHEDULED-EXPORTS.md) |
| 5 | `phase-5-distribution` | 15 Scheduling, 16 Notifications, 14 Share/Embed | [`PER-TAB-SCHEDULED-EXPORTS`](implementation/PER-TAB-SCHEDULED-EXPORTS.md), [`NOTIFICATIONS`](implementation/NOTIFICATIONS.md), [`SHARE-EMBED`](implementation/SHARE-EMBED.md) |
| 6 | `phase-6-discovery` | 17 Search, 18 Versioning, 12 Upload | [`SEARCH-CATALOGUE`](implementation/SEARCH-CATALOGUE.md), [`VERSIONING-LINEAGE`](implementation/VERSIONING-LINEAGE.md), [`IMPORT-UPLOAD`](implementation/IMPORT-UPLOAD.md) |
| 7 | `phase-7-enterprise` | 24 Admin, 20 Branding, 23 i18n, 22 API, 27 Cost | [`ADMIN-CONSOLE`](implementation/ADMIN-CONSOLE.md), [`BRANDING`](implementation/BRANDING.md), [`I18N-A11Y`](implementation/I18N-A11Y.md), [`API-SDK-PLUGINS`](implementation/API-SDK-PLUGINS.md), [`COST-OBSERVABILITY`](implementation/COST-OBSERVABILITY.md) |
| 8 | `phase-8-intelligence` | 21 Mobile, 26 Geo, 25 AI | [`MOBILE-PWA`](implementation/MOBILE-PWA.md), [`GEO-MAPS`](implementation/GEO-MAPS.md), [`AI-DASHBOARD-GENERATION`](implementation/AI-DASHBOARD-GENERATION.md) |

---

## Working flow

### Starting a feature

```bash
# From the phase branch you're working in (or develop)
git checkout phase-1-foundations
git pull
git checkout -b feature/m10-api-tokens
```

### Committing

- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`,
  `docs:`, `test:`, `chore:`.
- Reference module number in the body when relevant.
- Co-author lines per the existing repo convention.

### Merging back

```bash
# Push and open a PR
git push -u origin feature/m10-api-tokens
gh pr create --base phase-1-foundations --title "feat(m10): API tokens" --body-file PR.md
```

- **Squash-merge** feature → phase branch. One logical commit
  per feature in the phase branch's history.
- **Merge-commit** (no squash) phase → develop at phase exit
  so the develop log shows what shipped per phase.
- **Merge-commit** develop → master at release tag.

### Phase exit

When [`BUILD-PLAN.md`](BUILD-PLAN.md)'s exit criteria for a
phase are met:

```bash
git checkout develop
git pull
git merge --no-ff phase-1-foundations -m "Merge phase-1-foundations into develop"
git push
```

Tag at release:

```bash
git checkout master
git merge --no-ff develop -m "Release vX.Y"
git tag -a vX.Y -m "Release vX.Y — Phase N exit"
git push --follow-tags
```

---

## Hotfix flow (production bug)

```bash
git checkout master
git pull
git checkout -b hotfix/audit-chain-deadlock
# fix + test
gh pr create --base master --title "hotfix: audit chain deadlock"
# after merge to master, back-merge to develop + every active phase branch
git checkout develop && git merge master && git push
for ph in phase-1-foundations phase-4-authoring; do
  git checkout $ph && git merge master && git push
done
```

The back-merge step keeps every active branch up to date with
the hotfix — skip it and the bug walks back in on next release.

---

## Branch protection rules (recommended GH config)

| Branch | Rules |
|---|---|
| `master` | require PR · require status checks · no force-push · no direct push · require linear history |
| `develop` | require PR · require status checks · no force-push · no direct push |
| `phase-*` | require PR (when team grows past 1) · status checks · no force-push |
| `feature/*`, `bugfix/*` | no protection; force-push allowed (it's your branch) |

Set via `gh api -X PUT repos/<owner>/<repo>/branches/<branch>/protection` or
the GitHub UI.

---

## Quick reference

```
master              → prod
develop             → integration
phase-N-<topic>     → BUILD-PLAN phase container
feature/m<NN>-…     → one feature per module
bugfix/<area>-…     → bug fix
harden/<area>-…     → hardening item
hotfix/…            → production patch
spike/…             → throwaway experiment
```

For the build order itself, see [`BUILD-PLAN.md`](BUILD-PLAN.md).
For the module catalogue, see [`research/00-INDEX.md`](research/00-INDEX.md).
