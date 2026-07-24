# migration
> Update the Progress log on every change.
> Code path: `src/app/modules/migration` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: Seamless, file-based asset export/import — one-click export of dataset(s)/analysis(es)/dashboard(s) to a portable `.dbexec.json` bundle, and near-zero-click import into any org / environment. This module is service + util only; the UI hooks live on the three asset LIST screens.
- Key files:
  - `services/migration.service.ts` — signal state (`exporting`/`importing`); `exportAssets(items, format)` streams a Blob file download and reads the filename from `Content-Disposition` (timestamped fallback); `importBundle(bundle)` posts the already-validated bundle and returns the `{ createdAssets, newDatasources }` summary.
  - `utils/migration-file.util.ts` — `downloadBlob` + file read/parse helpers.
  - Shared: `shared/validators/migration.ts` — Zod bundle validator, mirrored byte-for-byte with the BE (`DbExecMigrationBundle`, `ExportItem`, `MigrationFormat`).
  - `core/constants/api.constant.ts` → `MIGRATION` (EXPORT `/migration/export`, IMPORT `/migration/import`).
  - UI entry points (NOT in this folder): export/import buttons on `dataset`, `analyses`, `dashboard` list-* components (row + bulk).
- Depends on / depended on by: `HttpClientService`; consumed by the three asset list modules. BE counterpart: `/api/v1/migration` export/import controllers + the mirrored bundle validator + serializer (walks the dependency tree).
- How it works: user picks one/many assets on a list → `exportAssets` POSTs, the BE serializer WALKS dependencies into ONE bundle (export analysis → also its dataset; export dashboard → also its sourceAnalysis + dataset; de-duped by bundle-local handle) + a datasource DESCRIPTOR (host/port/db/user/dbType — never the password, never the source UUID) → a `.dbexec.json` file downloads. Import: drop the file → `importBundle` re-stamps everything to the importer's org (from the JWT, never the file), remaps ids dataset→analysis→dashboard via a bundle-local handle map, and ALWAYS auto-creates a NEW datasource named `{name}_{YYYYMMDD_HHMMSSmmm}` as a STUB (no password → "needs credentials" chip on the datasource list) so there is no name-matching decision. Works identically cross-env and cross-org.
- Decisions: SEAMLESS is the default path (one-click out, near-zero-click in) — the heavier dry-run/mapping wizard is optional/advanced, not default. Auto-create timestamped stub datasource removes the only decision point. Auto-include dependencies (Tableau `.twbx` / Power-BI `.pbix` model) — NO empty `SELECT 1` placeholder dataset. Excluded by default: RLS, shares, alerts, secrets. See memory `seamless-migration-decisions`; global conventions in ../ARCHITECTURE.md.
- Gotchas / constraints: **blob-download interceptor gotcha** — the FE http-request interceptor used to convert ANY `application/json` Blob into a plain object, which broke the download (button 200s, nothing downloads); the fix only swaps the body when `json.code` is ACTIONABLE (440/501/503), else passes the original Blob through. So a failed export returns the envelope as a JSON Blob and the service detects `status === false` to surface the message; a genuine bundle file (also `application/json`) must NOT carry a top-level `code` of 440/501/503 (see `blob-download-interceptor-gotcha`). Org/owner always come from the importer's JWT, never the file (SanitizeOrgInput invariant). Imported datasource is passwordless until a user opens it once.

## 2. Goals
- Objective: frictionless, secretless, cross-env/cross-org asset portability with dependencies bundled automatically.
- Current focus: — none active.
- Next up: the optional/advanced dry-run + mapping wizard (the seamless path shipped first; the wizard is deferred).
- Out of scope by default: RLS rules, shares, alerts, secrets in the bundle.

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: FE migration service + file util + api constants (d4fabae4); export/import UI on dataset/analysis/dashboard lists (c1bf1cc1); "needs credentials" chip on the datasource list for import-stub datasources (26fff24a); mirrored bundle validator tracked (0b504dac); blob-download interceptor fixed so genuine JSON-blob downloads fire (657455f2). Live-verified via `e2e/migration.e2e.ts` (row + bulk export → download → import round-trip). On version_261.
- In progress / Known issues: advanced dry-run/mapping wizard deferred; UI commits reported local-only in memory.
- Next: —
- Files touched: docs/context/modules/migration.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/migration`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/migration.md
