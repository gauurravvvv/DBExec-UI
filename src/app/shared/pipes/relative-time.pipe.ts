import {
  ChangeDetectorRef,
  OnDestroy,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription, merge } from 'rxjs';
import { TimeTickerService } from '../services/time-ticker.service';

/**
 * Renders a timestamp as a human-readable, locale-aware relative
 * string: "a few seconds ago", "5 minutes ago", "il y a 2 heures",
 * "2 時間前", etc.
 *
 * Why a pipe and not a component method:
 *   - Idiomatic Angular for template-side value transformation.
 *   - Lives next to `| date` in the template, reads naturally:
 *       {{ row.createdOn | relativeTime }}
 *   - Reusable across every listing/view in the app.
 *
 * Why impure (`pure: false`):
 *   - The output drifts even when the input never changes
 *     (a row that said "a few seconds ago" should become
 *     "1 minute ago" 60s later without a row re-fetch).
 *   - We can't get that with a pure pipe (only re-runs when the
 *     input reference changes).
 *
 * Why caching:
 *   - An impure pipe re-evaluates on EVERY change-detection cycle.
 *     A list with 100 rows × N events per second = wasteful.
 *   - We cache the last (timestamp, lang, bucket) → formatted string
 *     triple and only recompute when one of them changes.
 *
 * Why the shared ticker:
 *   - Without a tick the label only updates when CD happens for
 *     other reasons. With `TimeTickerService.tick$` (one shared
 *     30s interval, regardless of subscriber count), every pipe
 *     instance is invalidated in lockstep.
 *
 * Locale handling:
 *   - Reads the current locale from `TranslateService` and
 *     subscribes to `onLangChange` so labels switch language
 *     in place — no page reload required.
 *
 * Output uses `Intl.RelativeTimeFormat` (native browser), which
 * supports every locale the app ships (en, de, es, fr, it, ja, ko,
 * nl, pt-BR, zh-CN) out of the box without bundling a date library.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform, OnDestroy {
  private cachedKey = '';
  private cachedOutput = '';
  private sub: Subscription;

  constructor(
    private translate: TranslateService,
    private ticker: TimeTickerService,
    private cdr: ChangeDetectorRef,
  ) {
    // Invalidate the cache on every tick or language switch, then
    // markForCheck so OnPush consumers re-render. We don't recompute
    // here — `transform()` does that when CD next visits this binding.
    this.sub = merge(this.ticker.tick$, this.translate.onLangChange).subscribe(
      () => {
        this.cachedKey = ''; // force recompute on next transform()
        this.cdr.markForCheck();
      },
    );
  }

  transform(value: string | Date | number | null | undefined): string {
    if (value == null || value === '') return '';

    const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!isFinite(ts)) return '';

    const lang = this.translate.currentLang || this.translate.defaultLang || 'en';
    const now = Date.now();
    const diffMs = now - ts;
    // Cache key includes the *bucket*, not the raw millisecond delta —
    // two consecutive transform() calls within the same minute produce
    // the same label, so we shouldn't burn cycles building the same
    // string twice.
    const bucket = this.bucketOf(diffMs);
    const key = `${ts}|${lang}|${bucket}`;
    if (key === this.cachedKey) return this.cachedOutput;
    this.cachedKey = key;
    this.cachedOutput = this.format(diffMs, lang);
    return this.cachedOutput;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /**
   * Quantise the raw millisecond delta into the "unit + magnitude"
   * bucket the output uses. Cache key is built off this so a thousand
   * pipe ticks within the same minute don't all rebuild the string.
   */
  private bucketOf(diffMs: number): string {
    const abs = Math.abs(diffMs);
    const sec = Math.floor(abs / 1000);
    if (sec < 45) return 's0'; // "a few seconds ago"
    if (sec < 90) return 'min1';
    const min = Math.floor(sec / 60);
    if (min < 45) return `min${min}`;
    if (min < 90) return 'h1';
    const hr = Math.floor(min / 60);
    if (hr < 22) return `h${hr}`;
    if (hr < 36) return 'd1';
    const day = Math.floor(hr / 24);
    if (day < 26) return `d${day}`;
    if (day < 46) return 'mo1';
    const mo = Math.floor(day / 30);
    if (mo < 11) return `mo${mo}`;
    const yr = Math.floor(day / 365);
    return `y${yr}`;
  }

  /**
   * Build the localised string. Mirrors moment/dayjs `fromNow()`
   * semantics — "a few seconds ago" replaces the literal "0 seconds
   * ago" because that reads better in every locale.
   *
   * `Intl.RelativeTimeFormat(lang, { numeric: 'auto' })` produces:
   *   - "yesterday" / "tomorrow" instead of "1 day ago" / "in 1 day"
   *   - locale-correct plural forms automatically
   *   - returns "now" for the 0 case in most locales, but English
   *     uses "this minute" — we override to "a few seconds ago".
   */
  private format(diffMs: number, lang: string): string {
    const future = diffMs < 0;
    const abs = Math.abs(diffMs);
    const sec = Math.floor(abs / 1000);

    // < 45s reads as "a few seconds (ago)" — short, ambiguous on
    // purpose so the label doesn't flicker between "1 / 2 / 3
    // seconds ago" every tick.
    if (sec < 45) {
      // Use a dedicated translate key so each locale can tune the
      // wording (English "a few seconds ago", JA "数秒前", etc.).
      // Falls back to Intl if the key isn't translated yet.
      const key = future
        ? 'COMMON.RELATIVE_TIME.A_FEW_SECONDS_FROM_NOW'
        : 'COMMON.RELATIVE_TIME.A_FEW_SECONDS_AGO';
      const t = this.translate.instant(key);
      if (t && t !== key) return t;
      // Fallback: Intl returns "in 0 seconds" which reads wrong; use 1.
      return this.intl(lang).format(future ? 1 : -1, 'second');
    }

    const min = Math.floor(sec / 60);
    if (sec < 90 || min < 45) {
      const n = min || 1;
      return this.intl(lang).format(future ? n : -n, 'minute');
    }

    const hr = Math.floor(min / 60);
    if (min < 90 || hr < 22) {
      const n = hr || 1;
      return this.intl(lang).format(future ? n : -n, 'hour');
    }

    const day = Math.floor(hr / 24);
    if (hr < 36 || day < 26) {
      const n = day || 1;
      return this.intl(lang).format(future ? n : -n, 'day');
    }

    const mo = Math.floor(day / 30);
    if (day < 46 || mo < 11) {
      const n = mo || 1;
      return this.intl(lang).format(future ? n : -n, 'month');
    }

    const yr = Math.max(1, Math.floor(day / 365));
    return this.intl(lang).format(future ? yr : -yr, 'year');
  }

  /**
   * Memoised RelativeTimeFormat per (lang, options). Construction is
   * relatively expensive on first call; reusing across pipe instances
   * matters when a listing renders 100+ rows on locale switch.
   */
  private static readonly intlCache = new Map<string, Intl.RelativeTimeFormat>();
  private intl(lang: string): Intl.RelativeTimeFormat {
    let inst = RelativeTimePipe.intlCache.get(lang);
    if (!inst) {
      try {
        inst = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
      } catch {
        // Unknown locale tag — fall back to English. Shouldn't happen
        // with the 10 we ship, but Intl throws on garbage input.
        inst = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      }
      RelativeTimePipe.intlCache.set(lang, inst);
    }
    return inst;
  }
}
