# SQL Workspace — Open Executor in New or Same Tab (with app shell)

Date: 2026-08-21
Repo: dbexec-ui (frontend only — no backend change)
Status: approved (design)

## Problem

In the SQL Workspace, the "New Query" popup (datasource → connection picker)
always opens the query editor in a **new browser tab** on the **standalone**
executor route (`/sql/exec`), which lives *outside* the `/app` shell — so it has
no sidebar and no theme picker.

Two asks:

1. Give the user a choice when opening the editor from the New Query popup:
   **new tab** or **same tab** (in-place, like the listing view).
2. When opening in a **new tab**, open the **full application shell (with
   sidebar)** so the user can reach the theme picker (and the rest of the app)
   from there — not the bare standalone editor.

## Current state (as-found)

- Executor component: `modules/query-runner/executor/query-executor.component.ts`
  — a **standalone** Angular component that reads `?conn=` and `?query=` from
  `ActivatedRoute.snapshot.queryParamMap`. It has no hard dependency on being
  full-screen; it renders fine inside a shell child outlet.
- Routing:
  - `/app` → `HomeComponent` shell (sidebar + topbar + theme picker), with all
    feature modules as children. The `sql` module is a child (`/app/sql`).
  - `sql/exec` → standalone executor, mounted at the **top level** of
    `app-routing.module.ts`, **outside** `/app` (comment says this is deliberate
    for a "focused, full-screen workspace").
- Five places open the executor, all via `window.open(url, '_blank')` on
  `/sql/exec`:
  1. `saved-queries/new-query-dialog/new-query-dialog.component.ts` (the popup)
  2. `launcher/launcher.component.ts`
  3. `saved-queries/view-saved-query/view-saved-query.component.ts`
  4. `saved-queries/list-saved-queries/list-saved-queries.component.ts`
  5. `connections/list-connections/list-connections.component.ts`
- Route constants: `QUERY_RUNNER.EXEC = '/sql/exec'`,
  `QUERY_RUNNER.EXEC_SAVED(connId, queryId)`.
- The New Query popup is a hand-styled `.confirmation-popup` overlay with plain
  `<button>` elements (not PrimeNG / app-button).

## Design

### 1. In-shell executor route (the enabling change)

Add a **second mount** of the same `QueryExecutorComponent` **inside** the `/app`
shell so it renders with the sidebar/topbar (and thus the theme picker).

- New child route under `/app`: `path: 'sql/exec'` → lazy-loads the same
  `QueryExecutorModule` (`query-executor.module.ts`). Guards mirror the standalone
  route: `authGuard, roleGuard`, `data.permission = PERMISSIONS.QUERY_RUNNER`,
  `data.title = 'PAGE_TITLES.QUERY_RUNNER'`.
- The standalone top-level `sql/exec` route is **kept** (old bookmarks / existing
  open tabs keep working).
- No change to `QueryExecutorComponent` — it reads the same query params
  regardless of which outlet it renders in.

New route constants in `core/constants/routes.constant.ts`:

- `EXEC_SHELL = '/app/sql/exec'`
- `EXEC_SHELL_SAVED(connId, queryId)` → `/app/sql/exec?conn=…&query=…`
  (percent-encoded, mirroring `EXEC_SAVED`).

### 2. New Query popup — split button

Replace the single "Open Executor" button with a **split button** styled to match
the popup's existing plain-button look (NOT `p-splitButton`, which would look
foreign in the hand-styled overlay):

- Primary action **"Open in New Tab"**: verify the connection, then
  `window.open(EXEC_SHELL + '?conn=' + encodeURIComponent(connId), '_blank')`
  → full app shell + sidebar.
- Caret toggles a small 2-item menu; second item **"Open Here"**: verify the
  connection, then
  `router.navigate([EXEC_SHELL], { queryParams: { conn: connId } })`
  → replaces the current listing view in the same tab; closes the popup.

Both paths:

- Reuse the existing `testConnection(connId)` verification. Only on
  `res.status && res.data.isConnected` do they open/navigate; otherwise surface
  the error via `globalService.handleSuccessService(res)` and open nothing (same
  as today).
- Share the `verifying` flag; the spinner shows on the primary button and the
  caret is disabled while verifying. The tiny menu closes on outside-click /
  action / Escape.

Component method changes in `new-query-dialog.component.ts`:

- `open()` → split into `openNewTab()` and `openHere()`, both calling a shared
  private `verifyThen(cb: (connId) => void)` that holds the current verify logic.
- Add `menuOpen = false` + `toggleMenu()` for the caret menu.

### 3. Consistency — repoint the other 4 open-sites

All other "open in new tab" entry points open the **in-shell** route too, so the
"new tab = full app with sidebar" behavior is uniform:

- `launcher.component.ts`, `list-connections.component.ts`:
  `window.open(EXEC_SHELL + '?conn=…', '_blank')`.
- `view-saved-query.component.ts`, `list-saved-queries.component.ts`:
  `window.open(EXEC_SHELL_SAVED(connId, queryId), '_blank')`.

These four keep their single-button "open in new tab" behavior — the same-tab
split UI is only added to the New Query popup (the specific ask). Their target
URL is the only thing that changes.

### 4. i18n

Two new keys in all 10 locale files
(`en, de, es, fr, it, ja, ko, nl, pt-BR, zh-CN`):

- `QUERY_RUNNER.OPEN_IN_NEW_TAB`
- `QUERY_RUNNER.OPEN_HERE`

`QUERY_RUNNER.OPEN_EXECUTOR` and `QUERY_RUNNER.VERIFYING` are retained
(`VERIFYING` still used for the spinner label).

## Files touched (FE only)

- `core/constants/routes.constant.ts` — add `EXEC_SHELL`, `EXEC_SHELL_SAVED`.
- `app-routing.module.ts` — add `sql/exec` child route under the `/app` shell.
- `saved-queries/new-query-dialog/new-query-dialog.component.{ts,html,scss}` —
  split button + `openNewTab()` / `openHere()` + caret menu.
- `launcher/launcher.component.ts` — repoint new-tab URL.
- `saved-queries/view-saved-query/view-saved-query.component.ts` — repoint.
- `saved-queries/list-saved-queries/list-saved-queries.component.ts` — repoint.
- `connections/list-connections/list-connections.component.ts` — repoint.
- `assets/i18n/{10 locales}.json` — 2 keys each.

## Out of scope

- No backend change.
- No removal of the standalone `/sql/exec` route.
- No same-tab option on the 4 non-popup open-sites.
- No change to `QueryExecutorComponent` internals.

## Verification

- Gate: `tsc --noEmit` → `ngc -p tsconfig.app.json --noEmit` →
  `ng build --configuration production`.
- Live (browser):
  - New Query popup → "Open in New Tab": new tab shows the executor **with the
    sidebar**, and the theme picker is reachable.
  - New Query popup → caret → "Open Here": executor replaces the listing in the
    **same** tab, sidebar present, `?conn=` correct.
  - One saved-query "open" (list or view): new tab now shows the sidebar.
  - A bad/unverifiable connection: neither path opens a tab; the error toast
    shows (unchanged behavior).
