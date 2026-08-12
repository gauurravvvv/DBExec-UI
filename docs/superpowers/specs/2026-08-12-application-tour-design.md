# Application Tour (Guided Onboarding) — Design

> Date: 2026-08-12 · Repos: DBExec-UI (primary) + DBExec-API (flag + endpoint)
> Status: approved design, ready to implement

## Problem

New users land in DBExec with no orientation. We want a guided, permission-aware
product tour that:

- Auto-shows on login while the user's `showTour` flag is `true`.
- Walks the user through the sidebar chrome (search, notifications, language,
  logout) and every **module the user actually has permission to see**.
- Lets the user opt out ("Don't show again") from **any** step — not only the
  last — because a user may not reach the end.
- Persists the opt-out server-side so it follows the user across
  devices/browsers, and can be re-enabled from the profile page.
- Is fully localised (10 locales) and themed with the app's design tokens.

### Permission model (the "1–10 vs 3–6" requirement)

This is **set membership, not a numeric range or ordering**. One user may have
access to all modules; another to a subset. Each user's tour steps are derived
from **their own permission tree** (the same `PERMISSION_TREE` the sidebar
renders from). A user who can see modules {home, datasets, dashboards} gets a
tour over exactly those three module steps plus the always-on chrome steps.
Progress is shown relative to what *that* user sees ("Step 3 of N").

## Engine decision — driver.js

We use **[driver.js](https://driverjs.com)** (~5KB, MIT, zero deps) as the
spotlight/positioning/popover engine. Rationale:

- Tiny, actively maintained, framework-agnostic — no PrimeNG z-index fight in
  practice once themed, and it takes the spotlight + popover-positioning math
  off us.
- Rich lifecycle hooks (`onHighlightStarted`, `onDeselected`, `onNextClick`,
  `onPrevClick`, `onCloseClick`, `onDoneClick`, `onPopoverRender`) give us the
  per-step choreography we need to open/close the search, notification, and
  language overlays as their steps activate.
- CSS-variable theming (`--driver-popover-*`, `overlayColor`) maps cleanly onto
  the design tokens.

The one thing driver.js does not ship is a footer checkbox; we inject the
"Don't show again" control via `onPopoverRender`.

**Alternatives rejected:** `angular-shepherd` (heaviest, bundles Floating UI,
most styling to undo, own overlay stack most likely to collide with PrimeNG);
`intro.js` (commercial license required); hand-rolled (more code we own for no
benefit over driver.js here).

## Architecture

Three parts, all in DBExec-UI except the flag + endpoint:

### 1. `TourService` — `core/services/tour.service.ts`

`@Injectable({ providedIn: 'root' })`, signal-based. Responsibilities:

- **Build steps** from the permission tree via `PermissionService.canRead`.
- **Own the driver.js instance** — create on start, `destroy()` on end.
- **Choreograph chrome overlays** — per-step hooks open/close the search modal,
  notification modal, language flyout, and account menu.
- **Decide auto-start** — read `session.user.showTour` on login; start iff true.
- **Persist dismissal** — `PUT /profile/tour { showTour: false }` when the user
  ticks "Don't show again" (and `true` from the profile toggle).
- **Expose signals** — `running`, `currentIndex`, `dontShowAgain` — so the
  sidebar/profile can react if needed.

Public API:

```
start(opts?: { manual?: boolean }): void   // build steps + drive
stop(): void                                // destroy + restore sidebar
maybeAutoStart(): void                      // called post-login; gated on showTour
setShowTour(value: boolean): Promise<void>  // profile toggle + dismissal
```

### 2. Step catalog — `core/constants/tour.constant.ts`

A static array declaring every possible step:

```ts
interface TourStepDef {
  key: string;                 // stable id
  anchor: string;              // CSS selector, e.g. '[data-tour="search"]'
  titleKey: string;            // i18n key  → TOUR.STEPS.<key>.TITLE
  descKey: string;             // i18n key  → TOUR.STEPS.<key>.DESC
  permission?: string;         // module steps only; omitted = always shown
  chrome?: 'search' | 'notifications' | 'language' | 'logout';
  side?: 'top'|'right'|'bottom'|'left';
  align?: 'start'|'center'|'end';
}
```

- **Chrome steps** (no `permission`): `welcome`, `search`, `notifications`,
  `language`, `logout`.
- **Module steps** (one per sidebar module, each with its `permission` value):
  home, orgManagement, systemUser/Role/Group management, userManagement,
  roleManagement, groupManagement, setupDB, dbRoles, dbPrivileges,
  connectionManager, queryRunner, queryBuilder* , datasetManager, analyses,
  dashboard, rlsRules, alertManagement, auditLogs, loginActivity, appSettings,
  systemSettings. Titles reuse the existing `SIDEBAR.<value>` keys where a
  matching description isn't needed; descriptions are new `TOUR.STEPS.*` keys.

Catalog order mirrors sidebar `sequence`. Final assembled order:

```
welcome → search → notifications → [permitted module steps, sidebar order]
        → language → logout → done(welcome-out)
```

`welcome` and `done` are element-less popovers (centered, no anchor).

### 3. Anchors — `data-tour` attributes

Added to existing elements (no new DOM):

| `data-tour` value      | Element                                             |
|------------------------|-----------------------------------------------------|
| `search`               | sidebar search button                               |
| `notifications`        | sidebar bell button                                 |
| `account`              | sidebar `.user-profile` (avatar area)               |
| `language`             | the Language row in the profile menu                |
| `logout`               | the Sign-out row in the profile menu                |
| `nav-<permissionValue>`| each rendered sidebar nav link/`expandable`         |

Module-step anchors are `[data-tour="nav-<value>"]`, matching the `item.value`
already bound in the sidebar template.

## Choreography (the overlay-driving steps)

driver.js highlights an anchor and shows a popover. For the four "live overlay"
steps we open the real UI so the user sees it, using per-step hooks:

| Step          | `onHighlightStarted`                          | `onDeselected` (leaving)          |
|---------------|-----------------------------------------------|-----------------------------------|
| search        | `GlobalSearchService.openSearch()`            | close search modal                |
| notifications | `NotificationModalService.open()`             | close notification modal          |
| language      | sidebar `openAccountMenuForTour()` + flyout   | sidebar `closeTourPopovers()`     |
| logout        | sidebar `openAccountMenuForTour()`            | sidebar `closeTourPopovers()`     |

Notes:
- `language` and `logout` both need the **account menu open**; the language step
  additionally opens the **language flyout**. Because these two steps are
  adjacent, the account menu stays open across them and only closes after
  `logout` is deselected.
- The **logout highlight never logs the user out.** We set
  `disableActiveInteraction: true` on that step so the highlighted element is
  non-interactive; the tour only points at it.
- During overlay steps, backdrop clicks must not kill the tour. We keep
  `allowClose: true` globally (Esc/skip still work) but set
  `overlayClickBehavior` to a no-op function for the choreographed steps so a
  click on the opened panel doesn't destroy the tour.

### Sidebar imperative API (tour-only)

`SidebarComponent` gains a small public surface so the tour never mutates its
internals directly:

```
forceExpandForTour(): void       // pin sidebar open; remember prior state
restoreAfterTour(): void         // restore prior pinned/expanded state
openAccountMenuForTour(): void   // showProfileMenu = true
openLanguageFlyoutForTour(): void// showProfileMenu = true; showLanguageFlyout = true
closeTourPopovers(): void        // both false
```

On `start()` the tour calls `forceExpandForTour()` so every module row is
rendered and anchorable (collapsed sidebar hides labels/rows). On `stop()` it
calls `restoreAfterTour()`.

The sidebar exposes the service reference by injecting `TourService`, or — to
avoid a construction-order coupling — the tour resolves the sidebar via a
lightweight `TourAnchorService` the sidebar registers itself with on init.
**Chosen:** sidebar injects `TourService` and registers itself
(`tourService.registerSidebar(this)`), because there is exactly one sidebar and
its lifetime spans the shell. The service holds a `WeakRef`/nullable ref and
no-ops if absent.

## Persistence & show-logic

### Flag: `showTour` (single source of truth)

- **Entity:** `showTour: boolean` column, `default: true`, on **both**
  `shared_entity/user.entity.ts` and `master_entity/user.entity.ts` (System
  Admin lives in master DB).
- **Creation:** every user-creation path gets `true` for free via the column
  default — no per-controller change (org onboarding admin, invited org users,
  SSO JIT, super admin seed).
- **Surfaced to FE:** `buildSessionBootstrap.sanitiseUser` uses a denylist
  (spreads all non-sensitive fields), so `showTour` appears in `session.user`
  automatically — no change to the sanitiser.
- **Dismiss / re-enable:** `PUT /profile/tour { showTour: boolean }` →
  `updateShowTour` controller, mirroring `updateLocale` exactly (branch on
  `orgData.isDefault` for master-vs-shared user, set field, save).

### Show logic on login

`TourService.maybeAutoStart()` runs after the session bootstrap is applied
(from the relay component's success path and the refresh-on-reload path). It
starts the tour iff `session.user.showTour === true`.

Because the flag defaults true and only "Don't show again" flips it false, the
tour **auto-shows on every login until dismissed** — exactly the requested
"if dismissed don't show; else show again next login" behaviour. It does **not**
depend on `isFirstLogin`.

### "Don't show again" — on every step

Injected into the popover footer via `onPopoverRender`. Ticking it immediately
calls `setShowTour(false)` (fire-and-forget PUT) and updates a local session
cache so the current session won't re-trigger. Unticking (if re-ticked in the
same run) calls `setShowTour(true)`. The tour continues normally after ticking;
the user can still Finish/Skip.

### Profile toggle

`My Profile` screen gains a single toggle "Show product tour on login" bound to
`showTour`, using `app-custom-toggle`. Flipping it calls `setShowTour(value)`.
This is the re-enable path for a user who dismissed the tour.

## Edge cases (explicitly handled)

1. **Finish on last step + reload → tour must not reappear.**
   The session's `showTour` reflects the persisted flag. Finishing the tour
   does **not** by itself set `showTour=false` (only the checkbox does). So if
   the user finishes WITHOUT ticking, it *would* show again next login — which
   is the intended "show until dismissed" behaviour. To avoid an annoying loop
   for users who clearly completed it, we treat **reaching `done`** as an
   implicit local "seen this session" guard: a `sessionStorage` key
   (`tour.completedThisSession`) suppresses re-trigger within the same tab
   session even before a reload. On reload, the server flag governs.
   → **Net:** finish + reload shows again only if the user never dismissed; if
   they ticked "Don't show again" (available on every step), finish + reload
   never shows. This matches the requirement.

2. **Dismiss mid-tour, then reload.** `showTour=false` persisted → no
   auto-start. Correct.

3. **User has zero visible modules** (edge permission set). Tour still runs the
   chrome steps (welcome/search/notifications/language/logout). If even those
   are hidden (e.g. System Admin has no search/bell), the step list may be
   short; if it would be empty, `start()` no-ops.

4. **System Admin (master DB user).** Has no notifications/search (`isSystemAdmin`
   hides bell + search in the sidebar). Chrome steps for search/notifications
   are **skipped** when their anchor is absent — `buildSteps()` drops any step
   whose anchor selector resolves to nothing at build time, and driver.js
   `hasNextStep` logic stays consistent.

5. **Anchor missing at runtime** (route/module not rendered yet). Steps are
   built against the sidebar which is always mounted in the shell, and the tour
   force-expands it first, so nav anchors exist. Chrome anchors live in the
   sidebar too. `welcome`/`done` are element-less. A defensive filter drops any
   step whose `document.querySelector(anchor)` is null at build time.

6. **Locale change.** Titles/descriptions are i18n keys resolved at
   `buildSteps()` time. If the user changes locale mid-session the next tour run
   re-resolves. (We don't hot-swap copy mid-run.)

7. **Rapid re-login / logout during tour.** `logout()` in the sidebar calls
   `StorageService.clear()` + navigates to `/login`; `TourService.stop()` is
   invoked from the shell's `ngOnDestroy` / route change so the driver instance
   is destroyed and never leaks an overlay onto the login page.

8. **Reduced motion / accessibility.** driver.js popover is keyboard-navigable
   (Esc to close, arrows via buttons). We keep `allowKeyboardControl: true`.
   Respect `prefers-reduced-motion` by disabling the smooth animation
   (`animate: false`) when the media query matches.

## Theming

`src/assets/sass/_driver-tour.scss` (imported once in `styles.scss`) maps:

```
--driver-popover-bg              → var(--surface-card)
--driver-popover-color           → var(--text-color)
--driver-popover-title-*         → --fs-h2 / --fw-semibold / --text-color
--driver-popover-description-*   → --fs-body / --text-color-secondary
--driver-popover-font-family     → var(--font-ui)
overlayColor (JS option)         → rgba token for backdrop
```

Next/Prev/Done buttons: restyle `.driver-popover-*-btn` to match `app-button`
primary/secondary variants (border-radius, padding, color tokens). The injected
checkbox row uses `--fs-label` + `--text-color-secondary`.

## i18n

New namespace `TOUR` in all 10 locale files (`en, de, es, fr, it, ja, ko, nl,
pt-BR, zh-CN`):

```
TOUR.WELCOME.TITLE / .DESC
TOUR.DONE.TITLE / .DESC
TOUR.STEPS.<key>.TITLE / .DESC     // per chrome + module step
TOUR.NEXT / TOUR.BACK / TOUR.FINISH / TOUR.SKIP / TOUR.DONT_SHOW_AGAIN
TOUR.PROGRESS                       // "Step {{current}} of {{total}}"
PROFILE.SHOW_TOUR_TOGGLE            // profile page toggle label
```

Module step titles reuse `SIDEBAR.<value>` for the title where practical;
descriptions are always new `TOUR.STEPS.<value>.DESC` keys (one short sentence
each describing the module).

## Backend (DBExec-API)

- `shared_entity/user.entity.ts` + `master_entity/user.entity.ts`: add
  `showTour` column (`boolean`, `default: true`, not null).
- `modules/profile/controllers/updateShowTour.ts`: mirror `updateLocale.ts`.
- `modules/profile/middleware/updateShowTour.validation.ts`: Joi
  `{ showTour: boolean().required() }`.
- `modules/profile/profile.routes.ts`: `PUT /tour` with the same middleware
  chain as `/locale`.
- `constants/response.messages.ts`: `PROFILE.TOUR_UPDATED`.
- No sanitiser change (denylist auto-surfaces `showTour`).
- Additive nullable-with-default column → no migration needed on dev schema
  sync; registered entity already in `all_entities.constant.ts`.

## Files touched (summary)

**DBExec-UI**
- `package.json` — add `driver.js`.
- `core/services/tour.service.ts` — new.
- `core/constants/tour.constant.ts` — new.
- `core/constants/api.constant.ts` — `PROFILE.UPDATE_TOUR`.
- `core/constants/storage-type.constant.ts` — (none; sessionStorage key inline).
- `core/layout/sidebar/sidebar.component.ts` + `.html` — `data-tour` anchors +
  imperative tour API + `registerSidebar`.
- `core/layout/home/home.component.*` — call `maybeAutoStart()` on shell init;
  `stop()` on destroy.
- `modules/auth/components/relay/relay.component.ts` — trigger
  `maybeAutoStart()` after bootstrap applied.
- `modules/profile/components/view-profile/*` — show-tour toggle.
- `modules/profile/services/profile.service.ts` — `updateShowTour`.
- `assets/sass/_driver-tour.scss` + `styles.scss` import.
- `assets/i18n/*.json` (10) — `TOUR.*` + `PROFILE.SHOW_TOUR_TOGGLE`.

**DBExec-API**
- `shared/db/shared_entity/user.entity.ts` + `master_entity/user.entity.ts`.
- `modules/profile/controllers/updateShowTour.ts` + validation + route.
- `shared/constants/response.messages.ts`.

## Verification gate

- BE: `npx tsc --noEmit`.
- FE: `npx tsc --noEmit` → `npx ngc -p tsconfig.app.json --noEmit` →
  `npx ng build --configuration production`.
- i18n parity sweep: every `TOUR.*` key present in all 10 locales.
- Manual: fresh login shows tour; permission subset yields subset of module
  steps; search/notification/language/logout overlays open on their steps;
  "Don't show again" on a mid step + reload → no tour; finish without dismiss +
  reload → tour shows; profile toggle re-enables.
