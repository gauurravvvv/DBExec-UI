import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { PrimeNGConfig } from 'primeng/api';
import { delay } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  constructor(
    private loadingService: LoadingService,
    private primengConfig: PrimeNGConfig
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

  public loading = false;

  ngOnInit(): void {
    this.primengConfig.ripple = true;
    this.listenToLoading();
  }

  listenToLoading() {
    this.loadingService.isLoadingSubject
      .pipe(delay(0))
      .subscribe((loading: any) => {
        if (this.loading !== loading) this.loading = loading;
      });
  }
}
