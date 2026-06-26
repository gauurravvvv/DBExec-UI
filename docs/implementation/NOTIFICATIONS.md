# Notifications

> Implementation companion to research module 16. Pins the
> `notify()` service, per-user-per-category preferences,
> bundling, DND with critical-override, Web Push, and SSE
> real-time stream.

**Status:** 🔴 not in product.
**Effort:** M (~2 weeks).

---

## 0. Problem statement

DBExec needs a unified notification system that:

- Routes events from anywhere (scheduling, alerts, comments,
  shares, admin actions) into a queue.
- Respects per-user preferences per category (in-app / email /
  push / Slack / off).
- Bundles "10 things from one source in 5 min" into a single
  notification.
- Honours Do-Not-Disturb windows + critical override.
- Delivers in real-time via SSE for an open browser tab.
- Cleans up Web Push subscriptions when the browser revokes
  permission (HTTP 410).

---

## 1. Data model

```sql
CREATE TABLE notification (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,                       -- 'alert' | 'subscription' | 'share' | 'comment' | 'admin' | 'system'
  severity      TEXT NOT NULL DEFAULT 'info',        -- 'info' | 'warning' | 'critical'
  source_kind   TEXT,                                  -- 'subscription' | 'alert' | 'share_link' | …
  source_id     UUID,
  title         TEXT NOT NULL,
  body          TEXT,
  link          TEXT,                                  -- deep-link into app
  metadata      JSONB,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  bundle_id     UUID,                                  -- groups bundled siblings
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread ON notification(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_bundle ON notification(bundle_id) WHERE bundle_id IS NOT NULL;

CREATE TABLE notification_preference (
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  channel       TEXT NOT NULL,                         -- 'in_app' | 'email' | 'push' | 'slack'
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category, channel)
);

CREATE TABLE user_dnd (
  user_id       UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  is_enabled    BOOLEAN NOT NULL DEFAULT false,
  start_local   TIME,                                   -- e.g. 18:00
  end_local     TIME,                                   -- e.g. 09:00
  weekend_off   BOOLEAN NOT NULL DEFAULT true,
  critical_override BOOLEAN NOT NULL DEFAULT true       -- critical still rings during DND
);

CREATE TABLE push_subscription (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0
);
```

---

## 2. The `notify()` service

The single entry point. **Everything** that wants to notify
calls this. No bypasses.

```typescript
// src/services/notify/notify.ts
export interface NotifyArgs {
  orgId: string;
  userId: string;
  category: 'alert' | 'subscription' | 'share' | 'comment' | 'admin' | 'system';
  severity?: 'info' | 'warning' | 'critical';
  sourceKind?: string;
  sourceId?: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: any;
  bundleKey?: string;    // if set, looks for an existing bundle within 5 min
}

export async function notify(args: NotifyArgs, ctx: { connection: Connection }): Promise<void> {
  const sev = args.severity ?? 'info';

  // 1. Bundle lookup
  let bundleId: string | null = null;
  if (args.bundleKey) {
    const existing = await ctx.connection.getRepository('Notification')
      .createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: args.userId })
      .andWhere('n.category = :cat', { cat: args.category })
      .andWhere(`n.metadata->>'bundleKey' = :bk`, { bk: args.bundleKey })
      .andWhere('n.created_at > NOW() - INTERVAL \'5 minutes\'')
      .orderBy('n.created_at', 'DESC')
      .getOne();
    if (existing) bundleId = existing.bundleId ?? existing.id;
  }

  // 2. Insert notification row
  const notif = await ctx.connection.getRepository('Notification').save({
    orgId: args.orgId, userId: args.userId,
    category: args.category, severity: sev,
    sourceKind: args.sourceKind, sourceId: args.sourceId,
    title: args.title, body: args.body, link: args.link,
    metadata: { ...args.metadata, bundleKey: args.bundleKey },
    bundleId, isRead: false,
  });

  // 3. Per-channel dispatch (in parallel)
  const prefs = await loadPreferences(ctx.connection, args.userId, args.category);
  const dnd = await loadDnd(ctx.connection, args.userId);
  const inDnd = isInDndWindow(dnd, new Date());
  const allowDnd = inDnd && !(dnd.criticalOverride && sev === 'critical');

  const dispatchers: Array<() => Promise<void>> = [];
  if (prefs.in_app && !allowDnd) dispatchers.push(() => publishSse(args.userId, notif));
  if (prefs.email && !allowDnd) dispatchers.push(() => emailNotification(notif));
  if (prefs.push && !allowDnd) dispatchers.push(() => webPushNotification(args.userId, notif));
  if (prefs.slack && !allowDnd) dispatchers.push(() => slackNotification(notif));

  await Promise.allSettled(dispatchers.map(fn => fn()));
}
```

---

## 3. Bundling

The 5-min window collapses noise. Example: a user gets 10
"alert.triggered" notifications from the same alert. We surface
**one** notification with body "Alert X triggered 10 times in 5
minutes" instead of ten.

Bundle key examples:

- Alert: `alert:<alertId>`.
- Subscription: `sub:<subId>` (rare; subscriptions don't usually
  re-fire that fast).
- Share view: `share:<shareLinkId>` (multiple views of the same
  link).
- Comment: `comment:<dashboardId>` (multiple comments on one
  dashboard).

The first notification in a bundle inserts; subsequent ones
update the existing row's `body` ("triggered N times") and
`metadata.events[]`. SSE pushes an `update` for the bundle's id;
push notifications respect a 5-min cooldown per bundle.

---

## 4. DND logic

```typescript
function isInDndWindow(dnd: UserDnd, now: Date): boolean {
  if (!dnd?.isEnabled) return false;
  if (dnd.weekendOff && (now.getDay() === 0 || now.getDay() === 6)) return true;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(dnd.startLocal);
  const end = timeToMinutes(dnd.endLocal);
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;             // crosses midnight
}
```

User's local timezone comes from `user.timezone` (set via
profile or geolocation hint at first login).

---

## 5. SSE stream

```typescript
// GET /notify/stream
app.get('/notify/stream', AuthMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userId = req.user!.id;
  const channelKey = `notify:${userId}`;

  // Heartbeat every 25 s so proxies don't close
  const hb = setInterval(() => res.write(':heartbeat\n\n'), 25_000);

  // Subscribe to Redis pub/sub for this user
  const sub = redis.duplicate();
  await sub.subscribe(channelKey);
  sub.on('message', (_chan: string, msg: string) => {
    res.write(`event: notification\ndata: ${msg}\n\n`);
  });

  req.on('close', () => {
    clearInterval(hb);
    sub.unsubscribe(channelKey).catch(() => undefined);
    sub.quit().catch(() => undefined);
  });
});

export async function publishSse(userId: string, notification: any): Promise<void> {
  await redis.publish(`notify:${userId}`, JSON.stringify(notification));
}
```

Redis pub/sub lets multiple API instances share the stream — if
the user has the tab open against instance A and a worker on
instance B emits, it lands.

---

## 6. Web Push

```typescript
// src/services/notify/webPush.ts
import webPush from 'web-push';

webPush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function webPushNotification(userId: string, notif: any): Promise<void> {
  const subs = await loadPushSubscriptions(userId);
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: notif.title,
          body:  notif.body,
          icon:  '/icon-192.png',
          badge: '/badge-72.png',
          data:  { link: notif.link, id: notif.id },
        }),
        { TTL: 60 * 60 * 24 },
      );
      await markUsed(sub.id);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await deletePushSubscription(sub.id);          // browser unsubscribed
      } else {
        await incrementFailureCount(sub.id);
        if (sub.failureCount > 5) await deletePushSubscription(sub.id);
      }
    }
  }
}
```

---

## 7. Controller — preferences

```typescript
// src/controllers/notify/updatePreferences.ts
const updatePreferences = async (req: Request, res: Response) => {
  const { preferences } = req.body;        // [{category, channel, isEnabled}, ...]
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    await connection.transaction(async (tx: any) => {
      for (const p of preferences) {
        await tx.query(`
          INSERT INTO notification_preference (user_id, category, channel, is_enabled)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, category, channel) DO UPDATE SET is_enabled = EXCLUDED.is_enabled
        `, [loggedInId, p.category, p.channel, p.isEnabled]);
      }
    });
    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.NOTIFICATION,
      action: AUDIT_ACTIONS.UPDATE_PREFERENCES,
      entityName: 'User', entityId: loggedInId,
      metadata: { count: preferences.length },
    });
    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, NOTIFY_MSG.PREFS_OK);
  } catch (err: any) {
    Logger.error(`Update preferences failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 8. FE — notification centre

Top-bar bell icon with unread badge. Click opens a slide-over.

```
┌─────────────────────────────────────────────┐
│ Notifications              [Mark all read] │
│ ─────────────────────────────────────────  │
│  ● Alert: Revenue WoW dropped 5%            │
│    fired 10 times in last hour              │
│    2 min ago  →                              │
│                                              │
│  ● Subscription delivered: Weekly KPI       │
│    PDF · 8 pages · to your inbox            │
│    1 hour ago  →                             │
│                                              │
│  ○ Comment from Bob on "Sales Q2"           │
│    "Looks like the APAC line is broken…"    │
│    2 hours ago  →                            │
│                                              │
│  [View all]      [Preferences]              │
└─────────────────────────────────────────────┘
```

Components:
- `notification-bell/` — badge counter + slide-over trigger
- `notification-list/` — virtualised list
- `notification-row/` — title + body + link + actions
- `notification-preferences/` — per-category matrix
- `dnd-settings/` — time window picker + critical override

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_notify_emitted_total` | counter | `category`, `severity` | volume |
| `dbexec_notify_delivered_total` | counter | `channel`, `outcome` | per-channel success |
| `dbexec_notify_bundled_total` | counter | `category` | bundling effectiveness |
| `dbexec_notify_dnd_suppressed_total` | counter | `category` | DND impact |
| `dbexec_notify_sse_streams_open` | gauge | — | concurrent SSE connections |
| `dbexec_notify_webpush_expired_total` | counter | — | 410/404 cleanup |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| User A reads user B's notifications | All endpoints filter by `user_id = req.user.id`; no cross-user reads |
| Push subscription stolen → can spoof user's device | Endpoint URL is bound to the push provider; stealing it lets attacker send pushes to that device, but VAPID-signed and content is benign |
| Email-based phishing via notify | Email templates pin DBExec headers; link always to our domain |
| Slack token leak | Per-user Slack auth uses OAuth; tokens KMS-wrapped; revoke endpoint |
| SSE used as XHR-CORS bypass | Same-origin cookie auth; CORS denied for cross-origin |
| Storage growth (huge notification table) | Cron purge: read notifications older than 90 days; unread older than 1 year |
| Bundle key collision across users | Bundle scoped to `(user_id, category, bundleKey)` |
| Web Push payload encryption | `web-push` library handles AES-128-GCM per spec |

---

## 11. Runbook

**Symptom: notifications missing.**
1. Check DND. User likely flipped it on.
2. Check preferences. Channel for category off?
3. SSE stream alive? `dbexec_notify_sse_streams_open`.

**Symptom: Web Push not working.**
1. VAPID keys rotated? Subscriptions tied to old key fail.
   Re-subscribe all users (one-shot migration).
2. `dbexec_notify_webpush_expired_total` rising = healthy
   cleanup, not a problem.

**Symptom: bundles not collapsing.**
1. Caller didn't set `bundleKey`. Audit source services and add.

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| notify() end-to-end | 30 ms | 100 ms | 500 ms |
| SSE event delivery | 20 ms | 80 ms | 500 ms |
| Web Push dispatch (10 subs) | 200 ms | 800 ms | 5 s |
| Notification list page (50 rows) | 30 ms | 100 ms | 1 s |

---

## 13. Migration & rollout

1. **Migrations:** create `notification`, `notification_preference`,
   `user_dnd`, `push_subscription`.
2. **Backfill:** none.
3. **Feature flag:** `feature.notifications_v2`.
4. **Preference seeding:** new users get default prefs at sign-up;
   existing users get defaults on first interaction.
5. **Channel rollout order:** in-app → email → push → Slack.

---

## 14. Open questions

1. **Mobile push via native app** — module 21 PWA covers Web
   Push; native iOS/Android apps want APNs/FCM. Defer to
   native-app phase.
2. **Digest mode** — instead of real-time, "send me a 9 AM
   daily digest". Add `notification_preference.digest_mode`
   and a morning cron. v2.
3. **Cross-team @mentions** — module 18 comments triggers a
   notify(); routing across orgs (shared dashboard
   collaborators) is the unknown.

---

## 15. References

- [16-notifications.md](../research/modules/16-notifications.md)
- [15-scheduling-alerts.md](../research/modules/15-scheduling-alerts.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [21-mobile-pwa.md](../research/modules/21-mobile-pwa.md)
- RFC 8030 (Web Push Protocol), RFC 8292 (VAPID)
- `web-push` npm package
