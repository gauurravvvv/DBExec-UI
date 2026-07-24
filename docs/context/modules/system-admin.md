# system-admin
> Update the Progress log on every change.
> Code path: `src/app/modules/system-admin` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** Management of **platform System-Admin (master) users** — the operators who create/manage tenants. Standard list/add/edit/view quartet at `/app/admins`, gated `roleGuard` + `PERMISSIONS.SYSTEM_ADMIN`. These are master-DB users with NO orgId — distinct from org application users (`users`) and DB users (`db-access`).
- **Key files:**
  - `services/system-admin.service.ts` — signals service (`admins/total/current/loading/saving`, per-id `deleting/unlocking/changingPassword`). Methods: `load/loadOne`, `add/update/delete/bulkDelete`, `unlock`, `updatePassword`, `listSystemAdmins`. Mirrors the shape of `user.service` but hits the master-admin endpoints.
  - `components/list-system-admin` — `app-custom-table` + `UsServerListAdapter` (infinite scroll, no bulk-select).
  - `components/add-system-admin` / `edit-system-admin` — Zod-validated forms; admin password reset + unlock; save justification.
  - `components/view-system-admin` — read-only detail.
- **Depends on:** shared Zod validators, shared table + `app-custom-*`, `HttpClientService`. **Depended on by:** works alongside `organisation` (System Admin creates orgs) and the `home` System-Admin dashboard. `permission.service.canRead(SYSTEM_ADMIN)` (only this role holds it) gates both this module and org management.
- **How it works:** System-Admin users are stored in the MASTER DB (no per-org schema). Their passwords are **bcrypt-hashed** (`hashPassword`/`verifyPassword`) — the opposite of per-org users (reversible org-DEK encryption). Login for a master user follows the bcrypt path; org users the decrypt-and-compare path. All routes gated on `SYSTEM_ADMIN`.
- **Decisions:** Password model split (master = bcrypt, per-org = DEK) is DELIBERATE and correct — do NOT "fix" it (a prior recon flagged `encryptForOrg` as a bug; verified WRONG, would break org login). See memory [[usermgmt-recon-findings]]. Table unified to `app-custom-table` app-wide (18d6f1b5, custom-table-standard). Self-protection model applies here too (cd21791d — can't delete/deactivate self).
- **Gotchas:** Invisible to org users (permission-gated). Master-DB audit writes for admin/org operations are logged to the master audit_log and were **not live-tested** (need a real System-Admin token; only org-Admin was available at test time — see [[audit-usermgmt-rebuilt]]). Reference-data dropdowns + no paginator (3d27b282). Autocomplete=off on forms (ea9c8a8a).

## 2. Goals
- **Objective:** Complete, safe lifecycle for platform operator accounts, cleanly separated from org users.
- **Current focus:** — none active.
- **Next up:** Live-test master-DB admin audit paths with a real System-Admin token.
- **Out of scope:** Org application users (that's `users`); tenant/org records (that's `organisation`); DB users/roles (that's `db-access`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full System-Admin CRUD + unlock + admin password reset, master-DB scoped, bcrypt passwords. Table unified to app-custom-table (18d6f1b5). Reference-data dropdowns + paginator removal (3d27b282). custom-table empty-state fixes (131d4a37). Autocomplete=off (ea9c8a8a). Self-protection model (cd21791d).
- In progress / Known issues: master-DB admin audit paths not live-verified (needs System-Admin token). UI commits local-only on `version_261`.
- Next: —
- Files touched: docs/context/modules/system-admin.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/system-admin`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/system-admin.md
