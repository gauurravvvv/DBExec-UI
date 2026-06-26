# Auth, SSO, MFA, SCIM, API tokens

> Implementation companion to research module 10. The single
> doc covering: SAML / OIDC SSO, TOTP & WebAuthn MFA, SCIM 2.0
> provisioning, and API tokens / service accounts.

**Status:** 🟡 partial — username/password + JWT exists. SSO,
MFA, SCIM, API tokens are all 🔴.
**Effort:** L (~5 weeks split as: SSO 2w, MFA 1w, SCIM 1w, API
tokens 1w).

---

## 0. Problem statement

Every enterprise procurement starts with the security checklist:

- SSO via the customer's IdP (Okta, Azure AD, Google
  Workspace, Auth0, Ping).
- MFA enforcement, ideally device-bound (FIDO2/WebAuthn).
- SCIM 2.0 so the IdP provisions users + groups automatically.
- API tokens with per-token scope + revocation.

Without these, we can't sell into anyone larger than 50 people.
This doc says exactly what to ship.

---

## 1. SSO — SAML 2.0 & OIDC

### 1.1 Data model

```sql
CREATE TABLE org_sso_config (
  org_id        UUID PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  protocol      TEXT NOT NULL                      -- 'saml' | 'oidc'
                  CHECK (protocol IN ('saml', 'oidc')),
  is_enabled    BOOLEAN NOT NULL DEFAULT false,
  is_forced     BOOLEAN NOT NULL DEFAULT false,    -- if true, password login is disabled
  -- SAML
  saml_entity_id            TEXT,
  saml_sso_url              TEXT,
  saml_slo_url              TEXT,
  saml_x509_cert            TEXT,
  saml_want_assertions_signed BOOLEAN DEFAULT true,
  saml_want_response_signed   BOOLEAN DEFAULT true,
  saml_name_id_format       TEXT,
  -- OIDC
  oidc_issuer               TEXT,
  oidc_client_id            TEXT,
  oidc_client_secret_enc    BYTEA,                  -- KMS-wrapped
  oidc_scopes               TEXT[] DEFAULT ARRAY['openid','email','profile'],
  oidc_userinfo_endpoint    TEXT,
  -- claims mapping
  claim_email     TEXT NOT NULL DEFAULT 'email',
  claim_first     TEXT DEFAULT 'given_name',
  claim_last      TEXT DEFAULT 'family_name',
  claim_groups    TEXT DEFAULT 'groups',
  claim_attributes JSONB,                            -- attr-key → claim path
  -- JIT provisioning
  jit_create_user BOOLEAN NOT NULL DEFAULT true,
  jit_default_role TEXT,
  jit_default_groups TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.2 Flow (SP-initiated SAML)

```
1. User hits /login → enters email
2. We look up org_sso_config; if enabled, redirect to /saml/login/:orgId
3. We build a SAMLRequest (signed) and POST to saml_sso_url
4. User authenticates at IdP
5. IdP POSTs SAMLResponse to /saml/acs
6. We verify signature + Assertion conditions + audience
7. Look up user by email claim; JIT-create if jit_create_user
8. Apply jit_default_role + jit_default_groups
9. Sync claim_attributes into user_attribute (module 09)
10. Issue our JWT + refresh token; redirect to /app
```

### 1.3 Flow (OIDC Authorization Code with PKCE)

```
1. User hits /login → enters email
2. Look up org_sso_config; if enabled, redirect to /oidc/login/:orgId
3. We generate code_verifier + code_challenge (PKCE)
4. Redirect to oidc_issuer/authorize with response_type=code,
   client_id, redirect_uri=/oidc/callback, scope, state, code_challenge
5. IdP redirects back to /oidc/callback with code
6. We exchange code + code_verifier for tokens at /token
7. Verify id_token signature (JWKS) + iss + aud + exp
8. Same JIT + attribute sync as SAML
9. Issue our JWT
```

### 1.4 Libraries

- SAML: `samlify` (TypeScript, no native deps).
- OIDC: `openid-client` (RFC-compliant, robust JWKS handling).

Both are pinned and have a dedicated security review cadence.

### 1.5 Controller stub — SAML ACS

```typescript
// src/controllers/auth/sso/samlAcs.ts
import { Request, Response } from 'express';
import sendResponse from '../../../utility/response';
import { CODE } from '../../../config';
import { SSO_MSG, GENERIC } from '../../../constants/response.messages';
import { auditLogger } from '../../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../../constants/audit.constants';
import { verifySamlResponse } from '../../../services/sso/saml';
import { upsertUserFromClaims } from '../../../services/sso/jit';
import { issueAuthTokens } from '../../../services/auth/issueTokens';
import Logger from '../../../utility/logger';

const samlAcs = async (req: Request, res: Response) => {
  const samlResponse = req.body.SAMLResponse;
  const relayState = req.body.RelayState as string | undefined;
  const orgId = (relayState && JSON.parse(Buffer.from(relayState, 'base64').toString()).orgId) as string;

  try {
    const cfg = await loadSsoConfig(orgId);
    if (!cfg?.isEnabled || cfg.protocol !== 'saml') {
      return sendResponse(res, false, CODE.BAD_REQUEST, SSO_MSG.NOT_CONFIGURED);
    }

    const assertion = await verifySamlResponse(samlResponse, cfg);
    const claims = assertion.attributes;

    const user = await upsertUserFromClaims(orgId, claims, cfg);

    await auditLogger.logAuditToOrg({
      connection: await orgConnection(orgId), req, res,
      module: AUDIT_MODULES.AUTH,
      action: AUDIT_ACTIONS.SSO_LOGIN,
      entityName: 'User', entityId: user.id,
      metadata: { protocol: 'saml', nameId: assertion.nameId },
    });

    const { token, refreshToken } = await issueAuthTokens(user);

    // POST-redirect to the FE handshake page
    res.redirect(`/auth/handshake?token=${encodeURIComponent(token)}&refresh=${encodeURIComponent(refreshToken)}`);
  } catch (err: any) {
    Logger.error(`SAML ACS failed: ${err.message}`);
    return sendResponse(res, false, CODE.UNAUTHORIZED, SSO_MSG.AUTH_FAILED);
  }
};

export default samlAcs;
```

---

## 2. MFA — TOTP & WebAuthn

### 2.1 Data model

```sql
CREATE TABLE user_mfa_factor (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('totp', 'webauthn', 'recovery')),
  name        TEXT NOT NULL,
  -- TOTP
  totp_secret_enc BYTEA,
  -- WebAuthn
  webauthn_credential_id BYTEA,
  webauthn_public_key    BYTEA,
  webauthn_sign_count    INTEGER,
  webauthn_aaguid        TEXT,
  -- Recovery codes (one row per *batch*; codes hashed)
  recovery_codes_hash    TEXT[],
  recovery_codes_used    BOOLEAN[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_mfa_user ON user_mfa_factor(user_id);

CREATE TABLE org_mfa_policy (
  org_id      UUID PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL DEFAULT 'optional'  -- 'disabled' | 'optional' | 'required' | 'required_for_admin'
                CHECK (mode IN ('disabled', 'optional', 'required', 'required_for_admin')),
  webauthn_allowed BOOLEAN NOT NULL DEFAULT true,
  totp_allowed     BOOLEAN NOT NULL DEFAULT true,
  remember_device_days INTEGER NOT NULL DEFAULT 30
);
```

### 2.2 TOTP flow

- Enrol: server generates a 160-bit secret, returns
  `otpauth://` URL + QR code; user scans into Authenticator
  app, types back a 6-digit code; server verifies + stores
  encrypted secret.
- Verify: 30-second window, T-1 and T+1 accepted to handle
  clock skew; one-time use enforced via Redis nonce.

### 2.3 WebAuthn flow

- Registration: server generates `PublicKeyCredentialCreationOptions`
  with `attestation: 'none'`, `authenticatorSelection: {
  authenticatorAttachment: 'platform', userVerification: 'required'
  }`. Stores credential id + public key.
- Authentication: server generates challenge; client signs;
  server verifies signature + `signCount` monotonically
  increases (clone detection).

Library: `@simplewebauthn/server`.

### 2.4 Controller stub (TOTP verify)

```typescript
// src/controllers/auth/mfa/totpVerify.ts
import { Request, Response } from 'express';
import sendResponse from '../../../utility/response';
import { CODE } from '../../../config';
import { MFA_MSG, GENERIC } from '../../../constants/response.messages';
import { auditLogger } from '../../../services/auditLogger.service';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../../constants/audit.constants';
import { verifyTotp } from '../../../services/mfa/totp';
import { redis } from '../../../services/redis';
import { issueAuthTokens } from '../../../services/auth/issueTokens';
import Logger from '../../../utility/logger';

const totpVerify = async (req: Request, res: Response) => {
  const { mfaSessionId, code, rememberDevice } = req.body;
  const startedAt = Date.now();

  try {
    const session = await redis.get(`mfa:session:${mfaSessionId}`);
    if (!session) {
      return sendResponse(res, false, CODE.UNAUTHORIZED, MFA_MSG.SESSION_EXPIRED);
    }
    const { userId, factorId } = JSON.parse(session);

    // Rate-limit
    const attemptsKey = `mfa:attempts:${userId}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 900);  // 15 min window
    if (attempts > 5) {
      return sendResponse(res, false, CODE.UNAUTHORIZED, MFA_MSG.TOO_MANY_ATTEMPTS);
    }

    const ok = await verifyTotp(factorId, code);
    if (!ok) {
      return sendResponse(res, false, CODE.UNAUTHORIZED, MFA_MSG.INVALID_CODE);
    }

    // Code is one-time-use — store in Redis with 90 s TTL
    await redis.set(`totp:used:${factorId}:${code}`, '1', 'EX', 90, 'NX');

    await redis.del(`mfa:session:${mfaSessionId}`);
    await redis.del(attemptsKey);

    const user = await loadUser(userId);
    const { token, refreshToken } = await issueAuthTokens(user, { mfa: true });

    if (rememberDevice) {
      // Issue a separate long-lived cookie that bypasses MFA prompt next time
      // from this device (signed JWT with device fingerprint)
    }

    await auditLogger.logAuditToOrg({
      connection: await orgConnection(user.orgId), req, res,
      module: AUDIT_MODULES.AUTH,
      action: AUDIT_ACTIONS.MFA_SUCCESS,
      entityName: 'User', entityId: user.id,
      metadata: { kind: 'totp', verifyMs: Date.now() - startedAt },
    });

    sendResponse(res, true, CODE.SUCCESS, MFA_MSG.OK, { token, refreshToken });
  } catch (err: any) {
    Logger.error(`TOTP verify failed: ${err.message}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default totpVerify;
```

---

## 3. SCIM 2.0

### 3.1 Endpoints

```
GET    /scim/v2/Users                ?filter=userName eq "alice@acme.com"
POST   /scim/v2/Users
GET    /scim/v2/Users/:id
PATCH  /scim/v2/Users/:id
PUT    /scim/v2/Users/:id
DELETE /scim/v2/Users/:id
GET    /scim/v2/Groups
POST   /scim/v2/Groups
GET    /scim/v2/Groups/:id
PATCH  /scim/v2/Groups/:id
DELETE /scim/v2/Groups/:id
GET    /scim/v2/ServiceProviderConfig
GET    /scim/v2/Schemas
GET    /scim/v2/ResourceTypes
```

### 3.2 Auth

SCIM endpoints accept a long-lived bearer token (`scim_token`)
stored per-org. The token is rotatable from the admin console.

### 3.3 Filter parser

SCIM filter syntax: `userName eq "alice@acme.com"`,
`active eq true`, `userName sw "a"`, `emails[type eq "work"]`.
Implement a small recursive-descent parser; reject any operator
or attribute path we don't support with a 400.

### 3.4 Schema mapping

```typescript
// SCIM User → DBExec user
{
  userName:    user.email,
  name: {
    givenName:  user.firstName,
    familyName: user.lastName,
  },
  emails:      [{ value: user.email, primary: true }],
  active:      user.status === 'active',
  groups:      user.groups.map(g => ({ value: g.id, display: g.name })),
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
    department: user.department,
    manager:    user.managerId ? { value: user.managerId } : undefined,
  },
}
```

### 3.5 Patch operations

PATCH uses `Operations: [{ op: 'add' | 'remove' | 'replace', path: '<scim-path>', value: ... }]`.
The path uses SCIM's tiny DSL (`emails[type eq "work"].value`).
Use `scim-patch` or roll a small AST evaluator.

---

## 4. API tokens & service accounts

### 4.1 Data model

```sql
CREATE TABLE api_token (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  -- token issued either to a user (acts as them) or a service account
  user_id       UUID REFERENCES "user"(id) ON DELETE CASCADE,
  service_account_id UUID REFERENCES service_account(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- token hash (we store SHA-256 of the raw token; the raw token is only
  -- shown once at creation)
  token_hash    BYTEA NOT NULL,
  token_prefix  TEXT NOT NULL,                        -- first 8 chars for UI lookup
  scopes        TEXT[] NOT NULL,                      -- e.g. ['dashboards:read', 'exports:create']
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  last_used_ip  INET,
  created_by    UUID NOT NULL REFERENCES "user"(id),
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NULL) <> (service_account_id IS NULL))
);

CREATE INDEX idx_api_token_prefix ON api_token(token_prefix);
CREATE INDEX idx_api_token_hash   ON api_token USING hash (token_hash);
CREATE INDEX idx_api_token_org    ON api_token(org_id);

CREATE TABLE service_account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  default_role  TEXT NOT NULL,
  group_ids     UUID[],
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Token issuance

```typescript
import crypto from 'crypto';

export function generateApiToken(): { raw: string; prefix: string; hash: Buffer } {
  // 32 bytes of CSPRNG, base62-encoded, prefixed `dbx_`
  const bytes = crypto.randomBytes(32);
  const raw = `dbx_${bytes.toString('base64url')}`;
  const prefix = raw.slice(0, 8);
  const hash = crypto.createHash('sha256').update(raw).digest();
  return { raw, prefix, hash };
}
```

Show `raw` once at creation; never again.

### 4.3 Middleware

Existing `AuthMiddleware` already handles `Authorization: Bearer <jwt>`.
Add a parallel `ApiTokenMiddleware` that detects `dbx_` prefix
and resolves to a `user_id` or `service_account_id` + scopes.
Scope checks live in a `RequireScope('dashboards:read')`
middleware on each public-API route.

### 4.4 Scope tree

```
*                  → everything
org:admin          → org-level admin
users:read         users:write
groups:read        groups:write
datasources:read   datasources:write
datasets:read      datasets:write
analyses:read      analyses:write
dashboards:read    dashboards:write
exports:create
subscriptions:read subscriptions:write
api:read           api:write           # for the bidirectional API
ai:invoke          # cost-bearing
```

`*` includes everything; `dashboards:*` includes both
`dashboards:read` and `dashboards:write`.

---

## 5. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_sso_login_total` | counter | `protocol`, `org`, `outcome` | SSO success / failure |
| `dbexec_sso_jit_provisioned_total` | counter | `protocol` | new users JIT-created |
| `dbexec_mfa_enrol_total` | counter | `kind` | TOTP / WebAuthn enrolment |
| `dbexec_mfa_verify_total` | counter | `kind`, `outcome` | success / fail / timeout |
| `dbexec_scim_request_total` | counter | `resource`, `method`, `outcome` | SCIM traffic |
| `dbexec_api_token_request_total` | counter | `org`, `outcome` | token-authenticated request volume |
| `dbexec_api_token_expired_total` | counter | `org` | expired-on-use; surface in admin |

Audit log: every SSO success, MFA enrol/verify, SCIM PATCH, API
token create/revoke writes a row with the actor + IP + UA.
These are the most-asked rows during a SOC2 audit.

---

## 6. Security & threat model

| Threat | Mitigation |
|---|---|
| SAMLResponse replay | Verify `InResponseTo`; nonce in Redis with 5-min TTL; reject already-seen IDs |
| XML signature wrapping (XSW) | `samlify` mitigates; we additionally enforce `wantAssertionsSigned + wantResponseSigned`; reject if signature wraps an unintended element |
| OIDC token mix-up (RFC 8417) | Pin `iss`; validate `aud == client_id`; verify nonce |
| JIT-creation attack (attacker IdP creates admin user) | `jit_default_role` is never admin; admin promotion is manual via console |
| TOTP brute-force | 5 attempts / 15 min per user; rate-limit per IP; account lock at 20 attempts in 1h |
| WebAuthn signCount regression | Reject; possible cloned authenticator → revoke factor |
| API token leak (in CI logs) | Token shown once; hash-stored; revocation invalidates within seconds; prefix lookup helps customers identify "which of my tokens is in this log line" |
| Token used after user deactivated | Middleware re-checks user.status on every request (fast org-cached lookup) |
| SCIM token leak | Per-org, rotatable, scoped to SCIM endpoints only — cannot be used to call other APIs |
| Cross-org token use | `org_id` enforced at middleware; cross-org tokens fail with 404 (not 403, to avoid org-existence leak) |
| Session fixation | Issue a fresh JWT on every login; old refresh tokens revoked on password change or MFA factor change |
| Open redirect via SAML RelayState | Allowlist of post-login redirect paths; opaque RelayState mapped to allowlisted entry |

---

## 7. Operational runbook

**Symptom: SSO login fails for all users.**
1. IdP rotated their cert? Check `saml_x509_cert` matches IdP
   metadata; rotate.
2. IdP changed entity ID? Update `saml_entity_id` to match.
3. Time skew on our server > 5 min from IdP? `clockSkewSec`
   default is 60s; large skew rejects all assertions.

**Symptom: MFA prompt loops.**
1. User cleared cookies → "remember device" flag lost. Expected.
2. Clock drift on user phone for TOTP — server accepts T-1/T+1
   only; counsel user to re-sync.

**Symptom: SCIM provisioning out of sync.**
1. IdP's SCIM job rate-limited? Check
   `dbexec_scim_request_total{outcome="rate_limited"}`. Bump
   per-token rate-limit if customer has 10k+ users.
2. SCIM patch on a user with stale state → 409 conflict
   returned, IdP usually retries. Surface a per-user "last
   SCIM sync" timestamp.

**Symptom: API token works locally, 401 in production.**
1. Token expired? `dbexec_api_token_expired_total` counter spikes.
2. Org migrated to a different SSO config that revokes
   non-SSO tokens? Check `org.api_tokens_disabled` flag.

---

## 8. Performance budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| SAML ACS (verify + JIT + token) | 80 ms | 250 ms | 2 s |
| OIDC callback (exchange + verify + JIT + token) | 200 ms | 500 ms | 3 s |
| TOTP verify | 5 ms | 20 ms | 100 ms |
| WebAuthn verify | 15 ms | 50 ms | 200 ms |
| SCIM GET /Users (page of 100) | 80 ms | 300 ms | 2 s |
| SCIM PATCH /Users/:id | 30 ms | 100 ms | 1 s |
| API token middleware (hash lookup) | 2 ms | 8 ms | 50 ms |

API token lookup is per-request — keep it sub-10ms via the
hash index + an LRU cache (5-min TTL) keyed by token hash.

---

## 9. Migration & rollout

1. **Migrations:** create `org_sso_config`, `user_mfa_factor`,
   `org_mfa_policy`, `api_token`, `service_account`.
2. **Backfill:** none.
3. **Feature flags:**
   - `feature.sso_saml` / `feature.sso_oidc`
   - `feature.mfa_totp` / `feature.mfa_webauthn`
   - `feature.scim`
   - `feature.api_tokens`
4. **Rollout order:**
   1. API tokens — unblocks the public API.
   2. MFA (TOTP) — easy win.
   3. SSO (SAML first because enterprises lead with SAML).
   4. SSO (OIDC) — broader IdP coverage.
   5. MFA (WebAuthn) — modern second factor.
   6. SCIM — once SSO is live and stable.
5. **Per-org enablement:** admin console exposes each flag as
   an opt-in toggle.

---

## 10. Open questions

1. **Cross-IdP single login** — when a user has accounts in two
   orgs each with their own IdP, how to choose? Email-domain
   matching is the usual answer.
2. **SAML SLO** (Single Logout) — partially supported; many
   IdPs don't implement it. Defer enforcement.
3. **WebAuthn discoverable credentials** — usernameless flow.
   v2.
4. **OIDC offline_access / refresh tokens** — we currently issue
   our own refresh tokens. Whether to also store IdP refresh
   tokens for downstream API calls is an open ask.
5. **CASB / IP allowlisting** — enterprises increasingly ask
   for it. Add as `org_ip_allowlist` later.

---

## 11. References

- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [22-api-sdk-plugins.md](../research/modules/22-api-sdk-plugins.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- RFC 7644 (SCIM 2.0 Protocol)
- RFC 8252 (OAuth 2.0 for Native Apps)
- W3C WebAuthn Level 3
- SAML 2.0 Technical Overview (OASIS)
- `samlify`, `openid-client`, `@simplewebauthn/server`,
  `scim-patch` library docs
