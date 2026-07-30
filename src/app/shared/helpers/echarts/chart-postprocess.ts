/* Extracted from echarts-option-builder.ts — chart-postprocess chart builders. */

import {
  ConditionalRule,
  resolveConditionalStyle,
} from '../conditional-formatting.helper';
import {
  buildAreaChartOption,
  buildBarChartOption,
  buildComboChartOption,
  buildHistogramChartOption,
  buildLineChartOption,
  buildPictorialBarChartOption,
  buildScatterChartOption,
  buildWaterfallChartOption,
} from './cartesian-basic';
import {
  buildBoxPlotChartOption,
  buildBumpChartOption,
  buildClevelandDotChartOption,
  buildCyclePlotOption,
  buildDumbbellChartOption,
  buildLollipopChartOption,
  buildMarimekkoOption,
  buildParetoChartOption,
  buildPolarBarChartOption,
  buildSlopeChartOption,
} from './cartesian-derived';
import {
  applyDualAxis,
} from './chart-analytics';
import {
  CF_CHART_SURFACES,
  CHART_TYPOGRAPHY,
  buildValueAxis,
  makeGradient,
} from './chart-primitives';
import {
  buildBubbleMapOption,
  buildChoroplethOption,
  buildFlowGLChartOption,
  buildFlowLinesChartOption,
  buildPointMapOption,
  buildWorldMapChartOption,
} from './geo';
import {
  buildBar3DChartOption,
  buildGlobeChartOption,
  buildGraphGLChartOption,
  buildLine3DChartOption,
  buildLines3DChartOption,
  buildLinesGLChartOption,
  buildMap3DChartOption,
  buildPolygons3DChartOption,
  buildScatter3DChartOption,
  buildScatterGLChartOption,
  buildSurfaceChartOption,
} from './gl-3d';
import {
  buildArcChartOption,
  buildChordChartOption,
  buildGraphChartOption,
  buildNetworkChartOption,
  buildTreeChartOption,
} from './graph';
import {
  buildFunnelChartOption,
  buildPieChartOption,
  buildRadialBarChartOption,
  buildSankeyChartOption,
  buildStreamgraphOption,
  buildSunburstChartOption,
  buildThemeRiverChartOption,
  buildTreeMapChartOption,
  buildWindRoseChartOption,
} from './part-to-whole';
import {
  buildBubbleChartOption,
  buildBulletChartOption,
  buildCalendarHeatmapOption,
  buildCandlestickChartOption,
  buildDensityStubOption,
  buildEcdfStubOption,
  buildGaugeChartOption,
  buildHeatMapChartOption,
  buildHexbinStubOption,
  buildKpiDeltaOption,
  buildParallelChartOption,
  buildPolarChartOption,
  buildQqPlotStubOption,
  buildRadarChartOption,
  buildRidgelineStubOption,
  buildViolinStubOption,
} from './statistical';
/**
 * Apply gradient colors to series when config.gradient is true.
 * Mutates the series array in place.
 */
export function applyGradient(
  series: any[],
  colors: string[],
  direction: 'vertical' | 'horizontal' = 'vertical',
): void {
  series.forEach((s: any, i: number) => {
    if (!s.itemStyle) s.itemStyle = {};
    s.itemStyle.color = makeGradient(colors[i % colors.length], direction);
  });
}


/**
 * Format a value the way the tooltip should display it. Honours the
 * user's "Value Precision" setting (config.tooltipPrecision, 0–6).
 * Non-numeric / non-finite values pass through untouched so string
 * labels render as-is. Callers that build a custom `tooltip.formatter`
 * MUST route numeric values through this helper — ECharts' built-in
 * `valueFormatter` is only consulted by the DEFAULT renderer and is
 * skipped when a chart supplies its own formatter function.
 *
 * Exported so other files can reuse the same rounding rule if they
 * ever assemble tooltips off the main builder path (none today, but
 * cheap insurance).
 */
export function formatTooltipValue(config: any, value: any): any {
  // Explicit precision wins — round to exactly N decimals.
  if (typeof config.tooltipPrecision === 'number') {
    if (typeof value === 'number' && isFinite(value)) {
      return value.toFixed(config.tooltipPrecision);
    }
    if (typeof value === 'string' && value !== '') {
      const n = Number(value);
      if (isFinite(n)) return n.toFixed(config.tooltipPrecision);
    }
    return value;
  }
  // No explicit precision: market-grade default — group with thousands
  // separators and cap runaway float decimals (SUM(longitude) gives
  // "-34321.44097199956"; a tooltip should read "-34,321.44"). Integers stay
  // integers. Non-numeric values (categories) pass through untouched.
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value !== ''
        ? Number(value)
        : NaN;
  if (isFinite(n)) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value;
}


/**
 * Map a data array to conditionally-coloured points. Each element may be a
 * bare number, a `{ value }` object, or an `{ name, value }` object; the
 * matched rule's colour is merged into `itemStyle.color` while preserving any
 * existing itemStyle. Non-matching points are returned UNCHANGED so the base
 * palette / gradient still applies.
 *
 * `rows` (optional, parallel to dataPoints) supplies whole-row context so a
 * rule can colour a bar by a *different* field than the one plotted.
 * `valueField` names the plotted measure so a rule with no targetField tests
 * the right value.
 */
export function applyConditionalFormatting(
  dataPoints: any[],
  config: any,
  rows?: any[],
  valueField?: string,
): any[] {
  const rules: ConditionalRule[] = Array.isArray(config?.conditionalFormatting)
    ? config.conditionalFormatting
    : [];
  if (rules.length === 0 || !Array.isArray(dataPoints)) return dataPoints;

  return dataPoints.map((pt, i) => {
    // Extract the scalar the rule tests + carry the existing shape forward.
    const isObj = pt !== null && typeof pt === 'object' && !Array.isArray(pt);
    const rawValue = isObj ? (pt as any).value : pt;
    const row: Record<string, any> | undefined = rows?.[i]
      ? rows[i]
      : valueField && rawValue !== undefined
        ? { [valueField]: rawValue }
        : undefined;

    const match = resolveConditionalStyle(
      rules,
      rawValue,
      row,
      CF_CHART_SURFACES,
    );
    if (!match || !match.color) return pt;

    // Promote to an object datum carrying itemStyle.color.
    const baseItemStyle = isObj ? (pt as any).itemStyle || {} : {};
    const merged: any = {
      ...(isObj ? pt : { value: pt }),
      itemStyle: { ...baseItemStyle, color: match.color },
    };
    return merged;
  });
}


export function buildCategoryAxis(
  config: any,
  categories: string[],
  axis: 'x' | 'y',
): any {
  const isX = axis === 'x';
  // `show` (hide the whole axis) and tick rotation stay keyed to the PHYSICAL
  // axis — the "Show X/Y Axis" toggles act on screen position.
  const showAxis = isX ? config.xAxis !== false : config.yAxis !== false;
  // The axis NAME follows the data ROLE, not the physical position. This is
  // the category axis, so it always carries the category-role label
  // (the UI's X-Axis field) gated by Show X Axis Name — otherwise a
  // horizontal bar (category on the Y axis) showed the value label "Value"
  // over the category axis and vice-versa (names were swapped).
  const showLabel = config.showXAxisLabel;
  // Auto-derived axis name (field name / "<agg> of <field>") stamped by the
  // editor onto config._xAxisFieldLabel. The author's explicit label always
  // wins; the derived name is the fallback so a fresh chart reads "sex"
  // instead of the literal placeholder "Category". Empty string when there is
  // no field — never a hardcoded literal.
  const label = config.xAxisLabel || config._xAxisFieldLabel || '';

  // nameGap positions the axis name relative to the axis line.
  // ECharts does NOT measure rotated label height into nameGap, so a
  // 90° rotation makes labels grow downward but the name stays glued
  // to the axis — landing AMONG the tick labels. Grow the gap with
  // rotation: vertical (90°) labels need roughly max-label-width worth
  // of space below the axis line. Approx 7px per character; cap at
  // 110px so the name doesn't push off the card. Horizontal (0°)
  // labels keep the compact default. The factor sin(angle) interpolates
  // smoothly between the two extremes (≈0.87 at 60°, 1.0 at 90°).
  //
  // `xAxisLabelRotate` is named after the UI control ("X Label Rotation"),
  // but its semantic intent is to rotate the *category* labels — they're
  // the ones that get long and need angling. For a horizontal bar the
  // category axis is physical-Y, so honour the rotation there too;
  // value-axis numbers never rotate (handled in buildValueAxis).
  const rot = config.xAxisLabelRotate || 0;
  let isLabelGap = 28;
  if (isX && rot > 15 && (categories || []).length) {
    const maxLen = Math.max(
      ...categories.map(c => (c == null ? 0 : String(c).length)),
    );
    const rotated = Math.min(maxLen * 7, 110) * Math.sin((rot * Math.PI) / 180);
    isLabelGap = Math.round(28 + rotated);
  }
  const nameGap = isX ? isLabelGap : 55;

  const result: any = {
    type: 'category',
    data: categories,
    show: showAxis,
    name: showLabel ? label : '',
    nameLocation: 'middle',
    nameGap,
    nameTextStyle: {
      ...CHART_TYPOGRAPHY.axisName,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    boundaryGap: config.boundaryGap !== false,
    axisTick: {
      alignWithLabel: true,
      lineStyle: { color: CHART_TYPOGRAPHY.colors.axis },
    },
    axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    axisLabel: {
      // Always rotate category labels (regardless of physical X vs Y).
      // See nameGap comment above for the why.
      rotate: config.xAxisLabelRotate || 0,
      overflow: (isX ? config.trimXAxisTicks : config.trimYAxisTicks)
        ? 'truncate'
        : 'none',
      width:
        ((isX ? config.maxXAxisTickLength : config.maxYAxisTickLength) || 16) *
        7,
      ...CHART_TYPOGRAPHY.axisLabel,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    splitLine: {
      show: config.showGridLines !== false,
      lineStyle: {
        type: config.gridLineStyle || 'dashed',
        color: CHART_TYPOGRAPHY.colors.grid,
      },
    },
  };
  // Bar gap properties — set on category axis for reliable effect
  if (config.barCategoryGap != null && config.barCategoryGap !== '') {
    result.barCategoryGap = config.barCategoryGap;
  }
  // Always stamp `inverse` explicitly (true OR false). Chart updates go
  // through setOption(opt, false) (merge mode), so omitting the key when
  // the toggle is off leaves ECharts holding the previous `inverse: true`
  // — the axis would flip on but never flip back. Coercing to a boolean
  // every render makes the toggle fully two-way.
  result.inverse = isX ? !!config.inverseX : !!config.inverseY;
  return result;
}

/**
 * Compact abbreviation for a value-axis tick when the author hasn't set an
 * explicit number format. Large magnitudes read far better abbreviated
 * (5,000,000 → "5M", 1,200 → "1.2K") than as long grouped integers — this is
 * the market-grade default a real BI tool applies to measure axes. Small
 * magnitudes (< 1000) and non-finite values fall back to locale grouping so
 * they read naturally. GENERALISED: no unit/currency assumption — a user who
 * wants "$1.2M" sets an explicit currency format, which applyPerFieldFormat
 * layers on top (replacing this default formatter entirely).
 */

// Convert multi-series data to categories + series list
export function convertMultiSeries(data: any[]): {
  categories: string[];
  seriesList: { name: string; values: number[] }[];
} {
  if (!data || data.length === 0) return { categories: [], seriesList: [] };
  const categorySet = new Set<string>();
  data.forEach(group => {
    if (group.series) {
      group.series.forEach((item: any) => categorySet.add(String(item.name)));
    }
  });
  const categories = Array.from(categorySet);
  const seriesList = data.map(group => {
    const valueMap = new Map<string, number>();
    if (group.series) {
      group.series.forEach((item: any) =>
        valueMap.set(String(item.name), item.value),
      );
    }
    return {
      name: String(group.name),
      values: categories.map(cat => valueMap.get(cat) || 0),
    };
  });
  return { categories, seriesList };
}

// ========= Common: Toolbox =========

/** Coerce a datum to { name, value } regardless of incoming shape. */
export function toNameValue(d: any): { name: string; value: number } {
  if (d && typeof d === 'object') {
    return {
      name: String(d.name ?? d.label ?? ''),
      value: typeof d.value === 'number' ? d.value : Number(d.value) || 0,
    };
  }
  return { name: '', value: Number(d) || 0 };
}

/** Flatten a possibly-multi-series payload to a single { name, value }[]. */

/** Flatten a possibly-multi-series payload to a single { name, value }[]. */
export function flattenToSingleSeries(data: any[]): { name: string; value: number }[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const first = data[0];
  // Multi-series shape → take the first series' points.
  if (first && typeof first === 'object' && Array.isArray(first.series)) {
    return (first.series || []).map(toNameValue);
  }
  return data.map(toNameValue);
}

/**
 * Empty-state option: a centred message on an otherwise blank chart. Used for
 * builders whose data must be pre-binned upstream (the transformer) before a
 * faithful chart can be drawn. Renders through the standard `graphic` text
 * element so it themes with the rest of the app and never throws.
 */

export type NodeLinkBuilder = (nodes: any[], links: any[], config: any) => any;

export type DataConfigBuilder = (data: any[], config: any) => any;

export type DataConfigTypeBuilder = (
  data: any[],
  config: any,
  chartType: string,
) => any;


export const NODE_LINK_BUILDERS: Record<string, NodeLinkBuilder> = {
  sankey: buildSankeyChartOption,
  graph: buildGraphChartOption,
  graphgl: buildGraphGLChartOption,
  'flow-lines': buildFlowLinesChartOption,
  // Wave 4 relationship graphs (node+link, distinct layouts).
  arc: buildArcChartOption,
  chord: buildChordChartOption,
  network: buildNetworkChartOption,
};


export const CHART_TYPE_BUILDERS: Record<string, DataConfigTypeBuilder> = {
  'bar-vertical': buildBarChartOption,
  'bar-horizontal': buildBarChartOption,
  'bar-vertical-2d': buildBarChartOption,
  'bar-horizontal-2d': buildBarChartOption,
  'bar-vertical-stacked': buildBarChartOption,
  'bar-horizontal-stacked': buildBarChartOption,
  'bar-vertical-normalized': buildBarChartOption,
  'bar-horizontal-normalized': buildBarChartOption,
  line: buildLineChartOption,
  'line-stacked': buildLineChartOption,
  'line-step': buildLineChartOption,
  area: buildAreaChartOption,
  'area-stacked': buildAreaChartOption,
  'area-normalized': buildAreaChartOption,
  // Combo (bars + line, dual-axis) and histogram (auto-binned bars) both build
  // on the bar option path; combo additionally runs through applyDualAxis to
  // switch per-series render type / axis. See buildComboChartOption /
  // buildHistogramChartOption below.
  combo: buildComboChartOption,
  histogram: buildHistogramChartOption,
  pie: buildPieChartOption,
  'pie-advanced': buildPieChartOption,
  'pie-grid': buildPieChartOption,
  donut: buildPieChartOption,
  'half-donut': buildPieChartOption,
  'nested-pie': buildPieChartOption,
  rose: buildPieChartOption,
  scatter: buildScatterChartOption,
  'effect-scatter': buildScatterChartOption,
  gauge: (d, c, _t) => buildGaugeChartOption(d, c),
  'linear-gauge': (d, c, _t) => buildGaugeChartOption(d, c),
};


export const SIMPLE_BUILDERS: Record<string, DataConfigBuilder> = {
  polar: buildPolarChartOption,
  'heat-map': buildHeatMapChartOption,
  'tree-map': buildTreeMapChartOption,
  bubble: buildBubbleChartOption,
  'box-chart': buildBoxPlotChartOption,
  funnel: buildFunnelChartOption,
  sunburst: buildSunburstChartOption,
  waterfall: buildWaterfallChartOption,
  tree: buildTreeChartOption,
  'theme-river': buildThemeRiverChartOption,
  'pictorial-bar': buildPictorialBarChartOption,
  'bar-polar': buildPolarBarChartOption,
  radar: buildRadarChartOption,
  candlestick: buildCandlestickChartOption,
  parallel: buildParallelChartOption,
  bar3d: buildBar3DChartOption,
  line3d: buildLine3DChartOption,
  scatter3d: buildScatter3DChartOption,
  surface: buildSurfaceChartOption,
  globe: buildGlobeChartOption,
  scattergl: buildScatterGLChartOption,
  linesgl: buildLinesGLChartOption,
  map3d: buildMap3DChartOption,
  'world-map': buildWorldMapChartOption,
  flowgl: buildFlowGLChartOption,
  lines3d: buildLines3DChartOption,
  polygons3d: buildPolygons3DChartOption,

  // ══ Wave 4 additions ══════════════════════════════════════════════════
  // Geo (data-bound). world-map now delegates to the choropleth path too.
  choropleth: buildChoroplethOption,
  'point-map': buildPointMapOption,
  'bubble-map': buildBubbleMapOption,
  // Statistical / comparison (fully implemented).
  bullet: buildBulletChartOption,
  'kpi-delta': buildKpiDeltaOption,
  pareto: buildParetoChartOption,
  lollipop: buildLollipopChartOption,
  'cleveland-dot': buildClevelandDotChartOption,
  dumbbell: buildDumbbellChartOption,
  slope: buildSlopeChartOption,
  bump: buildBumpChartOption,
  'radial-bar': buildRadialBarChartOption,
  'wind-rose': buildWindRoseChartOption,
  'calendar-heatmap': buildCalendarHeatmapOption,
  streamgraph: buildStreamgraphOption,
  marimekko: buildMarimekkoOption,
  'cycle-plot': buildCyclePlotOption,
  // solid-gauge reuses the existing gauge builder (filled-arc via config).
  'solid-gauge': (d: any[], c: any) =>
    buildGaugeChartOption(d, { ...c, gaugeStyle: c.gaugeStyle || 'solid' }),
  // Statistical-binning stubs — clear empty-state; need transformer support.
  violin: buildViolinStubOption,
  density: buildDensityStubOption,
  ridgeline: buildRidgelineStubOption,
  hexbin: buildHexbinStubOption,
  'qq-plot': buildQqPlotStubOption,
  ecdf: buildEcdfStubOption,
};

// ========= Chart analytics (Track E1): dual-axis / trend / small-multiples =========
//
// These post-process a built cartesian option (bar / line / area). Each is a
// strict NO-OP when its config key is absent, so existing charts render byte-
// identically. They read the transformed shape the builders already produced:
// option.series[i] = { name, type, data: number[] }, option.xAxis.data =
// category names. Non-cartesian charts (pie, gauge, geo, …) skip this pass.

/**
 * True only for a fresh single-grid cartesian option: a category X axis, a
 * value Y axis (both plain objects, not arrays), and a series array. Once a
 * pass has promoted the axes to arrays (dual-axis / small-multiples) this
 * returns false, so a second decorator won't re-wrap an already-decorated
 * option.
 */

/**
 * True only for a fresh single-grid cartesian option: a category X axis, a
 * value Y axis (both plain objects, not arrays), and a series array. Once a
 * pass has promoted the axes to arrays (dual-axis / small-multiples) this
 * returns false, so a second decorator won't re-wrap an already-decorated
 * option.
 */
export function isCartesianOption(option: any): boolean {
  if (!option) return false;
  if (Array.isArray(option.xAxis) || Array.isArray(option.yAxis)) return false;
  const x = option.xAxis;
  const y = option.yAxis;
  const hasCat = x && x.type === 'category';
  const hasVal = y && y.type === 'value';
  return !!(hasCat && hasVal && Array.isArray(option.series));
}

// ========= Per-visual controls (Slice C) =========
//
// These post-process a fresh single-grid cartesian option (bar / line / area /
// combo / histogram) using the config keys surfaced in the Properties pane.
// Every one is a strict NO-OP at its default/passthrough value so untouched
// visuals render byte-identically. They run BEFORE dual-axis / small-multiples
// promote the axes to arrays, so they only need to handle the single-axis shape.

/** Read the numeric value out of a series datum (bare number or { value }). */

/** Read the numeric value out of a series datum (bare number or { value }). */
export function datumValue(d: any): number {
  if (d && typeof d === 'object' && 'value' in d)
    return Number((d as any).value);
  return Number(d);
}

/**
 * Format a numeric (or date) value using the dataset formatHint shape
 * { kind, decimals, currencyCode, dateFormat, thousands }. Mirrors the hint
 * contract used across datasets so a currency/percent/decimal/date format set
 * on a field renders consistently in charts. Returns a string; passes through
 * non-finite input untouched (so category strings survive).
 */

/**
 * Format a numeric (or date) value using the dataset formatHint shape
 * { kind, decimals, currencyCode, dateFormat, thousands }. Mirrors the hint
 * contract used across datasets so a currency/percent/decimal/date format set
 * on a field renders consistently in charts. Returns a string; passes through
 * non-finite input untouched (so category strings survive).
 */
export function formatValueByHint(value: any, hint: any): string {
  if (!hint || !hint.kind || hint.kind === 'auto') {
    return value == null ? '' : String(value);
  }
  if (hint.kind === 'date') {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return value == null ? '' : String(value);
    // Minimal token formatter for the common patterns; default ISO date.
    const fmt = hint.dateFormat || 'YYYY-MM-DD';
    const pad = (n: number) => String(n).padStart(2, '0');
    return fmt
      .replace(/YYYY/g, String(d.getFullYear()))
      .replace(/MM/g, pad(d.getMonth() + 1))
      .replace(/DD/g, pad(d.getDate()))
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()));
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!isFinite(num)) return value == null ? '' : String(value);
  const decimals =
    typeof hint.decimals === 'number' && hint.decimals >= 0 ? hint.decimals : 2;
  if (hint.kind === 'percent') {
    // Hint values are treated as ratios when < 1 across the board would be
    // ambiguous; follow the dataset convention of formatting the raw number
    // as a percentage of its own magnitude (value already scaled upstream).
    return (
      (hint.thousands
        ? num.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : num.toFixed(decimals)) + '%'
    );
  }
  if (hint.kind === 'currency') {
    try {
      return num.toLocaleString(undefined, {
        style: 'currency',
        currency: hint.currencyCode || 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      return num.toFixed(decimals);
    }
  }
  // Plain number.
  return hint.thousands
    ? num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : num.toFixed(decimals);
}

/**
 * Sort + Top-N/Bottom-N. Reorders the category axis and realigns EVERY series'
 * data array to the new order. Sort key is the axis label ('axis') or the sum
 * of the series values at each category ('measure'). Top-N/Bottom-N then trims
 * to the N categories with the largest / smallest measure totals (independent
 * of the display sort). No-op when both controls are at their defaults.
 */

/**
 * Value-axis scale + explicit min/max. 'log' switches yAxis.type to 'log'
 * (ECharts requires strictly positive data — falls back silently to linear when
 * any value is <= 0). Explicit yScaleMin / yScaleMax pin the domain. No-op when
 * everything is at its default.
 */
export function applyValueAxisScale(option: any, config: any): void {
  if (!isCartesianOption(option)) return;
  const yAxis = option.yAxis;
  if (!yAxis || yAxis.type !== 'value') return;

  if (config?.yAxisScaleType === 'log') {
    // Guard: log axis is invalid with non-positive data.
    const series: any[] = option.series || [];
    const allPositive = series.every(s =>
      Array.isArray(s.data)
        ? s.data.every((d: any) => {
            const v = datumValue(d);
            return !isFinite(v) || v > 0;
          })
        : true,
    );
    if (allPositive) yAxis.type = 'log';
  }
  if (typeof config?.yScaleMin === 'number' && isFinite(config.yScaleMin)) {
    yAxis.min = config.yScaleMin;
  }
  if (typeof config?.yScaleMax === 'number' && isFinite(config.yScaleMax)) {
    yAxis.max = config.yScaleMax;
  }
}

/**
 * Per-field number/date format (config.valueFormat = formatHint). Attaches a
 * formatter to the value axis labels, the tooltip values, and the data labels
 * so a currency/percent/decimal/date choice renders everywhere the measure
 * appears. `valueFormat.target === 'category'` decorates the category axis
 * instead. No-op when config.valueFormat is absent.
 */

/**
 * Per-field number/date format (config.valueFormat = formatHint). Attaches a
 * formatter to the value axis labels, the tooltip values, and the data labels
 * so a currency/percent/decimal/date choice renders everywhere the measure
 * appears. `valueFormat.target === 'category'` decorates the category axis
 * instead. No-op when config.valueFormat is absent.
 */
export function applyPerFieldFormat(option: any, config: any): void {
  const hint = config?.valueFormat;
  if (!hint || !hint.kind || hint.kind === 'auto') return;
  if (!isCartesianOption(option)) return;

  const target = hint.target === 'category' ? 'category' : 'value';
  const fmt = (v: any) => formatValueByHint(v, hint);

  if (target === 'category') {
    const xAxis = option.xAxis;
    if (xAxis) {
      xAxis.axisLabel = {
        ...(xAxis.axisLabel || {}),
        formatter: (v: any) => fmt(v),
      };
    }
    return;
  }

  // Value axis labels.
  const yAxis = option.yAxis;
  if (yAxis && yAxis.type === 'value') {
    yAxis.axisLabel = {
      ...(yAxis.axisLabel || {}),
      formatter: (v: any) => fmt(v),
    };
  }
  // Data labels on each series.
  option.series = (option.series || []).map((s: any) => {
    if (!s.label || s.label.show !== true) return s;
    return {
      ...s,
      label: { ...s.label, formatter: (p: any) => fmt(p.value) },
    };
  });
  // Tooltip values (only when a custom formatter isn't already installed —
  // custom formatters, e.g. the legend single-series bar path, own their own
  // rendering).
  if (option.tooltip && typeof option.tooltip.formatter !== 'function') {
    option.tooltip = {
      ...option.tooltip,
      valueFormatter: (v: any) => fmt(v),
    };
  }
}

/**
 * Data-label content: 'value' (default) or 'percent' (share of the
 * per-category total across series). Only meaningful when data labels are on.
 * No-op at 'value'/unset. Skips when a per-field format already set a formatter
 * (an explicit numeric format takes precedence over a %-of-total label).
 */

/**
 * Data-label content: 'value' (default) or 'percent' (share of the
 * per-category total across series). Only meaningful when data labels are on.
 * No-op at 'value'/unset. Skips when a per-field format already set a formatter
 * (an explicit numeric format takes precedence over a %-of-total label).
 */
export function applyDataLabelContent(option: any, config: any): void {
  if (config?.labelContent !== 'percent') return;
  if (
    config?.valueFormat &&
    config.valueFormat.kind &&
    config.valueFormat.kind !== 'auto'
  )
    return;
  if (!isCartesianOption(option)) return;
  const series: any[] = option.series || [];
  const len = Math.max(
    0,
    ...series.map(s => (Array.isArray(s.data) ? s.data.length : 0)),
  );
  const totals = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    totals[i] = series.reduce((sum, s) => {
      const v = datumValue(Array.isArray(s.data) ? s.data[i] : 0);
      return sum + (isFinite(v) ? v : 0);
    }, 0);
  }
  option.series = series.map(s => {
    if (!s.label || s.label.show !== true) return s;
    return {
      ...s,
      label: {
        ...s.label,
        formatter: (p: any) => {
          const t = totals[p.dataIndex] || 0;
          const v = Number(p.value);
          return t ? ((v / t) * 100).toFixed(1) + '%' : '0%';
        },
      },
    };
  });
}

/**
 * Dual-axis: add a second (right) value axis and route the named series to
 * it, optionally switching a series' render type (bar/line) for a combo.
 * config.dualAxis = { series: [{ name, type?, yAxisIndex? }], rightAxisName? }.
 * No-op when config.dualAxis / its series list is absent/empty.
 */
