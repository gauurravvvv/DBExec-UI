# 10 · RBAC, SSO, MFA, SCIM, API Tokens

> The enterprise-readiness module. RBAC is mature in DBExec. SSO /
> SCIM / MFA / API tokens / service accounts are missing.

**Depends on:** —
**Unblocks:** every enterprise sale
**Maturity:** RBAC ✅ · SSO/MFA/SCIM/API tokens ❌

---

## 1. Industry baseline

- **SSO** — every BI tool supports SAML 2.0 + OIDC.
- **MFA** — TOTP (RFC 6238) + WebAuthn (passkeys).
- **SCIM** — SCIM 2.0 endpoints for Okta / Azure AD provisioning.
- **API tokens** — bearer tokens with scopes + expiry.
- **Service accounts** — non-human identities with API tokens.

## 2. DBExec today

| Feature | Status |
|---|---|
| Username/password | ✅ |
| JWT + refresh | ✅ |
| RBAC permission tree | ✅ |
| Password policy | ✅ (length, history, complexity) |
| MFA | ❌ |
| SSO (SAML) | ❌ |
| SSO (OIDC) | ❌ |
| SCIM | ❌ |
| API tokens | ❌ |
| Service accounts | ❌ |
| Audit logging | ✅ |

## 3. Gaps

| ID | Gap | Severity |
|---|---|---|
| AUTH-G01 | SAML 2.0 SP-initiated | P0 |
| AUTH-G02 | SAML 2.0 IdP-initiated | P1 |
| AUTH-G03 | OIDC (Google, Microsoft, Okta, Auth0) | P0 |
| AUTH-G04 | TOTP MFA | P0 |
| AUTH-G05 | WebAuthn / Passkeys | P1 |
| AUTH-G06 | Recovery codes | P0 (paired with AUTH-G04) |
| AUTH-G07 | SCIM 2.0 endpoints | P1 |
| AUTH-G08 | API tokens (PAT) | P0 |
| AUTH-G09 | Service accounts | P0 |
| AUTH-G10 | Session list + revoke | P0 |
| AUTH-G11 | Force-logout-all on password change | P0 |
| AUTH-G12 | Trusted devices ("Don't ask for 30 days") | P1 |
| AUTH-G13 | Login captcha after N failures | P1 |
| AUTH-G14 | Login IP allowlist | P1 |

## 4. Target architecture

### 4.1 Schema

```sql
-- SSO config per org
CREATE TABLE sso_config (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisation(id),
  protocol        varchar(16) NOT NULL,         -- saml | oidc
  status          varchar(16) NOT NULL DEFAULT 'disabled',
  -- SAML
  saml_entry_point text,
  saml_issuer      text,
  saml_cert        text,
  saml_attribute_mapping jsonb,                 -- { firstName, lastName, email, groups }
  -- OIDC
  oidc_issuer      text,
  oidc_client_id   text,
  oidc_client_secret_enc bytea,
  oidc_scopes      text[] DEFAULT ARRAY['openid','email','profile'],
  -- common
  jit_provisioning boolean NOT NULL DEFAULT true,
  default_role_id  uuid,
  group_mapping    jsonb,
  created_on       timestamptz DEFAULT now()
);

-- MFA per user
CREATE TABLE user_mfa (
  user_id            uuid PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  method             varchar(16) NOT NULL,      -- totp | webauthn
  totp_secret_enc    bytea,
  webauthn_credentials jsonb,
  recovery_codes_enc bytea,
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz
);

-- API tokens
CREATE TABLE api_token (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  owner_user_id   uuid,                          -- nullable for service-account tokens
  service_account_id uuid,                       -- one or the other
  name            varchar(100) NOT NULL,
  token_hash      varchar(255) NOT NULL,         -- SHA-256
  scopes          text[] NOT NULL,
  prefix          varchar(8) NOT NULL,           -- e.g. 'dbe_'
  last_4          varchar(4) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  last_used_at    timestamptz,
  status          smallint NOT NULL DEFAULT 1
);

-- Service accounts
CREATE TABLE service_account (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  description     text,
  role_id         uuid NOT NULL,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          smallint NOT NULL DEFAULT 1
);

-- Session tracking
CREATE TABLE user_session (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL,
  organisation_id uuid NOT NULL,
  refresh_token_hash varchar(255) NOT NULL UNIQUE,
  user_agent      varchar(512),
  ip              inet,
  geo             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz
);

-- SCIM
CREATE TABLE scim_token (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL UNIQUE,
  token_hash      varchar(255) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  status          smallint NOT NULL DEFAULT 1
);
```

### 4.2 Endpoint surface

| Method | Path | Purpose |
|---|---|---|
| GET  | `/auth/sso/config` | Get org's SSO config |
| PUT  | `/auth/sso/config` | Update |
| GET  | `/auth/sso/saml/metadata.xml` | SP metadata for IdP setup |
| POST | `/auth/sso/saml/acs` | ACS (AssertionConsumer) |
| GET  | `/auth/sso/oidc/start` | Begin OIDC flow |
| GET  | `/auth/sso/oidc/callback` | OIDC callback |
| POST | `/auth/mfa/enroll/totp` | Begin TOTP enrolment (returns secret + QR) |
| POST | `/auth/mfa/enroll/totp/confirm` | Confirm with code |
| POST | `/auth/mfa/verify` | Step-up MFA on login |
| POST | `/auth/mfa/recovery-codes` | Generate / regenerate |
| POST | `/auth/mfa/disable` | Disable (requires password + recent MFA) |
| GET  | `/auth/sessions` | List my sessions |
| DELETE | `/auth/sessions/:id` | Revoke a session |
| POST | `/api-tokens` | Create (returns token once) |
| GET  | `/api-tokens/list` | List (no secrets) |
| DELETE | `/api-tokens/:id` | Revoke |
| POST | `/service-accounts` | Create |
| GET  | `/scim/v2/Users` | SCIM list |
| POST | `/scim/v2/Users` | SCIM create |
| PATCH | `/scim/v2/Users/:id` | SCIM update |

## 5. UI specs

### 5.1 Org Settings → Authentication

Tabs:

- **General** — password policy, session timeout, locking.
- **SSO** — Disabled / SAML / OIDC.
  - SAML: SP metadata download, IdP entry point, issuer, cert paste.
  - OIDC: Provider dropdown (Google, Microsoft, Okta, Auth0, Custom).
- **MFA** — Require for all users / admins only / off.
- **SCIM** — Generate / rotate / revoke SCIM token.
- **API Tokens** — CRUD on org-level tokens.
- **Service Accounts** — CRUD with role binding.

### 5.2 Profile → Security

- Active sessions table with "Revoke" per row.
- MFA enrolment QR.
- Recovery codes.
- Personal API tokens.

## 6. Code recipes

### 6.1 SAML ACS using `@node-saml/node-saml`

```ts
// src/modules/auth/controllers/samlAcs.ts
import { SAML } from '@node-saml/node-saml';

export default async function samlAcs(req: Request, res: Response) {
  const orgId = req.query.orgId as string;
  const cfg = await SsoConfig.findOne({ where: { organisationId: orgId } });
  if (!cfg || cfg.protocol !== 'saml' || cfg.status !== 'enabled')
    return res.status(404).end();

  const saml = new SAML({
    callbackUrl: `${BACKEND_URL}/auth/sso/saml/acs?orgId=${orgId}`,
    entryPoint: cfg.samlEntryPoint!,
    issuer: cfg.samlIssuer!,
    cert: cfg.samlCert!,
    audience: cfg.samlIssuer!,
  });

  const { profile } = await saml.validatePostResponseAsync(req.body);
  if (!profile) return res.status(401).send('SAML validation failed');

  const email = profile[cfg.samlAttributeMapping?.email || 'email'];
  let user = await User.findOne({ where: { organisationId: orgId, email } });
  if (!user && cfg.jitProvisioning) {
    user = await provisionUserFromSaml(profile, cfg);
  }
  if (!user) return res.status(403).send('User not found');

  const tokens = await issueJwt(user);
  const url = `${FE_URL}/auth/sso-callback?token=${tokens.access}&refresh=${tokens.refresh}`;
  return res.redirect(url);
}
```

### 6.2 OIDC using `openid-client`

```ts
import { Issuer, generators } from 'openid-client';

export async function oidcStart(req: Request, res: Response) {
  const cfg = await SsoConfig.findOne({ where: { organisationId: req.query.orgId } });
  const issuer = await Issuer.discover(cfg.oidcIssuer!);
  const client = new issuer.Client({
    client_id: cfg.oidcClientId!,
    client_secret: decrypt(cfg.oidcClientSecretEnc!),
    redirect_uris: [`${BACKEND_URL}/auth/sso/oidc/callback`],
    response_types: ['code'],
  });
  const state = generators.state();
  const nonce = generators.nonce();
  req.session.oidc = { state, nonce, orgId: cfg.organisationId };
  res.redirect(client.authorizationUrl({
    scope: cfg.oidcScopes.join(' '),
    state, nonce,
  }));
}
```

### 6.3 TOTP enrol

```ts
import * as speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export async function enrolTotpStart(req: Request, res: Response) {
  const user = res.locals.user;
  const secret = speakeasy.generateSecret({ name: `DBExec (${user.email})` });
  await UserMfa.upsert({
    userId: user.id, method: 'totp', totpSecretEnc: encrypt(secret.base32),
  } as any, ['userId']);
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url!);
  res.json({ qrDataUrl, secret: secret.base32 });
}

export async function enrolTotpConfirm(req: Request, res: Response) {
  const user = res.locals.user;
  const mfa = await UserMfa.findOne({ where: { userId: user.id } });
  const ok = speakeasy.totp.verify({
    secret: decrypt(mfa!.totpSecretEnc),
    encoding: 'base32',
    token: req.body.code,
    window: 1,
  });
  if (!ok) return res.status(400).json({ error: 'invalid code' });
  const codes = Array.from({ length: 10 },
    () => crypto.randomBytes(4).toString('hex'));
  await UserMfa.update(user.id, {
    recoveryCodesEnc: encrypt(JSON.stringify(codes)),
    enrolledAt: new Date(),
  });
  res.json({ recoveryCodes: codes });
}
```

### 6.4 API token issue

```ts
export async function createApiToken(req: Request, res: Response) {
  const { name, scopes, expiresInDays } = req.body;
  const raw = `dbe_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const token = new ApiToken();
  token.organisationId = res.locals.orgData.id;
  token.ownerUserId    = res.locals.user.id;
  token.name           = name;
  token.tokenHash      = hash;
  token.scopes         = scopes;
  token.prefix         = 'dbe_';
  token.last4          = raw.slice(-4);
  if (expiresInDays) token.expiresAt = addDays(new Date(), expiresInDays);
  await token.save();
  res.json({ token: raw, ...stripSecrets(token) });
}

// auth middleware accepts Bearer or x-api-token
export async function apiAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '')
         || req.headers['x-api-token'];
  if (!t || !t.startsWith('dbe_')) return next();   // fall through to JWT
  const hash = crypto.createHash('sha256').update(t).digest('hex');
  const row = await ApiToken.findOne({ where: { tokenHash: hash, status: 1 } });
  if (!row) return res.status(401).end();
  if (row.expiresAt && row.expiresAt < new Date()) return res.status(401).end();
  await ApiToken.update(row.id, { lastUsedAt: new Date() });
  res.locals.apiAuth = row;
  res.locals.scopes = row.scopes;
  next();
}
```

### 6.5 SCIM Users endpoint (minimal)

```ts
router.post('/scim/v2/Users', scimAuth, async (req, res) => {
  const body = req.body;
  const user = new User();
  user.organisationId = req.scim!.organisationId;
  user.username = body.userName;
  user.email = body.emails?.[0]?.value;
  user.firstName = body.name?.givenName;
  user.lastName  = body.name?.familyName;
  await user.save();
  res.status(201).json(scimUserResponse(user));
});
```

## 7. Test plan

- **AUTH-SAML-H-01** — SP metadata XML downloads with right entityID
- **AUTH-SAML-H-02** — successful IdP login provisions user JIT
- **AUTH-OIDC-H-01** — Google OIDC roundtrip
- **AUTH-MFA-H-01** — TOTP enrol → confirm → next login asks for code
- **AUTH-MFA-N-01** — wrong code 5× → lockout
- **AUTH-MFA-E-01** — recovery code accepts; consumed once
- **AUTH-TOKEN-H-01** — API call with token succeeds
- **AUTH-TOKEN-N-01** — Token with insufficient scope → 403
- **AUTH-SCIM-H-01** — Okta provisions user → appears in DB
- **AUTH-SESS-H-01** — User can list + revoke other sessions

## 8. Migration & rollout

1. Ship MFA + API tokens first (they're org-local, low risk).
2. SAML before OIDC (most enterprises ask for SAML first).
3. SCIM last (depends on stable User CRUD).

## 9. Open questions

- Should we offer "Magic link" passwordless login? Useful but not
  enterprise must-have; ship V2.
