# 15 · Scheduling & Subscriptions & Alerts

> The "I want to be told when X" surface. Three flavours:
> *subscriptions* (deliver a snapshot of this dashboard every
> Monday), *alerts* (tell me when revenue drops below threshold),
> and *digests* (weekly summary of everything I care about).
>
> Sister modules:
> [13 · Export](13-export-download.md) (subscriptions render via
> the export pipeline), [16 · Notifications](16-notifications.md)
> (in-app delivery channel), [22 · API/SDK/Webhooks](22-api-sdk-plugins.md)
> (webhook delivery).

**Depends on:** Export (13), Notifications (16), Dashboard (08), Cache (05), Auth (10)
**Unblocks:** Daily-ops use cases, customer-facing weekly reports
**Maturity:** 🔴 not in product today

---

## 1. Industry baseline

| Tool | Recurring snapshot | Threshold alert | Anomaly alert | Channels |
|---|---|---|---|---|
| **Tableau** | Subscriptions (per workbook / per view), schedule from admin | Data-driven alerts (per metric) | TabPy-driven custom alerts | Email |
| **Power BI** | Subscriptions on reports + dashboards | Data alerts via Power Automate | n/a (relies on Azure) | Email, Teams, Power Automate |
| **Looker** | Schedules (LookML or one-off), `data_actions` | Alerts on Looks | n/a | Email, Slack, S3, SFTP, webhook |
| **Metabase** | Pulses (deprecated v0.50+) → Subscriptions | Alerts on questions | n/a | Email, Slack |
| **Superset** | Alerts & reports | Threshold alerts (SQL-defined) | n/a | Email, Slack |
| **Mode** | Schedules on reports | Custom (Python notebook) | Custom | Email, Slack, webhook |
| **Hex** | Schedules on projects | Notebook code | Custom | Email, Slack, webhook |

**The patterns to copy:**

- **Three independent concepts, one queue.** Subscription / alert /
  digest all flow through the same BullMQ scheduler; differences
  are in payload generation, not infrastructure.
- **Channel = delivery, not authorship.** A subscription doesn't
  know whether it's emailing or Slack-ing. It produces a payload
  (URL + attachments + body). The channel adapter handles
  formatting and delivery.
- **Cron expressions normalised to org timezone.** Users set "every
  Monday 9am". DBExec stores `cron + timezone`. The scheduler
  resolves the next fire time correctly across DST.
- **Snooze, ack, severity, cooldown.** Alerts that fire every minute
  are useless. The state machine matters.
- **Webhook with HMAC signature** — customers automating off DBExec
  alerts need to verify the payload came from us.

## 2. DBExec today

- **Nothing.** No scheduler, no subscription model, no alert engine.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| SCH-G01 | Subscription entity + scheduler | P0 | M |
| SCH-G02 | Alert entity + threshold expression evaluation | P0 | L |
| SCH-G03 | BullMQ-backed worker pool | P0 | M |
| SCH-G04 | Email channel (SMTP) | P0 | M |
| SCH-G05 | Slack channel (incoming webhook) | P0 | M |
| SCH-G06 | Webhook channel (HMAC-signed POST) | P0 | M |
| SCH-G07 | Microsoft Teams channel | P1 | S |
| SCH-G08 | SMS channel (Twilio) | P2 | S |
| SCH-G09 | Per-tab subscription (multi-tab dashboard) | P1 | M |
| SCH-G10 | Threshold alert (`metric < value`) | P0 | M |
| SCH-G11 | Anomaly alert (statistical) | P2 | L |
| SCH-G12 | Trend alert ("week-over-week down 20%") | P1 | M |
| SCH-G13 | "On dataset refresh" trigger | P1 | M |
| SCH-G14 | Cooldown (don't fire again for N minutes) | P0 | S |
| SCH-G15 | Consecutive-breach gate (N hits before fire) | P1 | S |
| SCH-G16 | Snooze / mute per alert | P1 | S |
| SCH-G17 | Acknowledge (silence until next breach) | P1 | S |
| SCH-G18 | Severity (info / warning / critical) | P1 | S |
| SCH-G19 | Quiet hours per recipient | P1 | S |
| SCH-G20 | DST-correct timezone handling | P0 | S |
| SCH-G21 | Per-org daily delivery quota | P1 | S |
| SCH-G22 | Audit + delivery log | P0 | S |
| SCH-G23 | Failure backoff (exponential retry) | P0 | S |
| SCH-G24 | Dead-letter queue + manual re-dispatch | P1 | S |
| SCH-G25 | Subscription "preview" (show me what it would send) | P1 | S |
| SCH-G26 | Daily digest (one email summarising N alerts) | P1 | M |

## 4. Target architecture

### 4.1 One queue, three job types

```
┌───────────────────────────────────────────┐
│           BullMQ: scheduler                │  ← Redis-backed
└─────────────────┬─────────────────────────┘
                  │ tick every 1 min
                  ▼
       ┌──────────────────────┐
       │  scheduler.tick()    │  ← reads subscription + alert
       └─────────┬────────────┘     tables, finds rows whose
                 │                  next_run_at <= now()
                 ▼
        ┌─────────────────────────────┐
        │  BullMQ: deliveries queue   │  ← jobs enqueued here
        └──┬──────────────┬───────────┘
           │              │
           ▼              ▼
   ┌──────────────┐ ┌──────────────┐
   │ subscription  │ │ alert worker │ ← payload + delivery
   │ worker        │ │              │
   └──────────────┘ └──────────────┘
```

Both workers route output to the same set of **channel adapters**:

```
       subscription / alert payload
                  │
                  ▼
         ┌────────────────────┐
         │  channelDispatcher │
         └────┬─────┬─────┬───┘
              ▼     ▼     ▼
            email slack webhook  (and Teams, SMS, etc.)
```

### 4.2 Schema

```sql
-- migration: 2026-09-XX_scheduling.sql

CREATE TABLE subscription (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  owner_user_id    uuid NOT NULL,           -- who set it up
  target_type      varchar(16) NOT NULL,    -- dashboard | analysis | dataset | tab
  target_id        uuid NOT NULL,
  tab_id           uuid,                    -- when target_type = tab
  format           varchar(16) NOT NULL,    -- pdf | png | xlsx | csv | jsonl
  cron             varchar(64) NOT NULL,
  timezone         varchar(64) NOT NULL DEFAULT 'UTC',
  next_run_at      timestamptz,
  last_run_at      timestamptz,
  last_status      varchar(16),
  channels         jsonb NOT NULL,
  filter_state     jsonb,
  include_message  text,
  attach_csv       boolean NOT NULL DEFAULT false,
  status           smallint NOT NULL DEFAULT 1,
  snoozed_until    timestamptz,
  created_on       timestamptz NOT NULL DEFAULT now(),
  updated_on       timestamptz NOT NULL DEFAULT now(),
  deleted_on       timestamptz
);
CREATE INDEX subscription_next_run
  ON subscription (next_run_at)
  WHERE status = 1 AND deleted_on IS NULL;

CREATE TABLE alert (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  owner_user_id    uuid NOT NULL,
  name             varchar(100) NOT NULL,
  description      varchar(500),
  dataset_id       uuid,
  analysis_id      uuid,
  expression       text NOT NULL,
  cron             varchar(64) NOT NULL,
  timezone         varchar(64) NOT NULL DEFAULT 'UTC',
  next_run_at      timestamptz,
  severity         varchar(16) NOT NULL DEFAULT 'warning',
  cooldown_mins    int NOT NULL DEFAULT 60,
  consecutive_breaches_required int NOT NULL DEFAULT 1,
  consecutive_breaches_current  int NOT NULL DEFAULT 0,
  ack_until        timestamptz,
  snoozed_until    timestamptz,
  last_triggered_at timestamptz,
  last_value       numeric,
  channels         jsonb NOT NULL,
  status           smallint NOT NULL DEFAULT 1,
  created_on       timestamptz NOT NULL DEFAULT now(),
  deleted_on       timestamptz
);

CREATE TABLE org_email_config (
  organisation_id  uuid PRIMARY KEY,
  smtp_host        varchar(255),
  smtp_port        int,
  smtp_user        varchar(255),
  smtp_password_enc bytea,
  from_address     varchar(255),
  from_name        varchar(100)
);

CREATE TABLE org_slack_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  name                varchar(100),
  webhook_url_enc     bytea NOT NULL,
  default_channel     varchar(80),
  created_on          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_endpoint (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  name                varchar(100),
  url                 text NOT NULL,
  signing_secret_enc  bytea NOT NULL,
  events_subscribed   text[] NOT NULL DEFAULT ARRAY[]::text[],
  status              smallint NOT NULL DEFAULT 1
);

CREATE TABLE delivery_log (
  id                bigserial PRIMARY KEY,
  source_type       varchar(16) NOT NULL,
  source_id         uuid NOT NULL,
  channel           varchar(16) NOT NULL,
  recipients        jsonb,
  status            varchar(16) NOT NULL,
  attempt_no        int NOT NULL DEFAULT 1,
  size_bytes        bigint,
  duration_ms       int,
  error             text,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_log_source ON delivery_log (source_type, source_id, occurred_at DESC);
```

### 4.3 Cron evaluation with timezone

```ts
import { CronExpressionParser } from 'cron-parser';

export function nextRun(cron: string, tz: string, after: Date = new Date()): Date {
  const it = CronExpressionParser.parse(cron, { currentDate: after, tz });
  return it.next().toDate();
}

export async function rescheduleSubscription(subId: string) {
  const sub = await Subscription.findOne({ where: { id: subId } });
  if (!sub || sub.status !== 1) return;
  await Subscription.update(subId, {
    nextRunAt: nextRun(sub.cron, sub.timezone),
  });
}
```

### 4.4 Scheduler tick

```ts
export async function tick() {
  const now = new Date();

  const dueSubs = await Subscription.find({
    where: { status: 1, nextRunAt: LessThanOrEqual(now), deletedOn: IsNull() },
    take: 1000,
  });
  for (const sub of dueSubs) {
    if (sub.snoozedUntil && sub.snoozedUntil > now) continue;
    await scheduleQueue.add('subscription:run', { id: sub.id }, {
      jobId: `sub:${sub.id}:${sub.nextRunAt?.toISOString()}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
    });
    await Subscription.update(sub.id, {
      nextRunAt: nextRun(sub.cron, sub.timezone, now),
    });
  }

  const dueAlerts = await Alert.find({
    where: { status: 1, nextRunAt: LessThanOrEqual(now), deletedOn: IsNull() },
    take: 1000,
  });
  for (const a of dueAlerts) {
    if (a.snoozedUntil && a.snoozedUntil > now) continue;
    if (a.ackUntil && a.ackUntil > now) continue;
    await scheduleQueue.add('alert:evaluate', { id: a.id }, {
      jobId: `alert:${a.id}:${a.nextRunAt?.toISOString()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });
    await Alert.update(a.id, {
      nextRunAt: nextRun(a.cron, a.timezone, now),
    });
  }
}

// Started by app.ts:
setInterval(() => { tick().catch(err => Logger.error(err)); }, 60_000);
```

Idempotent jobId pattern: every fire window has a unique key
(`sub:<id>:<timestamp>`); BullMQ refuses duplicate job ids, so a
double-tick under load doesn't double-send.

### 4.5 Subscription worker

```ts
export default async function runSubscription({ id }: { id: string }) {
  const sub = await Subscription.findOne({ where: { id, status: 1 } });
  if (!sub) return;

  const t0 = Date.now();
  let attachment: Attachment | null = null;
  let lastStatus: 'ok'|'failed'|'empty' = 'ok';
  let errorMsg: string | null = null;

  try {
    const serviceToken = await signServiceToken({
      userId: sub.ownerUserId,
      organisationId: sub.organisationId,
      purpose: 'subscription-render',
      ttlSeconds: 600,
    });

    switch (sub.format) {
      case 'pdf':
        attachment = {
          filename: `${slug(await targetName(sub))}.pdf`,
          content: await renderDashboardPdf(sub.targetId, {
            serviceToken,
            filters: sub.filterState ?? undefined,
            userId: sub.ownerUserId,
            organisationId: sub.organisationId,
          }),
          contentType: 'application/pdf',
        };
        break;
      // ... png, xlsx, csv ...
    }

    if (!attachment || attachment.content.length === 0) lastStatus = 'empty';

    for (const channel of sub.channels as ChannelSpec[]) {
      await channelDispatcher.send({
        channel,
        subject: await buildSubject(sub),
        bodyHtml: await buildBody(sub),
        attachments: attachment ? [attachment] : [],
        sourceType: 'subscription',
        sourceId: sub.id,
        organisationId: sub.organisationId,
      });
    }
  } catch (e) {
    lastStatus = 'failed';
    errorMsg = (e as Error).message;
    throw e;
  } finally {
    await Subscription.update(sub.id, { lastRunAt: new Date(), lastStatus });
    await DeliveryLog.insert({
      sourceType: 'subscription',
      sourceId: sub.id,
      channel: (sub.channels as any[])[0]?.type ?? 'unknown',
      recipients: sub.channels,
      status: lastStatus,
      sizeBytes: attachment?.content.length ?? 0,
      durationMs: Date.now() - t0,
      error: errorMsg,
    });
  }
}
```

### 4.6 Alert worker

```ts
import { Parser } from 'expr-eval';
const exprParser = new Parser({ operators: { assignment: false } });

export default async function evaluateAlert({ id }: { id: string }) {
  const a = await Alert.findOne({ where: { id, status: 1 } });
  if (!a) return;

  // Cooldown
  if (a.lastTriggeredAt &&
      Date.now() - a.lastTriggeredAt.getTime() < a.cooldownMins * 60_000) {
    return;
  }

  // Run the source query (with RLS)
  const dataset = await Dataset.findOne({ where: { id: a.datasetId! } });
  const cfg = await loadDatasourceConfig(dataset!.datasourceId);
  const pool = await acquire(cfg);

  const rls = await resolveRlsFilters(master_db_connection, a.ownerUserId, dataset!.id);
  if (rls.denyAll) return;

  const composed = composeRlsSql(dataset!.sql, rls.filters);
  const { rows } = await pool.query(
    `SELECT * FROM (${composed}) AS __alert LIMIT 1`,
  );
  const ctx = rows[0] || {};

  // Evaluate expression
  let fired = false;
  let valueAtFire: number | null = null;
  try {
    const expr = exprParser.parse(a.expression);
    fired = !!expr.evaluate(ctx);
    valueAtFire = pickPrimaryValue(ctx, a.expression);
  } catch (e) {
    Logger.error(`Alert ${a.id} expression failed: ${(e as Error).message}`);
    await DeliveryLog.insert({
      sourceType: 'alert', sourceId: a.id, channel: 'eval',
      status: 'failed', error: (e as Error).message,
    });
    return;
  }

  if (!fired) {
    if (a.consecutiveBreachesCurrent > 0) {
      await Alert.update(a.id, { consecutiveBreachesCurrent: 0 });
    }
    return;
  }

  const breachCount = (a.consecutiveBreachesCurrent ?? 0) + 1;
  await Alert.update(a.id, { consecutiveBreachesCurrent: breachCount });
  if (breachCount < a.consecutiveBreachesRequired) return;

  // Fire
  await Alert.update(a.id, {
    consecutiveBreachesCurrent: 0,
    lastTriggeredAt: new Date(),
    lastValue: valueAtFire,
  });

  for (const channel of a.channels as ChannelSpec[]) {
    await channelDispatcher.send({
      channel,
      subject: `[${a.severity.toUpperCase()}] ${a.name}`,
      bodyHtml: await buildAlertBody(a, ctx, valueAtFire),
      sourceType: 'alert',
      sourceId: a.id,
      organisationId: a.organisationId,
    });
  }
}
```

### 4.7 Channel dispatcher

```ts
type ChannelSpec =
  | { type: 'email'; to: string[]; cc?: string[]; bcc?: string[] }
  | { type: 'slack'; configId: string; channel?: string }
  | { type: 'webhook'; endpointId: string }
  | { type: 'teams'; webhookUrl: string }
  | { type: 'sms'; phoneNumbers: string[] };

class ChannelDispatcher {
  async send(args: SendArgs) {
    const t0 = Date.now();
    let status: 'ok'|'failed' = 'ok';
    let error: string | null = null;
    try {
      switch (args.channel.type) {
        case 'email':   await this.sendEmail(args); break;
        case 'slack':   await this.sendSlack(args); break;
        case 'webhook': await this.sendWebhook(args); break;
        case 'teams':   await this.sendTeams(args); break;
        case 'sms':     await this.sendSms(args); break;
      }
    } catch (e) {
      status = 'failed'; error = (e as Error).message; throw e;
    } finally {
      await DeliveryLog.insert({
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        channel: args.channel.type,
        recipients: args.channel,
        status,
        sizeBytes: args.attachments?.reduce((n, a) => n + a.content.length, 0) ?? 0,
        durationMs: Date.now() - t0,
        error,
      });
    }
  }

  private async sendEmail(args: SendArgs) {
    const cfg = await OrgEmailConfig.findOne({ where: { organisationId: args.organisationId } });
    if (!cfg) throw new Error('Email not configured');
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: cfg.smtpUser ? {
        user: cfg.smtpUser,
        pass: decryptForOrg(cfg.smtpPasswordEnc!, args.organisationId),
      } : undefined,
    });
    await transport.sendMail({
      from: `"${cfg.fromName ?? 'DBExec'}" <${cfg.fromAddress}>`,
      to: (args.channel as any).to,
      cc: (args.channel as any).cc,
      bcc: (args.channel as any).bcc,
      subject: args.subject,
      html: args.bodyHtml,
      attachments: args.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }

  private async sendWebhook(args: SendArgs) {
    const ep = await WebhookEndpoint.findOne({
      where: { id: (args.channel as any).endpointId, organisationId: args.organisationId, status: 1 },
    });
    if (!ep) throw new Error('Webhook endpoint not found');
    const secret = decryptForOrg(ep.signingSecretEnc, args.organisationId);

    const bodyObj = {
      id: randomUUID(),
      event: args.sourceType === 'subscription' ? 'subscription.fired' : 'alert.fired',
      source: { type: args.sourceType, id: args.sourceId },
      occurredAt: new Date().toISOString(),
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      attachments: args.attachments?.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.content.length,
        downloadUrl: await uploadToS3AndSignUrl(a),
      })),
    };
    const body = JSON.stringify(bodyObj);

    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret)
      .update(`${ts}.${body}`)
      .digest('hex');

    const resp = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DBExec-Signature': `t=${ts},v1=${sig}`,
        'X-DBExec-Event': bodyObj.event,
        'User-Agent': 'DBExec-Webhook/1.0',
      },
      body,
    });

    if (resp.status >= 500 || resp.status === 429) {
      throw new Error(`Webhook ${resp.status} — retryable`);
    }
    if (!resp.ok) {
      Logger.warn(`Webhook ${ep.url} → ${resp.status}, NOT retrying`);
    }
  }
}
```

### 4.8 HMAC verification (customer side)

```ts
function verifyDBExecWebhook(req: any, signingSecret: string): boolean {
  const header = req.headers['x-dbexec-signature'] as string;
  const m = /t=(\d+),v1=([a-f0-9]+)/.exec(header);
  if (!m) return false;
  const [, ts, sig] = m;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac('sha256', signingSecret)
    .update(`${ts}.${req.rawBody}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

### 4.9 Quiet hours, digest, quotas, DLQ — short form

- **Quiet hours**: per-user table `notification_preference`
  (module 16). Channel dispatcher consults before email/SMS;
  webhooks unaffected.
- **Daily digest**: separate per-user 8am job collecting alerts
  muted by quiet hours into one summary email.
- **Quotas**: `org_delivery_quota` table caps daily volume per
  channel; midnight org-tz reset.
- **DLQ**: jobs that exhaust retries land in `delivery_dlq` with
  admin UI for retry/discard.

## 5. APIs

### Subscriptions
- POST/GET/PUT/DELETE `/subscriptions`
- POST `/subscriptions/:id/run-now`
- POST `/subscriptions/:id/preview`
- POST `/subscriptions/:id/snooze`
- GET `/subscriptions/:id/deliveries`

### Alerts
- POST/GET/PUT/DELETE `/alerts`
- POST `/alerts/:id/ack` — silence until next breach
- POST `/alerts/:id/snooze` — silence until timestamp
- POST `/alerts/:id/test` — force eval; fire if breached
- GET `/alerts/:id/history`

### Channels
- PUT `/channels/email`
- POST/GET/DELETE `/channels/slack`
- POST/GET `/webhooks`
- POST `/webhooks/:id/rotate-secret`
- POST `/webhooks/:id/test`

## 6. FE specs

### 6.1 Subscription dialog

```
Create subscription · "Sales Q3 Review"

Schedule:
  Frequency: [ Weekly ▾ ]    Day: [ Monday ▾ ]
  Time:      [ 09:00 ] in [ America/New_York ▾ ]
  Cron preview: 0 9 * * 1
  Next fires: Mon Aug 11 09:00 EDT, Mon Aug 18, ...

Format: ◉ PDF  ○ PNG  ○ XLSX  ○ CSV

To:
  ☑ Me (john@acme.com)
  ☑ #sales-weekly  (Slack)
  ☐ Custom webhook
  [+ recipient]

Filters: apply current selection ☑
Message: [ Weekly Sales Q3 review attached. ]

  [Cancel]  [Send test now]  [Create]
```

### 6.2 Alert builder

```
Create alert · "Revenue below threshold"

Watch:
  ◉ Dataset  ○ Analysis
  [ revenue_daily ▾ ]

Condition:
  When [ daily_revenue ▾ ] [ < ▾ ] [ 10000 ]
  Severity: ○ Info  ◉ Warning  ○ Critical

Advanced:
  Require [ 3 ] consecutive evaluations
  Cooldown: [ 60 ] minutes

Schedule:
  Evaluate every [ 15 minutes ▾ ]

Send to:
  ☑ #ops-alerts  ☑ PagerDuty webhook  ☐ Email me

  [Cancel]  [Test now]  [Create]
```

## 7. Validators

```ts
export const SUB_FORMATS = ['pdf','png','xlsx','csv','jsonl'] as const;
export const CHANNEL_TYPES = ['email','slack','webhook','teams','sms'] as const;

export const channelSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'),
    to: z.array(z.string().email()).min(1).max(100),
    cc: z.array(z.string().email()).max(100).optional(),
    bcc: z.array(z.string().email()).max(100).optional(),
  }),
  z.object({ type: z.literal('slack'),
    configId: z.string().uuid(),
    channel: z.string().regex(/^[#@].+/).optional(),
  }),
  z.object({ type: z.literal('webhook'),
    endpointId: z.string().uuid(),
  }),
  z.object({ type: z.literal('teams'),
    webhookUrl: z.string().url().regex(/outlook\.office\.com/),
  }),
  z.object({ type: z.literal('sms'),
    phoneNumbers: z.array(z.string().regex(/^\+\d{6,15}$/)).min(1).max(20),
  }),
]);

export const createSubscriptionSchema = z.object({
  targetType: z.enum(['dashboard','analysis','dataset','tab']),
  targetId: z.string().uuid(),
  tabId: z.string().uuid().optional(),
  format: z.enum(SUB_FORMATS),
  cron: z.string().regex(/^[\d\*\/,\-\?LW#]+( [\d\*\/,\-\?LW#]+){4}$/),
  timezone: z.string().max(64),
  channels: z.array(channelSpecSchema).min(1).max(10),
  filterState: z.record(z.string(), z.any()).optional(),
  includeMessage: z.string().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (data.targetType === 'tab' && !data.tabId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tabId'],
      message: 'validation.subscription.tabId.required' });
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: data.timezone }); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['timezone'],
                          message: 'validation.subscription.tz.invalid' }); }
});

export const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  datasetId: z.string().uuid().optional(),
  analysisId: z.string().uuid().optional(),
  expression: z.string().min(1).max(2000),
  cron: z.string(),
  timezone: z.string().max(64),
  severity: z.enum(['info','warning','critical']).default('warning'),
  cooldownMins: z.number().int().min(1).max(60*24*7).default(60),
  consecutiveBreachesRequired: z.number().int().min(1).max(100).default(1),
  channels: z.array(channelSpecSchema).min(1),
});
```

## 8. Test plan

```
SCH-CRON-H-01   daily 09:00 EST → next fire correct across DST
SCH-CRON-N-01   malformed cron → 400
SCH-TICK-H-01   tick enqueues one job per due subscription
SCH-TICK-H-02   idempotent jobId — double-tick doesn't double-fire
SCH-SUB-H-01    PDF subscription → email sent, attachment present
SCH-SUB-H-02    Slack subscription → message + file
SCH-SUB-H-03    preview → renders, returns binary, NO send
SCH-SUB-H-04    empty result → status=empty, "No data" message
SCH-SUB-H-05    per-tab subscription → only that tab in PDF
SCH-SUB-N-01    SMTP misconfigured → retry queued
SCH-ALERT-H-01  threshold breach → channel notified once
SCH-ALERT-H-02  cooldown holds for N minutes
SCH-ALERT-H-03  consecutive=3 → fires on 3rd consecutive eval
SCH-ALERT-H-04  consecutive counter resets when condition recovers
SCH-ALERT-H-05  ack → silenced until next breach
SCH-ALERT-N-01  expression with undefined column → fails eval cleanly
SCH-ALERT-N-02  expression overlong / infinite → 5s eval timeout
SCH-WH-H-01     webhook delivered with X-DBExec-Signature
SCH-WH-H-02     signature verifies → ok
SCH-WH-H-03     replay (>5 min old timestamp) → reject
SCH-WH-N-01     endpoint 500 → 5 retries with backoff
SCH-WH-N-02     endpoint 403 → no retry, audit failure
SCH-WH-N-03     after all retries → row in delivery_dlq
SCH-QUIET-H-01  user in quiet hours → queued, not sent
SCH-DIGEST-H-01 muted alerts → 8am digest
SCH-QUOTA-H-01  email quota exhausted → queued until reset
SCH-AUDIT-H-01  every delivery row in delivery_log
SCH-AUDIT-H-02  log carries duration, size, recipients
```

## 9. Migration & rollout

1. Schema + BullMQ + email channel.
2. Subscription worker + run-now/preview + FE dialog.
3. Slack + webhook channels + alert worker + alert builder.
4. Cooldown / consecutive / ack / snooze.
5. Quiet hours + daily digest + Teams + SMS.
6. Quotas + DLQ + per-org delivery analytics.

## 10. Open questions

- **Anomaly alerts**: z-score? Holt-Winters? Prophet? Defer.
- **On-refresh trigger**: needs dataset.refreshed event from
  dataset module. v1.5.
- **Multi-channel dedup**: same user on email + Slack — notify
  twice? Yes, different contexts.
- **Webhook payload size**: 50MB PDF inline is silly → signed URL
  with 7-day expiry. Done in §4.7.
- **Slack file upload**: webhook-only can't attach files. Upgrade
  path is OAuth + files.upload. Add when asked.

## 11. References

- BullMQ docs: <https://docs.bullmq.io/>
- cron-parser tz: <https://github.com/harrisiirak/cron-parser#cron_parser_options>
- Slack incoming webhooks: <https://api.slack.com/messaging/webhooks>
- expr-eval: <https://github.com/silentmatt/expr-eval>
- Stripe webhook signing: <https://stripe.com/docs/webhooks/signatures>
- Tableau Subscriptions: <https://help.tableau.com/current/server/en-us/subscribe.htm>
- Looker Alerts: <https://cloud.google.com/looker/docs/sharing-and-publishing/alerts>

## Appendix · Review additions

- **Per-tab subscriptions** — §4.2 schema + §4.5 dispatch.
- **HMAC webhook signatures** with replay protection — §4.7 + §4.8.
- **Quiet hours + daily digest** — §4.9.
- **Consecutive breach gate** — §4.6.
- **Severity → channel routing** — channel spec maps levels.
- **DLQ + manual retry** — §4.9.
- **Exponential backoff via BullMQ** — §4.4 job options.
- **Delivery quotas per channel per day** — §4.9.
