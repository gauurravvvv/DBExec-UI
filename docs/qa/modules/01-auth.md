# 01 · Auth — Deep Test Cases

> Login, forgot-password, OTP, set-password, set-up token, refresh
> token, logout, route guard. Sources: `e2e/docs/modules/01-auth.md`,
> `docs/research/modules/10-auth-rbac-sso.md`,
> `DBExec-API/src/modules/auth/*`.

---

## 1. Scope

In:
- `/login` form
- `/forgot-password`
- `/reset-password?id=&orgId=`
- `/set-password?token=&id=&orgId=`
- POST `/auth/login`, `/auth/refreshToken`, `/auth/generateOTP`,
  `/auth/resetPassword`, `/auth/setPassword`,
  `/auth/verifySetupToken`, `/auth/resendSetupLink`, `/auth/logout`
- JWT issue + refresh + revoke flow
- Route guard (`/app/*` requires JWT)
- Locale propagation through auth

Out:
- SSO (covered in `22-sso-scim-api.md`)
- MFA enrolment (covered in `21-profile-mfa.md`)
- Profile change-password (covered in `21-profile-mfa.md`)

---

## 2. Fixtures

| Fixture | Notes |
|---|---|
| Active org `TestOrg` with `master_admin` user (P@ssword: `Pass@1234`) | Default seed |
| Inactive user `disabled_eve` | `status=0` |
| Locked user `locked_lucy` | After 5 wrong attempts; `accountLockedUntil > NOW()` |
| User awaiting setup `pending_paul` | `setupToken` valid 24h |
| User with stale token `expired_eve` | `setupTokenExpiresAt < NOW()` |
| User with valid OTP `otp_olivia` | `otpHash` set, `otpExpiresAt > NOW()` |
| Org with welcome banner | For locale propagation tests |

Reset between tests: `dbexec-fixtures:reset auth` script that returns the org
to the canonical state.

Env vars: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_ADMIN_USER`,
`E2E_ADMIN_PASSWORD`.

---

## 3. Test taxonomy

- 🟢 **H** — happy paths
- 🔴 **N** — explicit rejections
- 🟡 **E** — edge / boundary / race
- 🟣 **S** — security
- ⚡ **P** — performance
- ♿ **A** — accessibility
- 🌐 **I** — i18n

---

## 4. Test cases

### 4.1 Login — happy

#### AUTH-H-01 · admin signs in
- **Severity**: P0
- **Prerequisites**: `master_admin` active.
- **Steps**:
  1. Navigate to `/login`.
  2. Fill `organisation = TestOrg`, `username = master_admin`,
     `password = Pass@1234`.
  3. Click **Sign in**.
- **Expected**:
  - URL transitions to `/app/*` within 5s.
  - `localStorage` contains an auth token starting with `eyJ`.
  - Sidebar paints with at least one nav row visible.
  - `audit_log` row: `module=AUTH, action=LOGIN, actor_id=master_admin`.
- **Postconditions**: stays signed in for subsequent tests.

#### AUTH-H-02 · `Remember me` extends refresh lifetime
- **Severity**: P1
- **Prerequisites**: `master_admin`.
- **Steps**:
  1. `/login` with `rememberMe=true`.
  2. Inspect cookie / token claim `exp` and refresh window.
- **Expected**: refresh token lifetime ≥ 30 days (configurable);
  without rememberMe ≤ 1 day.

#### AUTH-H-03 · `?locale=fr` flips form to French
- **Severity**: P1
- **Steps**:
  1. Navigate to `/login?locale=fr`.
- **Expected**: submit button label is `Se connecter`; labels in French.
  After successful sign-in, profile locale persists.

#### AUTH-H-04 · sign in by email (if BE supports)
- **Severity**: P2
- **Skip when**: email-as-username feature flag off.
- **Steps**: use email instead of username.
- **Expected**: BE accepts; same JWT.

#### AUTH-H-05 · username matches case-insensitively
- **Severity**: P1
- **Steps**: type `Master_Admin` (stored as `master_admin`).
- **Expected**: succeeds.

#### AUTH-H-06 · Enter key submits
- **Severity**: P1
- **Steps**: focus password field, press Enter.
- **Expected**: submits.

#### AUTH-H-07 · returnUrl deep-link preserved
- **Severity**: P0
- **Steps**:
  1. Logged out, visit `/app/datasets`.
  2. Bounce to `/login?returnUrl=/app/datasets`.
  3. Submit valid creds.
- **Expected**: lands on `/app/datasets`, not `/app/home`.

#### AUTH-H-08 · re-login retains last-used locale
- **Severity**: P2
- **Steps**: previous session had `fr`. Log out. Log back in.
- **Expected**: UI in French immediately on login.

#### AUTH-H-09 · login with leading/trailing whitespace in username
- **Severity**: P1
- **Steps**: type `  master_admin  ` with spaces.
- **Expected**: server trims, login succeeds, audit logs the trimmed
  value.

### 4.2 Login — negative

#### AUTH-N-01 · missing organisation
- **Severity**: P0
- **Steps**: leave org blank, fill rest, submit.
- **Expected**: form shows
  `validation.auth.organisation.required`; URL stays `/login`; no
  XHR to `/auth/login`.

#### AUTH-N-02 · missing username
- **Severity**: P0
- **Expected**: localised `username.required`.

#### AUTH-N-03 · missing password
- **Severity**: P0
- **Expected**: localised `password.required`.

#### AUTH-N-04 · wrong password 5× → lockout
- **Severity**: P0
- **Steps**: log in with wrong password 5 consecutive times.
- **Expected**:
  - 1-4 attempts: generic `Invalid credentials`.
  - 5th: BE locks (`accountLockedUntil = NOW + 30 min`).
  - Audit row per attempt with reason.
  - Subsequent correct password rejected until unlock or timer expiry.

#### AUTH-N-05 · wrong creds → generic message (no enum leak)
- **Severity**: P0
- **Steps**: wrong password.
- **Expected**: response message identical to "unknown user"
  response (`Invalid credentials`). Page body does NOT contain text
  matching `no such user|user not found|organisation.*not.*found|disabled`.

#### AUTH-N-06 · unknown organisation → generic message
- **Severity**: P0
- **Steps**: org = `NoSuchOrg__`.
- **Expected**: same generic message as AUTH-N-05.

#### AUTH-N-07 · disabled user (status=0)
- **Severity**: P0
- **Steps**: log in as `disabled_eve`.
- **Expected**: same generic message; audit row records the precise
  reason (`status=0`).

#### AUTH-N-08 · password > 128 chars
- **Severity**: P1
- **Steps**: paste 129-char password.
- **Expected**: server returns `password.tooLong`.

#### AUTH-N-09 · SQL injection in username sanitised
- **Severity**: P0 🟣
- **Steps**: type `' OR '1'='1` as username.
- **Expected**: stays on `/login`; no DB enumeration; audit reason
  recorded as failed credential.

#### AUTH-N-10 · XSS payload not executed
- **Severity**: P0 🟣
- **Steps**: org = `<script>alert(1)</script>`; submit.
- **Expected**: no `alert` dialog fires; payload rendered as text in
  the error toast (escaped) or simply rejected.

#### AUTH-N-11 · whitespace-only username
- **Severity**: P1
- **Expected**: trimmed → empty → rejected `username.required`.

#### AUTH-N-12 · whitespace-only password
- **Severity**: P1
- **Expected**: rejected `password.required` (after trim).

#### AUTH-N-13 · `rememberMe` non-boolean
- **Severity**: P2
- **Steps**: send `rememberMe: "yes"`.
- **Expected**: coerced or rejected as Zod type error; no crash.

#### AUTH-N-14 · locked user signing in
- **Severity**: P0
- **Steps**: as `locked_lucy`.
- **Expected**: rejected with same generic message; audit reason
  `locked`.

#### AUTH-N-15 · login during BE maintenance (503)
- **Severity**: P1
- **Steps**: mock `/auth/login` to return 503.
- **Expected**: toast `Service unavailable`; form re-enabled; no infinite
  spinner.

#### AUTH-N-16 · login when BE 500s
- **Severity**: P1
- **Steps**: mock `/auth/login` 500.
- **Expected**: toast `Something went wrong`; submit button re-enabled.

#### AUTH-N-17 · login offline
- **Severity**: P1
- **Steps**: disable network, submit.
- **Expected**: friendly `No connection` toast; no infinite spinner;
  retry-on-reconnect optional.

#### AUTH-N-18 · token tamper detected post-login
- **Severity**: P0 🟣
- **Steps**: After login, manually mutate localStorage token; reload.
- **Expected**: next XHR receives 440; FE bounces to `/login`; no
  protected page paints.

### 4.3 Login — edge

#### AUTH-E-01 · double-submit while in flight
- **Severity**: P0
- **Steps**: click Sign in twice rapidly.
- **Expected**: button disables after first click; only ONE
  `/auth/login` request fires.

#### AUTH-E-02 · Unicode username
- **Severity**: P1
- **Steps**: log in as `Ñoño` (stored with that exact glyph).
- **Expected**: succeeds (NFKC-normalised matches).

#### AUTH-E-03 · authed user visiting `/login`
- **Severity**: P0
- **Steps**: signed in, navigate to `/login`.
- **Expected**: route guard forwards to `/app/home`.

#### AUTH-E-04 · multi-tab same account
- **Severity**: P1
- **Steps**: open 2 tabs, log in on each.
- **Expected**: both succeed; both sessions remain valid; each
  session has its own refresh-token row.

#### AUTH-E-05 · back button after login does not show cached form
- **Severity**: P1
- **Steps**: log in successfully → press browser back.
- **Expected**: `/login` is NOT shown from bfcache; route guard
  redirects forward to `/app/home`.

#### AUTH-E-06 · paste creds with trailing newline
- **Severity**: P2
- **Expected**: trimmed before send.

#### AUTH-E-07 · login while clock skewed ±2 min
- **Severity**: P2
- **Steps**: machine clock skewed; submit.
- **Expected**: BE tolerates ±2 min skew on JWT `iat`/`exp`.

#### AUTH-E-08 · BE returns 500 → friendly error, form re-enabled
- **Severity**: P0
- See AUTH-N-16.

### 4.4 Forgot password / OTP — happy

#### AUTH-H-10 · OTP request
- **Severity**: P0
- **Steps**:
  1. From `/login` click **Forgot password**.
  2. Fill org / username / email.
  3. Submit.
- **Expected**:
  - Toast `OTP sent to your email`.
  - SMTP receives an email to the user's stored email within 60s.
  - Audit row `module=AUTH, action=GENERATE_OTP`.

#### AUTH-H-11 · redeem OTP with strong new password
- **Severity**: P0
- **Steps**:
  1. Receive OTP `123ABC`.
  2. Navigate to `/reset-password?id=<userId>&orgId=<orgId>`.
  3. Enter OTP, new strong password.
  4. Submit.
- **Expected**: success toast → redirect to `/login`.
  Sign-in with new password works; old password no longer works.

#### AUTH-H-12 · OTP delivered to exact stored email
- **Severity**: P0
- **Steps**: stored email `eve@x.com`; request OTP.
- **Expected**: SMTP `to` matches exactly; no fuzzy alias.

### 4.5 OTP — negative

#### AUTH-N-20 · org/username/email mismatch → generic
- **Severity**: P0 🟣
- **Steps**: submit a tuple that doesn't match any user.
- **Expected**: `OTP requested if account exists.` — no enumeration.

#### AUTH-N-21 · OTP < 6 chars
- **Severity**: P1
- **Expected**: `validation.auth.otp.invalid` before submit.

#### AUTH-N-22 · OTP > 6 chars
- **Severity**: P1
- **Expected**: form input capped at 6.

#### AUTH-N-23 · OTP with special chars
- **Severity**: P1
- **Steps**: `12@#AB` typed.
- **Expected**: rejected as invalid pattern.

#### AUTH-N-24 · OTP expired
- **Severity**: P0
- **Steps**: wait 15+ min, redeem.
- **Expected**: server `OTP expired`.

#### AUTH-N-25 · wrong OTP 3× → invalidated
- **Severity**: P0
- **Steps**: wrong OTP three times.
- **Expected**: BE marks the OTP as consumed; further attempts
  reject; user must re-request.

#### AUTH-N-26 · reuse a consumed OTP
- **Severity**: P0
- **Expected**: `OTP expired`.

#### AUTH-N-27 · OTP request rate-limit
- **Severity**: P1
- **Steps**: request OTP 5× in 60s.
- **Expected**: 429 after the 3rd or 4th depending on policy.

### 4.6 OTP — edge

#### AUTH-E-10 · request OTP, then log in with old password before redeeming
- **Severity**: P1
- **Expected**: old password still works AND OTP also works; using
  OTP resets password, invalidating the old.

#### AUTH-E-11 · lowercase OTP coerced uppercase
- **Severity**: P2
- **Expected**: server matches.

#### AUTH-E-12 · locale switch mid-flow
- **Severity**: P2
- **Steps**: redeem OTP with `?locale=fr` deep link.
- **Expected**: OTP still valid; UI in French.

### 4.7 Set-password (welcome link)

#### AUTH-H-20 · welcome-link landing renders set-password form
- **Severity**: P0
- **Steps**:
  1. Admin creates new user → welcome email contains
     `/set-password?token=<64hex>&id=<uuid>&orgId=<uuid>`.
  2. Click link.
- **Expected**: pre-flight `verifySetupToken` succeeds; form renders;
  organisation + username pre-populated read-only.

#### AUTH-H-21 · submit valid new password
- **Severity**: P0
- **Expected**: toast → redirect `/login`; new password works.

#### AUTH-N-30 · malformed token (not 64-char hex)
- **Severity**: P0
- **Steps**: token length 63 or includes `xyz`.
- **Expected**: pre-flight rejects with `setupToken.invalid` BEFORE
  form renders.

#### AUTH-N-31 · token already consumed
- **Severity**: P0
- **Steps**: open the same email link twice; second click.
- **Expected**: `Link expired` landing page; option to request resend.

#### AUTH-N-32 · password rule violations
- **Severity**: P0
- Sub-cases (each with separate ID-suffix):
  - **AUTH-N-32a** missing digit → `password.digit`
  - **AUTH-N-32b** missing uppercase → `password.uppercase`
  - **AUTH-N-32c** missing lowercase → `password.lowercase`
  - **AUTH-N-32d** missing special → `password.special`
  - **AUTH-N-32e** has space → `password.noSpaces`
  - **AUTH-N-32f** < 8 chars → `password.tooShort`
  - **AUTH-N-32g** > 128 chars → `password.tooLong`

#### AUTH-N-33 · password equals username
- **Severity**: P0
- **Expected**: history rule rejects.

#### AUTH-N-34 · token / orgId mismatch
- **Severity**: P0 🟣
- **Steps**: token from org A, orgId from org B.
- **Expected**: 401, no form renders.

#### AUTH-N-35 · truncated link (missing `&id=`)
- **Severity**: P1
- **Expected**: `Invalid link` page; CTA `Request new link`.

#### AUTH-E-20 · double-click email link
- **Severity**: P1
- **Steps**: open the same link twice rapidly in two tabs.
- **Expected**: one succeeds; the other sees `expired`.

#### AUTH-E-21 · token URL-encoded vs raw
- **Severity**: P2
- **Expected**: both decode identically server-side.

### 4.8 Refresh token

#### AUTH-H-30 · JWT expires → silent refresh
- **Severity**: P0
- **Steps**: shorten access TTL via test hook; let it expire while
  logged in; trigger an XHR (e.g. open Datasets).
- **Expected**: response 440 → interceptor calls
  `/auth/refreshToken` → retries original request with new token;
  user unaware.

#### AUTH-N-40 · refresh token revoked → bounce
- **Severity**: P0
- **Steps**: invalidate user's refresh token in DB; trigger XHR.
- **Expected**: refresh response 440 → FE clears storage / theme /
  permission cache → redirect `/login`; no orphan XHRs.

#### AUTH-N-41 · refresh response missing organisation
- **Severity**: P1
- **Steps**: mock refresh response without `organisation`.
- **Expected**: FE falls back to last-known org; no crash.

#### AUTH-N-42 · refresh body tampered
- **Severity**: P0 🟣
- **Steps**: mutate signed token bytes.
- **Expected**: BE rejects signature → 401.

#### AUTH-E-30 · concurrent refresh single-flight
- **Severity**: P0
- **Steps**: kick off 5 protected XHRs simultaneously after access
  token expires.
- **Expected**: exactly ONE `/auth/refreshToken` POST; all 5 queued
  callers resume with the new token.

#### AUTH-E-31 · tab close mid-refresh
- **Severity**: P1
- **Expected**: next reopen uses freshly-rotated token; no forced
  re-login.

#### AUTH-E-32 · multi-tab refresh race
- **Severity**: P1
- **Steps**: trigger refresh in two tabs within 100ms.
- **Expected**: both end up with valid tokens; neither invalidates
  the other.

#### AUTH-E-33 · refresh token reuse-detection
- **Severity**: P0 🟣
- **Steps**: capture a refresh token; use it twice (replay).
- **Expected**: second use → BE kills ALL sessions for the user;
  next XHR everywhere → 440.

### 4.9 Logout

#### AUTH-H-40 · sign out clears session
- **Severity**: P0
- **Steps**:
  1. Avatar → Sign out.
- **Expected**: redirect `/login`; `localStorage` no longer contains
  auth tokens; theme reset to default; sidebar permission cache
  flushed.

#### AUTH-H-41 · sign out from one tab leaves other tabs running
- **Severity**: P1
- **Steps**: 2 tabs logged in; log out from tab A.
- **Expected**: tab A → `/login`. Tab B's next protected XHR gets
  440 → redirect.

#### AUTH-N-50 · logout 5xx → defensive cleanup
- **Severity**: P0
- **Steps**: mock `/auth/logout` 500.
- **Expected**: FE still clears state and redirects.

#### AUTH-N-51 · double-click Sign out → single call
- **Severity**: P1
- **Expected**: only one `/auth/logout` request fires.

#### AUTH-E-40 · long query in-flight when logout
- **Severity**: P1
- **Expected**: query aborted via AbortController; no orphan callback
  mutates a destroyed page.

#### AUTH-E-41 · back-button after logout
- **Severity**: P0
- **Expected**: `/login` paints fresh, not the cached protected page.

### 4.10 Route guard

#### AUTH-G-01 · unauthenticated user bounced
- **Severity**: P0
- **Steps**: clear cookies + storage, visit `/app/datasets`.
- **Expected**: 302/redirect to `/login?returnUrl=/app/datasets`.

#### AUTH-G-02 · returnUrl preserved through login
- **Severity**: P0
- See AUTH-H-07.

#### AUTH-G-03 · authed user → `/login` forwarded
- **Severity**: P1
- See AUTH-E-03.

#### AUTH-G-04 · tampered JWT bounces every nested route
- **Severity**: P0 🟣
- **Steps**: mutate token, visit a deep route.
- **Expected**: route guard bounces immediately; no flicker of
  protected content.

### 4.11 Security

#### AUTH-S-01 · login endpoint is rate-limited per IP
- **Severity**: P0 🟣
- **Steps**: hammer `/auth/login` with 20 requests in 10s from same IP.
- **Expected**: 429 after ~10; `Retry-After` header set.

#### AUTH-S-02 · login endpoint rate-limited per username (slow burn)
- **Severity**: P0
- **Steps**: 50 attempts spread across IPs targeting one user.
- **Expected**: that user's account locks; broader policy may also
  throttle.

#### AUTH-S-03 · captcha required after N failures
- **Severity**: P1
- **Steps**: 3 failed attempts; submit a 4th.
- **Expected**: captcha challenge mounts.

#### AUTH-S-04 · password not echoed in any audit log
- **Severity**: P0 🟣
- **Steps**: submit wrong password, inspect audit row.
- **Expected**: `audit_log.metadata` does not contain the plaintext
  password.

#### AUTH-S-05 · CSRF: cookie-only auth fails without origin allowlist
- **Severity**: P0 🟣
- **Steps**: POST `/auth/login` from a third-party origin (CORS).
- **Expected**: BE rejects pre-flight OR CORS denies; no token issued.

#### AUTH-S-06 · timing-safe password compare
- **Severity**: P1 🟣
- **Steps**: measure response time for valid vs invalid username with
  matching password length.
- **Expected**: distribution overlap > 90% — no timing oracle.

#### AUTH-S-07 · JWT signed with rotated key still accepted in grace window
- **Severity**: P1
- **Steps**: rotate signing key; token from previous key sent.
- **Expected**: accepted until previous key's `retired_at`; rejected
  after.

#### AUTH-S-08 · BE never returns plaintext refresh in JSON `data`
- **Severity**: P0 🟣
- **Steps**: inspect `/auth/login` response.
- **Expected**: refresh token returned only via secure HttpOnly cookie
  (or single one-time field) — never readable from JS once stored.

#### AUTH-S-09 · open redirect via `returnUrl`
- **Severity**: P0 🟣
- **Steps**: `/login?returnUrl=https://evil.example.com`.
- **Expected**: post-login redirect SKIPS external host; lands on
  `/app/home` instead.

#### AUTH-S-10 · log out invalidates the refresh token server-side
- **Severity**: P0
- **Steps**: log in → log out → manually call `/auth/refreshToken`
  with the captured RT.
- **Expected**: 401.

### 4.12 Performance

#### AUTH-P-01 · login p95 < 1.5s
- **Severity**: P1
- **Steps**: 100 sequential logins; record durations.
- **Expected**: p95 < 1.5s on local infra.

#### AUTH-P-02 · login concurrency 50/s sustained
- **Severity**: P1
- **Steps**: 1 minute at 50 logins/sec.
- **Expected**: success rate ≥ 99%; no DB pool exhaustion.

### 4.13 Accessibility

#### AUTH-A-01 · login form labels announced
- **Severity**: P0 ♿
- **Steps**: turn on screen reader, tab through form.
- **Expected**: each input announces label + required state.

#### AUTH-A-02 · error toast announced as `role="status"`
- **Severity**: P1
- **Expected**: toast container has `role="status"` and `aria-live="polite"`.

#### AUTH-A-03 · focus moves to first error on submit
- **Severity**: P1
- **Steps**: submit with errors; expect focus on the first invalid field.

#### AUTH-A-04 · contrast ≥ 4.5:1 in both themes
- **Severity**: P0 ♿
- **Tooling**: axe-core sweep on `/login` light + dark.

### 4.14 Internationalisation

#### AUTH-I-01 · French locale
- **Severity**: P1 🌐
- **Steps**: `?locale=fr`; submit invalid creds.
- **Expected**: error message in French; no raw English literal.

#### AUTH-I-02 · RTL locale (Arabic) flips layout
- **Severity**: P1 🌐
- **Skip when**: RTL not yet shipped.

#### AUTH-I-03 · all 10 locales render the form
- **Severity**: P2
- **Steps**: visit `/login?locale={lang}` for each supported locale.
- **Expected**: no raw English; no layout overflow.

---

## 5. Regression buckets

When changing… run these IDs:

| Change | Bucket |
|---|---|
| Login controller / validator | AUTH-H-01..09, AUTH-N-01..18, AUTH-E-01..08 |
| Password policy | AUTH-N-32 sub-cases, AUTH-H-21, AUTH-N-33 |
| Refresh / interceptor | AUTH-H-30, AUTH-N-40..42, AUTH-E-30..33 |
| Welcome / setup link | AUTH-H-20..21, AUTH-N-30..35, AUTH-E-20..21 |
| Locale / i18n | AUTH-H-03, AUTH-H-08, AUTH-I-01..03 |
| Security hardening | AUTH-N-09..10, AUTH-N-14..18, AUTH-S-01..10 |
| Performance hot path | AUTH-P-01..02 |

---

## 6. Open questions

1. Is "email-as-username" a per-org flag or global? Affects AUTH-H-04.
2. Should AUTH-S-09 also block `//evil.example.com`-style schema-less
   redirects? Recommend strict same-origin allowlist.
3. Locked-account auto-unlock window — config (default 30 min)
   needs to be confirmed against compliance baseline.
