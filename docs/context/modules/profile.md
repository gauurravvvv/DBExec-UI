# profile
> Update the Progress log on every change.
> Code path: `src/app/modules/profile` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- **Responsibility:** The logged-in user's own profile — a **thin, read-mostly** module. View-only detail of the current user (name/email/username/org/groups) plus a **Change Password** dialog. No add/edit/list quartet; just one `view-profile` screen.
- **Key files:**
  - `services/profile.service.ts` — small signals service: `profile` + `loading` readonly signals; `loadProfile()` (GET), `changePassword(newPassword)`, `cancelReads()`. That's the whole surface.
  - `components/view-profile/view-profile.component.ts` — read-only profile card; `showChangePasswordDialog` signal drives a change-password dialog; on confirm calls `profileService.changePassword()`.
- **Depends on:** `HttpClientService`, shared `app-custom-*` + password dialog, permission/global services (for identity display). **Depended on by:** reached from the header/user-menu; not imported by other feature modules.
- **How it works:** Reads the current user server-side from the JWT (no id passed). Password change routes through the same org-DEK-encrypted password path as the rest of user-mgmt (per-org users are reversibly encrypted, not bcrypt). Reads pipe through a cancel Subject so navigating away aborts the in-flight GET.
- **Decisions:** Multi-role/multi-group RBAC — the FE dropped every "single primary role" assumption (commit 3a79eb2b); profile shows aggregated groups, not one role. No role-string checks (a512ff0d). Skeleton-loading + read cancellation rollout (66fe8f41). See ../ARCHITECTURE.md for auth/token globals.
- **Gotchas:** Deliberately minimal — do NOT add a full edit-profile form here without a real requirement; identity fields (email/username) have security implications (email change triggers a welcome-mail + is canonicalized lowercase) and belong to the user-mgmt validation path, not a casual self-edit. No org-dropdown plumbing (removed app-wide in 7fa4a2b5).

## 2. Goals
- **Objective:** Let a user see who they are and change their own password, safely.
- **Current focus:** — none active.
- **Next up:** —
- **Out of scope:** Editing another user (that's `users`); theme/locale preference (theme lives in `theme.service` / App Settings, not per-user here).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: View-profile + Change Password dialog wired through a lean signals service. RBAC multi-role cleanup — dropped single-role assumption (3a79eb2b) and role-string gates (a512ff0d). Skeleton-loading + cancellation rollout (66fe8f41). Org-dropdown plumbing removed app-wide (7fa4a2b5).
- In progress / Known issues: none module-specific. UI commits local-only on `version_261`.
- Next: —
- Files touched: docs/context/modules/profile.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/profile`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/profile.md
