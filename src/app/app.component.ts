import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { SessionExpiredService } from './core/services/session-expired.service';
import { IdleTimeoutService } from './core/services/idle-timeout.service';
import { LoginService } from './core/services/login.service';
import { StorageService } from './core/services/storage.service';
import { PrimeNGConfig } from 'primeng/api';
import { delay, filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  public loading = false;
  showSessionExpiredDialog = false;
  showIdleWarningDialog = false;
  idleCountdown = 0;

  private sessionSub!: Subscription;
  private idleWarningSub!: Subscription;
  private idleLogoutSub!: Subscription;
  private routerSub!: Subscription;

  constructor(
    private loadingService: LoadingService,
    private primengConfig: PrimeNGConfig,
    private sessionExpiredService: SessionExpiredService,
    private idleTimeoutService: IdleTimeoutService,
    private loginService: LoginService,
    private router: Router,
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
    this.sessionSub = this.sessionExpiredService.onSessionExpired.subscribe(() => {
      this.idleTimeoutService.stop();
      this.showIdleWarningDialog = false;
      this.showSessionExpiredDialog = true;
    });

    // Idle timeout warning (countdown tick)
    this.idleWarningSub = this.idleTimeoutService.onIdleWarning.subscribe((seconds) => {
      this.idleCountdown = seconds;
      this.showIdleWarningDialog = true;
    });

    // Idle timeout expired — auto logout
    this.idleLogoutSub = this.idleTimeoutService.onIdleLogout.subscribe(() => {
      this.showIdleWarningDialog = false;
      this.performLogout();
    });

    // Start/stop idle tracking based on route
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event.url === '/login' || event.url === '/' || event.url === '/forgot-password') {
          this.idleTimeoutService.stop();
        } else if (this.loginService.isLoggedIn() && !this.idleTimeoutService.isRunning) {
          this.idleTimeoutService.start();
        }
      });

    // Start idle tracking if already logged in on page load
    if (this.loginService.isLoggedIn()) {
      this.idleTimeoutService.start();
    }
  }

  ngOnDestroy(): void {
    this.sessionSub?.unsubscribe();
    this.idleWarningSub?.unsubscribe();
    this.idleLogoutSub?.unsubscribe();
    this.routerSub?.unsubscribe();
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
      .pipe(delay(0))
      .subscribe((loading: any) => {
        if (this.loading !== loading) this.loading = loading;
      });
  }
}
