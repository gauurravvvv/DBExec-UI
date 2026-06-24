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
