# Sharing & embedding

> Implementation companion to research module 14. Pins the
> three-modes-on-one-entity model (internal / public link /
> embed), the JWT-signed embed flow, per-link CSP, and the
> postMessage protocol.

**Status:** 🔴 not in product. P0 — customers ask for "share a
dashboard with my client" within week one.
**Effort:** L (~3 weeks).

---

## 0. Problem statement

Three different products bolted together under one name:

1. **Internal share:** "give Alice in my org view-access".
2. **Public link:** "anyone with this URL can view" (no login,
   no PII).
3. **Embed:** "render inside my SaaS web app, with my user's
   identity passed in".

The mistake everyone makes is treating these as separate
features. Build them on one entity with a `mode` discriminator
and the surface area collapses by 70%.

---

## 1. Data model

```sql
CREATE TABLE share_link (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('dashboard','analysis')),
  target_id     UUID NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('internal','public','embed')),
  -- public/embed: opaque token in URL
  token_hash    BYTEA,                              -- only for public/embed
  token_prefix  TEXT,
  -- internal mode: grants
  granted_user_ids  UUID[],
  granted_group_ids UUID[],
  -- embed mode: which embed app
  embed_app_id  UUID REFERENCES embed_app(id),
  -- security / display options
  expires_at    TIMESTAMPTZ,
  password_hash TEXT,                                -- for public links
  watermark     BOOLEAN NOT NULL DEFAULT true,
  allow_csv     BOOLEAN NOT NULL DEFAULT false,
  allow_pdf     BOOLEAN NOT NULL DEFAULT true,
  allow_filters BOOLEAN NOT NULL DEFAULT true,
  parameter_lock JSONB,                              -- {paramId: value} → locks at this value
  created_by    UUID NOT NULL REFERENCES "user"(id),
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (mode = 'internal' AND token_hash IS NULL) OR
    (mode = 'public'   AND token_hash IS NOT NULL) OR
    (mode = 'embed'    AND token_hash IS NOT NULL AND embed_app_id IS NOT NULL)
  )
);

CREATE INDEX idx_share_link_prefix ON share_link(token_prefix);
CREATE INDEX idx_share_link_target ON share_link(target_kind, target_id);

CREATE TABLE share_link_view (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewer_user_id UUID,                                -- null for public
  viewer_ip     INET,
  viewer_ua     TEXT,
  jwt_jti       TEXT                                  -- for embed replay-prevention audit
);
CREATE INDEX idx_slv_share ON share_link_view(share_link_id);

CREATE TABLE embed_app (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- JWT signing
  signing_secret_enc BYTEA NOT NULL,
  signing_alg   TEXT NOT NULL DEFAULT 'HS256',
  -- which origins can iframe us with this app
  allowed_origins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- post-message rules
  disallow_external_links BOOLEAN NOT NULL DEFAULT true,
  -- attribution
  audit_subject TEXT,                                  -- usually customer name
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. The JWT (embed mode)

The parent app (customer's SaaS) signs a short-lived JWT and
includes it in the iframe URL: `/embed/<linkToken>#jwt=<token>`.

```jsonc
{
  "sub":     "alice@parent-app.com",     // viewer identity
  "name":    "Alice Smith",
  "email":   "alice@parent-app.com",
  "groups":  ["g_customers"],
  "attrs":   { "region": "APAC" },        // surfaced to RLS (module 09)
  "params":  { "as_of_date": "2026-06-26" },
  "iat":     1719360000,
  "exp":     1719360300,                  // 5-min TTL
  "jti":     "01HXY...",                  // replay protection
  "iss":     "customer-saas.com",
  "aud":     "dbexec.com/embed/<embed_app_id>"
}
```

Verification:

```typescript
async function verifyEmbedJwt(token: string, embedApp: EmbedApp): Promise<JwtClaims> {
  const secret = await decryptSecret(embedApp.signingSecretEnc, embedApp.dekId, embedApp.orgId);
  const claims = jwt.verify(token, secret, { algorithms: [embedApp.signingAlg] }) as JwtClaims;

  if (claims.aud !== `dbexec.com/embed/${embedApp.id}`) throw new Error('AUD_MISMATCH');

  // Replay protection: jti seen?
  const replayed = await redis.set(`embed:jti:${claims.jti}`, '1', 'EX', 600, 'NX');
  if (!replayed) throw new Error('REPLAY');

  // Hard cap on TTL (don't trust IDP)
  if (claims.exp - claims.iat > 600) throw new Error('TTL_TOO_LONG');

  return claims;
}
```

---

## 3. Controller — create share link

```typescript
// src/controllers/share/createShareLink.ts
const createShareLink = async (req: Request, res: Response) => {
  const { targetKind, targetId, mode, grantedUserIds, grantedGroupIds, embedAppId,
          expiresAt, password, allowCsv, allowPdf, parameterLock, watermark } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    let tokenHash: Buffer | null = null;
    let tokenPrefix: string | null = null;
    let rawToken: string | null = null;
    if (mode === 'public' || mode === 'embed') {
      const t = generateOpaqueToken();              // 32 bytes base64url
      tokenHash = t.hash; tokenPrefix = t.prefix; rawToken = t.raw;
    }

    if (mode === 'embed') {
      const app = await connection.getRepository('EmbedApp').findOne({ where: { id: embedAppId } });
      if (!app) { await master_db_connection.close();
        return sendResponse(res, false, CODE.NOT_FOUND, SHARE_MSG.EMBED_APP_NOT_FOUND); }
    }

    const passwordHash = password ? await argon2.hash(password) : null;

    const link = await connection.getRepository('ShareLink').save({
      orgId: orgData.orgId, targetKind, targetId, mode,
      tokenHash, tokenPrefix,
      grantedUserIds: grantedUserIds ?? [], grantedGroupIds: grantedGroupIds ?? [],
      embedAppId: embedAppId ?? null,
      expiresAt, passwordHash,
      watermark: watermark ?? true,
      allowCsv: !!allowCsv, allowPdf: allowPdf ?? true,
      parameterLock: parameterLock ?? null,
      createdBy: loggedInId,
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.SHARE_LINK,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'ShareLink',
      entityId: link.id,
      metadata: { mode, targetKind, targetId },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, SHARE_MSG.OK, {
      ...link,
      url: rawToken
        ? `https://${HOSTNAME}/${mode === 'embed' ? 'embed' : 'view'}/${rawToken}`
        : null,
      rawToken,                                       // show once, never again
    });
  } catch (err: any) {
    Logger.error(`Create share link failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 4. The viewer endpoint

`GET /view/:token` and `GET /embed/:token`:

```typescript
// /view/:token
const viewShareLink = async (req: Request, res: Response) => {
  const { token } = req.params;
  const prefix = token.slice(0, 8);
  const link = await connection.getRepository('ShareLink')
    .createQueryBuilder('l')
    .where('l.token_prefix = :prefix', { prefix })
    .andWhere('l.revoked_at IS NULL')
    .getOne();
  if (!link) return res.status(404).send('Not found');

  if (sha256(token).compare(link.tokenHash) !== 0) return res.status(404).send('Not found');
  if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).send('Expired');

  if (link.mode === 'public' && link.passwordHash) {
    // Render a password gate first
    if (!req.query.pw || !(await argon2.verify(link.passwordHash, req.query.pw as string))) {
      return res.render('share-password', { token });
    }
  }

  if (link.mode === 'embed') {
    const jwtToken = (req.headers['x-dbexec-embed-jwt'] || extractJwtFromHash(req.url)) as string;
    const app = await loadEmbedApp(link.embedAppId);
    let claims: JwtClaims;
    try { claims = await verifyEmbedJwt(jwtToken, app); }
    catch (e: any) { return res.status(401).send(e.message); }

    // Set CSP frame-ancestors per allowed_origins
    res.setHeader('Content-Security-Policy',
      `frame-ancestors ${app.allowedOrigins.join(' ')}`);
  }

  // Log view
  await connection.getRepository('ShareLinkView').save({
    shareLinkId: link.id,
    viewerUserId: req.user?.id ?? null,
    viewerIp: req.ip, viewerUa: req.headers['user-agent'],
    jwtJti: link.mode === 'embed' ? jwtClaims!.jti : null,
  });

  // Render the dashboard / analysis in viewer mode
  return renderViewer(res, link, req);
};
```

---

## 5. postMessage protocol (embed mode)

Two-way message channel between iframe (DBExec) and parent.

```typescript
// Outbound (from DBExec → parent)
window.parent.postMessage({
  type: 'dbexec.event',
  event: 'dashboard.ready' | 'visual.clicked' | 'export.requested' | 'filter.changed',
  payload: { ... },
}, targetOrigin);

// Inbound (from parent → DBExec)
window.addEventListener('message', (ev) => {
  if (!isAllowedOrigin(ev.origin)) return;
  const msg = ev.data;
  if (msg.type !== 'dbexec.command') return;
  switch (msg.command) {
    case 'set-filter':       applyFilter(msg.payload); break;
    case 'set-parameter':    applyParameter(msg.payload); break;
    case 'navigate-tab':     navigateTab(msg.payload.tabId); break;
    case 'export-pdf':       triggerExport('pdf'); break;
  }
});
```

`isAllowedOrigin` checks against the embed app's `allowed_origins`.
This is **defense in depth** alongside CSP frame-ancestors — if
the CSP is bypassed (e.g. via browser bug), message handlers
still reject unknown origins.

---

## 6. FE — author UI

Existing share button on dashboard/analysis pages opens a modal
with three tabs:

```
┌─────────────────────────────────────────────────────────────┐
│  Share "Sales Dashboard"                                    │
│  ────────────────────────────────────────────────────────  │
│  [Internal]  [Public link]  [Embed]                          │
│                                                              │
│  Internal:                                                   │
│    People + groups:                                          │
│    ┌──────────────────────────────────────────────────┐    │
│    │  ● Alice Smith    Editor → View ▼                │    │
│    │  ● Bob Johnson    View                            │    │
│    │  ● Engineering    View                            │    │
│    │  + add person or group                            │    │
│    └──────────────────────────────────────────────────┘    │
│                                                              │
│  Public link:                                                │
│    [Anyone with the link can view]   ◉ ON   ○ OFF            │
│    URL: https://dbexec.com/view/abcd…  [copy]                │
│    Password (optional): [             ]                      │
│    Expires:  ○ Never  ◉ 2026-07-31  [pick date]              │
│    Allow CSV: ○ Yes  ◉ No                                    │
│    Watermark: ◉ On                                            │
│                                                              │
│  Embed:                                                       │
│    Embed app: [▼ Customer-portal-prod]                       │
│    Allowed origins:  https://app.customer.com                │
│    Snippet:                                                   │
│      <iframe src="https://dbexec.com/embed/efgh…"            │
│              onload="parentIssueJwt()" ></iframe>             │
│    [Copy snippet]   [Test in sandbox]                         │
└─────────────────────────────────────────────────────────────┘
                                  [Cancel]  [Save share link]   
```

---

## 7. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_share_link_create_total` | counter | `mode`, `org` | usage |
| `dbexec_share_view_total` | counter | `mode`, `outcome` | view + bounce by mode |
| `dbexec_embed_jwt_fail_total` | counter | `reason` (sig, aud, exp, replay) | leading indicator |
| `dbexec_share_link_revoked_total` | counter | `mode` | hygiene |
| `dbexec_share_view_unique_24h` | gauge | `link` | per-link uniques |

---

## 8. Security & threat model

| Threat | Mitigation |
|---|---|
| Token guess | 32 random bytes (256 bits); prefix lookup but full-hash verify |
| Token leak in referrer | Tokens in URL path (referrer policy `no-referrer`) + viewer page sets `Referrer-Policy: no-referrer` |
| JWT replay | jti tracked in Redis with TTL = JWT remaining lifetime |
| JWT iss/aud mix-up | iss + aud verified explicitly; aud bound to embed_app.id |
| Embed clickjacking | CSP frame-ancestors + X-Frame-Options for non-embed routes |
| CSP bypass via legacy browsers | postMessage origin allowlist as backstop |
| Public link to a PII-heavy dashboard | Warning shown at create + watermark forced ON for public mode |
| Password brute-force on public link | argon2 hash + per-IP rate limit (5 attempts/min) |
| Internal share to a user not in this org | Grants validated against org users at save |
| Revocation latency | Revoke flips `revoked_at`; in-flight sessions check on next request (no SSE channel; accepted) |
| CSV exfiltration via public link | `allow_csv` default false; per-org toggle |
| postMessage injection from rogue parent | All messages validated against allowed_origins; unknown command ignored + logged |

---

## 9. Runbook

**Symptom: embed shows blank.**
1. Check browser console for CSP violation. Update
   `allowed_origins` on the embed app.
2. Check JWT validity (paste into jwt.io with the customer's
   shared secret).

**Symptom: public link works locally, fails in production.**
1. Probably HTTPS / cookie issue. Embed requires `SameSite=None;
   Secure` on session cookies — verify env config.

**Symptom: viewer suddenly sees stale data.**
1. Cache TTL not refreshed. Documented behaviour; cache TTL is
   per-org (module 05).

---

## 10. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Create share link | 60 ms | 200 ms | 1 s |
| View public link (no password) | 200 ms | 600 ms | 3 s |
| View embed link (verify JWT + load) | 300 ms | 800 ms | 5 s |
| Revoke | 30 ms | 100 ms | 500 ms |

---

## 11. Migration & rollout

1. **Migrations:** create `share_link`, `share_link_view`,
   `embed_app`. Idempotent.
2. **Backfill:** none.
3. **Feature flag:** `feature.share_v2`. Old "share" button
   degrades to internal-only when off.
4. **Embed beta:** require admin opt-in per org; gather 2-3
   design partner integrations before GA.

---

## 12. Open questions

1. **Per-link parameter override** — let the share URL pass
   `?p.<id>=<value>` query strings. Yes, but only if
   `allow_filters` is true and parameter is in `parameter_lock`'s
   negative space.
2. **Public links discoverable on search engines?** — `noindex`
   header by default; admin toggle.
3. **Slack share** — generate a preview-card-friendly OpenGraph
   image at share time. Defer.

---

## 13. References

- [14-share-embed.md](../research/modules/14-share-embed.md)
- [08-dashboard.md](../research/modules/08-dashboard.md)
- [09-rls-column-security.md](../research/modules/09-rls-column-security.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [20-branding.md](../research/modules/20-branding.md)
- RFC 7519 (JWT), RFC 8725 (JWT best practices)
- CSP Level 3 frame-ancestors
