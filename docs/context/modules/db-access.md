# db-access
> Update the Progress log on every change.
> Code path: `src/app/modules/db-access` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: A UI over the **customer datasource's native PostgreSQL security model** — DB roles/users, GRANT/REVOKE privileges (table/column/schema/sequence/function), role memberships, default privileges, effective-privilege inspection, and live session management. NOT DBExec's own RBAC (that's the `role`/`users`/`groups` modules).
- Key files:
  - `roles/` — `list-db-roles` (roles + login-users, split FE-side on `canLogin`), add/edit/view db-role (attributes, memberships, owned objects, access-profile export).
  - `privileges/privileges-access` — the grant composer (compose grants + view effective privileges). `privileges/sessions` — live `pg_stat_activity` sessions with cancel/terminate.
  - `services/db-access.service.ts` — all HTTP (signal state); `services/describe-change.ts` — turns a mutation "intent" into a plain-language confirmation line (**no SQL is ever built or shown on the FE**); `services/access-export.util.ts` — client-side JSON/CSV export of an access profile.
  - `shared/datasource-picker/` — every screen is scoped to a chosen datasource. `components/change-summary-dialog` — preview + confirm for mutations.
- Depends on: **datasource** (the `:datasourceId` every route is scoped to; introspects that DB's catalog). `DB_ACCESS` api constants.
- Depended on by: — standalone admin tooling; loosely related to query-runner connections (both act on a datasource's native login).
- How it works: Two lazy modules mounted separately in app-routing — `db-roles` (path `db-roles`) and `db-privileges` (path `db-privileges`, with `sessions` child), both sharing `DbAccessSharedModule` + the `dbPrivileges` permission. Pick a datasource → service calls `/db-access/:datasourceId/...` → BE opens the target Postgres and queries its catalog live. Every mutating endpoint accepts `previewOnly:true` → returns `{ masked: string[] }` (a SQL preview the user confirms) instead of executing; destructive ops require `confirm:true`. `capability` endpoint tells the UI what the engine supports.
- Decisions: **FULLY STATELESS / live-only** — the target datasource's Postgres catalog is the ONLY source of truth; nothing is mirrored or persisted to DBExec's DB. FE never constructs or displays raw SQL — it POSTs a structured change-set intent, BE emits the SQL. Lists use `app-custom-table` (`list-db-roles` was the original pilot for the custom-table rollout). See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: Postgres-centric (the native-security model + `pg_stat_activity` sessions assume PG; capability-gated for other engines). `us-data-grid` retired here but `UsGridCellDirective` kept (custom-table depends on it). Sessions migrated to app-custom-table (1e482a19). The BE audit-log-system note flags db-access **grants** as an audit-coverage gap (connection CRUD + grant/execute events not fully diffed).

## 2. Goals
- Objective: Safely inspect and manage a datasource's native DB security (roles, grants, memberships, sessions) with preview-before-execute and no local state drift.
- Current focus: — none active.
- Next up: — (potential: broaden beyond Postgres; close the audit-coverage gap on grants).
- Out of scope: DBExec app RBAC (role/users/groups), RLS row filters (rls-rules).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Stateless live PG security console is complete — roles/users list, add/edit/view role (attributes/memberships/owned/export), grant composer with effective-privilege view, default privileges, preview-only + confirm on every mutation, plain-language change descriptions (no FE SQL), access-profile JSON/CSV export, live sessions with cancel/terminate. Migrated to `app-custom-table` (roles pilot 0baee618 + sessions 1e482a19); admin modules → `app-chip` (481422e7); reference-data DB-driven dropdowns (3d27b282); density switch dropped + scroll chain fixes.
- In progress / Known issues: Postgres-only for now (capability-gated). Audit coverage of grant/connection events is a flagged gap (audit-log-system).
- Next: —
- Files touched: docs/context/modules/db-access.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/db-access`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/db-access.md
