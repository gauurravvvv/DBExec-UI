# auth
> Update the Progress log on every change.
> Code path: `src/app/modules/auth` · Status: 🟢 · Last updated: 2026-08-11

## 1. Context
- **Responsibility:** All pre-app screens: credential login + SSO toggle, forgot-password (OTP), reset-password, set-password (first-login/invite), the post-login **relay** bootstrap screen, and the SAML **sso-relay** landing. This module owns the unauthenticated router surface; the actual login/session logic lives in the app-wide `core/services/login.service.ts` (a root singleton), not in a module service.
- **Key files:**
  - `components/login/login.component.ts` — 3-field form (org/username/password) via shared Zod schemas (`shared/validators/auth`); `isSSOLogin` toggle; caps-lock detection; collapses most failures to one generic error, but surfaces the 403 "password not set" message verbatim.
  - `components/relay/relay.component.ts` — post-login phase-2 screen. Rich state machine `loading→slow(6s)→ready/error`, 30s hard timeout, one silent retry on transient failure, two-stage Esc-to-bail, race-guarded `bootstrapSession()`/`applyBootstrap()`. Picks home route by **permission** (`SYSTEM_ADMIN` read → System-Admin home, else Org home) — not role string.
  - `components/sso-relay/sso-relay.component.ts` — PUBLIC `/auth/sso-relay`; reads `SAMLResponse`+`RelayState` from the BE 302, POSTs `completeSamlLogin()`, hands off to `/relay`.
  - `components/set-password` / `forgot-password` / `reset-password` — invite/OTP/reset flows; `set-password` verifies the setup token, offers resend, strength-validated (`newPasswordSchema` + `passwordStrengthValidator`).
  - `auth-routing.module.ts` — `set-password` and `auth/sso-relay` are guard-free (public); the rest use `authGuard` (redirects already-logged-in away, `/relay` via a POST_LOGIN carve-out).
- **Depends on:** `core/services/login.service` (login, SAML url/callback, bootstrap, OTP, refresh-token timer), `core/services/storage` (RELAY_FIRST_NAME etc. phase-1 stash), `permission.service`, `global.service`, shared Zod `validators/auth`. **Depended on by:** nothing imports it — it's the router entry point.
- **How it works (two-phase login):** phase-1 `POST /auth/login` returns a token + a tiny envelope; login.service stashes firstName/lastName/isFirstLogin and routes to `/relay`. Relay fires phase-2 `GET /auth/session` (permissions/theme/branding/locale via `applyBootstrap`), commits it, then navigates home. SSO enters the same path from `sso-relay` → `completeSamlLogin` → `/relay`.
- **Decisions:** Two-phase login + relay (60a452cf). RBAC by permission, not role string, app-wide (a512ff0d). SAML SSO = 3 PUBLIC BE routes mounted before SanitizeOrgInput; **no JIT** (user must pre-exist + be ACTIVE); org-not-found → generic LOGIN_FAILED (anti-enumeration). See memory [[settings-sso-shipped]] and ../ARCHITECTURE.md for tenancy/token globals.
- **Gotchas:** `sso-relay` MUST stay public (browser lands mid-auth with no token). Relay bounces to `/login` if the phase-1 stash is missing. Login is validator-loose on purpose (no strength/format check at sign-in — would block legacy accounts + leak the policy). `resendSetupLink` is a PUBLIC route called from the unauthenticated set-password page. Late relay responses after the 30s timeout / after Back-to-login are dropped (never write storage).

## 2. Goals
- **Objective:** Reliable, resilient sign-in; a relay that degrades gracefully on slow/broken BE and never half-commits a session.
- **Current focus:** — none active.
- **Next up:** Live-verify SSO happy path against a real SAML IdP (Okta dev / samltest.id).
- **Out of scope:** Embedded OEM auto-login (`/auth/embed`) — designed only, lives in the `embed` module, not built here.

## 3. Progress (newest first)
### 2026-08-11 — Code-review fixes on the magic-link reset
- Done: forgot-password countdown is now existence-agnostic — the BE returns `expiresAt` on EVERY success (real send, rate-limit, or anti-enumeration masked non-send with a synthetic expiry), so the countdown renders identically whether or not the account exists (the UI is no longer an existence oracle); added a clarifying comment. Removed the dead `trackByIndex`. Localised `validation.auth.resetToken.*` in the 9 non-English locales (were copied from setup-token wording).
- Next: live end-to-end.
- Files touched: `components/forgot-password/forgot-password.component.ts`, `assets/i18n/*.json`.

### 2026-08-11 — Password reset → magic-link (forgot + reset screens)
- Done: **forgot-password** dropped the `username` field — now org + email only; button copy "Send reset link" / "Resend link"; countdown reads `res.data.expiresAt` (was `otpExpiresAt`). **reset-password** dropped the 6 OTP input boxes and all OTP handling (controls, paste/keydown, `isOtpComplete`); it now reads the 64-char `token` from the URL query (with `id`/`orgId`) and only collects the new password + confirm; missing any of the three → redirect to login. `login.service.generateOTP` sends `{ organisation, email }`; `resetPassword(form, id, orgId, token)` sends `{ id, orgId, token, password }`. Removed the now-dead `.auth-otp*` SCSS from `auth-shell`. Validators mirrored from BE (`resetTokenSchema`, `requestPasswordResetSchema`, token-based `resetPasswordSchema`) + `validation.auth.resetToken.*` i18n across 10 locales.
- In progress / Known issues: none for the FE. (BE side owns the email link + token verify.)
- Next: live end-to-end (forgot → email link → reset → login).
- Files touched: `components/forgot-password/*`, `components/reset-password/*`, `components/auth-shell/auth-shell.component.scss`, `core/services/login.service.ts`, `shared/validators/auth.ts`, `assets/i18n/*.json`.

### 2026-07-24 — Current state captured
- Done: Full credential + SAML SSO login shipped. SSO FE = `isSSOLogin` toggle + `loginWithSso()` + public `sso-relay` component (commit fe254971, BE 5f68ab7). Login "account not activated / set your password" message fix (6c18ab89). Shared Zod auth schemas (11cd848d) mirrored to BE. Relay hardening: race-safe bootstrap + focus + retry review passes (a272be55, 3fb2d44b, 5a3248fc); two-phase login + branding watermark (60a452cf). RBAC drops FE role-string checks for permission checks (a512ff0d).
- In progress / Known issues: SSO IdP round-trip unverified (no test IdP wired). UI commits local-only on `version_261` — user pushes.
- Next: verify SSO against a live IdP.
- Files touched: docs/context/modules/auth.md
### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/auth`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/auth.md
