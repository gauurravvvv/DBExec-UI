# DBExec — Product Reference

> Repo-agnostic. This same file lives in both `DBExec-UI/ref/` and
> `DBExec-API/ref/`. It answers **"what is DBExec and where is it going"** so
> a fresh session has the product context behind any given code change.

## What DBExec is

**One tool for EVERY database operation.** DBExec is a multi-tenant,
web-based platform that lets an organisation connect its databases and then
do everything against them from one place — browse and manage schema, run and
save SQL, build datasets, analyse and visualise data, publish dashboards, and
get alerted on changes — without leaving the app or juggling separate tools
(a DB IDE + a BI tool + an alerting service).

### The four product pillars

1. **Studio** — the DBA/developer surface: Query Executor (SQL editor with
   IntelliSense, object explorer, EXPLAIN, cancel), DB Access Management
   (live Postgres roles/users/privileges), connections.
2. **Data Management** — Datasets (saved SQL with typed fields, calculated
   fields, parameters), Datasources, Query Builder.
3. **BI, first-class** — Analyses (aggregation, pivots, analytics), Visuals
   (charts), Dashboards (widgets, cross-filter, scoped filters, snapshots,
   public/embed share links, subscriptions/scheduled delivery). Not a
   bolt-on: BI is a core pillar alongside Studio.
4. **Reporting** (next) — the roadmap direction: scheduled/formatted
   reporting on top of the BI layer.

### Cross-cutting capabilities

- **Alerts engine** — rule-based monitoring on dataset/analysis results
  (thresholds, change-by-%, AND/OR conditions) with email delivery.
- **RLS + column security** — row-level rules and column masking enforced on
  query and dashboard paths (including aggregated + public/embed paths).
- **Reference data** — DB-driven enum catalog (operators, aggregates, etc.)
  per org, seeded at onboarding.

## Who uses it

- **System Admin** (platform operator, master DB) — manages organisations,
  system-level settings, audit/login activity, announcements. Cannot reach
  per-org resources.
- **Org Admin** — full control inside one organisation: users, groups, roles,
  data management, studio, dashboards.
- **Org User (Member)** — scoped access: dashboards + query executor, plus
  whatever their assigned role permits.

## Architecture at a glance

- **Two repos:** `DBExec-UI` (Angular 18 + PrimeNG) and `DBExec-API`
  (Express + TypeScript + TypeORM + PostgreSQL). A `DBExec-Desktop` wrapper
  packages the FE as a Mac `.dmg` / Windows `.exe`. A `DBExec-CLI` exists for
  scripted API calls.
- **Multi-tenant, DB-per-org:** a **master DB** holds super admins,
  organisations, org configs, and master audit logs. **Each organisation
  gets its own PostgreSQL database** (shared-schema) holding that org's users,
  groups, datasets, connections, dashboards, saved queries, etc.
- **Tenancy is JWT-driven and server-enforced.** The signed JWT is the ONLY
  source of org identity — the FE never names an org (no `x-organization-id`
  header, no `:orgId` path param, no `organisation` body field). The BE
  sanitizes those out globally and scopes every query by the JWT's org id, so
  a caller from org A requesting org B's resource simply gets a 404. See the
  BE `CLAUDE.md` "Authorisation model" section for the full invariant.
- **Auth:** `x-auth-token` header (not `Authorization: Bearer`); permissions
  are DB-backed (per-role JSON tree), resolved at login and stamped into the
  JWT; routes gate on permission *values*, never role names.

## Design principles (how it should feel)

- **One consistent app, not a bag of screens.** Every list looks and behaves
  the same (shared `app-custom-table`, infinite scroll). Every form follows
  the same list→add/edit/view rhythm with shared `app-custom-*` controls and
  token-driven styling. A new module should feel like the existing ones.
- **Real-tool polish.** The Query Executor should feel like a real SQL IDE;
  dashboards like a real BI tool. Depth over breadth of half-built features.
- **Safe by construction.** Org isolation, bound SQL params, owner-private
  scoping where appropriate (connections, saved queries), onboarding-safe
  additive DDL, and validation mirrored between FE and BE.

## Where it's going (roadmap themes)

- **Studio + Data Management expansion** — an approved-later roadmap of ranked
  features building on the four reusable primitives (connection, dataset,
  analysis, dashboard). Not yet building; see the project memory
  `studio-datamgmt-expansion-plan` for the ranked list.
- **Reporting pillar** — formatted, scheduled reports on the BI layer.
- **Continuous parity** — closing feature gaps against dedicated DB IDEs and
  BI tools so DBExec genuinely replaces both.

## Conventions that apply to ALL work

- **Branch:** active development is on `version_261` in both repos.
- **The user pushes. The agent never pushes.**
- **Never commit** environment/secret files (`.env`, FE `environment*.ts`).
- **Verify before "done":** FE = `tsc` → `ngc --noEmit` → prod build; BE =
  `tsc --noEmit` → `npm run build`. Live-verify behavior when a runtime
  surface exists.
- **Onboarding-safe DDL:** new per-org columns/tables must be additive +
  nullable (auto-named indexes) so org onboarding's schema sync never breaks.
- **Mirror FE↔BE validators** byte-for-byte.
- Per-repo detail lives in each repo's `CLAUDE.md`.
