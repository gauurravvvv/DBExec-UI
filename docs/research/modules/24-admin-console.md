# 24 · Admin Console & Org Settings

> The "one place for the org admin to run their tenant" surface.
> Users, roles, groups, audit, security policy, branding, billing,
> backups, GDPR. Today these live in scattered admin screens; this
> module consolidates them with a coherent UX and adds the
> compliance-grade primitives every enterprise asks about.
>
> Sister modules: [10 · Auth/RBAC/SSO](10-auth-rbac-sso.md),
> [19 · Audit/Observability](19-audit-observability.md),
> [20 · Branding](20-branding.md), [28 · Backup/Restore](28-backup-restore.md),
> [27 · Cost Observability](27-cost-observability.md).

**Depends on:** Auth (10), Audit (19), Branding (20), Backup (28),
  every module that needs an admin surface
**Unblocks:** Enterprise procurement, SOC2 / GDPR compliance
**Maturity:** 🟡 partial — scattered admin screens exist; need
  consolidation + new primitives (impersonation, GDPR erasure,
  bulk operations)

---

## 1. Industry baseline

| Tool | User mgmt | Audit | Backup self-serve | GDPR | Impersonate | Bulk ops |
|---|---|---|---|---|---|---|
| **Tableau Server** | ✓ | ✓ | ✓ | partial | ✗ | ✓ |
| **Power BI** | M365 admin | M365 audit | n/a (cloud) | ✓ | ✓ (paid) | partial |
| **Looker** | ✓ | Explore-based | ✓ | partial | ✓ | ✓ |
| **Metabase** | ✓ | enterprise | ✗ | partial | ✗ | partial |
| **Linear** | ✓ | enterprise | ✗ | ✓ | ✓ | ✓ |
| **GitHub** | ✓ | ✓ | ✓ (export) | ✓ | n/a | ✓ |

**The patterns to copy:**

- **One settings shell, many panels** — a sidebar of admin
  sections, each panel loads lazily. Don't nest admin under
  per-resource menus.
- **GDPR right-to-access + right-to-erasure** is non-negotiable for
  EU customers. Both are workflows, not one-click.
- **Impersonation must be audited prominently.** When an admin
  views as another user, every audit row carries
  `actorUserId, impersonatedUserId`. A pink banner across the
  whole UI reminds the impersonator they're acting as someone else.
- **Bulk operations** with dry-run preview. Soft-delete 200 users
  is destructive; show the diff before applying.
- **Org clone** for staging copies — a single admin action that
  creates a new org with all entities (datasets/dashboards/etc.)
  reproduced. Internal QA + customer "I want a sandbox copy".

## 2. DBExec today

- Scattered admin screens: org list / org detail / users / groups /
  roles / branding / audit log. No unified shell. Navigation
  inconsistent.
- No impersonation. Admin can't "view as user X" to debug a
  permission issue.
- No GDPR access / erasure flows.
- Bulk operations exist piecemeal (bulk-delete on a few entities)
  but no consistent UX, no dry-run.
- Admin actions are audited but the audit metadata is patchy.

## 3. Gap matrix

| ID | Gap | Severity | Effort |
|---|---|---|---|
| ADM-G01 | Unified admin console shell | P0 | M |
| ADM-G02 | Org settings landing page (overview) | P0 | M |
| ADM-G03 | User management with bulk CSV import | P0 | M |
| ADM-G04 | Group / role grid with diff before save | P0 | M |
| ADM-G05 | Security policy editor | P0 | S |
| ADM-G06 | GDPR right-to-access (export user data) | P0 | M |
| ADM-G07 | GDPR right-to-erasure (anonymise + cascade delete) | P0 | M |
| ADM-G08 | Admin impersonation with pink banner | P0 | M |
| ADM-G09 | Bulk operations with dry-run preview | P1 | M |
| ADM-G10 | Org clone (for staging / sandbox) | P1 | L |
| ADM-G11 | Org delete (full purge with grace period) | P0 | M |
| ADM-G12 | Quota & usage dashboard | P0 | M |
| ADM-G13 | Billing tier display + upgrade flow | P1 | M |
| ADM-G14 | Audit log filter + export (links to module 19) | P0 | S |
| ADM-G15 | Login activity surface | P0 | S |
| ADM-G16 | Backup admin (links to module 28) | P0 | S |
| ADM-G17 | SSO / SCIM admin (links to module 10) | P0 | S |
| ADM-G18 | API token admin (links to module 22) | P0 | S |
| ADM-G19 | Webhook admin (links to module 22) | P0 | S |
| ADM-G20 | Custom domain admin (links to module 20) | P0 | S |
| ADM-G21 | Notifications + emails admin (templates, SMTP) | P1 | M |
| ADM-G22 | Feature flag admin per org | P1 | M |
| ADM-G23 | Plugin marketplace admin | P2 | M |

## 4. Target architecture

### 4.1 Shell layout

```
┌─────────────────────────────────────────────────────────┐
│  Acme Analytics — Admin                          [User] │
├─────────────────────────────────────────────────────────┤
│ Sidebar                  │ Main panel                   │
│ ──────                   │                              │
│ Overview                 │  (whichever section)         │
│                          │                              │
│ Users & access           │                              │
│   Users                  │                              │
│   Groups                 │                              │
│   Roles                  │                              │
│   SSO                    │                              │
│   SCIM provisioning      │                              │
│   API tokens             │                              │
│                          │                              │
│ Security                 │                              │
│   Policy                 │                              │
│   Login activity         │                              │
│   Audit log              │                              │
│                          │                              │
│ Org                      │                              │
│   Branding               │                              │
│   Custom domain          │                              │
│   Notifications          │                              │
│   Feature flags          │                              │
│   Quotas & billing       │                              │
│                          │                              │
│ Data ops                 │                              │
│   Backups                │                              │
│   Webhooks               │                              │
│   Plugins                │                              │
│                          │                              │
│ Compliance               │                              │
│   GDPR data export       │                              │
│   GDPR erasure           │                              │
│   Retention              │                              │
│                          │                              │
│ Danger zone              │                              │
│   Org clone              │                              │
│   Delete org             │                              │
└─────────────────────────────────────────────────────────┘
```

Sections are Angular routes lazy-loaded. The admin shell is its
own module mounted at `/admin`, requiring `orgAdmin` permission.

### 4.2 Overview page

The landing page when an admin opens settings. Key signals at a
glance:

- Users: total / active / pending-invite
- Storage: used / cap (datasets / uploads)
- Recent activity (last 24h): logins, dashboard publishes, alerts fired
- Top dashboards (by render count this week)
- Health: SSO active? Audit retention configured? Custom domain TLS valid?
- Alerts to admin attention: quota >80%, license expires soon, etc.

This is a regular dashboard — implemented using DBExec's own
analysis primitives against the platform's internal metrics.

### 4.3 User management

```ts
// GET /admin/users — paginated, filterable
// POST /admin/users — single
// POST /admin/users/bulk-import — CSV upload
// PUT /admin/users/:id — update
// POST /admin/users/:id/disable — soft disable
// POST /admin/users/:id/transfer-ownership — for departing users

async function bulkImportUsers(req, res) {
  const file = req.file;
  const csv = file.buffer.toString('utf8');
  const rows = parseCsv(csv);             // returns Array<{email, firstName, lastName, role, groups}>

  // Validate before applying
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!validateEmail(r.email)) errors.push({ row: i + 1, field: 'email', msg: 'invalid' });
    if (!r.firstName)             errors.push({ row: i + 1, field: 'firstName', msg: 'required' });
    if (r.role && !rolesByName[r.role]) errors.push({ row: i + 1, field: 'role', msg: 'unknown' });
  }
  if (errors.length > 0 && !req.query.force) {
    return sendResponse(res, false, 400, 'admin.import.errors', { errors });
  }

  if (req.query.dryRun === 'true') {
    // Return what would happen, don't apply
    return sendResponse(res, true, 200, '', {
      preview: {
        creates: rows.filter(r => !existsByEmail(r.email)),
        updates: rows.filter(r => existsByEmail(r.email)),
        errors,
      },
    });
  }

  // Apply in transaction
  const created: User[] = [];
  await master_db_connection.transaction(async (tx) => {
    for (const r of rows) {
      const existing = await tx.getRepository(User).findOne({ where: { email: r.email, organisationId: orgId } });
      if (existing) {
        existing.firstName = r.firstName;
        existing.lastName = r.lastName;
        await tx.getRepository(User).save(existing);
      } else {
        const u = await createUserWithInviteEmail(tx, r, orgId);
        created.push(u);
      }
    }
  });

  // Audit
  await auditLogger.logAuditToOrg({
    /* ... */
    metadata: { bulkImportRows: rows.length, created: created.length },
  });
  return sendResponse(res, true, 200, '', { created: created.length });
}
```

CSV format documented in the import dialog with a downloadable
template.

### 4.4 Impersonation

```sql
CREATE TABLE impersonation_session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid NOT NULL,                  -- the admin doing it
  target_user_id  uuid NOT NULL,                  -- the user being impersonated
  organisation_id uuid NOT NULL,
  reason          varchar(255),                    -- required justification
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  end_reason      varchar(32)                      -- ended_by_actor | ttl_expired | revoked
);
CREATE INDEX impersonation_active
  ON impersonation_session (actor_user_id, ended_at)
  WHERE ended_at IS NULL;
```

Flow:

```ts
// POST /admin/users/:id/impersonate  body: { reason }
async function startImpersonation(req, res) {
  if (!hasPermission(res.locals.permissions, 'orgAdmin.impersonate')) {
    return sendResponse(res, false, 403, 'admin.impersonate.no_perm');
  }

  const target = await User.findOne({
    where: { id: req.params.id, organisationId: res.locals.orgData.id },
  });
  if (!target) return sendResponse(res, false, 404, 'user.not_found');

  // No impersonating other admins (avoids privilege confusion)
  if (await hasAdminRole(target.id)) {
    return sendResponse(res, false, 403, 'admin.impersonate.target_is_admin');
  }

  const session = await ImpersonationSession.save({
    actorUserId: res.locals.loggedInId,
    targetUserId: target.id,
    organisationId: target.organisationId,
    reason: req.body.reason,
  });

  // Issue a special JWT that carries BOTH identities
  const token = signJwt({
    sub: target.id,                              // the request runs AS target
    impersonatedBy: res.locals.loggedInId,        // but the audit records the actor
    impersonationSessionId: session.id,
    org: target.organisationId,
    role: target.roleId,
    permissions: targetPermissions,
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 3600,                // 1 hour TTL
  });

  // Audit the start
  await auditLogger.logAuditToOrg({
    connection: master_db_connection, req, res,
    module: 'admin', action: 'IMPERSONATE_START',
    entityName: 'User', entityId: target.id,
    metadata: { impersonationSessionId: session.id, reason: req.body.reason },
  });

  return sendResponse(res, true, 200, '', { token, expiresIn: 3600 });
}

// POST /admin/impersonate/end
async function endImpersonation(req, res) {
  const sid = res.locals.impersonationSessionId;
  if (!sid) return sendResponse(res, false, 400, 'admin.impersonate.not_active');

  await ImpersonationSession.update(sid, {
    endedAt: new Date(), endReason: 'ended_by_actor',
  });
  await auditLogger.logAuditToOrg({
    /* ... */
    action: 'IMPERSONATE_END',
    metadata: { impersonationSessionId: sid },
  });
  // FE clears the impersonation token; user re-authenticates with their own.
  return sendResponse(res, true, 200, '', {});
}
```

Auth middleware stamps both identities on res.locals:

```ts
// JWT decode extension
if (payload.impersonatedBy) {
  res.locals.loggedInId = payload.sub;          // the IMPERSONATED user
  res.locals.actorUserId = payload.impersonatedBy;  // the ADMIN
  res.locals.impersonationSessionId = payload.impersonationSessionId;
  res.locals.isImpersonation = true;
}
```

And **every audit log row written during an impersonation session
carries the actor**:

```ts
async function logAuditToOrg(args) {
  if (res.locals.isImpersonation) {
    args.metadata = {
      ...args.metadata,
      actorUserId: res.locals.actorUserId,
      impersonationSessionId: res.locals.impersonationSessionId,
    };
  }
  // ... rest of existing audit logic
}
```

FE banner across the whole UI:

```html
@if (auth.isImpersonating()) {
  <div class="impersonation-banner">
    🎭 You are viewing as {{ targetUser.email }}
    [End impersonation]
  </div>
}
```

### 4.5 GDPR right-to-access

A workflow, not a button:

```sql
CREATE TABLE gdpr_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,                 -- the data subject
  kind            varchar(16) NOT NULL,          -- access | erasure
  status          varchar(16) NOT NULL DEFAULT 'pending',
                                                  -- pending | processing | ready | delivered | failed
  reason          varchar(500),
  requested_by    uuid,                            -- admin who initiated
  requested_at    timestamptz NOT NULL DEFAULT now(),
  scheduled_for   timestamptz,                     -- for erasure: grace-period end
  completed_at    timestamptz,
  artifact_url    text,                            -- signed URL to the data export
  artifact_expires_at timestamptz,
  notes           text
);
```

Flow:

```
1. Admin (or via API, the subject themselves) files an "access"
   request:
     POST /admin/gdpr/access  body: { subjectUserId, reason }
2. Worker runs `collectUserData(subjectUserId)` — iterates every
   table holding the user's data, exports to a single JSON bundle.
3. Bundle uploaded to S3 with 7-day signed URL.
4. Email to the subject + admin with the link.
5. After 7 days, S3 expires the URL; gdpr_request.status = 'expired'.
```

```ts
// jobs/gdprAccess.ts
export default async function gdprAccessJob(requestId: string) {
  const req = await GdprRequest.findOne({ where: { id: requestId } });
  if (!req) return;
  await GdprRequest.update(requestId, { status: 'processing' });

  const userId = req.subjectUserId;
  const orgId = req.organisationId;
  const conn = await openOrgConnection(orgId);

  const bundle: Record<string, any[]> = {};
  bundle.user = await conn.query(`SELECT * FROM "user" WHERE id = $1`, [userId]);
  bundle.userGroupMappings = await conn.query(`SELECT * FROM user_group_mapping WHERE user_id = $1`, [userId]);
  bundle.userAttributeValues = await conn.query(`SELECT * FROM user_attribute_value WHERE user_id = $1`, [userId]);
  bundle.notifications = await conn.query(`SELECT * FROM notification WHERE user_id = $1`, [userId]);
  bundle.favourites = await conn.query(`SELECT * FROM favourite WHERE user_id = $1`, [userId]);
  bundle.recentViews = await conn.query(`SELECT * FROM recent_view WHERE user_id = $1`, [userId]);
  bundle.sessions = await conn.query(`SELECT id, started_at, ended_at, ip_address, user_agent FROM user_session WHERE user_id = $1`, [userId]);
  // Authored / edited content
  bundle.datasetsCreated = await conn.query(`SELECT id, name, description, created_on FROM dataset WHERE created_by = $1`, [userId]);
  bundle.dashboardsCreated = await conn.query(`SELECT id, name, created_on FROM dashboard WHERE created_by = $1`, [userId]);
  bundle.analysesCreated = await conn.query(`SELECT id, name, created_on FROM analysis WHERE created_by = $1`, [userId]);
  // Audit trail involving this user as actor
  bundle.auditAsActor = await conn.query(`SELECT * FROM audit_log_s WHERE user_id = $1`, [userId]);
  // Audit trail involving this user as subject
  bundle.auditAsSubject = await conn.query(`SELECT * FROM audit_log_s WHERE entity_id = $1 AND entity_name = 'User'`, [userId]);

  const json = JSON.stringify(bundle, null, 2);
  const key = `gdpr/${orgId}/${requestId}.json`;
  await s3.upload({ Bucket: process.env.GDPR_BUCKET!, Key: key, Body: json }).promise();
  const url = await s3.getSignedUrlPromise('getObject', {
    Bucket: process.env.GDPR_BUCKET!, Key: key, Expires: 7 * 24 * 3600,
  });

  await GdprRequest.update(requestId, {
    status: 'ready', artifactUrl: url,
    artifactExpiresAt: addDays(new Date(), 7),
    completedAt: new Date(),
  });

  // Notify subject + admin
  await emailService.send({
    to: [(await User.findOne({ where: { id: userId } }))!.email],
    template: 'gdpr-access-ready',
    data: { url, expiresAt: addDays(new Date(), 7) },
  });
}
```

### 4.6 GDPR right-to-erasure

Harder because it has to cascade across every table without
losing the audit trail (which is itself a legitimate interest /
records-of-processing exemption under GDPR Art. 6).

Strategy: **anonymise audit references; cascade-delete personal
data; replace PII fields on the user row with sentinels.**

```ts
// jobs/gdprErasure.ts
export default async function gdprErasureJob(requestId: string) {
  const req = await GdprRequest.findOne({ where: { id: requestId } });
  if (!req || req.status !== 'pending') return;

  // Grace period — most jurisdictions require 30 days
  if (req.scheduledFor && req.scheduledFor > new Date()) {
    // Re-enqueue for later
    await scheduleQueue.add('gdpr:erasure', { requestId }, {
      delay: req.scheduledFor.getTime() - Date.now(),
    });
    return;
  }

  await GdprRequest.update(requestId, { status: 'processing' });
  const userId = req.subjectUserId;
  const orgId = req.organisationId;
  const conn = await openOrgConnection(orgId);

  await conn.transaction(async (tx) => {
    // 1. Anonymise audit_log_s references — keep the trail, lose the identity
    await tx.query(`
      UPDATE audit_log_s
        SET user_id = NULL,
            metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb), '{erased}', 'true')
      WHERE user_id = $1`, [userId]);

    // 2. Cascade-delete personal data
    await tx.query(`DELETE FROM notification WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM favourite WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM recent_view WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM user_attribute_value WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM user_group_mapping WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM push_subscription WHERE user_id = $1`, [userId]);
    await tx.query(`DELETE FROM saved_search WHERE owner_user_id = $1`, [userId]);

    // 3. Revoke all sessions
    await tx.query(`
      UPDATE user_session
        SET revoked_at = now(), revoked_reason = 'gdpr_erasure'
      WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

    // 4. Disable API tokens owned by the user
    await tx.query(`
      UPDATE api_token
        SET status = 0, revoked_at = now(), revoke_reason = 'gdpr_erasure'
      WHERE owner_user_id = $1`, [userId]);

    // 5. Replace PII on the user row with sentinels
    await tx.query(`
      UPDATE "user"
        SET email = $1,
            first_name = '[erased]',
            last_name = '',
            username = $2,
            password = NULL,
            otp = NULL,
            refresh_token = NULL,
            setup_token = NULL,
            phone = NULL,
            avatar_url = NULL,
            status = 0,
            erased_at = now()
      WHERE id = $3`,
      [`erased-${userId}@dbexec.invalid`, `erased-${userId}`, userId]);

    // 6. Authored content (datasets, dashboards, analyses) — keep
    //    the records but reassign authorship to a sentinel system
    //    user. Deleting the authored content would harm other
    //    legitimate users of the org.
    await tx.query(`
      UPDATE dataset SET created_by = '00000000-0000-0000-0000-000000000000'
      WHERE created_by = $1`, [userId]);
    await tx.query(`
      UPDATE dashboard SET created_by = '00000000-0000-0000-0000-000000000000'
      WHERE created_by = $1`, [userId]);
    await tx.query(`
      UPDATE analysis SET created_by = '00000000-0000-0000-0000-000000000000'
      WHERE created_by = $1`, [userId]);
  });

  await GdprRequest.update(requestId, {
    status: 'delivered', completedAt: new Date(),
  });

  // Notify org admin
  await emailService.send({
    to: [(await User.findOne({ where: { id: req.requestedBy! } }))!.email],
    template: 'gdpr-erasure-complete',
    data: { subjectUserId: userId, completedAt: new Date() },
  });
}
```

### 4.7 Bulk operations with dry-run

```ts
// POST /admin/users/bulk-disable?dryRun=true  body: { ids: [...], reason }
async function bulkDisableUsers(req, res) {
  const { ids, reason } = req.body;
  const dryRun = req.query.dryRun === 'true';
  const orgId = res.locals.orgData.id;

  // Load + validate
  const users = await User.find({ where: { id: In(ids), organisationId: orgId } });
  if (users.length !== ids.length) {
    return sendResponse(res, false, 400, 'admin.bulk.some_not_found', {
      missing: ids.filter((id: string) => !users.some(u => u.id === id)),
    });
  }

  // Compute side effects
  const sideEffects = await Promise.all(users.map(async u => ({
    userId: u.id,
    email: u.email,
    activeSessions: await UserSession.count({ where: { userId: u.id, revokedAt: IsNull() } }),
    apiTokens: await ApiToken.count({ where: { ownerUserId: u.id, status: 1 } }),
    subscriptionsOwned: await Subscription.count({ where: { ownerUserId: u.id, status: 1 } }),
    alertsOwned: await Alert.count({ where: { ownerUserId: u.id, status: 1 } }),
  })));

  if (dryRun) {
    return sendResponse(res, true, 200, 'admin.bulk.preview', {
      summary: {
        usersDisabled: users.length,
        sessionsRevoked: sideEffects.reduce((s, e) => s + e.activeSessions, 0),
        apiTokensRevoked: sideEffects.reduce((s, e) => s + e.apiTokens, 0),
        subscriptionsOrphaned: sideEffects.reduce((s, e) => s + e.subscriptionsOwned, 0),
      },
      perUser: sideEffects,
    });
  }

  // Apply
  await master_db_connection.transaction(async (tx) => {
    for (const u of users) {
      u.status = 0;
      u.disabledAt = new Date();
      await tx.getRepository(User).save(u);
      // Revoke sessions, tokens; pause subscriptions; etc.
    }
  });
  // Audit one row per user (so individual revoke can be reversed)
}
```

### 4.8 Org clone

```sql
-- Track clone jobs because they're long-running
CREATE TABLE org_clone_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_org_id   uuid NOT NULL,
  target_org_id   uuid,                            -- filled in after create
  status          varchar(16) NOT NULL DEFAULT 'queued',
  options         jsonb NOT NULL,                  -- {includeData: bool, ...}
  initiated_by    uuid NOT NULL,
  started_at      timestamptz,
  completed_at    timestamptz,
  error           text
);
```

```ts
// POST /admin/orgs/:id/clone  body: { name, includeData: false }
async function cloneOrg(req, res) {
  const { id } = req.params;
  const { name, includeData } = req.body;

  // Only super-admins can clone orgs
  if (!hasPermission(res.locals.permissions, 'superAdmin.clone')) {
    return sendResponse(res, false, 403, 'admin.clone.no_perm');
  }

  const job = await OrgCloneJob.save({
    sourceOrgId: id,
    initiatedBy: res.locals.loggedInId,
    options: { includeData: !!includeData, newOrgName: name },
  });

  await scheduleQueue.add('admin:clone-org', { jobId: job.id });
  return sendResponse(res, true, 202, 'admin.clone.queued', { jobId: job.id });
}

// jobs/cloneOrg.ts
export default async function cloneOrgJob({ jobId }: { jobId: string }) {
  const job = await OrgCloneJob.findOne({ where: { id: jobId } });
  await OrgCloneJob.update(jobId, { status: 'processing', startedAt: new Date() });

  try {
    const newOrg = await createNewOrg(job.options.newOrgName, job.initiatedBy);
    await OrgCloneJob.update(jobId, { targetOrgId: newOrg.id });

    const srcConn = await openOrgConnection(job.sourceOrgId);
    const dstConn = await openOrgConnection(newOrg.id);

    const tables = [
      'role','user','group','user_group_mapping',
      'role_permission_mapping',
      'datasource','datasource_config_s',
      'connection','connection_config',
      'dataset','dataset_field',
      'analysis','analysis_filter','analysis_visual',
      'dashboard','dashboard_tab','dashboard_filter',
      'dashboard_visual','dashboard_visual_config',
      'rls_rule','rls_rule_assignment',
      // Skip volatile: notification, recent_view, session, audit
    ];
    for (const t of tables) {
      const rows = await srcConn.query(`SELECT * FROM "${t}"`);
      if (rows.length === 0) continue;
      // Mass insert with new IDs and remapped FKs (heavy lift)
      await insertRowsWithIdRemap(dstConn, t, rows, idRemap, job.options);
    }

    await OrgCloneJob.update(jobId, {
      status: 'completed', completedAt: new Date(),
    });
  } catch (e) {
    await OrgCloneJob.update(jobId, {
      status: 'failed', error: (e as Error).message,
    });
    throw e;
  }
}
```

Caveats:
- Encrypted secrets (datasource passwords, signing keys) are NOT
  cloned — the new org has to re-enter them. UI surfaces this
  clearly.
- "Skip data" mode (just clone configuration) is the default; data
  is only cloned when explicitly opted in.

### 4.9 Org delete (grace period)

```sql
ALTER TABLE organisation
  ADD COLUMN scheduled_deletion_at timestamptz,
  ADD COLUMN deletion_reason varchar(500);
```

```ts
// POST /admin/orgs/:id/delete  body: { reason, gracePeriodDays }
async function scheduleDelete(req, res) {
  const grace = Math.min(Number(req.body.gracePeriodDays) || 30, 90);
  const when = addDays(new Date(), grace);

  await Organisation.update(req.params.id, {
    scheduledDeletionAt: when,
    deletionReason: req.body.reason,
    status: 0,                                     // disable login immediately
  });

  await auditLogger.logAudit({
    /* master-level audit */
    metadata: { gracePeriodDays: grace, scheduledFor: when, reason: req.body.reason },
  });

  // Send heads-up to every org admin
  await emailEveryOrgAdmin(req.params.id, 'org-deletion-scheduled', { scheduledFor: when });

  return sendResponse(res, true, 200, 'admin.org.delete_scheduled', { scheduledFor: when });
}

// Nightly cron
async function purgeScheduledDeletions() {
  const due = await Organisation.find({
    where: { scheduledDeletionAt: LessThan(new Date()) },
  });
  for (const org of due) {
    await scheduleQueue.add('admin:purge-org', { orgId: org.id });
  }
}
```

Admin can cancel during grace period:

```ts
// POST /admin/orgs/:id/delete/cancel
```

After the grace, the purge job drops the org DB, removes the org row,
and writes a final master-audit entry.

### 4.10 Quota & usage dashboard

```ts
// GET /admin/quota — returns per-domain quotas + usage
async function getQuota(req, res) {
  const orgId = res.locals.orgData.id;
  return sendResponse(res, true, 200, '', {
    users:        { used: 27,   max: 100 },
    storage:      { usedBytes: 1.2e9, maxBytes: 5e9 },
    datasets:     { used: 38,   max: 200 },
    dashboards:   { used: 12,   max: 50 },
    exports24h:   { used: 8,    max: 100 },
    emailsToday:  { used: 19,   max: 1000 },
    embedTokens:  { used: 42,   max: 5000 },     // monthly active embed users
  });
}
```

The UI renders bar gauges; alert via banner when ≥80%.

### 4.11 Feature flag admin

(See cross-cutting Feature Flag Service in BE-implementation §0.1.)

The admin console exposes the org's flag toggles:

```
Feature flags
─────────────
○ Multi-tab dashboards               [○]
● Dataset upload (CSV/XLSX)          [●]   since Aug 12, 2026
○ AI insights                        [○]
● Semantic layer (v0)                [●]   since Oct 03, 2026
● Public share links                 [●]
○ Embed mode (paid tier required)    [○]
○ Custom domains                     [○]
○ SCIM provisioning                  [○]
○ Plugin marketplace                 [○]
```

Only super-admins can flip platform-internal flags; org-admins
can flip per-org flags within their entitlement (e.g. a feature
on their billing tier).

### 4.12 Audit-style access to admin actions

Every admin section emits audit rows. The audit log surface in
the console links directly to each section's audit subset (e.g.
"View admin actions only").

## 5. APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview` | Landing-page stats |
| GET | `/admin/users` | Paginated user list |
| POST | `/admin/users/bulk-import` | CSV import (dry-run supported) |
| POST | `/admin/users/bulk-disable` | Bulk disable (dry-run) |
| POST | `/admin/users/:id/impersonate` | Start impersonation |
| POST | `/admin/impersonate/end` | End impersonation |
| GET | `/admin/quota` | Per-domain usage + caps |
| GET/PUT | `/admin/feature-flags` | Org flag toggles |
| POST | `/admin/orgs/:id/clone` | Clone org (async) |
| GET | `/admin/orgs/clone-jobs/:id` | Clone status |
| POST | `/admin/orgs/:id/delete` | Schedule org deletion |
| POST | `/admin/orgs/:id/delete/cancel` | Cancel pending deletion |
| POST | `/admin/gdpr/access` | Initiate access request |
| GET | `/admin/gdpr/requests` | List recent requests |
| POST | `/admin/gdpr/erasure` | Initiate erasure |
| POST | `/admin/gdpr/erasure/:id/cancel` | Cancel during grace |
| GET | `/admin/audit` | Filterable audit search (links module 19) |
| GET | `/admin/login-activity` | Login activity stream |

## 6. FE specs

(Inline above with each section.)

## 7. Validators

```ts
export const bulkUserImportSchema = z.object({
  // CSV file upload via multipart — schema validation runs row-by-row
});

export const startImpersonationSchema = z.object({
  reason: z.string().min(10).max(255),     // mandatory justification
});

export const gdprAccessSchema = z.object({
  subjectUserId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
});

export const gdprErasureSchema = z.object({
  subjectUserId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  gracePeriodDays: z.number().int().min(0).max(90).default(30),
});

export const cloneOrgSchema = z.object({
  name: z.string().min(2).max(100),
  includeData: z.boolean().default(false),
});

export const scheduleOrgDeletionSchema = z.object({
  reason: z.string().min(10).max(500),
  gracePeriodDays: z.number().int().min(1).max(90).default(30),
});
```

## 8. Test plan

```
ADM-USR-H-01    bulk import CSV dryRun → preview returned, no writes
ADM-USR-H-02    bulk import without dryRun → users created + invites sent
ADM-USR-N-01    duplicate email in CSV → error per row
ADM-USR-H-03    bulk disable revokes sessions + tokens

ADM-IMP-H-01    start impersonation → token with impersonatedBy claim
ADM-IMP-H-02    audit row during session carries actorUserId
ADM-IMP-N-01    impersonate another admin → 403
ADM-IMP-N-02    no reason provided → 400
ADM-IMP-H-03    1h TTL — token expires correctly
ADM-IMP-H-04    end impersonation → session closed, audit IMPERSONATE_END

ADM-GDPR-A-H-01 access request → bundle uploaded, signed URL emailed
ADM-GDPR-A-H-02 signed URL expires after 7 days
ADM-GDPR-E-H-01 erasure request → grace period stored
ADM-GDPR-E-H-02 erasure executes at grace end
ADM-GDPR-E-H-03 erasure cancel during grace works
ADM-GDPR-E-H-04 after erasure: user.email is sentinel
ADM-GDPR-E-H-05 audit rows still reference the (now NULL) user_id
ADM-GDPR-E-H-06 authored datasets/dashboards reassigned to system sentinel

ADM-BULK-H-01   bulk disable dryRun → side-effects preview
ADM-BULK-N-01   ids include user from another org → 400
ADM-CLONE-H-01  org clone → target org created with entities (no secrets)
ADM-CLONE-H-02  status transitions queued → processing → completed
ADM-CLONE-N-01  failure during clone → status=failed with error

ADM-DEL-H-01    schedule delete with 30-day grace → status=0, email sent
ADM-DEL-H-02    cancel before grace end → status restored
ADM-DEL-H-03    purge cron after grace → org row gone + DB dropped

ADM-QUOTA-H-01  quota endpoint returns current usage per domain
ADM-QUOTA-H-02  banner shown when ≥80% on any quota

ADM-FF-H-01     toggle org flag → persists + propagates
ADM-FF-N-01     org-admin can't flip platform-internal flag → 403
```

## 9. Migration & rollout

1. Phase 1 — Admin shell + Overview + Users + Quota + audit links.
2. Phase 2 — Bulk import / disable with dry-run.
3. Phase 3 — Impersonation with banner.
4. Phase 4 — GDPR access flow.
5. Phase 5 — GDPR erasure with grace period.
6. Phase 6 — Org clone.
7. Phase 7 — Org delete with grace period.
8. Phase 8 — Feature flag admin.

Per-org `enableAdminV2` flag during rollout (legacy admin
screens stay accessible behind the flag).

## 10. Open questions

- **Impersonation duration cap** — 1 hour is the proposed default;
  per-org override? Probably yes for support teams, deferred.
- **GDPR erasure reversibility** — within the grace period only.
  After execution it's irreversible. Document loudly.
- **Org clone — should we clone webhooks?** No — they'd
  inadvertently start firing to the customer's production endpoints
  from the staging clone. Clone with secrets stripped, webhook
  status=0 (paused) requiring admin re-enable in the new org.
- **Bulk operations on dashboards** — bulk-publish, bulk-share?
  Not in v1; complex semantics. v2.
- **Customer-self-serve GDPR** — should end users (not just
  admins) be able to file an access request for themselves?
  Likely yes for v1.5; subject-initiated route at
  `/me/gdpr/request-access`.
- **Audit retention on deleted org** — survives at master DB
  level for compliance archive (separate from per-org audit).

## 11. References

- GDPR Art. 15 (right of access): <https://gdpr-info.eu/art-15-gdpr/>
- GDPR Art. 17 (right to erasure): <https://gdpr-info.eu/art-17-gdpr/>
- Linear impersonation: <https://linear.app/docs/admin/impersonate-user>
- Power BI tenant admin: <https://learn.microsoft.com/en-us/power-bi/admin/>
- Notion data portability: <https://www.notion.so/help/export-your-content>

## Appendix · Review additions

- **Impersonation with banner + audit actor** — §4.4.
- **Bulk CSV user import** with dry-run — §4.3.
- **GDPR access** with signed-URL artifact — §4.5.
- **GDPR erasure** with grace period + anonymise-audit pattern — §4.6.
- **Org clone** with secrets stripped — §4.8.
- **Org delete with grace + cancel** — §4.9.
- **Quota dashboard** + per-domain caps — §4.10.
- **Feature flag admin** per org — §4.11.
- **Admin-action audit** with `actorUserId` in impersonation
  context — §4.4.
