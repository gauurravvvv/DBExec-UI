# Handoff — current state (2026-07-29)

Read this first, then `INDEX.md` → the module file(s) you're touching →
`ARCHITECTURE.md` if the change is cross-cutting.

This file states what IS, not what happened. History lives in each module's
Progress log and `SESSION_LOG.md`.

## Where the code stands

**Branch `version_261`. The user pushes; never push.**

### Code editors — one library, one service
Monaco is the **only** code editor. CodeMirror was retired 2026-07-28 (nine
packages removed). There is exactly ONE `monaco.editor.create` call in the
codebase, inside `shared/editor/CodeEditorService`; five screens go through it —
Query Executor, Dataset Creator, Dataset Editor, Field Creator, prompt SQL dialog.

- **Never call `monaco.editor.create` directly.** Use
  `codeEditor.create({ host, flavour: 'sql' | 'formula' })` → `EditorHandle`.
- `shared/editor/` owns: the service, `monaco-theme.ts` (ONE theme, built at
  **runtime from computed design tokens** — `ThemeService` rewrites the brand
  colour per organisation, so hard-coded hex is wrong), `monaco-options.ts` (one
  options object; only five options differ by context, each documented),
  `formula-language.ts`, `editor-doc.ts` (offset-oriented model access),
  `editor-placeholder.ts`, `run-flash.ts`, `schema-bridge.ts`.
- Chrome lives in `assets/sass/_editor-chrome.scss` as `editor-*` mixins
  (`@import`, so names are prefixed). Two mixins are included ONCE globally in
  `styles.scss` because Monaco renders those widgets outside view encapsulation.
- **There is no dark mode.** Four components used to branch on a `dark-theme` body
  class nothing ever adds. Don't add that branch back.
- Monaco's `addCommand` and `addAction` **do not bind** in this app (measured — its
  own built-ins do). Shortcuts use `CodeEditorService.addShortcut`, which is
  `onKeyDown` with explicit matching.
- `@codemirror/lang-sql` is still installed as keyword **DATA** for the six dialect
  specs (and a Lezer parser for the disabled dialect lint). Not an editor; read
  `modules/dataset/config/sql-dialects/index.ts` before removing it.

### Derived fields — one engine
The two calc-field engines merged 2026-07-27. `{brace}` syntax survives; the
`[bracket]` SQL compiler, its `CalculatedField` entity and `calculated-fields.service.ts`
are deleted. The 137-function palette is **served by the API**, so the FE holds no
formula knowledge. A single `=` is equality.

### Object explorers and lists
Three surfaces list DB objects (executor browser, dataset schema sidebar, field
sidebar) and share one mixin set. Conventions that are easy to break:
- Tables are **never** wrapped in a category node — they sit directly under the
  schema at the same depth everywhere.
- A column's data type belongs in a **tooltip**, not an inline label. Hiding an
  inline label with `opacity: 0` still reserves its box and truncates the name.
- Icons come from `shared/helpers/data-type-icon.ts` — one vocabulary. Never one
  glyph for a list of typed things.
- `--fs-control` renders at **11.375px** here: the token comments assume a 16px
  root, this app sets 14px. Use `--fs-body` for anything read down a list.
- Dialogs: fixed height, `flex-shrink: 0` on header and tab strip,
  `table-layout: fixed` on data tables.

## Verification gate — all three, in order
```bash
npx tsc --noEmit                          # types only
npx ngc -p tsconfig.app.json --noEmit     # TEMPLATES too — tsc misses these
npx ng build --configuration production   # dangling lazy imports, full AOT
```
`ngc` has caught real bugs here that `tsc` passed. A green `tsc` with a broken
template still ships a runtime error.

**Watch for stale bundles:** if `ng serve` logs `✖ Failed to compile`, a later
partial rebuild can leave a chunk stale and tests then fail against code you did
not write. Restart `ng serve` when in doubt.

## e2e suites (FE :4200, BE :3000, org AIOrg / admin_gaurav / Pass@1234)
```bash
npx playwright test -c e2e/playwright.config.ts <name>
```
| Suite | Covers | Status |
|---|---|---|
| `formula-fields` | formula dialog behaviour, 16 cases | **8/16 blocked** — see below |
| `formula-screenshots` | 37 labelled captures; asserts its own labels | passing |
| `query-executor` | mount, run shortcuts, IntelliSense incl. the lazy path, toggles, markers, find | 7/7 |
| `editor-parity` | **computed styles** across the four editor components + explorer rows | 1/1 |
| `editor-showcase` | review screenshots + icon/tab-strip regression guards | 3/3 |
| `screenshot-cleanup` | removes the fields the sweeps create | — |

Helpers are shared in `e2e/_auth.ts` (login, token, first connection). The stored
token key is `accessToken`; a naive `/"token"/` match picks up `refreshToken` and
401s. Never use `waitUntil: 'networkidle'` — the app holds an open SSE stream.

The executor suites need a query-runner connection; `e2e-local-pg` exists in AIOrg
(warehouse `postgres` creds from the API `.env`).

## Open items, highest first
1. **Datasource connection blocker.** `formula-fields` fails 8/16 with "Failed to
   connect to the datasource" from `/fields/validate`. **Environmental, not a FE
   regression** — reproduces with all FE changes stashed, a single validate returns
   200, Postgres shows 11/100 connections. `/fields/validate` executes against the
   datasource to return `evaluatedValue`, so it is connection-bound; a user
   validating several formulas in a row would hit it. Backend fix.
2. **Component decomposition** — `docs/superpowers/plans/2026-07-28-dataset-component-decomposition.md`.
   84 of 96 methods shared between add- and edit-dataset: 35 byte-identical,
   **49 drifted** (same feature, different behaviour when creating vs editing).
   Blocked on there being no functional e2e for dataset create/edit — write that
   first, then reconcile the drift, then extract a base class.
3. Dead field metadata (`role`/`defaultAggregation`/`formatHint`/`isVisible`) —
   written and returned, **zero** backend consumers.
4. `view-dataset` renders its own inline field list instead of `app-field-sidebar`.
5. FK markers in the executor once the BE returns `isForeignKey`.

## Screenshots
`../../screenshots/` (53 images) with a README indexing every one. Regenerate with
`editor-parity` + `editor-showcase` + `formula-screenshots`, then
`screenshot-cleanup`.
