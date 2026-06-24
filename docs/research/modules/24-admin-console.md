# 24 · Admin Console & Org Settings

A single page for org admins to manage everything. Today DBExec has
fragments under several routes; consolidate.

## Tabs

- **General** — org name, description, branding (link to 20).
- **Authentication** — password policy, SSO, MFA, SCIM (link to 10).
- **Members** — users, roles, groups (link to 03 of e2e docs).
- **Datasources** — list + add (link to 01).
- **Permissions** — RBAC tree.
- **Security** — RLS + column rules (link to 09).
- **API & Embed** — API tokens, service accounts, embed signing secret.
- **Schedules & Alerts** — global view of subs + alerts.
- **Audit Logs** — link.
- **Notifications** — SMTP / SES / SendGrid config, Slack OAuth.
- **Plan & Billing** — seats used, storage used, plan tier.
- **Backup & Restore** — export entire org bundle.
- **Danger zone** — delete org.

## Backup & restore

```ts
// POST /admin/backup
// → streams JSON bundle:
//   {
//     org: {...},
//     users: [...],
//     roles: [...],
//     groups: [...],
//     datasources: [...],
//     datasets: [...],
//     analyses: [...],
//     dashboards: [...],
//     rls_rules: [...],
//     semantic_models: [...],
//     subscriptions: [...],
//     alerts: [...],
//     audit_logs: [...]   (last 30d)
//   }
```

Restore: upload bundle → diff vs current org → preview → apply.
Long-running BullMQ job.

## Plan & Billing

```sql
CREATE TABLE org_plan (
  organisation_id uuid PRIMARY KEY,
  tier           varchar(16) NOT NULL,        -- free|pro|enterprise
  seats_limit    int NOT NULL,
  storage_limit_gb int NOT NULL,
  queries_limit_monthly bigint,
  features       text[],                       -- ['sso','scim','embed','mfa',...]
  trial_ends_at  timestamptz,
  renews_at      timestamptz,
  status         varchar(16) NOT NULL
);
CREATE TABLE org_usage_daily (
  organisation_id uuid NOT NULL,
  day             date NOT NULL,
  active_users    int,
  queries         bigint,
  storage_gb      numeric(10,2),
  PRIMARY KEY (organisation_id, day)
);
```

## Tests

- **ADM-H-01** — admin can open the console
- **ADM-N-01** — non-admin sees 403
- **ADM-BACKUP-H-01** — backup file round-trips on restore
- **ADM-PLAN-H-01** — exceeding seat limit blocks user creation

## Appendix · Review additions

- **Switch-org** UI for super admins (browse N orgs from one shell).
- **Audit retention slider** per org.
- **Impersonate user** for support (audited).
- **Plan upgrade flow** with Stripe / Chargebee checkout.
- **Trial extension** by support.
- **Bulk user CSV import** (separate from SCIM).
- **Bulk group CSV import**.
- **Org clone** — duplicate org for staging.
- **Org transfer** — change owning customer (M&A scenarios).
- **Sandbox mode** — read-only org clone.
- **Backup encryption at rest** with KMS (BYOK).
- **Data export request** (GDPR Article 20).
- **Right-to-erasure** (GDPR Article 17).

### Schema delta

```sql
CREATE TABLE impersonation_event (
  id              uuid PRIMARY KEY,
  support_user_id uuid NOT NULL,
  target_user_id  uuid NOT NULL,
  reason          text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);

CREATE TABLE gdpr_request (
  id            uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  user_id       uuid NOT NULL,
  kind          varchar(16) NOT NULL,  -- export|delete
  status        varchar(16) NOT NULL DEFAULT 'pending',
  artifact_url  text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### Test IDs

- ADM-IMP-H-01 — support can impersonate; audit logged
- ADM-BULK-CSV-H-01 — bulk CSV imports 100 users
- ADM-CLONE-H-01 — org cloned with selective tables
- GDPR-EXP-H-01 — data export request fulfilled within SLA
- GDPR-DEL-H-01 — right-to-erasure removes/anonymises user
