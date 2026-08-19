# auth
> Update the Progress log on every change.
> Code path: `src/app/modules/auth` · Status: 🟢 · Last updated: 2026-08-19

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
### 2026-08-19 — auth surfaces off-white (#FCFCFB) instead of pure white
- Done: pure-white auth surfaces were harsh on the eyes; swapped every white the auth pages actually render to a soft off-white `#FCFCFB` (rgb 252,252,251). **Shared `--auth-*` tokens** (`_theme-variables.scss`): `--auth-surface-glass`/`-chrome`, `--auth-input-surface`/`-hover`/`-focus` moved from `rgba(255,255,255,α)`/`#ffffff` → `rgba(252,252,251,α)`/`#fcfcfb`. **Shell canvas** (`auth-shell.component.scss`): the hardcoded page gradient `#f6faff→#fbfdff` → `#fcfcfb→#fdfdfc`. Because the change is in the shared tokens + shell, ALL auth pages inherit it (login, forgot, reset, set-password).
- Deliberately NOT touched: the legacy split-panel tokens (`--auth-form-bg-*`, `--auth-input-bg`, `--auth-heading-gradient`) are dead (0 refs); the submit-button `color:#fff` is text-on-gradient (correct); relay's `background: var(--background-color, #ffffff)` fallback is intentionally matched to the theme registry default (documented) and is driven by the app-wide token, not the auth layer — deferred to the pending app-wide pass.
- Verified: `ng build --configuration production` green (31s). Live screenshot pending.
- Files touched: `assets/sass/variables/_theme-variables.scss`, `components/auth-shell/auth-shell.component.scss`.

### 2026-08-17 — auth pages fully i18n'd + email-link locale honoured
- Done: converted every hardcoded string on the auth pages to translate keys and made the public pages render in the email link's locale. **Components:** auth-shell (chrome/hero/features via new AUTH.SHELL.*), set-password, reset-password, forgot-password (all fully keyed), login (remaining labels/errors/card copy keyed; SSO already was). Card titles/subtitles that are computed signals resolve via `translate.instant()`; static ones bind `[cardTitle]="'KEY' | translate"`. Reused the rich existing key set where wording matched — `PASSWORD.*` (8 rules w/ `{{length}}` + MISMATCH + CONFIRM_REQUIRED), `AUTH.SET_PASSWORD_FAILED`/`RESET_FAILED`/`LINK_SENT_MSG`/`INVALID_LINK_MSG`, `AUTH.ORGANISATION/USERNAME/PASSWORD/EMAIL`, `AUTH.SSO.BACK_TO_LOGIN` ("Back to sign in"), `validation.auth.*.required`, `VALIDATION.FIELD_REQUIRED`. **New keys** (added to ALL 10 locales with real translations, `{{name}}` preserved): AUTH.SHELL.* (13), AUTH.SET.* (15), AUTH.RESET.* (10), AUTH.FORGOT.* (8), AUTH.FIELD.* (2), AUTH.LOGIN2.* (6). `LOGIN_PAGE_OPTIONS` marketing bullets now hold i18n keys (piped in the shell template). **Locale wiring:** set-password/reset-password/forgot-password now read `?lang=` (`?locale=` fallback) in ngOnInit and call `localeService.applyTempLocale()` — these are public routes (not `/app`), which AppComponent's `handleLocaleQueryParam` deliberately skips, so the email's language is applied here. The welcome/reset emails already append `&lang=<locale>` to the link.
- Verified: all 102 referenced auth translate keys resolve in all 10 locales; `{{name}}`/`{{length}}` intact; gates green (`tsc` + `ngc --noEmit` AOT + `ng build --configuration production`). Brand literals (`DB<span>Exec</span>` wordmark, `© DBExec ·` footer prefix) left untranslated by design; relay/sso-relay were already keyed. Pre-existing note: 3 unrelated keys (ANALYSES.ASSIGN, DATASET.NO_DATASOURCES, DATASET.SEARCH_DATASOURCES) exist in the 9 non-en locales but not en.json — NOT touched (out of scope).
- Files touched: `components/auth-shell/*.{ts,html}`, `components/set-password/*.{ts,html}`, `components/reset-password/*.{ts,html}`, `components/forgot-password/*.{ts,html}`, `components/login/*.{ts,html}`, `core/constants/global.constant.ts`, `assets/i18n/*.json` (10).

### 2026-08-17 — reset-password page pre-validates token + greets by name
- Done: the magic-link reset-password page now pre-validates its token on load (it previously rendered the form blind) and greets the user by name, mirroring set-password. Added `loginService.verifyResetToken` + `AUTH.VERIFY_RESET_TOKEN` const + `verifyResetTokenSchema` mirrored into `shared/validators/auth.ts`. Component gained `pageState` ('loading'|'valid'|'invalid'), `userName` signal, and computed `cardTitle`/`cardSubtitle` (subtitle folds in "Hi {name}, choose a new password."); `ngOnInit` calls `verifyToken()`. Template gates the form on `pageState()==='valid'` and adds loading + invalid states (reusing the shell's `::ng-deep .auth-status` styles + shared `app-content-loader`). NOTE (superseded same day): strings here were first added as hardcoded English to match the file; see the i18n pass entry below.
- Files touched: `components/reset-password/reset-password.component.{ts,html}`, `core/services/login.service.ts`, `core/constants/api.constant.ts`, `shared/validators/auth.ts`.

### 2026-08-17 — set-password page greets the user by name
- Done: the set-password (invite/first-login) page now shows the user's name under the "Set your password" header. `set-password.component.ts` reads `res.data.fullName` from `verifySetupToken` into a new `userName` signal and the `cardSubtitle` computed folds it in → "Hi {name}, create a password to activate your account." (falls back to the plain subtitle when no name comes back). Rendered by the existing `auth-shell` subtitle `<p>` — no template change. Name only arrives on the `valid` branch (the BE omits it on invalid/expired for anti-enumeration), so it's naturally absent on error states. NOTE: this component is all hardcoded English (no i18n anywhere in it), so the greeting is a literal to match the file's existing style, not a new translate key.
- In progress / Known issues: none. Gates green — `tsc` + `ngc --noEmit` AOT + `ng build --configuration production` all pass.
- Next: none. (The reset-password magic-link page still shows a static "Reset password" and does not pre-validate the token on load, so it can't greet by name without a BE round-trip — out of scope for this request.)
- Files touched: `components/set-password/set-password.component.ts`. BE counterpart: `dbexec-api` `verifySetupToken.ts` returns `fullName` on the valid branch.

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
