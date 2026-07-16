import { Injectable } from '@angular/core';

/**
 * Quick-calc identifiers persisted in `VisualConfig.config.quickCalc`.
 * Each transforms the ordered numeric series a chart/table would show
 * into a derived series (running total, % of total, delta, etc.).
 * `null` / absent = no transform (raw values).
 */
export type QuickCalc =
  | 'running_total'
  | 'percent_of_total'
  | 'difference'
  | 'percent_difference'
  | 'moving_average'
  | 'rank'
  | null;

/**
 * Period-over-period comparison mode, persisted in
 * `VisualConfig.config.compare.mode`. When set (and a date column is
 * mapped) the analytics service derives the prior-period series and the
 * absolute + percent delta against it.
 */
export type CompareMode = 'previous_period' | 'same_period_last_year' | null;

/** Measure-level comparison config on `VisualConfig.config.compare`. */
export interface CompareConfig {
  mode: CompareMode;
  /** Date/time column that orders the series into periods. */
  dateColumn?: string | null;
}

/** Analytics-related keys the analyses transform path reads off `config`. */
export interface VisualAnalyticsConfig {
  /** Per-measure quick calc, or null for raw values. */
  quickCalc?: QuickCalc;
  /** Window size (in points) for the moving-average quick calc. Default 3. */
  movingAverageWindow?: number;
  /** Period-over-period comparison. */
  compare?: CompareConfig;
}

/** The shaped point the chart transformers emit ({ name, value }). */
export interface Point {
  name: string;
  value: number;
}

/** A named comparison result for a KPI card or a compare badge. */
export interface ComparisonResult {
  /** Aggregate of the current (latest) period. */
  current: number;
  /** Aggregate of the prior period, or null when it can't be computed. */
  previous: number | null;
  /** current - previous, or null. */
  delta: number | null;
  /** (current - previous) / |previous| * 100, or null. */
  percentDelta: number | null;
}

/**
 * AnalysisAnalyticsService — pure, client-side analytics math for the
 * Analyses BI surface. No HTTP, no Angular DI beyond @Injectable so it
 * can be shared by the transformer, the KPI card and the sidebar.
 *
 * Every quick-calc takes an ORDERED numeric series (the caller decides
 * the order — usually the transform's category order) and returns a new
 * series of the same length. Functions are total: they never throw on
 * empty input, they just return [].
 */
@Injectable({ providedIn: 'root' })
export class AnalysisAnalyticsService {
  // ── Quick calcs (operate on the ordered numeric series) ──────────────

  /**
   * Running (cumulative) total: out[i] = sum(in[0..i]).
   */
  runningTotal(values: number[]): number[] {
    let acc = 0;
    return values.map(v => (acc += this.num(v)));
  }

  /**
   * Percent of grand total: out[i] = in[i] / sum(in) * 100.
   * Returns all zeros when the total is 0 (avoids divide-by-zero NaN).
   */
  percentOfTotal(values: number[]): number[] {
    const total = values.reduce((s, v) => s + this.num(v), 0);
    if (total === 0) return values.map(() => 0);
    return values.map(v => (this.num(v) / total) * 100);
  }

  /**
   * Period-to-period difference: out[i] = in[i] - in[i-1]. The first
   * point has no predecessor → 0.
   */
  difference(values: number[]): number[] {
    return values.map((v, i) =>
      i === 0 ? 0 : this.num(v) - this.num(values[i - 1]),
    );
  }

  /**
   * Percent difference vs the previous point:
   *   out[i] = (in[i] - in[i-1]) / |in[i-1]| * 100.
   * First point → 0; a zero predecessor → 0 (can't divide).
   */
  percentDifference(values: number[]): number[] {
    return values.map((v, i) => {
      if (i === 0) return 0;
      const prev = this.num(values[i - 1]);
      if (prev === 0) return 0;
      return ((this.num(v) - prev) / Math.abs(prev)) * 100;
    });
  }

  /**
   * Trailing moving average over `window` points (inclusive of the
   * current point). Window is clamped to [1, series length]. Each output
   * is the mean of the up-to-`window` points ending at i, so early points
   * average fewer samples rather than emitting nulls.
   */
  movingAverage(values: number[], window: number): number[] {
    const n = values.length;
    if (n === 0) return [];
    const w = Math.max(1, Math.min(Math.floor(window) || 1, n));
    return values.map((_, i) => {
      const start = Math.max(0, i - w + 1);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        sum += this.num(values[j]);
        count++;
      }
      return count > 0 ? sum / count : 0;
    });
  }

  /**
   * Dense rank (1 = largest value). Ties share a rank; the next distinct
   * value takes the immediately following rank (1,2,2,3 — dense). Output
   * stays in the INPUT order so it lines up with the category axis.
   */
  rank(values: number[]): number[] {
    const distinct = Array.from(new Set(values.map(v => this.num(v)))).sort(
      (a, b) => b - a,
    );
    const rankOf = new Map<number, number>();
    distinct.forEach((v, i) => rankOf.set(v, i + 1));
    return values.map(v => rankOf.get(this.num(v)) ?? 0);
  }

  /**
   * Apply a quick calc to a numeric series by identifier. Unknown / null
   * calc returns the input unchanged. Central dispatch so the transform
   * path and KPI card share one switch.
   */
  applyQuickCalcToValues(
    values: number[],
    calc: QuickCalc,
    movingAverageWindow = 3,
  ): number[] {
    switch (calc) {
      case 'running_total':
        return this.runningTotal(values);
      case 'percent_of_total':
        return this.percentOfTotal(values);
      case 'difference':
        return this.difference(values);
      case 'percent_difference':
        return this.percentDifference(values);
      case 'moving_average':
        return this.movingAverage(values, movingAverageWindow);
      case 'rank':
        return this.rank(values);
      default:
        return values;
    }
  }

  /**
   * Apply a quick calc to a shaped `{ name, value }[]` series, preserving
   * the point names and order. Returns a NEW array (never mutates input).
   */
  applyQuickCalcToPoints(
    points: Point[],
    calc: QuickCalc,
    movingAverageWindow = 3,
  ): Point[] {
    if (!calc || !Array.isArray(points) || points.length === 0) {
      return points;
    }
    const values = points.map(p => this.num(p?.value));
    const out = this.applyQuickCalcToValues(values, calc, movingAverageWindow);
    return points.map((p, i) => ({ name: p.name, value: out[i] ?? 0 }));
  }

  // ── Period-over-period ───────────────────────────────────────────────

  /**
   * Split an ordered series into a "current" tail and a "prior" head so
   * the two can be compared point-for-point.
   *
   * - previous_period: the prior HALF of the series is the comparison
   *   window and the latter HALF is the current window (equal split; when
   *   the length is odd the extra point goes to current).
   * - same_period_last_year: shift the whole series back by 12 points
   *   (a year of monthly buckets). Fewer than 13 points → no prior series.
   *
   * Returns { current, previous } where each is a `{ name, value }[]`
   * aligned by index. `previous` is [] when it can't be derived.
   */
  splitForCompare(
    points: Point[],
    mode: CompareMode,
  ): { current: Point[]; previous: Point[] } {
    if (!mode || !Array.isArray(points) || points.length === 0) {
      return { current: points ?? [], previous: [] };
    }
    if (mode === 'same_period_last_year') {
      const shift = 12;
      if (points.length <= shift) return { current: points, previous: [] };
      const current = points.slice(shift);
      const previous = points.slice(0, points.length - shift);
      return { current, previous };
    }
    // previous_period — equal split, current gets the odd extra.
    const half = Math.floor(points.length / 2);
    if (half === 0) return { current: points, previous: [] };
    const previous = points.slice(0, half);
    const current = points.slice(points.length - half);
    return { current, previous };
  }

  /**
   * Build a "delta" companion series (current - aligned prior) for a
   * compare-enabled time chart. Aligned by index; when the prior series
   * is shorter the leading current points get a 0 delta.
   */
  deltaSeries(current: Point[], previous: Point[]): Point[] {
    if (!Array.isArray(current) || current.length === 0) return [];
    const offset = current.length - previous.length;
    return current.map((p, i) => {
      const prevIdx = i - offset;
      const prev =
        prevIdx >= 0 && prevIdx < previous.length
          ? this.num(previous[prevIdx].value)
          : null;
      return {
        name: p.name,
        value: prev === null ? 0 : this.num(p.value) - prev,
      };
    });
  }

  /**
   * Compare two aggregate scalars into a { current, previous, delta,
   * percentDelta } bundle. Used by the KPI card badge. A zero or null
   * previous yields a null percentDelta (can't divide) but still reports
   * the absolute delta when previous is a real number.
   */
  compareScalars(current: number, previous: number | null): ComparisonResult {
    const cur = this.num(current);
    if (previous === null || previous === undefined) {
      return { current: cur, previous: null, delta: null, percentDelta: null };
    }
    const prev = this.num(previous);
    const delta = cur - prev;
    const percentDelta = prev === 0 ? null : (delta / Math.abs(prev)) * 100;
    return { current: cur, previous: prev, delta, percentDelta };
  }

  // ── Aggregation helpers (shared by the KPI card) ─────────────────────

  /**
   * Aggregate a measure column across raw rows using an aggregate fn.
   * Non-numeric cells contribute 0 (or are counted, for count fns).
   */
  aggregate(
    rows: any[],
    measure: string,
    fn: string,
  ): number {
    if (!Array.isArray(rows) || rows.length === 0 || !measure) return 0;
    const raw = rows.map(r => r?.[measure]);
    switch (fn) {
      case 'count':
        return raw.filter(v => v !== null && v !== undefined && v !== '')
          .length;
      case 'count_distinct':
        return new Set(
          raw.filter(v => v !== null && v !== undefined && v !== ''),
        ).size;
      case 'min': {
        const nums = raw.map(v => this.num(v));
        return nums.length ? Math.min(...nums) : 0;
      }
      case 'max': {
        const nums = raw.map(v => this.num(v));
        return nums.length ? Math.max(...nums) : 0;
      }
      case 'avg': {
        const nums = raw.map(v => this.num(v));
        return nums.length
          ? nums.reduce((s, v) => s + v, 0) / nums.length
          : 0;
      }
      case 'sum':
      default:
        return raw.reduce((s, v) => s + this.num(v), 0);
    }
  }

  /**
   * Build an ordered { name, value }[] trend for a KPI: group rows by the
   * date column, aggregate the measure per bucket, order buckets by their
   * (parsed) date ascending. When no date column is given, returns a
   * single point holding the grand aggregate.
   */
  buildTrend(
    rows: any[],
    measure: string,
    fn: string,
    dateColumn?: string | null,
  ): Point[] {
    if (!Array.isArray(rows) || rows.length === 0 || !measure) return [];
    if (!dateColumn) {
      return [{ name: measure, value: this.aggregate(rows, measure, fn) }];
    }
    // Group rows by the raw date-column value.
    const buckets = new Map<string, any[]>();
    rows.forEach(r => {
      const key = r?.[dateColumn];
      const k = key === null || key === undefined || key === '' ? '' : String(key);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    });
    const points = Array.from(buckets.entries()).map(([key, group]) => ({
      name: key,
      value: this.aggregate(group, measure, fn),
      sort: this.parseDate(key),
    }));
    points.sort((a, b) => a.sort - b.sort);
    return points.map(p => ({ name: p.name, value: p.value }));
  }

  /**
   * End-to-end KPI comparison: build the trend, split by compare mode,
   * aggregate each window (sum of the bucket aggregates for the current
   * vs prior windows) and diff them. Falls back to the latest-vs-previous
   * single points when the series is too short to split into windows.
   */
  computeKpiComparison(
    rows: any[],
    measure: string,
    fn: string,
    dateColumn: string | null | undefined,
    mode: CompareMode,
  ): ComparisonResult {
    const trend = this.buildTrend(rows, measure, fn, dateColumn);
    const current = this.aggregate(rows, measure, fn);
    if (!mode || trend.length < 2) {
      return { current, previous: null, delta: null, percentDelta: null };
    }
    const { current: curWin, previous: prevWin } = this.splitForCompare(
      trend,
      mode,
    );
    if (prevWin.length === 0) {
      return { current, previous: null, delta: null, percentDelta: null };
    }
    const curSum = curWin.reduce((s, p) => s + this.num(p.value), 0);
    const prevSum = prevWin.reduce((s, p) => s + this.num(p.value), 0);
    return this.compareScalars(curSum, prevSum);
  }

  // ── internal ─────────────────────────────────────────────────────────

  /** Coerce anything to a finite number (SQL numerics arrive as strings). */
  private num(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const parsed = parseFloat(String(value));
    return isFinite(parsed) ? parsed : 0;
  }

  /** Parse a bucket key to a sortable number (epoch ms, or +Inf fallback). */
  private parseDate(key: string): number {
    if (!key) return Number.POSITIVE_INFINITY;
    const t = Date.parse(key);
    if (!isNaN(t)) return t;
    // Non-date keys: fall back to a numeric parse, else lexical via charcodes.
    const n = Number(key);
    if (isFinite(n)) return n;
    return Number.POSITIVE_INFINITY;
  }
}
