# app-tour
> Update the Progress log on every change.
> Code path: `src/app/core/services/tour.service.ts` (+ constants, sidebar/home wiring) · Status: 🟢 · Last updated: 2026-08-12

## 1. Context
- **Responsibility:** The guided, permission-aware application tour shown on login. Walks a user through the sidebar chrome (search, notifications, language, logout) and **only the modules they can actually see**, then lets them opt out. Not an NgModule — it's a core singleton service + a step catalog + small wiring in the sidebar/home shell and profile page.
- **Key files:**
  - `core/services/tour.service.ts` — the engine. Builds steps from the permission tree (`PermissionService.canRead`), owns the **driver.js** instance, choreographs the live overlays per step, injects the "Don't show again" checkbox, and persists the `showTour` flag via `PUT /profile/tour`.
  - `core/constants/tour.constant.ts` — the step catalog: welcome/done bookends, leading chrome (search/notifications), 27 module steps (each gated by its permission `value`, anchored `[data-tour="nav-<value>"]`), trailing chrome (language/logout). Order mirrors the sidebar.
  - `core/layout/sidebar/sidebar.component.ts/.html` — `data-tour` anchors + the `TourSidebarApi` (forceExpandForTour / restoreAfterTour / openAccountMenuForTour / openLanguageFlyoutForTour / closeTourPopovers); registers itself with `TourService` on init. `handleClickOutside` is suppressed while the tour runs.
  - `core/layout/home/home.component.ts` — calls `tourService.maybeAutoStart()` on shell init, `tourService.stop()` on destroy.
  - `assets/sass/_driver-tour.scss` — driver.js theme override, **fully token-driven** so it picks up each org's theme (primary/card/text/border tokens). Imported in `styles.scss` after `driver.js/dist/driver.css`.
  - i18n: `TOUR.*` namespace in all 10 locales; `PROFILE.PREFERENCES` + `PROFILE.SHOW_TOUR_TOGGLE`.
- **Depends on:** `PermissionService` (which modules to show), `GlobalSearchService` / `NotificationModalService` (open/close their overlays per step — both gained a `close()`/`closeSearch()` trigger channel), the sidebar (imperative API), `HttpClientService` (persist). **Depended on by:** `HomeComponent` (auto-start), `ViewProfileComponent` (re-enable toggle).
- **How it works:** Login phase-2 session carries the user's `showTour` flag → `LoginService.applyBootstrap` stashes it in `StorageType.SHOW_TOUR`. On shell mount, `maybeAutoStart()` starts the tour iff `showTour==='true'` and it wasn't already completed this tab session (`sessionStorage['tour.completedThisSession']`). The tour pins the sidebar open, builds steps against live DOM anchors (dropping any whose element is absent — e.g. System Admin has no search/bell), and drives driver.js. Per-step `onHighlightStarted`/`onDeselected` open/close the search modal, notification modal, or account-menu/language-flyout. A "Don't show again" checkbox is injected into **every** popover footer (`onPopoverRender`) and persists `showTour=false` immediately.
- **Decisions:**
  - **Engine = driver.js** (not hand-rolled, not shepherd/intro): tiny, MIT, zero-dep, rich lifecycle hooks for the overlay choreography, CSS-var themeable. See `docs/superpowers/specs/2026-08-12-application-tour-design.md`.
  - **Single flag `showTour`** (default true), not `isFirstLogin`. Auto-shows on **every** login until dismissed ("show until dismissed"). New users get true via the column default.
  - Steps derive from the user's OWN permission set — set membership, not ordering. User A (all perms) sees all module steps; User B (subset) sees only theirs.
  - "Don't show again" is on every step (a user may quit early). Re-enable via the profile-page toggle (the only manual re-trigger).
  - Logout step highlights but never logs out (`disableActiveInteraction: true`).
  - Backdrop clicks don't dismiss during overlay steps (`overlayClickBehavior` no-op); X/Esc = skip (no persistence).
- **Gotchas:**
  - `TOUR.PROGRESS` keeps driver.js's own `{{current}}`/`{{total}}` tokens — pass NO params to `translate.instant` for it (ngx-translate returns the string verbatim when params is falsy; verified in parser source).
  - `RELAY_IS_FIRST_LOGIN` is removed in `applyBootstrap`, so the tour must NOT read it — it reads the stashed `SHOW_TOUR` key instead.
  - The sidebar's `document:click` outside-close would slam the account menu shut during the language/logout steps; it's guarded by `tourService.running()`.
  - `_driver-tour.scss` uses real tokens only (earlier draft referenced 5 non-existent tokens — `--surface-card`, `--primary-color-dark`, etc.; corrected to `--card-background`, `--primary-hover`, `--text-muted`, `--hover-background`, `--border-strong`).

## 2. Goals
- **Objective:** Orient every new user to exactly the parts of DBExec they can use, on first login, with a clean opt-out.
- **Current focus:** — shipped; awaiting live QA (see Next).
- **Next up:** Live walkthrough on the running app (login → tour shows → permission subset yields subset → overlays open → dismiss + reload → no tour → profile toggle re-enables).
- **Out of scope:** Per-screen contextual tours (this is a one-time orientation), analytics on tour completion.

## 3. Progress (newest first)
### 2026-08-12 — Built end-to-end
- Done: driver.js engine + `TourService` + step catalog + sidebar anchors/imperative API + home-shell auto-start + profile re-enable toggle + token-driven theme SCSS + `TOUR.*` i18n in 10 locales. BE `showTour` column (master+shared) + `PUT /profile/tour` (mirrors updateLocale, Joi) + surfaced in getProfile & session. Gates green: BE tsc, FE tsc/ngc/prod build, i18n parity 10/10.
- In progress / Known issues: not yet live-verified in a running browser; not pushed (user pushes).
- Next: live QA of the flow + edge cases.
- Files touched: tour.service.ts, tour.constant.ts, sidebar.component.*, home.component.ts, view-profile.component.*, profile.service.ts, login.service.ts, storage-type.constant.ts, api.constant.ts, global-search.service.ts + component, notification-modal.service.ts + component, _driver-tour.scss, styles.scss, i18n/*.json (10), + BE user entities/profile controller/route/messages/locales.
