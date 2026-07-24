# groups
> Update the Progress log on every change.
> Code path: `src/app/modules/groups` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** Org-scoped user Groups CRUD (list/add/edit/view). A Group is the middle link of the RBAC chain: **User → UserGroupMapping → Group → (one) Role → permissions**. Add/edit a group = name/description/status + assign its single Role + (optionally) its member users.
- **Key files:**
  - `services/group.service.ts` — signals service (`groups/total/current/loading/saving`, per-id `deleting`). Methods: `load/loadOne`, `add/edit/delete/bulkDelete`, `listGroups`, `viewGroup`, `cancelReads`. `listGroups`/`viewGroup` are the read helpers other modules (users add/edit, rls-rules pickers) call directly.
  - `components/list-group` — `app-custom-table` + `UsServerListAdapter` on `/groups` (infinite scroll, no bulk-select, global search over name/description).
  - `components/add-group` / `edit-group` — vertical Zod-validated forms; Role picker (from RoleService in `modules/role`) + member selection; save justification.
  - `components/view-group` — read-only detail.
- **Depends on:** `role` (imports RoleService for the role picker — cross-module), shared Zod `validators/groups`, shared table + `app-custom-*`. **Depended on by:** `users` (group filter on the list + group multiselect in add/edit imports GroupService), `rls-rules` (group-scoped rules).
- **How it works:** Org-scoped server-side from JWT. A group holds exactly one Role; permissions a user gets are the UNION across all their groups' roles, resolved at login into the JWT. Membership edits and role changes both re-shape effective permissions.
- **Decisions:** The seeded default **Administrator group is locked in the UI** (commit d9f2e380) — can't be renamed/deleted/re-roled; BE rejects the mutation too. Self-protection model FE (cd21791d) — you can't remove yourself from the admin group if it would strip your own admin. See ../ARCHITECTURE.md for tenancy, and memory [[usermgmt-recon-findings]], [[usermgmt-edgecases-fixed]].
- **Gotchas:** Editing a group's role over-notifies members (a fixed notification-cluster item). Group name uniqueness is app-level dedup + `@Index` only (not a DB unique constraint) → theoretical concurrent-double-submit dup (noted, not yet hardened). The last-admin guard for the group-replace path in `updateUser` is DEFERRED (guard exists but isn't called on that path — part of the same deferred bucket as users). No bulk row-select.

## 2. Goals
- **Objective:** Clean group lifecycle that correctly drives the RBAC union; locked defaults; no self-lockout.
- **Current focus:** — none active.
- **Next up:** (with users) partial-unique index `(name, organisationId) WHERE deletedOn IS NULL` — onboarding-safe DDL, only when hardening that bucket.
- **Out of scope:** Multiple roles per group (single-role by design); permission editing (that's `role`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full CRUD + role/member assignment. Default Administrator group locked in UI (d9f2e380). Self-protection FE (cd21791d). a11y sweep (566ea876). Reference-data dropdowns + paginator removal (3d27b282). custom-table empty-state / filter-row fixes (131d4a37).
- In progress / Known issues: name uniqueness is app-level only (race-theoretic); group-replace last-admin guard deferred. UI commits local-only on `version_261`.
- Next: — (unique-index hardening on request).
- Files touched: docs/context/modules/groups.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/groups`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/groups.md
