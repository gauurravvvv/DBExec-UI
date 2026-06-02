import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subscription, interval } from 'rxjs';
import { share, startWith } from 'rxjs/operators';

/**
 * Single shared 30-second ticker that drives every RelativeTimePipe
 * instance. A page-wide list with N rows would otherwise spawn N
 * independent setIntervals — wasteful and they drift relative to
 * each other ("2 minutes ago" / "1 minute ago" on the same row). One
 * ticker, one tick, every pipe re-evaluates in lockstep.
 *
 * 30s is the right cadence: relative labels switch unit at ~60s
 * granularity ("a few seconds ago" → "1 minute ago"), so 30s halves
 * the worst-case staleness without burning CPU. Bump only if profiling
 * shows pipe re-evaluation cost is dominant (unlikely with the
 * impure-cache pattern the pipe uses).
 */
@Injectable({ providedIn: 'root' })
export class TimeTickerService implements OnDestroy {
  /**
   * Emits `0` immediately on subscribe (so a freshly-mounted pipe
   * doesn't wait 30s for its first refresh) and every 30 000 ms
   * thereafter. `share()` so subscribers join the same underlying
   * interval — the Nth subscriber doesn't create the Nth timer.
   */
  readonly tick$: Observable<number> = interval(30_000).pipe(
    startWith(0),
    share(),
  );

  /**
   * Local handle so OnDestroy can complete the inner subject if the
   * service ever leaves the root injector (it shouldn't with
   * providedIn:'root', but be tidy). No-op in practice.
   */
  private warmup: Subscription = this.tick$.subscribe();

  ngOnDestroy(): void {
    this.warmup.unsubscribe();
  }
}
