# 02 · Organisation + System Admin — Deep Test Cases

> Super-admin-only screens. Skipped without `E2E_SUPER_USER` env vars.

## Scope
- `/app/organisations` CRUD
- `/app/admins` system-admin CRUD
- `/orgs/refresh-master-db`
- System admin permission contract (denied for per-org routes)

## Fixtures
- Existing super admin `sa_root` / `Pass@1234`
- Org `TestOrg` with bootstrap admin
- Empty org slot for create tests

## Cases

### Org CRUD — happy
- **ORG-H-01** · Create org with valid DB config; row appears. P0
- **ORG-H-02** · Edit description; reflected after reload. P1
- **ORG-H-03** · Soft-delete org; users in that org can't log in. P0
- **ORG-H-04** · Edit DB host; refresh-master-db; queries route to new host. P1
- **ORG-H-05** · Filter list "all" shows soft-deleted. P2

Steps for ORG-H-01:
1. Sign in as super admin.
2. `/app/organisations` → **+ New**.
3. Fill name, description, DB host/port/db/user/password, pepperKey (32 chars), admin email.
4. Submit.
**Expected**: 201; org id returned; bootstrap admin gets welcome email; new admin can sign in and lands at `/app/home`.

### Org CRUD — negative
- **ORG-N-01** · Name with disallowed chars → reject. P0
- **ORG-N-02** · Duplicate org name (case-insensitive) → 409 ALREADY_EXISTS. P0
- **ORG-N-03** · Admin email malformed → reject. P0
- **ORG-N-04** · DB host invalid → connection-test fails fast; error points at host. P0
- **ORG-N-05** · Port out of range → reject. P0
- **ORG-N-06** · DB credentials wrong → driver error sanitised. P0
- **ORG-N-07** · Pepper key < 32 chars → reject. P0
- **ORG-N-08** · Pepper key whitespace-only → reject. P0
- **ORG-N-09** · Admin email matches existing system-admin email → cross-table unique reject. P1
- **ORG-N-10** · Encryption algorithm not in supported set → reject. P1
- **ORG-N-11** · sessionInactivityTimeout < 1 or > 1440 → reject. P1
- **ORG-N-12** · accountLockDurationHours < 0 → reject. P2
- **ORG-N-13** · passwordHistoryLimit < 0 → reject. P2
- **ORG-N-14** · maxLoginAttempts < 1 → reject. P2
- **ORG-N-15** · Org-admin token GET `/orgs/list` → 401. P0 🟣

### Org CRUD — edge
- **ORG-E-01** · Org created but welcome email fails → 200 + warning flag. P1
- **ORG-E-02** · Refresh master DB mid-query → in-flight on old pool finishes; new uses refreshed. P1
- **ORG-E-03** · Two super admins edit same org concurrently → second sees stale-row prompt. P1
- **ORG-E-04** · Re-create org with name of soft-deleted org → policy (decide: reserve / allow). P2
- **ORG-E-05** · Long org name (64 chars exactly) → accepted. P2
- **ORG-E-06** · Unicode in org name → accepted; sortable in list. P2

### System Admin
- **SA-H-01** · Create SA → welcome email → SA logs in; sees ONLY Home / System Mgmt / Audit / App Settings. P0
- **SA-H-02** · Update SA name; reflected next login. P1
- **SA-H-03** · Unlock SA after 5 wrong attempts. P0
- **SA-H-04** · SA changes own password via Profile. P0

- **SA-N-01** · Org-admin token GET `/system-admins/list` → 401. P0
- **SA-N-02** · SA tries per-org route → bounced (no per-org permission). P0
- **SA-N-03** · Create SA with email matching existing org-admin → reject. P1
- **SA-N-04** · Delete last active SA → reject "at least one SA required". P0
- **SA-N-05** · SA dismisses org-scoped announcement → 401. P1

- **SA-E-01** · Soft-deleted SA cannot log in; audit row captures attempt. P1
- **SA-E-02** · SA's session invalidated when another SA soft-deletes them. P1

### Security
- **ORG-S-01** · Cross-org probe with crafted UUID → 404. P0 🟣
- **ORG-S-02** · DB password not echoed in any GET response. P0 🟣
- **ORG-S-03** · Refresh-master-db gated by super-admin permission. P0
- **SA-S-01** · SA cannot impersonate (impersonation requires explicit support permission). P0

## Regression buckets
- DB config changed → ORG-H-04, ORG-N-04..06, ORG-E-02
- Password policy changed → SA-H-04, ORG-N-11..14
