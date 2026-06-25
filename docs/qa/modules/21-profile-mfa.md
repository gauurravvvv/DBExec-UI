# 21 · Profile + Sessions + MFA — Deep Test Cases

## Profile

### Happy
- **PRF-H-01** · Profile shows current identity (name, email, role, org, groups). P0
- **PRF-H-02** · Change first name → header avatar updates without reload. P1
- **PRF-H-03** · Change locale → UI reflows; persists in JWT post-relogin. P0
- **PRF-H-04** · Change password (current → new strong) → forced sign-out → re-login. P0
- **PRF-H-05** · Upload avatar (jpg/png ≤ 1MB) → displayed. P1

### Negative
- **PRF-N-01** · Wrong current password → reject (no enumeration). P0
- **PRF-N-02** · New password missing digit → password.digit. P0
- **PRF-N-03** · Missing uppercase. P0
- **PRF-N-04** · Missing lowercase. P0
- **PRF-N-05** · Missing special. P0
- **PRF-N-06** · Has space. P0
- **PRF-N-07** · < 8 chars → tooShort. P0
- **PRF-N-08** · > 128 chars → tooLong. P0
- **PRF-N-09** · New = current → "must differ". P0
- **PRF-N-10** · New in history window → reject. P0
- **PRF-N-11** · Confirm password mismatch → reject. P0
- **PRF-N-12** · Locale not supported → reject. P1
- **PRF-N-13** · Avatar > size cap → reject. P1
- **PRF-N-14** · Avatar non-image MIME → reject. P1
- **PRF-N-15** · Email change attempt (read-only field) → no-op. P1

### Edge
- **PRF-E-01** · Locale switch mid-form → labels translate without losing typed values. P1
- **PRF-E-02** · Password change while another tab open → other tab gets 440. P0
- **PRF-E-03** · Avatar SVG with embedded script → sanitised or rejected. P0 🟣
- **PRF-E-04** · User in 100 groups → list scrolls. P2

## Sessions

- **PRF-SESS-H-01** · List my sessions (devices). P0
- **PRF-SESS-H-02** · Revoke a session → that device's next XHR → 440. P0
- **PRF-SESS-H-03** · Revoke all → all devices except current. P0
- **PRF-SESS-N-01** · Cannot revoke another user's session. P0 🟣

## MFA — TOTP

- **MFA-H-01** · Enrol TOTP → QR + secret returned; confirm with code → enabled. P0
- **MFA-H-02** · Next login asks for code. P0
- **MFA-H-03** · Recovery codes generated; usable once. P0
- **MFA-H-04** · Disable MFA requires recent step-up. P0
- **MFA-N-01** · Wrong code 5× → lockout. P0
- **MFA-N-02** · Code outside ±1 window → reject. P1
- **MFA-E-01** · Recovery code consumed → cannot reuse. P0
- **MFA-E-02** · Multiple devices (multi-secret) — out of scope V1. P2

## MFA — WebAuthn (passkey)

- **MFA-WAUTH-H-01** · Register passkey → next login uses biometric. P1
- **MFA-WAUTH-N-01** · Cross-domain credential → reject. P0 🟣

## Step-up

- **MFA-STEP-H-01** · Sensitive action requires fresh MFA challenge. P0
- **MFA-STEP-N-01** · Step-up token expired → re-challenge. P0

## Security

- **PRF-S-01** · Password not exposed in any GET response. P0 🟣
- **PRF-S-02** · TOTP secret encrypted at rest. P0 🟣
- **PRF-S-03** · Avatar upload virus-scanned. P0 🟣

## Regression buckets
- Password policy → PRF-N-02..10
- Session lifecycle → PRF-SESS-*
- MFA enrolment + auth flow → MFA-*
