# dbexec-ui — Session Log (newest first)

### 2026-08-15 — Prompt Builder Phase 7 (frontend): runtime composer = the published Query Builder
- Extracted a routeless `QbRuntimeSharedModule` (query-builder) declaring +
  exporting the six tree->SQL runtime components (qb-filter-tree, qb-group-node,
  qb-condition-row, qb-value-control, qb-sql-preview, qb-summary). QueryBuilderModule
  now imports it instead of declaring them; FormBuilderModule imports it too — the
  components are REUSED verbatim, not forked (only change to any qb-* file: a
  3-line default-safe `appearance` read in qb-value-control for no-appearance form
  fields).
- `FbRuntimeService`: getSchema/preview/validate/execute/count against
  `/forms/:id/{schema,preview,validate,execute,count}` + the reused prompt value
  search/resolve endpoints (server-mode typeahead + bulk paste).
- `FormRuntimeStore extends QueryBuilderStore`: flattens the resolved
  tabs->sections->fields (getRuntimeSchema payload) into the QB groups->prompts
  shape the runtime tree consumes; tracks fieldKey-keyed `values`; folds RBAC
  (read→disabled) + Phase-5 rules (`applyRules` over persisted triggers lowered by
  `ruleAst.adapter`) into per-field `effectiveFlags`. Reused components inject
  QueryBuilderStore, aliased via `useExisting` to the FormRuntimeStore instance.
- `fb-compose` (route `:id/compose`): hydrate the published version, render the
  reused qb-filter-tree (the per-condition operator dropdown offers the field's
  resolved operators[] = dataType ∩ allowedOperators), debounced server-SQL
  preview, count, execute-with-results. Live rules + RBAC via the store; execute
  sends `values` for server re-enforcement. `?preview=1` runs the latest draft
  (WRITE-guarded server-side).
- `fb-preview`: keeps the Phase-6 RBAC access grid and additionally renders the
  reused runtime composer read-only below it, hydrated via `?preview=1&asRole` so
  the designer sees the real business-user composer for the previewed role.
- FE mirror of `shared/validators/formCompose.ts` (byte-identical schema body).
- i18n: `FORM_BUILDER.RUN`, `FORM_BUILDER.NO_PUBLISHED`,
  `FORM_BUILDER.PREVIEW.COMPOSER` across all 10 locales.
- Gates: `tsc` 0 · `ngc --noEmit` 0 · `ng build --configuration production`
  success · `jest src/app/modules/form-builder` 27/27. Branch
  `feature/prompt-builder`; not pushed. dbexec-api untouched.

### 2026-08-15 — Prompt Builder Phase 1 (frontend): appearance removed, config stepper rebuilt
- Deleted the prompt appearance FE (form component, descriptor registry,
  mirrored validator, api suffix, service methods, `PROMPT_MODULE.APPEARANCE`/
  `CUSTOMISE_*` i18n across 10 locales).
- Rebuilt `config-prompt` from a 1768-line monolith into a thin shell +
  signal-based `prompt-config.service` + four step children
  (`cp-source-step` / `cp-joins-step` / `cp-column-filter-step` /
  `cp-values-step`) + helpers; each file well under ~400 lines. Joins and
  Column+Filter offer a visual mode plus an Advanced Monaco raw-SQL escape.
- Added a CSV/XLSX `upload` kind to `prompt-value-source` (dropzone + column
  map + parsed preview + re-upload justification) wired to
  `PromptService.uploadValues` → BE `/prompts/:id/values/upload`; mirrored
  `promptValuesUpload.ts` validator; new `PROMPT_MODULE.VS.*` + stepper keys ×10.
- Gates: `tsc` 0 · `ngc --noEmit` 0 · `ng build --configuration production`
  success. Branch `feature/prompt-builder`; not pushed.

### 2026-08-14 — Per-user theme picker (sidebar flyout mirroring the language picker)
- Theme became a per-user choice. New `core/services/theme-picker.service.ts`
  (`ThemePickerService`) = the theme sibling of `LocaleService`: `loadThemes()` →
  `GET /profile/available-themes`; `changeTheme(id)` → apply instantly
  (`ThemeService.applyFromLogin`) → `PUT /profile/theme` → refresh JWT. A new **Theme
  flyout** in `core/layout/sidebar` cloned from the language flyout (a `pi-palette`
  profile-menu row + a `.theme-flyout` list: swatch strip + name + ✓ on the active
  pick), shown only when the org has themes. Wired into the click-outside allowlist +
  tour open/close helpers; one flyout open at a time.
- The session apply path was untouched — the BE now resolves the user's theme into the
  login/refresh payload, so `applyAuthArtefacts` paints the user's pick everywhere for
  free. `HEADER.THEME` ×10 locales; mirrored `profile.ts` validator kept byte-identical;
  `PROFILE.{AVAILABLE_THEMES,UPDATE_THEME}` consts.
- Verified: FE tsc 0 → ngc 0 → prod build 0 (2.x MB). version_261 (local; user pushes).
  BE companion (entity/resolver/endpoints/creation-stamps) in dbexec-api SESSION_LOG +
  the design spec `docs/superpowers/specs/2026-08-14-user-scoped-theme-design.md`.

### 2026-08-12 — Joi → Zod validation migration (FE mirror side)
- BE-led migration of all 63 remaining Joi validators to Zod; the FE side received the byte-identical mirrored schema files under `src/app/shared/validators/*` (new: ai-workspace, announcements, audit-logs, branding, dashboards, db-access, org-policy, profile, prompts, query-builders, system-users, analysis-filters, theme; appended: alerts, analyses, datasets, datasources, groups, organisation, roles, savedQueries, users). Created FE `src/app/shared/utility/listSort.ts` with `buildSortZod` to match BE.
- **189 new `validation.*` i18n keys added to all 10 FE locale files, fully translated** (mirrors BE), plus `validation.common.sort.*` + `validation.common.id.{required,invalid}`. Parity verified 189/189 × 10 locales.
- These schemas back the add/edit/save forms (client `safeParse` before submit) with the SAME contract the BE now enforces. 21/22 schema files are byte-identical to BE; `theme.ts` differs only in the themeTokens import path (FE uses `theme-tokens`, BE `themeTokens`) — intended.
- Verified: FE tsc 0 → ngc 0 → prod build 0. version_261 (local; user pushes). Full detail in dbexec-api SESSION_LOG.

### 2026-08-12 — Guided application tour (permission-aware onboarding)
- New feature: a driver.js-powered guided tour that auto-shows on login and walks the user through the sidebar chrome (global search, notifications, language switcher, logout) and **only the modules they hold permission for** — steps derive from the user's own permission tree, so User A (all perms) sees all module steps and User B (subset) sees only theirs. Chrome-first order: welcome → search → notifications → [permitted modules] → language → logout → done.
- New core singleton `TourService` + `tour.constant.ts` step catalog. driver.js added (only new dep, ~5KB, MIT). Themed via `assets/sass/_driver-tour.scss`, **fully token-driven** so each org's theme paints the tour; backdrop mirrors the app's `--overlay-background` scrim.
- Choreography: the search/notifications/language/logout steps open the real overlays (added `close()`/`closeSearch()` trigger channels to NotificationModalService/GlobalSearchService; sidebar gained a small `TourSidebarApi`). Logout step highlights but never logs out. Sidebar pinned open during the tour; `document:click` outside-close suppressed while running.
- Persistence: single `showTour` flag (default true) on the user entity, surfaced in the session; `LoginService.applyBootstrap` stashes it in `StorageType.SHOW_TOUR`. Auto-shows every login until dismissed. "Don't show again" checkbox injected into **every** popover footer (a user may quit early) → `PUT /profile/tour`. Re-enable via a new "Show product tour on login" toggle on the profile page. `sessionStorage` guard stops a same-session reload from replaying a completed tour.
- i18n: `TOUR.*` namespace (welcome/done + 4 chrome + 27 module steps, titles+descriptions) + `PROFILE.PREFERENCES`/`SHOW_TOUR_TOGGLE` in all 10 locales; `{{current}}/{{total}}` progress tokens preserved (handed to driver.js, not ngx-translate).
- BE companion: `showTour` boolean (master + shared user entities), `PUT /profile/tour` (updateShowTour controller/validation/route — mirrors updateLocale, Joi to match the profile module), `profile.tour_updated` message in 10 BE locales, `getProfile` returns `showTour`.
- Spec: `docs/superpowers/specs/2026-08-12-application-tour-design.md`. New module doc `modules/app-tour.md`.
- Verified: BE tsc 0; FE tsc 0 → ngc AOT 0 → prod build 0 (no budget/warnings); i18n parity 10/10. version_261 (local; user pushes). Not yet live-verified in a browser.
- Follow-up noted separately: migrate BE validation Joi→Zod incrementally (user's call, after this feature).

### 2026-08-11 — Magic-link reset: code-review fixes
- forgot-password countdown is now existence-agnostic (BE always returns `expiresAt` on success, incl. anti-enumeration masked non-sends), so the UI no longer leaks whether an account exists. Removed dead `trackByIndex`. Localised `validation.auth.resetToken.*` in the 9 non-English locales.
- Verified: tsc + ngc + prod build green. version_261.

### 2026-08-11 — Password reset is now a magic-link (forgot + reset screens)
- forgot-password: removed the `username` field (org + email only), copy → "Send reset link"/"Resend link", countdown now keys off `res.data.expiresAt` (renamed from `otpExpiresAt`).
- reset-password: removed the 6 OTP boxes and every OTP handler; the page reads the 64-char `token` from the magic-link URL (`?token=&id=&orgId=`) and only collects the new password. Missing token/id/orgId → redirect to login.
- `login.service`: `generateOTP` sends `{ organisation, email }`; `resetPassword` sends `{ id, orgId, token, password }`. Dead `.auth-otp*` styles removed from `auth-shell.component.scss`.
- Validators mirrored from BE (`resetTokenSchema`, `requestPasswordResetSchema`, token `resetPasswordSchema`) + `validation.auth.resetToken.*` in all 10 locale files.
- Verified: tsc 0 → ngc AOT 0 → prod build green. version_261 (local; user pushes).
- **Branding**: removed the "Show Watermark" toggle from add/edit — a preset always defines a watermark (fields always shown + required), and enable/disable is the list active/inactive; `body()` always sends `showWatermark:true`. Removed the now-redundant "Watermark" column from list-branding.
- **Announcements → org-wide**: removed all `targetGroupId` group targeting from add/edit (form control, GroupService, loadGroups/loadGroupsPage/resolveSelectedGroup, dropdown, payload), list (Group column, toolbar Group filter dropdown, selectedGroup/onGroupChange, adapter param), view (Target Group info-item), and the service `AnnouncementPayload`. Dead `ANNOUNCEMENT.TARGET_GROUP/SELECT_GROUP/GROUP/TARGET_GROUP_REQUIRED` i18n keys removed + `ANNOUNCEMENT.SUBTITLE` reworded across 10 locales. (BE companion drops the column + audience filter.)
- **Styling**: list-announcements had no `.row-actions .icon-btn` styling (default hover, unlike theme/branding); added the shared icon-button cluster block so all three App-Settings lists match.
- Verified: tsc 0, ngc 0, prod build 0.

### 2026-08-10 — Settings back-nav Not-Found fix, back-button spacing, sidebar brand colour
- Fixed Add/Edit/View pages for Theme, Branding, Announcements routing back to bare list paths (`/app/settings/themes` etc.) that aren't registered routes → Not Found. Added `APP_SETTINGS_HUB` in routes.constant (`BASE` + `tab(slug)`); every back/cancel/return nav now targets `/app/settings/app?tab=theme|branding|announcements` (the hub reads `?tab=`). Left `ANNOUNCEMENT.LIST` untouched where it's an API path in announcement.service.
- Back-button/title spacing: the fixed 36px icon-button box + wide gap pushed titles away from the arrow; tightened all three Add headers to a ~28–30px button + `--space-2` gap.
- Sidebar brand now follows the theme: `.brand-highlight` ("Exec") gradient switched from hard-coded blue to `--primary-color`/`--primary-light`; the DB mark converted from a `content:url()` image to a CSS mask filled with `--primary-color` (single-colour silhouette SVG). "DB" already used `--text-color`.
- Verified: tsc 0, ngc 0, prod build 0.

### 2026-08-10 — Live editor re-theming + add-theme preview revert
- Wired `CodeEditorService` to `ThemeService.theme()` via a constructor `effect` so all open Monaco
  editors follow a live theme switch (the pre-existing `refreshTheme()` had no caller). Global
  `setTheme` covers every editor at once; no per-component change.
- Fixed `add-theme.component` stranding the workspace on an unsaved preview: snapshot the active theme
  on entry (before livePreview overwrites the signal) + restore it on destroy; skip preview in
  read-only View.
- Gates green: tsc 0, ngc 0, prod build 0. BE companion added 4 seeded presets (Daylight/Paper/
  Amethyst/Arctic). version_261.

### 2026-08-06 — Datasource dropdown filter on Connections + Saved Queries lists
- Added a server-mode `app-custom-dropdown` datasource picker above the table toolbar on both query-runner list screens (`.list-filter-bar` inside `.content-card`). FE-only: both BE list endpoints already accept the filter.
- Data path per list matches its existing adapter/service contract: **Connections** → top-level `datasourceId` query param (first arg of `listConnections`); **Saved Queries** → `filter.datasourceId` inside the JSON `filter` (merged with the table's own search/column filters via `withDatasourceFilter()`). On change: set field → `adapter.reload()` → mirror to URL `?datasourceId=` (`queryParamsHandling: 'merge'`). On init: read the param and pre-select before first reload. Clearing shows all.
- New i18n key `COMMON.ALL_DATASOURCES` in all 10 locales; label reuses `COMMON.DATASOURCE`.
- Verified: `tsc --noEmit` 0, `ngc -p tsconfig.app.json --noEmit` 0. Prod build deferred to the caller. Not committed.

### 2026-08-05 — Textarea resize lock + raw-textarea sweep + 4 new shared controls
- Textarea: `app-custom-textarea` already existed; changed its default `resize` from `vertical` → **`none`** (no drag-resize skewing forms/popups) and added `maxLength` + `inputId` inputs so it's a full drop-in. Swept ~33 raw `<textarea>` (mostly the delete/save justification popups + a few content fields) → `<app-custom-textarea>` across every module (3 parallel agents, uniform recipe: `id`→`inputId`, `rows="N"`→`[rows]`, `maxlength`→`[maxLength]`, keep `[(ngModel)]`/`formControlName`). Two deliberate exceptions kept as raw `<textarea style="resize:none">`: query-executor (standalone component, no SharedModule) and the sql-query-dialog Monaco-fallback code box (kept `.fallback-textarea` monospace styling; its scss resize flipped to `none`).
- Built 4 NEW shared controls (declared + exported in SharedModule): **app-justification-dialog** (the delete/save reason popup — `mode`, `[message]`, `[busy]`, `[(justification)]`, `(confirm)`/`(cancel)`, projects a `.delete-info-list`; carries the consolidated `.confirmation-popup` styling that was copy-pasted across ~10 scss files), **app-custom-color** (swatch + native picker + hex field → `#rrggbb`, CVA), **app-custom-file** (drag-drop + browse, accept/maxSize validation, file chip, CVA + `(fileSelected)`), **app-search-input** (debounced list-toolbar search, clear button, `(searchChange)`). Added `COMMON.FILE_DROP_HINT` to all 10 locales; reused `COMMON.SEARCH`.
- Verified: tsc → ngc AOT → prod build all green; all 10 i18n files parse. The 4 components are built + available app-wide; wiring them into every legacy consumer (the ~26 justification popups, the color/file/search usages) is a follow-on migration, same pattern as the textarea sweep.

### 2026-08-05 — App-wide loading/busy behavior (no global overlay on writes; button-level busy)
- Problem: some screens (Announcement) still threw the full-screen global spinner on a write, and double-submit was possible. Goal: one modern standard everywhere + kill the global loader for writes.
- Root cause found: the app was already ~95% modern — `app-button` already had `[loading]`/`[disabled]`+guard, and 36/37 write-services already passed `skipLoader`. Announcement was a straggler that forgot `skipLoader`. The interceptor was opt-OUT (block unless `X-Skip-Loader`), so one forgotten flag = overlay came back.
- Fix (foundation, one change fixes all modules): `http-request.interceptor.ts` is now **method-aware** — GET blocks with `.spinner-container`; POST/PUT/PATCH/DELETE skip the global overlay by default. Added `forceLoader`/`X-Force-Loader` opt-in for the rare write that wants blocking (both loader headers stripped before the wire). `HttpClientService` gained `forceLoader`.
- Convention: `shared/helpers/form-busy.ts` (`FormBusy`: `busy`/`activeAction`/`run()` with a double-fire guard) for multi-write-button screens; read-only buttons (Cancel/Back) never disabled by busy.
- Sweep: converted all raw `p-button`/`btn-save` footers to `<app-button [loading]="saving()">` across users, groups, roles, datasource, prompt, query-builder, rls-rules, connection, saved-query, organisation (wizard), system-admin, announcement, db-role, ai-features (guard), bulk-add-user (stage-driven), + edit-dataset-fields / save-analyses dialogs. Fixed the confirmation-popup confirm buttons (edit-prompt/edit-rls-rule/edit-query-builder) to guard+spin on `saving()`. rls-rules add/edit had NO `saving()` guard — added it (template + `onSubmit`/`proceedSave`). **Zero per-module import churn:** added `ButtonComponent` to `SharedModule.exports` (was only in `imports`).
- Verified: tsc → ngc AOT → prod build green. Live headless (Docker FE :8755/BE :9058, org UltraIntake; token+permission-tree seeded to bypass the /relay first-login gate): 10/10 reachable add forms render `app-button` with zero legacy `btn-save`; Save disabled in-flight (double-submit prevented); no `.spinner-container` on writes. Spinner-during-POST not exercised (CVA forms wouldn't submit headlessly; prod strips `ng` debug) — it's the same `[loading]` binding, AOT-compiled + present in the shipped bundle. Full write-up: `docs/superpowers/specs/2026-08-05-loading-busy-behavior-design.md`.
- Not deployed: the running Docker UI image predates these edits; a fresh `dist` was hot-swapped into the container for the test then restored. Deploying = rebuild the `dbexec-ui` image.

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

