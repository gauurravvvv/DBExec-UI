# dbexec-ui — Context Index
> Master map of all frontend feature modules. Point any new session at this file first.
> Last updated: 2026-08-12

## Snapshot
- What: Angular web client for DBExec — multi-tenant DB management, query execution & BI. Talks to dbexec-api over REST + WebSocket.
- Stack: Angular 18.2 (NgModule lazy) · PrimeNG 17 · **Monaco 0.52 (the ONLY code editor — CodeMirror retired 2026-07-28)** · AG Grid 32 (executor grid only) · ECharts 5 + ngx-echarts · RxJS 7 + signals · NgRx (analyses) · Zod 4 (mirrored FE↔BE) · @ngx-translate
- **Start here:** [HANDOFF.md](./HANDOFF.md) — current state, verification gate, open items.
- Global docs: [Architecture](./ARCHITECTURE.md) · [Session Log](./SESSION_LOG.md)
- Repo reference: root `CLAUDE.md` + `ref/PRODUCT.md`, `ref/MODULE-MAP.md`

## Status: 🟢 stable · 🟡 in progress · 🔴 blocked · ⚪ planned

| Module | Code path | Context | Status | Last updated |
|---|---|---|---|---|
| ai-workspace | `src/app/modules/ai-workspace` | [ai-workspace](./modules/ai-workspace.md) | 🟡 | 2026-07-24 |
| app-tour | `src/app/core/services/tour.service.ts` | [app-tour](./modules/app-tour.md) | 🟢 | 2026-08-12 |
| alerts | `src/app/modules/alerts` | [alerts](./modules/alerts.md) | 🟢 | 2026-07-24 |
| analyses | `src/app/modules/analyses` | [analyses](./modules/analyses.md) | 🟢 | 2026-07-24 |
| app-settings | `src/app/modules/app-settings` | [app-settings](./modules/app-settings.md) | 🟢 | 2026-08-10 |
| audit-logs | `src/app/modules/audit-logs` | [audit-logs](./modules/audit-logs.md) | 🟢 | 2026-07-24 |
| auth | `src/app/modules/auth` | [auth](./modules/auth.md) | 🟢 | 2026-08-11 |
| dashboard | `src/app/modules/dashboard` | [dashboard](./modules/dashboard.md) | 🟢 | 2026-07-24 |
| data-transfer | `src/app/modules/data-transfer` | [data-transfer](./modules/data-transfer.md) | ⚪ | 2026-07-24 |
| dataset | `src/app/modules/dataset` | [dataset](./modules/dataset.md) | 🟢 | 2026-07-29 |
| datasource | `src/app/modules/datasource` | [datasource](./modules/datasource.md) | 🟢 | 2026-07-24 |
| db-access | `src/app/modules/db-access` | [db-access](./modules/db-access.md) | 🟢 | 2026-07-24 |
| embed | `src/app/modules/embed` | [embed](./modules/embed.md) | 🟢 | 2026-07-24 |
| groups | `src/app/modules/groups` | [groups](./modules/groups.md) | 🟢 | 2026-07-24 |
| home | `src/app/modules/home` | [home](./modules/home.md) | 🟢 | 2026-07-24 |
| login-activity | `src/app/modules/login-activity` | [login-activity](./modules/login-activity.md) | 🟢 | 2026-07-24 |
| migration | `src/app/modules/migration` | [migration](./modules/migration.md) | 🟢 | 2026-07-24 |
| notifications | `src/app/modules/notifications` | [notifications](./modules/notifications.md) | 🟢 | 2026-07-24 |
| organisation | `src/app/modules/organisation` | [organisation](./modules/organisation.md) | 🟢 | 2026-07-24 |
| profile | `src/app/modules/profile` | [profile](./modules/profile.md) | 🟢 | 2026-07-24 |
| prompt | `src/app/modules/prompt` | [prompt](./modules/prompt.md) | 🟢 | 2026-08-06 |
| query-builder | `src/app/modules/query-builder` | [query-builder](./modules/query-builder.md) | 🟢 | 2026-08-06 |
| query-runner | `src/app/modules/query-runner` | [query-runner](./modules/query-runner.md) | 🟢 | 2026-08-06 |
| rls-rules | `src/app/modules/rls-rules` | [rls-rules](./modules/rls-rules.md) | 🟡 | 2026-07-24 |
| role | `src/app/modules/role` | [role](./modules/role.md) | 🟢 | 2026-07-24 |
| system-roles | `src/app/modules/system-roles` | — | 🟢 | 2026-08-10 |
| system-groups | `src/app/modules/system-groups` | — | 🟢 | 2026-08-10 |
| system-users | `src/app/modules/system-users` | — | 🟢 | 2026-08-10 |
| ~~system-admin~~ | _removed 2026-08-10 — superseded by system-users_ | — | ⚫ | 2026-08-10 |
| users | `src/app/modules/users` | [users](./modules/users.md) | 🟢 | 2026-08-03 |
