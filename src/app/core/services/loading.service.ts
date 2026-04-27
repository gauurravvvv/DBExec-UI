import { computed, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private _activeRequests = signal(0);

  readonly loading = computed(() => this._activeRequests() > 0);

  showLoader() {
    this._activeRequests.update(n => n + 1);
  }

  hideLoader() {
    this._activeRequests.update(n => Math.max(0, n - 1));
  }
}
