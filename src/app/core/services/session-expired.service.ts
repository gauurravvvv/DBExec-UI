import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SessionExpiredService {
  private sessionExpired$ = new Subject<void>();

  readonly onSessionExpired = this.sessionExpired$.asObservable();

  trigger(): void {
    this.sessionExpired$.next();
  }
}
