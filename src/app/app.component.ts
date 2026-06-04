import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { filter } from 'rxjs/operators';
import { StorageType } from './core/constants/storage-type.constant';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { LoadingService } from './core/services/loading.service';
import { LocaleService } from './core/services/locale.service';
import { LoginService } from './core/services/login.service';
import { SessionExpiredService } from './core/services/session-expired.service';
import { StorageService } from './core/services/storage.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);

  readonly loading = this.loadingService.loading;
  showSessionExpiredDialog = false;
  showIdleWarningDialog = false;
  idleCountdown = 0;

  constructor(
    private loadingService: LoadingService,
    private primengConfig: PrimeNGConfig,
    private sessionExpiredService: SessionExpiredService,
    private idleTimeoutService: IdleTimeoutService,
    private loginService: LoginService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
    private translate: TranslateService,
    private localeService: LocaleService,
    private themeService: ThemeService,
  ) {
    const savedTheme = StorageService.get(StorageType.THEME);
    if (!savedTheme) {
      StorageService.set(StorageType.THEME, 'dark');
      document.body.classList.remove('light-theme');
    } else {
      if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
    }

    const savedLocale = StorageService.get(StorageType.LOCALE);
    this.translate.use(savedLocale || 'en');
  }

  ngOnInit(): void {
    this.primengConfig.ripple = true;

    // Bootstrap kick — when an existing access token is found in
    // storage (tab refresh, direct URL entry), fire one refresh-token
    // call so the BE returns a fresh access token AND the current
    // org theme. The refresh success path applies the theme through
    // the existing wiring; a brief flash of the default DBExec
    // palette during the ~200 ms RTT is acceptable and usually masked
    // by the page skeleton. No localStorage copy of the theme is
    // kept — the BE is the single source of truth.
    this.loginService.bootstrapTokenRefresh();

    // Session expired (refresh token invalidated)
    this.sessionExpiredService.onSessionExpired
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.idleTimeoutService.stop();
        this.showIdleWarningDialog = false;
        this.showSessionExpiredDialog = true;
        // Drop any active temp locale — when the user logs in again
        // their persisted preference must take over.
        this.localeService.clearTempLocale();
      });

    // Idle timeout warning (countdown tick)
    this.idleTimeoutService.onIdleWarning
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(seconds => {
        this.idleCountdown = seconds;
        this.showIdleWarningDialog = true;
      });

    // Idle timeout expired — auto logout
    this.idleTimeoutService.onIdleLogout
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.showIdleWarningDialog = false;
        this.performLogout();
      });

    // Re-apply browser tab title when language changes
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateTitle());

    // Start/stop idle tracking based on route, and react to ?locale=
    // query param. See handleLocaleQueryParam for the locale logic.
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(event => {
        // Update browser tab title
        this.updateTitle();

        this.handleLocaleQueryParam(event.urlAfterRedirects || event.url);

        if (
          event.url === '/login' ||
          event.url === '/' ||
          event.url === '/forgot-password'
        ) {
          this.idleTimeoutService.stop();
          this.showSessionExpiredDialog = false;
          this.showIdleWarningDialog = false;
          this.sessionExpiredService.reset();
        } else if (
          this.loginService.isLoggedIn() &&
          !this.idleTimeoutService.isRunning
        ) {
          this.idleTimeoutService.start();
        }
      });

    // Start idle tracking and proactive token refresh if already logged in on page load
    if (this.loginService.isLoggedIn()) {
      this.idleTimeoutService.start();
      this.loginService.scheduleTokenRefresh();
    }
  }

  ngOnDestroy(): void {
    this.idleTimeoutService.stop();
  }

  onSessionExpiredOk(): void {
    this.showSessionExpiredDialog = false;
    this.router.navigate(['/login']);
  }

  onIdleStayLoggedIn(): void {
    this.showIdleWarningDialog = false;
    this.idleTimeoutService.dismissWarning();
  }

  onIdleLogoutNow(): void {
    this.showIdleWarningDialog = false;
    this.performLogout();
  }

  /**
   * Handle the `?locale=xx-YY` URL query parameter.
   *
   * Behaviour:
   * - Only active inside the authenticated app shell (URLs starting
   *   with /app). Public routes (login, forgot-password) are skipped
   *   so a stale ?locale= on a login link doesn't accidentally lock
   *   the login page into a different language.
   * - `?locale=<supported>` → apply via applyTempLocale (no PATCH,
   *   no localStorage write, no JWT refresh). The user's persisted
   *   preference stays untouched.
   * - Unsupported value → silently ignored. The current locale
   *   stays in place; we don't want a typo to flip the language to
   *   the default.
   *
   * Once a temp locale is set, it survives the rest of the session.
   * We do NOT restore the persisted locale when the URL param later
   * disappears — that would break the "navigate around and stay in
   * the temp language" expectation, because internal nav strips query
   * params unless they're explicitly preserved. The temp locale is
   * cleared only on:
   *   - the user picking a new language from the header dropdown
   *     (the header strips the param and persists their choice), or
   *   - logout → next login (initFromToken resets to the persisted
   *     value from the JWT).
   */
  private handleLocaleQueryParam(url: string): void {
    if (!url.startsWith('/app')) return;

    const queryStart = url.indexOf('?');
    if (queryStart < 0) return;
    const params = new URLSearchParams(url.slice(queryStart));
    const requested = params.get('locale');
    if (!requested) return;

    if (this.localeService.isSupported(requested)) {
      this.localeService.applyTempLocale(requested);
    }
  }

  private updateTitle(): void {
    let route = this.activatedRoute;
    while (route.firstChild) route = route.firstChild;
    const titleKey = route.snapshot.data['title'];
    const pageTitle = titleKey ? this.translate.instant(titleKey) : null;
    this.titleService.setTitle(pageTitle ? `DBExec - ${pageTitle}` : 'DBExec');
  }

  private performLogout(): void {
    this.idleTimeoutService.stop();
    this.loginService.logout().subscribe({
      next: () => this.finalizeLogout(),
      error: () => this.finalizeLogout(),
    });
  }

  private finalizeLogout(): void {
    StorageService.clear();
    // Drop any active ?locale= override so the next login picks up
    // the user's persisted preference even if the URL doesn't carry
    // the param anymore.
    this.localeService.clearTempLocale();
    // Clear injected theme so the login page (and the next user) get
    // the default palette until their own theme loads.
    this.themeService.clear();
    this.router.navigate(['/login']);
  }
}
