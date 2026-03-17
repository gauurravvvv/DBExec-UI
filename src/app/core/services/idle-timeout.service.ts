import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription, merge, fromEvent } from 'rxjs';
import { throttleTime } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class IdleTimeoutService implements OnDestroy {
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly COUNTDOWN_SECONDS = 60;

  private idleWarning$ = new Subject<number>();
  private idleLogout$ = new Subject<void>();

  readonly onIdleWarning = this.idleWarning$.asObservable();
  readonly onIdleLogout = this.idleLogout$.asObservable();

  private idleTimer: any = null;
  private countdownTimer: any = null;
  private countdownRemaining = 0;
  private eventSub: Subscription | null = null;
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;

    this.eventSub = merge(
      fromEvent(document, 'mousemove'),
      fromEvent(document, 'keydown'),
      fromEvent(document, 'click'),
      fromEvent(document, 'scroll'),
      fromEvent(document, 'touchstart'),
    )
      .pipe(throttleTime(1000))
      .subscribe(() => {
        // Only reset if countdown is NOT active (user must click "Stay Logged In")
        if (!this.countdownTimer) {
          this.resetIdleTimer();
        }
      });

    this.resetIdleTimer();
  }

  stop(): void {
    this._isRunning = false;
    this.clearIdleTimer();
    this.clearCountdown();
    this.eventSub?.unsubscribe();
    this.eventSub = null;
  }

  dismissWarning(): void {
    this.clearCountdown();
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.startCountdown();
    }, this.IDLE_TIMEOUT_MS);
  }

  private startCountdown(): void {
    this.countdownRemaining = this.COUNTDOWN_SECONDS;
    this.idleWarning$.next(this.countdownRemaining);

    this.countdownTimer = setInterval(() => {
      this.countdownRemaining--;
      this.idleWarning$.next(this.countdownRemaining);

      if (this.countdownRemaining <= 0) {
        this.clearCountdown();
        this.idleLogout$.next();
      }
    }, 1000);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownRemaining = 0;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
