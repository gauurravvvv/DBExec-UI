# DBExec-UI — Session Log (newest first)

### 2026-07-30 — Query Builder v2 (runtime composer, admin design, tab/section removal)
- Focus: build the full Query Builder v2 UI from the spec and remove the Tab/Section layers so the module is "just Prompt + Query Builder".
- Built: the business-user composer at `:id/compose` — a normalized signal store (Map+rootId, undo/redo) driving a recursive AND/OR tree (qb-filter-tree/group-node/condition-row/value-control), with a plain-English summary, a read-only Monaco SQL preview (server-generated only), and count/run against the compile pipeline (`qb-runtime.service`). Value control resolves by prompt type × operator arity; empty conditions are skipped; errors key by nodeId.
- Built: the admin design shell at `:id/design` — a tabbed `qb-design` hosting `qb-form-designer` + `qb-prompt-palette` (CDK drag-drop placements into groups), `qb-appearance-form` (data-driven per-type editor round-tripped through the mirrored `promptAppearance` Zod schema), `qb-join-designer`, `qb-output-columns`, `qb-settings` (`qb-admin.service`). Reused `asset-share-dialog` for the `querybuilder` type.
- Removed: the tab and section feature modules, the legacy configure/execute QB screens, and their app routes / permission entries / api constants. Rewrote view-query-builder lean (Run/Design/Share/Edit/Delete) and de-coupled add/edit-prompt from SectionService (flat forms). Repointed dataset type-2 edit nav to the composer.
- Gotchas learned: `app-custom-input`/`-multiselect`/`-radio`/`-binary-checkbox` are pure CVAs (bind `ngModelChange`, not `onChangeEvent`); button/chip/email-chips are standalone (import in the module); CDK `DragDropModule` needs aliasing vs PrimeNG's; the worktree isolation branches from a fresh origin ref (a subagent there lacked the just-made P6/P7 commits — did the removal in the main tree instead).
- Verified: tsc → ngc → prod build green after each phase (P6, P7, P8). QUERY_BUILDER + QUERY_BUILDER.APPEARANCE + prompt keys across all 10 locales.
- Modules updated: query-builder, prompt (+ dataset nav, shared asset-share-dialog type). Backend: query-builders (v2 admin endpoints + share unblock).
- Open for next session: live end-to-end verification against a seeded org; the `/app/query-builders` routing redirect wants a live browser check; bulk-paste resolve + value-source admin config not yet wired.

### 2026-07-29 — Dataset decomposition, part 2
- Focus: reduce the three files still over ~1,900 lines after part 1, still with zero behaviour change.
- Changed: extracted `DatasetSqlWorkbenchBase` (852) holding the 81 byte-identical members + 37 shared fields that part 1's service extraction had made identical (up from 56); split `monaco-intellisense.service.ts` by Monaco provider into `services/intellisense/` behind an `IntelliSenseContext` seam.
- Result: add-dataset 2,790 → 1,112 · edit-dataset 2,542 → 1,234 · monaco-intellisense 2,330 → 414 (both parts combined).
- Found + fixed: a stranded `@HostListener` in edit-dataset that would have made Escape re-fetch the dataset and discard unsaved SQL; a stranded `@ViewChild`; and two decorators lost on the way into the base.
- Verified: all three build gates after every commit; member-set and decorator audits show nothing lost; all 18 moved IntelliSense bodies byte-identical to their originals; add-dataset live-verified end to end.
- Also: `editor-parity`'s `dataset-add` failure was a migration-import stub datasource returning 500 from `/schemas` (proven with a direct API call), not a regression — the spec now picks a datasource that can connect.
- Modules updated: dataset.
- Open for next session: `formula-field-dialog` (1,025); `intellisense/completion-provider` (693) wants the dataset-workbench e2e first since splitting it is a control-flow change.


### 2026-07-29 — Dataset module decomposition, part 1
- Focus: reduce the dataset module's oversized TypeScript files with **zero behaviour change** — modularity only, committed task by task.
- Changed: deleted 739 lines of unreferenced mock data and extracted the module's shared models; extracted the IntelliSense string analysis, an export helper, and three component-provided services (schema tree, result-sheet layout, result-grid tools). add-dataset 2,790 → 1,962; edit-dataset 2,542 → 1,942; monaco-intellisense 2,330 → 1,912.
- Decisions: add/edit drift is parameterised per screen, never merged by picking a winner (34 of 90 shared bodies differ). `initMonaco` left duplicated on purpose. sql-dialects data tables left alone. Templates untouched via proxy accessors.
- Found: edit-dataset registers **neither** the SQL validator nor the formatter (0 refs vs 4 on add) and binds Ctrl+Enter through the non-functioning `editor.addCommand` — a real defect, recorded not fixed.
- Modules updated: dataset.
- Open for next session: the functional e2e for dataset create/edit, then the shared base component; formula-field-dialog (1,025) and the IntelliSense provider split still pending.


### 2026-07-24 — Enriched all module docs with real current state
- Focus: Make docs/context a TRUE single source of truth — every module file now carries genuine feature context + current progress, not a generic scaffold.
- Changed: Rewrote all 27 docs/context/modules/*.md (Context = real feature surface + how-it-works + real gotchas; Goals = real focus/backlog/known-issues; Progress = dated "Current state captured" entry citing actual shipped commits + memory, kept the "Initialized" entry beneath). Synced INDEX statuses to each module's declared status.
- Decisions: Sourced from actual code + git history + the ~50 memory notes (authoritative for shipped/known-bugs/decisions). ai-workspace + rls-rules marked 🟡 (active caveats: ai needs a frontier model; rls has one open defect RLS-P2-1). A few scaffold assumptions were CORRECTED against code (e.g. dashboards snapshot-at-publish IS built; analysis "save-persistence P1" was a stale-version-id false alarm; queries module is the raw ad-hoc SELECT engine, not saved-queries).
- Modules updated: all.
- Open for next session: keep following the session-end protocol; live-verify the 🟡/known-issue items when those modules are next touched.


### 2026-07-24 — Bootstrap: docs/context system initialized
- Focus: Set up the persistent, file-based context system per claude-arch.md.
- Changed: Appended the Session Context Protocol to root CLAUDE.md (existing Frontend Reference kept intact); created docs/context/{INDEX.md, ARCHITECTURE.md, SESSION_LOG.md} + docs/context/modules/*.md (one per real module).
- Decisions: Module list DERIVED FROM CODE (src/app/modules/ = 26 folders), not the stale seed in claude-arch.md. The Query Executor lives inside query-runner/executor/ (documented within the query-runner module file), not as a separate top-level module. ARCHITECTURE.md reconciled against the actual code via a full repo audit.
- Modules updated: all (initialized).
- Open for next session: Module files carry accurate Context/Goals scaffolds; enrich individual files with deeper specifics as work touches them. Follow the session-end protocol on every future change.

## 2026-07-29 — Explorer/dialog review round
Reviewing the running screens (rather than the code) found: the two schema trees
still differed structurally, explorer rows rendering at 11.375px, the identifier
font inherited differently per screen, search that ignored columns, a field sidebar
showing one icon for all 26 fields, an object-detail tab strip compressed to 22px
against 28px of content, a dialog whose height tracked its data, and a Comment
column wrapping one character per line (body scrollHeight 3374px -> 1030px). Also
fixed: Monaco's suggestion details pane persisting its expanded state, and
Unsaved-Changes buttons rendering as browser defaults. Column types moved to a
tooltip after the opacity approach cost names their width. formula-fields is
blocked by an environmental datasource connection issue, verified by reproducing it
with all changes stashed.

## 2026-07-28 — Editor unification: one Monaco editor across the three modules
Query Executor migrated off CodeMirror 6; every editor now mounts through
shared/editor/CodeEditorService, the single place monaco.editor.create is called.
Nine CodeMirror packages removed. The executor's 237-line completion source was
replaced by the dataset module's 2,272-line IntelliSense, with a schema bridge and
a new setColumnRequestHandler hook preserving its lazy column loading. Found no
dark mode exists (a dead body-class branch in four components) and that the theme
must be built from computed tokens because ThemeService rewrites the brand colour
per org. Six real bugs found by the new suites, each having first passed a weaker
assertion. Parity is asserted by comparing computed styles across four screens.
Chrome converged onto shared mixins. The component file-size work is analysed and
mapped but blocked on functional e2e for dataset create/edit.

## 2026-07-28 — Formula dialog screenshot suite + suggest-widget theming
34 live captures into screenshots/ covering palette, usage docs, IntelliSense and
12 valid / 12 invalid formulas, with each case asserting its own filename. That
assertion immediately caught three screenshots mislabelled "valid" that actually
showed rejections (lpad and toText do not exist; there is no padding function in
the catalog). Styling fix: the editor ran stock `vs`, so the highlighted
suggestion row was saturated blue; added formula-light/dark themes overriding only
editorSuggestWidget colours. A suspected detached details-panel defect turned out
to be a test artifact of a redundant Ctrl+Space.

## 2026-07-27 — Formula UI verified in a browser (Playwright 16/16)
Added e2e/formula-fields.e2e.ts (npm run test:e2e:formula) with a test-cases doc.
All 16 green against the live stack, covering the catalog palette, live
suggestions, the three stage badges, validation errors, save-without-navigation
and the sidebar.
Found two app defects: the sidebar badge was icon-only and unreadable, and a
stray `&__stage` at the root of the sidebar SCSS broke the bundle while ng serve
kept serving it silently.
Automation notes: never wait on networkidle (open SSE stream); set Monaco values
via its model API, not keystrokes (auto-closing brackets and dropped early keys);
the suggest list is virtualised so filter by prefix.

## 2026-07-27 — Formula suggestions made live
The Monaco completion provider snapshotted its function and field lists when the
dialog opened, so a just-created field was not suggestable until reopen. Both are
now resolved per keystroke, and fields come from the live store unioned with the
@Input. Fixed a FormulaCatalogService.load() race that could set a palette to
empty when two dialogs opened together.
Not done: browser verification — the AIOrg credentials were rejected.

## 2026-07-27 — Pushdown removed from the formula UI
Derived fields are computed on the API, always. The execution-tier badge is
replaced by a calculation-kind badge (Row / Aggregate / Window) plus a note
telling the author to put the expression in the dataset SQL if they need it
filtered or aggregated at the database. pushdownable dropped throughout; 4 new
i18n keys across 10 locales, 2 retired.

## 2026-07-27 — Unified calc-field dialog + live field sidebar
Merged `add-custom-field-dialog` and `calculated-fields-dialog` into one
`formula-field-dialog`. Palette and IntelliSense now come from the API catalog,
so the UI owns no function list; `constants/functions-reference.ts` (962 lines)
deleted. Added an execution-tier badge and positioned validation errors. New
signal-backed `dataset-fields.store` + `field-sidebar` remove refetch-on-save so
create -> pick -> create needs no reload. i18n across 10 locales.
NOT done: behavioural parity verification and live browser testing.

