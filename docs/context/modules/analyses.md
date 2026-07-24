# analyses
> Update the Progress log on every change.
> Code path: `src/app/modules/analyses` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: the BI authoring studio — list analyses, and in `edit-analyses` build a versioned analysis: multi-tab canvas, per-tab visuals (60+ echarts types + KPI/number cards + tables), typed filters, analysis parameters, cross-filter/drill, undo/redo, then publish a dashboard snapshot.
- Key files:
  - `components/edit-analyses` — the studio (~4.7k-line component): tab strip, canvas, authoring history, save/publish orchestration.
  - `components/list-analyses` — app-custom-table list + Dataset-name column + optional datasource filter + Share/Duplicate/Delete/Export-import row actions.
  - `components/view-analyses` — read-only render.
  - `components/{chart-renderer,kpi-card,table-visual,visual-config-sidebar,visuals-chart-sidebar,analysis-widget-editor}` — render + config surfaces.
  - `components/{analysis-filter-bar,filter-dialog,typed-value-input,analysis-parameter-bar}` — filter/param authoring (dataType→control).
  - `services/analyses.service.ts` — list/view/duplicate + `updateAnalyses` (versioned save) + `runAnalysisQuery` + per-visual endpoints.
  - `services/{analysis-tabs,analysis-widgets,analysis-interaction,chart-data-transformer,analysis-analytics,filter-options-cache,geo-registry}.service.ts`.
  - `helpers/authoring-history.ts` (undo/redo), `models/visual-config.model.ts`, `constants/{charts.constants,chart-capabilities}.ts`.
  - NgRx `store/` (add-analyses + analyses-filter slices).
- Depends on / depended on by: shared echart-visual + app-custom-table/dropdown/multiselect/calendar; datasets (field source); asset-share dialog. Publishes into → `dashboard` module. BE counterpart: DBExec-API analyses controllers (`/analyses`, `/analyses/:id/run`, `/analyses/:id/fields`, visual CRUD, `/duplicate`).
- How it works: editor loads an analysis version → tabs/visuals hydrate from JSONB → each visual runs `runAnalysisQuery` (typed params pushed BEFORE filter placeholders so `$N` stays aligned/injection-safe) → `chart-data-transformer` maps rows to an echarts option. **Save is versioned**: `updateAnalyses` CLONES the analysis into a new-version row (new `id`, same `lineageId`), returns the new id under `response.data.id`, editor re-pins `analysisId` to it. Publish captures a point-in-time snapshot into a dashboard.
- Decisions: add-tab is **one-click** ("Tab N", rename after) — FINAL, do not re-add a type picker ([[analyses-tab-decisions]] d87d37f0). Tab deletion **requires a justification** (audit reason). Tab strip = restyled custom div (NOT p-tabMenu) to keep cdkDrag reorder. Preview capped at 1000 rows by design. See ../ARCHITECTURE.md for tenancy/auth.
- Gotchas / constraints:
  - Versioned save means "reopen shows empty" is a **stale-id smell, not data loss** — the list/nav must resolve to the head-of-lineage version, not an old immutable one ([[analysis-save-persistence-bug]]).
  - Transform gates must match render gates — KPI/number-cards render on a single axis, so gating transform on `xAxis && yAxis` blanks them (fixed; watch when editing paint logic).
  - Dataset-level calculated fields don't surface in the analysis field picker (`/analyses/:id/fields` returns only `dataset_field`) — known limitation.
  - `updateAnalyses` PUT body must forward `tabs`/`tabDeletes`/`parameters` (dropping them caused the tmp_ tabId save 500 — fixed 8614263b).

## 2. Goals
- Objective: a stable, real-BI authoring studio where authored tabs/visuals/filters persist versioned and publish faithfully to dashboards.
- Current focus: — none active (viz-v2 landed; recent work was migration export/import + filter-edit staging fix).
- Next up: confirm list nav always resolves latest-in-lineage; surface dataset calc-fields in the field picker (deferred follow-up).
- Out of scope: dashboard rendering (in `dashboard`), alert authoring (in `alerts`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: full viz-v2 studio shipped on version_261 — visual CRUD + analysis parameters + typed filters + cross-filter/drill (workflow ws7w3wvg8, FE 323060be); one-click add-tab + tab-strip polish (d87d37f0); visual-card kebab menu (1a8a0c41); persistent top filter bar + save-wire (48fb6396); live-mode multiselect/slider re-query fix (69e3e084); batched-filter-edit staging fix (0a923df6); asset-share Share action on list+view (1900064c); export/import UI on the list (c1bf1cc1). Live E2E fixed 8 real bugs (8614263b, [[analyses-e2e-fixes]]).
- In progress / Known issues: analysis-save-persistence "bug" is a **FALSE ALARM** — save persists (versioned); only open Q is whether list nav can land on a stale version. All version_261 FE commits are **local-only, not pushed** (user pushes).
- Next: verify head-of-lineage resolution on list nav.
- Files touched: docs/context/modules/analyses.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/analyses`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/analyses.md
