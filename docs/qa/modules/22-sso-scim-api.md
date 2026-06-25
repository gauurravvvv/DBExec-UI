# 22 · SSO / SCIM / API Tokens — Deep Test Cases

## SAML 2.0

- **SAML-H-01** · SP metadata XML downloads with right entityID. P0
- **SAML-H-02** · IdP-initiated login lands authenticated. P0
- **SAML-H-03** · SP-initiated login round-trips through IdP. P0
- **SAML-H-04** · JIT provisioning creates user on first login. P0
- **SAML-H-05** · Group claim maps to DBExec groups. P1
- **SAML-N-01** · Invalid signature → reject. P0 🟣
- **SAML-N-02** · Replay (used assertion) → reject. P0 🟣
- **SAML-N-03** · Clock skew > tolerance → reject. P1
- **SAML-N-04** · Audience restriction mismatch → reject. P0 🟣
- **SAML-E-01** · SLO (Single Logout) signs user out of all SPs. P1

## OIDC

- **OIDC-H-01** · Google OIDC roundtrip succeeds. P0
- **OIDC-H-02** · Auth0 / Okta / Microsoft providers tested. P1
- **OIDC-N-01** · Wrong state token → reject. P0 🟣
- **OIDC-N-02** · Wrong nonce → reject. P0 🟣
- **OIDC-E-01** · Refresh-token from IdP renews access. P1

## SCIM 2.0

- **SCIM-H-01** · Provision user via Okta SCIM → row appears. P0
- **SCIM-H-02** · Update user attributes → row updates. P0
- **SCIM-H-03** · Deprovision (delete) → user disabled (soft-delete). P0
- **SCIM-H-04** · Add to group via PATCH. P1
- **SCIM-N-01** · Token missing → 401. P0
- **SCIM-N-02** · Token from another org → 401. P0 🟣

## API tokens

- **API-H-01** · Create token; can call /datasources/list. P0
- **API-N-01** · Token without scope → 403. P0
- **API-N-02** · Expired token → 401. P0
- **API-N-03** · Revoked token → 401. P0
- **API-E-01** · Token IP allowlist enforced. P1
- **API-RL-H-01** · 101st call in 1min → 429 with Retry-After. P1
- **API-IDEMP-H-01** · Same idempotency key → same response. P1

## Service accounts

- **SVC-H-01** · Create service account; mint API token for it. P0
- **SVC-N-01** · Service account cannot UI-login. P0

## OAuth2 third-party apps

- **OAUTH-H-01** · Third-party app authorisation flow yields scoped token. P1
- **OAUTH-N-01** · App requesting scope user denies → consent revokes. P1

## JWKS

- **JWKS-H-01** · /.well-known/jwks.json serves current keys. P0
- **JWKS-E-01** · Key rotation → both old + new accepted during grace. P1

## Refresh-token rotation

- **AUTH-RT-REUSE-N-01** · Reused refresh token kills all sessions. P0 🟣

## Regression buckets
- Identity flows → SAML-* and OIDC-*
- API surface auth → API-*
- SCIM lifecycle → SCIM-*
