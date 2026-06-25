# 16 · Notifications

> The in-app bell. Persistent per-user message store with delivery
> across in-app, email, push, and SMS channels. Where modules 15
> (subscriptions/alerts) and 14 (share-link views) emit signals,
> this module is where users actually *see* them.
>
> Sister modules:
> [15 · Scheduling](15-scheduling-alerts.md) (the emitter),
> [21 · Mobile / PWA](21-mobile-pwa.md) (web push channel),
> [10 · Auth](10-auth-rbac-sso.md) (per-user preferences).

**Depends on:** Auth (10), Scheduling (15), Dashboard (08)
**Unblocks:** "Notify me when..." UX patterns, web push, mobile push
**Maturity:** 🟡 in-app bell exists; channels + preferences missing

---

## 1. Industry baseline

| Tool | In-app | Email | Web Push | Mobile Push | Per-user prefs | Bundling |
|---|---|---|---|---|---|---|
| **Notion** | ✓ bell | ✓ digest by default | ✓ | ✓ | rich (per-doc) | ✓ daily |
| **Slack** | ✓ unread badge | optional digest | ✓ | ✓ | per-workspace + per-channel | ✓ "you missed" |
| **Linear** | ✓ inbox | ✓ digest | ✓ | ✓ | per-team + per-project | ✓ |
| **Figma** | ✓ | digest | ✓ | ✓ | per-file | ✓ |
| **GitHub** | ✓ inbox | ✓ per-thread | ✓ | ✓ | per-repo + per-thread | ✓ |
| **Looker** | basic bell | per-alert | ✗ | ✗ | minimal | ✗ |
| **Metabase** | bell | per-pulse | ✗ | ✗ | minimal | ✗ |

**The patterns to copy:**

- **Bundle by source**. 20 alerts on the same revenue dashboard in
  an hour become one "20 alerts on Revenue (Q3)" notification, not
  20 line items.
- **Per-user, per-category preferences**. Not all notifications are
  equal — "dataset refresh completed" can go straight to email
  digest; "alert: production-revenue-collapsed" should bypass quiet
  hours.
- **DND / quiet hours** at the user level, not the source. Same
  alert may notify Alice now and Bob tomorrow morning.
- **Web Push** for browser tabs that aren't focused. Mobile push
  for the PWA. Both off by default; explicit opt-in.
- **Real-time delivery** via WebSocket / SSE; client renders the
  toaster the moment the row lands.

## 2. DBExec today

- Simple `notification` table with `(user_id, message, read_at)`.
- Bell icon in the header showing unread count + a dropdown of
  recent notifications.
- No categories. No channels (only in-app). No per-user prefs.
  No bundling. No real-time push.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| NTF-G01 | Category enum (`dataset.refreshed`, `alert.fired`, etc.) | P0 | S |
| NTF-G02 | Per-user-per-category preference rows | P0 | M |
| NTF-G03 | Email channel from notification | P0 | S |
| NTF-G04 | Web Push API integration | P1 | M |
| NTF-G05 | Mobile Push (FCM / APNS) | P2 | L |
| NTF-G06 | Bundling by source + time window | P1 | M |
| NTF-G07 | DND / quiet hours per user | P1 | S |
| NTF-G08 | Daily digest (combine missed) | P1 | M |
| NTF-G09 | Real-time delivery (WebSocket or SSE) | P0 | M |
| NTF-G10 | Bell badge unread count (live) | P0 | S |
| NTF-G11 | Per-notification CTA URL | P0 | S |
| NTF-G12 | Snooze / mute by source | P1 | S |
| NTF-G13 | Mark-all-read action | P0 | S |
| NTF-G14 | Archive / clear-old jobs | P1 | S |
| NTF-G15 | Notification preferences UI | P0 | M |
| NTF-G16 | i18n notification templates | P1 | S |
| NTF-G17 | "Notify me about X" subscribable surfaces | P2 | M |

## 4. Target architecture

### 4.1 Three-layer model

```
┌─────────────────────────────────────────────────┐
│ Emitter (modules 13, 14, 15, 18, ...)            │
│ — Calls notify({ userId, category, payload })    │
└─────────────────────────┬───────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│ Notification service                            │
│ — Resolves user preferences                     │
│ — Bundles if applicable                         │
│ — Writes Notification row                       │
│ — Dispatches to enabled channels                │
└──┬──────────────┬─────────────────┬─────────────┘
   ▼              ▼                 ▼
┌──────┐    ┌────────┐         ┌──────────┐
│ in-app│    │ email  │         │ web push │
│ bell  │    │ (SMTP) │         │ (VAPID)  │
└──────┘    └────────┘         └──────────┘
   ▲
   │  SSE channel
┌──┴──────┐
│ Browser │
└─────────┘
```

### 4.2 Schema

```sql
-- migration: 2026-10-XX_notifications.sql

-- (existing notification table extended)
ALTER TABLE notification
  ADD COLUMN category varchar(64) NOT NULL DEFAULT 'general',
  ADD COLUMN source_type varchar(32),     -- dashboard | analysis | dataset | ...
  ADD COLUMN source_id uuid,
  ADD COLUMN bundle_key varchar(255),      -- for in-window merging
  ADD COLUMN payload jsonb,                 -- structured data; template renders it
  ADD COLUMN url text,                      -- CTA link
  ADD COLUMN severity varchar(16) NOT NULL DEFAULT 'info',
  ADD COLUMN read_at timestamptz,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN delivered_via jsonb;           -- ['in_app', 'email', 'push']

CREATE INDEX notification_user_unread
  ON notification (user_id, created_on DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX notification_bundle
  ON notification (user_id, bundle_key, created_on DESC)
  WHERE bundle_key IS NOT NULL;

-- Per-user-per-category preference
CREATE TABLE notification_preference (
  user_id       uuid NOT NULL,
  category      varchar(64) NOT NULL,
  in_app        boolean NOT NULL DEFAULT true,
  email         boolean NOT NULL DEFAULT false,
  push          boolean NOT NULL DEFAULT false,
  sms           boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, category)
);

-- Quiet hours / DND per user
CREATE TABLE user_dnd (
  user_id              uuid PRIMARY KEY,
  enabled              boolean NOT NULL DEFAULT false,
  quiet_hours_start    time,                  -- e.g. '22:00'
  quiet_hours_end      time,                  -- e.g. '07:00'
  quiet_days           int[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],  -- 0=Sun..6=Sat
  timezone             varchar(64) NOT NULL DEFAULT 'UTC',
  full_dnd_until       timestamptz,           -- override; full silence
  override_for_critical boolean NOT NULL DEFAULT true   -- still deliver critical
);

-- Web Push subscriptions per user per device
CREATE TABLE push_subscription (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  endpoint    text NOT NULL,
  keys        jsonb NOT NULL,                 -- {p256dh, auth}
  user_agent  varchar(512),
  created_on  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
```

### 4.3 Notification categories

```ts
// src/shared/constants/notification.categories.ts
export const NOTIFICATION_CATEGORIES = [
  // Data ops
  'dataset.refreshed',
  'dataset.failed',
  'dataset.uploaded',

  // Visualisation
  'dashboard.published',
  'dashboard.shared_with_you',
  'dashboard.comment_mentioned',

  // Alerts & subscriptions
  'alert.fired',
  'alert.resolved',
  'subscription.delivered',
  'subscription.failed',

  // Sharing
  'share.public_link_viewed',          // notify owner of public-link views
  'share.embed_token_revoked',

  // Auth / security
  'security.new_device_login',
  'security.password_changed',
  'security.suspicious_activity',
  'security.mfa_enabled',

  // Admin
  'admin.new_user_invited',
  'admin.role_changed',
  'admin.quota_warning',
  'admin.quota_exceeded',

  // Export
  'export.completed',
  'export.failed',

  // System
  'system.maintenance',
  'system.announcement',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
```

Each category carries a default preference (e.g. security.* defaults
to all-channels-on; dataset.refreshed defaults to in-app-only).

### 4.4 `notify()` service

```ts
// src/shared/services/notifications/notify.service.ts
import { webpush } from './webpush.singleton';

export interface NotifyArgs {
  userId: string;
  category: NotificationCategory;
  payload: Record<string, unknown>;
  bundleKey?: string;        // groups in-window deliveries
  url?: string;              // CTA link
  severity?: 'info' | 'warning' | 'critical';
  sourceType?: string;
  sourceId?: string;
}

export async function notify(args: NotifyArgs) {
  // 1. Resolve preferences (with category defaults)
  const pref = await loadPreference(args.userId, args.category);

  // 2. Resolve DND
  const dnd = await loadDnd(args.userId);
  const inDnd = dnd?.enabled && isInQuietWindow(dnd);
  const criticalOverride = args.severity === 'critical' && dnd?.overrideForCritical;
  const dndBlocks = inDnd && !criticalOverride;

  // 3. Bundle? If a recent unread notification has the same
  //    bundle_key within 5 minutes, merge into that one rather than
  //    create a new row.
  let notification: Notification;
  if (args.bundleKey) {
    const recent = await master_db_connection.getRepository(Notification)
      .findOne({
        where: {
          userId: args.userId,
          bundleKey: args.bundleKey,
          readAt: IsNull(),
          createdOn: MoreThan(new Date(Date.now() - 5 * 60_000)),
        },
        order: { createdOn: 'DESC' },
      });
    if (recent) {
      // Merge: update payload count + timestamps
      recent.payload = mergePayload(recent.payload as any, args.payload);
      await master_db_connection.getRepository(Notification).save(recent);
      notification = recent;
    } else {
      notification = await insertNotification(args, pref, dndBlocks);
    }
  } else {
    notification = await insertNotification(args, pref, dndBlocks);
  }

  // 4. Dispatch to enabled channels
  const deliveredVia: string[] = ['in_app'];

  if (!dndBlocks) {
    if (pref.email)  { await sendEmail(notification);  deliveredVia.push('email'); }
    if (pref.push)   { await sendWebPush(notification); deliveredVia.push('push'); }
    if (pref.sms)    { await sendSms(notification);     deliveredVia.push('sms'); }
  } else {
    // Queue for daily digest
    await DigestQueue.insert({ userId: args.userId, notificationId: notification.id });
  }

  await Notification.update(notification.id, { deliveredVia });

  // 5. SSE push for real-time bell update
  sse.publish(args.userId, {
    kind: 'notification.new',
    notification: serialiseNotification(notification),
  });
}
```

### 4.5 Bundling merge logic

```ts
function mergePayload(existing: any, incoming: any): any {
  // Default merge strategy: increment count, keep latest timestamp,
  // record all incoming as a list of "instances".
  return {
    ...existing,
    count: (existing.count ?? 1) + 1,
    latestPayload: incoming,
    instances: [
      ...(existing.instances ?? [existing.latestPayload].filter(Boolean)),
      incoming,
    ].slice(-10),               // cap memory; keep last 10
    latestAt: new Date().toISOString(),
  };
}

// Bundle keys are constructed by the emitter; convention:
//   `<category>:<sourceId>`  → one bundle per source per category
// e.g. `alert.fired:dashboard-uuid` bundles all alerts on one
// dashboard within the 5-min window.
```

When the bell renders a bundled notification:

```
🔔  [Sales Q3 Review]
    8 alerts fired in the last 5 minutes
    Most recent: "Revenue below $10,000"
    [View dashboard]
```

### 4.6 DND / quiet hours

```ts
function isInQuietWindow(dnd: UserDnd): boolean {
  if (dnd.fullDndUntil && dnd.fullDndUntil > new Date()) return true;
  if (!dnd.quietHoursStart || !dnd.quietHoursEnd) return false;

  const tz = dnd.timezone || 'UTC';
  const now = new Date();
  // Get the local clock time in the user's tz
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const dayOfWeek = local.getDay();     // 0..6
  if (!dnd.quietDays.includes(dayOfWeek)) return false;

  const [sh, sm] = dnd.quietHoursStart.split(':').map(Number);
  const [eh, em] = dnd.quietHoursEnd.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = local.getHours() * 60 + local.getMinutes();

  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Window crosses midnight (22:00 → 07:00)
  return nowMin >= startMin || nowMin < endMin;
}
```

### 4.7 Web Push

```ts
// src/shared/services/notifications/webpush.singleton.ts
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,         // "mailto:ops@dbexec.com"
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export { webpush };

// Sending:
async function sendWebPush(notification: Notification) {
  const subs = await PushSubscription.find({ where: { userId: notification.userId } });
  const payload = JSON.stringify({
    title: renderTitle(notification),
    body: renderBody(notification),
    icon: '/icons/notification-192.png',
    badge: '/icons/badge-72.png',
    url: notification.url || '/notifications',
    data: { notificationId: notification.id, category: notification.category },
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys as any },
        payload,
      );
      await PushSubscription.update(sub.id, { lastSeen: new Date() });
    } catch (e: any) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        // Subscription expired — clean up
        await PushSubscription.delete(sub.id);
      } else {
        Logger.warn(`Push delivery failed: ${e.message}`);
      }
    }
  }
}

// Subscription endpoint (frontend calls this after permission grant)
// POST /notifications/push/subscribe
async function subscribePush(req, res) {
  const { endpoint, keys, userAgent } = req.body;
  await PushSubscription.save({
    userId: res.locals.loggedInId,
    endpoint, keys, userAgent,
  });
  res.json({ ok: true });
}
```

### 4.8 Real-time delivery (SSE)

```ts
// src/modules/notifications/controllers/streamNotifications.ts
async function streamNotifications(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');     // nginx
  res.flushHeaders();

  const userId = res.locals.loggedInId;
  const subscriber = sse.subscribe(userId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat every 25s — keeps proxies from killing the connection
  const heartbeat = setInterval(() => res.write(':\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.unsubscribe(userId, subscriber);
  });
}

// src/shared/services/sse.ts  — in-memory pub/sub
type SSEHandler = (event: any) => void;
class SSEHub {
  private handlers = new Map<string, Set<SSEHandler>>();
  subscribe(userId: string, h: SSEHandler) {
    if (!this.handlers.has(userId)) this.handlers.set(userId, new Set());
    this.handlers.get(userId)!.add(h);
    return h;
  }
  unsubscribe(userId: string, h: SSEHandler) {
    this.handlers.get(userId)?.delete(h);
  }
  publish(userId: string, event: any) {
    this.handlers.get(userId)?.forEach(h => { try { h(event); } catch {} });
  }
}
export const sse = new SSEHub();
```

For horizontal scaling (multiple API nodes), the `publish()` call
needs to fan out across nodes — use Redis pub/sub:

```ts
// scale-out:
redis.subscribe('sse:notifications', (channel, message) => {
  const { userId, event } = JSON.parse(message);
  sse.publish(userId, event);
});

// notify() then publishes:
await redis.publish('sse:notifications', JSON.stringify({ userId, event }));
```

### 4.9 Email channel

```ts
async function sendEmail(notification: Notification) {
  const user = await User.findOne({ where: { id: notification.userId } });
  if (!user?.email) return;

  const cfg = await OrgEmailConfig.findOne({
    where: { organisationId: user.organisationId },
  });
  if (!cfg) return;     // org has no email; bell-only delivery

  const transport = await buildTransport(cfg);
  await transport.sendMail({
    from: `"${cfg.fromName ?? 'DBExec'}" <${cfg.fromAddress}>`,
    to: user.email,
    subject: renderEmailSubject(notification, user.locale ?? 'en'),
    html: renderEmailBody(notification, user.locale ?? 'en'),
  });
}

// Templates per category in src/shared/services/notifications/templates/
function renderEmailBody(n: Notification, locale: string): string {
  const tpl = templates[n.category]?.[locale] ?? templates[n.category]?.en;
  if (!tpl) return defaultTemplate(n);
  return tpl(n.payload);
}
```

### 4.10 Daily digest

```ts
// Cron at 8 AM org-tz for each user with queued items
async function runDailyDigest(userId: string) {
  const queued = await DigestQueue.find({
    where: { userId, sentAt: IsNull() },
    order: { createdOn: 'ASC' },
  });
  if (queued.length === 0) return;

  const notifications = await Notification.find({
    where: { id: In(queued.map(q => q.notificationId)) },
  });

  const user = await User.findOne({ where: { id: userId } });
  if (!user?.email) return;
  const cfg = await OrgEmailConfig.findOne({ where: { organisationId: user.organisationId } });
  if (!cfg) return;
  const transport = await buildTransport(cfg);

  await transport.sendMail({
    from: `"${cfg.fromName ?? 'DBExec'}" <${cfg.fromAddress}>`,
    to: user.email,
    subject: `[DBExec] Daily digest — ${notifications.length} items`,
    html: renderDigestTemplate(notifications, user.locale ?? 'en'),
  });

  await DigestQueue.update({ userId, sentAt: IsNull() }, { sentAt: new Date() });
}
```

### 4.11 Snooze / mute by source

```ts
// User clicks "mute this dashboard's notifications for 24h"
// POST /notifications/mute  body: { sourceType, sourceId, duration }
async function muteSource(req, res) {
  const { sourceType, sourceId, durationMinutes } = req.body;
  await NotificationMute.upsert({
    userId: res.locals.loggedInId,
    sourceType, sourceId,
    mutedUntil: new Date(Date.now() + durationMinutes * 60_000),
  }, ['userId', 'sourceType', 'sourceId']);
}

// notify() consults this before persisting:
async function isMuted(userId: string, sourceType?: string, sourceId?: string) {
  if (!sourceType || !sourceId) return false;
  const m = await NotificationMute.findOne({
    where: { userId, sourceType, sourceId, mutedUntil: MoreThan(new Date()) },
  });
  return !!m;
}
```

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | Recent (paginated, defaults to unread) |
| GET | `/notifications/unread-count` | Bell badge number |
| POST | `/notifications/:id/read` | Mark single as read |
| POST | `/notifications/mark-all-read` | Mark all unread for me as read |
| POST | `/notifications/:id/archive` | Archive single |
| GET | `/notifications/stream` | SSE event stream (long-lived) |
| GET | `/notifications/preferences` | My preferences |
| PUT | `/notifications/preferences` | Update mine |
| GET | `/notifications/dnd` | My DND config |
| PUT | `/notifications/dnd` | Update mine |
| POST | `/notifications/dnd/snooze` | Quick "snooze 1h" |
| POST | `/notifications/push/subscribe` | Register web push endpoint |
| DELETE | `/notifications/push/subscribe/:id` | Unsubscribe device |
| POST | `/notifications/mute` | Mute by source |
| DELETE | `/notifications/mute/:id` | Unmute |

## 6. FE specs

### 6.1 Bell dropdown

```
🔔  ●3                          (badge: 3 unread)
   ┌────────────────────────────────────────────┐
   │ ●  Alert fired                  2m ago    │
   │    Revenue dropped below $10k             │
   │    Sales Q3 dashboard                     │
   ├────────────────────────────────────────────┤
   │ ●  Dataset refresh failed       18m ago   │
   │    invoices_q3 — schema drift on col_X    │
   ├────────────────────────────────────────────┤
   │ ○  Dashboard shared with you    1h ago    │
   │    Alice shared "Customer Health"         │
   ├────────────────────────────────────────────┤
   │ [Mark all read]    [Preferences]    [⋮]   │
   └────────────────────────────────────────────┘
```

Bundled rows show a count:
```
●  Alert fired (8×)              5m ago
   Sales Q3 dashboard
   Most recent: "Revenue dropped below $10k"
```

### 6.2 Preferences UI

```
Notification preferences

  Category                         │ In-app │ Email │ Push │ SMS
  ────────────────────────────────┼────────┼───────┼──────┼─────
  Data ops                         │        │       │      │
    Dataset refresh completed       │   ☑    │   ☐   │  ☐   │  ☐
    Dataset refresh failed          │   ☑    │   ☑   │  ☐   │  ☐
    Dataset uploaded                │   ☑    │   ☐   │  ☐   │  ☐
  Alerts                           │        │       │      │
    Alert fired (warning+)          │   ☑    │   ☑   │  ☑   │  ☐
    Alert fired (critical)          │   ☑    │   ☑   │  ☑   │  ☑
    Alert resolved                  │   ☑    │   ☐   │  ☐   │  ☐
  Sharing                          │        │       │      │
    Shared with you                 │   ☑    │   ☑   │  ☐   │  ☐
    Comment mentioned you           │   ☑    │   ☑   │  ☑   │  ☐
  Security                         │        │       │      │
    New device login                │   ☑    │   ☑   │  ☐   │  ☐
    Password changed                │   ☑    │   ☑   │  ☐   │  ☐
    Suspicious activity             │   ☑    │   ☑   │  ☑   │  ☑
   ...

  Do Not Disturb:
    ☑ Enable quiet hours
       From: [ 22:00 ]  To: [ 07:00 ]
       Days: [Mon][Tue][Wed][Thu][Fri][○Sat][○Sun]
       Timezone: [ America/New_York ▾ ]
       ☑ Override for critical alerts
```

### 6.3 In-page push permission prompt

The web-push prompt happens **only after the user clicks** a
button explicitly asking for push permission — never on page load.
This is what every modern guidelines doc says (Mozilla, Chrome,
WebKit).

```
After clicking "Enable push notifications":
  navigator.serviceWorker.register('/sw.js')
    .then(reg => reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY_BYTES,
    }))
    .then(sub => fetch('/api/v1/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
    }));
```

### 6.4 SSE consumer in Angular

```ts
@Injectable({ providedIn: 'root' })
export class NotificationStreamService {
  private eventSource: EventSource | null = null;
  private subject = new Subject<NotificationEvent>();
  events$ = this.subject.asObservable();

  connect() {
    if (this.eventSource) return;
    this.eventSource = new EventSource('/api/v1/notifications/stream',
      { withCredentials: true });
    this.eventSource.addEventListener('message', (e) => {
      try { this.subject.next(JSON.parse(e.data)); }
      catch { /* ignore */ }
    });
    this.eventSource.addEventListener('error', () => {
      // Browser auto-reconnects with backoff; we just observe.
    });
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
```

## 7. Validators

```ts
export const updatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    push:  z.boolean().optional(),
    sms:   z.boolean().optional(),
  })).max(NOTIFICATION_CATEGORIES.length),
});

export const updateDndSchema = z.object({
  enabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietDays: z.array(z.number().int().min(0).max(6)).optional(),
  timezone: z.string().max(64),
  fullDndUntil: z.string().datetime().optional(),
  overrideForCritical: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.enabled && (!d.quietHoursStart || !d.quietHoursEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quietHoursStart'],
      message: 'validation.dnd.window.required' });
  }
});

export const subscribePushSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(80).max(120),
    auth: z.string().min(20).max(40),
  }),
  userAgent: z.string().max(512).optional(),
});
```

## 8. Test plan

```
NTF-EMIT-H-01    notify({alert.fired}) → row appears in DB
NTF-EMIT-H-02    SSE subscriber receives event in <500ms
NTF-EMIT-H-03    notify() respects user preference (email off → no email)
NTF-BUNDLE-H-01  3 calls with same bundleKey in 5min → 1 row with count=3
NTF-BUNDLE-H-02  6th min → new row (bundle window expired)
NTF-BUNDLE-N-01  no bundleKey → always new row
NTF-DND-H-01     in quiet window → email queued for digest, in-app delivered
NTF-DND-H-02     out of quiet window → all enabled channels deliver
NTF-DND-H-03     fullDndUntil set + critical alert → still delivers (override)
NTF-DND-H-04     midnight-crossing window (22:00→07:00) handled
NTF-DND-N-01     malformed quietHours time → 400 validation
NTF-PUSH-H-01    subscribePush stores endpoint
NTF-PUSH-H-02    delivery sends to all registered endpoints
NTF-PUSH-H-03    410 from push provider → endpoint deleted
NTF-PUSH-H-04    push delivery non-critical category off → skipped
NTF-SSE-H-01     long-lived connection survives 30 min
NTF-SSE-H-02     heartbeat every 25s keeps proxy alive
NTF-SSE-H-03     reconnect after network drop → events flow again
NTF-DIGEST-H-01  8am digest fires with queued items
NTF-DIGEST-H-02  empty queue → no digest sent
NTF-PREF-H-01    update preferences → next emit honours new flags
NTF-PREF-N-01    unknown category → 400
NTF-MUTE-H-01    mute source for 1h → emit creates row but no channels
NTF-MUTE-H-02    mute expires → next emit normal
NTF-MARK-H-01    mark-all-read sets read_at for unread set only
NTF-CRITICAL-H-01 override_for_critical=true + dnd active → email still sent
NTF-I18N-H-01    user locale=fr → email body in French
```

## 9. Migration & rollout

1. Schema additions + categories enum + `notify()` service (no
   FE).
2. SSE endpoint + Angular service + bell-icon real-time updates.
3. Preferences UI + DND config.
4. Email channel + templates.
5. Web Push (browser opt-in).
6. Bundling + digest.
7. Snooze / mute by source.
8. SMS (defer).

Feature flag `enableNotificationsV2` per org (the existing bell stays
intact for off-flag orgs).

## 10. Open questions

- **Default preferences per category** — codified in code or
  configurable per org admin? Recommend code defaults, admin
  override at org-level for security categories.
- **Push payload size** — Web Push has a small limit (~3-4KB).
  Long payloads truncated; click brings user into the in-app
  notification with full detail. Document.
- **SSE vs WebSocket** — SSE chosen for simplicity (one-way, http
  semantics, browser auto-reconnect). WebSocket needed only when
  we add bidirectional realtime (V2: presence indicators on
  dashboards).
- **Notification retention** — currently no auto-delete; old read
  rows accumulate. Add a 90-day archive job for read+archived rows.
- **Mobile push** — defer until a real mobile app exists. PWA web
  push is sufficient for v1.

## 11. References

- Web Push protocol: <https://datatracker.ietf.org/doc/html/rfc8030>
- VAPID: <https://datatracker.ietf.org/doc/html/rfc8292>
- Notifications API (MDN): <https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API>
- Push API (MDN): <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>
- web-push npm: <https://github.com/web-push-libs/web-push>
- SSE spec: <https://html.spec.whatwg.org/multipage/server-sent-events.html>
- Linear notifications design: <https://linear.app/changelog>

## Appendix · Review additions

- **Bundling by source + 5-min window** — §4.5.
- **DND with critical-override** — §4.6.
- **Daily digest** for muted items — §4.10.
- **Web Push** via VAPID + endpoint cleanup on 410 — §4.7.
- **SSE real-time stream** with heartbeat + Redis pub/sub for
  scale-out — §4.8.
- **Snooze / mute by source** — §4.11.
- **Per-category preferences** with defaults — §4.3.
- **Notification archive** — schema column, retention job
  deferred.
