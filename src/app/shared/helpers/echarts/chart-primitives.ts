/* Extracted from echarts-option-builder.ts — chart-primitives chart builders. */

import * as echarts from 'echarts';
import { COLOR_PALETTES } from '../chart-config.helper';
import {
  AnnotationSpec,
  ReferenceBandSpec,
  ReferenceLineSpec,
  computeSeriesStat,
} from './chart-analytics';
import {
  applyPerFieldFormat,
  buildCategoryAxis,
  formatTooltipValue,
  formatValueByHint,
} from './chart-postprocess';
// ========= Chart Typography =========
// ECharts is canvas-rendered and does not resolve CSS variables. To stay in
// sync with the rest of the app, the design-token values are duplicated as
// numeric literals here. Source of truth: _theme-variables.scss.
//
// Mapping:
//   axisLabel   → 11px / 400 / muted   (matches --fs-micro)
//   axisName    → 12px / 500 / muted   (matches --fs-label)
//   legend      → 12px / 400 / muted   (matches --fs-label)
//   tooltip     → 12px / 500           (matches --fs-label)
//   dataLabel   → 11px / 500           (matches --fs-micro)
//   chartTitle  → 13px / 600 / strong  (matches --fs-control)
export const CHART_FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const CHART_COLOR_MUTED = '#6b7280'; // matches --text-muted

export const CHART_COLOR_STRONG = '#374151'; // matches --table-header-text

export const CHART_COLOR_GRID = '#f0f0f0'; // soft grid line

export const CHART_COLOR_AXIS = '#d1d5db'; // axis line / tick


export const CHART_TYPOGRAPHY = {
  fontFamily: CHART_FONT_FAMILY,
  axisLabel: { fontSize: 11, fontWeight: 400, color: CHART_COLOR_MUTED },
  axisName: { fontSize: 12, fontWeight: 500, color: CHART_COLOR_MUTED },
  legend: { fontSize: 12, fontWeight: 400, color: CHART_COLOR_MUTED },
  tooltip: { fontSize: 12, fontWeight: 500, color: CHART_COLOR_STRONG },
  dataLabel: { fontSize: 11, fontWeight: 500, color: CHART_COLOR_STRONG },
  chartTitle: { fontSize: 13, fontWeight: 600, color: CHART_COLOR_STRONG },
  // Line / tick colours kept here so a future palette pivot only touches
  // this file.
  colors: {
    muted: CHART_COLOR_MUTED,
    strong: CHART_COLOR_STRONG,
    grid: CHART_COLOR_GRID,
    axis: CHART_COLOR_AXIS,
  },
};

// ========= Helper Functions =========


export function getColors(colorScheme: string): string[] {
  return COLOR_PALETTES[colorScheme] || COLOR_PALETTES['default'];
}

/**
 * Build a series-level `emphasis` object from the shared config.
 *
 * `focus` defaults per series type (bar/line/scatter want 'series',
 * hierarchical types like treemap want 'self'), so the caller passes
 * the type-appropriate fallback.
 *
 * `scale` is the "Hover Scale" toggle in the Properties pane — when on,
 * ECharts grows the hovered data item (symbol/sector) on hover. Stamp it
 * explicitly as a boolean (not only when true): chart updates merge via
 * setOption(opt, false), so omitting `scale` when the toggle is off would
 * let a previously-set `scale: true` persist — the toggle would enable
 * hover-zoom but never disable it.
 */

/**
 * Build a series-level `emphasis` object from the shared config.
 *
 * `focus` defaults per series type (bar/line/scatter want 'series',
 * hierarchical types like treemap want 'self'), so the caller passes
 * the type-appropriate fallback.
 *
 * `scale` is the "Hover Scale" toggle in the Properties pane — when on,
 * ECharts grows the hovered data item (symbol/sector) on hover. Stamp it
 * explicitly as a boolean (not only when true): chart updates merge via
 * setOption(opt, false), so omitting `scale` when the toggle is off would
 * let a previously-set `scale: true` persist — the toggle would enable
 * hover-zoom but never disable it.
 */
export function buildEmphasis(config: any, defaultFocus = 'series'): any {
  return {
    focus: config.emphasis || defaultFocus,
    scale: config.emphasisScale === true,
  };
}

/**
 * Build a 3D axis (xAxis3D / yAxis3D / zAxis3D) with our typography
 * tokens applied to the axis name, tick labels, tick lines, and the
 * splitLine grid. ECharts defaults to its own font + dark colours
 * which clash with the 2D chart vocabulary; without this helper the
 * 3D charts read with a noticeably heavier and differently-styled
 * label set than their 2D siblings.
 *
 * `type` defaults to 'value'; pass 'category' for bar3D / map3D
 * style charts. `name` is the axis label.
 */

/**
 * Creates a vertical linear gradient from a base color.
 * Lightens the color for the top stop, uses original for the bottom.
 */
export function makeGradient(
  color: string,
  direction: 'vertical' | 'horizontal' = 'vertical',
): any {
  const [x, y, x2, y2] = direction === 'vertical' ? [0, 0, 0, 1] : [0, 0, 1, 0];
  return new echarts.graphic.LinearGradient(x, y, x2, y2, [
    { offset: 0, color: color },
    { offset: 1, color: adjustColorOpacity(color, 0.3) },
  ]);
}


export function adjustColorOpacity(hex: string, opacity: number): string {
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Apply gradient colors to series when config.gradient is true.
 * Mutates the series array in place.
 */

export function buildLegend(config: any): any {
  if (!config.legend) return { show: false };
  const legend: any = {
    show: true,
    type: config.legendType || 'scroll',
    textStyle: {
      ...CHART_TYPOGRAPHY.legend,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    itemWidth: 14,
    itemHeight: 10,
    itemGap: 12,
  };
  switch (config.legendPosition) {
    case 'below':
      legend.orient = 'horizontal';
      legend.bottom = 0;
      legend.left = 'center';
      break;
    case 'left':
      legend.orient = 'vertical';
      legend.left = 10;
      legend.top = 'middle';
      break;
    case 'top':
      legend.orient = 'horizontal';
      legend.top = 0;
      legend.left = 'center';
      break;
    case 'right':
    default:
      legend.orient = 'vertical';
      legend.right = 10;
      legend.top = 'middle';
      break;
  }
  return legend;
}


export function buildLegendWithTitle(config: any): any {
  const result: any = { legend: buildLegend(config) };
  if (config.legend && config.legendTitle) {
    const titleEl: any = {
      type: 'text',
      style: {
        text: config.legendTitle,
        font: 'bold 11px sans-serif',
        fill: '#999',
      },
    };
    switch (config.legendPosition) {
      case 'below':
        titleEl.left = 'center';
        titleEl.bottom = 22;
        break;
      case 'top':
        titleEl.left = 'center';
        titleEl.top = 0;
        // shift legend down to make room for title
        result.legend.top = 16;
        break;
      case 'left':
        titleEl.left = 10;
        titleEl.top = 15;
        result.legend.top = 30;
        break;
      case 'right':
      default:
        titleEl.right = 10;
        titleEl.top = 15;
        result.legend.top = 30;
        break;
    }
    result.graphic = { elements: [titleEl] };
  }
  return result;
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

export function buildTooltip(config: any, defaultTrigger: string = 'item'): any {
  const trigger = config.tooltipTrigger || defaultTrigger;
  // `appendToBody: true` reparents the tooltip DOM under document.body,
  // which is the workaround for tooltips getting clipped when the chart
  // sits inside an overflow:hidden ancestor (common in dashboard grids).
  // Off by default — only opt in when the user toggles it, to keep
  // tooltips contained to the chart by default.
  const appendToBody = config.tooltipAppendToBody === true;
  const tooltip: any = {
    show: !config.tooltipDisabled,
    trigger,
    confine: !appendToBody, // confine and appendToBody are mutually exclusive
    appendToBody,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    padding: [8, 12],
    textStyle: {
      ...CHART_TYPOGRAPHY.tooltip,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);',
  };
  // Precision: when set, ECharts rounds numeric values in the tooltip
  // to N decimal places. `valueFormatter` is consulted by ECharts'
  // DEFAULT tooltip renderer only — chart-specific `tooltip.formatter`
  // overrides (heatmap, scatter, bubble, treemap, candlestick, etc.)
  // bypass it entirely. Those callsites use `formatTooltipValue()`
  // (below) to honour the same precision.
  // Always route default-renderer tooltip values through formatTooltipValue —
  // it honours an explicit tooltipPrecision AND, absent one, applies the
  // market-grade default (thousands grouping + max 2 decimals) so raw floats
  // like "-34321.44097199956" never surface. Chart-specific tooltip.formatter
  // overrides (heatmap/scatter/bubble/…) bypass this and call
  // formatTooltipValue themselves, so both paths agree.
  tooltip.valueFormatter = (v: any) => formatTooltipValue(config, v);
  if (config.axisPointerType && config.axisPointerType !== 'none') {
    tooltip.axisPointer = {
      type: config.axisPointerType,
      lineStyle: { color: CHART_TYPOGRAPHY.colors.muted, type: 'dashed' },
      crossStyle: { color: CHART_TYPOGRAPHY.colors.muted },
      shadowStyle: { color: 'rgba(150, 150, 150, 0.08)' },
    };
  }
  return tooltip;
}


export function buildGrid(config: any): any {
  // containLabel: true reserves space for rotated tick labels
  // automatically — we only need a fixed base margin for the axis
  // NAME (positioned via nameGap below the labels). Adding extra
  // padding here on top of containLabel double-counts and squeezes
  // the actual chart area.
  let baseBottom = config.showXAxisLabel !== false ? 25 : 10;
  // When X labels are rotated, the axis name lives below the rotated
  // labels (we grow nameGap in buildCategoryAxis). Reserve extra room
  // at the bottom so the axis name doesn't clip the chart card.
  const rot = config.xAxisLabelRotate || 0;
  if (rot > 15 && config.showXAxisLabel !== false) {
    baseBottom += Math.round(20 * Math.sin((rot * Math.PI) / 180));
  }
  const pos = config.legend ? config.legendPosition || 'right' : '';

  return {
    left: pos === 'left' ? 140 : 50,
    right: pos === 'right' ? 140 : 20,
    bottom: pos === 'below' ? baseBottom + 35 : baseBottom,
    top: pos === 'top' ? 50 : 20,
    containLabel: true,
  };
}


export function buildAnimation(config: any): any {
  return {
    animation: config.animations !== false,
    animationDuration: config.animationDuration ?? 1000,
    animationEasing: config.animationEasing || 'cubicOut',
    // Suppress entrance animation for big charts — full tween on >2k items
    // costs more in paint time than the polish is worth, and the chart
    // appears stalled while it animates. ECharts docs explicitly recommend
    // capping animation at ~2k items on busy dashboards.
    animationThreshold: 2000,
  };
}

/**
 * Performance flags ECharts 5.6 documents for series that render many items.
 *
 *   - `large: true` switches scatter/bar/line/lines to batch-rendered primitives
 *     (per-item itemStyle is ignored, but layout cost drops dramatically).
 *   - `largeThreshold` controls when `large` activates (default differs per series).
 *   - `progressive` chunks rendering into N-item passes so the UI thread stays
 *     responsive on >3k items.
 *
 * Spread the return into any series object that benefits. No-op when config
 * explicitly opts out (`performanceMode: false`).
 *
 * Reference: https://echarts.apache.org/en/option.html#series-scatter.large
 */

/**
 * Performance flags ECharts 5.6 documents for series that render many items.
 *
 *   - `large: true` switches scatter/bar/line/lines to batch-rendered primitives
 *     (per-item itemStyle is ignored, but layout cost drops dramatically).
 *   - `largeThreshold` controls when `large` activates (default differs per series).
 *   - `progressive` chunks rendering into N-item passes so the UI thread stays
 *     responsive on >3k items.
 *
 * Spread the return into any series object that benefits. No-op when config
 * explicitly opts out (`performanceMode: false`).
 *
 * Reference: https://echarts.apache.org/en/option.html#series-scatter.large
 */
export function buildPerfFlags(config: any): any {
  // Return an explicit `large: false` (not {}) when disabled. Chart updates
  // merge via setOption(opt, false); an empty object would let a previously
  // rendered `large: true` persist, so the Performance toggle would enable
  // batch rendering but never disable it.
  if (config?.performanceMode === false) {
    return { large: false };
  }
  return {
    large: true,
    largeThreshold: config?.largeThreshold ?? 2000,
    progressive: config?.progressive ?? 400,
    progressiveThreshold: config?.progressiveThreshold ?? 3000,
  };
}


export function buildDataLabel(config: any, defaultPosition?: string): any {
  if (!config.showDataLabel) return undefined;
  const label: any = {
    show: true,
    position: config.labelPosition || defaultPosition || 'top',
    fontFamily: CHART_TYPOGRAPHY.fontFamily,
    fontSize: config.labelFontSize || CHART_TYPOGRAPHY.dataLabel.fontSize,
    color: CHART_TYPOGRAPHY.dataLabel.color,
    fontWeight: CHART_TYPOGRAPHY.dataLabel.fontWeight,
  };
  // Honour the per-field format hint on the ON-CHART value labels, using the
  // SAME hint object (config.valueFormat) that tooltips + axis labels consume
  // via applyPerFieldFormat. Previously the hint reached tooltips + axis labels
  // but never the data labels, so a currency/percent/decimal/date field showed
  // raw numbers on-chart. Set here so EVERY builder that calls buildDataLabel
  // (including the non-cartesian pie/funnel/treemap/… families that never run
  // through applyPerFieldFormat) formats its labels consistently. For the
  // cartesian family applyPerFieldFormat re-stamps the same formatter later
  // with the identical hint, so the two paths agree.
  const hint = config?.valueFormat;
  if (hint && hint.kind && hint.kind !== 'auto') {
    label.formatter = (params: any) => {
      // ECharts passes a params object; extract the datum's numeric value
      // (object-valued datums carry it under .value). Non-numeric names pass
      // through formatValueByHint untouched.
      const raw =
        params && typeof params === 'object' && 'value' in params
          ? (params as any).value
          : params;
      const v =
        raw && typeof raw === 'object' && 'value' in raw
          ? (raw as any).value
          : raw;
      return formatValueByHint(v, hint);
    };
  }
  return label;
}

// ========= Reference lines / bands / annotations =========
//
// These three overlays are ECharts SERIES-level keys (markLine / markArea /
// markPoint). buildMarkOverlays reads the config arrays and returns the three
// keys so the cartesian builders can spread them onto each series object.
//
// CRITICAL reset discipline: chart updates merge via setOption(opt, false).
// A series that once carried a markLine keeps it unless the next option
// explicitly clears it. So buildMarkOverlays ALWAYS returns all three keys —
// with `{ data: [] }` (an empty overlay) when the corresponding config array
// is absent — mirroring the dataZoom `[]` / perfFlags `large:false` resets
// already used throughout this file.

/** A single reference line spec authored in the Properties pane. */

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
export function buildMarkOverlays(
  config: any,
  seriesValues?: number[],
): {
  markLine: any;
  markArea: any;
  markPoint: any;
} {
  const lines: ReferenceLineSpec[] = Array.isArray(config?.referenceLines)
    ? config.referenceLines
    : [];
  const bands: ReferenceBandSpec[] = Array.isArray(config?.referenceBands)
    ? config.referenceBands
    : [];
  const annos: AnnotationSpec[] = Array.isArray(config?.annotations)
    ? config.annotations
    : [];

  // ── markLine ──
  const markLineData = lines
    .map(l => {
      const onX = l.axis === 'x';
      const common: any = {
        name: l.label || '',
        label: l.label
          ? {
              show: true,
              formatter: l.label,
              position: onX ? 'insideEndTop' : 'insideEndTop',
              ...CHART_TYPOGRAPHY.dataLabel,
              fontFamily: CHART_TYPOGRAPHY.fontFamily,
            }
          : { show: false },
        lineStyle: {
          color: l.color || '#ef4444',
          type: l.lineStyle || 'dashed',
          width: l.width || 1.5,
        },
      };
      if (!l.type || l.type === 'constant') {
        if (
          l.value === undefined ||
          l.value === null ||
          l.value === ('' as any)
        )
          return null;
        return onX
          ? { ...common, xAxis: l.value }
          : { ...common, yAxis: l.value };
      }
      // ECharts markLine supports average/min/max natively via `{ type }`.
      if (l.type === 'average' || l.type === 'min' || l.type === 'max') {
        return { ...common, type: l.type };
      }
      // median / percentile are NOT built-in stat types. Compute them
      // client-side from the series values (generalised — works on any
      // numeric column) and emit as a fixed line. When no series data is
      // available (non-cartesian caller passing only config), fall back to
      // ECharts' native 'average' so the line still renders meaningfully.
      if (l.type === 'median' || l.type === 'percentile') {
        const computed = computeSeriesStat(
          seriesValues || [],
          l.type,
          l.type === 'percentile' ? l.value : undefined,
        );
        if (computed === undefined) return { ...common, type: 'average' };
        return onX
          ? { ...common, xAxis: computed }
          : { ...common, yAxis: computed };
      }
      return { ...common, type: 'average' };
    })
    .filter((x): x is any => x !== null);

  // ── markArea ──
  const markAreaData = bands
    .map(b => {
      if (b.from === undefined || b.to === undefined) return null;
      const onX = b.axis === 'x';
      const startEnd = onX
        ? [{ xAxis: b.from }, { xAxis: b.to }]
        : [{ yAxis: b.from }, { yAxis: b.to }];
      // Attach label + fill to the FIRST boundary object (ECharts convention).
      (startEnd[0] as any).itemStyle = {
        color: b.color || 'rgba(239,68,68,0.08)',
        opacity: b.opacity ?? 1,
      };
      if (b.label) {
        (startEnd[0] as any).name = b.label;
        (startEnd[0] as any).label = {
          show: true,
          ...CHART_TYPOGRAPHY.dataLabel,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
        };
      }
      return startEnd;
    })
    .filter((x): x is any => x !== null);

  // ── markPoint ──
  const markPointData = annos
    .map(a => {
      if (a.x === undefined && a.y === undefined) return null;
      const coord: any[] = [a.x ?? null, a.y ?? null];
      return {
        name: a.label || '',
        coord,
        value: a.label || '',
        symbol: a.symbol || 'pin',
        symbolSize: a.symbolSize || 40,
        itemStyle: { color: a.color || '#f59e0b' },
        label: a.label
          ? {
              show: true,
              formatter: a.label,
              ...CHART_TYPOGRAPHY.dataLabel,
              color: '#ffffff',
              fontFamily: CHART_TYPOGRAPHY.fontFamily,
            }
          : { show: false },
      };
    })
    .filter((x): x is any => x !== null);

  return {
    // Always return the key with an explicit (possibly empty) data array so
    // merge-mode setOption clears a stale overlay when its config is removed.
    markLine: {
      symbol: ['none', 'none'],
      data: markLineData,
    },
    markArea: { data: markAreaData },
    markPoint: { data: markPointData },
  };
}

// ========= visualMap (continuous / piecewise colour scale) =========
//
// visualMap is a TOP-LEVEL option key (not series-level). Generalised from
// the heat-map inline block so any value-driven builder (bar/scatter/bubble/
// tree-map) can map a measure magnitude to colour. Returns undefined when the
// feature is off so an explicit `option.visualMap = buildVisualMap(...)`
// assignment clears a stale scale under merge-mode setOption.


export const VISUAL_MAP_DEFAULT_RANGE = ['#e0f2fe', '#0369a1'];

/**
 * Build a top-level visualMap from config.visualMap* keys. `dataMin`/`dataMax`
 * provide the domain when the user has not pinned an explicit min/max.
 * `dimension` targets which datum dimension drives the colour (default: the
 * value/last dimension). Returns undefined when config.visualMapEnabled is not
 * truthy so the caller can assign undefined to reset.
 */

/**
 * Build a top-level visualMap from config.visualMap* keys. `dataMin`/`dataMax`
 * provide the domain when the user has not pinned an explicit min/max.
 * `dimension` targets which datum dimension drives the colour (default: the
 * value/last dimension). Returns undefined when config.visualMapEnabled is not
 * truthy so the caller can assign undefined to reset.
 */
export function buildVisualMap(
  config: any,
  dataMin: number,
  dataMax: number,
  dimension?: number,
): any | undefined {
  if (!config?.visualMapEnabled) return undefined;
  const min = config.visualMapMin ?? dataMin;
  const max = config.visualMapMax ?? dataMax;
  const range =
    Array.isArray(config.visualMapColors) && config.visualMapColors.length >= 2
      ? config.visualMapColors
      : VISUAL_MAP_DEFAULT_RANGE;
  const base: any = {
    show: config.visualMapShow !== false,
    type: config.visualMapType || 'continuous',
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 100,
    calculable: config.visualMapCalculable !== false,
    orient: config.visualMapOrient || 'horizontal',
    left: 'center',
    bottom: 5,
    inRange: { color: range },
    textStyle: {
      ...CHART_TYPOGRAPHY.axisLabel,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
  };
  if (dimension !== undefined) base.dimension = dimension;
  // Piecewise honours an optional split count.
  if (base.type === 'piecewise' && config.visualMapSplitNumber) {
    base.splitNumber = config.visualMapSplitNumber;
  }
  return base;
}

// ========= Conditional formatting (per-datum colour rules) =========
//
// Discrete, rule-based per-datum colour. Promotes bare data values to
// `{ value, itemStyle:{ color } }` objects when a rule matches. Complements
// buildVisualMap (continuous ranges): visualMap for gradients, this for
// explicit threshold colours. Reads config.conditionalFormatting[].


export const CF_CHART_SURFACES: ('bar' | 'point' | 'text')[] = [
  'bar',
  'point',
  'text',
];

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
export function compactAxisNumber(value: any): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return value == null ? '' : String(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  // One decimal, trimmed of a trailing ".0" so "5.0M" reads as "5M".
  const trim = (x: number) => {
    const s = x.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  if (abs >= 1e12) return `${sign}${trim(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  // < 1000 — group naturally (handles small decimals + integers).
  return n.toLocaleString();
}


export function buildValueAxis(config: any, axis: 'x' | 'y'): any {
  const isX = axis === 'x';
  // `show` stays keyed to physical position; the NAME follows the data role.
  // This is the value axis, so it always carries the value-role label (the
  // UI's Y-Axis field) gated by Show Y Axis Name — regardless of whether the
  // value axis is drawn horizontally (horizontal bars) or vertically.
  const showAxis = isX ? config.xAxis !== false : config.yAxis !== false;
  const showLabel = config.showYAxisLabel;
  // Auto-derived measure-axis name ("Sum of total_charge") stamped by the
  // editor onto config._yAxisFieldLabel. Author's explicit label wins; the
  // derived name is the fallback so the value axis names the measure +
  // aggregate instead of the literal placeholder "Value". Empty string when
  // there is no field — never a hardcoded literal.
  const label = config.yAxisLabel || config._yAxisFieldLabel || '';
  const result: any = {
    type: 'value',
    show: showAxis,
    name: showLabel ? label : '',
    nameLocation: 'middle',
    // X axis: small gap below the tick labels.
    // Y axis: the name reads vertically and sits LEFT of the tick
    // labels — its gap must clear the widest formatted number, or the
    // name (e.g. "Value") visually overlaps the labels ("2,000,000").
    // A flat 45px wasn't enough for grouped millions. We can't know
    // exact label width without measuring, so use a comfortable
    // default (60) that fits up to ~9-char numbers; chart-specific
    // builders can override after the fact for narrower formatters.
    nameGap: isX ? 28 : 60,
    nameTextStyle: {
      ...CHART_TYPOGRAPHY.axisName,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    axisTick: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    axisLabel: {
      ...CHART_TYPOGRAPHY.axisLabel,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
      // Market-grade default: abbreviate large magnitudes (5,000,000 → "5M").
      // Only when the author hasn't set an explicit number format — a real
      // valueFormat (currency/percent/decimal) is layered on later by
      // applyPerFieldFormat, which replaces this formatter entirely.
      ...(config?.valueFormat &&
      config.valueFormat.kind &&
      config.valueFormat.kind !== 'auto'
        ? {}
        : { formatter: (v: any) => compactAxisNumber(v) }),
    },
    splitLine: {
      show: config.showGridLines !== false,
      lineStyle: {
        type: config.gridLineStyle || 'dashed',
        color: CHART_TYPOGRAPHY.colors.grid,
      },
    },
    scale: config.autoScale || false,
    min: config.yScaleMin,
    max: config.yScaleMax,
    nice: true,
  };
  // Always stamp `inverse` explicitly — see buildCategoryAxis for why
  // (merge-mode setOption would otherwise pin a stale `inverse: true`).
  result.inverse = isX ? !!config.inverseX : !!config.inverseY;
  return result;
}


export function getSmooth(config: any): boolean | number {
  if (!config.lineSmooth) return false;
  const smoothness = config.lineSmoothness;
  if (
    smoothness !== undefined &&
    smoothness !== null &&
    smoothness > 0 &&
    smoothness < 1
  ) {
    return smoothness;
  }
  return true;
}


export function getStep(config: any): string | false {
  if (config.lineStep && config.lineStep !== 'none') {
    return config.lineStep;
  }
  return false;
}

// Convert multi-series data to categories + series list

// ========= Common: Toolbox =========
export function buildToolbox(config: any): any {
  if (!config.toolbox) return { show: false };
  return {
    show: true,
    feature: {
      saveAsImage: { title: 'Save', pixelRatio: 2 },
      dataView: {
        title: 'Data',
        readOnly: true,
        lang: ['Data View', 'Close', 'Refresh'],
      },
      restore: { title: 'Reset' },
      dataZoom: { title: { zoom: 'Zoom', back: 'Reset Zoom' } },
    },
    iconStyle: {
      borderColor: '#999',
    },
    emphasis: {
      iconStyle: { borderColor: '#666' },
    },
    right: 10,
    top: 0,
  };
}

// ========= Common: Data Zoom =========

// ========= Common: Data Zoom =========
export function buildDataZoom(config: any, axis: 'x' | 'y' = 'x'): any[] {
  if (!config.dataZoom) return [];
  const index = axis === 'x' ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
  // Position the slider outside the grid with enough room. `bottom: 2` sat
  // the horizontal slider flush against the visual card's bottom edge, where
  // it got visually clipped; lift it to 10 so the full slider (handles +
  // track) clears the card border. The grid bottom reservation at the bar/
  // line/area call sites is increased to match so the slider never overlaps
  // the axis labels.
  const positionProp =
    axis === 'y' ? { right: 8, width: 20 } : { bottom: 10, height: 18 };
  // Throttle filter recompute. Without throttle, every wheel tick triggers
  // a full data-axis recompute — ~16ms × 60fps = a continuous load on the
  // main thread. 100ms is the value ECharts itself uses in their docs.
  const throttle = config.dataZoomThrottle ?? 100;
  const filterMode = config.dataZoomFilterMode || 'filter';
  // Which zoom controls to emit — driven by the "Type" dropdown in the
  // Properties pane (Inside only / Slider only / Both). Previously the
  // dropdown was a no-op: buildDataZoom always returned both a slider AND an
  // inside zoom regardless of config.dataZoomType. Default 'both' preserves
  // the prior behaviour when the user hasn't picked.
  const zoomType = config.dataZoomType || 'both';
  const slider = {
    type: 'slider',
    ...index,
    ...positionProp,
    throttle,
    filterMode,
    // Match the app's primary blue (#2196f3). ECharts does not read
    // CSS custom properties, so values are hard-coded but should track
    // --primary-color in theme-variables.scss if it ever changes.
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    fillerColor: 'rgba(33, 150, 243, 0.12)',
    handleStyle: { color: '#2196f3', borderColor: '#2196f3' },
    moveHandleStyle: { color: '#2196f3' },
    emphasis: {
      handleStyle: { color: '#1976d2', borderColor: '#1976d2' },
      moveHandleStyle: { color: '#1976d2' },
    },
    textStyle: {
      ...CHART_TYPOGRAPHY.axisLabel,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
  };
  const inside = { type: 'inside', ...index, throttle, filterMode };
  if (zoomType === 'slider') return [slider];
  if (zoomType === 'inside') return [inside];
  return [slider, inside];
}

// ========= Bar Chart =========

/**
 * Empty-state option: a centred message on an otherwise blank chart. Used for
 * builders whose data must be pre-binned upstream (the transformer) before a
 * faithful chart can be drawn. Renders through the standard `graphic` text
 * element so it themes with the rest of the app and never throws.
 */
export function buildEmptyStateOption(config: any, message: string): any {
  return {
    ...buildAnimation(config),
    // Keep a blank cartesian frame so the card has structure, not a void.
    grid: buildGrid(config),
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'value', show: false },
    series: [],
    graphic: {
      elements: [
        {
          type: 'text',
          left: 'center',
          top: 'middle',
          silent: true,
          style: {
            text: message,
            fill: CHART_TYPOGRAPHY.colors.muted,
            font: `500 12px ${CHART_TYPOGRAPHY.fontFamily}`,
            lineHeight: 18,
            textAlign: 'center',
          },
        },
      ],
    },
  };
}

// ========= Bullet Chart =========
// Measure vs target with qualitative bands. Data: { name, value }[] where the
// FIRST point is the measure; `config.bulletTarget` (or a second point named
// like /target/i) is the target line; `config.bulletBands` (number[] ascending)
// paints qualitative background ranges via markArea. Horizontal single-row.
