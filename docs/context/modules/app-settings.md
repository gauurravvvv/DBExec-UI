# app-settings
> Update the Progress log on every change.
> Code path: `src/app/modules/app-settings` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** The org's Settings surface, delivered as **two tabbed hubs** reached from the sidebar Settings group:
  - `/app/settings/app` → **App Settings** hub: Theme · Branding · Announcements (look-&-feel).
  - `/app/settings/system` → **System Settings** hub: SSO · Email · Security Policy · AI Features (org runtime config, mostly on the per-org `OrgPolicy` entity).
- **Key files:**
  - `components/app-settings-hub` / `system-settings-hub` — `p-tabView` containers. One "Save" button in the hub header delegates to the ACTIVE tab via the `SettingsTabForm` contract; active tab mirrored to `?tab=` for deep links; only the active tab is instantiated (`*ngIf`).
  - `settings-tab-form.ts` — the `SettingsTabForm` interface (`onSave()`, `dirty`, `busy`) every tab implements so the hub's single Save works.
  - Tab bodies: `theme-settings`, `branding-settings`, `sso-settings`, `email-configuration`, `security-policy`, `ai-features`; announcements is a nested CRUD (`list/add/edit/view-announcement`) with its own leaf routes.
  - `services/org-policy.service.ts` — signals (`current/loading/saving`); `getPolicy()` + `updateSecurity/updateEmail/updateSso`. `theme-settings.service`, `branding-settings.service`, `announcement.service` back their tabs.
  - `app-settings-routing.module.ts` — `'' → app`; the old per-screen routes are gone (they're tabs now); announcement CRUD keeps leaf routes.
- **Depends on:** BE `OrgPolicy` (`/org-policy`, `/org-policy/sso`), theme/branding/announcement endpoints, `HttpClientService`, `role.guard`, shared `app-custom-*`. **Depended on by:** `auth` login reads the SSO toggle; theme applied app-wide via `theme.service`; `ai-workspace` (Dex) reads the AI Features config; announcements surface in the shell.
- **How it works (permission gating — the crux):** Module HEADERS carry no `level`, only LEAVES do — so `canRead('appSettings')`/`canRead('systemSettings')` is ALWAYS false even for a full admin. Each hub route therefore gates on a **child leaf** the org admin holds: App hub on `THEME_MANAGEMENT`, System hub on `SSO_CONFIGURATION`. Holding the leaf shows the whole hub (sub-tabs are NOT individually gated). BE write routes gate on the matching leaf (e.g. `ssoConfiguration` WRITE for `PUT /org-policy/sso`).
- **Decisions:** Sidebar consolidated into one Settings group with two hub leaves (commit f93460a1, fe254971). Permission catalog split `appSettings` (theme/branding/announcements) vs new `systemSettings` (sso/email/security/ai) — see memory [[settings-sso-shipped]]. SSO cert + email password + AI API key are **write-only**: BE returns a `*Configured` boolean, never the value → UI shows a masked "Configured" state (empty string clears, omit keeps). AI Features = openai-compat provider + base URL + model + temperature; needs a FRONTIER model to actually drive Dex (see [[dex-full-app-control]]).
- **Gotchas:** Do NOT gate a hub route on the module header (`systemSettings`/`appSettings`) — the guard will always block ("can't open App Settings" bug); gate on a leaf. `POST /org-policy/backfill-settings` (gated `securityPolicy` WRITE) seeds systemSettings leaves for EXISTING orgs — the catalog seed is NOT re-run on boot; fresh orgs get it at onboarding, existing prod orgs need the backfill. Turning SSO off clears the IdP fields (load patches with `emitEvent:false` so it doesn't clear on load). SSO happy-path is not live-verified (needs a real IdP).

## 2. Goals
- **Objective:** One coherent, permission-correct Settings surface; secrets never round-trip; each tab saves through the shared hub Save.
- **Current focus:** — none active.
- **Next up:** Live-verify SSO save→reload (cert masked) + SSO login toggle end-to-end; verify backfill on an existing org.
- **Out of scope:** Platform-wide (cross-org) settings; per-user preferences (none — theme is org-level).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Two tabbed Settings hubs + `SettingsTabForm` shared-Save contract (f93460a1). System Settings hub + SSO config UI + SAML login FE (fe254971, BE 4e7763b/5f68ab7/b66b104). AI Features tab + Dex polish (dd76b9d7, 6ece88d4). Theme/Branding/Email/Security/Announcements tabs. Leaf-permission gating fix for both hubs. Write-only secret masking (SSO cert / email pw / AI key). `backfill-settings` endpoint for existing orgs.
- In progress / Known issues: SSO IdP round-trip unverified; backfill not verified on a live existing org; Dex needs a frontier model. UI commits local-only on `version_261`.
- Next: SSO + backfill live verification.
- Files touched: docs/context/modules/app-settings.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/app-settings`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/app-settings.md
