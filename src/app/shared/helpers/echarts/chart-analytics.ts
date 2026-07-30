/* Extracted from echarts-option-builder.ts — chart-analytics chart builders. */

import {
  forecast,
  linearTrend,
  logTrend,
  movingAverage,
  polyTrend,
} from '../trend.helper';
import {
  applyDataLabelContent,
  applyPerFieldFormat,
  applyValueAxisScale,
  datumValue,
  isCartesianOption,
} from './chart-postprocess';
import {
  CHART_COLOR_STRONG,
} from './chart-primitives';
/** A single reference line spec authored in the Properties pane. */
export interface ReferenceLineSpec {
  /** Aggregate the line tracks, or 'constant' for a fixed value. */
  type?: 'constant' | 'average' | 'min' | 'max' | 'median' | 'percentile';
  /** Which axis the line is perpendicular to: value lines sit on 'y'. */
  axis?: 'x' | 'y';
  /** Fixed value for type='constant', or the P (0–100) for type='percentile'. */
  value?: number;
  label?: string;
  color?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}

/**
 * Flatten a transformed chart-data shape into a flat numeric sample. Handles
 * both the single-series `{name,value}[]` shape and the multi-series
 * `{name,series:[{name,value}]}[]` shape (and bare number arrays). Purely
 * structural — no domain assumptions — so computed reference lines work on any
 * measure. Non-finite entries are dropped.
 */

/**
 * Flatten a transformed chart-data shape into a flat numeric sample. Handles
 * both the single-series `{name,value}[]` shape and the multi-series
 * `{name,series:[{name,value}]}[]` shape (and bare number arrays). Purely
 * structural — no domain assumptions — so computed reference lines work on any
 * measure. Non-finite entries are dropped.
 */
export function extractNumericSample(data: any): number[] {
  const out: number[] = [];
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (row == null) continue;
    if (typeof row === 'number') {
      if (Number.isFinite(row)) out.push(row);
    } else if (Array.isArray((row as any).series)) {
      for (const pt of (row as any).series) {
        const v = pt && typeof pt === 'object' ? Number(pt.value) : Number(pt);
        if (Number.isFinite(v)) out.push(v);
      }
    } else if (typeof row === 'object' && 'value' in row) {
      const v = Number((row as any).value);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/**
 * Compute a statistic over a numeric sample, generalised for ANY column (no
 * domain assumptions). Used to resolve computed reference lines (median /
 * percentile) that ECharts' built-in markLine stat types don't cover — the
 * built-ins only offer average / min / max. Returns undefined when the sample
 * is empty so the caller can skip emitting a line.
 */

/**
 * Compute a statistic over a numeric sample, generalised for ANY column (no
 * domain assumptions). Used to resolve computed reference lines (median /
 * percentile) that ECharts' built-in markLine stat types don't cover — the
 * built-ins only offer average / min / max. Returns undefined when the sample
 * is empty so the caller can skip emitting a line.
 */
export function computeSeriesStat(
  values: number[],
  kind: 'median' | 'percentile',
  percentile?: number,
): number | undefined {
  const nums = (values || []).filter(n => Number.isFinite(n));
  if (nums.length === 0) return undefined;
  const sorted = [...nums].sort((a, b) => a - b);
  const p =
    kind === 'median'
      ? 50
      : Math.min(
          100,
          Math.max(
            0,
            Number.isFinite(percentile as number) ? (percentile as number) : 50,
          ),
        );
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}


export interface ReferenceBandSpec {
  axis?: 'x' | 'y';
  from?: number;
  to?: number;
  label?: string;
  color?: string;
  opacity?: number;
}


export interface AnnotationSpec {
  /** Data coordinate [x, y] OR a category name for x. */
  x?: number | string;
  y?: number;
  label?: string;
  color?: string;
  symbol?: string;
  symbolSize?: number;
}

/**
 * Build the series-level markLine / markArea / markPoint overlays from
 * config.referenceLines[], config.referenceBands[], config.annotations[].
 *
 * markLine supports ECharts' built-in statistical types ('average', 'min',
 * 'max') natively via `{ type }`; 'median' is not built in, so it is not
 * emitted as a stat line (the editor still offers 'average' which covers the
 * common central-tendency case). 'constant' emits a fixed `{ yAxis }` /
 * `{ xAxis }` line. Reference bands become paired markArea coordinates.
 * Annotations become markPoint items at explicit coordinates.
 */

/**
 * Sort + Top-N/Bottom-N. Reorders the category axis and realigns EVERY series'
 * data array to the new order. Sort key is the axis label ('axis') or the sum
 * of the series values at each category ('measure'). Top-N/Bottom-N then trims
 * to the N categories with the largest / smallest measure totals (independent
 * of the display sort). No-op when both controls are at their defaults.
 */
export function applySortAndLimit(option: any, config: any): void {
  if (!isCartesianOption(option)) return;
  const cats: any[] =
    option.xAxis && Array.isArray(option.xAxis.data) ? option.xAxis.data : [];
  if (cats.length === 0) return;
  const series: any[] = option.series || [];

  const sortBy = config?.sortBy;
  const limitMode = config?.limitMode;
  const sortActive = sortBy === 'axis' || sortBy === 'measure';
  const limitActive =
    (limitMode === 'top' || limitMode === 'bottom') &&
    Number(config?.limitN) > 0;
  if (!sortActive && !limitActive) return;

  // Per-category measure total across all series.
  const totals = cats.map((_, i) =>
    series.reduce((sum, s) => {
      const d = Array.isArray(s.data) ? s.data[i] : undefined;
      const v = datumValue(d);
      return sum + (isFinite(v) ? v : 0);
    }, 0),
  );

  // Build an index order.
  let order = cats.map((_, i) => i);
  const dir = config?.sortDir === 'asc' ? 1 : -1;
  if (sortBy === 'axis') {
    order.sort((a, b) => {
      const av = String(cats[a]);
      const bv = String(cats[b]);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  } else if (sortBy === 'measure') {
    order.sort((a, b) => (totals[a] - totals[b]) * dir);
  }

  // Top-N / Bottom-N by measure total (uses a dedicated ranking independent of
  // the display sort so "Top 5" always means the 5 largest).
  let otherIndices: number[] = [];
  if (limitActive) {
    const n = Math.max(1, Math.floor(Number(config.limitN)));
    const byMeasure = cats.map((_, i) => i);
    byMeasure.sort((a, b) => totals[b] - totals[a]); // desc
    const keep = new Set(
      limitMode === 'bottom' ? byMeasure.slice(-n) : byMeasure.slice(0, n),
    );
    // Remember the trimmed categories so we can roll them into "Other".
    otherIndices = order.filter(i => !keep.has(i));
    order = order.filter(i => keep.has(i));
  }

  // Apply the order to categories + every series' data array. Compute the
  // trailing "Other" sum per series from the ORIGINAL (pre-reorder) data so
  // the rollup is index-stable regardless of the display sort.
  const newCats = order.map(i => cats[i]);
  const wantOther =
    limitActive && config?.limitOther === true && otherIndices.length > 0;
  const otherLabel =
    typeof config?.otherLabel === 'string' && config.otherLabel.length
      ? config.otherLabel
      : 'Other';

  option.series = series.map(s => {
    if (!Array.isArray(s.data)) return { ...s, data: s.data };
    const reordered = order.map(i => s.data[i]);
    if (wantOther) {
      // Sum the trimmed rows for THIS series into a single "Other" datum
      // (generalised — any measure, no domain assumptions).
      const sum = otherIndices.reduce((acc, i) => {
        const v = datumValue(s.data[i]);
        return acc + (isFinite(v) ? v : 0);
      }, 0);
      reordered.push(sum);
    }
    return { ...s, data: reordered };
  });
  option.xAxis.data = wantOther ? [...newCats, otherLabel] : newCats;
}

/**
 * Stacking override: 'none' | 'stacked' | 'percent'. Overrides whatever the
 * chart-type variant produced so any bar/area/combo can be (100%-)stacked from
 * the Properties pane. 'percent' recomputes each datum as its share of the
 * per-category total across the stacked series. No-op at 'none'/unset.
 */

/**
 * Stacking override: 'none' | 'stacked' | 'percent'. Overrides whatever the
 * chart-type variant produced so any bar/area/combo can be (100%-)stacked from
 * the Properties pane. 'percent' recomputes each datum as its share of the
 * per-category total across the stacked series. No-op at 'none'/unset.
 */
export function applyStackingOverride(option: any, config: any): void {
  const mode = config?.stacking;
  if (mode !== 'stacked' && mode !== 'percent') return;
  if (!isCartesianOption(option)) return;
  const series: any[] = option.series || [];
  if (series.length === 0) return;

  if (mode === 'percent') {
    const len = Math.max(
      ...series.map(s => (Array.isArray(s.data) ? s.data.length : 0)),
    );
    const totals = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
      totals[i] = series.reduce((sum, s) => {
        const v = datumValue(Array.isArray(s.data) ? s.data[i] : 0);
        return sum + (isFinite(v) ? v : 0);
      }, 0);
    }
    option.series = series.map(s => ({
      ...s,
      stack: 'total',
      data: Array.isArray(s.data)
        ? s.data.map((d: any, i: number) => {
            const v = datumValue(d);
            return totals[i] ? +((v / totals[i]) * 100).toFixed(2) : 0;
          })
        : s.data,
    }));
    // Pin the value axis to 0–100 %.
    const yAxis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis;
    if (yAxis) {
      yAxis.max = 100;
      yAxis.axisLabel = { ...(yAxis.axisLabel || {}), formatter: '{value}%' };
    }
  } else {
    option.series = series.map(s => ({ ...s, stack: 'total' }));
  }
}

/**
 * Null handling: 'gap' (default — leave nulls as breaks), 'zero' (replace null
 * with 0), 'hide' (drop the datum → treated as a gap but also connectNulls off).
 * Applied across every series' data array. No-op at 'gap'/unset.
 */

/**
 * Null handling: 'gap' (default — leave nulls as breaks), 'zero' (replace null
 * with 0), 'hide' (drop the datum → treated as a gap but also connectNulls off).
 * Applied across every series' data array. No-op at 'gap'/unset.
 */
export function applyNullHandling(option: any, config: any): void {
  const mode = config?.nullHandling;
  if (mode !== 'zero' && mode !== 'hide') return;
  if (!isCartesianOption(option)) return;
  option.series = (option.series || []).map((s: any) => {
    if (!Array.isArray(s.data)) return s;
    const data = s.data.map((d: any) => {
      const isNull =
        d === null ||
        d === undefined ||
        (typeof d === 'object' && (d.value === null || d.value === undefined));
      if (!isNull) return d;
      return mode === 'zero' ? 0 : null;
    });
    return mode === 'hide'
      ? { ...s, data, connectNulls: false }
      : { ...s, data };
  });
}

/**
 * Value-axis scale + explicit min/max. 'log' switches yAxis.type to 'log'
 * (ECharts requires strictly positive data — falls back silently to linear when
 * any value is <= 0). Explicit yScaleMin / yScaleMax pin the domain. No-op when
 * everything is at its default.
 */

/**
 * Dual-axis: add a second (right) value axis and route the named series to
 * it, optionally switching a series' render type (bar/line) for a combo.
 * config.dualAxis = { series: [{ name, type?, yAxisIndex? }], rightAxisName? }.
 * No-op when config.dualAxis / its series list is absent/empty.
 */
export function applyDualAxis(option: any, config: any, chartType?: string): void {
  let cfg = config?.dualAxis;
  const isCombo = chartType === 'combo';

  // Combo charts always want a dual-axis layout. When the author hasn't set up
  // an explicit series map, synthesise a sensible default from the built
  // series: keep every series as a bar on the primary axis except the LAST,
  // which renders as a line on the secondary axis — the canonical
  // "bars + line" combo. Explicit config.dualAxis always overrides this.
  const haveExplicit =
    cfg && Array.isArray(cfg.series) && cfg.series.length > 0;
  if (!haveExplicit && isCombo && isCartesianOption(option)) {
    const built = option.series || [];
    if (built.length >= 1) {
      const lastName = String(built[built.length - 1]?.name ?? '');
      cfg = {
        rightAxisName: config?.dualAxis?.rightAxisName || '',
        series:
          built.length >= 2
            ? [{ name: lastName, type: 'line', yAxisIndex: 1 }]
            : [{ name: lastName, type: 'line', yAxisIndex: 0 }],
      };
    }
  }

  if (!cfg || !Array.isArray(cfg.series) || cfg.series.length === 0) return;
  if (!isCartesianOption(option)) return;

  // Promote the single value yAxis to an array with a mirrored right axis.
  const leftAxis = option.yAxis;
  const rightAxis = {
    ...leftAxis,
    name: cfg.rightAxisName || '',
    // The right axis gets its own scale; don't inherit the left's fixed min/max.
    min: undefined,
    max: undefined,
    splitLine: { show: false },
  };
  option.yAxis = [leftAxis, { ...rightAxis, position: 'right' }];

  const byName = new Map<string, any>();
  for (const entry of cfg.series) {
    if (entry && typeof entry.name === 'string') byName.set(entry.name, entry);
  }
  option.series = (option.series || []).map((sr: any) => {
    const entry = byName.get(sr.name);
    if (!entry) return { ...sr, yAxisIndex: 0 };
    return {
      ...sr,
      type:
        entry.type === 'bar' || entry.type === 'line' ? entry.type : sr.type,
      yAxisIndex: entry.yAxisIndex === 1 ? 1 : 0,
    };
  });
}

/**
 * Trend: append a computed overlay line series derived from the FIRST base
 * series' values. config.trend = { type, window?, forecastPeriods?,
 * seriesName? }. type 'none' (or absent) is a no-op.
 *   - linear         → least-squares regression line over the series.
 *   - movingAverage  → trailing SMA with `window` (default 3).
 *   - forecast       → regression line projected `forecastPeriods` steps
 *                       past the last category (extends xAxis.data too).
 */

/**
 * Trend: append a computed overlay line series derived from the FIRST base
 * series' values. config.trend = { type, window?, forecastPeriods?,
 * seriesName? }. type 'none' (or absent) is a no-op.
 *   - linear         → least-squares regression line over the series.
 *   - movingAverage  → trailing SMA with `window` (default 3).
 *   - forecast       → regression line projected `forecastPeriods` steps
 *                       past the last category (extends xAxis.data too).
 */
export function applyTrend(option: any, config: any): void {
  const cfg = config?.trend;
  if (!cfg || !cfg.type || cfg.type === 'none') return;
  if (!isCartesianOption(option)) return;
  const base = (option.series || [])[0];
  if (!base || !Array.isArray(base.data) || base.data.length === 0) return;

  // Series data can be bare numbers or { value } points (conditional
  // formatting wraps them). Normalise to a numeric array for the maths.
  const values: Array<number | null> = base.data.map((d: any) =>
    d && typeof d === 'object' && 'value' in d ? Number(d.value) : Number(d),
  );

  let overlay: Array<number | null> = [];
  let name = cfg.seriesName || 'Trend';
  if (cfg.type === 'linear') {
    overlay = linearTrend(values);
  } else if (cfg.type === 'log') {
    overlay = logTrend(values);
  } else if (cfg.type === 'poly') {
    overlay = polyTrend(values, cfg.degree || 2);
  } else if (cfg.type === 'movingAverage') {
    overlay = movingAverage(values, cfg.window || 3);
  } else if (cfg.type === 'forecast') {
    const periods = cfg.forecastPeriods || 3;
    overlay = forecast(values, periods);
    // Extend the category axis with projected placeholders so the tail
    // has x positions to land on.
    if (option.xAxis && Array.isArray(option.xAxis.data)) {
      const start = option.xAxis.data.length;
      for (let i = 0; i < periods; i++) {
        option.xAxis.data = [...option.xAxis.data, `+${i + 1}`];
      }
      // Right-pad every existing series so lengths stay aligned.
      option.series = (option.series || []).map((sr: any) =>
        Array.isArray(sr.data)
          ? { ...sr, data: [...sr.data, ...new Array(periods).fill(null)] }
          : sr,
      );
    }
  } else {
    return;
  }

  option.series = [
    ...(option.series || []),
    {
      name,
      type: 'line',
      data: overlay,
      smooth: true,
      symbol: 'none',
      lineStyle: { type: 'dashed', width: 2 },
      // Dashed overlay rides the left axis by default; harmless when the
      // chart has no second axis (yAxisIndex 0 always exists).
      yAxisIndex: 0,
      z: 5,
      silent: true,
    },
  ];
}

/**
 * Small-multiples (facet): split a multi-series cartesian option into a
 * grid of sub-charts, one per series. config.smallMultiples = { facetColumn?,
 * maxCols? }. The transformed shape already carries one series per facet
 * value, so each series becomes its own grid cell sharing the category axis.
 * No-op when disabled or when there is <=1 series to facet.
 */

/**
 * Small-multiples (facet): split a multi-series cartesian option into a
 * grid of sub-charts, one per series. config.smallMultiples = { facetColumn?,
 * maxCols? }. The transformed shape already carries one series per facet
 * value, so each series becomes its own grid cell sharing the category axis.
 * No-op when disabled or when there is <=1 series to facet.
 */
export function applySmallMultiples(option: any, config: any): void {
  const cfg = config?.smallMultiples;
  const enabled =
    cfg &&
    (cfg.enabled === true || cfg.facetColumn) &&
    !Array.isArray(option.yAxis);
  if (!enabled) return;
  if (!isCartesianOption(option)) return;
  const series = option.series || [];
  if (series.length <= 1) return;

  const maxCols = Math.max(1, Math.min(6, Math.floor(cfg.maxCols || 2)));
  const count = series.length;
  const cols = Math.min(maxCols, count);
  const rows = Math.ceil(count / cols);

  const categories =
    option.xAxis && Array.isArray(option.xAxis.data) ? option.xAxis.data : [];
  const baseX = option.xAxis || { type: 'category' };
  const baseY = option.yAxis || { type: 'value' };

  const grids: any[] = [];
  const xAxes: any[] = [];
  const yAxes: any[] = [];
  const gapPct = 6;
  const cellW = (100 - gapPct * (cols + 1)) / cols;
  const cellH = (100 - gapPct * (rows + 1)) / rows;

  const newSeries = series.map((sr: any, idx: number) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const left = gapPct + c * (cellW + gapPct);
    const top = gapPct + r * (cellH + gapPct);
    grids.push({
      left: `${left}%`,
      top: `${top}%`,
      width: `${cellW}%`,
      height: `${cellH}%`,
      containLabel: true,
    });
    xAxes.push({ ...baseX, gridIndex: idx, data: categories });
    yAxes.push({ ...baseY, gridIndex: idx });
    return {
      ...sr,
      xAxisIndex: idx,
      yAxisIndex: idx,
    };
  });

  option.grid = grids;
  option.xAxis = xAxes;
  option.yAxis = yAxes;
  option.series = newSeries;
  // A per-facet title band reads cleaner than one shared legend.
  option.title = grids.map((g: any, idx: number) => ({
    text: String(series[idx].name ?? ''),
    left: g.left,
    top: `calc(${g.top} - 2%)`,
    textStyle: { fontSize: 12, fontWeight: 600, color: CHART_COLOR_STRONG },
  }));
  option.legend = { show: false };
}

/**
 * Apply the cartesian analytics pass in a fixed order: dual-axis first (it
 * defines the axis array), then trend (appends a series that should ride an
 * existing axis), then small-multiples last (it re-shapes axes into a grid
 * array and would otherwise clobber the dual-axis work — the two are
 * mutually exclusive in the authoring UI, but ordering keeps it safe).
 */

/**
 * Apply the cartesian analytics pass in a fixed order: dual-axis first (it
 * defines the axis array), then trend (appends a series that should ride an
 * existing axis), then small-multiples last (it re-shapes axes into a grid
 * array and would otherwise clobber the dual-axis work — the two are
 * mutually exclusive in the authoring UI, but ordering keeps it safe).
 */
export function applyCartesianAnalytics(
  option: any,
  config: any,
  chartType: string,
): any {
  // combo + histogram are cartesian bar-family variants and get the same
  // analytics pass (dual-axis / trend / small-multiples).
  const CARTESIAN = /^(bar-|line|area|combo|histogram)/;
  if (!CARTESIAN.test(chartType)) return option;
  if (!option || typeof option !== 'object') return option;
  try {
    // Per-visual controls (Slice C) run first — while the option still has the
    // single-grid shape (plain xAxis / yAxis objects). They reshape data
    // (sort / limit / null / stacking) and decorate axes/labels/tooltips
    // (scale / format / label-content).
    applySortAndLimit(option, config);
    applyNullHandling(option, config);
    applyStackingOverride(option, config);
    applyDataLabelContent(option, config);
    applyValueAxisScale(option, config);
    applyPerFieldFormat(option, config);
    // Then the structural analytics (Track E1): dual-axis first (defines the
    // axis array), trend next (appends a series), small-multiples last
    // (re-shapes axes into a grid).
    applyDualAxis(option, config, chartType);
    applyTrend(option, config);
    applySmallMultiples(option, config);
  } catch {
    // Analytics are additive polish — never let a malformed config blank
    // the whole chart. Fall back to the un-decorated option.
  }
  return option;
}

/**
 * Unified dispatcher — routes chartType to the correct build function.
 * Handles node+link charts (sankey, graph, etc.), typed charts (bar, line, etc.),
 * and simple (data, config) charts.
 */
