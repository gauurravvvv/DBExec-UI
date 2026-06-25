# 14 · Sharing & Embedding — Deep Test Cases

## Fixtures
- Org with custom embed signing secret.
- Allowed-domain `customer.example.com`.

## Internal share
- **SH-INT-H-01** · Share dashboard with group → members can view. P0
- **SH-INT-H-02** · Permission View vs Edit honoured. P0
- **SH-INT-H-03** · Unshare → access revoked immediately. P0
- **SH-INT-N-01** · Share with non-org user → 404. P0

## Public link
- **SH-LINK-H-01** · Public link without password loads. P0
- **SH-LINK-H-02** · Password-protected link prompts. P0
- **SH-LINK-H-03** · Expired link → 410 Gone. P0
- **SH-LINK-H-04** · Revoke link → 410. P0
- **SH-LINK-H-05** · View count increments. P1
- **SH-LINK-N-01** · Wrong password 5× → rate-limit captcha. P1
- **SH-LINK-S-01** · Cookie-free embed mode → no Set-Cookie. P1 🟣

## Signed embed (JWT)
- **SH-EMB-H-01** · JWT loads chrome-less view. P0
- **SH-EMB-H-02** · `applyFilter` from host via postMessage updates view. P0
- **SH-EMB-H-03** · `onFilterChange` callback fires on filter change inside iframe. P1
- **SH-EMB-H-04** · Theme injection via token attrs.theme. P1
- **SH-EMB-H-05** · Visible visuals subset enforced. P1
- **SH-EMB-N-01** · Expired JWT → 401. P0 🟣
- **SH-EMB-N-02** · Tampered JWT signature → 401. P0 🟣
- **SH-EMB-N-03** · JWT with wrong target id (mismatch with URL) → 403. P0 🟣
- **SH-EMB-CSP-N-01** · Different host than allowlist → blocked. P0 🟣
- **SH-EMB-RLS-H-01** · token.attrs.region=APAC → RLS injects WHERE. P0
- **SH-EMB-EVT-H-01** · onError fires on render failure. P1

## Captcha / anti-scraping
- **SH-CAP-H-01** · > 50 views/hour triggers captcha. P1
- **SH-CAP-N-01** · Captcha disabled when token signed from server. P2

## View analytics
- **SH-VIEW-H-01** · share_link_view_event row per view. P1

## Security
- **SH-S-01** · Open redirect via share URL not exploitable. P0 🟣
- **SH-S-02** · Embed iframe respects X-Frame-Options / CSP. P0 🟣
- **SH-S-03** · Public link cannot be promoted to write. P0 🟣

## Regression buckets
- JWT signing / verification → SH-EMB-N-01..03, SH-EMB-RLS-H-01
- Share-link revocation → SH-LINK-H-03, SH-LINK-H-04
