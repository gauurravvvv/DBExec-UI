# audit-logs
> Update the Progress log on every change.
> Code path: `src/app/modules/audit-logs` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The app's audit & activity trail viewer — a filterable infinite-scroll list + right-side detail drawer over the name-denormalized `/audit-logs` contract. One component serves TWO entry points: the global Audit screen and the User-Management → Activity view.
- Key files:
  - `services/audit.service.ts` — signal-based data access; `listAuditLogs()` raw call feeds the table adapter, `getAuditLog(id)` for the drawer, `exportAuditLogs()` (Blob), `verifyAuditChain()` tamper-evidence; also hosts the login-activity sibling calls so both views share one HTTP surface.
  - `components/list-audit-logs/*` — the list; `<app-custom-table>` + `UsServerListAdapter`, module multiselect + action dropdown + actor search + daterange + failures-only toggle + export + integrity badge; `moduleScope` route data locks+hides the module filter; per-row history-icon → `jumpToAssetHistory()` (rootId scope).
  - `components/audit-detail-drawer/*` — self-owned slide-over (no `p-sidebar` backdrop leak); six-question summary + before/after diff table (relational fields shown as NAMES, not ids).
  - `audit-meta.constant.ts` — module icon/label + semantic action-chip class/label maps + filter options. `models/audit-log.model.ts` — row + `ChainVerifyResult`.
  - `core/constants/api.constant.ts` → `AUDIT` (LIST, DETAIL, LOGIN_ACTIVITY*, EXPORT_*, VERIFY, VERIFY_LOGIN_ACTIVITY).
- Depends on / depended on by: `HttpClientService`, `app-custom-table`; the `login-activity` module imports THIS module's `AuditService` + `ChainVerifyResult` model (shared HTTP surface). BE counterpart: explicit in-controller logging via `auditLogger.service.ts` (see memory `audit-log-system` / `audit-usermgmt-rebuilt`).
- Routes: lazy `AuditLogsModule` at `/app/audit` (global) AND `/app/users/activity` (data.moduleScope = `['user','group','role']`), reached via an "Activity" button on the Users list header.
- How it works: NAMES ONLY — the BE denormalizes `actorName`/`entityName` onto every row (frozen at write-time so a deleted actor still shows their name), so this layer passes rows through untouched; no user-join, no raw UUID column. The list drives the custom-table adapter (limit 50, `createdOn DESC`); clicking a row opens the drawer with the full before/after diff. The integrity badge calls `/audit-logs/verify` to confirm the HMAC hash chain.
- Decisions: names-only rebuild (no raw ids anywhere), aggregate-root asset versioning (child edits bump the parent asset's `assetVersion`; filter by `rootId` for full history — a module filter only shows same-module rows), HMAC hash-chain tamper-evidence kept. See memory `audit-usermgmt-rebuilt`; global conventions in ../ARCHITECTURE.md.
- Gotchas / constraints: audit writes are fire-and-forget on the BE — a broken write never surfaces to the user (BE self-heals missing hash/version columns on connect; see `audit-usermgmt-rebuilt`). Exports rely on the blob-download interceptor fix — a JSON-blob file must not carry a top-level `code` of 440/501/503 (see `blob-download-interceptor-gotcha`). `rootId`/`rootType` are filter/row keys only — never displayed. `LoginActivityModule` once broke AOT by importing `ButtonComponent` but not `ChipComponent` — always run the full 3-gate at HEAD.

## 2. Goals
- Objective: a trustworthy, names-only, tamper-evident activity trail with fast per-asset history lookup.
- Current focus: — none active.
- Next up: BE-side audit coverage gaps (execute/export events, before→after diffs on more modules) tracked in memory `audit-log-system` — FE renders whatever the contract carries.
- Out of scope: audit-row grouping UI (deliberately flat infinite-scroll; per-row + drawer jump satisfies the ask).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: names-only list + right drawer + User-Mgmt Activity view (06be2b5b, f310fb8f); login-activity A+ rebuild to parity (421f635a); integrity badge for the hash chain (74e32e39); fast per-asset history — rootId jump + version timeline + entity filter (2623b88c); drawer polish — self-owned slide-over, plain-text "Where" row (c39a76bb, 8d82e356). All on version_261.
- In progress / Known issues: BE audit coverage gaps remain (see `audit-log-system`); UI commits reported local-only in memory.
- Next: —
- Files touched: docs/context/modules/audit-logs.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/audit-logs`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/audit-logs.md
