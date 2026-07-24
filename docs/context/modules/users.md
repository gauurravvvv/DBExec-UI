# users
> Update the Progress log on every change.
> Code path: `src/app/modules/users` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** Org-scoped **application** user management (NOT db-access DB users): list/add/edit/view, bulk CSV add, per-row delete, unlock, admin password reset, group assignment, status (active/inactive). Users belong to Groups → Groups carry one Role → Role holds the permission grants.
- **Key files:**
  - `services/user.service.ts` — signals service (`users/total/current/loading/saving`, per-id `deleting/unlocking/changingPassword`, `bulkValidating/bulkCommitting`). Methods: `load/loadOne`, `add/update/delete/bulkDelete`, `unlock`, `updatePassword`, `bulkAddValidate/bulkAddCommit`, `cancelReads`.
  - `components/list-user` — `app-custom-table` + `UsServerListAdapter` on `/users` (infinite scroll, no bulk-select). Org-wide (no datasource gate) plus a server-mode **Group filter** dropdown in the toolbar-left slot; rebuilds the adapter on group change. Header carries an "Activity" button → `/app/users/activity` (audit-logs component locked to user/group/role module scope).
  - `components/add-user` / `edit-user` — vertical Zod-validated forms (mirrored `validators/users.ts`); server-mode group multiselect (filters active groups); save justification. `bulk-add-user` — CSV upload → validate → commit.
  - `components/view-user` — read-only detail.
- **Depends on:** `groups` (GroupService for the group picker — cross-module import), shared Zod `validators/users`, shared table + `app-custom-*`. **Depended on by:** `auth`/login resolves permissions through the user→group→role chain; `home` counts users.
- **How it works:** All calls are org-scoped server-side from the JWT (FE never passes orgId). Passwords for org users are reversibly org-DEK encrypted (BE), never bcrypt — that's per-org design; master/system-admin users use bcrypt (see `system-admin`). Email is canonicalized lowercase at write (shared `emailSchema` transform mirrored FE↔BE); username stays case-sensitive.
- **Decisions:** Self-protection model (commit cd21791d) — a user cannot deactivate/delete/de-admin themselves in the UI (`guardSelfEdit`); org bootstrap-admin identity surfaced. Last-admin lockout guard present FE+BE. See memory [[usermgmt-edgecases-fixed]], [[usermgmt-recon-findings]], [[audit-usermgmt-rebuilt]].
- **Gotchas:** 11 BE edge-case bugs were fixed (status-clobber on omitted status, case-insensitive email, resendSetupLink oracle+cooldown, admin-reset password-history, generateOTP INACTIVE, bulk mononym lastName optional, etc — BE `bc2baa34` + FE validator mirror `047ef940`). **DEFERRED (do NOT touch until asked):** last-admin TOCTOU race (lock-free reads before write — two concurrent admin deactivations can both pass → org bricked) and break-glass recovery. Bulk CSV treats `lastName`/`locale` as OPTIONAL headers. No bulk row-select anywhere.

## 2. Goals
- **Objective:** Complete, safe org-user lifecycle with strong self/last-admin protection and clean forms.
- **Current focus:** — none active.
- **Next up:** Deferred last-admin TOCTOU race fix (advisory-lock + in-txn re-count) + break-glass recovery — only when user asks.
- **Out of scope:** DB-level database users (that's `db-access`); system-admin/master users (that's `system-admin`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full CRUD + bulk CSV + unlock + admin password reset. Self-protection model + bootstrap-admin identity (cd21791d). a11y sweep across users/groups/roles (566ea876). Reference-data DB-driven dropdowns + paginator removal (3d27b282). Autocomplete=off app-wide (ea9c8a8a). Add-user form full-height fix (16d21e31). BE deep edge-case pass fixed 11 real bugs (bc2baa34; FE mirror 047ef940). User-Mgmt "Activity" audit view wired (06be2b5b).
- In progress / Known issues: DEFERRED last-admin TOCTOU race + break-glass (real, confirmed, not yet built). UI commits local-only on `version_261`.
- Next: — (deferred items on request only).
- Files touched: docs/context/modules/users.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/users`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/users.md
