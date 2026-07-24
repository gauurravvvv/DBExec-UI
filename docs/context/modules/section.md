# section
> Update the Progress log on every change.
> Code path: `src/app/modules/section` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: standalone CRUD for **Section** entities — the middle level of the legacy Prompt/QueryBuilder composition tree (Tab → Sections → Prompts). A thin list/add/edit/view module.
- Key files: `components/{list-section,add-section,edit-section,view-section}` (screen quartet), `services/section.service.ts` (signal state: `sections`/`total`/`current` + read-cancel Subject), `section-routing.module.ts` (`''`/`new`/`:id`/`:id/edit`).
- Depends on / depended on by: BE `/sections` (LIST/ADD/GET/UPDATE/DELETE/BULK_DELETE + `/sections/:sectionId/prompts?queryBuilderId=&tabId=`). Depends on the `tab` module — add-section injects `TabService` and its form has `tabGroups` (a FormArray of `{ tab, sections }`) picking a parent Tab. Feeds the `prompt`/`query-builder` legacy flow. Endpoints gated server-side by the `analyses` permission.
- How it works: standard signal-service + app-custom-table module — `load(params)` → `/sections` (server-paged); add/edit are reactive forms behind `unsaved-changes.guard`. A Section groups prompts under a Tab; the add form builds `tabGroups` (tab → its sections) and warns on duplicates (`hasDuplicates`). Prompts under a section are fetched via `/sections/:id/prompts`.
- Decisions: uses the shared app-custom-table + `.confirmation-popup` delete pattern; part of the [[custom-table-standard]] migration. See ../ARCHITECTURE.md for tenancy/auth/list conventions.
- Gotchas / constraints:
  - Legacy module tied to the older Prompt/QueryBuilder concept — distinct from the analyses **tab/section** authoring surfaces. Do not conflate.
  - Gated by the `analyses` permission, not a dedicated `section` permission.
  - Add form surfaces a duplicate-warning (`hasDuplicates`) when the same tab/section pairing is repeated in the FormArray.

## 2. Goals
- Objective: a stable, convention-following CRUD surface for the legacy composition tree's Section level.
- Current focus: — none active.
- Next up: —
- Out of scope: the analyses authoring surfaces; visual/dashboard building.

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: standard list/add/edit/view CRUD over `/sections` (tab-grouped add form, duplicate warning, prompts lookup); RBAC per-button gating + Actions-column hide from the app-wide sweep (bfe557d6/53c57624); skeleton-loading + read-cancellation (66fe8f41); dropped fixed max-height on dialog form bodies (ef88920c); autocomplete-off (ea9c8a8a).
- In progress / Known issues: none module-specific. version_261 FE commits are **local-only, not pushed** (user pushes).
- Next: —
- Files touched: docs/context/modules/section.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/section`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/section.md
