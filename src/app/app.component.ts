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
  ) {}
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
