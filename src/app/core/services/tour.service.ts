/**
 * TourService — the guided application tour.
 *
 * Builds a permission-aware step list from the logged-in user's own
 * permission tree (the same source the sidebar renders from), drives a
 * driver.js instance over the sidebar chrome + each visible module, and
 * persists the "show on login" preference server-side.
 *
 * Auto-start: after the phase-2 session is applied, the shell calls
 * `maybeAutoStart()`. It starts iff the stashed `showTour` flag is 'true'
 * and the tour hasn't already been completed in this tab session.
 *
 * Choreography: the search / notifications / language / logout steps open
 * the real overlays so the user sees them. Per-step driver.js hooks call
 * the existing trigger services (GlobalSearchService / NotificationModal
 * Service) and the sidebar's small imperative tour API.
 *
 * Dismissal: a "Don't show again" checkbox is injected into every popover
 * footer. Ticking it persists showTour=false (PUT /profile/tour) and stops
 * the tour from re-triggering; the profile-page toggle can turn it back on.
 *
 * Engine: driver.js (themed via assets/sass/_driver-tour.scss). We keep the
 * driver instance for the tour's lifetime and destroy it on stop.
 */
import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { type Config, type DriveStep, type Driver, driver } from 'driver.js';
import { lastValueFrom } from 'rxjs';
import { PROFILE } from 'src/app/core/constants/api.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import {
  TOUR_CHROME_LEADING,
  TOUR_CHROME_TRAILING,
  TOUR_DONE,
  TOUR_SESSION_SEEN_KEY,
  TOUR_WELCOME,
  type TourChrome,
  type TourStepDef,
} from 'src/app/core/constants/tour.constant';
import { GlobalSearchService } from 'src/app/shared/services/global-search.service';
import { NotificationModalService } from 'src/app/shared/services/notification-modal.service';
import { HttpClientService } from './http-client.service';
import { StorageService } from './storage.service';

/** One tourable top-level sidebar row. */
export interface TourModuleTarget {
  /** The item's permission `value` — also its anchor suffix (nav-<value>). */
  value: string;
}

/**
 * Minimal surface the sidebar registers so the tour can pin it open and
 * drive its account-menu / language-flyout without reaching into internals.
 */
export interface TourSidebarApi {
  forceExpandForTour(): void;
  restoreAfterTour(): void;
  openAccountMenuForTour(): void;
  openLanguageFlyoutForTour(): void;
  closeTourPopovers(): void;
  /** The top-level sidebar rows to tour (groups + top-level leaves), in
   *  display order. The tour targets these PARENTS only — not the nested
   *  submenu items — to keep the step count sane. */
  getTourModuleTargets(): TourModuleTarget[];
}

/** A resolved, driver.js-ready step plus the metadata we need for hooks. */
interface BuiltStep {
  def: TourStepDef;
}

@Injectable({ providedIn: 'root' })
export class TourService {
  /** True while a tour is running — components may react (e.g. suppress
   *  their own transient popovers). */
  readonly running = signal(false);

  private driverObj: Driver | null = null;
  private sidebar: TourSidebarApi | null = null;
  private steps: BuiltStep[] = [];
  /** Local mirror of the persisted flag; ticking the checkbox flips it so
   *  we don't fire a redundant PUT and so the current run won't re-trigger. */
  private dontShowAgain = false;

  constructor(
    private translate: TranslateService,
    private http: HttpClientService,
    private globalSearchService: GlobalSearchService,
    private notificationModalService: NotificationModalService,
  ) {}

  /** The sidebar calls this on init so the tour can drive it. */
  registerSidebar(api: TourSidebarApi): void {
    this.sidebar = api;
  }

  unregisterSidebar(api: TourSidebarApi): void {
    if (this.sidebar === api) this.sidebar = null;
  }

  /**
   * Called by the shell after the session is applied. Starts the tour when
   * the user hasn't opted out and hasn't already completed it this session.
   */
  maybeAutoStart(): void {
    if (this.running()) return;
    const flag = StorageService.get(StorageType.SHOW_TOUR);
    const seenThisSession =
      sessionStorage.getItem(TOUR_SESSION_SEEN_KEY) === 'true';
    if (flag === 'false' || seenThisSession) return;
    // Don't start on a fixed guess — wait until everything the tour needs is
    // actually in place. The org theme is already resolved by now (applyBoot-
    // strap commits it — custom OR default-reset — BEFORE the shell mounts and
    // calls this), so readiness is: the sidebar has registered its tour API AND
    // at least one nav anchor is painted in the DOM. Then one rAF so the
    // injected theme <style> has painted before driver.js reads its colours.
    // Polled with a hard cap so a missing signal can never leave the tour off.
    this.whenReady(() => this.start());
  }

  /**
   * Resolve `cb` once the shell is ready to host the tour (sidebar registered
   * + a nav anchor painted). Polls every 80ms up to ~4s; on the cap we start
   * anyway (better a slightly-early tour than none).
   */
  private whenReady(cb: () => void): void {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      // A frame of headroom so the org theme's <style> (applied pre-mount)
      // and the sidebar's latest render have painted before driver.js reads
      // computed colours / element rects.
      requestAnimationFrame(() => cb());
    };
    let waited = 0;
    const STEP = 80;
    const CAP = 4000;
    const tick = () => {
      if (fired) return;
      const ready = !!this.sidebar && !!document.querySelector('[data-tour]');
      if (ready || waited >= CAP) {
        fire();
        return;
      }
      waited += STEP;
      setTimeout(tick, STEP);
    };
    tick();
  }

  /** Build steps and drive. Manual restart passes through here too. */
  start(): void {
    if (this.running()) return;
    // Mark that the tour has started in this tab session. A page reload
    // mid-tour then won't auto-restart it from step 1 (maybeAutoStart checks
    // this) — the user can re-launch from the profile toggle. Set BEFORE the
    // async build so a fast reload can't slip past it.
    try {
      sessionStorage.setItem(TOUR_SESSION_SEEN_KEY, 'true');
    } catch {
      /* sessionStorage unavailable — server flag still governs */
    }
    this.sidebar?.forceExpandForTour();
    // forceExpandForTour() opens every group; Angular needs a change-detection
    // cycle + paint to render the newly-revealed submenu rows before we can
    // query their [data-tour] anchors. 150ms comfortably covers that (the
    // sidebar is OnPush and we markForCheck inside the expand call).
    setTimeout(() => {
      this.steps = this.buildSteps();
      if (this.steps.length === 0) {
        this.sidebar?.restoreAfterTour();
        return;
      }
      this.dontShowAgain = false;
      this.running.set(true);
      this.driverObj = driver(this.buildConfig());
      this.driverObj.drive();
    }, 150);
  }

  /** Destroy the driver instance and restore chrome. Safe to call twice. */
  stop(): void {
    // Ensure any overlay we opened for the active step is closed.
    this.closeAllChrome();
    if (this.driverObj) {
      try {
        this.driverObj.destroy();
      } catch {
        // driver.js throws if already destroyed — ignore.
      }
      this.driverObj = null;
    }
    this.sidebar?.restoreAfterTour();
    this.running.set(false);
  }

  /**
   * Persist the show-on-login preference. Called by the injected checkbox
   * and by the profile-page toggle. Fire-and-forget: a failed PUT leaves
   * the local flag as the source of truth for this session.
   */
  async setShowTour(value: boolean): Promise<void> {
    StorageService.set(StorageType.SHOW_TOUR, value ? 'true' : 'false');
    try {
      await lastValueFrom(
        this.http.apiPut(PROFILE.UPDATE_TOUR, { showTour: value }),
      );
    } catch {
      // Non-fatal — the stashed flag still governs this session.
    }
  }

  // ── Step building ────────────────────────────────────────────────

  private buildSteps(): BuiltStep[] {
    // Module steps come from the sidebar's rendered TOP-LEVEL rows (groups +
    // top-level leaves) — one step per parent, never per submenu item, so a
    // user with many modules gets ~8 steps, not ~24. The sidebar already
    // filtered these by permission, so no extra permission check is needed.
    const moduleSteps: TourStepDef[] = (
      this.sidebar?.getTourModuleTargets() ?? []
    ).map(t => ({
      key: t.value,
      anchor: `[data-tour="nav-${t.value}"]`,
      side: 'right',
      align: 'center',
    }));

    const eligible: TourStepDef[] = [
      TOUR_WELCOME,
      ...TOUR_CHROME_LEADING,
      ...moduleSteps,
      ...TOUR_CHROME_TRAILING,
      TOUR_DONE,
    ];

    // Drop any anchored step whose element isn't currently in the DOM
    // (e.g. the System Admin has no search/bell). Bookends are element-less
    // and always kept. Keeps the progress count ("Step x of N") honest.
    return eligible
      .filter(def => {
        if (def.bookend || !def.anchor) return true;
        return !!document.querySelector(def.anchor);
      })
      .map(def => ({ def }));
  }

  // ── driver.js config ─────────────────────────────────────────────

  private buildConfig(): Config {
    return {
      steps: this.steps.map((s, i) => this.toDriveStep(s, i)),
      showProgress: true,
      // The translated string keeps driver.js's own {{current}}/{{total}}
      // tokens verbatim (they survive translation in every locale); driver.js
      // substitutes them at render time. We must NOT pass interpolation params
      // to ngx-translate here or it would eat those braces.
      progressText: this.translate.instant('TOUR.PROGRESS'),
      nextBtnText: this.translate.instant('TOUR.NEXT'),
      prevBtnText: this.translate.instant('TOUR.BACK'),
      doneBtnText: this.translate.instant('TOUR.FINISH'),
      allowClose: true,
      animate: false,
      smoothScroll: true,
      // No spotlight box / cutout around the active element and NO dimming of
      // the page: overlayOpacity 0 makes driver.js's overlay fully transparent,
      // so the highlighted item stays crisp (no scrim, no anti-aliased cutout
      // edge = no blur) and we rely on the popover's ARROW to point at it. The
      // overlay layer still exists (it carries click-blocking + the arrow
      // anchor), it's just invisible. stagePadding kept small — it only affects
      // where the (now-invisible) cutout and the popover anchor sit.
      stagePadding: 4,
      stageRadius: 6,
      popoverClass: 'dbexec-tour',
      overlayColor: '#000000',
      overlayOpacity: 0,
      allowKeyboardControl: true,
      // Skip a step whose element vanished between build and drive.
      // We already filtered, but this guards a mid-tour DOM change.
      skipMissingElement: true,
      // Inject the "Don't show again" checkbox into every footer.
      onPopoverRender: (popover, opts) => this.decoratePopover(popover, opts),
      // Backdrop click must not kill the tour during an overlay step —
      // the opened panel sits over the backdrop. No-op the click.
      overlayClickBehavior: () => {
        /* no-op: use the buttons to navigate */
      },
      // X button and Esc → treat as "skip": stop + restore, no persistence.
      onCloseClick: () => this.onSkip(),
      onDestroyStarted: () => {
        // Fired for X/Esc when hooks are set; ensure single teardown.
        if (this.driverObj?.isActive()) this.onSkip();
      },
    };
  }

  private toDriveStep(built: BuiltStep, index: number): DriveStep {
    const { def } = built;
    const isLast = index === this.steps.length - 1;
    return {
      element: def.anchor,
      popover: {
        title: this.stepTitle(def),
        description: this.stepDesc(def),
        side: def.side ?? 'right',
        align: def.align ?? 'start',
        // The last step's "next" is the Done button.
        showButtons: ['next', 'previous', 'close'],
        onNextClick: () => this.onNext(isLast),
        onPrevClick: () => this.onPrev(),
      },
      onHighlightStarted: () => this.onStepEnter(def),
      onDeselected: () => this.onStepLeave(def),
      // Never let a highlighted control (esp. Logout) actually fire.
      disableActiveInteraction: true,
    };
  }

  // ── Navigation handlers (we own them because hooks are set) ──────

  private onNext(isLast: boolean): void {
    if (isLast) {
      this.completeAndStop();
      return;
    }
    this.driverObj?.moveNext();
  }

  private onPrev(): void {
    this.driverObj?.movePrevious();
  }

  /** Skip / close (X or Esc): stop without marking completed. Because the
   *  showTour flag is unchanged, an un-dismissed skip will show again next
   *  login — the intended "show until dismissed" behaviour. */
  private onSkip(): void {
    this.stop();
  }

  /** Reaching the closing card + Finish: mark seen for this tab session so
   *  a reload in the same session doesn't replay it, then stop. Persistence
   *  of showTour only happens via the checkbox. */
  private completeAndStop(): void {
    try {
      sessionStorage.setItem(TOUR_SESSION_SEEN_KEY, 'true');
    } catch {
      // sessionStorage may be unavailable; the server flag still governs.
    }
    this.stop();
  }

  // ── Per-step overlay choreography ────────────────────────────────

  private onStepEnter(def: TourStepDef): void {
    if (!def.chrome) return;
    switch (def.chrome) {
      // Search & notifications: highlight the icon ONLY — do NOT open the
      // search modal / notification panel (they'd cover the page and the tour).
      case 'search':
      case 'notifications':
        break;
      // Language & logout rows live inside the account (avatar) menu, so we
      // must open THAT to point at them — but NOT the nested language-chooser
      // flyout (the locale list). openAccountMenuForTour opens the menu without
      // the flyout; openLanguageFlyoutForTour (which also opened the flyout) is
      // intentionally no longer used.
      case 'language':
      case 'logout':
        this.sidebar?.openAccountMenuForTour();
        break;
    }
    // Let the menu paint, then re-anchor the popover to its final spot.
    setTimeout(() => this.driverObj?.refresh(), 120);
  }

  private onStepLeave(def: TourStepDef): void {
    if (!def.chrome) return;
    switch (def.chrome) {
      // Nothing was opened for search / notifications, so nothing to close.
      case 'search':
      case 'notifications':
        break;
      case 'language':
      case 'logout':
        // Keep the account menu open across the adjacent language→logout
        // pair; only close when the next step isn't an account-menu one.
        this.maybeCloseAccountMenu(def);
        break;
    }
  }

  /** Close the account menu unless the NEXT step still needs it open. */
  private maybeCloseAccountMenu(leaving: TourStepDef): void {
    const idx = this.steps.findIndex(s => s.def.key === leaving.key);
    const next = this.steps[idx + 1]?.def;
    const nextNeedsMenu =
      next?.chrome === 'language' || next?.chrome === 'logout';
    if (!nextNeedsMenu) this.sidebar?.closeTourPopovers();
  }

  private closeAllChrome(): void {
    this.globalSearchService.closeSearch();
    this.notificationModalService.close();
    this.sidebar?.closeTourPopovers();
  }

  // ── Popover decoration (the "Don't show again" checkbox) ─────────

  private decoratePopover(
    popover: { footer: HTMLElement; wrapper: HTMLElement },
    _opts: unknown,
  ): void {
    // Avoid duplicating if driver.js re-renders the same popover node.
    if (popover.wrapper.querySelector('.dbexec-tour-dsa')) return;

    const row = document.createElement('label');
    row.className = 'dbexec-tour-dsa';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.dontShowAgain;
    cb.className = 'dbexec-tour-dsa-checkbox';

    const text = document.createElement('span');
    text.textContent = this.translate.instant('TOUR.DONT_SHOW_AGAIN');

    cb.addEventListener('change', () => {
      this.dontShowAgain = cb.checked;
      // Persist immediately so it survives even if the user closes the tab
      // right after ticking. Unticking re-enables.
      void this.setShowTour(!cb.checked);
    });

    row.appendChild(cb);
    row.appendChild(text);
    // Place the checkbox row ABOVE the footer buttons for visibility.
    popover.footer.parentElement?.insertBefore(row, popover.footer);
  }

  // ── i18n resolution ──────────────────────────────────────────────

  private stepTitle(def: TourStepDef): string {
    if (def.key === TOUR_WELCOME.key)
      return this.translate.instant('TOUR.WELCOME.TITLE');
    if (def.key === TOUR_DONE.key)
      return this.translate.instant('TOUR.DONE.TITLE');
    // Chrome + curated module steps have a dedicated TOUR.STEPS.<key>.TITLE.
    // Dynamic sidebar rows (groups like userAndAccess, or leaves without a
    // curated key) fall back to the sidebar's own label SIDEBAR.<key>.
    const curated = `TOUR.STEPS.${def.key}.TITLE`;
    return this.hasKey(curated)
      ? this.translate.instant(curated)
      : this.translate.instant(`SIDEBAR.${def.key}`);
  }

  private stepDesc(def: TourStepDef): string {
    if (def.key === TOUR_WELCOME.key)
      return this.translate.instant('TOUR.WELCOME.DESC');
    if (def.key === TOUR_DONE.key)
      return this.translate.instant('TOUR.DONE.DESC');
    const curated = `TOUR.STEPS.${def.key}.DESC`;
    // Fall back to one generic line for dynamic sidebar rows without curated
    // copy, interpolating the row's label so it still reads specifically.
    return this.hasKey(curated)
      ? this.translate.instant(curated)
      : this.translate.instant('TOUR.MODULE_GENERIC_DESC', {
          name: this.translate.instant(`SIDEBAR.${def.key}`),
        });
  }

  /** True when the translate layer has a real value for `key` (not just the
   *  key echoed back). Used to decide curated-vs-fallback copy. */
  private hasKey(key: string): boolean {
    const v = this.translate.instant(key);
    return typeof v === 'string' && v !== key && v.trim().length > 0;
  }
}
