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
import { PrimeNGConfig } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';
import { StorageType } from './constants/storageType';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { LoadingService } from './core/services/loading.service';
import { LoginService } from './core/services/login.service';
import { SessionExpiredService } from './core/services/session-expired.service';
import { StorageService } from './core/services/storage.service';

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
  }

  ngOnInit(): void {
    this.primengConfig.ripple = true;

    // Session expired (refresh token invalidated)
    this.sessionExpiredService.onSessionExpired
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.idleTimeoutService.stop();
        this.showIdleWarningDialog = false;
        this.showSessionExpiredDialog = true;
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

    // Start/stop idle tracking based on route
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
    this.router.navigate(['/login']);
  }
}
