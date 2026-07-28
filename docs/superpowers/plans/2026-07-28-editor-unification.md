# Editor Unification Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking. Every task ends with a Playwright gate — the user asked for browser verification after each step, so a task is not done until its spec passes.

**Goal:** Put Query Executor, Dataset Creator and Field Creator (and their edit screens) on ONE code-editor library with one theme, one options set and one chrome stylesheet, so the three look identical — without weakening schema/table/column IntelliSense anywhere.

**Architecture:** Monaco becomes the single editor. Query Executor migrates off CodeMirror 6. A new `src/app/shared/editor/` owns the theme, the options and the chrome SCSS; all five components consume it. The executor keeps its lazy `SchemaCatalog` and reaches the Dataset module's mature Monaco IntelliSense through a thin adapter plus a new lazy-column hook.

**Tech Stack:** Angular 18.2 (NgModule), `monaco-editor` 0.52, existing `MonacoLoaderService`, `MonacoIntelliSenseService` (2,272 lines), `SqlValidatorService`, `SqlLinterService`, `SqlFormatterService`, six dialect specs, Playwright 1.61.

---

## Why Monaco (decision record)

| | Query Executor | Dataset Creator | Field Creator |
|---|---|---|---|
| Library today | **CodeMirror 6** | Monaco | Monaco |
| SQL/formula IntelliSense | `completion.ts`, 237 lines | `MonacoIntelliSenseService`, 2,272 lines | formula completion provider |
| Schema model | `SchemaCatalog` — **lazy**, per-schema tables, per-table columns | `DatasourceSchema[]` — materialised, re-fed as it grows | dataset field list |

Monaco wins on three counts: two of the three modules already use it, the module whose look we are adopting is a Monaco editor, and the *richer* IntelliSense is already on the Monaco side. Migrating the executor to Monaco therefore **upgrades** its suggestions (alias resolution, CTE scope tracking, INSERT column lists, six dialects) instead of risking them.

The reverse direction would mean porting 2,272 lines of IntelliSense plus a Monarch grammar to CodeMirror and rebuilding the look we want to keep. Not worth it.

**`@codemirror/lang-sql` stays.** The six dialect specs in `dataset/config/sql-dialects/` import it only to harvest keyword and type word lists — it is a *data* dependency, not an editor. Every other CodeMirror package goes.

## Global Constraints

- Branch `version_261`. The user pushes; never push.
- Never commit `src/environments/environment*.ts` or any `.env`.
- Verification gate for FE work, all three, in order: `npx tsc --noEmit` → `npx ngc -p tsconfig.app.json --noEmit` → `npx ng build --configuration production`. `tsc` alone does not check templates.
- Styling: design tokens only — `--border-color`, `--card-background`, `--radius-sm`, `--motion-base`, `--primary-color-transparent`, `--fs-*`, `--space-*`. No hard-coded colours, sizes or spacing. Monaco's colour map cannot resolve `var(--…)`, so theme hex values are duplicated in TS with a comment pointing at the token they mirror.
- i18n: every user-facing string is a translate key present in all 10 locales (`en, de, es, fr, it, ja, ko, nl, pt-BR, zh-CN`).
- Scope, as chosen: the editor and its immediate frame, **plus** toolbars, panel headers, section titles, side-panel rows and status/validation bars. Page skeletons (executor object browser, results grid, dataset stepper) keep their structure and inherit tokens.
- Commit convention: `type(scope): summary`, no AI attribution, no `Co-Authored-By`/`Claude-Session` trailers.
- Deliberate, documented exceptions to "identical options": `language` (`sql` vs `formulaLang`), `minimap` (on for SQL, off for short formulas), `fontLigatures`, `mouseWheelZoom`, `wordBasedSuggestions`. Everything else is shared.

## Corrections found while building (plan amended)

**There is no dark mode.** Four components branched on
`document.body.classList.contains('dark-theme')`, but nothing in the app ever
*adds* that class — every reference only read it, so the dark arm could never
fire and Monaco always rendered light. Three of the four copies were identical
dead code. There is now ONE theme. Task 7 therefore drops its dark-mode leg:
toggling a class nothing honours would be a test of nothing.

**The theme must be built at runtime, not written as hex.** `ThemeService`
rewrites `--primary-color`, `--primary-color-transparent` and eleven siblings at
runtime from each organisation's brand settings. Hard-coded hex — which is what
the first cut of the suggest-widget theme used — means a red-branded org gets a
red app and a stock-blue editor. `monaco-theme.ts` now reads the *computed* token
values and converts them to the `#rrggbb[aa]` form Monaco demands (it rejects
`rgb()`/`rgba()` and throws while defining the theme). Re-running
`defineDbexecThemes()` is how an editor picks up a brand change.

**A shared service, not just shared constants.** Shared config still left every
component repeating the load → register → theme → create → assert → dispose
sequence. `CodeEditorService` owns it, which also fixes two traps once for
everyone: Monaco's events fire outside Angular's zone (an OnPush component never
re-renders — the symptom was a Run button staying grey while typing), and partial
disposal leaked completion providers.

## Feature parity matrix — nothing may be lost

| CodeMirror 6 today | Monaco replacement | Note |
|---|---|---|
| `lineNumbers()` | `lineNumbers: 'on'` | option |
| `highlightActiveLine/Gutter()` | `renderLineHighlight: 'all'` | option |
| `drawSelection()`, `rectangularSelection()` | native; `multiCursorModifier: 'alt'` | option |
| `history()` | native undo/redo | free |
| `foldGutter()` | `folding: true` | option |
| `bracketMatching()` | `matchBrackets: 'always'` | option |
| `closeBrackets()` | `autoClosingBrackets: 'always'` | option |
| `indentOnInput()` | `autoIndent: 'full'` | option |
| `highlightSelectionMatches()` | `selectionHighlight`, `occurrencesHighlight` | option |
| `search({createPanel})` custom compact card | native find widget, **restyled** to the same card | Task 5 |
| `lintGutter()` + `setDiagnostics` | `monaco.editor.setModelMarkers` via existing `SqlValidatorService` + `SqlLinterService` | Task 4, an upgrade |
| `runFlashField` (flash the statement that ran) | decorations collection | Task 2, must be rebuilt |
| `placeholder(...)` | Monaco has none — small overlay | Task 2, must be rebuilt |
| `syntaxHighlighting(defaultHighlightStyle)` | built-in `sql` tokenizer | free |
| `wrapCompartment` | `updateOptions({ wordWrap })` | option |
| `@replit/codemirror-minimap` | native minimap | drops a dependency |
| `langCompartment` / `buildLanguage()` dialect | `MonacoIntelliSenseService.setActiveDbType()` + dialect specs | Task 3 |
| `dbexecCompletionSource` + `SchemaCatalog` | `registerSQLCompletions` + adapter + lazy hook | **Task 3, the crux** |
| `Mod-Enter` / `Mod-Shift-Enter` | `editor.addCommand(KeyMod.CtrlCmd \| KeyCode.Enter, …)` | Task 2 |
| `splitStatements`, `statementAtCursor` | unchanged — pure functions, no CM import | free |

## The IntelliSense bridge (the one genuinely new capability)

The executor must keep lazy loading: it fetches a table's columns only when completion needs them. `MonacoIntelliSenseService` currently reads a materialised tree, so it needs a hook.

```
SchemaCatalog (lazy, Maps)                MonacoIntelliSenseService
  schemas: string[]                         setDatasources(DatasourceSchema[])
  tablesBySchema: Map                       setActiveDbType(dbType)
  byTable: Map<'schema.table', ColInfo[]>   registerSQLCompletions(ds, editor)
            │                                          ▲
            │  catalogToDatasourceSchema()              │ re-fed on every growth,
            └───────────────────────────────────────────┘ exactly as add-dataset
                                                          already does
  on cache miss for a table's columns:
    service → onColumnsRequested(schema, table) → executor fetches → catalog grows
            → setDatasources(...) again → Monaco re-triggers suggest
```

Two additions only, both additive so existing callers are untouched:

- `shared/editor/schema-bridge.ts` — `catalogToDatasourceSchema(name, dbType, cat)`.
- `MonacoIntelliSenseService.setColumnRequestHandler(fn)` — invoked on a columns cache miss. Default undefined ⇒ present behaviour.

## File Structure

**Create**

- `src/app/shared/editor/code-editor.service.ts` — **`CodeEditorService`**, the one way to create an editor: loads Monaco, registers the language, defines the theme, creates, re-asserts the global theme, wires zone-safe `onChange`, and disposes everything through one `EditorHandle.dispose()`. Every component goes through this instead of repeating the sequence.
- `src/app/shared/editor/monaco-theme.ts` — one theme, `dbexec`, **built at runtime from the computed design tokens**. See the correction below.
- `src/app/shared/editor/formula-language.ts` — `formulaLang` grammar + registration, moved out of the dataset module so the shared layer does not import from a feature module.
- `src/app/shared/editor/monaco-options.ts` — `BASE_EDITOR_OPTIONS` (the field-creator superset) plus `sqlEditorOptions()` and `formulaEditorOptions()`.
- `src/app/shared/editor/schema-bridge.ts` — `SchemaCatalog` → `DatasourceSchema[]`.
- `src/app/shared/editor/editor-placeholder.ts` — placeholder overlay Monaco lacks.
- `src/app/shared/editor/run-flash.ts` — the executed-statement flash as a decorations helper.
- `src/assets/sass/_editor-chrome.scss` — the shared frame, toolbar, panel-header, side-row and status-bar mixins, lifted from the field creator.
- `e2e/editor-parity.e2e.ts` — cross-module visual + computed-style parity.
- `e2e/query-executor.e2e.ts` — executor behaviour: run, IntelliSense, find, lint, minimap, wrap.

**Modify**

- `src/app/modules/query-runner/executor/query-executor.component.ts` (1,973) — CodeMirror out, Monaco in.
- `src/app/modules/query-runner/executor/query-executor.component.scss` (1,411) — `qx-*` chrome onto the shared mixins.
- `src/app/modules/dataset/services/monaco-intellisense.service.ts` — add the lazy hook.
- `src/app/modules/dataset/config/{sql,formula}-editor.config.ts` — re-export from `shared/editor` (keep the names; many imports).
- `src/app/modules/dataset/components/formula-field-dialog/formula-monaco.helper.ts` — move themes to `shared/editor`, keep `registerFormulaLanguage`.
- `add-dataset`, `edit-dataset`, `formula-field-dialog` components — consume the shared theme/options.
- `package.json` — drop the CodeMirror editor packages.

**Delete**

- `src/app/modules/query-runner/executor/completion.ts` (superseded by the shared IntelliSense)
- `src/app/modules/query-runner/executor/search-panel.ts` (Monaco's find widget, restyled)
- `src/assets/sass/_codemirror-theme.scss` (296 lines)

---

### Task 1: Shared editor foundation, with the two Monaco modules repointed

No visible change is intended. This task exists to make Tasks 2–8 edit one file instead of five.

**Files**
- Create: `src/app/shared/editor/monaco-theme.ts`, `monaco-options.ts`
- Create: `src/assets/sass/_editor-chrome.scss`
- Modify: `src/app/modules/dataset/config/sql-editor.config.ts`, `formula-editor.config.ts`
- Modify: `.../formula-field-dialog/formula-monaco.helper.ts`, `formula-field-dialog.component.ts`
- Modify: `.../add-dataset/add-dataset.component.ts`, `.../edit-dataset/edit-dataset.component.ts`

**Interfaces**
- Produces: `defineDbexecThemes(): void`; `currentDbexecTheme(): 'dbexec-light' | 'dbexec-dark'`; `BASE_EDITOR_OPTIONS`; `sqlEditorOptions(overrides?)`; `formulaEditorOptions(overrides?)`.
- Consumes: nothing new.

- [x] **Step 1** Write `monaco-theme.ts`. Generalise the `formula-light`/`formula-dark` themes already in `formula-monaco.helper.ts` into `dbexec-light`/`dbexec-dark`, `inherit: true` from `vs`/`vs-dark`, covering: `editor.background`, `editor.foreground`, `editorLineNumber.foreground`/`activeForeground`, `editor.lineHighlightBackground`, `editor.selectionBackground`, `editor.selectionHighlightBackground`, `editorCursor.foreground`, `editorIndentGuide.*`, `editorBracketMatch.*`, `editorGutter.background`, `editorError./editorWarning.foreground`, the full `editorSuggestWidget.*` set, `editorHoverWidget.*`, and `editorWidget.*` + `input.*` (the find widget). Each value carries a comment naming the token it mirrors.
- [x] **Step 2** Write `monaco-options.ts`. `BASE_EDITOR_OPTIONS` = the 32 shared keys plus the 22 the field creator adds. `sqlEditorOptions()` layers `{ language: 'sql', minimap: { enabled: true }, fontLigatures: true, mouseWheelZoom: true, wordBasedSuggestions: false }`; `formulaEditorOptions()` layers `{ language: 'formulaLang', minimap: { enabled: false }, fontLigatures: false, mouseWheelZoom: false, wordBasedSuggestions: 'currentDocument' }`. Comment each divergence with why it is context-appropriate rather than an oversight.
- [x] **Step 3** Write `_editor-chrome.scss` with mixins `editor-frame()`, `editor-toolbar()`, `editor-panel-head()`, `editor-side-row()`, `editor-status-bar()`, extracted from the field-creator SCSS (`.acf-editor` frame: `1px solid var(--border-color)`, `var(--radius-sm)`, `var(--card-background)`, `:focus-within` → `--primary-color` border + `0 0 0 2px var(--primary-color-transparent)`).
- [x] **Step 4** Turn `sql-editor.config.ts` and `formula-editor.config.ts` into thin re-exports (`export const MONACO_EDITOR_OPTIONS = sqlEditorOptions();`) so the many existing import sites keep working.
- [x] **Step 5** Repoint the three Monaco components at `defineDbexecThemes()` / `currentDbexecTheme()`; delete the local `formula-light`/`formula-dark` definitions from `formula-monaco.helper.ts`, keeping `registerFormulaLanguage` and `FORMULA_TOKENIZER`.
- [x] **Step 6** Apply `@include editor-frame()` to `.acf-editor` and to the dataset creator/editor SQL editor frames.
- [x] **Step 7** Gate: `tsc` → `ngc` → prod build.
- [x] **Step 8** Playwright: `formula-fields` (16) and `formula-screenshots` (37) must both pass unchanged — this task must not alter behaviour or appearance in the field creator.
- [x] **Step 9** Commit `refactor(editor): single Monaco theme, options and chrome for the dataset editors`.

### Task 2: Query Executor on Monaco — mount, options, keys, flash, placeholder

Editing and running SQL must work end to end before IntelliSense is touched.

**Files**
- Modify: `query-executor.component.ts`
- Create: `src/app/shared/editor/editor-placeholder.ts`, `run-flash.ts`

**Interfaces**
- Consumes: `sqlEditorOptions()`, `defineDbexecThemes()`, `currentDbexecTheme()`, `MonacoLoaderService`, existing `splitStatements`/`statementAtCursor`.
- Produces: `attachPlaceholder(editor, text): () => void`; `flashRange(editor, range): void`.

- [x] **Step 1** Replace the `EditorView`/`EditorState` construction with `monaco.editor.create(host, { ...sqlEditorOptions(), value, theme })`, mirroring add-dataset's init (loader → register language → define themes → create → assert theme).
- [x] **Step 2** Re-wire the model-content subscription: `onDidChangeModelContent` → `currentQuery`, autosave draft, `cdr.markForCheck()` (Monaco fires outside Angular's zone; OnPush will not notice otherwise — the same trap add-dataset documents).
- [x] **Step 3** Port the keybindings with `editor.addCommand`: `CtrlCmd+Enter` → `run('smart')`, `CtrlCmd+Shift+Enter` → `run('all')`, each wrapped in `zone.run`.
- [x] **Step 4** Replace `wrapCompartment` / `minimapCompartment` toggles with `editor.updateOptions({ wordWrap, minimap })`.
- [x] **Step 5** Write `run-flash.ts` using a decorations collection and a timed clear; call it where `runFlashField` was dispatched.
- [x] **Step 6** Write `editor-placeholder.ts` — an absolutely-positioned element inside the frame, shown while the model is empty and unfocused, using `--text-color-secondary` and `--fs-control`. String comes from an i18n key added to all 10 locales.
- [x] **Step 7** Gate: `tsc` → `ngc` → prod build.
- [x] **Step 8** Playwright `e2e/query-executor.e2e.ts`: editor renders; typing updates the Run button's enabled state; `Ctrl+Enter` runs the statement at the cursor; `Ctrl+Shift+Enter` runs all; word-wrap and minimap toggles take effect; placeholder shows when empty and hides on input.
- [x] **Step 9** Commit `feat(query-runner): move the executor editor to Monaco`.

### Task 3: IntelliSense — schema, table and column suggestions, lazily

The task the user singled out. Success is measured against the executor's current three behaviours *plus* the extras the Monaco service brings.

**Files**
- Create: `src/app/shared/editor/schema-bridge.ts`
- Modify: `monaco-intellisense.service.ts`, `query-executor.component.ts`
- Delete: `executor/completion.ts`

**Interfaces**
- Produces: `catalogToDatasourceSchema(name: string, dbType: string, cat: SchemaCatalog): DatasourceSchema[]`; `MonacoIntelliSenseService.setColumnRequestHandler(fn: (schema: string | undefined, table: string) => void): void`.
- Consumes: `SchemaCatalog`, `registerSQLCompletions`, `setActiveDbType`.

- [x] **Step 1** Write `schema-bridge.ts` mapping `SchemaCatalog` → `DatasourceSchema[]`: one datasource, `schemas` from `cat.schemas`, each schema's `tables` from `tablesInSchema`, each table's columns from `cat.columns(schema, name)` — empty array when not yet fetched. Preserve `isPrimaryKey`, `dataType`, `nullable`, since the completion detail and PK boost depend on them.
- [x] **Step 2** Add `setColumnRequestHandler` plus a private `requestColumns(schema, table)` to `MonacoIntelliSenseService`, called wherever it finds no cached columns for a referenced table. Guard against repeat requests for the same key in flight.
- [x] **Step 3** In the executor, call `setActiveDbType(connection.dbType)`, register completions once, install the request handler to hit the existing lazy column fetch, and re-call `setDatasources(catalogToDatasourceSchema(...))` after every catalog growth — mirroring add-dataset.
- [x] **Step 4** Delete `completion.ts` and its import.
- [x] **Step 5** Gate: `tsc` → `ngc` → prod build.
- [x] **Step 6** Playwright, extending `query-executor.e2e.ts` — assert each behaviour by reading the suggest widget rows:
  - after `SELECT * FROM ` → schemas **and** tables offered
  - `public.` → that schema's tables
  - `FROM users u WHERE u.` → users' columns, PK first, type shown as detail
  - unqualified `SELECT ` with two joined tables → columns of both, alias-prefixed
  - a table whose columns were never fetched → suggestions appear after the lazy fetch resolves (the regression risk of this whole task)
  - a CTE name → its projected columns (new capability, absent before)
  - dialect check: switching a MySQL connection offers MySQL-only functions
- [x] **Step 7** Commit `feat(query-runner): shared Monaco SQL IntelliSense with lazy column loading`.

### Task 5b: Adopt CodeEditorService in the remaining four editors

Only the executor creates its editor through the service. `add-dataset`,
`edit-dataset`, `formula-field-dialog` and `prompt/sql-query-dialog` still call
`monaco.editor.create` directly — they share the theme and the options, but not
the lifecycle, so they miss zone-safe `onChange`, single-call disposal and the
placeholder. Migrate each to `codeEditor.create({ flavour })` + `EditorHandle`,
then re-run `formula-fields` (16) and `formula-screenshots` (37).

### Task 4: Diagnostics and formatting

- [ ] **Step 1** Replace `lintGutter()`/`setDiagnostics` with `SqlValidatorService.validateDebounced(model)` and the dialect lint pass on `onDidChangeModelContent`, exactly as add-dataset wires them.
- [ ] **Step 2** Register `SqlFormatterService` formatting provider + context-menu actions on the executor editor.
- [ ] **Step 3** Gate: `tsc` → `ngc` → prod build.
- [ ] **Step 4** Playwright: a deliberate syntax error paints a squiggle and a marker with the same styling as the dataset creator; format-document reindents; markers clear when corrected.
- [ ] **Step 5** Commit `feat(query-runner): shared SQL validation, linting and formatting`.

### Task 5: Find/replace, then remove CodeMirror

- [x] **Step 1** Delete `search-panel.ts`; rely on Monaco's find widget with `find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never', seedSearchStringFromSelection: 'selection' }` — already in `BASE_EDITOR_OPTIONS`.
- [x] **Step 2** Style the find widget as a floating card (`.monaco-editor .find-widget`) via `_editor-chrome.scss`, matching the compact card the custom panel had, using tokens only.
- [x] **Step 3** Remove every remaining `@codemirror/*` editor import from the executor; delete `_codemirror-theme.scss` and its `@use`/`@import`.
- [x] **Step 4** Uninstall `@codemirror/{view,state,commands,autocomplete,search,lint,language,theme-one-dark}`, `codemirror`, `@replit/codemirror-minimap`. **Keep `@codemirror/lang-sql`** and add a comment in `sql-dialects/index.ts` recording that it is retained for keyword data, not as an editor, so nobody removes it later.
- [x] **Step 5** Gate: `tsc` → `ngc` → prod build; confirm the bundle shrank.
- [x] **Step 6** Playwright: `Ctrl+F` opens the styled find widget; find-next highlights; replace works; the whole executor spec still passes.
- [x] **Step 7** Commit `refactor(query-runner): drop CodeMirror for Monaco's find widget`.

### Task 6: Chrome convergence — toolbars, headers, buttons

The chosen scope. Restyle, do not re-lay-out.

- [ ] **Step 1** Map `qx-*` → shared mixins: `.qx-toolbar` → `editor-toolbar()`, `.qx-browser-head` → `editor-panel-head()`, `.qx-node`/`.qx-col` → `editor-side-row()`, `.qx-editor` → `editor-frame()`.
- [ ] **Step 2** Replace hard-coded colours/sizes in the touched `qx-*` blocks with tokens; leave `.qx-body`, `.qx-results`, `.qx-shell` structure alone.
- [ ] **Step 3** Same pass over the dataset creator/editor toolbar, step header and preview-panel header.
- [ ] **Step 4** Swap ad-hoc buttons for `app-button` where a variant matches, so button styling is shared rather than merely similar.
- [ ] **Step 5** Gate: `tsc` → `ngc` → prod build.
- [ ] **Step 6** Playwright: screenshot each of the five screens; no console errors; existing specs pass.
- [ ] **Step 7** Commit `style(editor): shared toolbar, panel-header and button chrome`.

### Task 7: Cross-module parity verification

The test that proves the goal rather than asserting it.

- [ ] **Step 1** Write `e2e/editor-parity.e2e.ts`. For each of the five screens, read the editor frame's **computed styles** (`border`, `border-radius`, `background-color`, `font-family`, `font-size`, `line-height`) plus the gutter and suggest-widget row styles.
- [ ] **Step 2** Assert every screen reports the same values — the frame, font stack and suggest-widget colours must match exactly. Fail with a table naming the divergent property and screens, so a regression says what broke.
- [ ] ~~Step 3 Repeat in dark mode~~ — dropped: the app has no dark mode (see Corrections). Instead, assert parity holds after a brand-colour change, which is the variation that actually exists.
- [ ] **Step 4** Capture `screenshots/editor-parity-*.png` for all five screens in both themes.
- [ ] **Step 5** Commit `test(editor): assert computed-style parity across the five editor screens`.

### Task 8: Docs

- [ ] **Step 1** Prepend dated Progress entries to `docs/context/modules/dataset.md` and `query-runner.md`; update both Status/Last-updated lines and their `INDEX.md` rows.
- [ ] **Step 2** Add a `SESSION_LOG.md` entry; note in `ARCHITECTURE.md` that Monaco is the single editor and `shared/editor/` owns its theme and options.
- [ ] **Step 3** Update the root `CLAUDE.md` UI-kit section: one editor, where its config lives, and the `@codemirror/lang-sql`-as-data caveat.
- [ ] **Step 4** Commit `docs(context): record the editor unification`.

---

## Risks

| Risk | Mitigation |
|---|---|
| Lazy column loading regresses, so IntelliSense looks fine on small DBs and stalls on large ones | Task 3 Step 6 explicitly tests a never-fetched table; the request handler is the first thing to check if suggestions go quiet |
| The executor is the most complex FE module (1,973 lines) and holds autosave, tabs, saved queries, results grid | Only the editor is replaced. `splitStatements`/`statementAtCursor` are pure and untouched; the grid and tab model are not in scope |
| Monaco fires outside Angular's zone | Every handler wraps in `zone.run` / `markForCheck`, following add-dataset, which already documents this trap |
| `monaco.editor.setTheme` is global, so one editor can restyle another | `defineDbexecThemes()` is idempotent and every component re-asserts its theme after `create` — the existing pattern, now centralised |
| Bundle grows from adding Monaco to the executor | Monaco is already bundled for the dataset module; nine CodeMirror packages leave. Expect a net decrease, verified in Task 5 Step 5 |
| A shared options object drifts back apart | `sql-editor.config.ts` and `formula-editor.config.ts` become re-exports, so there is only one definition to change |
