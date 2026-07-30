# query-builder
> Update the Progress log on every change.
> Code path: `src/app/modules/query-builder` · Status: 🟢 · Last updated: 2026-07-31

## 1. Context
- Responsibility: DBExec **Studio** feature — build a parameterised query WITHOUT hand-writing SQL. v2 model: an admin designs a flat, group-based form of **prompts** over a datasource; a business user composes an AND/OR **condition tree** over those prompts and runs it. The client never builds SQL — it sends a validated JSON tree of metadata IDs; the server compiles it. Can produce a dataset (`/datasets/from-builder`).
- Key files:
  - `components/{list,add,edit,view}-query-builder` — CRUD quartet. `view` carries Run / Design / Share actions.
  - **Runtime (business user)** at route `:id/compose` — `components/run-query-builder` orchestrates: `qb-filter-tree` → `qb-group-node` (recursive AND/OR) → `qb-condition-row` → `qb-value-control` (control chosen by prompt type × operator arity), plus `qb-summary` (plain-English) and `qb-sql-preview` (read-only Monaco of server SQL). State in `services/query-builder-store.ts` (normalized signal store: `Map<id,node>` + rootId, undo/redo). HTTP in `services/qb-runtime.service.ts` (schema / preview / validate / execute / count).
  - **Admin design** at route `:id/design` — `components/qb-design` (tabbed shell) hosts `qb-form-designer` + `qb-prompt-palette` (CDK drag-drop placements into groups), `qb-appearance-form` (data-driven per-type appearance, `helpers/qb-appearance-fields.ts`, round-tripped through the mirrored `promptAppearance` Zod schema), `qb-join-designer`, `qb-output-columns`, `qb-settings`. HTTP in `services/qb-admin.service.ts` (settings / placements / joins / output-columns / default-tree / clone / publish / prompt-appearance / palette).
  - Sharing: reuses `app-asset-share-dialog` with the `'querybuilder'` asset type.
  - `services/query-builder.service.ts` — legacy CRUD + config/structure (tab/section methods removed).
- Depends on: **datasource**, **prompt** (the placed form pieces), **dataset** (`/datasets/from-builder`), shared UI kit + `CodeEditorService` (Monaco) + `@angular/cdk/drag-drop`. Mirrored validators `queryBuilderTree.ts` / `promptAppearance.ts`. `QUERY_BUILDER` api/routes constants.
- Depended on by: dataset (from-builder path); Studio sidebar group.
- How it works: List → Add/edit entity → **Design** (`:id/design`) places prompts into groups + configures joins/columns/settings/appearance → **Compose** (`:id/compose`) hydrates `GET /:id/schema`, the user builds a tree, a debounced `POST /preview` returns server SQL, `POST /count` then `POST /execute` return rows. Empty conditions are skipped ("not applied"); validation errors are keyed by nodeId.
- Decisions: SQL is ALWAYS server-generated (the one hard rule). Tab/Section removed — the module is now "just Prompt + Query Builder"; the flat `groupLabel` model replaces tabs/sections. Sharing is VIEW-ONLY (asset-share). RBAC-gated via `*hasPermission='queryBuilderScreen'`. See [ARCHITECTURE.md](../ARCHITECTURE.md).
- Gotchas / constraints: `app-custom-input` / `-multiselect` / `-radio` / `-binary-checkbox` are pure CVAs — bind `(ngModelChange)`, NOT `(onChangeEvent)` (only `-number` / `-dropdown` / `-calendar` expose `onChangeEvent`). `app-button` / `app-chip` / `app-email-chips-input` are standalone and must be imported in the module (not re-exported by SharedModule). CDK `DragDropModule` is aliased (PrimeNG's shares the name). i18n: `QUERY_BUILDER.*` (+ nested `QUERY_BUILDER.APPEARANCE.*`) across all 10 locales.

## 2. Goals
- Objective: Author a reusable prompt-driven form and let non-SQL users compose + run a condition tree over it; optionally graduate to a dataset.
- Current focus: — none active (v2 shipped on `feature/query-builder-v2`).
- Next up: — live end-to-end verification against a seeded org; bulk-paste resolve endpoint wiring; value-source admin config.
- Out of scope: hand-written SQL (dataset/query-runner), chart authoring (analyses).

## 3. Progress (newest first)
### 2026-07-31 — Screen parity (parent card + 50% forms) + placement labels + live proof
- **`qb-design` shell** rewrapped in the standard page card (`.add-admin-wrapper > .add-admin-container > .page-header` with back button to `/app/query-builders` + builder-name title), tab nav kept inside the card. Was a bare `.qb-design` shell with no card — the user's "no parent card on config screen" complaint. `.qb-design__panel` now scrolls inside the card.
- **`run-query-builder` (compose)** rewrapped in the same page card + `.page-header` (back button, title, undo/redo actions). The 2-column composer grid stays inside.
- **`qb-settings`** grid → single-column 50%/one-control-per-row (was `repeat(auto-fill,minmax(240px,1fr))`).
- **`add-query-builder`** normalized to `.form-grid{width:50%}` / `.form-field{width:100%}` (was 50% on the field with a 100% grid) so it matches add/edit-prompt + add-user.
- **`config-prompt`** collapsed its two-column `.form-container` into a single 50% column (one control per row); removed the stale Tab/Section display row; dropped the now-optional `promptWhere` required validator + `*` marker (mirrors the BE change).
- Form Designer now shows prompt **names** not UUIDs — fixed via the BE `getPlacements` enrichment (FE `hydrate` reads `r.name || r.promptName`).
- Gates green (tsc → ngc → prod build). Verified with a headed Playwright walkthrough (`e2e/qb-walkthrough.e2e.ts`, idempotent seed over `clinical.encounter_analytics`); 16 screenshots in `/DBExec/screenshots/QB` covering prompt library, per-prompt config, form designer (named prompts, grouped), joins/columns/settings, value-source drawer, compose pre-filled multi-condition tree with live SQL + summary + open value dropdown, count (≈746), and the RUN results grid with real rows.

### 2026-07-30 — Value-source layer (spec 6.6): config, typeahead, bulk paste
- Done: prompt value sourcing end to end. Admin `qb-value-source` (in the form-designer drawer) picks free / fixed list (manual + bulk import) / lookup SQL (Monaco) / distinct column, previews before saving, and warns when the server forces server-paged typeahead. Runtime `qb-value-control` now server-searches lookup prompts (dropdown/multiselect serverMode + `/values/search` fetcher), passes parent selections for cascading lookups (`store.valuesForPrompt` → `dependsOnValues`), and offers a "Paste values" dialog (`/values/resolve`, matched vs not-found). Services `qb-admin.getValueSource/saveValueSource/previewValues` + `qb-runtime.searchValues/resolveValues`; mirrored `promptValueSource` validator; QUERY_BUILDER.VS.* + PASTE_* i18n × 10.
- Backend (same day): `promptValueSource.ts`/`promptValueRuntime.ts` controllers + 5 routes (value-source GET/PUT, values/preview·search·resolve), shared `promptValueSource.helper` (safe SQL run + distinct-column build + cardinality probe), schema controller emits kind from cardinality, compiler rule 8 (curated allowed-set enforcement, 49 tests).
- Gotchas: `app-custom-dropdown/-multiselect` take `serverMode` + `fetcher` (arrow, returns `{items,total}`); the SQL editor mounts via CodeEditorService only after its `*ngIf` host renders (setTimeout tick on kind change).
- Files touched: components/{qb-value-source,qb-value-control,qb-condition-row,qb-form-designer}, services/{qb-admin,qb-runtime,query-builder-store}, validators/promptValueSource, api constants, i18n × 10.

### 2026-07-30 — Query Builder v2 (runtime composer + admin design + tab/section removal)
- Done: shipped v2 end to end. Runtime composer (`run-query-builder` + tree components + normalized store + summary + Monaco SQL preview) at `:id/compose`; admin design shell (`qb-design` + form-designer/palette/appearance-form/join-designer/output-columns/settings) at `:id/design`; `qb-admin.service` + `qb-runtime.service`; mirrored `queryBuilderTree`/`promptAppearance` validators; `querybuilder` asset-share reuse; QUERY_BUILDER + QUERY_BUILDER.APPEARANCE i18n across 10 locales. All three FE gates green (tsc → ngc → prod build).
- Tab/Section: modules removed; `add-prompt`/`edit-prompt` de-coupled from SectionService; `configure-query-builder` + `execute-query-builder` (legacy) deleted; app routes + permission entries cleaned.
- Known issues: routing redirect on `/app/query-builders` needs live browser confirmation; full admin→runtime round-trip not yet live-verified.
- Files touched: components/{run-query-builder,qb-*}, services/{qb-runtime,qb-admin,query-builder-store}, helpers/qb-appearance-fields, query-builder.module + routing, view-query-builder, routes/api constants, shared asset-share-dialog type, i18n × 10.

### 2026-07-24 — Current state captured
- Done: Full builder pipeline works — CRUD + `configure` drag-drop layout designer (tabs/sections/prompts) + `execute` runtime (renders prompts to a form, runs, shows results) + can produce a dataset from a builder. RBAC-gated every CUD button (bfe557d6); skeleton-loading + cancellation rollout (66fe8f41); relative timestamps (a1654900); dropped fixed max-height on add/edit form bodies (ef88920c); missing reactive validators wired (60a8fe81).
- In progress / Known issues: an older Studio module — configure/execute grids not on the shared app-custom-table/reference-data path; conceptual overlap with prompt + analyses-parameters. No active work.
- Next: —
- Files touched: docs/context/modules/query-builder.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/query-builder`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/query-builder.md
