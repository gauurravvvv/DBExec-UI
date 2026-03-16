import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { SessionExpiredService } from './core/services/session-expired.service';
import { PrimeNGConfig } from 'primeng/api';
import { delay } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  public loading = false;
  showSessionExpiredDialog = false;
  private sessionSub!: Subscription;

  constructor(
    private loadingService: LoadingService,
    private primengConfig: PrimeNGConfig,
    private sessionExpiredService: SessionExpiredService,
    private router: Router,
  ) {
    // Set default theme to light when app first loads
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
      localStorage.setItem('theme', 'dark');
      document.body.classList.remove('light-theme');
    } else {
      // Apply saved theme preference
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

    this.sessionSub = this.sessionExpiredService.onSessionExpired.subscribe(() => {
      this.showSessionExpiredDialog = true;
    });
  }

  ngOnDestroy(): void {
    this.sessionSub?.unsubscribe();
  }

  onSessionExpiredOk(): void {
    this.showSessionExpiredDialog = false;
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
