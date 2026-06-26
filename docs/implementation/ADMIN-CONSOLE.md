# Admin console & org settings

> Implementation companion to research module 24. Pins the
> unified shell, user/group bulk import (CSV with dry-run),
> impersonation banner + audit, GDPR right-to-access &
> right-to-erasure, org clone, scheduled org delete with grace,
> quota dashboards, and per-org feature flags.

**Status:** 🟡 partial — some user/group admin pages exist;
nothing unified; no impersonation, no GDPR, no clone.
**Effort:** L (~4 weeks).

---

## 0. Problem statement

Org admins need one place to do everything admin-y. Today it's
scattered. Customer success engineers need impersonation (with
strong audit). Legal needs GDPR controls. Sales needs a way to
clone the demo org. This module unifies it all.

---

## 1. The shell

A new route `/admin` with a left nav:

```
[Admin]
  • Overview              KPIs + quota panel + announcement
  • Users                 list, invite, bulk import (CSV)
  • Groups                CRUD + memberships
  • Roles & permissions   per-role matrix
  • SSO & MFA             links to module 10 settings
  • API tokens            list, create, revoke
  • Branding              links to module 20
  • Notifications         org defaults + announcements
  • Data sources          list, health, secrets rotation
  • Datasets              org-wide list + ownership
  • Dashboards            org-wide list + audit
  • Subscriptions         org-wide
  • Quota & billing       usage panels
  • Audit log             module 19 viewer
  • Backups & restore     module 28
  • GDPR                  right-to-access, right-to-erasure
  • Org settings          name, default locale, retention…
  • Danger zone           clone, scheduled delete
```

Implemented as a lazy-loaded module under `src/app/modules/admin/`
with child routes per section.

---

## 2. Bulk user import (CSV)

```typescript
// src/controllers/admin/bulkImportUsers.ts
interface CsvUserRow {
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  groups?: string;       // comma-separated names
  attributes?: string;   // 'territory=APAC,region=AP'
}

const bulkImportUsers = async (req: Request, res: Response) => {
  const { csv, dryRun } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const rows = parseCsv(csv) as CsvUserRow[];
    const issues: Array<{ line: number; code: string; message: string }> = [];
    const plan: Array<{ line: number; action: 'create' | 'update' | 'skip'; row: CsvUserRow }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isEmail(row.email)) { issues.push({ line: i + 1, code: 'BAD_EMAIL', message: row.email }); continue; }
      const existing = await connection.getRepository('User').findOne({ where: { email: row.email, orgId: orgData.orgId } });
      plan.push({ line: i + 1, action: existing ? 'update' : 'create', row });
    }

    if (dryRun) {
      await master_db_connection.close();
      return sendResponse(res, true, CODE.SUCCESS, ADMIN_MSG.OK, { issues, plan, applied: false });
    }
    if (issues.length) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, ADMIN_MSG.HAS_ISSUES, { issues });
    }

    let created = 0, updated = 0;
    await connection.transaction(async (tx: any) => {
      for (const item of plan) {
        if (item.action === 'create') {
          const u = await tx.getRepository('User').save({
            orgId: orgData.orgId, email: item.row.email,
            firstName: item.row.firstName, lastName: item.row.lastName,
            status: 'invited',
          });
          if (item.row.groups) {
            const names = item.row.groups.split(',').map(s => s.trim());
            for (const name of names) {
              const g = await tx.getRepository('Group').findOne({ where: { orgId: orgData.orgId, name } });
              if (g) await tx.getRepository('UserGroup').save({ userId: u.id, groupId: g.id });
            }
          }
          if (item.row.attributes) await setUserAttributes(tx, u.id, parseAttributes(item.row.attributes));
          sendInviteEmail(u.email, u.firstName);  // module 16
          created++;
        } else {
          await tx.getRepository('User').update({ email: item.row.email, orgId: orgData.orgId },
            { firstName: item.row.firstName, lastName: item.row.lastName });
          updated++;
        }
      }
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.USER, action: AUDIT_ACTIONS.BULK_IMPORT,
      entityName: 'BulkImport', entityId: orgData.orgId,
      metadata: { created, updated, total: plan.length },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, ADMIN_MSG.OK, { created, updated, applied: true });
  } catch (err: any) {
    Logger.error(`Bulk import failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

UI: upload CSV → "Dry run" pre-check → review issues +
action plan → "Apply".

---

## 3. Impersonation

```sql
CREATE TABLE impersonation_session (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  admin_user_id UUID NOT NULL REFERENCES "user"(id),
  subject_user_id UUID NOT NULL REFERENCES "user"(id),
  reason        TEXT NOT NULL,                            -- mandatory
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  jwt_id        TEXT NOT NULL,                            -- ties to issued JWT
  ip            INET,
  user_agent    TEXT
);
```

Start impersonation:

1. Admin selects user + must enter a reason (≥10 chars).
2. Server issues a JWT with both `userId: subject.id` (so all
   queries run as the subject) AND `impersonatorUserId: admin.id`
   (so audit captures both).
3. All audit rows during this session set `impersonator_user_id`.
4. FE renders a sticky **pink banner** "Impersonating <user> —
   [Exit impersonation]".
5. Exit ends the session, returns admin to their own JWT.

Limits:

- Only `org_admin` or `super_admin` can impersonate.
- Cannot impersonate other admins (prevents lateral escalation).
- Session max 1 hour; auto-ends on timeout.
- All side-effects (writes, exports) audit-logged with both
  actor IDs.

```typescript
// JWT verifier hook
if (claims.impersonatorUserId) {
  res.locals.impersonatorUserId = claims.impersonatorUserId;
  res.locals.bannerNotice = 'impersonation_active';
}
```

---

## 4. GDPR right-to-access

```sql
CREATE TABLE gdpr_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisation(id),
  kind          TEXT NOT NULL CHECK (kind IN ('access','erasure')),
  subject_user_id UUID NOT NULL,
  requested_by  UUID NOT NULL REFERENCES "user"(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','ready','delivered','cancelled','failed')),
  output_url    TEXT,                                       -- signed S3 URL when ready
  output_expires_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,                                -- erasure grace
  cancelled_at  TIMESTAMPTZ,
  processed_at  TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.1 Access flow

1. Admin opens GDPR → Access tab → search user.
2. Click "Compile data package".
3. Worker collects: user profile, audit history, dashboards
   owned, analyses owned, comments, share-link views — into a
   ZIP.
4. ZIP uploaded to S3 with 7-day signed URL.
5. Email to subject with download link.

### 4.2 Erasure flow

1. Admin opens GDPR → Erasure tab → search user.
2. Click "Schedule erasure" → confirmation modal showing
   downstream impact (owned dashboards, comments, etc.).
3. Status `pending`, `scheduled_for = NOW() + 30 days`.
4. **Cancellable** during grace period.
5. After grace: worker runs erasure transaction:
   - Anonymise audit rows: replace `actor_name` with
     `[redacted]`, `email_hash` set, keep `actor_user_id` for chain.
   - Cascade-delete: notifications, recent_views, favourites,
     mfa_factors, push_subscriptions, share_link_views.
   - User row: set `email = 'redacted-<uuid>@deleted.dbexec'`,
     `first_name = ''`, `last_name = ''`, `status = 'deleted'`.
6. Audit the erasure itself.

```typescript
// src/controllers/admin/gdpr/erase.ts
const eraseSubject = async (req: Request, res: Response) => {
  const { gdprRequestId } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;
  try {
    const r = await connection.getRepository('GdprRequest').findOne({ where: { id: gdprRequestId } });
    if (!r || r.kind !== 'erasure' || r.status !== 'pending') {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, GDPR_MSG.BAD_STATE);
    }
    if (r.scheduledFor > new Date()) {
      await master_db_connection.close();
      return sendResponse(res, false, CODE.BAD_REQUEST, GDPR_MSG.GRACE);
    }

    await connection.transaction(async (tx: any) => {
      await anonymiseUser(tx, r.subjectUserId);
      await tx.getRepository('GdprRequest').update({ id: r.id },
        { status: 'delivered', processedAt: new Date() });
    });

    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.GDPR, action: AUDIT_ACTIONS.ERASE,
      entityName: 'User', entityId: r.subjectUserId,
      metadata: { gdprRequestId: r.id, scheduledFor: r.scheduledFor },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, GDPR_MSG.OK);
  } catch (err: any) {
    Logger.error(`Erase subject failed: ${err.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
```

---

## 5. Org clone

```sql
CREATE TABLE org_clone_job (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_org_id UUID NOT NULL REFERENCES organisation(id),
  target_org_id UUID REFERENCES organisation(id),
  target_name   TEXT NOT NULL,
  scope         JSONB NOT NULL,                       -- {users, dashboards, datasets, datasources, secrets}
  status        TEXT NOT NULL DEFAULT 'pending',
  progress      INTEGER,                                -- 0..100
  created_by    UUID NOT NULL REFERENCES "user"(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error         TEXT
);
```

Worker iterates: org row → users (with stripped passwords) →
groups → datasources (with **secrets stripped** — clone target
must reconfigure) → datasets → analyses → dashboards →
notifications → branding.

UUIDs are re-minted; a lookup map persists the source→target
mapping so cross-references remap correctly.

Use case: spin a sandbox copy for an internal staging exercise,
or convert a "demo" org into a customer's real org.

---

## 6. Scheduled org delete

```sql
ALTER TABLE organisation
  ADD COLUMN scheduled_delete_at TIMESTAMPTZ,
  ADD COLUMN scheduled_delete_by UUID REFERENCES "user"(id);
```

Admin clicks "Delete org" → enters org name to confirm →
`scheduled_delete_at = NOW() + 7 days`. UI shows a red
countdown banner across the org for the grace period. "Cancel
deletion" reverts.

After grace: worker drops org's shared DB, removes master rows,
moves backups to legal-hold archive (module 28), revokes
custom-domain certs.

---

## 7. Quota dashboard

```sql
CREATE TABLE org_quota_snapshot (
  org_id        UUID NOT NULL REFERENCES organisation(id),
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  users_count   INTEGER,
  dashboards_count INTEGER,
  datasets_count INTEGER,
  storage_bytes BIGINT,
  ai_session_count_24h INTEGER,
  scheduled_email_count_30d INTEGER,
  PRIMARY KEY (org_id, taken_at)
);
```

Nightly cron snapshots; admin sees a panel with progress bars
and 30-day trend lines.

---

## 8. Per-org feature flags

```sql
CREATE TABLE feature_flag (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organisation(id),    -- null = global
  user_id     UUID REFERENCES "user"(id),          -- null = applies to all in scope
  flag        TEXT NOT NULL,                       -- 'feature.ai_dashboard_generate'
  is_enabled  BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES "user"(id)
);
CREATE UNIQUE INDEX uq_feature_flag_scope ON feature_flag(flag, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                                                COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

Lookup precedence: user-scoped > org-scoped > global default.

Admin UI: feature toggles per org with a search bar.

---

## 9. Observability

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_admin_action_total` | counter | `action` | which admin features get used |
| `dbexec_impersonation_active` | gauge | — | concurrent impersonations |
| `dbexec_impersonation_session_ms` | histogram | — | session duration |
| `dbexec_gdpr_request_total` | counter | `kind`, `status` | compliance pipeline |
| `dbexec_org_clone_ms` | histogram | — | clone perf |
| `dbexec_org_scheduled_delete_total` | counter | — | scheduled (need ops alert) |
| `dbexec_org_quota_used_pct` | gauge | `org`, `resource` | per-org headroom |

---

## 10. Security & threat model

| Threat | Mitigation |
|---|---|
| Lateral admin escalation via impersonation | Cannot impersonate other admins; impersonation requires reason; impersonator_user_id in every audit row |
| Bulk import abuse (admin invites 10k attackers) | Per-import row cap (1000) + per-org daily cap |
| GDPR access ZIP leaks PII to wrong inbox | Subject must verify identity via second-factor before download; signed URL expires in 7 days |
| Erasure during legal hold | Module 28 legal-hold flag blocks erasure with a clear error |
| Org clone leaks source secrets | Secrets explicitly stripped; target must reconfigure |
| Org delete bypass (race during grace) | Delete worker checks `scheduled_delete_at <= NOW()` AND `scheduled_delete_by IS NOT NULL` |
| Feature flag DoS (admin disables critical feature) | Critical flags whitelist; require super-admin |
| Quota miscount | Snapshots taken in tx; cross-checked daily by reconciliation job |

---

## 11. Runbook

**Symptom: impersonation banner stuck after exit.**
1. JWT not refreshed. Force-refresh via `/auth/refresh`.
2. localStorage stale; clear.

**Symptom: GDPR access export missing data.**
1. Compiler skipped a source. Re-run with `?verbose=1` to
   surface per-source row counts.

**Symptom: clone fails midway.**
1. `org_clone_job.error` populated. Resume from last
   completed entity via `/admin/clone/:id/resume`.

**Symptom: scheduled delete fired during grace.**
1. Race condition; check audit log for the worker invocation.
   Manual rollback may not be possible — restore from backup
   (module 28).

---

## 12. Perf budget

| Operation | p50 | p95 | Hard ceiling |
|---|---|---|---|
| Bulk import dry-run (100 rows) | 200 ms | 800 ms | 5 s |
| Bulk import apply (100 rows) | 1 s | 3 s | 30 s |
| GDPR access compile (1 user, 5k audit rows) | 30 s | 90 s | 5 min |
| Org clone (10 dashboards, 50 analyses) | 2 min | 8 min | 30 min |
| Feature flag lookup | < 1 ms | 2 ms | 10 ms |
| Quota panel render | 80 ms | 250 ms | 1 s |

---

## 13. Migration & rollout

1. **Migrations:** `impersonation_session`, `gdpr_request`,
   `org_clone_job`, `org_quota_snapshot`, `feature_flag`;
   columns on `organisation` for scheduled delete.
2. **Backfill:** existing audit log gets `impersonator_user_id = NULL`.
3. **Feature flag:** `feature.admin_v2`. New admin shell behind
   the flag until existing scattered admin pages are replaced.
4. **GDPR:** ship right-to-access first (easier); erasure
   second (cascade is fragile).

---

## 14. Open questions

1. **Sub-org hierarchy** — enterprise customer wants "Acme HQ →
   Acme APAC → Acme EU". Big lift. Defer.
2. **Audit export to SIEM** — Splunk / Datadog HEC integration.
   Add as v2.
3. **Customer-portal self-serve** — non-DBExec-admin customers
   want their own panel. Maps to "tenant of a tenant". Defer.

---

## 15. References

- [24-admin-console.md](../research/modules/24-admin-console.md)
- [10-auth-rbac-sso.md](../research/modules/10-auth-rbac-sso.md)
- [19-audit-observability.md](../research/modules/19-audit-observability.md)
- [28-backup-restore.md](../research/modules/28-backup-restore.md)
- GDPR Art. 15 (access), Art. 17 (erasure)
- Stripe impersonation UX pattern
