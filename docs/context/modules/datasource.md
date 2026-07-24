# datasource
> Update the Progress log on every change.
> Code path: `src/app/modules/datasource` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: CRUD for database connections (datasources) + connection testing + schema/table/column introspection consumed by the dataset editor & query executor. Six engines supported: postgres, mysql, mariadb, mssql, oracle, snowflake.
- Key files:
  - `services/datasource.service.ts` — signal-state service; all HTTP. `buildEnginePayload()` is the load-bearing bit: discriminated on `type` (TypeORM engines → host/port/database; Snowflake → account/warehouse/role/schemaName, no host/port).
  - `constants/database-types.constant.ts` — the 6-engine table (value/label/iconClass/defaultPort/isSnowflake) + `isSnowflakeType()` helper; drives which fields the form renders.
  - `components/{list,add,edit,view}-datasource` — the standard REST quartet. `view-datasource` has a hero health-pill + Usage donut (ngx-echarts) + Activity timeline.
- Depends on: `OrganisationService.validateDatasource` was the original test-connection path; now `DatasourceService.testConnection` (unsaved) + `testConnectionForExisting(id)` (saved-creds re-test). `HttpClientService`, `DATASOURCE` in api.constant / routes.constant.
- Depended on by: **dataset** (schema tree + runQuery preview), **query-runner connections** (a QueryConnection points at a datasource), **rls-rules / analyses / dashboard** (datasource filter pickers), **db-access** (datasource picker), **migration** ("needs credentials" stub datasources).
- How it works: List = `app-custom-table` + `UsServerListAdapter` (server paging 50, createdOn DESC, `?search=` + optional filters). Add/Edit → `buildEnginePayload` → POST/PUT `/datasources`. Test-connection posts the same shape to `/datasources/validate` (with `{id}` only, for saved re-test). Schema introspection is a 3-level lazy fetch: `/schemas` → `/schemas/:s/tables` → `/schemas/:s/tables/:t/columns` (the add-dataset editor pre-warms these with `skipLoader:true`). BE stores passwords encrypted; test persists `lastTestedAt`/`lastTestStatus` on the row.
- Decisions: signal loading convention (`loading`/`saving`/per-id `_deleting`, all `skipLoader:true`); reads pipe through `_cancelReads$` so ngOnDestroy aborts in-flight GETs. Engine icons are local SVGs (`ci-db-*`) — no remote logo dependency. See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: Snowflake has no host/port — never send them (BE discriminated-union Zod drops unknowns silently, so getting the shape right matters). `bulkDelete` method still exists in the service but app-wide bulk-select was removed — per-row delete only. Delete/update carry a `justification` (audit). The BE ad-hoc `runQuery` here bypasses RLS (RLS-P2-1 known defect — see rls-rules doc).

## 2. Goals
- Objective: A datasource can be created, credential-tested, introspected, edited, and safely deleted (with dependency awareness) across all 6 engines.
- Current focus: — none active.
- Next up: —
- Out of scope: query execution UI (that's query-runner), semantic modelling (dataset).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: Full CRUD + connection-test + 3-level schema introspection across 6 engines is shipped and stable. view-datasource has health pill, Usage donut (`/usage` counts of dependent datasets/analyses/dashboards) and Activity timeline (`/activity` last-20 audit events). Migrated to `app-custom-table` (custom-table-standard rollout) with auto-select-first-datasource dropped in favour of the ungated list pattern. Reference-data DB-driven dropdowns + paginator removal (3d27b282). Migration export/import gave the list a "needs credentials" chip for imported stub datasources (26fff24a). Admin-modules→`app-chip` refactor (481422e7). RBAC-gated CUD buttons.
- In progress / Known issues: none module-specific. Note the platform-level RLS bypass on the ad-hoc `/datasources/:id/query` endpoint (RLS-P2-1).
- Next: —
- Files touched: docs/context/modules/datasource.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/datasource`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/datasource.md
