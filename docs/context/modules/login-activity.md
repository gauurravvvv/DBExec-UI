# login-activity
> Update the Progress log on every change.
> Code path: `src/app/modules/login-activity` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The auth-event trail viewer — a filterable infinite-scroll list + right-side detail drawer over `/audit-logs/login-activity`. Read-only (nothing to add/edit/delete). Sibling of `audit-logs`, same polish.
- Key files:
  - `components/list-login-activity/*` — the list; `<app-custom-table>` + `UsServerListAdapter`, event badge + actor avatar + outcome/origin columns, filter toolbar (event dropdown, actor search, daterange, failures-only toggle, export) + integrity badge.
  - `components/login-activity-drawer/*` — self-owned slide-over detail (no leaked backdrop; working chevron), names-only mapper.
  - `login-activity-meta.constant.ts` — event icon/label/badge maps + filter options. `models/login-activity.model.ts` — the row.
  - `login-activity.module.ts` — declares list + drawer; imports `CustomTableComponent` + standalone `ButtonComponent` AND `ChipComponent`.
- Depends on / depended on by: **reuses `audit-logs`' `AuditService`** (`listLoginActivity`, `getLoginActivity`, `exportLoginActivity`, `verifyLoginActivityChain`) and its `ChainVerifyResult` model — no own service. `HttpClientService`, `app-custom-table`. BE counterpart: separate `login_activity`/`login_activity_s` entities + `logLoginActivity*` (NOT mixed into audit_log); `mapLoginActivityRow` drops internal ids.
- Routes: lazy `LoginActivityModule` at `/app/audit/logins`; sidebar row `loginActivity`.
- How it works: NAMES ONLY — the BE `mapLoginActivityRow` already strips ids; `username` renders with an "Unknown user" fallback. The list drives the custom-table adapter (limit 50, `createdOn DESC`); clicking a row opens the drawer. The integrity badge calls `/audit-logs/login-activity/verify` for the HMAC chain over the login trail.
- Decisions: A+ rebuild to full audit-list parity (event list + rich filters + own drawer); tamper-evidence hash chain extended to login-activity too (see memory `audit-usermgmt-rebuilt`). Global conventions in ../ARCHITECTURE.md.
- Gotchas / constraints: the module MUST import `ChipComponent` (not just `ButtonComponent`) or AOT breaks with "app-button is not a known element" cascade — this exact bug shipped and was fixed (f4607436); always run the full 3-gate at HEAD. Export relies on the blob-download interceptor fix (JSON-blob file must not carry `code` 440/501/503). Login-activity is a DISTINCT entity from audit_log — don't conflate.

## 2. Goals
- Objective: a clean, names-only, tamper-evident login/auth trail matching the audit list's polish.
- Current focus: — none active.
- Next up: —
- Out of scope: mutations of any kind (read-only trail).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: A+ rebuild — event list + detail drawer + rich filters (421f635a); AOT compile fix — import ChipComponent (f4607436); integrity badge for the login hash chain (74e32e39); self-owned drawer overlay + working detail chevron (421b536d); sticky-header/frozen-column table fix (ec427b61). Reuses `audit-logs` `AuditService`. On version_261.
- In progress / Known issues: UI commits reported local-only in memory.
- Next: —
- Files touched: docs/context/modules/login-activity.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/login-activity`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/login-activity.md
