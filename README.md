<div align="center">

<img src="src/assets/icons/dbexec_icon.svg" alt="DBExec logo" width="72" />

# DBExec UI

**Angular 18 frontend for DBExec — a multi-tenant database management, query execution, and visualisation platform.**

[![Angular](https://img.shields.io/badge/Angular-18.2-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PrimeNG](https://img.shields.io/badge/PrimeNG-17-007AD9)](https://primeng.org/)
[![Monaco](https://img.shields.io/badge/Monaco%20Editor-0.52-1F1F1F?logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![NgRx](https://img.shields.io/badge/NgRx-18.1-BA2BD2)](https://ngrx.io/)

</div>

---

## What you get

A complete SQL workspace in the browser. Connect any of your databases (Postgres, MySQL, MariaDB, MSSQL, Oracle, Snowflake), write SQL with full editor assistance, save results as **Datasets**, layer **Analyses** with charts and filters, publish **Dashboards**, and share — with per-organisation isolation, row-level security, and a full audit trail.

The UI talks to **[DBExec-API](https://github.com/gauurravvvv/DbExec-API)** over a JWT-authenticated REST API.

## The Organisation model — the lens for everything below

Every screen in the app is scoped to an **Organisation**. An organisation isn't a tag — it's a fully isolated container. Each organisation has its own database on the backend, with its own users, groups, roles, datasources, datasets, analyses, dashboards, and audit log. Two organisations can't see each other's anything.

```
   ╔════════════════════════════╗      ╔════════════════════════════╗
   ║   Organisation A           ║      ║   Organisation B           ║
   ║   ─────────────────        ║      ║   ─────────────────        ║
   ║   • Users (A only)         ║      ║   • Users (B only)         ║
   ║   • Groups, Roles, RLS     ║      ║   • Groups, Roles, RLS     ║
   ║   • Datasources            ║      ║   • Datasources            ║
   ║   • Datasets               ║      ║   • Datasets               ║
   ║   • Analyses, Dashboards   ║      ║   • Analyses, Dashboards   ║
   ║   • Audit log              ║      ║   • Audit log              ║
   ╚════════════════════════════╝      ╚════════════════════════════╝
```

Concretely, in the UI:

- **The JWT in `localStorage` pins you to one organisation.** Every API call carries it; the backend opens that organisation's database and serves you data from there. There's no `?orgId=` query param to remember — it's already baked in.
- **Three roles:**
  - **SYSTEM-ADMIN** — operates above organisations. Sees the org list, creates new orgs, manages super admins. Most product screens (datasets, analyses) are still org-scoped for them; they enter an org's context to use them.
  - **ORG-ADMIN** — manages everything inside one organisation: users, groups, roles, RLS, datasources, etc.
  - **ORG-USER** — uses datasets, runs analyses, views dashboards within their org. Bounded by RLS rules and access grants.
- **Route guards enforce this.** `authGuard` checks the JWT; `roleGuard` gates routes like `/app/organisations` to `SYSTEM-ADMIN` only.
- **No cross-org primitives.** Two organisations can have a user with the same email, a dataset with the same name, even a datasource pointing at the same external host — they never see or collide with each other.

Keep this in mind when you read the module list below: when you see "Users", "Datasets", "Audit log", they all mean *the current organisation's* users, datasets, audit log — not a shared global pool.

### Core surfaces

| Area | What lives here |
| --- | --- |
| **Datasource Explorer** | Register external databases, browse their schema tree (schemas → tables → columns), test connections |
| **Dataset Editor** | Monaco-based SQL editor with dialect-aware autocomplete, dataset definition, live result preview (docked bottom-sheet à la DataGrip / Hex), CSV export |
| **Analyses** | Versioned analyses on top of datasets — filters, prompts, charts (ECharts + Chart.js) |
| **Dashboards** | Multi-visual dashboards with publish + share flows; soft-references survive source deletion |
| **Query Builder** | Visual builder with tabs, sections, and prompt-driven parameters for non-SQL users |
| **Connections** | Per-datasource credential overrides (engine-aware forms; dbType badge surfaces dialect) |
| **Users, Groups, Roles, RLS** | Identity + per-row access control |
| **Audit + Login Activity** | Full history of who did what, when |

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Angular 18.2 (LTS)** with standalone-friendly module setup |
| Component library | **PrimeNG 17** + PrimeFlex + PrimeIcons (7000+) |
| Code editor | **Monaco Editor 0.52** (SQL syntax, IntelliSense, dialect-aware completion) |
| SQL parsing | `pgsql-ast-parser`, `sql-formatter`, CodeMirror SQL lang |
| Charts | **Apache ECharts 5** (via `ngx-echarts`) + Chart.js for simple cases |
| State | **NgRx 18** (store + effects + devtools) |
| i18n | **`@ngx-translate`** — 10 locales bundled |
| HTTP | Angular `HttpClient` with JWT interceptors |
| Theming | Built-in **light + dark** themes via CSS variables |
| Tests | **Jest 29** (`jest-preset-angular`) |

## Quick start

### 1. Prerequisites

- **Node.js 20+**, **npm 10+**
- A running **[DBExec-API](https://github.com/gauurravvvv/DbExec-API)** instance (default: `http://localhost:3000`)

### 2. Clone + install

```bash
git clone https://github.com/gauurravvvv/DBExec-UI.git
cd DBExec-UI
npm install
```

### 3. Run

```bash
# Dev server with development environment (defaults to localhost:3000 API)
npm run dev

# Or start with the default environment
npm start
```

The app starts on **`http://localhost:4200`**. Log in with the super admin credentials seeded by the API on first boot.

## Available scripts

| Command | What it does |
| --- | --- |
| `npm start` | `ng serve` — dev server on `:4200` |
| `npm run dev` | Dev server with `environment.dev.ts` (API at `localhost:3000`) |
| `npm run local` | Dev server with `environment.local.ts` |
| `npm run build` | Default Angular build |
| `npm run build-prod` | Production build with 8 GB Node heap (bundle is large with Monaco + ECharts + PrimeNG) — output to `dist/DBExec/` |
| `npm test` | Jest test runner |
| `npm run test:coverage` | Jest with coverage report |
| `npm run test:watch` | Jest in watch mode |
| `npm run lint` | ESLint via `ng lint` |

## Environments

`src/environments/` holds three configs:

| File | API server | Used by |
| --- | --- | --- |
| `environment.ts` | local fallback | `npm start` |
| `environment.dev.ts` | `http://localhost:3000/api/v1` | `npm run dev` |
| `environment.prod.ts` | `__API_SERVER__` (replaced at deploy) | `npm run build-prod` |

For production deployments, replace the `__API_SERVER__` / `__APP_URL__` placeholders in `environment.prod.ts` (or in the built bundle) with your real URLs.

## Internationalization

10 locales ship out of the box, under `src/assets/i18n/`:

`en`, `de`, `es`, `fr`, `it`, `ja`, `ko`, `nl`, `pt-BR`, `zh-CN`

Strings are loaded over HTTP by `@ngx-translate`. To add a new language: drop a `<locale>.json` next to the others and add the locale to the language picker in `src/app/core/services/global.service.ts`.

## Theming

Light and dark themes are switchable from the user preferences menu. The choice is persisted to `localStorage`. Component styles use CSS custom properties (`--primary-color`, `--card-background`, `--text-color`, etc.) which the theme switch flips at the `<body>` level.

See `src/styles.scss` and `src/variables.scss` for the token system.

## Feature modules

All feature areas are lazy-loaded. Routing lives in `src/app/app-routing.module.ts`; the modules themselves under `src/app/modules/<name>/`.

| Module | Route | Notes |
| --- | --- | --- |
| `auth` | `/login`, `/register`, password setup | Unauthenticated routes |
| `home` | `/app/home` | Landing dashboard |
| `datasource` | `/app/datasources` | List, add, edit, test external DB connections |
| `connections` | `/app/connections` | Per-datasource credentials, with engine badge + dialect-aware copy |
| `dataset` | `/app/datasets` | SQL editor, dataset save, query preview, CSV export |
| `analyses` | `/app/analyses` | Versioned analyses, filters, charts |
| `dashboard` | `/app/dashboards` | Multi-visual dashboards, publish, share |
| `query-builder` | `/app/query-builders` | Visual query builder (no-SQL flow) |
| `prompt` | `/app/prompts` | Reusable parameter templates |
| `tab`, `section` | `/app/tabs`, `/app/sections` | Query-builder layout primitives |
| `organisation` | `/app/organisations` | SYSTEM-ADMIN only — manage tenants |
| `users` | `/app/users` | Per-org user CRUD |
| `groups` | `/app/groups` | User groups + group permissions |
| `role` | `/app/roles` | Role definitions |
| `access` | `/app/access` | Resource-level access grants |
| `rls-rules` | `/app/rls-rules` | Row-level security |
| `system-admin` | `/app/admins` | Cross-org admins |
| `app-settings` | `/app/settings` | App-wide configuration |
| `audit-logs` | `/app/audit` | Audit trail |
| `login-activity` | `/app/audit/logins` | Session history |
| `profile` | `/app/profile` | Personal account settings |

## Notable UX choices

- **Docked result panel** in the SQL editor — bottom-sheet pattern matching DataGrip / Hex / Snowsight. Drag the top edge to resize, click the chevron to collapse to a 40 px strip, dismiss with × to reclaim the whole pane. Sheet height + collapsed state persist across sessions.
- **Auto-fit columns** in the result grid with last-column flex (Excel-style), drag handles to manually resize. Recomputes live on sidebar toggle / window resize.
- **Per-type cell rendering** — BIGINT/NUMBER preserved as strings (no precision loss), MySQL BIT as boolean, dates as ISO, JSONB collapsed to a one-line summary with click-to-expand.
- **Right-click on any cell** → copy cell / copy column to clipboard.
- **Dialect-aware autocomplete** — Monaco's IntelliSense scopes itself to the active datasource's engine (Postgres functions vs. Snowflake VARIANT operators vs. Oracle PL/SQL).
- **Lazy schema tree** with bulk pre-warm — large databases auto-degrade to schema+table only, columns fetched on first reference.

## Project structure

```
src/
├── app/
│   ├── core/                # Services, guards, models, interceptors
│   ├── shared/              # Reusable components, pipes, dialogs
│   ├── modules/             # Feature areas (see table above)
│   │   ├── dataset/         #   ↳ SQL editor + dataset save
│   │   ├── analyses/        #   ↳ Versioned analyses
│   │   ├── dashboard/       #   ↳ Dashboard composer
│   │   └── …
│   ├── app-routing.module.ts
│   └── app.module.ts
├── assets/
│   ├── i18n/                # 10 locale JSONs
│   ├── icons/               # SVG icon set incl. dbexec_icon.svg
│   └── images/              # Brand + product imagery
├── environments/            # dev / local / prod configs
├── styles.scss              # Global styles + theme tokens
└── variables.scss           # SCSS variables
```

## Build for production

```bash
npm run build-prod
```

Output lands in `dist/DBExec/`. Serve with any static-file host — nginx, Cloudflare Pages, S3 + CloudFront, etc.

Replace `__API_SERVER__` and `__APP_URL__` in the built assets with your production URLs (sed / envsubst at deploy time, or pre-built into `environment.prod.ts`).

### Bundle size budgets

Defined in `angular.json`:

- Initial bundle: warn at 4 MB, error at 6 MB
- Per-component CSS: warn at 120 KB, error at 200 KB

Monaco + PrimeNG + ECharts dominate the bundle; lazy-loading per module keeps the initial download under budget.

## Repository status

- **Version:** see `package.json` (`26.x` series at the time of writing).
- **Tests:** 59 Jest spec files. Run with `npm test`.
- **License:** see `package.json`.

## Related

- [DBExec-API](https://github.com/gauurravvvv/DbExec-API) — Node + Express backend that this UI talks to.
