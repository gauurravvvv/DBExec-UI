# 14 · Sharing & Embedding

> The customer-facing extension of DBExec. Internal sharing for
> teammates; public links for "we have a dashboard, here's the URL";
> embedded analytics for customer-facing apps that don't want users
> to ever see DBExec branding.
>
> Sister modules:
> [08 · Dashboard](08-dashboard.md) (what gets shared), [10 · Auth /
> RBAC / SSO](10-auth-rbac-sso.md) (the auth model being extended),
> [13 · Export & Download](13-export-download.md) (the static
> alternative to live sharing).

**Depends on:** Dashboard (08), Analysis (06), Auth (10), RLS (09), Branding (20)
**Unblocks:** Customer-facing analytics, partner-facing dashboards
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Mode | Tableau | Looker | Metabase | Superset | Mode |
|---|---|---|---|---|---|
| **Internal share** | Permission-on-content | Folders + groups | Collections | Roles + datasets | Workspaces |
| **Public link** | "Share to web" toggle | Public LookML scheduled exports | "Public link" with password | Public chart links | Public reports |
| **Embed (anon)** | Tableau Embed API + JWT | Looker embed URL with signed token | Static iframe | iframe (chart only) | Reports embed iframe |
| **Embed (authed)** | Connected Apps + JWT | Embed SDK + signed user | "Application Embedding" tier (paid) | Native filters via URL | Mode SDK |
| **White-label** | Mostly Tableau Server | Looker Embed SDK | Metabase white-label paid | Custom theme | Mode white-label |

**The patterns to copy:**

- **Signed JWT embed** (Looker / Sigma / Tableau Connected Apps).
  The customer's own backend signs a token that carries `external_user_id`,
  `permissions`, and `filters`. DBExec verifies the JWT and runs
  the dashboard with the embed user's scope — never a DBExec user
  identity.
- **CSP `frame-ancestors`** per share link. Embeds restricted to
  specific origins so a stolen URL can't be iframed from
  `attacker.com`.
- **Per-link state**: each share / embed has its own
  expiry, password, allowed visuals, theme override.
- **Audit on every view**. Public links lose accountability if
  there's no per-view log. Audit trail must record IP, UA, country,
  referrer, time spent.

**The lesson DBExec should internalise:** embed is not "iframe with
extra steps" — it's a separate auth domain with its own user model
(external users, not DBExec users), its own permission resolution
(JWT claims, not DB roles), and its own UX (no chrome, custom
theme).

## 2. DBExec today

- **Nothing.** Dashboards are auth-only inside DBExec.
- The "share dialog" doesn't exist; the only way to give someone a
  dashboard is to add them as an org user or send them screenshots.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| SH-G01 | Internal share (org user / group with view/edit perm) | P0 | M |
| SH-G02 | Public link (no auth, optional password, optional expiry) | P0 | M |
| SH-G03 | Signed JWT embed for customer apps | P0 | L |
| SH-G04 | `frame-ancestors` CSP per link | P0 | S |
| SH-G05 | Per-link visible visuals (whitelist a subset) | P1 | M |
| SH-G06 | Per-link theme override (light/dark/custom) | P1 | S |
| SH-G07 | Per-link disabled chrome (hide title, filters) | P1 | S |
| SH-G08 | Per-link RLS user-attribute injection | P0 | M |
| SH-G09 | Audit log per view (IP, UA, geo, duration) | P0 | M |
| SH-G10 | Per-link max-views-per-hour rate limit | P1 | S |
| SH-G11 | Captcha gate on public link (abuse mitigation) | P1 | M |
| SH-G12 | postMessage protocol (host ↔ iframe events) | P1 | M |
| SH-G13 | Embed SDK npm package (`@dbexec/embed`) | P1 | M |
| SH-G14 | Embed analytics dashboard (views, users, top dashboards) | P2 | M |
| SH-G15 | "Refresh" button hidden in embed mode by default | P2 | S |
| SH-G16 | Org-level "max active embeds" billing limit | P2 | S |
| SH-G17 | Per-link revocation + force-disconnect open sessions | P1 | S |
| SH-G18 | Share-link rename without invalidating the link | P2 | S |

## 4. Target architecture

### 4.1 Three sharing modes, one entity

```
                       ┌────────────────────┐
                       │     ShareLink      │
                       │ ─────────────────── │
                       │  mode = internal   │ ← share with org users
                       │  mode = public     │ ← anonymous browser
                       │  mode = embed      │ ← JWT-signed customer
                       └────────┬───────────┘
                                ▼
                       ┌────────────────────┐
                       │   ShareLinkView    │ ← one row per render
                       └────────────────────┘
```

The same `share_link` table backs all three modes. Mode discriminates
how the link is *invoked* (URL with token vs URL with short code vs
JWT in header). The dashboard rendering pipeline doesn't care which.

### 4.2 Schema

```sql
-- migration: 2026-08-XX_share_embed.sql

CREATE TABLE share_link (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL,

  -- What's being shared
  target_type        varchar(16) NOT NULL,   -- dashboard | analysis | visual
  target_id          uuid NOT NULL,

  -- How it's shared
  mode               varchar(16) NOT NULL,   -- internal | public | embed
  short_code         varchar(24) NOT NULL UNIQUE,   -- the URL slug
  name               varchar(100),

  -- Public-link options
  password_hash      varchar(255),           -- bcrypt; NULL = no password
  expires_at         timestamptz,            -- NULL = no expiry
  max_views          int,                    -- NULL = unlimited
  view_count         bigint NOT NULL DEFAULT 0,

  -- Embed options
  allowed_domains    text[] NOT NULL DEFAULT ARRAY[]::text[],
                                              -- CSP frame-ancestors values
                                              -- exact host or wildcard subdomain

  -- Display options
  visible_visuals    uuid[],                  -- when NULL, all visuals
  hidden_filters     uuid[],                  -- which filters to hide in UI
  theme_override     jsonb,                   -- {primaryColor, font, ...}
  chrome             jsonb,                   -- {hideTitle, hideFilters,
                                              --  hideRefresh, hideExport}

  -- Default state at view time
  default_tab_id     uuid,                    -- which tab to land on
  default_filters    jsonb,                   -- {filterId: value, ...}

  -- Status + audit
  status             smallint NOT NULL DEFAULT 1,
  created_by         uuid NOT NULL,
  created_on         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  updated_on         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoked_by         uuid,
  revoke_reason      varchar(255),

  -- Indexes
  CONSTRAINT share_link_mode_chk CHECK (mode IN ('internal','public','embed'))
);
CREATE INDEX share_link_org_target ON share_link (organisation_id, target_type, target_id);
CREATE INDEX share_link_active_lookup ON share_link (short_code)
  WHERE revoked_at IS NULL AND status = 1;

-- Per-view audit
CREATE TABLE share_link_view (
  id              bigserial PRIMARY KEY,
  share_link_id   uuid NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  external_user_id varchar(255),               -- from embed JWT or NULL
  ip              inet,
  user_agent      varchar(512),
  referrer        varchar(512),
  country         varchar(8),                  -- ISO 3166-1 alpha-2 / alpha-3
  duration_ms     int,                         -- how long they kept it open
  filters_used    jsonb,                       -- snapshot of applied filters
  viewed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_link_view_owner ON share_link_view (share_link_id, viewed_at DESC);

-- Per-link rate-limit counter (Redis-backed in practice; this table
-- is for billing/audit, not enforcement)
CREATE TABLE share_link_hourly_count (
  share_link_id   uuid NOT NULL,
  hour            timestamptz NOT NULL,   -- truncated to hour
  views           int NOT NULL,
  PRIMARY KEY (share_link_id, hour)
);
```

### 4.3 Entities

```ts
// src/shared/db/shared_entity/share_link.entity.ts
@Entity('share_link')
@Index(['organisationId', 'targetType', 'targetId'])
@Index(['shortCode'], { unique: true })
export class ShareLink {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') organisationId!: string;

  @Column({ length: 16 }) targetType!: 'dashboard' | 'analysis' | 'visual';
  @Column('uuid') targetId!: string;

  @Column({ length: 16 }) mode!: 'internal' | 'public' | 'embed';
  @Column({ length: 24 }) shortCode!: string;
  @Column({ length: 100, nullable: true }) name?: string;

  @Column({ length: 255, nullable: true }) passwordHash?: string;
  @Column('timestamptz', { nullable: true }) expiresAt?: Date;
  @Column('int', { nullable: true }) maxViews?: number;
  @Column('bigint', { default: 0 }) viewCount!: number;

  @Column('text', { array: true, default: () => "ARRAY[]::text[]" })
  allowedDomains!: string[];

  @Column('uuid', { array: true, nullable: true }) visibleVisuals?: string[];
  @Column('uuid', { array: true, nullable: true }) hiddenFilters?: string[];
  @Column('jsonb', { nullable: true }) themeOverride?: Record<string, unknown>;
  @Column('jsonb', { nullable: true }) chrome?: {
    hideTitle?: boolean;
    hideFilters?: boolean;
    hideRefresh?: boolean;
    hideExport?: boolean;
    hideTabs?: boolean;
  };

  @Column('uuid', { nullable: true }) defaultTabId?: string;
  @Column('jsonb', { nullable: true }) defaultFilters?: Record<string, unknown>;

  @Column({ type: 'enum', enum: [0,1], default: 1 }) status!: number;
  @Column('uuid') createdBy!: string;
  @CreateDateColumn() createdOn!: Date;
  @Column('uuid', { nullable: true }) updatedBy?: string;
  @UpdateDateColumn() updatedOn!: Date;
  @Column('timestamptz', { nullable: true }) revokedAt?: Date;
  @Column('uuid', { nullable: true }) revokedBy?: string;
  @Column({ length: 255, nullable: true }) revokeReason?: string;
}

@Entity('share_link_view')
export class ShareLinkView {
  @PrimaryGeneratedColumn() id!: number;
  @Column('uuid') shareLinkId!: string;
  @Column({ length: 255, nullable: true }) externalUserId?: string;
  @Column('inet', { nullable: true }) ip?: string;
  @Column({ length: 512, nullable: true }) userAgent?: string;
  @Column({ length: 512, nullable: true }) referrer?: string;
  @Column({ length: 8, nullable: true }) country?: string;
  @Column('int', { nullable: true }) durationMs?: number;
  @Column('jsonb', { nullable: true }) filtersUsed?: Record<string, unknown>;
  @CreateDateColumn() viewedAt!: Date;
}
```

### 4.4 Mode 1 — internal share

Internal shares add a normal org user (or group) to the dashboard's
permission set. This already exists in the dashboard module as a
permission grant; the share-link entity exposes a UX-friendly
"share dialog" that wraps the existing permission write.

```ts
// POST /share-links
// body: { targetType: 'dashboard', targetId, mode: 'internal',
//         shareWith: [{userOrGroupId, permission: 'view'|'edit'}] }

async function createInternalShare(req, res) {
  const { targetId, shareWith } = req.body;
  // Per-user/group, write to dashboard_permission (existing table)
  for (const grant of shareWith) {
    await DashboardPermission.upsert({
      dashboardId: targetId,
      principalType: grant.kind,    // 'user'|'group'
      principalId: grant.id,
      permission: grant.permission,
    });
  }
  // Audit
}
```

This mode doesn't actually produce a `share_link` row — it
operates on the dashboard's permission table. The share-link entity
is only for `public` and `embed` modes. (Listing it in the matrix
keeps the mental model coherent.)

### 4.5 Mode 2 — public link

```ts
// POST /share-links  body: { targetType, targetId, mode: 'public',
//                            password?, expiresAt?, allowedDomains? }

async function createPublicShareLink(req, res) {
  const { targetType, targetId, password, expiresAt, allowedDomains,
          visibleVisuals, themeOverride, chrome, defaultTabId,
          defaultFilters, maxViews } = req.body;
  const { orgData, loggedInId } = res.locals;

  // Verify the target exists in this org.
  await assertTargetOwnedByOrg(targetType, targetId, orgData.id);

  // Generate a short, unique URL slug.
  const shortCode = await generateUniqueShortCode();

  const link = await ShareLink.save({
    organisationId: orgData.id,
    targetType, targetId,
    mode: 'public',
    shortCode,
    passwordHash: password ? await bcrypt.hash(password, 10) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    maxViews: maxViews ?? null,
    allowedDomains: allowedDomains ?? [],
    visibleVisuals: visibleVisuals ?? null,
    themeOverride, chrome,
    defaultTabId, defaultFilters,
    createdBy: loggedInId,
  });

  // Audit + webhook
  await auditLogger.logAuditToOrg({
    connection: master_db_connection, req, res,
    module: AUDIT_MODULES.SHARE_LINK, action: AUDIT_ACTIONS.CREATE,
    entityId: link.id,
    metadata: { mode: 'public', targetType, targetId, hasPassword: !!password },
  });

  return sendResponse(res, true, CODE.SUCCESS, 'share.created', {
    link, url: `${FE_URL}/share/${shortCode}`,
  });
}
```

Short code generation balances readable + collision-resistant:

```ts
async function generateUniqueShortCode(): Promise<string> {
  const ALPHA = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // 16 chars from a 56-char alphabet = ~91 bits entropy. Even with
  // 100M links collisions are negligible.
  for (let attempt = 0; attempt < 5; attempt++) {
    let s = '';
    for (let i = 0; i < 16; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
    const exists = await ShareLink.findOne({ where: { shortCode: s } });
    if (!exists) return s;
  }
  throw new Error('Could not generate unique short code in 5 attempts');
}
```

#### Public link viewer flow

```
GET /share/:shortCode
   ↓
load ShareLink WHERE short_code = ? AND status = 1 AND revoked_at IS NULL
   ↓
404 if not found
   ↓
expiry check: 410 Gone if expires_at < now()
   ↓
view-count check: 410 Gone if view_count >= max_views
   ↓
if passwordHash → POST /share/:shortCode/verify-password
                  with bcrypt.compare; on success set session cookie
                  with a 1-hour TTL bound to the shortCode
   ↓
issue a short-lived service token (5 min TTL) for the dashboard render
   ↓
redirect to /view/dashboard/:targetId?shareToken=<...>
   ↓
FE renders dashboard with chrome from ShareLink.chrome,
visible_visuals filter applied, default_filters pre-applied,
default_tab_id selected.
```

#### CSP enforcement

```ts
// src/modules/share/middleware/cspFrameAncestors.middleware.ts
export default function cspFrameAncestors(req, res, next) {
  const shareLink = res.locals.shareLink as ShareLink | undefined;
  if (!shareLink || shareLink.allowedDomains.length === 0) {
    // Default — no embedding allowed
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    return next();
  }
  const policy = shareLink.allowedDomains
    .map(d => d.startsWith('https://') || d.startsWith('http://') ? d : `https://${d}`)
    .join(' ');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${policy}`);
  next();
}
```

### 4.6 Mode 3 — signed JWT embed

The customer's own backend signs a JWT that DBExec verifies. The
JWT carries the embed user's identity, permissions, and any
user-attribute values that drive RLS.

#### JWT shape (RFC-style)

```
Header
  { "alg": "HS256", "typ": "JWT", "kid": "embed-key-2026" }

Payload
  {
    "iss":   "<embed-app-key>",      // the customer's app key
    "iat":   1719321600,
    "exp":   1719325200,             // ≤ 1 hour from now
    "jti":   "<random uuid>",        // one-use protection
    "aud":   "dbexec/embed",
    "org":   "<dbexec orgId>",
    "sub":   "<external user id>",   // YOUR customer's user id
    "perms": ["view","filter","export"],
    "target": {
      "type": "dashboard" | "analysis" | "visual",
      "id": "<targetId>"
    },
    "attrs": {                       // injected into RLS
      "region": "APAC",
      "account_id": "acme-corp"
    }
  }
```

DBExec verifies with the customer's signing secret stored per
`embed_app` row:

```sql
CREATE TABLE embed_app (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL,
  name               varchar(100) NOT NULL,
  app_key            varchar(48) NOT NULL UNIQUE,    -- public, used as JWT iss
  signing_secret_enc bytea NOT NULL,                  -- encrypted, used to verify
  allowed_origins    text[] NOT NULL DEFAULT ARRAY[]::text[],
  status             smallint NOT NULL DEFAULT 1,
  created_by         uuid NOT NULL,
  created_on         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embed_app_org ON embed_app (organisation_id) WHERE status = 1;
```

The signing secret is encrypted at rest with the org's DEK (same
crypto envelope as datasource passwords).

#### Verification middleware

```ts
// src/modules/embed/middleware/verifyEmbedJwt.middleware.ts
import * as jwt from 'jsonwebtoken';

export default async function verifyEmbedJwt(req, res, next) {
  const token = req.headers['x-embed-token'] as string
             ?? (req.query.token as string);
  if (!token) return sendResponse(res, false, CODE.UNAUTHORIZED, 'embed.token.missing');

  // Decode without verifying first, just to read the `iss` (app key).
  const decoded = jwt.decode(token, { complete: true }) as any;
  if (!decoded?.payload?.iss) return sendResponse(res, false, 401, 'embed.token.malformed');

  const app = await EmbedApp.findOne({
    where: { appKey: decoded.payload.iss, status: 1 },
  });
  if (!app) return sendResponse(res, false, 401, 'embed.app.not_found');

  const secret = decryptForOrg(app.signingSecretEnc, app.organisationId);
  let payload: any;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: 'dbexec/embed',
      maxAge: '1h',
    });
  } catch (e) {
    return sendResponse(res, false, 401, 'embed.token.invalid');
  }

  // Replay protection: jti must not have been seen in the last hour.
  const seen = await redis.set(`embed:jti:${payload.jti}`, '1', 'EX', 3600, 'NX');
  if (seen === null) return sendResponse(res, false, 401, 'embed.token.replayed');

  // Origin check for iframe context
  const origin = req.headers.origin as string | undefined;
  if (origin && app.allowedOrigins.length > 0 && !app.allowedOrigins.includes(origin)) {
    return sendResponse(res, false, 403, 'embed.origin.not_allowed');
  }

  // Attach the embed context to res.locals so downstream resolvers
  // can read user attributes for RLS, etc.
  res.locals.embedContext = {
    appId: app.id,
    organisationId: app.organisationId,
    externalUserId: payload.sub,
    permissions: payload.perms ?? [],
    target: payload.target,
    attrs: payload.attrs ?? {},
    iat: payload.iat,
    exp: payload.exp,
  };
  res.locals.orgData = { id: app.organisationId };
  next();
}
```

#### Where the user attributes flow

The `attrs` payload feeds the RLS resolver. Today (module 09) RLS
reads attributes from `user_attribute_value` keyed by `userId`.
Embed context replaces that with the JWT-supplied attrs:

```ts
// src/shared/services/rlsResolver.service.ts — embed-aware change
async function resolveRlsForCaller(datasetId: string, ctx: AuthCtx) {
  if (ctx.embedAttrs) return ctx.embedAttrs;           // JWT path
  if (ctx.userId)     return await loadUserAttrs(ctx.userId);  // DBExec user
  return {};
}
```

This is the key invariant: **embed users never resolve to a DBExec
user identity.** They have their own attribute namespace, supplied
by the embedding application.

### 4.7 The dashboard render contract — embed-aware

When the dashboard renders via an embed/public link:

```
GET /api/v1/dashboards/:id/render
   ↑
   ┌── Authorization sources (any one of these):
   │
   │   1. JWT in x-auth-token  → DBExec user identity
   │   2. JWT in x-embed-token → embed app + external user
   │   3. ?shareToken=...      → short-lived public-link token
   │
   ↓
load Dashboard
   ↓
build AuthCtx from whichever source authorised
   ↓
resolve RLS using AuthCtx (deny-by-default if no rules match — RLS-P0-1)
   ↓
filter visuals by shareLink.visibleVisuals if applicable
   ↓
apply default_filters as initial filter state
   ↓
return render payload — strip chrome based on shareLink.chrome
```

`shareLink.visibleVisuals` is enforced **server-side** — the
visuals not in the list are never sent. A user inspecting the
network tab can't reveal them.

### 4.8 postMessage protocol

For embedded dashboards in an iframe, host ↔ embed communication is
via `window.postMessage`:

```ts
// Embed-side (DBExec): notifications about user activity
window.parent.postMessage({
  type: 'dbexec.event',
  event: 'dashboard.ready',
  data: { dashboardId, tabId, loadDuration },
}, '*');                 // origin verified host-side

window.parent.postMessage({
  type: 'dbexec.event',
  event: 'filter.changed',
  data: { filterId, value },
}, '*');

window.parent.postMessage({
  type: 'dbexec.event',
  event: 'visual.clicked',
  data: { visualId, row },
}, '*');

// Host-side: commands sent into the iframe
iframe.contentWindow.postMessage({
  type: 'dbexec.command',
  command: 'setFilter',
  data: { filterId, value },
}, FE_URL);

iframe.contentWindow.postMessage({
  type: 'dbexec.command',
  command: 'navigateTab',
  data: { tabId },
}, FE_URL);

iframe.contentWindow.postMessage({
  type: 'dbexec.command',
  command: 'refresh',
}, FE_URL);
```

DBExec's iframe code listens with origin validation:

```ts
window.addEventListener('message', (e) => {
  if (e.origin !== EXPECTED_HOST_ORIGIN) return;     // ← critical
  const msg = e.data;
  if (msg?.type !== 'dbexec.command') return;
  handleCommand(msg.command, msg.data);
});
```

### 4.9 Embed SDK

A small npm package `@dbexec/embed` wraps the postMessage handshake.

```ts
// @dbexec/embed
import { DBExecEmbed } from '@dbexec/embed';

const embed = new DBExecEmbed({
  container: document.getElementById('dashboard-mount')!,
  baseUrl: 'https://app.dbexec.com',
  signedToken: '<jwt from your backend>',
  onReady: () => console.log('dashboard loaded'),
  onError: (e) => console.error(e),
  onEvent: (name, data) => analytics.track(`dbexec.${name}`, data),
});

embed.setFilter('region', 'APAC');
embed.navigateTab('sales');
embed.refresh();
embed.destroy();
```

Internally it builds the iframe, attaches the listener, and exposes
typed methods over the postMessage protocol.

### 4.10 Per-link view tracking

```ts
// Background after-render audit — does not block the response
async function recordView(shareLink: ShareLink, ctx: RenderCtx) {
  const ip = extractClientIp(ctx.req).ip;
  const country = await lookupCountry(ip).catch(() => null);

  await ShareLinkView.insert({
    shareLinkId: shareLink.id,
    externalUserId: ctx.embedContext?.externalUserId,
    ip,
    userAgent: ctx.req.headers['user-agent']?.slice(0, 512),
    referrer: ctx.req.headers['referer']?.slice(0, 512),
    country,
    filtersUsed: ctx.appliedFilters,
  });

  // Atomic counter increment
  await ShareLink.increment({ id: shareLink.id }, 'viewCount', 1);

  // Hourly rollup for billing / rate-limit display
  const hour = startOfHour(new Date());
  await master_db_connection.query(`
    INSERT INTO share_link_hourly_count (share_link_id, hour, views)
    VALUES ($1, $2, 1)
    ON CONFLICT (share_link_id, hour)
    DO UPDATE SET views = share_link_hourly_count.views + 1`,
    [shareLink.id, hour]);
}
```

GeoIP lookup via `maxmind/geolite2-asn` or a hosted equivalent. Free
ASN-only data is enough for "what country is this view from"; full
city data needs a paid plan.

### 4.11 Rate limit (Redis token bucket)

```ts
// src/shared/middleware/shareLinkRateLimit.ts
export default async function shareLinkRateLimit(req, res, next) {
  const link = res.locals.shareLink as ShareLink;
  const ip = extractClientIp(req).ip || 'unknown';
  const key = `share:rl:${link.id}:${ip}`;

  // 30 views per hour per IP per link
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  if (count > 30) return sendResponse(res, false, 429, 'share.rate_limit');

  next();
}
```

Per-link maxViews is a separate, longer-term counter (lifetime cap).
Per-IP rate limit is the abuse mitigator.

### 4.12 Captcha gate (optional)

For public links, a configurable captcha can gate first-time
viewers. The viewer hits the share URL, sees a Cloudflare Turnstile
challenge, solves it, gets a short-lived cookie marking them
"verified". Subsequent views within the link's expiry window skip
the captcha.

```ts
// POST /share/:code/verify-captcha
async function verifyCaptcha(req, res) {
  const { token } = req.body;
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET!,
      response: token,
      remoteip: extractClientIp(req).ip!,
    }),
  });
  const result = await verify.json();
  if (!result.success) return sendResponse(res, false, 400, 'share.captcha.failed');

  // Set HttpOnly cookie binding this client to this share-link.
  res.cookie('dbexec_share_verified', signCookie(req.params.code), {
    httpOnly: true, secure: true, sameSite: 'lax',
    maxAge: 24 * 3600 * 1000,
  });
  res.json({ ok: true });
}
```

Per-org toggle: `embed_settings.require_captcha_for_public_links boolean`.

### 4.13 Revocation

```ts
// POST /share-links/:id/revoke
async function revokeShareLink(req, res) {
  const link = await ShareLink.findOne({
    where: { id: req.params.id, organisationId: res.locals.orgData.id },
  });
  if (!link) return sendResponse(res, false, 404, 'share.not_found');

  link.revokedAt = new Date();
  link.revokedBy = res.locals.loggedInId;
  link.revokeReason = req.body.reason ?? null;
  link.status = 0;
  await ShareLink.save(link);

  // Invalidate any in-flight short-lived service tokens issued by
  // this share link. The token includes the share_link_id; the
  // verifier checks revokedAt at every render.
  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { reason: link.revokeReason, viewCount: link.viewCount },
  });

  return sendResponse(res, true, CODE.SUCCESS, 'share.revoked');
}
```

The render endpoint always re-checks `revokedAt IS NULL` on every
GET, so revoke takes effect instantly for new views; in-flight
sessions die at the next data fetch (the WebSocket / SSE
connection closes when the next-frame service token fails).

### 4.14 Theme + chrome overrides

```ts
// theme_override jsonb shape
type ThemeOverride = {
  primaryColor?: string;          // CSS hex
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  density?: 'compact'|'comfortable'|'spacious';
  logo?: string;                  // URL or data: URI
};

// chrome jsonb shape
type ChromeSettings = {
  hideTitle?: boolean;            // strip dashboard.name from page
  hideFilters?: boolean;          // collapse the filter sidebar
  hideRefresh?: boolean;          // remove the refresh button
  hideExport?: boolean;           // remove the export menu
  hideTabs?: boolean;             // hide tab strip (always show active tab)
  hideShare?: boolean;            // remove the share button
  customCss?: string;             // injected after the theme override
};
```

The FE applies theme override as CSS variables; chrome settings
become `*ngIf` toggles in the view component.

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/share-links` | Create (any mode) |
| GET | `/share-links` | List (org-scoped) |
| GET | `/share-links/:id` | Detail |
| PUT | `/share-links/:id` | Update non-immutable fields |
| POST | `/share-links/:id/revoke` | Revoke |
| GET | `/share-links/:id/views` | Per-view audit |
| GET | `/share/:shortCode` | Public viewer entry point |
| POST | `/share/:shortCode/verify-password` | Password challenge |
| POST | `/share/:shortCode/verify-captcha` | Captcha challenge |
| POST | `/embed-apps` | Create embed app (admin) |
| GET | `/embed-apps` | List |
| POST | `/embed-apps/:id/rotate-secret` | Generate new signing secret |
| POST | `/embed-apps/:id/revoke` | Disable app + invalidate all its tokens |

## 6. FE specs

### 6.1 Share dialog (entry point)

Three tabs, mapped to the modes:

```
┌────────────────────────────────────────────────────────────┐
│ Share dashboard: "Sales Q3 Review"                    [✕] │
├────────────────────────────────────────────────────────────┤
│  [ People ]  [ Public link ]  [ Embed ]                    │
│ ────────────────────────────────────────────                │
│  Add people or groups:                                     │
│  [ Search users/groups...                            ]     │
│  Alice Chen           [ View ▾ ]   [Remove]                │
│  Sales Team (group)   [ Edit ▾ ]   [Remove]                │
│                                                            │
│                                            [Cancel] [Save] │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Public link tab

```
┌────────────────────────────────────────────────────────────┐
│  [ People ]  [ Public link ✓ ]  [ Embed ]                  │
│ ────────────────────────────────────────────                │
│  Anyone with this link can view:                           │
│  https://app.dbexec.com/share/aB7c9DfGhJ2kLmNo   [Copy]    │
│                                                            │
│  Settings:                                                 │
│    ☑ Password protected:  [______________________]         │
│    ☑ Expires on:           [2026-09-15]  [12:00 PM]        │
│    ☐ Maximum views:        [_____]                         │
│    ☑ Hide filters from viewer                              │
│    ☐ Hide refresh button                                   │
│                                                            │
│  Active views: 14 (last hour: 3)                           │
│  [ View activity ▸ ]    [ Revoke link ▸ ]                  │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Embed tab

```
┌────────────────────────────────────────────────────────────┐
│  [ People ]  [ Public link ]  [ Embed ✓ ]                  │
│ ────────────────────────────────────────────                │
│  Embed in your application                                 │
│                                                            │
│  1. Pick an embed app:                                     │
│     [ Acme Customer Portal ▾ ]   [ + New ]                 │
│                                                            │
│  2. Allowed origins (where will you iframe this?):         │
│     ✓ portal.acme.com                                      │
│     [ + add another ]                                      │
│                                                            │
│  3. Copy snippet (server-side, in YOUR backend):           │
│     ┌──────────────────────────────────────────┐           │
│     │ const token = jwt.sign({                  │           │
│     │   iss: '<your app key>',                  │           │
│     │   sub: req.user.id,                       │           │
│     │   exp: Math.floor(Date.now()/1000) + 3600,│           │
│     │   aud: 'dbexec/embed',                    │           │
│     │   org: '<your DBExec org>',               │           │
│     │   target: { type:'dashboard', id:'...' }, │           │
│     │   attrs: { region: req.user.region },     │           │
│     │   perms: ['view','filter'],               │           │
│     │ }, SIGNING_SECRET);                       │           │
│     └──────────────────────────────────────────┘           │
│                                                            │
│  4. Embed (browser):                                       │
│     <iframe                                                │
│       src="https://app.dbexec.com/embed/dashboard/...      │
│         ?token=${token}"                                    │
│       width="100%" height="800"                            │
│       frameborder="0">                                     │
│     </iframe>                                              │
│                                                            │
│  Or use the SDK:                                           │
│     npm install @dbexec/embed                              │
│                                                            │
│  [Test embed ↗]   [Activity ▸]                             │
└────────────────────────────────────────────────────────────┘
```

### 6.4 Activity view

```
┌────────────────────────────────────────────────────────────┐
│ Activity for share-link "Q3 Review (public)"               │
├────────────────────────────────────────────────────────────┤
│ Last hour: 3   Today: 14   This week: 89   All-time: 412   │
│                                                            │
│ Country breakdown:                                         │
│   🇺🇸 US  64% │██████████████                              │
│   🇬🇧 GB  18% │████                                        │
│   🇮🇳 IN  12% │███                                         │
│   …                                                        │
│                                                            │
│ Recent views:                                              │
│   2026-08-04 14:22  UA: Chrome 127 (Mac)  US  filters:{}   │
│   2026-08-04 14:18  UA: Safari 17 (iOS)   GB  filters:{…}  │
│   …                                                        │
│ [Export CSV]                                               │
└────────────────────────────────────────────────────────────┘
```

## 7. Validators

```ts
// src/shared/validators/shareLinks.ts
export const SHARE_MODES = ['internal','public','embed'] as const;
export const SHARE_TARGETS = ['dashboard','analysis','visual'] as const;

export const createShareLinkSchema = z.discriminatedUnion('mode', [
  // Internal
  z.object({
    mode: z.literal('internal'),
    targetType: z.enum(SHARE_TARGETS),
    targetId: z.string().uuid(),
    shareWith: z.array(z.object({
      kind: z.enum(['user','group']),
      id: z.string().uuid(),
      permission: z.enum(['view','edit','admin']),
    })).min(1),
  }),
  // Public
  z.object({
    mode: z.literal('public'),
    name: z.string().max(100).optional(),
    targetType: z.enum(SHARE_TARGETS),
    targetId: z.string().uuid(),
    password: z.string().min(6).max(64).optional(),
    expiresAt: z.string().datetime().optional(),
    maxViews: z.number().int().min(1).max(1_000_000).optional(),
    visibleVisuals: z.array(z.string().uuid()).optional(),
    themeOverride: z.record(z.string(), z.any()).optional(),
    chrome: z.object({
      hideTitle: z.boolean().optional(),
      hideFilters: z.boolean().optional(),
      hideRefresh: z.boolean().optional(),
      hideExport: z.boolean().optional(),
      hideTabs: z.boolean().optional(),
      hideShare: z.boolean().optional(),
    }).optional(),
    defaultTabId: z.string().uuid().optional(),
    defaultFilters: z.record(z.string(), z.any()).optional(),
  }),
  // Embed
  z.object({
    mode: z.literal('embed'),
    name: z.string().max(100).optional(),
    targetType: z.enum(SHARE_TARGETS),
    targetId: z.string().uuid(),
    embedAppId: z.string().uuid(),
    allowedDomains: z.array(z.string().regex(/^https?:\/\/.+/)).min(1),
    visibleVisuals: z.array(z.string().uuid()).optional(),
    themeOverride: z.record(z.string(), z.any()).optional(),
    chrome: z.record(z.string(), z.boolean()).optional(),
  }),
]);
```

## 8. Test plan

### 8.1 Public links

```
SH-PUB-H-01    create public link → returns URL
SH-PUB-H-02    GET /share/:code → renders dashboard
SH-PUB-H-03    password-protected → POST /verify-password works
SH-PUB-H-04    expired link → 410 Gone
SH-PUB-H-05    max-views exceeded → 410 Gone
SH-PUB-N-01    invalid short code → 404
SH-PUB-N-02    revoked link → 410 (revoked, not just 404)
SH-PUB-H-06    chrome.hideFilters → filter sidebar absent from response
SH-PUB-H-07    visibleVisuals → only listed ids in response
SH-PUB-N-03    not visibleVisuals → query for excluded visual returns 403
SH-PUB-H-08    default_filters applied to first render
SH-PUB-H-09    default_tab_id selected on land
```

### 8.2 Embeds

```
SH-EMB-H-01    valid JWT → 200 render
SH-EMB-N-01    expired JWT (exp < now) → 401
SH-EMB-N-02    JWT with wrong audience → 401
SH-EMB-N-03    JWT with wrong issuer (unknown app key) → 401
SH-EMB-N-04    JWT replayed (same jti within hour) → 401
SH-EMB-N-05    JWT signed with wrong secret → 401
SH-EMB-N-06    origin not in allowed_origins → 403
SH-EMB-H-02    attrs in JWT → flow into RLS resolver
SH-EMB-H-03    RLS denies access (deny-by-default + zero rules) → empty render
SH-EMB-H-04    rotate-secret → old tokens fail, new ones work
SH-EMB-H-05    revoke embed app → all its tokens fail
```

### 8.3 CSP

```
SH-CSP-H-01    public link with allowedDomains → Content-Security-Policy header set
SH-CSP-H-02    public link without → frame-ancestors 'none'
SH-CSP-N-01    iframe from disallowed origin → browser blocks render
```

### 8.4 Audit & rate limit

```
SH-AUD-H-01    every view writes share_link_view row
SH-AUD-H-02    view row carries IP, UA, country
SH-AUD-H-03    hourly count incremented
SH-AUD-H-04    embed view records externalUserId from JWT
SH-RL-H-01     31st view from same IP within hour → 429
SH-RL-H-02     count resets after hour
```

### 8.5 postMessage protocol

```
SH-PM-H-01     iframe loads, posts {event:'dashboard.ready'}
SH-PM-H-02     host sends setFilter command → iframe applies it
SH-PM-H-03     iframe rejects message from non-allowed origin
SH-PM-N-01     malformed message ignored silently
```

## 9. Migration & rollout

1. Phase 1 — schema + ShareLink entity + internal share dialog
   (wraps existing dashboard_permission). No new viewer surface.
2. Phase 2 — public link mode + viewer route + password gate.
   CSP middleware.
3. Phase 3 — embed_app entity + JWT verification middleware +
   first version of the embed iframe route. SDK package not yet
   published.
4. Phase 4 — postMessage protocol + theme override + chrome
   settings.
5. Phase 5 — `@dbexec/embed` SDK published. Embed analytics
   dashboard.
6. Phase 6 — captcha gate, rate limits, billing limits.

Feature flag `enableSharing` per org. Embed mode flagged separately
behind a paid-tier check (`org.tier === 'enterprise'`).

## 10. Open questions

- **Embed user identity persistence.** Today every embed JWT
  carries an `external_user_id` — should we persist a `embed_user`
  row keyed on `(app_id, external_user_id)` so RLS can attach
  user-attribute defaults? Recommend yes for power users; defer
  for v1.
- **Public link permalink.** When the dashboard underneath changes
  (new visual added, layout reflowed), should the public link
  follow live or stay frozen at publish snapshot? Recommend
  follow-live to match the internal viewing model; document.
- **GeoIP database licensing.** MaxMind GeoLite2 is free with
  attribution but requires a download workflow. ip2location.io
  has a small free tier. Pick one.
- **PDF / PNG export from a public-link viewer.** Should it work?
  Per default — no. Embedded apps can re-implement via their own
  flow.
- **postMessage authentication.** A hostile host page could send
  command messages claiming to be DBExec. We mitigate by
  validating `e.origin` — but the embed must know its expected
  host origin. Today it does (the iframe was loaded from a known
  parent), but worth documenting.

## 11. References

- Looker embed JWT: <https://cloud.google.com/looker/docs/single-sign-on-embedding>
- Tableau Connected Apps: <https://help.tableau.com/current/online/en-us/connected_apps_direct.htm>
- Sigma Embed: <https://help.sigmacomputing.com/docs/embed-secure-embeds>
- CSP frame-ancestors: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors>
- Cloudflare Turnstile: <https://developers.cloudflare.com/turnstile/>
- JWT replay: <https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.7>

## Appendix · Review additions

- **postMessage protocol** — formalised in §4.8 with the iframe-side
  origin validation pattern.
- **Embed event API** — `dashboard.ready`, `filter.changed`,
  `visual.clicked`, `error` events from §4.8.
- **Theme override via JWT-token-bound cookie / per-link config**
  — see §4.14.
- **View analytics** — §4.10 + §6.4 dashboard.
- **Captcha gate** — §4.12 with Cloudflare Turnstile.
- **Origin allowlist + frame-ancestors** — §4.5 CSP + §4.6 embed
  app's `allowed_origins`.
- **Per-link revocation** with instant effect on new views — §4.13.
- **Replay protection via JTI** — §4.6 verification middleware.
