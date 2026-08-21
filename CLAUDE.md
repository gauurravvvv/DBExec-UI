# dbexec-ui — Frontend Reference

## Project Overview

Angular 18 + PrimeNG frontend for **DBExec** — a multi-tenant database
management, query execution, and visualization platform. Talks to the
`dbexec-api` Express backend over REST. This repo is the entire web client
(also wrapped as a desktop app via `dbexec-desktop`).

For **what DBExec is and where it's going**, read `ref/PRODUCT.md`.
For **the backend contract** (endpoints, tenancy, auth), read
`../dbexec-api/CLAUDE.md`.

## Quick Start

```bash
npm start                         # ng serve — dev server on :4200 (prod ports: FE 8755)
npx tsc --noEmit                  # type-check (fast, no templates)
npx ngc -p tsconfig.app.json --noEmit   # AOT strict — catches TEMPLATE binding errors
npx ng build --configuration production # full prod build (final gate)
```

**Verification gate (run all three before claiming FE work is done):**
`tsc --noEmit` → `ngc … --noEmit` → `ng build --configuration production`.
`tsc` alone is NOT enough — it does not check Angular templates. `ngc` AOT
strict catches a method/property/i18n-pipe reference in an `.html` that
doesn't exist on the component. The prod build catches dangling lazy imports
and full AOT compilation. A green `tsc` with a broken template still ships a
runtime error.

- **Backend base URL:** `environment.apiServer` (dev `http://localhost:3000/api/v1`,
  prod `http://localhost:9058/api/v1`). Set in `src/environments/environment*.ts`.
- **NEVER commit** `src/environments/environment.ts` / `environment.dev.ts` /
  `environment.prod.ts` or any `.env`. They are environment-specific.

## Architecture

### Angular version & style

Angular **18.2**, module-based (NOT standalone components) — every feature is
an `NgModule` lazy-loaded by the router. New state uses **signals**
(`signal()` / `.asReadonly()`); older code uses RxJS + `BehaviorSubject`.
Prefer signals for new services. `ChangeDetectionStrategy.OnPush` on new
components.

### Directory Structure

```
src/app/
├── core/                       # app-wide singletons (provided in root)
│   ├── constants/              # api.constant, routes.constant, permissions.constant, regex, ...
│   ├── guards/                 # auth.guard, role.guard, unsaved-changes.guard
│   ├── interceptors/           # http-request (adds x-auth-token), http-error
│   ├── layout/                 # shell: header, sidebar, main
│   ├── models/                 # shared TS interfaces
│   └── services/               # http-client, global, permission, theme, locale, storage, ...
├── shared/
│   ├── components/             # the shared UI kit — app-custom-* controls (see below)
│   ├── directives/  pipes/  helpers/
│   ├── validators/             # Zod schemas — MIRRORED byte-for-byte with the BE
│   └── shared.module.ts        # declares + exports the shared kit
└── modules/                    # one folder per feature (lazy NgModule)
    └── <domain>/               # alerts, analyses, dataset, dashboard, db-access,
        ├── components/         #   query-runner, users, groups, role, datasource, ...
        │   ├── list-<x>/       # list screen (app-custom-table)
        │   ├── add-<x>/        # create form
        │   ├── edit-<x>/       # edit form
        │   └── view-<x>/       # read-only detail
        ├── services/           # <domain>.service.ts — HTTP + signal state
        └── <domain>.module.ts  # routes + declarations
```

Module folders are singular/kebab per feature (`dataset`, `db-access`,
`query-runner`). Within a module the canonical screen quartet is
`list-` / `add-` / `edit-` / `view-`.

### Feature modules (25)

`alerts`, `analyses`, `app-settings`, `audit-logs`, `auth`, `dashboard`,
`dataset`, `datasource`, `db-access`, `embed`, `groups`, `home`,
`login-activity`, `organisation`, `profile`, `prompt`, `query-builder`,
`query-runner`, `rls-rules`, `role`, `section`, `system-admin`, `tab`,
`users`. See `ref/MODULE-MAP.md` for what each does.

## Key Patterns

### HTTP — always through `HttpClientService`

Never inject `HttpClient` directly in a feature service. Use
`core/services/http-client.service.ts`, which wraps the standard verbs and
routes through the interceptors.

- **`http-request.interceptor.ts`** prepends `environment.apiServer` to
  relative URLs and sets the **`x-auth-token`** header from stored auth
  (NOT `Authorization: Bearer`). It also handles token refresh.
- **`http-error.interceptor.ts`** centralizes error → toast + session-expiry
  (440) → redirect to login.
- The interceptor no longer sends `x-organization-id`; **org identity is
  entirely server-side from the JWT** (see the BE CLAUDE.md tenancy section).
  FE services do NOT pass `orgId` — method signatures are `loadOne(id)`,
  `bulkDelete(ids, justification?)`, etc.

### Service — signal-based state (new convention)

New feature services hold state in signals and expose readonly views:

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private _users = signal<any[]>([]);
  private _loading = signal(false); // reads
  private _saving = signal(false); // writes
  private _deleting = signal<Record<string, boolean>>({}); // per-id spinners
  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();
  // ...
}
```

Loading-state convention: `loading` for reads, `saving` for writes,
per-id record maps (`_deleting`, `_unlocking`) so each table row's action
button spins independently. Signal-based calls pass `{ skipLoader: true }`
to bypass the legacy global blocker — templates render skeleton placeholders

- button-level spinners instead. Reads pipe through a cancel `Subject` so a
  component's `ngOnDestroy` can abort in-flight GETs.

### API endpoint constants

All endpoints live in `core/constants/api.constant.ts`, grouped by domain
(`USER`, `QUERY_RUNNER`, `DATASET`, …). Services import the constant, never
hard-code a path.

### Routes

`core/constants/routes.constant.ts` — grouped route builders per domain
(e.g. `QUERY_RUNNER.CONNECTIONS_LIST`, `QUERY_RUNNER.connectionEdit(id)`).
Use these for `routerLink` / `navigateByUrl`; don't string-build paths.

### Validation — Zod, mirrored with the backend

Form validation schemas live in `src/app/shared/validators/<domain>.ts`.
**Each file is byte-identical to `dbexec-api/src/shared/validators/<domain>.ts`** —
the FE form and BE endpoint share ONE contract. When you change a validator,
edit BOTH files identically (limits object, schema, i18n message keys). Zod
messages are i18n keys (`validation.<domain>.<field>.<rule>`), resolved by
the translate layer. This is Zod 4 (`z.record` takes two args).

Client-side, forms `safeParse` before submit; the BE re-validates with the
same schema. Reactive forms also use `Validators` + regex from
`core/constants/regex.constant.ts` for live field feedback.

### Permissions

`core/constants/permissions.constant.ts` mirrors the BE permission catalog.
`role.guard.ts` reads a route's `data.permission` and checks the logged-in
user's permission tree (resolved from the JWT at login, held in
`permission.service.ts`). The sidebar shows only permitted entries. There is
**no role-name bypass** — everything is permission-value driven, matching the
BE `VerifyPermissionMiddleware`.

## UI Kit — shared components (use these, don't hand-roll)

`src/app/shared/components/` is the single source of styled controls. Prefer
them over raw HTML / raw PrimeNG so the whole app stays consistent:

| Component                                                                                                                  | Use for                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-custom-table`                                                                                                         | **The** list table — infinite scroll, no bulk-select, `UsServerListAdapter` for server paging (limit 50, `createdOn DESC`). Every list screen uses this. |
| `app-custom-input`                                                                                                         | text inputs (handles `autocomplete` via `effectiveAutocomplete`)                                                                                         |
| `app-custom-textarea` / `app-custom-number`                                                                                | multiline / numeric. **Textarea resize is locked to `none` by default** (no drag-resize skewing forms/popups); pass `resize="vertical"` to opt back in. `maxLength` + `inputId` inputs; label optional. |
| `app-custom-dropdown`                                                                                                      | single-select; `serverMode` + `fetcher` for lazy-loaded options; always `appendTo="body"` on overlays                                                    |
| `app-custom-multiselect` / `app-custom-checkbox` / `app-custom-radio` / `app-custom-toggle` / `app-custom-binary-checkbox` | selections                                                                                                                                               |
| `app-custom-calendar` / `app-custom-daterange`                                                                             | dates                                                                                                                                                    |
| `app-chip` / `email-chips-input`                                                                                           | tags / Gmail-style editable recipient chips                                                                                                              |
| `app-button`                                                                                                               | buttons (variant system); `[loading]` for button-level busy (write default — no global overlay)                                                          |
| `app-justification-dialog`                                                                                                 | the delete/save "reason" confirm popup — `mode` (delete/save), `[message]`, `[busy]`, `[(justification)]`, `(confirm)`/`(cancel)`; project a `.delete-info-list` for bullets. Replaces the ~26 hand-copied `.confirmation-popup` blocks. |
| `app-custom-color`                                                                                                         | colour picker (swatch + native picker + hex field, normalizes to `#rrggbb`); CVA                                                                         |
| `app-custom-file`                                                                                                          | file upload — drag-drop + browse, `accept`/`maxSizeMb` validation, file chip; CVA + `(fileSelected)`                                                      |
| `app-search-input`                                                                                                         | debounced list-toolbar search (leading icon, clear button, `debounce`); `(searchChange)` emits the trimmed term                                          |
| `echart-visual` / `configurable-card-chart`                                                                                | charts (ECharts)                                                                                                                                         |

Legacy `us-data-grid` / AG Grid are **retired** for lists (replaced by
`app-custom-table`); AG Grid remains only inside the Query Executor result
grid. `us-server-list-adapter` is kept (it feeds `app-custom-table`).

### Code editors — always via `CodeEditorService`

**Monaco is the only code editor.** CodeMirror was retired. Never call
`monaco.editor.create` directly: inject
`shared/editor/code-editor.service.ts` and call
`create({ host, flavour: 'sql' | 'formula' })`, which returns an `EditorHandle`.
The service owns the load/register/theme/create/dispose sequence, re-enters
Angular's zone on change events (Monaco fires outside it, so OnPush components
otherwise never re-render), and disposes every listener through one
`handle.dispose()`.

- Theme and options: `shared/editor/monaco-theme.ts` and `monaco-options.ts` —
  one definition each. The theme is built at runtime from the **computed** design
  tokens, because `ThemeService` rewrites the brand colour per organisation.
- Chrome: `@import 'assets/sass/editor-chrome'` and use the `editor-*` mixins.
- **Dark-aware (2026-08-21):** themes can now be dark presets (the per-user
  theme picker). `monaco-theme.ts` picks `base: vs-dark|vs` from the resolved
  `--card-background` luminance and pins explicit syntax `rules` from tokens, so
  editor text + suggest/hover widgets follow the theme. This is NOT the old
  `body.dark-theme` class branch (still don't add that) — it derives light/dark
  from the surface colour via `ThemeService.isDark`. The AG Grid result grid does
  the same (`colorSchemeDarkBlue|colorSchemeLightWarm` + token-driven params).
- `@codemirror/lang-sql` is still installed but is a **data** dependency (dialect
  keyword lists + a Lezer parser for the disabled dialect lint). Don't import it
  as an editor, and don't remove it without reading
  `modules/dataset/config/sql-dialects/index.ts`.

### Design tokens (theming)

CSS custom properties are the single styling source, defined in
`src/assets/sass/variables/_theme-variables.scss` (light) with dark overrides
in `_theme_dark.scss`. **Never hard-code colors, spacing, or font sizes** —
use the tokens:

- **Color:** `--primary-color`, `--secondary-color`, `--text-color`,
  `--warning-color`, `--surface-*`, `--border-*` (+ `-rgb` / `-transparent`
  variants).
- **Type scale:** `--fs-h1` (20px page title) → `--fs-h2` (17px) →
  `--fs-body` (14px) → `--fs-control` (13px) → `--fs-label` (12px) →
  `--fs-micro` (11px). Weights `--fw-*`.
- **Spacing:** `--space-0` … `--space-12` (2px → 64px; `--space-6` = 16px is
  the default page padding step).
- **Fonts:** `--font-ui` (Inter), monospace (JetBrains Mono) for code/IDs,
  Poppins reserved for the brand wordmark.

Fonts feature `cv11`/`ss03` (cleaner small text) and `tabular-nums` on every
column of numbers. Theme switches via `theme.service.ts` (light/dark);
CodeMirror has its own token-driven theme in `assets/sass/codemirror-theme`.

### Form & screen conventions

- Screens: `list-` (table + toolbar "New" button) → `add-`/`edit-` (vertical
  form, one control per row, ~50% width) → `view-` (read-only + Edit/Open).
- Delete via the shared `.confirmation-popup` overlay pattern (NOT `p-dialog`).
- Unsaved-changes: add/edit forms implement `HasUnsavedChanges` +
  `unsaved-changes.guard`.
- All `<form>` and text controls carry `autocomplete="off"`
  (`custom-input` emits `'new-password'` for password fields — browsers
  ignore `'off'` there).
- i18n: every user-facing string is a translate key in
  `src/assets/i18n/*.json` across **10 locales** (`en, de, es, fr, it, ja,
ko, nl, pt-BR, zh-CN`). No raw strings in templates. When adding a key,
  fill all 10 locales (reuse an existing key if the wording already exists —
  e.g. `QUERY_RUNNER.NEW_CONNECTION`).

### Page skeleton — one parent card, one back button (app-wide)

Every screen (list / add / edit / view / config) renders inside the SAME
shell so the app reads as one product. The **reference is `/app/db-roles`**
(list-db-roles). Do not invent a new wrapper/card treatment per module.

- **Parent card surface (the ONLY correct card):** `background:
  var(--card-background)` · `border-radius: var(--radius-md)` · `box-shadow:
  var(--shadow-sm)` · `padding: var(--space-8)` · **no border**. Theme-driven
  only — never hard-code a colour, radius, shadow, or `1.5rem 2rem`-style
  padding literal (that literal is `var(--space-8) var(--space-9)`; the card
  is symmetric `var(--space-8)`).
- **Where the card lives per screen type:**
  - LIST → on `.dataset-content-container` (inside `.dataset-page-wrapper`,
    which stays flush `padding: var(--space-0)`). `.content-card` (toolbar +
    table) stays **transparent** — no card-in-a-card.
  - FORM (add/edit/config) → on `.add-admin-wrapper`; `.add-admin-container`
    pads the form at `var(--space-8)`.
  - VIEW → on `.view-wrapper` / the module's view container; the header gets a
    bottom `1px solid var(--border-color)` rule.
- **`:host` stays clean** — no `background` / `border-radius` / `overflow` on
  `:host`; the card owns the surface (a host bg double-paints and clips the
  shadow).
- **Back button:** the 36px circular, transparent, hover-tinted arrow is a
  **single global rule** in `src/styles.scss` (`.back-button`). Put
  `class="back-button"` on the page header's back `<button>` (native,
  `pButton`, or `app-button`) and it is styled — never re-implement it
  per-component. Icon is `var(--fs-h2)`.
- **Shared source of truth:** `src/app/shared/styles/_page-skeleton.scss`
  exposes `page-list` / `page-form` / `page-view` mixins (+ `back-button`,
  `page-card-surface` helpers). NEW screens `@use` it and `@include` the right
  mixin instead of hand-rolling the shell. The db-access module keeps its own
  equivalent `db-access-page/-form/-view` mixins (the proven originals these
  generalise) — both produce the identical canonical card.
- **Intentional exceptions:** the full-bleed IDE editors
  (`query-editor-wrapper` — dataset/analyses add/edit) are deliberately
  edge-to-edge (`--radius-lg`, own toolbar) and are NOT forced into the card
  shell. Tabbed hubs (App/System Settings) own ONE card and flatten each tab
  child's container via `::ng-deep` so tabs don't card-in-card.

## Query Runner / Executor (notable subsystem)

The most complex FE module. Standalone executor tab at
`/query-runner/exec?conn=<id>&query=<savedId>`:

- **CodeMirror 6** editor (`@codemirror/*`) with SQL language, minimap,
  find/replace, fold, autosave draft, IntelliSense from a client-side
  `SchemaCatalog` (lazy schema/table/column fetch, keyed `${schema}.${table}`).
- Server-side result grid: single-SELECT results are `derivable`, so
  sort/filter/page re-query the DB instead of paging a truncated in-memory
  set.
- **Saved Queries**: owner-private CRUD; the saved-queries **list is the
  Query Executor home** at `/app/query-runner`. "New Query" opens a
  datasource→connection popup; saved queries preload SQL + rowLimit.

## Conventions Checklist

- Route through `HttpClientService`; endpoints from `api.constant.ts`;
  routes from `routes.constant.ts`.
- New services: signals + `providedIn: 'root'` + read/write/per-id loading.
- Lists: `app-custom-table` + server adapter (50, `createdOn DESC`). Every list
  is identical — only the data differs. Put ANY filter control (datasource
  picker, type chips, capability badge) in the `[tableToolbarStart]` slot so it
  shares the ONE toolbar row with the global search — never a separate
  `.list-filter-bar` band above the table (reference `/app/db-roles`). The empty
  state is a projected `<div tableEmpty class="ct-empty-body"><i…><span…></div>`;
  `.ct-empty-body` is defined ONCE globally in `styles.scss` (compact, top-
  aligned) — do NOT re-declare it per component.
- Controls: shared `app-custom-*`, `appendTo="body"` on overlays.
- Skeleton: one parent card (`--card-background` / `--radius-md` /
  `--shadow-sm` / `--space-8`), reference `/app/db-roles`; back button via the
  global `.back-button` class; `@use` `shared/styles/_page-skeleton.scss` for
  new screens. See **Page skeleton** above.
- Styling: tokens only (color / `--fs-*` / `--space-*`); no magic numbers.
- Validators: mirror the BE file byte-for-byte; messages are i18n keys.
- i18n: all 10 locales, no raw strings.
- Verify: `tsc` → `ngc --noEmit` → `ng build --configuration production`.
- Git: work on `version_261`; **the user pushes, never the agent**; never
  commit `environment*.ts` / `.env`. Follow the commit-message convention below.

### Commit message convention

- Write like a human developer: plain, factual, present-tense summary of what
  changed and why. No AI/model attribution — **never** mention Claude, an AI
  assistant, or any model name, and **no** `Co-Authored-By` / `Claude-Session`
  or any generated-by trailer.
- Subject: `type(scope): short summary` (e.g. `feat(users): bulk CSV add`),
  imperative, ~72 chars. Optional body: bullet points on the notable changes.

---

# Session Context Protocol (docs/context/)

> **Read this before every task, and update it after. Never skip the post-change update.**

@docs/context/INDEX.md

## Prime directive
`docs/context/` is the single source of truth for what each module is, its goals, and its
status — not chat history. On every task:
1. **Before working** → read `INDEX.md` + the relevant module file(s) (+ `ARCHITECTURE.md` if the
   task is cross-cutting: auth/token storage/layout/build/conventions).
2. **After working** → update the docs (see below).
Updating the docs is part of the definition of "done": a code change without a matching doc update
is an incomplete task. **If docs and code disagree, the CODE is truth** — fix the docs and log the
correction in the module's Progress log.

## Session-start protocol
Read `INDEX.md` → identify affected module(s) → read those module files in full → read
`ARCHITECTURE.md` if the change touches auth/token storage/layout/build/conventions. Read only
what's relevant, to stay token-efficient.

## Session-end protocol (do all before ending the turn)
1. Prepend a dated Progress entry to each affected module file (newest first).
2. Update that module's Status + Last updated line.
3. Update the module's row (status + date) in `INDEX.md`.
4. Add a dated `SESSION_LOG.md` entry; update `ARCHITECTURE.md` if a cross-cutting decision changed.
When a NEW module appears: create its file from the module template and add a row to `INDEX.md`.

Status legend: 🟢 stable · 🟡 in progress · 🔴 blocked · ⚪ planned. Dates `YYYY-MM-DD`
(`date +%Y-%m-%d`, never guess). Progress logs are append-only, newest entry at the top.
