# 15 · Scheduling, Subscriptions, Alerts

## Three concepts

| Concept | Trigger | Delivery |
|---|---|---|
| Schedule | cron | refresh a dataset / materialised view |
| Subscription | cron | email/Slack PDF/PNG/XLSX of a dashboard |
| Alert | cron + threshold | email/Slack when a metric breaches |

Same scheduler (BullMQ); different job kinds.

## DB

```sql
CREATE TABLE subscription (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  target_type     varchar(16) NOT NULL,
  target_id       uuid NOT NULL,
  channel         varchar(16) NOT NULL,         -- email|slack|teams|webhook
  recipients      jsonb NOT NULL,
  cron            varchar(64) NOT NULL,
  timezone        varchar(64) NOT NULL DEFAULT 'UTC',
  format          varchar(16) NOT NULL,         -- pdf|png|xlsx|csv
  filter_state    jsonb,
  include_message text,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  last_status     varchar(16),
  status          smallint NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  name            varchar(100) NOT NULL,
  dataset_id      uuid NOT NULL,
  expression      text NOT NULL,                -- e.g. 'revenue < 1000'
  cron            varchar(64) NOT NULL,
  timezone        varchar(64) NOT NULL DEFAULT 'UTC',
  channel         varchar(16) NOT NULL,
  recipients      jsonb NOT NULL,
  cooldown_mins   int NOT NULL DEFAULT 60,
  last_triggered_at timestamptz,
  status          smallint NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL
);

CREATE TABLE delivery_log (
  id              uuid PRIMARY KEY,
  source_type     varchar(16) NOT NULL,         -- subscription|alert
  source_id       uuid NOT NULL,
  status          varchar(16) NOT NULL,         -- ok|failed
  channel         varchar(16) NOT NULL,
  recipients_count int NOT NULL,
  size_bytes      bigint,
  duration_ms     int,
  error           text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
```

## Email service abstraction

```ts
// shared/services/email/index.ts
export interface EmailTransport {
  send(opts: SendOpts): Promise<{ id: string }>;
}
export class SmtpTransport implements EmailTransport { /* nodemailer */ }
export class SesTransport  implements EmailTransport { /* @aws-sdk/client-ses */ }
export class SendGridTransport implements EmailTransport { /* @sendgrid/mail */ }

export class EmailService {
  constructor(private t: EmailTransport, private templates: TemplateEngine) {}
  async sendTemplated(opts: { to: string[]; template: string; data: any; attachments?: Attachment[] }) {
    const html = await this.templates.render(opts.template, opts.data);
    return this.t.send({
      from: process.env.SMTP_FROM!,
      to: opts.to.join(','),
      subject: this.templates.subject(opts.template, opts.data),
      html,
      attachments: opts.attachments,
    });
  }
}
```

## Subscription runner

```ts
async function runSubscription(id: string) {
  const sub = await Subscription.findOne({ where: { id, status: 1 } });
  if (!sub) return;
  const startedAt = Date.now();
  let status: 'ok' | 'failed' = 'ok';
  let error: string | null = null;
  let bytes = 0;

  try {
    const token = signServiceToken(sub.organisationId);
    let attachment: Attachment;
    switch (sub.format) {
      case 'pdf':  attachment = { filename: 'dashboard.pdf',  content: await renderDashboardPdf(sub.targetId, { serviceToken: token, filters: sub.filterState }) }; break;
      case 'png':  attachment = { filename: 'dashboard.png',  content: await renderDashboardPng(sub.targetId, { serviceToken: token, filters: sub.filterState }) }; break;
      case 'xlsx': attachment = { filename: 'dashboard.xlsx', content: await renderDashboardXlsx(sub.targetId, { serviceToken: token, filters: sub.filterState }) }; break;
    }
    bytes = attachment.content.length;
    if (sub.channel === 'email') {
      await emailService.sendTemplated({
        to: sub.recipients as string[],
        template: 'subscription',
        data: { dashboardName: sub.targetName, message: sub.includeMessage },
        attachments: [attachment],
      });
    } else if (sub.channel === 'slack') {
      await slackUpload(sub.recipients as string[], attachment, sub.includeMessage);
    } else if (sub.channel === 'webhook') {
      await webhookPost(sub.recipients as string[], attachment, sub);
    }
  } catch (e) {
    status = 'failed';
    error = (e as Error).message;
  }

  await Subscription.update(id, {
    lastRunAt: new Date(),
    lastStatus: status,
    nextRunAt: nextCron(sub.cron, sub.timezone),
  });
  await DeliveryLog.insert({
    sourceType: 'subscription',
    sourceId: id,
    status, channel: sub.channel, recipientsCount: (sub.recipients as string[]).length,
    sizeBytes: bytes, durationMs: Date.now() - startedAt, error,
  });
}
```

## Alert evaluator

```ts
async function checkAlert(id: string) {
  const a = await Alert.findOne({ where: { id, status: 1 } });
  if (!a) return;
  if (a.lastTriggeredAt && +new Date() - +a.lastTriggeredAt < a.cooldownMins * 60_000) return;

  const dataset = await Dataset.findOne({ where: { id: a.datasetId } });
  const sec = await securityCompiler.apply(dataset.sql, dataset, serviceAccount(a.organisationId));
  const { rows } = await pools.acquire(dataset.datasourceId).then(p => p.query(sec.sql));

  const ctx = rows[0] || {};
  const passed = evaluate(a.expression, ctx);  // safe AST eval
  if (passed) {
    await deliverAlert(a, ctx);
    await Alert.update(id, { lastTriggeredAt: new Date() });
  }
}
```

`evaluate` uses [expr-eval](https://github.com/silentmatt/expr-eval) for
safe expression evaluation — no `new Function`.

## UI

- Dashboard → Share → Subscribe tab: cron picker, recipients, format,
  message.
- Datasets → New alert: expression builder (drag a metric, pick
  operator, set threshold), cron, channels.
- Org Settings → Notifications: SMTP / SES / SendGrid config, Slack
  OAuth, Teams webhook URL.

## Tests

- **SUB-H-01** — daily 9am subscription delivers PDF
- **SUB-N-01** — recipient list empty → reject
- **SUB-E-01** — DST transition → cron re-evaluated correctly
- **AL-H-01** — alert fires when threshold crossed
- **AL-COOL-H-01** — cooldown prevents repeated firing within window
- **AL-N-01** — expression with side-effecting fn rejected
- **AL-E-01** — alert when dataset returns 0 rows → does not fire
  unless `count == 0` is the condition
