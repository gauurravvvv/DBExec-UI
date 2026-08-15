# dbexec-ui — Architecture & Cross-Cutting Decisions
> Decisions that span modules. Update here + SESSION_LOG when a global decision changes.
> Last updated: 2026-07-24

## Stack (verified from package.json + angular.json)
- **Angular 18.2** (strict, **module-based** — NOT standalone; every feature is a lazy `NgModule`). TypeScript ~5.4. RxJS 7.8 + **signals** (signals preferred for new state).
- **UI:** PrimeNG 17.18 + PrimeFlex 3.3 + PrimeIcons 7.
- **Editors/data:** **Monaco 0.52 — the only code editor, everywhere**, created solely through `shared/editor/CodeEditorService` (see the section below). CodeMirror was retired 2026-07-28; `@codemirror/lang-sql` remains as keyword DATA for the six dialect specs, not as an editor. AG Grid 32 (**executor result grid ONLY** — retired for lists); pgsql-ast-parser, sql-formatter.
- **Charts:** ECharts 5.6 + echarts-gl + ngx-echarts 18. (Chart.js legacy/minimal.)
- **Validation:** Zod 4.4 — schemas in `src/app/shared/validators/` **byte-identical** with `dbexec-api/src/shared/validators/`.
- **State:** signals (new), NgRx 18 (analyses/filters store), BehaviorSubject (legacy).
- **i18n:** @ngx-translate 15 — 10 locales in `src/assets/i18n/`.
- **Ports:** dev server `4200`; prod FE `8755`. API base `environment.apiServer` (dev `:3000/api/v1`, prod `:9058/api/v1`).
- **Verify gate (all three):** `npx tsc --noEmit` → `npx ngc -p tsconfig.app.json --noEmit` → `npx ng build --configuration production`. `tsc` alone does NOT check templates.

## Decisions (with rationale)
- **JWT-driven tenancy, header `x-auth-token` (NOT Bearer).** The interceptor sends `x-auth-token` from localStorage and never sends `x-organization-id`; org identity is entirely server-side. FE services drop `orgId` from signatures. — *matches BE JWT-single-source model.*
- **Token storage = localStorage via `StorageService`** (`access-token`, `refresh-token`, `permission-tree`, `organisation`, `locale`, `AI_CONFIGURED`, relay-* fields). `http-request.interceptor` attaches the header + does proactive/reactive refresh (440 → refresh → retry). — *header transport works even inside a cross-site iframe partition (relevant to the planned OEM embed).*
- **Two-phase login.** Phase 1 mints/stashes tokens (password / SAML `sso-relay` / future embed-relay all converge here); the `/relay` component then boots phase 2 via `GET /auth/session` (permissions, theme, branding, announcements). — *one bootstrap path for every login type.*
- **Permission-tree-driven UI.** `role.guard` checks a route's `data.permission` against the JWT permission tree (held in `permission.service`); the sidebar (`SIDEBAR_ITEMS_ROUTES`) renders only permitted entries. No role-name bypass. — *mirrors BE `VerifyPermissionMiddleware`.*
- **Shared `app-custom-*` UI kit is the single source of styled controls** (`custom-table`, `custom-input`, `custom-dropdown`, `button`, `chip`, `email-chips-input`, `echart-visual`, `tabs`, …). `app-custom-table` (+ `UsServerListAdapter`, 50 rows, `createdOn DESC`) is THE list table; AG Grid retired for lists. **`app-tabs`** (`shared/components/tabs`) is THE tab strip — a themed, token-driven header (no PrimeNG): `[tabs]` (`AppTab[]`: value/label/icon/permission/count/disabled), `[(active)]`, `(activeChange)`; renders ONLY the strip, caller renders the active body via `[ngSwitch]`. Per-tab `permission` gates visibility. Replaces the hand-rolled `::ng-deep .p-tabview` overrides; a matching themed default for any remaining `p-tabView` lives once in `styles.scss`.
- **Design tokens only** — CSS custom properties in `assets/sass/variables/_theme-variables.scss` (+ `_theme_dark.scss`). Never hard-code color/spacing/font-size. `--fs-*`, `--space-*`, `--primary-color`, weights `--fw-*`; fonts Inter (`--font-ui`) + JetBrains Mono. `theme.service` injects at runtime. **Two dark-theme gotchas** (invisible in light where most bg tokens all = `#fff`, but the org dark presets set them to *different* darks): (1) **EVERY form-field surface uses `--input-background` (the theme's dedicated input-surface token), NOT `--card-background`** — text inputs (`custom-input`/`custom-textarea`/`search-input`/`email-chips-input`), dropdowns, multiselects, calendars, dateranges, in-panel filter boxes, AND the global `.p-inputtext` base, AND each floating-label "notch" background. They must all share ONE token so (a) a text input and a dropdown on the same form match side-by-side, and (b) the floated-label notch cuts the field border seamlessly. A `--card-background` field/notch showed a mismatched chip in dark (the "Role"/"Date range" screenshots). Overlays/panels/menus (dropdown/multiselect panels, items) stay `--card-background` — they're elevated surfaces, not fields. (2) **PrimeNG 18 icons are SVG (`.p-icon`, paths `fill="currentColor"`), not `.pi` font glyphs** — colour them on the real class (e.g. `.p-sortable-column-icon`, `.p-icon` inside `p-sortIcon`/calendar nav) via `color`+`fill`; a `.pi`/`.p-sorticon`-only selector matches nothing and the icon ignores the theme.
- **HTTP only through `HttpClientService`** (never inject `HttpClient`); endpoints from `core/constants/api.constant.ts`; routes from `routes.constant.ts`. Interceptor DI cycle broken via deferred `Injector.get()` (NG0200 fix).
- **Dex AI = bubble only.** The shared `ai-launcher` (+ `ai-tool-step`, `ai-subagents`) is the entry — no sidebar item, no full page. `ai-chat.service` reduces a WebSocket step-stream into a nested step tree; `confirm()` posts to `POST /ai/confirm` (never the target endpoint directly). `screen-context.service` was removed (backend is not screen-aware).
- **Query Executor is a standalone lazy module OUTSIDE the `/app` shell** at `/query-runner/exec` — isolates the heavy AG Grid bundle (Monaco itself loads from a CDN via `MonacoLoaderService`). `/app/query-runner` is the saved-queries home.
- **`embed` module renders a public, chrome-less, token-gated dashboard OUTSIDE the shell** (no auth guard, no sidebar/header) — the precedent for a future host-controlled embedded mode.
- **`QbRuntimeSharedModule` is the reuse seam between Query Builder and Form Builder** (`modules/query-builder/qb-runtime-shared.module.ts`). It declares + exports the six routeless tree→SQL runtime components (`qb-filter-tree`, `qb-group-node`, `qb-condition-row`, `qb-value-control`, `qb-sql-preview`, `qb-summary`); both `QueryBuilderModule` and `FormBuilderModule` import it, so the Form Builder runtime composer reuses the injection-tested composer verbatim (NOT forked). A component may be declared in exactly one NgModule, so the six live only in the shared module. `QueryBuilderStore` is provided per runtime screen; the Form Builder composer provides `FormRuntimeStore` (which `extends QueryBuilderStore`) and aliases `{ provide: QueryBuilderStore, useExisting: FormRuntimeStore }` so the reused components drive the same tree instance. — *the whole point of Phase 7: one tree→SQL runtime, two front doors.*

## Conventions
- Screen quartet: `list-` (table + New) → `add-`/`edit-` (vertical form, one control per row, ~50% width) → `view-` (read-only + Edit/Open). OnPush + signals for new components.
- Delete via shared `.confirmation-popup` overlay (NOT `p-dialog`). Add/edit forms implement `HasUnsavedChanges` + `unsaved-changes.guard`.
- Validators mirror the BE file byte-for-byte; Zod messages are i18n keys. i18n: all 10 locales, no raw strings in templates.
- Loading state: `loading` (reads) / `saving` (writes) / per-id record maps (row spinners). **Writes NEVER show the global overlay** — the request interceptor is method-aware (GET blocks with `.spinner-container`; POST/PUT/PATCH/DELETE skip it by default). Busy is shown at the button: `<app-button [loading]="saving()" [disabled]="…||saving()">`, which also prevents double-submit (the button disables + its `onClick` guards). Escape hatches: `X-Skip-Loader` forces a read to skip; `forceLoader:true`/`X-Force-Loader` opts a write INTO the global block (rare). `skipLoader:true` on writes is now redundant. Multi-write-button screens use `shared/helpers/form-busy.ts` (`FormBusy`: `busy`/`activeAction`/`run()`); read-only buttons (Cancel/Back) are never disabled by busy. See `docs/superpowers/specs/2026-08-05-loading-busy-behavior-design.md`.
- Never commit `environment*.ts` / `.env`.
- Dates `YYYY-MM-DD` · Progress logs append-only, newest first · every change updates the module file + INDEX + SESSION_LOG.
- **Code is truth.** If these docs disagree with the code, fix the docs and log the correction.

## Code editors — one library, one theme (2026-07-28)

**Monaco is the only code editor.** CodeMirror 6 was retired when the Query
Executor migrated; nine `@codemirror/*` packages plus
`@replit/codemirror-minimap` were uninstalled. `@codemirror/lang-sql` remains as a
DATA dependency only — the six dialect specs harvest keyword and type word lists
from it, and it also supplies a Lezer parser used solely by the currently-disabled
dialect lint (`ENABLE_DIALECT_LINT = false`). No editor code imports it.

`src/app/shared/editor/` owns everything shared:

- **`CodeEditorService`** — the ONLY place `monaco.editor.create` is called. Every
  screen passes a flavour (`sql` | `formula`) and gets an `EditorHandle`. It owns
  load → register language → define theme → create → re-assert the global theme
  (Monaco's theme is global and leaks between editors) → focus → dispose, and it
  re-enters Angular's zone on change events, because Monaco fires outside the zone
  and OnPush components otherwise never re-render.
- `monaco-theme.ts` — ONE theme, built at runtime from the **computed** design
  tokens. Not hard-coded hex: `ThemeService` rewrites `--primary-color` and
  siblings per organisation, so literal values give a branded org a stock editor.
  Monaco rejects `rgb()`/`rgba()`, so values are converted to `#rrggbb[aa]`.
- `monaco-options.ts` — one options object. Only five options differ by context
  (language, minimap, ligatures, wheel zoom, word-based suggestions), each
  documented with its reason.
- `editor-doc.ts` — offset-oriented access to a Monaco model, because
  `splitStatements` works in character offsets to mirror the backend splitter.
- `editor-placeholder.ts`, `run-flash.ts` — the two things Monaco has no
  equivalent for.
- `schema-bridge.ts` — projects the executor's lazy `SchemaCatalog` into the tree
  `MonacoIntelliSenseService` consumes.

`assets/sass/_editor-chrome.scss` holds the shared frame, panel header, rows,
buttons, status bar and Monaco-widget styling. Mixins are prefixed `editor-`
because the project's stylesheets use `@import`, which shares one global
namespace. Two mixins (`editor-monaco-widgets`, `editor-overlays`) are included
once globally in `styles.scss`, because Monaco renders those widgets into its own
overflow container, outside any component's view encapsulation.

**There is no dark mode.** Four components used to branch on a `dark-theme` body
class that nothing in the app ever adds. If dark mode is added, give the tokens
dark values — the theme reads computed values, so it follows automatically.

Parity is enforced by `e2e/editor-parity.e2e.ts`, which compares computed styles
across the four components that mount an editor and fails naming any property
that differs.

### Explorer and list conventions (2026-07-29)

Three surfaces list database objects: the executor's object browser, the Dataset
Creator/Editor schema sidebar, and the live field sidebar. They share one set of
mixins in `_editor-chrome.scss` (`editor-explorer-*`, `editor-tree-row`,
`editor-side-row`, `editor-dialog-head`, `editor-dialog-close`, `editor-button`).

Rules worth knowing before changing any of them:

- **Tables are never wrapped in a category node.** They are the objects every
  explorer shows, so they sit directly under the schema at the same depth
  everywhere. Views, functions, sequences and triggers keep group headers — that is
  a data capability the dataset explorer lacks, not a styling difference.
- **A column's data type lives in a tooltip, not inline.** Hiding an inline label
  with `opacity: 0` still reserves its box and truncates the name — that is how
  `organisationName` became `organisat...`. Keep it out of layout.
- **Icons come from `shared/helpers/data-type-icon.ts`.** One vocabulary for the
  whole app. Do not hard-code a single glyph for a list of typed things.
- **Type scale:** the token comments assume a 16px root; this app sets 14px, so
  `--fs-control` renders at 11.375px. Use `--fs-body` for anything read down a
  list.
- **Dialogs:** fixed height, `flex-shrink: 0` on the header and any tab strip, and
  `table-layout: fixed` on data tables. A `max-height` dialog moves its tab strip
  as the data changes, and an auto-layout table lets one long token squeeze a prose
  column until it wraps per character.
- **Monaco's suggestion details pane** is normalised to collapsed on each open;
  Monaco otherwise remembers the expanded state for the session with no option to
  disable it.
