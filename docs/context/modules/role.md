# role
> Update the Progress log on every change.
> Code path: `src/app/modules/role` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** Application **RBAC role** management (singular folder `role/`, NOT `roles`): list/add/edit/view + the **permission-grid editor**. A Role is the terminal link of the chain (User→Group→**Role**→RolePermissionMapping). The grid sets a per-permission access **level** (None/Read/Write/Full = 0/1/2/3) across the org's permission tree.
- **Key files:**
  - `role.types.ts` — the wire contracts: `PermissionModule/PermissionRow` (tree read), `AccessLevelEntry` (the 4 canonical columns), `SelectedPermissionEntry` (`{permissionId, level}` flat write array), `AddRolePayload`/`UpdateRolePayload`. Read from `GET /permissions` (leaves carry `level` only when `?roleId=` is passed) and `GET /access-levels`.
  - `services/role.service.ts` — signals service (`roles/current/permissions/loading/saving/loadingPermissions`, per-id `deleting`). Methods: `load/loadOne`, `listPermissions({scope:'ORG'})`, `listAccessLevels`, `add/edit/delete`, `get`.
  - `components/add-role` / `edit-role` — the permission-grid UX. Edit does a triple-parallel read (role record + role-scoped permission tree so leaves carry current `level` + access-level table) before rendering; keeps `levelByPermissionId: Record<string,number>`; strips level-0 entries client-side before send. Write wholesale-replaces the role's mappings.
  - `components/list-role` / `view-role` — table + read-only detail.
- **Depends on:** `core/constants/permissions.constant` (mirrors BE catalog), shared Zod `validators/roles`, shared table + `app-custom-*`. **Depended on by:** `groups` (imports RoleService for its role picker); the whole app's `role.guard` + `permission.service` consume the grants this module authors.
- **How it works:** Permissions live in the RolePermissionMapping junction (permissionId + level), NOT a JSON column. Login `resolveUserPermissions()` walks user→groups→roles, unions grants, stamps into the JWT; every route is gated by `VerifyPermissionMiddleware(value, level)` — no per-request DB lookup. Module headers carry NO grant — the child LEAVES do (so gates always reference a leaf, never a module header).
- **Decisions:** The seeded default **Administrator role is fully locked in the UI** (commit d9f2e380) — edit-role renders read-only when `isLocked`; BE rejects the update. Self-protection FE (cd21791d). This module was mistakenly thought missing during recon (grepped `roles` plural); it EXISTS and is complete — do NOT build a duplicate `roles/`. See memory [[usermgmt-recon-findings]], [[settings-sso-shipped]] (permission catalog split appSettings/systemSettings).
- **Gotchas:** Update is a WHOLESALE replace of mappings — send the complete `selectedPermissions` set, not a delta. Holding a PARENT module grant does NOT auto-grant children; each leaf is independent. `permissionService.canRead(<module header>)` is always false by design (headers are ungated). Level < 1 entries are stripped both FE and BE.

## 2. Goals
- **Objective:** A correct permission-grid editor whose output drives every route/UI gate in the app; locked defaults; no self-lockout.
- **Current focus:** — none active.
- **Next up:** —
- **Out of scope:** DB-access privileges (that's `db-access` DB roles — a different concept entirely); platform System-Admin role (master DB, no orgId).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full role CRUD + permission-grid editor (None/Read/Write/Full per leaf, `?roleId=`-scoped level read, wholesale-replace write). Default Administrator role locked in UI (d9f2e380). Self-protection FE (cd21791d). a11y sweep across user-mgmt (566ea876) — confirmed the module already existed + fully wired. Reference-data dropdowns + paginator removal (3d27b282).
- In progress / Known issues: none module-specific. UI commits local-only on `version_261`.
- Next: —
- Files touched: docs/context/modules/role.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/role`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/role.md
