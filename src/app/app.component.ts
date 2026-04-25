import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LoadingService } from './core/services/loading.service';
import { SessionExpiredService } from './core/services/session-expired.service';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { LoginService } from './core/services/login.service';
import { StorageService } from './core/services/storage.service';
import { PrimeNGConfig } from 'primeng/api';
import { delay, filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);

  public loading = false;
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
  ) {
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
      localStorage.setItem('theme', 'dark');
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
    this.listenToLoading();

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
        let route = this.activatedRoute;
        while (route.firstChild) route = route.firstChild;
        const pageTitle = route.snapshot.data['title'];
        this.titleService.setTitle(
          pageTitle ? `DBExec - ${pageTitle}` : 'DBExec',
        );

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

  listenToLoading() {
    this.loadingService.isLoadingSubject
      .pipe(delay(0), takeUntilDestroyed(this.destroyRef))
      .subscribe((loading: any) => {
        if (this.loading !== loading) this.loading = loading;
      });
  }
}
