/**
 * trend.helper.ts — pure, framework-free trend/analytics maths.
 *
 * These functions turn a numeric value series into a derived overlay
 * series (regression line, moving average, forecast tail). They are
 * consumed by the ECharts option builder's trend wiring (Track E1) and
 * are deliberately dependency-free so they stay unit-testable and
 * reusable.
 *
 * Convention: an input series is a plain number[] indexed by category
 * position (x = 0, 1, 2, …). Nulls / NaNs are treated as gaps and
 * skipped when fitting, but the returned overlay is index-aligned with
 * the source so ECharts can plot it against the same category axis.
 */

/** A fitted 2D line: y = slope · x + intercept. */
export interface LinearFit {
  slope: number;
  intercept: number;
}

/** One (x, y) sample used when fitting a regression. */
export interface Point {
  x: number;
  y: number;
}

/** Coerce an arbitrary cell to a finite number, or null for a gap. */
function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || (v as any) === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ordinary least-squares fit over the supplied points. Returns a
 * { slope, intercept } line. When fewer than two points are usable
 * (or all x are identical) the slope collapses to 0 and the intercept
 * becomes the mean y — a flat line — so downstream never divides by
 * zero or emits NaN.
 */
export function linearRegression(points: Point[]): LinearFit {
  const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: pts[0].y };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    // All x identical → no meaningful slope. Flat line at mean y.
    return { slope: 0, intercept: sumY / n };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Fit a straight line through values (indexed 0..n-1) and evaluate it at
 * every index, returning an index-aligned overlay series. Gaps in the
 * source (null/NaN) are excluded from the fit but the returned line
 * still has a value at every position (the regression is defined
 * everywhere).
 */
export function linearTrend(
  values: Array<number | null | undefined>,
): number[] {
  const points: Point[] = [];
  values.forEach((v, i) => {
    const y = toFinite(v);
    if (y !== null) points.push({ x: i, y });
  });
  const { slope, intercept } = linearRegression(points);
  return values.map((_, i) => slope * i + intercept);
}

/**
 * Logarithmic trend: fit y = a·ln(x) + b (least squares on ln(x)). x is the
 * 1-based category index (ln(0) is undefined, so we shift by 1). Returns an
 * index-aligned overlay. Falls back to a flat mean line when there are fewer
 * than two usable points.
 */
export function logTrend(values: Array<number | null | undefined>): number[] {
  const points: Point[] = [];
  values.forEach((v, i) => {
    const y = toFinite(v);
    if (y !== null) points.push({ x: Math.log(i + 1), y });
  });
  const { slope, intercept } = linearRegression(points);
  return values.map((_, i) => slope * Math.log(i + 1) + intercept);
}

/**
 * Polynomial trend of the given degree (2 = quadratic, 3 = cubic, …) fitted by
 * ordinary least squares over the Vandermonde system, solved with
 * Gauss-Jordan elimination. Degree is clamped to [2, 6] and to (usable
 * points − 1) so the system stays determined. Returns an index-aligned
 * overlay; on a singular/underdetermined system it degrades to a linear fit.
 */
export function polyTrend(
  values: Array<number | null | undefined>,
  degree: number,
): number[] {
  const pts: Point[] = [];
  values.forEach((v, i) => {
    const y = toFinite(v);
    if (y !== null) pts.push({ x: i, y });
  });
  const n = pts.length;
  const deg = Math.max(
    2,
    Math.min(6, Math.min(Math.floor(degree || 2), n - 1)),
  );
  if (n < 3 || deg < 2) {
    // Not enough spread for a curve — fall back to the straight-line fit.
    return linearTrend(values);
  }

  // Normal equations: (Xᵀ X) c = Xᵀ y, where X is the Vandermonde matrix.
  const m = deg + 1;
  const ata: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const aty: number[] = new Array(m).fill(0);
  for (const p of pts) {
    const powers: number[] = [1];
    for (let k = 1; k < m; k++) powers[k] = powers[k - 1] * p.x;
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) ata[r][c] += powers[r] * powers[c];
      aty[r] += powers[r] * p.y;
    }
  }

  const coeffs = solveLinearSystem(ata, aty);
  if (!coeffs) return linearTrend(values);

  return values.map((_, i) => {
    let y = 0;
    let xp = 1;
    for (let k = 0; k < m; k++) {
      y += coeffs[k] * xp;
      xp *= i;
    }
    return y;
  });
}

/**
 * Gauss-Jordan solve of A·x = b for a small square system. Returns null when
 * the matrix is singular (near-zero pivot) so callers can fall back.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Augmented matrix.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

/**
 * Trailing simple moving average over values with the given window.
 * Position i averages the up-to-window most recent non-gap values ending
 * at i (inclusive). Positions with no usable value in range emit null so
 * ECharts renders a break rather than a spurious zero.
 *
 * A window <= 1 is a pass-through (each point averages only itself),
 * which keeps the caller from having to special-case tiny windows.
 */
export function movingAverage(
  values: Array<number | null | undefined>,
  window: number,
): Array<number | null> {
  const w = Math.max(1, Math.floor(window || 1));
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) {
      const n = toFinite(values[j]);
      if (n !== null) {
        sum += n;
        count += 1;
      }
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
}

/**
 * Linear-regression forecast. Fits a line over the existing values then
 * extends it periods steps beyond the last index. Returns an array of
 * length values.length + periods:
 *   - historical positions carry null (so the forecast series only draws
 *     its projected tail and doesn't double-plot the actuals), and
 *   - the last actual position + the projected periods carry the fitted
 *     line values (anchoring the tail to the series so it connects).
 *
 * periods <= 0 returns an all-null, source-length array (no-op tail).
 */
export function forecast(
  values: Array<number | null | undefined>,
  periods: number,
): Array<number | null> {
  const p = Math.max(0, Math.floor(periods || 0));
  const n = values.length;
  const points: Point[] = [];
  values.forEach((v, i) => {
    const y = toFinite(v);
    if (y !== null) points.push({ x: i, y });
  });
  const { slope, intercept } = linearRegression(points);

  const out: Array<number | null> = new Array(n + p).fill(null);
  if (p === 0) return out;

  // Anchor at the last historical index so the tail visually connects to
  // the actual series, then project forward.
  const anchor = n - 1;
  for (let i = Math.max(0, anchor); i < n + p; i++) {
    out[i] = slope * i + intercept;
  }
  return out;
}
