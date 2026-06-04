import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
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
 *   ready     — phase-2 returned ok. 400 ms hold with the check icon
 *               + "You're in", then navigate to the role's home.
 *
 *   error     — phase-2 failed (or hit the 30 s hard timeout). Shows
 *               a friendly i18n message, the raw server message in a
 *               muted Details line, and BOTH Retry + Back-to-login.
 *               Retry is auto-focused; Esc bails to login.
 *
 * Resilience:
 *   - On the FIRST transient failure (network down / 5xx) the
 *     component silently retries once after 500 ms before showing
 *     anything. Saves the user from a "couldn't set up your
 *     session" banner on a single dev-server hiccup.
 *   - A 30 s hard timeout forces `error` if the request hangs
 *     forever (proxy stall / frozen DB connection).
 *
 * Routing safety:
 *   - Direct visits (no phase-1 storage) bounce to /login.
 *   - On unmount, all timers (slow / timeout / nav) are cleared so a
 *     mid-flight navigation can't fire a `setState` after destroy.
 *
 * Visual layout: anchored top-left wordmark, centred greeting card
 * (initials avatar + bold-firstName greeting + status + spinner/
 * check + affordances), bottom footer line. Motion is single-curve;
 * `prefers-reduced-motion` collapses spins/scales to opacity fades.
 */
const SLOW_THRESHOLD_MS = 6000;
const HARD_TIMEOUT_MS = 30000;
const SILENT_RETRY_DELAY_MS = 500;
const READY_HOLD_MS = 400;

@Component({
  selector: 'app-relay',
  templateUrl: './relay.component.html',
  styleUrls: ['./relay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelayComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly globalService = inject(GlobalService);
  private readonly translate = inject(TranslateService);

  readonly state = signal<'loading' | 'slow' | 'ready' | 'error'>('loading');

  readonly firstName = signal<string>('');
  readonly lastName = signal<string>('');
  readonly isFirstLogin = signal<boolean>(false);

  /** Raw server-provided message (or HTTP error message). Surfaced
   *  in the muted Details line under the friendly copy. */
  readonly errorDetails = signal<string>('');

  /** Bumped on every TranslateService lang change so the
   *  greetingPrefix / greetingSuffix computeds re-fire. */
  private readonly langTick = signal(0);
  private langSub?: Subscription;

  readonly greetingKey = computed(() =>
    this.isFirstLogin() ? 'AUTH.RELAY.WELCOME' : 'AUTH.RELAY.WELCOME_BACK',
  );

  readonly greetingParams = computed(() => ({ firstName: this.firstName() }));

  private readonly greetingParts = computed<[string, string]>(() => {
    this.langTick();
    const marker = 'NAME';
    const expanded = this.translate.instant(this.greetingKey(), {
      firstName: marker,
    });
    const idx = expanded.indexOf(marker);
    if (idx < 0) return [expanded, ''];
    return [expanded.slice(0, idx), expanded.slice(idx + marker.length)];
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
  // Reset on every manual Retry so the user gets the same
  // forgiveness budget if they bail out and come back.
  private silentRetryUsed = false;

  // Guard for the auto-focus effect — only focus on first entry
  // into `error`, not on every re-render while in `error`.
  private lastFocusedAffordance: 'error' | null = null;

  constructor() {
    effect(() => {
      const s = this.state();
      if (s === 'error' && this.lastFocusedAffordance !== 'error') {
        this.lastFocusedAffordance = 'error';
        // Defer past the *ngIf insertion.
        setTimeout(() => this.retryBtnRef?.nativeElement?.focus(), 0);
      } else if (s !== 'error') {
        this.lastFocusedAffordance = null;
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

  ngAfterViewInit(): void {
    // No-op for now.
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.langSub?.unsubscribe();
  }

  /** Esc → Back to login, but only once affordances are visible. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state() === 'slow' || this.state() === 'error') {
      this.backToLogin();
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
      if (this.state() === 'loading') this.state.set('slow');
    }, SLOW_THRESHOLD_MS);

    // Hard timeout — forces `error` if the request never returns at
    // all (proxy stall / DB hang / etc.). We don't actually abort
    // the underlying HTTP call (would need AbortController plumbing
    // through HttpClient); we just stop waiting for it and surface
    // the error UI. Any late-arriving response is ignored via the
    // state guard below.
    this.hardTimeoutTimer = setTimeout(() => {
      const s = this.state();
      if (s === 'loading' || s === 'slow') {
        // Use the translated "Request timed out" string as the
        // details line so the user reads something meaningful in
        // their locale instead of the literal word "timeout".
        this.errorDetails.set(
          this.translate.instant('AUTH.RELAY.TIMEOUT_DETAIL'),
        );
        this.state.set('error');
      }
    }, HARD_TIMEOUT_MS);

    this.runBootstrap();
  }

  private runBootstrap(): void {
    this.loginService.bootstrapSession().then((outcome) => {
      // Race guard — if the hard timeout already fired, ignore the
      // late response. The user is already looking at the error
      // surface; flipping back to `ready` here would be jarring
      // and lose the recovery affordances.
      if (this.state() === 'error') return;

      if (outcome.ok) {
        this.clearTimers();
        this.state.set('ready');
        this.navTimer = setTimeout(() => this.navigateHome(), READY_HOLD_MS);
        return;
      }

      // One silent auto-retry for transient failures (network down
      // or 5xx). Tiny delay so a momentary DNS / proxy hiccup
      // doesn't get spammed.
      if (outcome.kind === 'transient' && !this.silentRetryUsed) {
        this.silentRetryUsed = true;
        this.retryDelayTimer = setTimeout(
          () => this.runBootstrap(),
          SILENT_RETRY_DELAY_MS,
        );
        return;
      }

      this.clearTimers();
      this.errorDetails.set(outcome.message || '');
      this.state.set('error');
    });
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
