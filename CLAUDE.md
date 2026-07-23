# DBExec-UI — Frontend Reference

## Project Overview

Angular 18 + PrimeNG frontend for **DBExec** — a multi-tenant database
management, query execution, and visualization platform. Talks to the
`DBExec-API` Express backend over REST. This repo is the entire web client
(also wrapped as a desktop app via `DBExec-Desktop`).

For **what DBExec is and where it's going**, read `ref/PRODUCT.md`.
For **the backend contract** (endpoints, tenancy, auth), read
`../DBExec-API/CLAUDE.md`.

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
**Each file is byte-identical to `DBExec-API/src/shared/validators/<domain>.ts`** —
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
| `app-custom-textarea` / `app-custom-number`                                                                                | multiline / numeric                                                                                                                                      |
| `app-custom-dropdown`                                                                                                      | single-select; `serverMode` + `fetcher` for lazy-loaded options; always `appendTo="body"` on overlays                                                    |
| `app-custom-multiselect` / `app-custom-checkbox` / `app-custom-radio` / `app-custom-toggle` / `app-custom-binary-checkbox` | selections                                                                                                                                               |
| `app-custom-calendar` / `app-custom-daterange`                                                                             | dates                                                                                                                                                    |
| `app-chip` / `email-chips-input`                                                                                           | tags / Gmail-style editable recipient chips                                                                                                              |
| `app-button`                                                                                                               | buttons (variant system)                                                                                                                                 |
| `echart-visual` / `configurable-card-chart`                                                                                | charts (ECharts)                                                                                                                                         |

Legacy `us-data-grid` / AG Grid are **retired** for lists (replaced by
`app-custom-table`); AG Grid remains only inside the Query Executor result
grid. `us-server-list-adapter` is kept (it feeds `app-custom-table`).

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
- Lists: `app-custom-table` + server adapter (50, `createdOn DESC`).
- Controls: shared `app-custom-*`, `appendTo="body"` on overlays.
- Styling: tokens only (color / `--fs-*` / `--space-*`); no magic numbers.
- Validators: mirror the BE file byte-for-byte; messages are i18n keys.
- i18n: all 10 locales, no raw strings.
- Verify: `tsc` → `ngc --noEmit` → `ng build --configuration production`.
- Git: work on `version_261`; **the user pushes, never the agent**; never
  commit `environment*.ts` / `.env`. Commit trailer required (see below).

### Commit trailer (required)

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
```
