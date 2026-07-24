# data-transfer

> Update the Progress log on every change.
> Code path: `src/app/modules/data-transfer` · Status: ⚪ planned · Last updated: 2026-07-24

## 1. Context
- Responsibility: FE for **Postgres→Postgres table/schema DATA migration**. A **Migration Jobs** list (statuses: Queued/Running/Completed/Failed/Cancelled/Partial) + a **New Migration** wizard (pick source & destination datasources → browse source schema/table tree → select tables → map each to create-new or existing target → Start) + a **job detail** page with a **live rows-copied counter** over WebSocket. Never blocks the UI with a loader. Distinct from the `migration` module (asset JSON export/import) — this moves real row data. Talks to BE `/api/v1/data-transfer`.
- Key files (planned):
  - `services/data-transfer.service.ts` — signals (`jobs`, `loading`, `saving`, per-id `cancelling`/`resuming`); `listSourceSchemas(dsId)`, `listSourceTables(dsId, schema)`, `preflight(payload)`, `createJob(payload)`, `listJobs(page)`, `getJob(id)`, `cancelJob(id)`, `resumeJob(id)`, `deleteJob(id)`; thin WS subscription helper for `data-transfer:<jobId>` progress.
  - `components/list-data-transfer/` — jobs list on `app-custom-table` (server adapter 50, `createdOn DESC`), status `app-chip`, live counter column, New Migration toolbar button.
  - `components/new-data-transfer/` — 4-step wizard: Endpoints → Select tables (schema→table tree, checkboxes, est rows + no-PK hint) → Map targets (create-new / existing + inline preflight + truncate-first) → Review & Start.
  - `components/view-data-transfer/` — overall + per-table progress bars, live counters, status chips, Cancel/Resume; WS subscribe with poll fallback.
  - `shared/validators/dataTransfer.ts` (mirrored byte-for-byte with BE); `core/constants/api.constant.ts` `DATA_TRANSFER` group; `core/constants/routes.constant.ts`; `permissions.constant.ts` `dataTransfer`.
- Depends on / depended on by: `HttpClientService`; datasource picker service (endpoint selection); shared UI kit (`app-custom-table`, `app-chip`, `app-button`, `app-custom-dropdown`, stepper); the shared WebSocket client used by notifications. BE counterpart: `DBExec-API` `data-transfer` module.
- How it works: wizard collects source/dest + table selections + per-table target mode, calls `POST /preflight` for a friendly compatibility report, then `POST /jobs` which returns instantly (BE enqueues to a separate worker via `pg-boss`; the API does no data work). FE navigates to the detail page and subscribes to the WS topic to render the live counter — progress originates in the worker and reaches the browser via the BE's `NOTIFY dt_progress` → API `LISTEN` → WS relay. The list badge flips Running→Completed live from the same WS events; if the socket drops, it falls back to polling `GET /jobs/:id` (DB row is source of truth). FE is unaffected by the worker/queue choice — it only talks to the API over REST + WS.
- Decisions: mirror the BE spec (`../../DBExec-API/docs/superpowers/specs/2026-07-24-data-transfer-db-migration-design.md`, memory `data-transfer-feature`). No blocking loader — skeleton rows + per-row spinners (`{skipLoader:true}` convention). Postgres-only gating shown in the wizard. Named `data-transfer` to avoid colliding with the asset-export `migration` module.
- Gotchas / constraints: verify gate is `tsc → ngc --noEmit → ng build --configuration production` (ngc catches template refs). All strings are i18n keys across 10 locales. Tokens only (no hard-coded color/spacing). The Zod validator must stay byte-identical to the BE file. Overlays `appendTo="body"`. Sidebar nav entry gated by `data.permission='dataTransfer'` via `role.guard`.

## 2. Goals
- Objective: a smooth, never-stuck jobs UI with a real-time counter for large multi-table migrations.
- Current focus: — design approved (2026-07-24); not yet built.
- Next up: built in FE Slice F after BE slices A–E; see the BE spec's build-slice order.
- Out of scope (v1): non-Postgres source/dest, transformation/column-mapping UI, FK options (later toggle).

## 3. Progress (newest first)
### 2026-07-24 — Architecture note: BE moved to separate worker + pg-boss
- Done: No FE contract change. Recorded that the BE runs transfers in a separate worker process (`pg-boss`) and bridges progress worker→API `LISTEN/NOTIFY`→WS; the FE still just POSTs jobs and subscribes over WS (unchanged). Spec §4.7–4.9, §13 updated on the API side.
- In progress: —
- Next: FE Slice F (after BE A–E).
- Blockers: — (awaiting user go-ahead to build).
- Files touched: docs/context/modules/data-transfer.md

### 2026-07-24 — Designed (planned)
- Done: FE design captured as part of the full spec (`../../DBExec-API/docs/superpowers/specs/2026-07-24-data-transfer-db-migration-design.md` §7). Screens, service surface, WS subscription + poll fallback, nav/permission defined.
- In progress: —
- Next: FE Slice F (after BE A–E).
- Blockers: — (awaiting user go-ahead to build).
- Files touched: docs/context/modules/data-transfer.md, docs/context/INDEX.md
