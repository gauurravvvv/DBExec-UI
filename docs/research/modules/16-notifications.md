# 16 · Notifications

In-app bell already in DBExec. Extend with categories + delivery
channels + per-user preferences.

## Categories

```ts
type NotificationCategory =
  | 'group_added'
  | 'group_removed'
  | 'mention'                          // @username in a comment
  | 'subscription_delivered'
  | 'alert_fired'
  | 'dataset_failed'
  | 'permission_granted'
  | 'dashboard_shared'
  | 'comment_replied';
```

## Schema delta

```sql
ALTER TABLE notification
  ADD COLUMN category varchar(32) NOT NULL,
  ADD COLUMN url text,                       -- in-app target route
  ADD COLUMN read_at timestamptz,
  ADD COLUMN priority smallint NOT NULL DEFAULT 1;

CREATE TABLE notification_preference (
  user_id     uuid NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  category    varchar(32) NOT NULL,
  in_app      boolean NOT NULL DEFAULT true,
  email       boolean NOT NULL DEFAULT false,
  slack       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, category)
);
```

## Dispatch

```ts
async function notify(opts: {
  userId: string;
  category: NotificationCategory;
  payload: Record<string, unknown>;
  url?: string;
}) {
  const prefs = await NotificationPreference.findBy({ userId: opts.userId, category: opts.category });
  const inApp = prefs?.inApp ?? true;
  const email = prefs?.email ?? false;
  const slack = prefs?.slack ?? false;

  if (inApp) await Notification.insert({ ...opts });
  if (email) await emailService.sendTemplated({ /* ... */ });
  if (slack) await slackPostDM(/* ... */);
}
```

## Real-time delivery (FE)

- Long-poll today.
- Upgrade to **SSE** (Server-Sent Events): `/notifications/stream`.
- Or **WebSocket** if we already have one for live dashboards.

```ts
// FE: src/app/core/services/notification.service.ts
const es = new EventSource('/api/v1/notifications/stream', { withCredentials: true });
es.onmessage = (msg) => {
  const n = JSON.parse(msg.data);
  this.items.update(prev => [n, ...prev]);
  this.unreadCount.update(c => c + 1);
};
```

## UI

- Bell badge with unread count.
- Dropdown grouped by category.
- "Mark all read" + per-row "Mark read".
- Settings → Notifications: matrix of category × channel toggles.

## Tests

- **NOT-H-01** — group_added notification appears for member
- **NOT-H-02** — mark-all-read resets badge
- **NOT-N-01** — user can't read another user's notification
- **NOT-E-01** — SSE reconnects after network blip

## Appendix · Review additions

- **Push notifications** (browser Web Push + mobile via FCM/APNs).
- **Quiet hours / DND** — per-user.
- **Bundling**: 5 same-category events within 5 min → 1 bundle.
- **Email digest mode**: per-user toggle to bundle the day's
  notifications into one email.
- **Mark as unread** (current API only marks read).
- **Filter / search in notification list**.
- **Per-org template overrides** for branded notification emails.

### Schema delta

```sql
ALTER TABLE notification
  ADD COLUMN bundle_key varchar(128),
  ADD COLUMN unread_after_read_at timestamptz;

CREATE TABLE user_dnd (
  user_id  uuid PRIMARY KEY,
  enabled  boolean NOT NULL DEFAULT false,
  from_time time, to_time time,
  timezone varchar(64)
);

ALTER TABLE notification_preference
  ADD COLUMN digest varchar(16) NOT NULL DEFAULT 'off'; -- 'off'|'daily'|'weekly'
```

### Web Push (VAPID)

```ts
import webpush from 'web-push';
webpush.setVapidDetails('mailto:dev@dbexec.com', VAPID_PUB, VAPID_PRIV);

await webpush.sendNotification(subscription, JSON.stringify({
  title: 'New mention', body: 'Alice mentioned you in "Sales Q3"',
}));
```

### Test IDs

- NOT-BUNDLE-H-01 — 5 same-category events bundle into 1
- NOT-DND-H-01 — notification queued during quiet hours
- NOT-DIGEST-H-01 — daily digest summarises unread
- NOT-PUSH-H-01 — subscribed user receives push
- NOT-UNREAD-H-01 — mark-as-unread sets unread_after_read_at
