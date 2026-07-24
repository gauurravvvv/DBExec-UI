# DBExec-UI — Architecture & Cross-Cutting Decisions
> Decisions that span modules. Update here + SESSION_LOG when a global decision changes.
> Last updated: 2026-07-24

## Stack (verified from package.json + angular.json)
- **Angular 18.2** (strict, **module-based** — NOT standalone; every feature is a lazy `NgModule`). TypeScript ~5.4. RxJS 7.8 + **signals** (signals preferred for new state).
- **UI:** PrimeNG 17.18 + PrimeFlex 3.3 + PrimeIcons 7.
- **Editors/data:** CodeMirror 6 (`@codemirror/*`, SQL, minimap, search) in the Query Executor; Monaco 0.52 (legacy, dataset editor); AG Grid 32 (**executor result grid ONLY** — retired for lists); pgsql-ast-parser, sql-formatter.
- **Charts:** ECharts 5.6 + echarts-gl + ngx-echarts 18. (Chart.js legacy/minimal.)
- **Validation:** Zod 4.4 — schemas in `src/app/shared/validators/` **byte-identical** with `DBExec-API/src/shared/validators/`.
- **State:** signals (new), NgRx 18 (analyses/filters store), BehaviorSubject (legacy).
- **i18n:** @ngx-translate 15 — 10 locales in `src/assets/i18n/`.
- **Ports:** dev server `4200`; prod FE `8755`. API base `environment.apiServer` (dev `:3000/api/v1`, prod `:9058/api/v1`).
- **Verify gate (all three):** `npx tsc --noEmit` → `npx ngc -p tsconfig.app.json --noEmit` → `npx ng build --configuration production`. `tsc` alone does NOT check templates.

## Decisions (with rationale)
- **JWT-driven tenancy, header `x-auth-token` (NOT Bearer).** The interceptor sends `x-auth-token` from localStorage and never sends `x-organization-id`; org identity is entirely server-side. FE services drop `orgId` from signatures. — *matches BE JWT-single-source model.*
- **Token storage = localStorage via `StorageService`** (`access-token`, `refresh-token`, `permission-tree`, `organisation`, `locale`, `AI_CONFIGURED`, relay-* fields). `http-request.interceptor` attaches the header + does proactive/reactive refresh (440 → refresh → retry). — *header transport works even inside a cross-site iframe partition (relevant to the planned OEM embed).*
- **Two-phase login.** Phase 1 mints/stashes tokens (password / SAML `sso-relay` / future embed-relay all converge here); the `/relay` component then boots phase 2 via `GET /auth/session` (permissions, theme, branding, announcements). — *one bootstrap path for every login type.*
- **Permission-tree-driven UI.** `role.guard` checks a route's `data.permission` against the JWT permission tree (held in `permission.service`); the sidebar (`SIDEBAR_ITEMS_ROUTES`) renders only permitted entries. No role-name bypass. — *mirrors BE `VerifyPermissionMiddleware`.*
- **Shared `app-custom-*` UI kit is the single source of styled controls** (`custom-table`, `custom-input`, `custom-dropdown`, `button`, `chip`, `email-chips-input`, `echart-visual`, …). `app-custom-table` (+ `UsServerListAdapter`, 50 rows, `createdOn DESC`) is THE list table; AG Grid retired for lists.
- **Design tokens only** — CSS custom properties in `assets/sass/variables/_theme-variables.scss` (+ `_theme_dark.scss`). Never hard-code color/spacing/font-size. `--fs-*`, `--space-*`, `--primary-color`, weights `--fw-*`; fonts Inter (`--font-ui`) + JetBrains Mono. `theme.service` injects at runtime.
- **HTTP only through `HttpClientService`** (never inject `HttpClient`); endpoints from `core/constants/api.constant.ts`; routes from `routes.constant.ts`. Interceptor DI cycle broken via deferred `Injector.get()` (NG0200 fix).
- **Dex AI = bubble only.** The shared `ai-launcher` (+ `ai-tool-step`, `ai-subagents`) is the entry — no sidebar item, no full page. `ai-chat.service` reduces a WebSocket step-stream into a nested step tree; `confirm()` posts to `POST /ai/confirm` (never the target endpoint directly). `screen-context.service` was removed (backend is not screen-aware).
- **Query Executor is a standalone lazy module OUTSIDE the `/app` shell** at `/query-runner/exec` — isolates the heavy CodeMirror + AG Grid bundle. `/app/query-runner` is the saved-queries home.
- **`embed` module renders a public, chrome-less, token-gated dashboard OUTSIDE the shell** (no auth guard, no sidebar/header) — the precedent for a future host-controlled embedded mode.

## Conventions
- Screen quartet: `list-` (table + New) → `add-`/`edit-` (vertical form, one control per row, ~50% width) → `view-` (read-only + Edit/Open). OnPush + signals for new components.
- Delete via shared `.confirmation-popup` overlay (NOT `p-dialog`). Add/edit forms implement `HasUnsavedChanges` + `unsaved-changes.guard`.
- Validators mirror the BE file byte-for-byte; Zod messages are i18n keys. i18n: all 10 locales, no raw strings in templates.
- Loading state: `loading` (reads) / `saving` (writes) / per-id record maps (row spinners); signal calls pass `{ skipLoader: true }`.
- Never commit `environment*.ts` / `.env`.
- Dates `YYYY-MM-DD` · Progress logs append-only, newest first · every change updates the module file + INDEX + SESSION_LOG.
- **Code is truth.** If these docs disagree with the code, fix the docs and log the correction.
