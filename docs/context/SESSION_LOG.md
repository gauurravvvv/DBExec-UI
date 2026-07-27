# DBExec-UI — Session Log (newest first)

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

