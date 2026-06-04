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
 * RelayComponent — the post-login transition screen.
 *
 * Mounted at `/relay`. Reads the relay-only fields populated by
 * `LoginService.login()` (firstName / lastName / isFirstLogin),
 * renders the localised greeting + status copy, and immediately
 * kicks `LoginService.bootstrapSession()` (phase 2). When the
 * bootstrap returns ok, the component swaps to a "ready" state for
 * ~400 ms (subtle check + "You're in" copy) and then navigates to
 * the role's home route. On error or 10-second stall, it surfaces
 * Retry + Back-to-login affordances.
 *
 * Visual layout, top-down:
 *   - Wordmark (de-emphasised, 13px muted)
 *   - Initials avatar (32px brand-tinted disc)
 *   - Greeting with bold firstName (h1, 22px)
 *   - Status copy line (14px muted, swaps as state changes)
 *   - Ring spinner (loading/slow) OR check icon (ready)
 *   - Retry + Back-to-login (slow/error only)
 *
 * Keyboard / a11y:
 *   - `Esc` triggers Back-to-login once affordances are visible.
 *   - Retry receives focus automatically when slow/error first
 *     enters that state.
 *   - The card sits inside a role="status" aria-live="polite"
 *     region so status changes are announced to screen readers.
 *
 * Motion budget — same as before: single-curve, brand-only accents,
 * reduced-motion carve-out collapses to opacity fades.
 */
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

  /** Bumped on every TranslateService lang change so the
   *  greetingPrefix / greetingSuffix computeds re-fire. */
  private readonly langTick = signal(0);
  private langSub?: Subscription;

  /** State machine — exactly four states. */
  readonly state = signal<'loading' | 'slow' | 'ready' | 'error'>('loading');

  readonly firstName = signal<string>('');
  readonly lastName = signal<string>('');
  readonly isFirstLogin = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  /** i18n key for the greeting (depends on first-vs-returning). */
  readonly greetingKey = computed(() =>
    this.isFirstLogin() ? 'AUTH.RELAY.WELCOME' : 'AUTH.RELAY.WELCOME_BACK',
  );

  /** Convenience for the template — interp params for translate pipe. */
  readonly greetingParams = computed(() => ({ firstName: this.firstName() }));

  /** The translated greeting, split around the {{firstName}}
   *  placeholder. Lets the template bold the name without ever
   *  feeding firstName into an HTML sink — we render the three
   *  pieces (prefix text, <strong>firstName</strong>, suffix text)
   *  as separate text nodes. */
  private readonly greetingParts = computed<[string, string]>(() => {
    // Read langTick so the computed re-runs on TranslateService
    // lang changes. The .instant call below is what actually
    // resolves the current locale.
    this.langTick();
    const raw = this.translate.instant(this.greetingKey()) || '';
    // Use a placeholder marker that nothing in the locale strings
    // would ever produce naturally.
    const marker = 'NAME';
    const expanded = this.translate.instant(this.greetingKey(), {
      firstName: marker,
    });
    const idx = expanded.indexOf(marker);
    if (idx < 0) {
      // Defensive: locale string didn't include the placeholder.
      // Fall back to "<full string>" as prefix, empty suffix.
      return [raw, ''];
    }
    return [expanded.slice(0, idx), expanded.slice(idx + marker.length)];
  });

  readonly greetingPrefix = computed(() => this.greetingParts()[0]);
  readonly greetingSuffix = computed(() => this.greetingParts()[1]);

  /** Initials for the avatar disc — uppercased, one or two letters. */
  readonly initials = computed(() => {
    const fn = this.firstName().trim();
    const ln = this.lastName().trim();
    const a = fn ? fn[0] : '';
    const b = ln ? ln[0] : '';
    return (a + b).toUpperCase() || (fn ? fn[0].toUpperCase() : '?');
  });

  @ViewChild('retryBtn') retryBtnRef?: ElementRef<HTMLButtonElement>;

  /** Footer line — current year. */
  readonly year = new Date().getFullYear();

  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private navTimer: ReturnType<typeof setTimeout> | null = null;
  private affordancesShownAt: 'slow' | 'error' | null = null;

  constructor() {
    // Auto-focus the Retry button whenever the affordances become
    // visible (slow / error). Effect tracks `state()` so it fires on
    // every transition; the affordancesShownAt guard makes sure we
    // only focus on the first entry into each affordance state, not
    // on every re-render.
    effect(() => {
      const s = this.state();
      const isAffordance = s === 'slow' || s === 'error';
      if (isAffordance && this.affordancesShownAt !== s) {
        this.affordancesShownAt = s;
        // Defer so the *ngIf has actually inserted the button into
        // the DOM by the time we focus it.
        setTimeout(() => this.retryBtnRef?.nativeElement?.focus(), 0);
      } else if (!isAffordance) {
        this.affordancesShownAt = null;
      }
    });
  }

  ngOnInit(): void {
    // Re-fire greeting computeds when the locale changes mid-mount
    // (e.g. relay enters before applyTempLocale finishes its
    // translateService.use() round trip).
    this.langSub = this.translate.onLangChange.subscribe(
      (_e: LangChangeEvent) => this.langTick.update(n => n + 1),
    );

    const firstName = StorageService.get(StorageType.RELAY_FIRST_NAME) || '';
    const lastName = StorageService.get(StorageType.RELAY_LAST_NAME) || '';
    const isFirstLogin =
      StorageService.get(StorageType.RELAY_IS_FIRST_LOGIN) === 'true';

    if (!firstName) {
      // Direct visit / refresh without going through phase 1 — bail
      // back to login. Use replaceUrl so the relay doesn't sit in
      // the history stack.
      this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    this.firstName.set(firstName);
    this.lastName.set(lastName);
    this.isFirstLogin.set(isFirstLogin);

    this.kickBootstrap();
  }

  ngAfterViewInit(): void {
    // No-op for now — focus management is handled in the effect
    // above. Hook kept so future polish (autofocusing the first
    // interactive element on initial render) lands here.
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.langSub?.unsubscribe();
  }

  /** Esc to back-to-login, but only once the affordances are
   *  visible. Avoids accidentally bailing out mid-load. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state() === 'slow' || this.state() === 'error') {
      this.backToLogin();
    }
  }

  /** Phase-2 call. Public so the Retry button can re-invoke it. */
  retry(): void {
    if (this.state() === 'loading') return;
    this.state.set('loading');
    this.errorMessage.set('');
    this.kickBootstrap();
  }

  /** Escape hatch — drop tokens, return to /login. */
  backToLogin(): void {
    this.clearTimers();
    StorageService.clear();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // ── Internals ────────────────────────────────────────────────

  private kickBootstrap(): void {
    this.clearTimers();
    // After 10 s of "loading" with no result, swap to "slow" so the
    // copy + affordances reflect the wait without hiding what's
    // happening.
    this.slowTimer = setTimeout(() => {
      if (this.state() === 'loading') this.state.set('slow');
    }, 10000);

    this.loginService
      .bootstrapSession()
      .then((res: any) => {
        if (res?.status) {
          this.state.set('ready');
          // Hold the "you're in" affordance briefly so the user
          // perceives a beat of confirmation, then navigate.
          this.navTimer = setTimeout(() => this.navigateHome(), 400);
        } else {
          this.errorMessage.set(res?.message || '');
          this.state.set('error');
        }
      })
      .catch((err: any) => {
        this.errorMessage.set(err?.message || '');
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
    if (this.navTimer) {
      clearTimeout(this.navTimer);
      this.navTimer = null;
    }
  }
}
