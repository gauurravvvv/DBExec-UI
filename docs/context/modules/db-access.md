# db-access
> Update the Progress log on every change.
> Code path: `src/app/modules/db-access` · Status: 🟡 · Last updated: 2026-08-10

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
### 2026-08-10 — PDM code-review fixes (FE)
- High-effort workflow review → FE fixes:
  - **Membership revoke was fully broken (critical):** membershipCall sent `toRole` to /memberships/remove, but the BE requires `fromRole` → every revoke 400'd. Fixed to send `fromRole: principal`.
  - **Membership grant+revoke atomicity:** the two calls now run SEQUENTIALLY (grants then revokes) and STOP at the first failure on execute; a partial apply surfaces the `MEMBERSHIP_PARTIAL` message instead of a bare failure toast (true single-txn would need a combined BE endpoint — out of scope).
  - **Restored WITH ADMIN OPTION:** re-added the `membershipAdminOption` toggle (shown when the diff grants ≥1 role) — the rebuilt dialog had dropped it.
  - **Effective inspector column grants:** groupEffective now separates table-wide vs column-only privileges; a column-only privilege renders as "PRIV (col)" so it isn't misread as whole-table. privCount counts the rendered set.
  - **applyTemplate no longer clobbers form state:** only patches attribute flags the template explicitly sets (user's other toggles preserved).
  - **goToTemplates uses DB_ACCESS.TEMPLATES_LIST constant** (was a hard-coded path).
- Note (accepted, not a bug): global "Manage Membership" header button remains removed — membership is per-principal via the row action by design; a principal not on the current page is reachable via search. Revisit if users need a picker-first entry point.
- Verified: tsc + ngc + prod build clean. +1 i18n key (MEMBERSHIP_PARTIAL) × 10 locales.
- Files touched: roles/list-db-roles/{list-db-roles.component.ts,.html}, roles/add-db-role/add-db-role.component.ts, privileges/privileges-access/privileges-access.component.ts, assets/i18n/*.json

### 2026-08-10 — PDM Phase 2 (FE): templates screen + apply, clone-privileges, composer nav
- Done:
  - **Templates manage screen (PDM D10):** new `services/db-template.service.ts` (signal CRUD over /db-access/templates) + `privileges/templates/list-db-templates` (server-paged app-custom-table; scope + built-in badges; built-ins read-only — Edit/Delete disabled; delete via app-justification-dialog with requireJustification=false) + `privileges/templates/edit-db-template` (create/edit in one; name/description/scope [org-wide vs datasource picker] + an abstract privilege-rule builder repeater; canSave gating). Routes added under db-privileges module (`templates`, `templates/new`, `templates/:id/edit`) — NO new sidebar entry (hosted under Privileges). Mirrored validator `shared/validators/db-role-template.ts`.
  - **Apply template in add-db-role:** template picker (org-wide + pinned) prefills attribute toggles from the recipe; hint shows rule count (privileges composed later on the Privileges screen).
  - **Clone privileges (PDM D1):** clone mode gains a "Copy privileges" toggle; on create success it fetches the source role's direct grants (loadRoleGrants) and applies them to the new role as one change-set.
  - **Composer nav:** privileges header gains a "Templates" button (→ manage screen) beside "Active Sessions".
  - API constants + routes constants for templates/reassign/public-grants/database-privileges/rls/who-can-access. i18n: +23 DB_ACCESS keys across all 10 locales (templates screens, apply picker, copy-privileges, rule builder).
- Verified: `tsc --noEmit` clean; `ngc -p tsconfig.app.json --noEmit` clean; `ng build --configuration production` clean (db-privileges chunk 89→128 kB with templates).
- Deferred (BE endpoints exist, FE surfaces not yet built): bulk grant/revoke multi-select in the roles list; the read PANELS for PUBLIC hardening / database-schema privileges / RLS view / reverse-lookup inside the composer; password/expiry lifecycle fields; session policy hints.
- Files touched: services/db-template.service.ts (new), privileges/templates/** (new list + edit), privileges/db-privileges.module.ts, privileges/privileges-access/* (nav), roles/add-db-role/* (apply + clone), core/constants/{api,routes}.constant.ts, shared/validators/db-role-template.ts, assets/i18n/*.json

### 2026-08-10 — PDM Phase 1 (FE): SQL-review dialog, lazy privilege tree, diff-apply memberships
- Done:
  - **Fixed the reported `Object/Type = —` bug** on the role/user detail page: replaced the flat `p-table` (bound the non-existent `row.object`/`row.objectType`) with a new `components/privilege-tree/` — a lazy-expanding schema → table → privilege-chips tree with `direct`/`via <role>` provenance + a WITH-GRANT-OPTION marker + a server-search box. Every level is server-driven (`GET …/effective/:role/tree?level=…`), so it scales to large catalogs. Removed the now-dead `effective`/`loadEffective` from `view-db-role`.
  - **Review-SQL dialog:** upgraded `change-summary-dialog` to render the exact (masked) SQL the BE now returns per statement, each with a DANGER badge + reason, plus a collapsible SQL panel (open by default). Confirm gating: neutral → 1 click; destructive → "I understand"; critical → must type the exact `confirmPhrase` (BE re-checks). Dialog now emits the typed phrase on confirm.
  - Wired the widened preview through `list-db-roles` (`runPreviewAndArm`/`confirmPreview($event)`) and `privileges-access` (`openConfirm`/`confirmApply($event)`): both bind `statements`, `confirmPhrase`, and thread the typed phrase into the execute body.
  - **Membership → "Manage roles for X" (diff apply, B1):** the per-row action now opens a dialog pre-checked with the principal's CURRENT member-of set; checking = grant, unchecking = revoke; Apply computes the diff (`toGrant`/`toRevoke`), previews grants+revokes as one merged change-set, then executes. Removed the old attach/detach mode toggle + the global toolbar membership button.
  - Add-role: `cloneFrom` is required in clone mode; Save gated via new `canSave` getter (datasource + form valid + not saving + clone source when cloning). Mandatory `*` already present via `app-custom-*` `[required]`.
  - Service: `loadEffectiveTree` + `loadRoleGrants`; API constants `EFFECTIVE_TREE_SUFFIX`, `ROLE_GRANTS_SUFFIX`. i18n (all 10 locales): `DB_ACCESS.SEARCH_SCHEMAS_PLACEHOLDER/GRANTABLE/REVIEW_SQL(reworded)/DANGER_BADGE/MANAGE_ROLES/MANAGE_ROLES_FOR/MANAGE_ROLES_HINT/MEMBERSHIP_DIFF` + top-level `PDM.DANGER.*` (BE-emitted reason keys).
- Verified: `tsc --noEmit` clean; `ngc -p tsconfig.app.json --noEmit` clean; `ng build --configuration production` clean (db-roles + db-privileges chunks build).
- Next (Phase 2): templates manage screen + apply picker; clone-privileges "copy grants"; bulk grant/revoke; new composer panels (database/schema privs, PUBLIC, RLS view, reverse lookup); password/expiry lifecycle; session hints.
- Files touched: components/privilege-tree/* (new), components/change-summary-dialog/*, roles/{list,add,view}-db-role/*, roles/db-roles.module.ts, privileges/privileges-access/*, services/db-access.service.ts, core/constants/api.constant.ts, assets/i18n/*.json

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
