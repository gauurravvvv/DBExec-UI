# tab
> Update the Progress log on every change.
> Code path: `src/app/modules/tab` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: standalone CRUD for **Tab** entities — the top level of the legacy Prompt/QueryBuilder composition tree (Tab → Sections → Prompts). A thin list/add/edit/view module; NOT the modern analyses tab strip.
- Key files: `components/{list-tab,add-tab,edit-tab,view-tab}` (screen quartet), `services/tab.service.ts` (signal state: `tabs`/`total`/`current` + read-cancel Subject), `tab-routing.module.ts` (`''`/`new`/`:id`/`:id/edit`).
- Depends on / depended on by: BE `/tabs` (LIST/ADD/GET/UPDATE/DELETE/BULK_DELETE + `/tabs/tree` + `/tabs/:tabId/sections`). Consumed by the `section` module (add-section picks a parent Tab) and the `prompt`/`query-builder` legacy composition flow. Endpoints are gated server-side by the `analyses` permission (READ for list, WRITE for CUD).
- How it works: standard signal-service + app-custom-table module — `load(params)` → `/tabs` (server-paged); add/edit are reactive forms behind `unsaved-changes.guard`. Tab is a lightweight named container; its sections (child records) and their prompts are managed in the `section`/`prompt` modules. `/tabs/tree` returns the whole Tab→Section→Prompt hierarchy for the composition UI.
- Decisions: migrated from us-data-grid/AG Grid to `app-custom-table` (64f8a947, following the [[custom-table-standard]]). Interceptor port fallback 9058 added in the same commit. See ../ARCHITECTURE.md for tenancy/auth/list conventions.
- Gotchas / constraints:
  - Legacy module tied to the older Prompt/QueryBuilder concept — distinct from the analyses **tab strip** (that lives inside `edit-analyses` via `analysis-tabs.service`, not here). Do not conflate the two.
  - Gated by the `analyses` permission, not a dedicated `tab` permission.

## 2. Goals
- Objective: a stable, convention-following CRUD surface for the legacy composition tree's Tab level.
- Current focus: — none active.
- Next up: —
- Out of scope: the analyses tab strip; visual/dashboard authoring.

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: standard list/add/edit/view CRUD over `/tabs`; migrated to app-custom-table + interceptor 9058 port fallback (64f8a947, earlier us-data-grid step bc293c9f); RBAC per-button gating + Actions-column hide inherited from the app-wide sweep (53c57624); reference-data dropdowns + paginator removal (3d27b282); autocomplete-off (ea9c8a8a).
- In progress / Known issues: none module-specific. version_261 FE commits are **local-only, not pushed** (user pushes).
- Next: —
- Files touched: docs/context/modules/tab.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/tab`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/tab.md
