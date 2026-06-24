# 14 · Sharing & Embedding

## Modes

| Mode | Auth | Use case |
|---|---|---|
| Internal | DBExec JWT | Share with org users |
| Public link | Optional password | Marketing / customer reports |
| Signed embed (JWT) | Customer's app | Embedded analytics |

## Internal share

Extends RBAC. Add a "Shared with" pane on dashboards / analyses.

```sql
CREATE TABLE share (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  target_type     varchar(16) NOT NULL,  -- dashboard|analysis|dataset
  target_id       uuid NOT NULL,
  subject_type    varchar(16) NOT NULL,  -- user|group|role
  subject_id      uuid NOT NULL,
  permission      varchar(16) NOT NULL,  -- view|edit|own
  shared_by       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

Resolution: when loading an object, check ownership OR a `share` row
for the caller / their groups / their role.

## Public link

```sql
CREATE TABLE share_link (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  target_type     varchar(16) NOT NULL,
  target_id       uuid NOT NULL,
  short_code      varchar(16) NOT NULL UNIQUE,
  mode            varchar(16) NOT NULL,  -- public|password|embed
  password_hash   varchar(255),
  expires_at      timestamptz,
  view_count      bigint NOT NULL DEFAULT 0,
  allowed_domains text[],                -- CSP frame-ancestors
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          smallint NOT NULL DEFAULT 1
);
```

Public viewer route: `/public/:shortCode`. Embed route:
`/embed/:targetType/:id?token=<jwt>`.

## Signed embed JWT

```ts
function signEmbedToken(opts: {
  orgId: string;
  targetType: 'dashboard'|'analysis';
  targetId: string;
  externalUserId: string;
  permissions: string[];
  userAttributes?: Record<string, unknown>;
  ttlSecs?: number;
}): string {
  return jwt.sign({
    sub: opts.externalUserId,
    org: opts.orgId,
    target: { type: opts.targetType, id: opts.targetId },
    perms: opts.permissions,
    attrs: opts.userAttributes || {},
    iat: Math.floor(Date.now() / 1000),
  }, process.env.EMBED_SIGNING_SECRET!, {
    algorithm: 'HS256',
    expiresIn: opts.ttlSecs ?? 3600,
  });
}
```

Customer's backend mints the token; the embed iframe carries it.

### Customer integration snippet

```html
<iframe src="https://dbexec.example.com/embed/dashboard/abc?token=eyJ..."
        allow="fullscreen" referrerpolicy="no-referrer"
        style="width:100%;height:600px;border:0"></iframe>
```

Or via the embed SDK:

```ts
import { DBExecEmbed } from '@dbexec/embed';
new DBExecEmbed({
  host: 'https://dbexec.example.com',
  token: serverSignedToken,
}).mount('#dashboard-container', { type: 'dashboard', id: 'abc' });
```

### Embed CSP

Customer registers their domain in the share-link record. Server sends
`Content-Security-Policy: frame-ancestors <listed>` per request.

### User attributes for embed RLS

Customer's app signs the token with `attrs: { region: 'APAC' }`.
DBExec's RLS rules referencing `{{user.region}}` resolve from the
token's `attrs`. Per-tenant data isolation without seat licences.

## Tests

- **SH-INT-H-01** — share with group, group members can view
- **SH-LINK-H-01** — public link without password loads
- **SH-LINK-PWD-H-01** — public link with password prompts
- **SH-LINK-EXP-H-01** — expired link → 410 Gone
- **SH-EMBED-H-01** — JWT-signed iframe loads chrome-less view
- **SH-EMBED-RLS-H-01** — token attrs flow into RLS
- **SH-EMBED-CSP-N-01** — different host than allowlist → blocked
- **SH-EMBED-EXP-N-01** — expired JWT → 401

## Appendix · Review additions

### Concepts

- **Group-shareable links**: target a dynamic group, not just emails.
- **Granular embed permissions**: which visuals visible inside iframe.
- **Embed event API**: `onFilterChange`, `onDrillUp`, `onError`,
  `onRendered`.
- **Embed parameter override** from host via `postMessage`:
  `embed.applyFilter({...})`, `embed.resetFilters()`.
- **Theme injection through embed token** — customer's per-tenant
  theme baked into JWT `attrs.theme`.
- **Embed view analytics**: track per-link view count, time-spent,
  filter usage; surface in Share dialog.
- **Anti-scraping**: throttle per-link view rate.
- **Captcha gate** for public links above N views/hour.
- **Cookie-free embed** mode for stricter privacy (token in query
  string only, no Set-Cookie).
- **Public link revocation list** with creator notification.

### Schema delta

```sql
CREATE TABLE share_link_view_event (
  id          bigserial PRIMARY KEY,
  link_id     uuid NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  ip          inet,
  user_agent  varchar(512),
  country     varchar(64),
  duration_ms int,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON share_link_view_event (link_id, viewed_at DESC);

ALTER TABLE share_link
  ADD COLUMN theme_override jsonb,
  ADD COLUMN visible_visuals uuid[],
  ADD COLUMN allowed_domains text[],
  ADD COLUMN max_views_per_hour int;
```

### postMessage protocol

```ts
// iframe child emits
window.parent.postMessage({
  type: 'dbexec:event',
  event: 'filter-change',
  payload: state,
}, '*');

// host listens
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'dbexec:event') return;
  // route by e.data.event
});

// host pushes
iframe.contentWindow.postMessage({
  type: 'dbexec:command',
  command: 'apply-filter',
  payload: { region: 'APAC' },
}, '*');
```

### Test IDs

- SH-EVENT-H-01 — filter change inside iframe fires host callback
- SH-EMBED-VIS-H-01 — visible_visuals hides others
- SH-PUBLIC-CAPTCHA-N-01 — 50 views/hour triggers captcha
- SH-REVOKE-H-01 — revoked link returns 410 with friendly page
- SH-THEME-H-01 — token-injected theme applies inside iframe
