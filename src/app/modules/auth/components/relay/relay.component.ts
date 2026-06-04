import {
  AfterRenderPhase,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { HOME_ROUTES } from 'src/app/core/layout/sidebar/sidebar.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';

/**
 * RelayComponent — post-login transition screen.
 *
 * State machine, with the exact behaviour each state surfaces:
 *
 *   loading   — first 6 s after mount (or after a Retry). Greeting +
 *               status copy + ring spinner. No affordances. The
 *               user can't bail; the request is in flight and
 *               cancelling now would just create a half-open session.
 *
 *   slow      — fires at 6 s if /auth/session still hasn't returned.
 *               Same surface as `loading` but with an additional
 *               "Back to login" escape hatch. No Retry here: there's
 *               already a request in flight, and a second one would
 *               race the first.
 *
 *   ready     — phase-2 returned ok and we committed the bootstrap.
 *               400 ms hold with the check icon + "You're in",
 *               then navigate to the role's home.
 *
 *   error     — phase-2 failed (or hit the 30 s hard timeout). Shows
 *               a friendly i18n message, the raw server message in a
 *               muted Details line, and BOTH Retry + Back-to-login.
 *               Retry is auto-focused; Esc bails to login.
 *
 * Race-guard contract with LoginService:
 *   - bootstrapSession() is PURE: it fetches and returns an outcome.
 *     The relay decides whether to commit by calling applyBootstrap.
 *   - A late response that arrives after the 30 s hard timeout, or
 *     after the user clicked Back-to-login, is dropped here without
 *     mutating storage. That's why side effects don't live inside
 *     bootstrapSession.
 *
 * Resilience:
 *   - On the FIRST transient failure (network down / 5xx, including
 *     the interceptor-rewritten envelope case) the component
 *     silently retries once after 500 ms before showing anything.
 *   - A 30 s hard timeout forces `error` if the request hangs
 *     forever (proxy stall / frozen DB connection).
 *
 * Routing safety:
 *   - Direct visits (no phase-1 storage) bounce to /login.
 *   - On unmount we set `destroyed`, clear all timers, and every
 *     timer body re-checks it before mutating state.
 *
 * Visual layout: anchored top-left wordmark, centred greeting card
 * (initials avatar + bold-firstName greeting + status + spinner/
 * check + affordances), bottom footer line. Motion is single-curve;
 * `prefers-reduced-motion` collapses spins/scales to opacity fades.
 */
// Exported so tests can stub them and ops can re-tune without
// re-bundling sources. Kept at module scope (not on the class) so
// they're tree-shakable and trivially replaceable.
export const SLOW_THRESHOLD_MS = 6000;
export const HARD_TIMEOUT_MS = 30000;
export const SILENT_RETRY_DELAY_MS = 500;
export const READY_HOLD_MS = 400;
export const ESC_CONFIRM_WINDOW_MS = 3000;

// Private-use-area marker for splitting the localised greeting
// around the firstName placeholder. Using PUA codepoints means we
// can never collide with any character a real translator might
// type, no matter how creative the locale's punctuation gets.
const NAME_MARKER = 'NAME';

@Component({
  selector: 'app-relay',
  templateUrl: './relay.component.html',
  styleUrls: ['./relay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelayComponent implements OnInit, OnDestroy {
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly globalService = inject(GlobalService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'loading' | 'slow' | 'ready' | 'error'>('loading');

  readonly firstName = signal<string>('');
  readonly lastName = signal<string>('');
  readonly isFirstLogin = signal<boolean>(false);

  /** Raw server-provided message (or HTTP error message). Surfaced
   *  in the muted Details line under the friendly copy. */
  readonly errorDetails = signal<string>('');

  /** Bumped on every TranslateService lang change so the
   *  greetingPrefix / greetingSuffix computeds re-fire. The
   *  computeds read this signal explicitly so the dependency is
   *  load-bearing — don't remove the read. */
  private readonly langTick = signal(0);
  private langSub?: Subscription;

  readonly greetingKey = computed(() =>
    this.isFirstLogin() ? 'AUTH.RELAY.WELCOME' : 'AUTH.RELAY.WELCOME_BACK',
  );

  /** Translated greeting split around its firstName placeholder.
   *  The template renders prefix + <strong>firstName</strong> +
   *  suffix as separate text nodes — never feeding the firstName
   *  value into an HTML sink. */
  private readonly greetingParts = computed<[string, string]>(() => {
    // Load-bearing read — keeps the computed subscribed to lang
    // changes so a delayed applyTempLocale() refreshes the split.
    this.langTick();
    const expanded = this.translate.instant(this.greetingKey(), {
      firstName: NAME_MARKER,
    });
    const idx = typeof expanded === 'string' ? expanded.indexOf(NAME_MARKER) : -1;
    if (idx < 0) {
      // Locale string didn't include the placeholder, or
      // translate.instant returned the key unchanged because the
      // translations haven't loaded yet. Surface the raw string
      // as the prefix; the firstName <strong> still renders.
      return [typeof expanded === 'string' ? expanded : '', ''];
    }
    return [expanded.slice(0, idx), expanded.slice(idx + NAME_MARKER.length)];
  });

  readonly greetingPrefix = computed(() => this.greetingParts()[0]);
  readonly greetingSuffix = computed(() => this.greetingParts()[1]);

  readonly initials = computed(() => {
    const fn = this.firstName().trim();
    const ln = this.lastName().trim();
    const a = fn ? fn[0] : '';
    const b = ln ? ln[0] : '';
    return (a + b).toUpperCase() || (fn ? fn[0].toUpperCase() : '?');
  });

  @ViewChild('retryBtn') retryBtnRef?: ElementRef<HTMLButtonElement>;

  readonly year = new Date().getFullYear();

  // Timer handles — cleared on every state transition + on destroy.
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private hardTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private navTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayTimer: ReturnType<typeof setTimeout> | null = null;

  // Tracks whether we've already used the one-shot silent retry.
  // Reset on every manual Retry AND on every successful bootstrap
  // so the budget is fresh next time the component re-runs.
  private silentRetryUsed = false;

  // Flipped in ngOnDestroy. Every async callback re-checks this
  // before mutating state — guards against setState-after-destroy
  // when a navigation or refresh races a pending timer.
  private destroyed = false;

  // Used to focus Retry only on the first entry into `error`,
  // not on every re-render while already in `error`.
  private focusedError = false;

  // Two-stage Esc confirm. Modern apps don't bail out of a sign-in
  // on a single keypress (Esc is the most common accidental press
  // on laptops). First Esc reveals the confirm hint; the user has
  // ESC_CONFIRM_WINDOW_MS to press again to actually leave.
  readonly escArmed = signal<boolean>(false);
  private escDisarmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Focus the Retry button when we transition into `error`.
    // afterNextRender waits for the *ngIf to insert the button into
    // the DOM, eliminating the setTimeout-0 race the previous
    // implementation used. Runs in the next paint phase, so the
    // user sees the button focused on the same frame it appears.
    effect(() => {
      const s = this.state();
      if (s === 'error' && !this.focusedError) {
        this.focusedError = true;
        afterNextRender(
          () => {
            if (this.destroyed) return;
            this.retryBtnRef?.nativeElement?.focus();
          },
          { phase: AfterRenderPhase.Read },
        );
      } else if (s !== 'error') {
        this.focusedError = false;
      }
    });
  }

  ngOnInit(): void {
    this.langSub = this.translate.onLangChange.subscribe(
      (_e: LangChangeEvent) => this.langTick.update(n => n + 1),
    );

    const firstName = StorageService.get(StorageType.RELAY_FIRST_NAME) || '';
    const lastName = StorageService.get(StorageType.RELAY_LAST_NAME) || '';
    const isFirstLogin =
      StorageService.get(StorageType.RELAY_IS_FIRST_LOGIN) === 'true';

    if (!firstName) {
      this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    this.firstName.set(firstName);
    this.lastName.set(lastName);
    this.isFirstLogin.set(isFirstLogin);

    this.kickBootstrap();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.clearEscTimer();
    this.langSub?.unsubscribe();
  }

  /** Esc → Back to login, but only once affordances are visible
   *  and only after a confirmation window. First press arms the
   *  hint; second press within ESC_CONFIRM_WINDOW_MS bails. Stops
   *  accidental session loss from a stray Esc, especially common
   *  during the `slow` state when the user might be Esc-ing a
   *  browser autofill prompt or an unrelated overlay.
   *
   *  Listens at the document level because the relay's host is a
   *  non-focusable div — host-scoped listeners would only fire
   *  when the host itself has focus, which it doesn't by default.
   *  Angular automatically removes this listener on component
   *  destroy, so there's no global-keymap leakage. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    const s = this.state();
    if (s !== 'slow' && s !== 'error') return;

    if (this.escArmed()) {
      // Second press within the window — actually bail.
      this.clearEscTimer();
      this.backToLogin();
      return;
    }

    this.escArmed.set(true);
    this.escDisarmTimer = setTimeout(() => {
      if (!this.destroyed) this.escArmed.set(false);
    }, ESC_CONFIRM_WINDOW_MS);
  }

  private clearEscTimer(): void {
    if (this.escDisarmTimer) {
      clearTimeout(this.escDisarmTimer);
      this.escDisarmTimer = null;
    }
  }

  /** User-initiated retry — resets the silent-retry budget so the
   *  one-shot auto-retry is available again after a manual retry. */
  retry(): void {
    if (this.state() === 'loading') return;
    this.silentRetryUsed = false;
    this.errorDetails.set('');
    this.state.set('loading');
    this.kickBootstrap();
  }

  backToLogin(): void {
    this.clearTimers();
    StorageService.clear();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // ── Internals ────────────────────────────────────────────────

  private kickBootstrap(): void {
    this.clearTimers();

    // Slow threshold — adds the "this is taking a while" copy +
    // Back-to-login affordance once the request has been in flight
    // longer than feels comfortable. Doesn't cancel the request.
    this.slowTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.state() === 'loading') this.state.set('slow');
    }, SLOW_THRESHOLD_MS);

    // Hard timeout — forces `error` if the request never returns at
    // all (proxy stall / DB hang / etc.). We don't actually abort
    // the underlying HTTP call (would need AbortController plumbing
    // through HttpClient); we just stop waiting for it and surface
    // the error UI. Any late-arriving response is dropped by the
    // race guard in runBootstrap below, and applyBootstrap is
    // never called — so the user never gets storage writes after
    // they've already seen the error UI.
    this.hardTimeoutTimer = setTimeout(() => {
      if (this.destroyed) return;
      const s = this.state();
      if (s === 'loading' || s === 'slow') {
        this.errorDetails.set(this.translateOrFallback(
          'AUTH.RELAY.TIMEOUT_DETAIL',
          'Request timed out',
        ));
        this.state.set('error');
      }
    }, HARD_TIMEOUT_MS);

    this.runBootstrap();
  }

  private runBootstrap(): void {
    this.loginService.bootstrapSession().then((outcome) => {
      if (this.destroyed) return;

      // Race guard — if the hard timeout already fired, drop the
      // outcome on the floor. We never call applyBootstrap here,
      // so storage / signals stay in their pre-error state.
      if (this.state() === 'error') return;

      if (outcome.ok) {
        // Commit the side effects only after the race guard
        // accepts the outcome. applyBootstrap is idempotent and
        // self-validating.
        const applied = this.loginService.applyBootstrap(outcome.data);
        if (!applied) {
          // Malformed response — treat as fatal. No retry; a fresh
          // attempt against the same broken BE would just loop.
          this.clearTimers();
          this.errorDetails.set(this.translateOrFallback(
            'AUTH.RELAY.MALFORMED_DETAIL',
            'Malformed session payload',
          ));
          this.state.set('error');
          return;
        }
        this.clearTimers();
        this.silentRetryUsed = false; // refresh budget for future runs
        this.state.set('ready');
        this.navTimer = setTimeout(() => {
          if (!this.destroyed) this.navigateHome();
        }, READY_HOLD_MS);
        return;
      }

      // One silent auto-retry for transient failures (network down,
      // 5xx HTTP, or 5xx envelope-rewritten by the interceptor).
      // Tiny delay so a momentary DNS / proxy hiccup doesn't get
      // spammed.
      if (outcome.kind === 'transient' && !this.silentRetryUsed) {
        this.silentRetryUsed = true;
        this.retryDelayTimer = setTimeout(() => {
          if (!this.destroyed) this.runBootstrap();
        }, SILENT_RETRY_DELAY_MS);
        return;
      }

      this.clearTimers();
      this.errorDetails.set(this.sanitiseDetail(outcome.message));
      this.state.set('error');
    });
  }

  /** Conservative safelist for the Details line. The BE message
   *  is shown verbatim only when it looks like a clean,
   *  user-presentable phrase: ≤120 chars, no curly braces, no
   *  angle brackets, no UUID-looking blobs (which usually leak
   *  internal ids). Anything else collapses to empty — the
   *  friendly i18n message above carries the full meaning. */
  private sanitiseDetail(raw: string | undefined): string {
    if (!raw) return '';
    const s = raw.trim();
    if (s.length === 0 || s.length > 120) return '';
    if (/[<>{}]/.test(s)) return '';
    // 8-4-4-4-12 hex with dashes → looks like a UUID; drop the
    // whole message rather than try to redact, since the surround
    // is usually unhelpful too ("User <uuid> not found in org
    // <uuid>").
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s)) {
      return '';
    }
    return s;
  }

  /** translate.instant returns the key itself when translations
   *  haven't loaded yet. Surface a sensible fallback instead so the
   *  user never sees a bare i18n key in the UI. */
  private translateOrFallback(key: string, fallback: string): string {
    const v = this.translate.instant(key);
    return typeof v === 'string' && v !== key ? v : fallback;
  }

  private navigateHome(): void {
    const role = this.globalService.getTokenDetails('role');
    const target =
      role === ROLES.SYSTEM_ADMIN
        ? HOME_ROUTES.SYSTEM_ADMIN
        : HOME_ROUTES.ORG_ADMIN;
    this.router.navigateByUrl(target, { replaceUrl: true });
  }

  private clearTimers(): void {
    if (this.slowTimer) {
      clearTimeout(this.slowTimer);
      this.slowTimer = null;
    }
    if (this.hardTimeoutTimer) {
      clearTimeout(this.hardTimeoutTimer);
      this.hardTimeoutTimer = null;
    }
    if (this.navTimer) {
      clearTimeout(this.navTimer);
      this.navTimer = null;
    }
    if (this.retryDelayTimer) {
      clearTimeout(this.retryDelayTimer);
      this.retryDelayTimer = null;
    }
  }
}
