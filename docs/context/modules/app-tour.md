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
### 2026-08-12 — Live-QA round 2: dark theme, parent-only steps, load gating
- **Dark-theme popover (white card on a dark app):** root cause — driver.js 1.8's `driver.css` HARDCODES `.driver-popover{background-color:#fff;color:#2d2d2d}` and reads only `--driver-popover-font-family` (its `--driver-popover-bg/-color` vars are NOT consumed). Fix: set `background-color`/`color` DIRECTLY on `.driver-popover.dbexec-tour` from `--card-background`/`--text-color`, and recolour the arrow (also hardcoded white) per side to `--card-background`. Removed the dead `--driver-popover-bg/-color/...` root vars.
- **Too many steps (24) → parent-only:** the tour now targets TOP-LEVEL sidebar rows only (groups + top leaves: Home, User Management, Data Management, DBExec Studio, Visualizations, Audit & Activity, App Settings, System Settings) — not the nested submenu items. `buildSteps()` reads `sidebar.getTourModuleTargets()` (the rendered, already-permission-filtered top-level items) instead of the static 27-key `TOUR_MODULE_STEPS`. Titles come from `SIDEBAR.<value>`, descriptions from `TOUR.STEPS.<value>.DESC` when curated else the new `TOUR.MODULE_GENERIC_DESC` (interpolates the row name; added to 10 locales). `forceExpandForTour()` no longer expands groups (parents are always visible); the submenu `data-tour` anchors added in round 1 remain but are unused/harmless.
- **Start only when loaded:** `maybeAutoStart()` replaced the blind 300ms with `whenReady()` — polls (80ms, 4s cap) until the sidebar has registered AND a `[data-tour]` anchor is painted, then one rAF so the org theme's injected `<style>` (committed in applyBootstrap before the shell mounts) has painted before driver.js reads computed colours. Note: do NOT gate on `ThemeService.theme() !== null` — it's null for default-theme/System-Admin orgs (applyFromLogin(null)), which would stall 4s.
- Verified: FE tsc 0 → ngc 0 → prod build 0; dark-theme bg/color + arrow overrides confirmed in the bundle; MODULE_GENERIC_DESC parity 10/10 with `{{name}}` intact.
### 2026-08-12 — Live-QA bug fixes (6)
- **Module steps were missing:** the sidebar is a GROUPED tree — modules live inside collapsed group headers (userAndAccess, databaseManagement, …). `data-tour` was only on top-level rows, and collapsed submenu items are `max-height:0;overflow:hidden` (in the DOM but 0×0). Fix: added `data-tour="nav-<value>"` to submenu + nested rows, and `forceExpandForTour()` now expands ALL groups (snapshotting prior state) so anchors have real dimensions; build delay bumped 60→150ms for the extra CD/paint.
- **Reload during an active tour restarted it from step 1:** now `start()` sets the `tour.completedThisSession` sessionStorage guard immediately (not only at the done card), so a mid-tour reload doesn't auto-restart — re-launch via the profile toggle.
- **Buttons/checkbox weren't the shared look:** driver.js owns the popover DOM, so achieved parity via CSS — footer buttons now match app-button exactly (`padding:8px 16px`, `--fs-control`, `--fw-semibold`, primary/secondary), and the "Don't show again" checkbox is a custom-drawn box (border → `--primary-color` fill + white tick when checked) instead of the native `accent-color`. Target the `.driver-popover-footer-btn` class to beat driver.css's `all:unset`.
- **"No theme adoption":** confirmed via live probe that design tokens resolve at `:root` and a body-level popover inherits them — org theming DOES reach the tour; the perceived issue was the button/checkbox look (above). Nothing token-related to fix.
- **Highlighted icon looked blurry:** `animate:false` (the fade re-rasterised the overlay and captured a blurry mid-frame over small icons) + `stagePadding` 6→10 (pulls the anti-aliased cutout edge clear of the icon).
- **Language card overlapped the language flyout:** the flyout opens to the right of the profile menu where the `right`-side popover landed. Language + logout steps now use `side:'top'`. Also lifted the tour-opened overlays above driver's backdrop (`html.driver-active` → `.profile-menu.show`, `.language-flyout.show`, `.cmd-backdrop` at z-index 999999998; popover stays at 1e9) so search/notification/flyout aren't dimmed behind the scrim.
- Verified: FE tsc 0 → ngc 0 → prod build 0; fixes confirmed in the compiled bundle. version_261 (local; not yet re-verified live by the user).
### 2026-08-12 — Built end-to-end
- Done: driver.js engine + `TourService` + step catalog + sidebar anchors/imperative API + home-shell auto-start + profile re-enable toggle + token-driven theme SCSS + `TOUR.*` i18n in 10 locales. BE `showTour` column (master+shared) + `PUT /profile/tour` (mirrors updateLocale, Joi) + surfaced in getProfile & session. Gates green: BE tsc, FE tsc/ngc/prod build, i18n parity 10/10.
- In progress / Known issues: not yet live-verified in a running browser; not pushed (user pushes).
- Next: live QA of the flow + edge cases.
- Files touched: tour.service.ts, tour.constant.ts, sidebar.component.*, home.component.ts, view-profile.component.*, profile.service.ts, login.service.ts, storage-type.constant.ts, api.constant.ts, global-search.service.ts + component, notification-modal.service.ts + component, _driver-tour.scss, styles.scss, i18n/*.json (10), + BE user entities/profile controller/route/messages/locales.
