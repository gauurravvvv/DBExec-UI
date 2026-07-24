# organisation
> Update the Progress log on every change.
> Code path: `src/app/modules/organisation` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** Tenant (organisation) management — a **platform System-Admin-only** module. Create/list/edit/view orgs; creating an org provisions its per-org DB connection (host/port/name/schema/username/password) and seeds a bootstrap Org Admin. Route `/app/organisations`, gated `roleGuard` + `PERMISSIONS.ORG_MANAGEMENT` (only the master System-Admin role holds it).
- **Key files:**
  - `services/organisation.service.ts` — signals service (`orgs/total/current/loading/saving/deleting/validating`). Methods: `load/loadOne`, `add/edit/delete/bulkDelete`, `refreshMasterDb(orgId)`, `validateDatasource(...)`, `validateMasterDb(...)`.
  - `components/add-organisation` — Zod-validated form (mirrored `validators/organisation.ts`): org name/description + DB connection fields + bootstrap-admin identity (email/firstName/lastName/username/locale). The BE generates the per-org **AES-256-GCM DEK** server-side (wrapped under the platform master key) — the FE never handles keys.
  - `components/edit-organisation` — org name is **immutable after create**; DB fields are optional on edit (send only what changed → BE two-path validator decides re-validate vs password-only auth check); status toggle; save justification.
  - `components/list-organisation` / `view-organisation` — table + read-only detail.
- **Depends on:** shared Zod `validators/organisation`, shared table + `app-custom-*`, `HttpClientService`. **Depended on by:** `system-admin` (admins operate within/across orgs); `home` System-Admin dashboard reads org-scoped counts.
- **How it works:** Orgs are the tenancy root. Each org has its own DB connection + per-org DEK; per-org runtime settings (security policy, SMTP/email, SSO) live on the **OrgPolicy** entity and are configured by the Org Admin under App/System Settings — the System Admin's Add-Organisation form deliberately does NOT collect them. `refreshMasterDb` re-syncs the master DB record for an org.
- **Decisions:** Add-org no longer collects security/email config (moved to OrgPolicy, see [[settings-sso-shipped]]). Bootstrap-admin identity collected at create + passed to the seeded-admin create (commit cd21791d). Org name locked post-create. Mutations opt out of the global loader (`skipLoader`), button-level spinners instead. See ../ARCHITECTURE.md for tenancy/DEK globals.
- **Gotchas:** This module is invisible to org users (permission-gated). Org DDL / per-org schema provisioning is an onboarding-landmine zone — see memory [[finder-explorer-bugs]] / [[folder-removal-map]] for the DB_SYNC=false + per-org-schema lessons; org update/delete/refreshMasterDb audit writes go to the MASTER DB and are **not live-tested** (need a System-Admin token; only org-Admin was available at test time). Form follows the 1-per-row 50% layout convention (6c0cecbb).

## 2. Goals
- **Objective:** Correct tenant provisioning + lifecycle, cleanly separated from per-org runtime config (OrgPolicy).
- **Current focus:** — none active.
- **Next up:** Live-test master-DB org audit paths with a real System-Admin token.
- **Out of scope:** Per-org security/email/SSO config (that's `app-settings` / OrgPolicy); org users (that's `users`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full org CRUD + DB-connection validation (`validateDatasource`/`validateMasterDb`) + `refreshMasterDb`. Bootstrap-admin identity at create (cd21791d). Security/email config removed from add-org (moved to OrgPolicy). Reference-data dropdowns + paginator removal (3d27b282). Shared editable email-chips + 1-per-row 50% form layout (6c0cecbb).
- In progress / Known issues: master-DB org audit paths not live-verified (needs System-Admin token). UI commits local-only on `version_261`.
- Next: —
- Files touched: docs/context/modules/organisation.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/organisation`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/organisation.md
