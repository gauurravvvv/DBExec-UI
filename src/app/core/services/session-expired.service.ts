import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SessionExpiredService {
  private sessionExpired$ = new Subject<void>();
  private _triggered = false;

  readonly onSessionExpired = this.sessionExpired$.asObservable();

  trigger(): void {
    if (this._triggered) return;
    this._triggered = true;
    this.sessionExpired$.next();
  }

  reset(): void {
    this._triggered = false;
  }
}
