import * as echarts from 'echarts';
import {
  buildLatLonPoints,
  joinRegionData,
} from '../../modules/analyses/helpers/geo-registry';
import { COLOR_PALETTES } from './chart-config.helper';
import {
  ConditionalRule,
  resolveConditionalStyle,
} from './conditional-formatting.helper';
import {
  forecast,
  linearTrend,
  logTrend,
  movingAverage,
  polyTrend,
} from './trend.helper';

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
const CHART_FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const CHART_COLOR_MUTED = '#6b7280'; // matches --text-muted
const CHART_COLOR_STRONG = '#374151'; // matches --table-header-text
const CHART_COLOR_GRID = '#f0f0f0'; // soft grid line
const CHART_COLOR_AXIS = '#d1d5db'; // axis line / tick

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

function getColors(colorScheme: string): string[] {
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
function buildEmphasis(config: any, defaultFocus = 'series'): any {
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
function build3DAxis(
  type: 'value' | 'category' | 'time' | 'log',
  name: string,
): any {
  return {
    type,
    name,
    nameTextStyle: {
      ...CHART_TYPOGRAPHY.axisName,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    axisLabel: {
      ...CHART_TYPOGRAPHY.axisLabel,
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
    },
    axisLine: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.axis },
    },
    axisTick: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.axis },
    },
    splitLine: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.grid },
    },
    splitArea: { show: false },
  };
}

/**
 * grid3D defaults render with a heavy black box outline and dark
 * background; the default zoom is also too close which clips axis
 * names and tick labels at the container edges. Apply our muted
 * token set + tighter box dimensions + pulled-back camera distance
 * so the 3D scene reads as a lighter, more print-friendly visual
 * that fits comfortably inside the chart card.
 *
 * The grid3D positions itself relative to the chart container;
 * `top: 60`, `bottom: 40` give the rendered scene clear vertical
 * breathing room so the chart card chrome (header + footer) does
 * not clip the projected axes.
 */
function build3DGrid(config: any): any {
  return {
    // Smaller boxes so the projected scene + its axis labels fit
    // inside the chart container with margins on all sides.
    boxWidth: config.grid3DBoxWidth ?? 80,
    boxDepth: config.grid3DBoxDepth ?? 80,
    boxHeight: config.grid3DBoxHeight ?? 80,
    // Position the 3D scene so the projected scene + its axis
    // labels have margins on all sides. ECharts grid3D ignores
    // grid margins; padding comes from boxWidth + viewControl.distance.
    top: 'middle',
    left: 'center',
    environment: 'auto',
    axisLine: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.axis, width: 1 },
    },
    axisLabel: {
      textStyle: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      margin: 12,
    },
    axisPointer: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.axis },
    },
    splitLine: {
      lineStyle: { color: CHART_TYPOGRAPHY.colors.grid },
    },
    viewControl: {
      // Pull the camera back so axis names + tick labels are not
      // clipped at the container edges. Default ECharts distance is
      // 150 which sits too close to the box, especially for non-
      // square containers.
      distance: config.viewDistance ?? 220,
      autoRotate: config.autoRotate || false,
      alpha: config.viewAlpha ?? 20,
      beta: config.viewBeta ?? 40,
      // Allow user rotation/zoom but keep panning disabled so the
      // scene cannot drift out of the chart card.
      panMouseButton: 'middle',
      rotateMouseButton: 'left',
      zoomSensitivity: 1,
    },
    // Light: main is the directional key light, ambient is the
    // fill/wrap-around contribution. Picked sensible defaults that
    // make 3D bars/scatter readable without blowing out highlights.
    light: {
      main: {
        intensity: config.mainLightIntensity ?? 1.2,
        shadow: false,
      },
      ambient: {
        intensity: config.ambientLightIntensity ?? 0.5,
      },
    },
    // postEffect: enables SSAO + bloom screen-space effects. Off by
    // default — costs frame budget and only meaningfully improves
    // scenes with deep occluders.
    postEffect: {
      enable: config.postEffect === true,
      SSAO: { enable: true, radius: 1, intensity: 1.2 },
      bloom: { enable: true, intensity: 0.1 },
    },
  };
}

/**
 * Creates a vertical linear gradient from a base color.
 * Lightens the color for the top stop, uses original for the bottom.
 */
function makeGradient(
  color: string,
  direction: 'vertical' | 'horizontal' = 'vertical',
): any {
  const [x, y, x2, y2] = direction === 'vertical' ? [0, 0, 0, 1] : [0, 0, 1, 0];
  return new echarts.graphic.LinearGradient(x, y, x2, y2, [
    { offset: 0, color: color },
    { offset: 1, color: adjustColorOpacity(color, 0.3) },
  ]);
}

function adjustColorOpacity(hex: string, opacity: number): string {
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
function applyGradient(
  series: any[],
  colors: string[],
  direction: 'vertical' | 'horizontal' = 'vertical',
): void {
  series.forEach((s: any, i: number) => {
    if (!s.itemStyle) s.itemStyle = {};
    s.itemStyle.color = makeGradient(colors[i % colors.length], direction);
  });
}

function buildLegend(config: any): any {
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

function buildLegendWithTitle(config: any): any {
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
function formatTooltipValue(config: any, value: any): any {
  if (typeof config.tooltipPrecision !== 'number') return value;
  if (typeof value === 'number' && isFinite(value)) {
    return value.toFixed(config.tooltipPrecision);
  }
  // numeric strings can sneak in from SQL numerics — round those too
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    if (isFinite(n)) return n.toFixed(config.tooltipPrecision);
  }
  return value;
}

function buildTooltip(config: any, defaultTrigger: string = 'item'): any {
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
  if (typeof config.tooltipPrecision === 'number') {
    tooltip.valueFormatter = (v: any) => formatTooltipValue(config, v);
  }
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

function buildGrid(config: any): any {
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

function buildAnimation(config: any): any {
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
function buildPerfFlags(config: any): any {
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

function buildDataLabel(config: any, defaultPosition?: string): any {
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
interface ReferenceLineSpec {
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
function extractNumericSample(data: any): number[] {
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
function computeSeriesStat(
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
      : Math.min(100, Math.max(0, Number.isFinite(percentile as number) ? (percentile as number) : 50));
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

interface ReferenceBandSpec {
  axis?: 'x' | 'y';
  from?: number;
  to?: number;
  label?: string;
  color?: string;
  opacity?: number;
}

interface AnnotationSpec {
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
function buildMarkOverlays(
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
        if (l.value === undefined || l.value === null || l.value === ('' as any))
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

const VISUAL_MAP_DEFAULT_RANGE = ['#e0f2fe', '#0369a1'];

/**
 * Build a top-level visualMap from config.visualMap* keys. `dataMin`/`dataMax`
 * provide the domain when the user has not pinned an explicit min/max.
 * `dimension` targets which datum dimension drives the colour (default: the
 * value/last dimension). Returns undefined when config.visualMapEnabled is not
 * truthy so the caller can assign undefined to reset.
 */
function buildVisualMap(
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

const CF_CHART_SURFACES: ('bar' | 'point' | 'text')[] = ['bar', 'point', 'text'];

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
function applyConditionalFormatting(
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

function buildCategoryAxis(
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
  const label = config.xAxisLabel;

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
      ...categories.map((c) => (c == null ? 0 : String(c).length)),
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

function buildValueAxis(config: any, axis: 'x' | 'y'): any {
  const isX = axis === 'x';
  // `show` stays keyed to physical position; the NAME follows the data role.
  // This is the value axis, so it always carries the value-role label (the
  // UI's Y-Axis field) gated by Show Y Axis Name — regardless of whether the
  // value axis is drawn horizontally (horizontal bars) or vertically.
  const showAxis = isX ? config.xAxis !== false : config.yAxis !== false;
  const showLabel = config.showYAxisLabel;
  const label = config.yAxisLabel;
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

function getSmooth(config: any): boolean | number {
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

function getStep(config: any): string | false {
  if (config.lineStep && config.lineStep !== 'none') {
    return config.lineStep;
  }
  return false;
}

// Convert multi-series data to categories + series list
function convertMultiSeries(data: any[]): {
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
function buildToolbox(config: any): any {
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
function buildDataZoom(config: any, axis: 'x' | 'y' = 'x'): any[] {
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
export function buildBarChartOption(
  data: any[],
  config: any,
  chartType: string,
  multiData?: any[],
): any {
  const isHorizontal = chartType.includes('horizontal');
  const isMulti =
    chartType.includes('2d') ||
    chartType.includes('stacked') ||
    chartType.includes('normalized');
  const isStacked =
    chartType.includes('stacked') || chartType.includes('normalized');
  const isNormalized = chartType.includes('normalized');

  const borderRadius = config.roundEdges
    ? isHorizontal
      ? [0, 4, 4, 0]
      : [4, 4, 0, 0]
    : undefined;

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, isMulti ? 'axis' : 'item'),
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
  };

  const barSeriesBase: any = {};
  // Stamp width bounds explicitly: a cleared field maps to `null` (ECharts
  // reads null as "auto"). Chart updates merge via setOption(opt, false),
  // so omitting the key when emptied would pin the previous width — the
  // control would set a width but never clear it. null resets cleanly.
  barSeriesBase.barWidth = config.barWidth || null;
  barSeriesBase.barMaxWidth = config.barMaxWidth || null;
  barSeriesBase.barMinWidth = config.barMinWidth || null;
  barSeriesBase.showBackground = !!config.showBackground;
  // `clip: false` lets bars extend past the grid edge — useful for
  // dataZoom interactions where partially-visible bars matter.
  if (config.clip !== undefined) barSeriesBase.clip = config.clip;
  // Performance flags (large mode + progressive). The Properties pane
  // exposes these for bar/line/scatter; spread them onto the shared bar
  // series base so every bar variant (single/multi/stacked/normalized)
  // honours the toggle. buildPerfFlags returns large:false when disabled,
  // which resets cleanly under merge-mode setOption.
  Object.assign(barSeriesBase, buildPerfFlags(config));

  // Reference lines / bands / annotations — spread onto the shared base so
  // every bar variant carries them. buildMarkOverlays returns empty data
  // arrays when nothing is configured, which clears cleanly under merge-mode
  // setOption. Pass a flat numeric sample so computed lines (median /
  // percentile) resolve off the actual bar values (generalised over any
  // column). extractNumericSample handles both single- and multi-series shapes.
  Object.assign(
    barSeriesBase,
    buildMarkOverlays(
      config,
      extractNumericSample(multiData && multiData.length > 0 ? multiData : data),
    ),
  );

  if (isMulti) {
    const sourceData = multiData && multiData.length > 0 ? multiData : data;
    const { categories, seriesList } = convertMultiSeries(sourceData);

    if (isNormalized) {
      const totals = categories.map((_, i) =>
        seriesList.reduce((sum, s) => sum + (s.values[i] || 0), 0),
      );
      option.series = seriesList.map(s => ({
        ...barSeriesBase,
        name: s.name,
        type: 'bar',
        stack: 'total',
        emphasis: buildEmphasis(config, 'series'),
        data: s.values.map((v, i) =>
          totals[i] ? +((v / totals[i]) * 100).toFixed(1) : 0,
        ),
        label: config.showDataLabel
          ? {
              show: true,
              formatter: '{c}%',
              fontSize: config.labelFontSize || 12,
            }
          : undefined,
        itemStyle: borderRadius ? { borderRadius } : undefined,
      }));
      // Build axes through the shared helpers so the Properties pane's
      // axis toggles (Show X/Y, Grid Lines, Inverse, Auto Scale, names,
      // rotation) all apply to normalized charts too — then layer the
      // normalized-specific value-axis overrides (0–100 range + % labels)
      // on top. Previously these axes were built inline as bare
      // {type, data, max:100} objects, which silently ignored every axis
      // property the user toggled.
      const pctValueAxis = (axis: 'x' | 'y') => {
        const base = buildValueAxis(config, axis);
        return {
          ...base,
          max: 100,
          axisLabel: { ...(base.axisLabel || {}), formatter: '{value}%' },
        };
      };
      if (isHorizontal) {
        option.yAxis = buildCategoryAxis(config, categories, 'y');
        option.xAxis = pctValueAxis('x');
      } else {
        option.xAxis = buildCategoryAxis(config, categories, 'x');
        option.yAxis = pctValueAxis('y');
      }
    } else {
      option.series = seriesList.map(s => ({
        ...barSeriesBase,
        name: s.name,
        type: 'bar',
        ...(isStacked
          ? {
              stack: 'total',
              stackStrategy: config.stackStrategy || 'samesign',
            }
          : {}),
        data: s.values,
        emphasis: buildEmphasis(config, 'series'),
        label: buildDataLabel(config, isHorizontal ? 'right' : 'top'),
        barGap: config.barGap || '30%',
        barCategoryGap: config.barCategoryGap || '20%',
        itemStyle: borderRadius ? { borderRadius } : undefined,
      }));
      if (isHorizontal) {
        option.yAxis = buildCategoryAxis(config, categories, 'y');
        option.xAxis = buildValueAxis(config, 'x');
      } else {
        option.xAxis = buildCategoryAxis(config, categories, 'x');
        option.yAxis = buildValueAxis(config, 'y');
      }
    }
  } else {
    // Single series
    const categories = data.map(d => String(d.name));
    const values = data.map(d => d.value);

    // Use colorful bars by assigning per-item colors from palette
    const colors = getColors(config.colorScheme);
    const baseColoredValues = values.map((v, i) => ({
      value: v,
      itemStyle: config.gradient
        ? {
            color: makeGradient(
              colors[i % colors.length],
              isHorizontal ? 'horizontal' : 'vertical',
            ),
          }
        : { color: colors[i % colors.length] },
    }));
    // Overlay conditional-formatting colours — a matched rule replaces the
    // palette colour for that datum; non-matching bars keep the palette.
    // `data` carries the original row so cross-field rules resolve. No-op
    // when config.conditionalFormatting is empty.
    const coloredValues = applyConditionalFormatting(
      baseColoredValues,
      config,
      data,
      'value',
    );

    if (config.legend) {
      // For legend to work on single-series bar charts, each category
      // needs its own series so ECharts can toggle them individually.
      option.legend = {
        ...option.legend,
        data: categories,
      };
      option.series = categories.map((cat, i) => ({
        ...barSeriesBase,
        name: cat,
        type: 'bar',
        stack: 'single', // stack on same position so bars don't spread out
        data: values.map((v, j) =>
          j === i
            ? {
                value: v,
                itemStyle: coloredValues[j].itemStyle,
              }
            : null,
        ), // null = invisible + excluded from tooltip
        emphasis: buildEmphasis(config, 'series'),
        label: buildDataLabel(config, isHorizontal ? 'right' : 'top'),
        barGap: config.barGap || '30%',
        barCategoryGap: config.barCategoryGap || '20%',
        itemStyle: borderRadius
          ? { borderRadius, ...coloredValues[i].itemStyle }
          : coloredValues[i].itemStyle,
      }));
      // Custom tooltip formatter to filter out null entries from stacked series
      option.tooltip = {
        ...option.tooltip,
        formatter: function (params: any) {
          if (!Array.isArray(params)) {
            // Item trigger — single item
            return params.seriesName + ': ' + formatTooltipValue(config, params.value);
          }
          // Axis trigger — filter out null/undefined entries
          const valid = params.filter((p: any) => p.value != null);
          if (valid.length === 0) return '';
          let result = valid[0].axisValueLabel || '';
          valid.forEach((p: any) => {
            result += '<br/>' + p.marker + ' ' + p.seriesName + ': ' + formatTooltipValue(config, p.value);
          });
          return result;
        },
      };
    } else {
      option.series = [
        {
          ...barSeriesBase,
          name: 'Value',
          type: 'bar',
          data: coloredValues,
          emphasis: buildEmphasis(config, 'series'),
          label: buildDataLabel(config, isHorizontal ? 'right' : 'top'),
          barGap: config.barGap || '30%',
          barCategoryGap: config.barCategoryGap || '20%',
          itemStyle: borderRadius ? { borderRadius } : undefined,
        },
      ];
    }

    if (isHorizontal) {
      option.yAxis = buildCategoryAxis(config, categories, 'y');
      option.xAxis = buildValueAxis(config, 'x');
    } else {
      option.xAxis = buildCategoryAxis(config, categories, 'x');
      option.yAxis = buildValueAxis(config, 'y');
    }
  }

  if (config.gradient && isMulti && option.series) {
    const colors = getColors(config.colorScheme);
    applyGradient(
      option.series,
      colors,
      isHorizontal ? 'horizontal' : 'vertical',
    );
  }

  const barZoom = buildDataZoom(config, isHorizontal ? 'y' : 'x');
  // Always assign — an empty array clears any previously-rendered zoom.
  // Chart updates merge via setOption(opt, false); omitting the key when
  // the toggle is off would leave ECharts holding the prior slider, so the
  // Data Zoom toggle would turn on but never off.
  option.dataZoom = barZoom;
  if (barZoom.length) {
    // Add space for the dataZoom slider below/beside the grid
    if (!isHorizontal) {
      option.grid.bottom = (option.grid.bottom || 15) + 35;
    } else {
      option.grid.right = (option.grid.right || 20) + 30;
    }
  }

  // Optional value-driven colour scale (colour by measure magnitude). Assign
  // explicitly (undefined when off) so a stale scale is dropped under
  // merge-mode setOption. Domain derived from the flat single-series values;
  // for multi-series the user-pinned min/max still drive it.
  const barVals = (Array.isArray(data) ? data : [])
    .map((d: any) => (d && typeof d === 'object' ? Number(d.value) : Number(d)))
    .filter((n: number) => Number.isFinite(n));
  option.visualMap = buildVisualMap(
    config,
    barVals.length ? Math.min(...barVals) : 0,
    barVals.length ? Math.max(...barVals) : 100,
  );

  return option;
}

// ========= Line Chart =========
export function buildLineChartOption(
  data: any[],
  config: any,
  chartType: string = 'line',
): any {
  const { categories, seriesList } = convertMultiSeries(data);
  const isStacked = chartType === 'line-stacked';
  const isStep = chartType === 'line-step';
  const smooth = isStep ? false : getSmooth(config);
  const step = isStep
    ? config.lineStep !== 'none'
      ? config.lineStep || 'middle'
      : 'middle'
    : getStep(config);

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    // markLine/markArea/markPoint render once per chart, so attach the
    // overlays to the FIRST series only (spreading onto every series would
    // draw the reference line N times). Empty when nothing configured.
    series: seriesList.map((s, si) => ({
      name: s.name,
      type: 'line',
      // Promote bare values to conditionally-coloured points when a rule
      // matches (line points are bare numbers otherwise). No-op when no rules.
      data: applyConditionalFormatting(s.values, config, undefined, 'value'),
      smooth: step ? false : smooth,
      step: step || undefined,
      ...(isStacked ? { stack: 'total' } : {}),
      showSymbol: config.showSymbol !== false,
      symbol: config.symbolShape || 'circle',
      symbolSize: config.symbolSize || 4,
      connectNulls: config.connectNulls || false,
      lineStyle: {
        width: config.lineWidth || 2,
        type: config.lineStyleType || 'solid',
      },
      label: buildDataLabel(config),
      areaStyle:
        config.rangeFillOpacity > 0
          ? { opacity: config.rangeFillOpacity }
          : undefined,
      emphasis: buildEmphasis(config, 'series'),
      // Overlays attach to the FIRST series only (once per chart). Pass the
      // flat sample across all series so computed lines (median/percentile)
      // reflect the whole chart, not just series 0.
      ...(si === 0
        ? buildMarkOverlays(config, extractNumericSample(data))
        : {}),
      ...(config.endLabel ? { endLabel: { show: true } } : {}),
      ...(config.sampling && config.sampling !== 'none'
        ? { sampling: config.sampling }
        : {}),
      showAllSymbol:
        config.showAllSymbol === 'true'
          ? true
          : config.showAllSymbol === 'false'
            ? false
            : 'auto',
    })),
  };

  if (config.gradient && option.series) {
    const colors = getColors(config.colorScheme);
    applyGradient(option.series, colors);
  }

  if (config.dataZoom) {
    option.dataZoom = buildDataZoom(config);
    option.grid.bottom = (option.grid.bottom || 30) + 40;
  } else {
    // Clear explicitly so merge-mode setOption doesn't keep a stale slider
    // when the Data Zoom toggle is turned off.
    option.dataZoom = [];
  }

  return option;
}

// ========= Area Chart =========
export function buildAreaChartOption(
  data: any[],
  config: any,
  chartType: string,
): any {
  const { categories, seriesList } = convertMultiSeries(data);
  const isStacked =
    chartType === 'area-stacked' || chartType === 'area-normalized';
  const isNormalized = chartType === 'area-normalized';
  const smooth = getSmooth(config);
  const step = getStep(config);

  const areaOpacity = config.areaOpacity ?? (isStacked ? 0.7 : 0.4);

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
  };

  const lineSeriesBase: any = {
    showSymbol: config.showSymbol !== false,
    symbol: config.symbolShape || 'circle',
    symbolSize: config.symbolSize || 4,
    connectNulls: config.connectNulls || false,
    lineStyle: {
      width: config.lineWidth || 2,
      type: config.lineStyleType || 'solid',
    },
    emphasis: buildEmphasis(config, 'series'),
    ...(config.endLabel ? { endLabel: { show: true } } : {}),
    ...(config.sampling && config.sampling !== 'none'
      ? { sampling: config.sampling }
      : {}),
    showAllSymbol:
      config.showAllSymbol === 'true'
        ? true
        : config.showAllSymbol === 'false'
          ? false
          : 'auto',
  };

  if (isNormalized) {
    const totals = categories.map((_, i) =>
      seriesList.reduce((sum, s) => sum + (s.values[i] || 0), 0),
    );
    option.yAxis.max = 100;
    option.yAxis.axisLabel = { formatter: '{value}%' };
    // Normalized mode recomputes values as percentages, so per-datum
    // conditional colouring on raw measures does not apply; only the
    // overlays (reference lines/bands/annotations) attach — to the first
    // series to avoid N-fold duplication.
    option.series = seriesList.map((s, si) => ({
      ...lineSeriesBase,
      name: s.name,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.8 },
      data: s.values.map((v, i) =>
        totals[i] ? +((v / totals[i]) * 100).toFixed(1) : 0,
      ),
      smooth: step ? false : smooth,
      step: step || undefined,
      ...(si === 0 ? buildMarkOverlays(config) : {}),
    }));
  } else {
    option.series = seriesList.map((s, si) => ({
      ...lineSeriesBase,
      name: s.name,
      type: 'line',
      ...(isStacked ? { stack: 'total' } : {}),
      areaStyle: {
        opacity: areaOpacity,
        ...(config.areaOrigin ? { origin: config.areaOrigin } : {}),
      },
      // Conditional per-datum colour (no-op when no rules). Overlays attach
      // to the first series only.
      data: applyConditionalFormatting(s.values, config, undefined, 'value'),
      smooth: step ? false : smooth,
      step: step || undefined,
      ...(si === 0
        ? buildMarkOverlays(config, extractNumericSample(data))
        : {}),
    }));
  }

  if (config.gradient && option.series) {
    const colors = getColors(config.colorScheme);
    applyGradient(option.series, colors);
  }

  if (config.dataZoom) {
    option.dataZoom = buildDataZoom(config);
    option.grid.bottom = (option.grid.bottom || 30) + 40;
  } else {
    // Clear explicitly so merge-mode setOption doesn't keep a stale slider
    // when the Data Zoom toggle is turned off.
    option.dataZoom = [];
  }

  return option;
}

// ========= Combo Chart (bars + line, dual-axis) =========
//
// Combo reuses the multi-series bar path: the transformer hands us the same
// wrapped shape ({name, series:[{name,value}]}) the 2D/stacked bars use, so we
// build a grouped vertical-bar option here and let applyCartesianAnalytics →
// applyDualAxis switch per-series render type + axis afterwards. Everything the
// bar builder honours (grid, legend, zoom, labels, reference overlays) carries
// through untouched. When only a single series is present it still renders as a
// clean bar chart.
export function buildComboChartOption(
  data: any[],
  config: any,
  _chartType: string,
): any {
  // Force the multi-series bar layout by routing through the vertical 2D bar
  // path (grouped bars). Downstream dual-axis handles line/secondary-axis.
  return buildBarChartOption(data, config, 'bar-vertical-2d', data);
}

// ========= Histogram (auto-binned bars) =========
//
// The transformer bins the numeric column client-side into {name, value}[]
// (name = bin range, value = frequency). We render those as a single-series
// vertical bar with no category gap so the bars read as a continuous
// distribution. Data-label / axis controls flow through the shared bar path.
export function buildHistogramChartOption(
  data: any[],
  config: any,
  _chartType: string,
): any {
  // Histogram bars should touch (distribution look): zero the category gap
  // unless the author overrode it, and default the value axis name to a
  // frequency label. Build through the single-series vertical bar path.
  const histCfg = {
    ...config,
    barCategoryGap:
      config.barCategoryGap != null && config.barCategoryGap !== ''
        ? config.barCategoryGap
        : '2%',
    // "Show counts" surfaces the frequency as a data label. Falls back to the
    // generic showDataLabel toggle when the histogram-specific flag is unset.
    showDataLabel: config.histogramShowCounts === true || config.showDataLabel,
  };
  return buildBarChartOption(data, histCfg, 'bar-vertical');
}

// ========= Pie Chart =========
export function buildPieChartOption(
  data: any[],
  config: any,
  chartType: string,
): any {
  const isDonut = chartType === 'donut';
  const isAdvanced = chartType === 'pie-advanced';
  const isGrid = chartType === 'pie-grid';
  const isHalfDonut = chartType === 'half-donut';
  const isNestedPie = chartType === 'nested-pie';
  const isRose = chartType === 'rose';

  const pieData = data.map(d => ({ name: String(d.name), value: d.value }));

  // Compute radius using ECharts-native properties
  const innerRadius = config.pieInnerRadius ?? 0;
  const outerRadius = config.pieOuterRadius ?? 70;
  let radius: any = [`${innerRadius}%`, `${outerRadius}%`];

  if (isHalfDonut) {
    radius = [`${innerRadius || 40}%`, `${outerRadius || 70}%`];
  } else if (isNestedPie) {
    radius = ['0%', '30%']; // inner ring; outer ring added as second series below
  } else if (isDonut) {
    radius = [`${innerRadius || 40}%`, `${outerRadius || 70}%`];
  } else if (isAdvanced) {
    radius = [`${innerRadius || 30}%`, `${outerRadius || 60}%`];
  } else if (isGrid || isRose) {
    radius = [`${innerRadius}%`, `${outerRadius || 60}%`];
  }

  // Label config
  const labelConfig: any = {};
  if (config.labels !== false) {
    labelConfig.show = true;
    labelConfig.position = config.pieLabelPosition || 'outside';
    if (config.labelFontSize) labelConfig.fontSize = config.labelFontSize;
    if (config.trimLabels && config.maxLabelLength) {
      labelConfig.formatter = (params: any) => {
        const name = params.name || '';
        return name.length > config.maxLabelLength
          ? name.substring(0, config.maxLabelLength) + '...'
          : name;
      };
    }
  } else {
    labelConfig.show = false;
  }

  // Rose type support
  const roseType =
    config.roseType && config.roseType !== 'none' ? config.roseType : undefined;

  // Selected mode
  const selectedMode =
    config.pieSelectedMode && config.pieSelectedMode !== 'none'
      ? config.pieSelectedMode
      : false;

  // Pie center: shift away from the legend position so the chart
  // does not sit underneath / above the legend area. Default 50/50
  // is fine only when there is no legend on any side.
  const legendPos = config.legend ? config.legendPosition || 'right' : '';
  const pieCenter: [string, string] =
    legendPos === 'left'
      ? ['58%', '50%']
      : legendPos === 'right'
        ? ['42%', '50%']
        : legendPos === 'top'
          ? ['50%', '55%']
          : legendPos === 'below'
            ? ['50%', '45%']
            : ['50%', '50%'];

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    ...buildLegendWithTitle(config),
    toolbox: buildToolbox(config),
    series: [
      {
        type: 'pie',
        radius,
        center: pieCenter,
        data: pieData,
        label: labelConfig,
        // labelLine block lives below with the length/length2 extensions
        // (duplicate-key sweep collapsed the two into one).
        roseType: roseType,
        clockwise: config.pieClockwise !== false,
        startAngle: config.pieStartAngle ?? 90,
        ...(config.pieEndAngle != null ? { endAngle: config.pieEndAngle } : {}),
        percentPrecision: config.piePercentPrecision ?? 2,
        minAngle: config.pieMinAngle ?? 0,
        avoidLabelOverlap: config.pieAvoidLabelOverlap !== false,
        padAngle: config.piePadAngle ?? 0,
        selectedMode: selectedMode,
        selectedOffset: config.pieSelectedOffset ?? 10,
        minShowLabelAngle: config.pieMinShowLabelAngle ?? 0,
        labelLine: {
          show: config.pieLabelLine !== false,
          length: config.pieLabelLineLength ?? 15,
          length2: config.pieLabelLineLength2 ?? 10,
        },
        itemStyle: {
          borderRadius: config.pieBorderRadius ?? 0,
          borderWidth: config.pieBorderWidth ?? 0,
          borderColor: '#fff',
        },
        emphasis: {
          focus: config.emphasis || 'self',
          ...(config.emphasisScale === true ? { scale: true } : {}),
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.2)' },
        },
      },
    ],
  };

  // Advanced pie: add detail legend with values
  if (isAdvanced) {
    // The advanced pie variant adds a detail legend (name + value).
    // Previously this hardcoded `show: true`, which silently overrode
    // the user's Show Legend toggle — `config.legend = false` would
    // wipe the chart legend on every other family but leave it
    // visible here. Honour `config.legend`.
    option.legend = {
      show: config.legend !== false,
      type: config.legendType || 'scroll',
      orient: 'vertical',
      right: 10,
      top: 'middle',
      formatter: (name: string) => {
        const item = pieData.find(d => d.name === name);
        return item ? `${name}: ${formatTooltipValue(config, item.value)}` : name;
      },
    };
    option.series[0].center = ['35%', '50%'];
  }

  // Pie grid: center the pie
  if (isGrid) {
    option.series[0].center = ['50%', '50%'];
  }

  // Rose chart
  if (isRose) {
    option.series[0].roseType = roseType || 'area';
  }

  // Half donut: semicircle
  if (isHalfDonut) {
    option.series[0].startAngle = 180;
    option.series[0].endAngle = 360;
    option.series[0].center = ['50%', '70%'];
  }

  // Nested pie: inner + outer ring
  if (isNestedPie) {
    option.series[0].radius = ['0%', '30%'];
    option.series[0].label = {
      position: 'inner',
      fontFamily: CHART_TYPOGRAPHY.fontFamily,
      fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
      color: CHART_TYPOGRAPHY.dataLabel.color,
    };
    option.series[0].selectedMode = 'single';
    option.series.push({
      type: 'pie',
      radius: ['40%', '65%'],
      data: pieData,
      label: labelConfig,
      labelLine: { show: config.pieLabelLine !== false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.2)' },
      },
    });
  }

  if (config.gradient && option.series) {
    const colors = getColors(config.colorScheme);
    option.series.forEach((s: any) => {
      if (s.data) {
        s.data = s.data.map((d: any, i: number) => ({
          ...d,
          itemStyle: {
            ...(d.itemStyle || {}),
            color: makeGradient(colors[i % colors.length]),
          },
        }));
      }
    });
  }

  return option;
}

// ========= Polar / Radar Chart =========
export function buildPolarChartOption(data: any[], config: any): any {
  const { categories, seriesList } = convertMultiSeries(data);

  // Compute max for each category (indicator)
  const maxValues = categories.map(
    (_, i) => Math.max(...seriesList.map(s => s.values[i] || 0)) * 1.2,
  );

  const indicator = categories.map((name, i) => {
    const displayName =
      config.labelTrim && name.length > (config.labelTrimSize || 10)
        ? name.substring(0, config.labelTrimSize || 10) + '...'
        : name;
    return {
      name: displayName,
      max: config.autoScale ? maxValues[i] : undefined,
    };
  });

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    ...buildLegendWithTitle(config),
    // Polar charts are a polar/radar coord system; before this fix the
    // builder omitted `toolbox`, so the Properties pane toolbox toggle
    // was a silent no-op on polar (and only on polar in the radar
    // family). Emit toolbox like every other chart family.
    toolbox: buildToolbox(config),
    radar: {
      indicator,
      shape: config.radarShape || 'polygon',
      splitArea: {
        show: config.showGridLines !== false,
        areaStyle: { opacity: 0.1 },
      },
      splitLine: { show: config.showGridLines !== false },
      axisLine: { show: config.xAxis !== false },
      axisName: { show: config.xAxis !== false },
    },
    series: [
      {
        type: 'radar',
        symbol: config.radarSymbol || 'circle',
        symbolSize: config.radarSymbolSize ?? 4,
        lineStyle: {
          width: config.radarLineWidth ?? 2,
        },
        data: seriesList.map(s => ({
          name: s.name,
          value: s.values,
          areaStyle: { opacity: config.radarAreaOpacity ?? 0.15 },
        })),
        emphasis: {
          lineStyle: { width: 3 },
        },
      },
    ],
  };
}

// ========= Gauge Chart =========
export function buildGaugeChartOption(data: any[], config: any): any {
  const gaugeData = data.map(d => ({
    name: String(d.name),
    value: d.value,
  }));

  // Auto-fit the gauge scale to the data when the user hasn't set an explicit
  // max. The Properties pane writes config.min and config.max (see the
  // visual-config-sidebar Gauge Series Options block, ~line 896/905), but
  // those keys carry a stale default of 0/100 from DEFAULT_CHART_CONFIG; a
  // user who never opens the gauge config can't end up with a dial that
  // matches a summed measure in the millions. The previous fix unilaterally
  // ignored config.min/config.max, which silently disabled both UI inputs.
  //
  // Strategy now: round the data max up to a "nice" number for the
  // auto-fit case, and honour the user's explicit min/max once it differs
  // from the legacy defaults (0/100). gaugeMinValue / gaugeMaxValue (the
  // never-shipped keys) are still accepted for forward compatibility.
  const dataMax = Math.max(...gaugeData.map(d => Number(d.value) || 0), 1);
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(dataMax)));
    return Math.ceil(dataMax / pow) * pow;
  })();

  const minOverride =
    config.gaugeMinValue != null
      ? config.gaugeMinValue
      : config.min != null && config.min !== 0
        ? config.min
        : null;
  const maxOverride =
    config.gaugeMaxValue != null
      ? config.gaugeMaxValue
      : config.max != null && config.max !== 100
        ? config.max
        : null;
  const gaugeMin = minOverride != null ? minOverride : 0;
  const gaugeMax = maxOverride != null ? maxOverride : niceMax;

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    series: [
      {
        type: 'gauge',
        min: gaugeMin,
        max: gaugeMax,
        startAngle: config.gaugeStartAngle ?? 225,
        endAngle: config.gaugeEndAngle ?? -45,
        splitNumber: config.gaugeSplitNumber ?? config.splitNumber ?? 10,
        axisTick: {
          show: config.gaugeShowScale !== false,
          splitNumber: config.tickSplitNumber ?? 5,
        },
        axisLine: {
          show: true,
          roundCap: config.gaugeAxisLineRoundCap || false,
          lineStyle: {
            width: config.gaugeAxisLineWidth ?? 15,
          },
        },
        axisLabel: {
          show: config.gaugeShowScale !== false,
          distance: 25,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.axisLabel.fontSize,
          color: CHART_TYPOGRAPHY.axisLabel.color,
        },
        splitLine: {
          show: config.gaugeShowScale !== false,
          length: 15,
        },
        pointer: {
          show: config.gaugeShowPointer !== false,
          length: `${config.gaugePointerLength ?? 60}%`,
          width: config.gaugePointerWidth ?? 6,
          ...(config.gaugePointerIcon ? { icon: config.gaugePointerIcon } : {}),
        },
        progress: {
          show: config.gaugeShowProgress || false,
          width: config.gaugeAxisLineWidth ?? 15,
          roundCap: config.gaugeProgressRoundCap || false,
        },
        detail: {
          // Gauge centre value IS the chart's visual hierarchy — keep this
          // intentionally larger than chartTitle so the reading dominates.
          show: config.gaugeShowValue !== false,
          formatter:
            config.gaugeDetailFormatter ||
            (config.units ? `{value} ${config.units}` : '{value}'),
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: 20,
          fontWeight: CHART_TYPOGRAPHY.chartTitle.fontWeight,
          color: CHART_TYPOGRAPHY.chartTitle.color,
          offsetCenter: [0, '70%'],
        },
        anchor: {
          show: config.gaugeAnchorShow === true,
          size: config.gaugeAnchorSize ?? 12,
          itemStyle: { color: '#fff', borderColor: '#999', borderWidth: 2 },
        },
        title: {
          show: true,
          offsetCenter: [0, '90%'],
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.chartTitle.fontSize,
          fontWeight: CHART_TYPOGRAPHY.chartTitle.fontWeight,
          color: CHART_TYPOGRAPHY.chartTitle.color,
        },
        data: gaugeData.length > 0 ? [gaugeData[0]] : [{ value: 0, name: '' }],
      },
    ],
  };
}

// ========= Heat Map Chart =========
export function buildHeatMapChartOption(data: any[], config: any): any {
  const yCategories: string[] = [];
  const xCategorySet = new Set<string>();
  const heatData: number[][] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;

  data.forEach((group, yIdx) => {
    yCategories.push(String(group.name));
    if (group.series) {
      group.series.forEach((item: any) => {
        xCategorySet.add(String(item.name));
      });
    }
  });

  const xCategories = Array.from(xCategorySet);

  data.forEach((group, yIdx) => {
    if (group.series) {
      group.series.forEach((item: any) => {
        const xIdx = xCategories.indexOf(String(item.name));
        const val = item.value || 0;
        heatData.push([xIdx, yIdx, val]);
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      });
    }
  });

  if (minVal === Infinity) minVal = 0;
  if (maxVal === -Infinity) maxVal = 1;

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      position: 'top',
      formatter: (params: any) => {
        const d = params.data || params.value;
        return `${xCategories[d[0]]} / ${yCategories[d[1]]}: ${formatTooltipValue(config, d[2])}`;
      },
    },
    ...buildLegendWithTitle(config),
    // Heat-map shares the standard toolbox affordance (save image, restore,
    // data-view, zoom). Previously the toggle in the Properties pane was a
    // no-op because the builder omitted `toolbox` entirely.
    toolbox: buildToolbox(config),
    // Heatmap needs extra bottom for the visualMap legend (the
    // gradient color bar that lives below the chart). Stack on top
    // of buildGrid's containLabel which handles tick label space.
    grid: { ...buildGrid(config), bottom: 45 },
    xAxis: {
      type: 'category',
      data: xCategories,
      show: config.xAxis !== false,
      name: config.showXAxisLabel ? config.xAxisLabel : '',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: {
        ...CHART_TYPOGRAPHY.axisName,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      splitArea: { show: true },
      axisLabel: {
        rotate: config.xAxisLabelRotate || 0,
        overflow: config.trimXAxisTicks ? 'truncate' : 'none',
        width: (config.maxXAxisTickLength || 16) * 7,
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    yAxis: {
      type: 'category',
      data: yCategories,
      show: config.yAxis !== false,
      name: config.showYAxisLabel ? config.yAxisLabel : '',
      nameLocation: 'middle',
      nameGap: 45,
      nameTextStyle: {
        ...CHART_TYPOGRAPHY.axisName,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      splitArea: { show: true },
      axisLabel: {
        overflow: config.trimYAxisTicks ? 'truncate' : 'none',
        width: (config.maxYAxisTickLength || 16) * 7,
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    visualMap: {
      show: config.visualMapShow !== false,
      type: config.visualMapType || 'continuous',
      min: config.visualMapMin ?? minVal,
      max: config.visualMapMax ?? maxVal,
      calculable: config.visualMapCalculable !== false,
      orient: config.visualMapOrient || 'horizontal',
      left: 'center',
      // Push the visualMap legend up a bit so it does not overlap the
      // axis name on small chart cards.
      bottom: 5,
      textStyle: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    series: [
      {
        type: 'heatmap',
        data: heatData,
        label: {
          show: config.heatmapShowLabels !== false || config.showDataLabel,
          fontSize: config.labelFontSize || 11,
          // Compact the cell value: raw floats like 342381.8999999999 ran far
          // past the cell width and collided with neighbours/axis labels.
          // Render as a short K/M-suffixed number so it fits in the cell.
          formatter: (p: any) => {
            const val = Array.isArray(p.value) ? p.value[2] : p.value;
            const n = Number(val);
            if (!isFinite(n)) return '';
            const abs = Math.abs(n);
            if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'B';
            if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
            if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return String(Math.round(n));
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
        },
      },
    ],
  };
}

// ========= Tree Map Chart =========
export function buildTreeMapChartOption(data: any[], config: any): any {
  // Transformer returns either a forest (hierarchy with children[]) or a flat
  // array. ECharts treemap natively recurses on `children`, so we just pass
  // the data through when it's already hierarchical.
  const treeData = data.map(d => {
    if (
      d &&
      typeof d === 'object' &&
      Array.isArray((d as any).children) &&
      (d as any).children.length > 0
    ) {
      return d;
    }
    return { name: String((d as any).name), value: (d as any).value };
  });

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => `${params.name}: ${formatTooltipValue(config, params.value)}`,
    },
    // Treemap previously omitted the toolbox key, so the Properties pane
    // toolbox toggle was a silent no-op only on tree-map (and only on
    // tree-map — every other chart family emits it).
    toolbox: buildToolbox(config),
    series: [
      {
        type: 'treemap',
        data: treeData,
        roam: config.treemapRoam || false,
        nodeClick:
          config.treemapNodeClick === 'false'
            ? false
            : config.treemapNodeClick || 'zoomToNode',
        leafDepth: config.treemapLeafDepth ?? 1,
        visualDimension: config.treemapVisualDimension ?? 0,
        colorMappingBy: config.treemapColorMappingBy || 'index',
        squareRatio: config.treemapSquareRatio ?? 0.5 * (1 + Math.sqrt(5)),
        upperLabel: { show: config.treemapUpperLabel === true, height: 18 },
        breadcrumb: { show: config.treemapBreadcrumb || false },
        label: {
          show: config.treemapShowLabels !== false,
          formatter: '{b}',
          color: '#fff',
          fontSize: config.labelFontSize || 12,
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowBlur: 3,
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: '#fff',
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 3 },
          },
        ],
      },
    ],
  };
}

// ========= Bubble Chart =========
export function buildBubbleChartOption(data: any[], config: any): any {
  const minR = config.minRadius || 3;
  const maxR = config.maxRadius || 20;

  const allR: number[] = [];
  data.forEach(group => {
    if (group.series) {
      group.series.forEach((pt: any) => {
        if (pt.r !== undefined) allR.push(pt.r);
      });
    }
  });
  const rMin = Math.min(...allR, 0);
  const rMax = Math.max(...allR, 1);

  const series = data.map((group, idx) => ({
    name: String(group.name),
    type: 'scatter',
    data: (group.series || []).map((pt: any) => [
      pt.x,
      pt.y,
      pt.r || pt.value || 0,
    ]),
    symbolSize: (val: any) => {
      const r = val[2] || 0;
      if (rMax === rMin) return (minR + maxR) / 2;
      return minR + ((r - rMin) / (rMax - rMin)) * (maxR - minR);
    },
    emphasis: buildEmphasis(config, 'series'),
  }));

  if (config.gradient) {
    const colors = getColors(config.colorScheme);
    applyGradient(series, colors);
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const d = params.data || params.value;
        return `${params.seriesName}<br/>X: ${formatTooltipValue(config, d[0])}, Y: ${formatTooltipValue(config, d[1])}, Size: ${formatTooltipValue(config, d[2])}`;
      },
    },
    ...buildLegendWithTitle(config),
    // Bubble previously omitted the toolbox key, so the Properties pane
    // toolbox toggle was a silent no-op only on bubble. Emit it like
    // every other XY chart family.
    toolbox: buildToolbox(config),
    grid: buildGrid(config),
    xAxis: buildValueAxis(config, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series,
  };
}

// ========= Scatter Chart =========
export function buildScatterChartOption(
  data: any[],
  config: any,
  chartType: string = 'scatter',
): any {
  const isEffect = chartType === 'effect-scatter';

  // Scatter is a true XY plot. The transformer hands us the same numeric
  // {name, series:[{x,y,r}]} shape as bubble (one group per category), so we
  // plot each point at [x, y] on TWO value axes. The previous version used
  // the category name as X and a per-category count as Y on a category x-axis,
  // which flattened every point onto a single horizontal line.
  // Conditional formatting on scatter tests the Y coordinate of each point.
  // When any rule matches, the point is promoted to a `{ value:[x,y],
  // itemStyle:{color} }` object; otherwise it stays a bare `[x,y]` pair.
  const cfRules = Array.isArray(config?.conditionalFormatting)
    ? config.conditionalFormatting
    : [];
  const colorScatterPoint = (pt: any): any => {
    const pair = [pt.x, pt.y];
    if (cfRules.length === 0) return pair;
    const promoted = applyConditionalFormatting(
      [{ value: pair, itemStyle: {} }],
      config,
      [{ value: pt.y }],
      'value',
    )[0];
    // If no rule matched, applyConditionalFormatting returns the object
    // unchanged with an empty itemStyle — collapse back to a bare pair so the
    // palette colour applies.
    if (promoted && promoted.itemStyle && promoted.itemStyle.color) {
      return promoted;
    }
    return pair;
  };

  const series = data.map((group: any, si: number) => ({
    name: String(group.name),
    type: isEffect ? 'effectScatter' : 'scatter',
    data: (group.series || []).map((pt: any) => colorScatterPoint(pt)),
    symbol: config.scatterSymbolShape || 'circle',
    symbolSize: config.scatterSymbolSize || 10,
    ...(isEffect
      ? {
          rippleEffect: {
            brushType: config.effectRippleBrushType || 'stroke',
            scale: config.effectRippleScale ?? 3,
            number: config.effectRippleNumber ?? 3,
            period: config.effectRipplePeriod ?? 4,
          },
          showEffectOn: config.effectShowOn || 'render',
        }
      : buildPerfFlags(config)),
    label: buildDataLabel(config),
    // Reference overlays render once — attach to the first series only.
    ...(si === 0 ? buildMarkOverlays(config) : {}),
    emphasis: {
      focus: config.emphasis || 'series',
      ...(config.emphasisScale === true ? { scale: true } : {}),
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
    },
  }));

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const d = params.value || params.data;
        return `${params.seriesName}<br/>X: ${formatTooltipValue(config, d[0])}, Y: ${formatTooltipValue(config, d[1])}`;
      },
    },
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildValueAxis(config, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series,
  };

  if (config.gradient && option.series) {
    const colors = getColors(config.colorScheme);
    applyGradient(option.series, colors);
  }

  const zoom = buildDataZoom(config, 'x');
  // Always assign — empty array clears a stale slider under merge-mode
  // setOption when Data Zoom is toggled off.
  option.dataZoom = zoom;
  if (zoom.length) {
    option.grid.bottom = (option.grid.bottom || 30) + 40;
  }

  // Value-driven colour scale keyed to the Y dimension. Explicit assign so a
  // stale scale drops under merge-mode setOption.
  const yVals: number[] = [];
  (Array.isArray(data) ? data : []).forEach((g: any) =>
    (g?.series || []).forEach((pt: any) => {
      if (Number.isFinite(Number(pt?.y))) yVals.push(Number(pt.y));
    }),
  );
  option.visualMap = buildVisualMap(
    config,
    yVals.length ? Math.min(...yVals) : 0,
    yVals.length ? Math.max(...yVals) : 100,
    1, // colour by the Y (dimension index 1) of each [x, y] point
  );

  return option;
}

// ========= Funnel Chart =========
export function buildFunnelChartOption(data: any[], config: any): any {
  const funnelData = data.map(d => ({ name: String(d.name), value: d.value }));

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    ...buildLegendWithTitle(config),
    toolbox: buildToolbox(config),
    series: [
      (() => {
        const legendPos = config.legend ? config.legendPosition || 'right' : '';
        // Shift the funnel away from the legend side so they do not
        // overlap. Width contracts when the legend takes a left/right.
        const left =
          legendPos === 'left' ? '32%' : legendPos === 'right' ? '10%' : '10%';
        const width =
          legendPos === 'left' || legendPos === 'right' ? '58%' : '80%';
        const top = legendPos === 'top' ? 50 : 30;
        const bottom = legendPos === 'below' ? 50 : 20;
        return {
          type: 'funnel',
          left,
          top,
          bottom,
          width,
          min: 0,
          max: Math.max(...data.map(d => d.value), 100),
          minSize: config.funnelMinSize || '0%',
          maxSize: config.funnelMaxSize || '100%',
          sort: config.funnelSort || 'descending',
          orient: config.funnelOrient || 'vertical',
          funnelAlign: config.funnelAlign || 'center',
          gap: config.funnelGap ?? 2,
          label: {
            show: config.labels !== false,
            position: config.funnelLabelPosition || 'inside',
            formatter: '{b}: {c}',
            fontSize: config.labelFontSize || 12,
          },
          // Outside labels need a label-line; keep inside/right/left/top/bottom
          // unconnected (line would visually clutter inside the funnel).
          labelLine: { show: config.funnelLabelPosition === 'outside' },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1,
          },
          emphasis: {
            // Hover-emphasized label — one notch above dataLabel so the
            // hovered segment reads as primary.
            label: {
              fontFamily: CHART_TYPOGRAPHY.fontFamily,
              fontSize: CHART_TYPOGRAPHY.tooltip.fontSize,
              fontWeight: CHART_TYPOGRAPHY.chartTitle.fontWeight,
              color: CHART_TYPOGRAPHY.chartTitle.color,
            },
          },
          data: funnelData,
        };
      })(),
    ],
  };
}

// ========= Sunburst Chart =========
export function buildSunburstChartOption(data: any[], config: any): any {
  // Hierarchy-aware: when the transformer returns nodes with children[],
  // pass them through; otherwise flatten to the legacy single-ring shape.
  const sunburstData = data.map(d => {
    if (
      d &&
      typeof d === 'object' &&
      Array.isArray((d as any).children) &&
      (d as any).children.length > 0
    ) {
      return d;
    }
    return { name: String((d as any).name), value: (d as any).value };
  });

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => `${params.name}: ${formatTooltipValue(config, params.value)}`,
    },
    toolbox: buildToolbox(config),
    series: [
      (() => {
        const legendPos = config.legend ? config.legendPosition || 'right' : '';
        const center: [string, string] =
          legendPos === 'left'
            ? ['58%', '50%']
            : legendPos === 'right'
              ? ['42%', '50%']
              : legendPos === 'top'
                ? ['50%', '55%']
                : legendPos === 'below'
                  ? ['50%', '45%']
                  : ['50%', '50%'];
        return {
          type: 'sunburst',
          data: sunburstData,
          center,
          radius: ['15%', config.sunburstRadius || '85%'],
          nodeClick:
            config.sunburstNodeClick === 'false'
              ? false
              : config.sunburstNodeClick || 'rootToNode',
          sort:
            config.sunburstSort === 'none'
              ? null
              : config.sunburstSort || 'desc',
          startAngle: config.sunburstStartAngle ?? 90,
          label: {
            show: config.labels !== false,
            rotate:
              config.sunburstLabelRotate !== undefined
                ? config.sunburstLabelRotate
                : 'radial',
            fontSize: config.labelFontSize || 10,
          },
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fff',
          },
          emphasis: {
            focus: config.sunburstEmphasisFocus || 'ancestor',
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
          },
          levels: [
            {},
            { r0: '15%', r: '50%', label: { rotate: 'tangential' } },
            { r0: '50%', r: '70%', label: { align: 'right' } },
            {
              r0: '70%',
              r: '90%',
              label: { position: 'outside', padding: 3, silent: false },
            },
          ],
        };
      })(),
    ],
  };
}

// ========= Sankey Chart =========
export function buildSankeyChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      triggerOn: 'mousemove',
    },
    toolbox: buildToolbox(config),
    series: [
      {
        type: 'sankey',
        data: nodes,
        links: links,
        orient: config.sankeyOrient || 'horizontal',
        nodeWidth: config.sankeyNodeWidth || 20,
        nodeGap: config.sankeyNodeGap || 8,
        nodeAlign: config.sankeyNodeAlign || 'justify',
        draggable: config.sankeyDraggable !== false,
        layoutIterations: config.sankeyLayoutIterations ?? 32,
        // Default to adjacency-highlight on sankey — it's the visual idiom
        // users expect (hovering a flow lights up its source + target).
        // The user-controlled toggle lets them swap to a different focus mode.
        emphasis: {
          focus:
            config.sankeyFocusAdjacency === false
              ? config.emphasis || 'none'
              : 'adjacency',
        },
        lineStyle: {
          color: 'gradient',
          curveness: config.sankeyCurveness ?? 0.5,
        },
        label: {
          show: config.labels !== false,
          fontSize: config.labelFontSize || 11,
        },
        edgeLabel: {
          show: config.sankeyEdgeLabel || false,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
      },
    ],
  };
}

// ========= Waterfall Chart =========
export function buildWaterfallChartOption(data: any[], config: any): any {
  const categories: string[] = [];
  const positiveData: (number | string)[] = [];
  const negativeData: (number | string)[] = [];
  const transparentData: (number | string)[] = [];

  let runningTotal = 0;

  data.forEach((d, i) => {
    categories.push(String(d.name));
    const value = d.value;

    if (value >= 0) {
      transparentData.push(runningTotal);
      positiveData.push(value);
      negativeData.push('-');
    } else {
      transparentData.push(runningTotal + value);
      positiveData.push('-');
      negativeData.push(Math.abs(value));
    }
    runningTotal += value;
  });

  if (config.waterfallShowTotal !== false) {
    categories.push('Total');
    transparentData.push(0);
    positiveData.push(runningTotal >= 0 ? runningTotal : '-');
    negativeData.push(runningTotal < 0 ? Math.abs(runningTotal) : '-');
  }

  const borderRadius = config.roundEdges ? [4, 4, 0, 0] : undefined;

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'axis'),
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const idx = params[0].dataIndex;
        const cat = categories[idx];
        const pos =
          typeof positiveData[idx] === 'number' ? positiveData[idx] : 0;
        const neg =
          typeof negativeData[idx] === 'number' ? negativeData[idx] : 0;
        const val = (pos as number) - (neg as number);
        return `${cat}: ${val >= 0 ? '+' : ''}${formatTooltipValue(config, val)}`;
      },
    },
    legend: { show: false },
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series: [
      {
        name: 'Base',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: { borderColor: 'transparent', color: 'transparent' },
        emphasis: {
          itemStyle: { borderColor: 'transparent', color: 'transparent' },
        },
        data: transparentData,
      },
      {
        name: 'Increase',
        type: 'bar',
        stack: 'waterfall',
        data: positiveData,
        itemStyle: {
          color: '#5AA454',
          ...(borderRadius ? { borderRadius } : {}),
        },
        label: buildDataLabel(config, 'top'),
        // Reference overlays render once — attach to a single visible series.
        ...buildMarkOverlays(config),
      },
      {
        name: 'Decrease',
        type: 'bar',
        stack: 'waterfall',
        data: negativeData,
        itemStyle: {
          color: '#C62828',
          ...(borderRadius ? { borderRadius } : {}),
        },
        label: buildDataLabel(config, 'bottom'),
      },
    ],
  };

  const zoom = buildDataZoom(config, 'x');
  // Always assign — empty array clears a stale slider under merge-mode
  // setOption when Data Zoom is toggled off.
  option.dataZoom = zoom;
  if (zoom.length) {
    option.grid.bottom = (option.grid.bottom || 30) + 40;
  }

  return option;
}

// ========= Box Plot Chart =========
export function buildBoxPlotChartOption(data: any[], config: any): any {
  const categories: string[] = [];
  const boxData: number[][] = [];

  data.forEach(item => {
    categories.push(String(item.name || item.label || ''));

    if (item.whiskers && item.box) {
      boxData.push([
        item.whiskers[0],
        item.box[0],
        item.median || (item.box[0] + item.box[1]) / 2,
        item.box[1],
        item.whiskers[1],
      ]);
    } else if (item.data && Array.isArray(item.data)) {
      const sorted = [...item.data].sort((a: number, b: number) => a - b);
      const len = sorted.length;
      if (len === 0) {
        boxData.push([0, 0, 0, 0, 0]);
      } else {
        const q1 = sorted[Math.floor(len * 0.25)];
        const median = sorted[Math.floor(len * 0.5)];
        const q3 = sorted[Math.floor(len * 0.75)];
        boxData.push([sorted[0], q1, median, q3, sorted[len - 1]]);
      }
    } else if (item.series && Array.isArray(item.series)) {
      const values = item.series
        .map((s: any) => s.value)
        .sort((a: number, b: number) => a - b);
      const len = values.length;
      if (len === 0) {
        boxData.push([0, 0, 0, 0, 0]);
      } else {
        const q1 = values[Math.floor(len * 0.25)];
        const median = values[Math.floor(len * 0.5)];
        const q3 = values[Math.floor(len * 0.75)];
        boxData.push([values[0], q1, median, q3, values[len - 1]]);
      }
    } else if (Array.isArray(item.value) && item.value.length === 5) {
      // New transformer shape: { name, value: [min, q1, median, q3, max] }
      // — already a 5-tuple, pass through unchanged.
      boxData.push(item.value);
    } else if (item.value !== undefined) {
      // Fallback for single-value rows (degenerate box).
      boxData.push([
        item.value,
        item.value,
        item.value,
        item.value,
        item.value,
      ]);
    }
  });

  const isVerticalLayout = config.boxplotLayout === 'vertical';

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const d = params.data;
        const f = (v: any) => formatTooltipValue(config, v);
        return `${params.name}<br/>Min: ${f(d[0])}<br/>Q1: ${f(d[1])}<br/>Median: ${f(d[2])}<br/>Q3: ${f(d[3])}<br/>Max: ${f(d[4])}`;
      },
    },
    ...buildLegendWithTitle(config),
    // Box plot previously omitted toolbox — toggle was a silent no-op.
    toolbox: buildToolbox(config),
    grid: buildGrid(config),
    series: [
      {
        type: 'boxplot',
        data: boxData,
        layout: config.boxplotLayout || 'horizontal',
        boxWidth: [
          config.boxplotBoxWidth ?? 7,
          config.boxplotBoxMaxWidth ?? 50,
        ],
        // Reference lines / bands / annotations. Empty when unconfigured.
        ...buildMarkOverlays(config),
      },
    ],
  };

  if (isVerticalLayout) {
    option.yAxis = buildCategoryAxis(config, categories, 'y');
    option.xAxis = { ...buildValueAxis(config, 'x'), nice: true };
  } else {
    option.xAxis = buildCategoryAxis(config, categories, 'x');
    option.yAxis = { ...buildValueAxis(config, 'y'), nice: true };
  }

  return option;
}

// ========= Graph / Network Chart =========
export function buildGraphChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    toolbox: buildToolbox(config),
    ...buildLegendWithTitle(config),
    series: [
      {
        type: 'graph',
        layout: config.graphLayout || 'force',
        roam: true,
        draggable: config.graphDraggable !== false,
        edgeSymbol:
          config.graphEdgeSymbol && config.graphEdgeSymbol !== 'none'
            ? ['circle', config.graphEdgeSymbol]
            : undefined,
        edgeSymbolSize: config.graphEdgeSymbolSize ?? 10,
        data: nodes.map((n: any) => ({
          ...n,
          symbolSize: Math.max(10, Math.min(n.value || 20, 60)),
          label: {
            show: config.labels !== false,
            fontSize: config.labelFontSize || 11,
          },
        })),
        links: links,
        categories: [],
        force: {
          repulsion: config.graphRepulsion || 200,
          edgeLength: config.graphEdgeLength || 100,
          gravity: config.graphGravity ?? 0.1,
          friction: config.graphForceFriction ?? 0.6,
          // Live layout — when true, ECharts keeps running the force
          // simulation after the initial paint (gives the "settling"
          // animation you'd see in dedicated graph tools). When false,
          // the layout freezes after the first frame.
          layoutAnimation: config.graphForceLayoutAnimation !== false,
        },
        // Only meaningful for the circular layout but harmless when set
        // for other layouts (ECharts ignores it).
        circular: { rotateLabel: config.graphCircularRotateLabel === true },
        edgeLabel: {
          show: config.graphEdgeLabel || false,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
        lineStyle: {
          color: 'source',
          curveness: 0.3,
          opacity: 0.6,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 },
        },
      },
    ],
  };
}

// ========= Tree Chart =========
export function buildTreeChartOption(data: any[], config: any): any {
  // The transformer (transformToHierarchy) returns a forest of root nodes
  // when parentColumn is set, or a flat array of leaves otherwise. ECharts
  // tree expects a single root, so we synthesise one when the input has
  // multiple roots or no `children` on the first item.
  const isAlreadyHierarchical =
    data.length > 0 &&
    data[0] &&
    typeof data[0] === 'object' &&
    Array.isArray((data[0] as any).children);
  const treeData =
    isAlreadyHierarchical && data.length === 1
      ? (data[0] as any)
      : {
          name: 'Root',
          children: data.map(d => {
            // Hierarchical entries already have a children[] of their own
            if (
              d &&
              typeof d === 'object' &&
              Array.isArray((d as any).children)
            ) {
              return d;
            }
            return { name: String((d as any).name), value: (d as any).value };
          }),
        };

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) =>
        `${params.name}${params.value ? ': ' + formatTooltipValue(config, params.value) : ''}`,
    },
    toolbox: buildToolbox(config),
    series: [
      {
        type: 'tree',
        data: [treeData],
        orient: config.treeOrient || 'TB',
        layout: config.treeLayout || 'orthogonal',
        edgeShape: config.treeEdgeShape || 'curve',
        edgeForkPosition: config.treeEdgeForkPosition || '50%',
        roam: config.treeRoam || false,
        symbol: 'circle',
        symbolSize: 10,
        label: {
          show: config.labels !== false,
          position:
            config.treeOrient === 'LR' || config.treeOrient === 'RL'
              ? 'right'
              : 'top',
          fontSize: config.labelFontSize || 11,
        },
        leaves: {
          label: {
            position:
              config.treeOrient === 'LR' || config.treeOrient === 'RL'
                ? 'right'
                : 'bottom',
          },
        },
        expandAndCollapse: config.treeExpandAndCollapse !== false,
        animationDuration: 550,
        animationDurationUpdate: 750,
        initialTreeDepth: config.treeInitialDepth ?? 3,
      },
    ],
  };
}

// ========= Theme River Chart =========
export function buildThemeRiverChartOption(data: any[], config: any): any {
  // The new transformer (transformToThemeRiver) emits [time, value, category]
  // triples directly when `timeColumn` is set. Older paths and the
  // single-series fallback still arrive as `{name, value}[]` — wrap those
  // into the canonical triple form using row-index as the synthetic time.
  // Detect the shape by inspecting the first row.
  const isAlreadyTripleShape =
    data.length > 0 && Array.isArray(data[0]) && data[0].length === 3;
  const riverData = isAlreadyTripleShape
    ? data
    : data.map((d, i) => [i, d.value, String(d.name)]);

  // Theme-river works best with a time axis. If row[0] looks like an ISO
  // string or Date, switch the singleAxis to `time`; otherwise keep value.
  const firstTime = riverData[0]?.[0];
  const axisType =
    firstTime instanceof Date ||
    (typeof firstTime === 'string' && !Number.isNaN(Date.parse(firstTime)))
      ? 'time'
      : 'value';

  const boundaryGapPct = config.themeRiverBoundaryGap ?? 10;

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    singleAxis: {
      type: axisType,
      bottom: 30,
    },
    series: [
      {
        type: 'themeRiver',
        data: riverData,
        // ECharts themeRiver expects boundaryGap as a [top, bottom] pair
        // of percent strings — derive from the single % the user set.
        boundaryGap: [`${boundaryGapPct}%`, `${boundaryGapPct}%`],
        label: {
          show: config.labels !== false,
          position: config.themeRiverLabelPosition || 'left',
          fontSize: config.labelFontSize || 11,
        },
        emphasis: {
          focus: config.emphasis || 'self',
          ...(config.emphasisScale === true ? { scale: true } : {}),
          itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.3)' },
        },
      },
    ],
  };
}

// ========= Pictorial Bar Chart =========
export function buildPictorialBarChartOption(data: any[], config: any): any {
  const categories = data.map(d => String(d.name));
  const values = data.map(d => d.value);

  const symbol = config.pictorialSymbol || 'roundRect';

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    toolbox: buildToolbox(config),
    grid: buildGrid(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series: [
      {
        type: 'pictorialBar',
        data: values,
        symbol: symbol,
        symbolRepeat: config.pictorialRepeat ? 'fixed' : false,
        symbolSize: config.pictorialRepeat ? ['50%', 14] : ['100%', '100%'],
        symbolPosition: config.pictorialSymbolPosition || 'start',
        symbolClip: config.pictorialSymbolClip !== false,
        symbolRepeatDirection: config.pictorialSymbolRepeatDirection || 'start',
        // pictorialSymbolMargin (user override) wins; fall back to the
        // repeat-aware default (2px between repeated symbols, 'auto' for the
        // single-symbol case). Without this read, the Properties pane's
        // "Symbol Margin" input was a no-op.
        symbolMargin:
          config.pictorialSymbolMargin != null && config.pictorialSymbolMargin !== ''
            ? config.pictorialSymbolMargin
            : config.pictorialRepeat
              ? 2
              : 'auto',
        barCategoryGap: '40%',
        label: buildDataLabel(config, 'top'),
      },
    ],
  };
}

// ========= Polar Bar Chart =========
export function buildPolarBarChartOption(data: any[], config: any): any {
  const categories = data.map(d => String(d.name));
  const values = data.map(d => d.value);

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    toolbox: buildToolbox(config),
    ...buildLegendWithTitle(config),
    angleAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
        fontSize: CHART_TYPOGRAPHY.axisLabel.fontSize,
        color: CHART_TYPOGRAPHY.axisLabel.color,
      },
    },
    radiusAxis: {
      show: config.yAxis !== false,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    polar: (() => {
      const pos = config.legend ? config.legendPosition || 'right' : '';
      // When the legend takes a side, shift the polar centre away
      // from it so the chart does not sit under the legend area.
      const center: [string, string] =
        pos === 'left'
          ? ['58%', '50%']
          : pos === 'right'
            ? ['42%', '50%']
            : pos === 'top'
              ? ['50%', '55%']
              : pos === 'below'
                ? ['50%', '45%']
                : ['50%', '50%'];
      return {
        center,
        radius: [`${config.polarBarInnerRadius ?? 15}%`, '75%'],
      };
    })(),
    series: [
      {
        type: 'bar',
        data: values,
        coordinateSystem: 'polar',
        label: buildDataLabel(config, 'middle'),
        itemStyle: {
          borderRadius: config.roundEdges ? 4 : 0,
        },
      },
    ],
  };
}

// ========= Radar Chart (standalone) =========
export function buildRadarChartOption(data: any[] | any, config: any): any {
  // New transformer returns `{indicators: [{name, max}], series: [{name, value: number[]}]}`.
  // Legacy `[{name, series: [{name, value}]}]` is detected and routed to the
  // old polar-style fallback for visuals that haven't migrated to indicatorColumns yet.
  const isNewShape =
    data &&
    !Array.isArray(data) &&
    Array.isArray((data as any).indicators) &&
    Array.isArray((data as any).series);
  if (!isNewShape) {
    return buildPolarChartOption(data as any[], config);
  }

  const { indicators, series } = data as {
    indicators: { name: string; max: number }[];
    series: { name: string; value: number[] }[];
  };

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
    },
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    radar: {
      indicator: indicators,
      shape: config.radarShape || 'polygon',
      splitNumber: config.radarSplitNumber ?? 5,
      axisName: {
        color: '#666',
        fontSize: config.labelFontSize || 12,
      },
    },
    series: [
      {
        type: 'radar',
        data: series,
        symbol: config.radarSymbol || 'circle',
        symbolSize: config.radarSymbolSize ?? 6,
        lineStyle: { width: config.radarLineWidth ?? 2 },
        areaStyle: { opacity: config.radarAreaOpacity ?? 0.2 },
        emphasis: { focus: 'self' },
      },
    ],
  };
}

// ========= Candlestick Chart =========
export function buildCandlestickChartOption(
  data: any[] | any,
  config: any,
): any {
  // The new OHLC transformer returns `{categories, values}` where values is
  // an array of `[open, close, low, high]` 4-tuples (ECharts canonical
  // ordering, see https://echarts.apache.org/en/option.html#series-candlestick.data).
  // Older inputs (`{name, value:[o,c,l,h]}[]` or bare `number[][]`) are still
  // honoured so existing dashboards keep working.
  let categories: string[] = [];
  let values: any[] = [];

  if (data && !Array.isArray(data) && Array.isArray((data as any).values)) {
    categories = (data as any).categories ?? [];
    values = (data as any).values;
  } else if (Array.isArray(data) && data.length > 0) {
    if (data[0].value && Array.isArray(data[0].value)) {
      categories = data.map(d => String(d.name));
      values = data.map(d => d.value);
    } else if (Array.isArray(data[0])) {
      categories = data.map((_, i) => `Day ${i + 1}`);
      values = data as number[][];
    } else {
      return {};
    }
  } else {
    return {};
  }

  const option: any = {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'axis'),
      formatter: (params: any) => {
        const d = params[0];
        if (!d) return '';
        const f = (v: any) => formatTooltipValue(config, v);
        return `${d.name}<br/>Open: ${f(d.data[0])}<br/>Close: ${f(d.data[1])}<br/>Low: ${f(d.data[2])}<br/>High: ${f(d.data[3])}`;
      },
    },
    // Candlestick previously omitted toolbox.
    toolbox: buildToolbox(config),
    grid: buildGrid(config),
    xAxis: {
      type: 'category',
      data: categories,
      show: config.xAxis !== false,
      axisLabel: {
        rotate: config.xAxisLabelRotate || 0,
      },
    },
    yAxis: {
      type: 'value',
      show: config.yAxis !== false,
      scale: config.autoScale || false,
      splitLine: { show: config.showGridLines !== false },
      nice: config.niceScale || false,
    },
    series: [
      {
        type: 'candlestick',
        data: values,
        // `large` switches to batch-rendered primitives — per-item itemStyle
        // is ignored above this threshold, but candlestick rendering cost
        // drops dramatically. Off by default to preserve the bull/bear
        // colour scheme on small/medium charts.
        large: config.candleLarge === true,
        largeThreshold: config.candleLargeThreshold ?? 600,
        itemStyle: {
          color: config.candleBullColor || '#ec0000',
          color0: config.candleBearColor || '#00da3c',
          borderColor:
            config.candleBullBorderColor || config.candleBullColor || '#ec0000',
          borderColor0:
            config.candleBearBorderColor || config.candleBearColor || '#00da3c',
        },
        ...(config.candleBarWidth ? { barWidth: config.candleBarWidth } : {}),
        // Reference lines / bands / annotations. Empty when unconfigured.
        ...buildMarkOverlays(config),
      },
    ],
  };

  const zoom = buildDataZoom(config);
  if (zoom.length) {
    option.dataZoom = zoom;
    option.grid.bottom = (option.grid.bottom || 30) + 40;
  }

  return option;
}

// ========= Parallel Chart =========
export function buildParallelChartOption(data: any[] | any, config: any): any {
  // New transformer returns `{axes: [{dim, name, type}], data: [[v0..vN]|{name,value}]}`.
  // Legacy: `{dimensions: [...], data: [[...]]}` or array-of-objects.
  let dimensions: string[] = [];
  let seriesData: any[] = [];
  let parallelAxis: any[];

  if (data && !Array.isArray(data) && Array.isArray((data as any).axes)) {
    parallelAxis = (data as any).axes;
    dimensions = parallelAxis.map((a: any) => a.name);
    seriesData = (data as any).data ?? [];
  } else if (Array.isArray(data) && data.length > 0 && data[0].dimensions) {
    dimensions = data[0].dimensions;
    seriesData = data[0].data || [];
    parallelAxis = dimensions.map((dim, i) => ({
      dim: i,
      name: dim,
      type: typeof seriesData[0]?.[i] === 'number' ? 'value' : 'category',
    }));
  } else if (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === 'object' &&
    !Array.isArray(data[0])
  ) {
    dimensions = Object.keys(data[0]);
    seriesData = data.map(d => dimensions.map(dim => d[dim]));
    parallelAxis = dimensions.map((dim, i) => ({
      dim: i,
      name: dim,
      type: typeof seriesData[0]?.[i] === 'number' ? 'value' : 'category',
    }));
  } else {
    return {};
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    ...buildLegendWithTitle(config),
    // Parallel previously omitted toolbox.
    toolbox: buildToolbox(config),
    parallelAxis,
    parallel: (() => {
      const pos = config.legend ? config.legendPosition || 'right' : '';
      return {
        left: pos === 'left' ? 140 : 40,
        right: pos === 'right' ? 140 : 40,
        bottom: pos === 'below' ? 60 : 40,
        top: pos === 'top' ? 50 : 30,
        // axisExpandable enables click-and-drag on an axis to spread
        // adjacent axes (useful when there are many dimensions).
        axisExpandable: config.parallelAxisExpandable === true,
        axisExpandCount: config.parallelAxisExpandCount ?? 0,
        axisExpandCenter:
          config.parallelAxisExpandable && config.parallelAxisExpandCount
            ? Math.floor(parallelAxis.length / 2)
            : undefined,
        parallelAxisDefault: {
          type: 'value',
          nameLocation: 'end',
          nameGap: 12,
          nameTextStyle: {
            ...CHART_TYPOGRAPHY.axisName,
            fontFamily: CHART_TYPOGRAPHY.fontFamily,
          },
          axisLabel: {
            ...CHART_TYPOGRAPHY.axisLabel,
            fontFamily: CHART_TYPOGRAPHY.fontFamily,
          },
        },
      };
    })(),
    series: [
      {
        type: 'parallel',
        lineStyle: {
          width: config.parallelLineWidth || 1,
          opacity: config.parallelLineOpacity ?? 0.5,
        },
        smooth: config.parallelSmooth || false,
        activeOpacity: config.parallelActiveOpacity ?? 1,
        inactiveOpacity: config.parallelInactiveOpacity ?? 0.1,
        realtime: config.parallelRealtime !== false,
        data: seriesData,
      },
    ],
  };
}

// ========= 3D Charts (require echarts-gl) =========

// ========= Bar 3D Chart =========
export function buildBar3DChartOption(data: any[], config: any): any {
  // Data format: [[x, y, z], ...] or [{ name, value: [x, y, z] }, ...]
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  const maxVal = Math.max(...seriesData.map(d => d[2] || 0), 1);

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    visualMap: {
      max: maxVal,
      show: false,
    },
    xAxis3D: build3DAxis('category', config.xAxisLabel || ''),
    yAxis3D: build3DAxis('category', config.yAxisLabel || ''),
    zAxis3D: build3DAxis('value', config.zAxisLabel || ''),
    grid3D: build3DGrid(config),
    series: [
      {
        type: 'bar3D',
        data: seriesData.map(d => ({ value: d })),
        shading: config.shading || 'lambert',
        label: {
          show: config.showDataLabel || false,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
        itemStyle: { opacity: config.itemOpacity ?? 0.8 },
      },
    ],
  };
}

// ========= Line 3D Chart =========
export function buildLine3DChartOption(data: any[], config: any): any {
  // Data format: [[x, y, z], ...]
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    xAxis3D: build3DAxis('value', config.xAxisLabel || ''),
    yAxis3D: build3DAxis('value', config.yAxisLabel || ''),
    zAxis3D: build3DAxis('value', config.zAxisLabel || ''),
    grid3D: build3DGrid(config),
    series: [
      {
        type: 'line3D',
        data: seriesData,
        lineStyle: {
          width: config.lineWidth || 2,
          opacity: config.lineOpacity ?? 1,
        },
      },
    ],
  };
}

// ========= Scatter 3D Chart =========
export function buildScatter3DChartOption(data: any[], config: any): any {
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    xAxis3D: build3DAxis('value', config.xAxisLabel || ''),
    yAxis3D: build3DAxis('value', config.yAxisLabel || ''),
    zAxis3D: build3DAxis('value', config.zAxisLabel || ''),
    grid3D: build3DGrid(config),
    series: [
      {
        type: 'scatter3D',
        data: seriesData,
        symbolSize: config.scatterSymbolSize || 10,
        itemStyle: {
          opacity: config.itemOpacity ?? 0.8,
        },
      },
    ],
  };
}

// ========= Surface Chart =========
export function buildSurfaceChartOption(data: any[], config: any): any {
  // Data format: [[x, y, z], ...] coordinate grid
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0]?.value) {
    seriesData = data.map(d => d.value);
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    visualMap: {
      show: config.showVisualMap || false,
      dimension: 2,
    },
    xAxis3D: build3DAxis('value', config.xAxisLabel || ''),
    yAxis3D: build3DAxis('value', config.yAxisLabel || ''),
    zAxis3D: build3DAxis('value', config.zAxisLabel || ''),
    grid3D: build3DGrid(config),
    series: [
      {
        type: 'surface',
        data: seriesData,
        shading: config.shading || 'lambert',
        wireframe: { show: config.wireframe !== false },
        itemStyle: { opacity: config.itemOpacity ?? 0.9 },
      },
    ],
  };
}

// ========= Globe Chart =========
export function buildGlobeChartOption(data: any[], config: any): any {
  // Data format: [{ name, value: [lng, lat, value] }, ...]
  let seriesData: any[] = [];
  let tooltipNames: string[] = [];
  if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
    tooltipNames = data.map(d => d.name || '');
  } else if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const idx = params.dataIndex;
        const name = tooltipNames[idx] || '';
        const val = formatTooltipValue(config, params.value?.[2] ?? '');
        return name ? `${name}: ${val}` : `${val}`;
      },
    },
    globe: {
      baseColor: config.globeBaseColor || '#304156',
      shading: 'color',
      viewControl: {
        autoRotate: config.autoRotate !== false,
        autoRotateSpeed: config.autoRotateSpeed || 10,
        // Pulled back so the globe + scatter points sit comfortably
        // in the card without clipping at edges.
        distance: config.viewDistance ?? 260,
      },
      light: {
        main: { intensity: 1.2, shadow: false },
        ambient: { intensity: 0.6 },
      },
      layers: [
        {
          type: 'blend',
          blendTo: 'emission',
          texture: 'none',
        },
      ],
    },
    series: [
      {
        type: 'scatter3D',
        coordinateSystem: 'globe',
        data: seriesData,
        symbolSize: (val: any) => Math.max(6, (val?.[2] || 10) / 5),
        label: {
          show: config.showDataLabel || false,
          formatter: (params: any) => tooltipNames[params.dataIndex] || '',
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
        itemStyle: {
          opacity: 0.9,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.4)',
        },
      },
    ],
  };
}

// ========= Graph GL Chart =========
export function buildGraphGLChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  // Handle multiple data formats:
  // 1. Object with nodes/links: { nodes: [...], links: [...] }
  // 2. Array where first element has nodes/links
  // 3. Separate arrays: nodes[], links[]
  let graphNodes: any[] = [];
  let graphLinks: any[] = [];

  if (nodes && !Array.isArray(nodes) && (nodes as any).nodes) {
    // Data passed as object { nodes, links }
    graphNodes = (nodes as any).nodes;
    graphLinks = (nodes as any).links || [];
  } else if (
    Array.isArray(nodes) &&
    nodes.length > 0 &&
    nodes[0]?.nodes &&
    nodes[0]?.links
  ) {
    // Array where first element wraps nodes/links
    graphNodes = nodes[0].nodes;
    graphLinks = nodes[0].links;
  } else if (Array.isArray(nodes)) {
    graphNodes = nodes;
    graphLinks = Array.isArray(links) ? links : [];
  }

  if (!graphNodes.length) return {};

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    series: [
      {
        type: 'graphGL',
        nodes: graphNodes.map((n: any, i: number) => ({
          name: String(n.name || n.id || i),
          value: n.value || 1,
          symbolSize: n.symbolSize || config.nodeSize || 10,
          x: Math.random() * 200 - 100,
          y: Math.random() * 200 - 100,
        })),
        edges: graphLinks.map((l: any) => ({
          source: String(l.source),
          target: String(l.target),
        })),
        forceAtlas2: {
          steps: 100,
          gravity: config.graphGravity || 0.1,
          edgeWeightInfluence: 1,
        },
      },
    ],
  };
}

// ========= Scatter GL Chart =========
export function buildScatterGLChartOption(data: any[], config: any): any {
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => [d.value[0], d.value[1]]);
  } else if (data.length > 0 && data[0].name !== undefined) {
    seriesData = data.map(d => [d.name, d.value]);
  }

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'item'),
    xAxis: {
      type: 'value',
      show: config.xAxis !== false,
      splitLine: { show: config.showGridLines !== false },
    },
    yAxis: {
      type: 'value',
      show: config.yAxis !== false,
      splitLine: { show: config.showGridLines !== false },
    },
    series: [
      {
        type: 'scatterGL',
        data: seriesData,
        symbolSize: config.scatterSymbolSize || 5,
        itemStyle: {
          opacity: config.itemOpacity ?? 0.6,
        },
      },
    ],
  };
}

// ========= Lines GL Chart =========
export function buildLinesGLChartOption(data: any[], config: any): any {
  // Data format: [{ coords: [[x1, y1], [x2, y2], ...] }, ...]
  // 'lines' and 'linesGL' series types require geo coordinates,
  // so we render each polyline as a separate 'line' series on cartesian2d.
  let polylines: number[][][] = [];
  if (data.length > 0 && data[0].coords) {
    polylines = data.map((d: any) => d.coords);
  } else if (data.length > 0 && Array.isArray(data[0])) {
    polylines = data;
  }

  const colors = getColors(config.colorScheme);
  const series = polylines.map((coords: number[][], i: number) => ({
    type: 'line',
    data: coords,
    showSymbol: false,
    lineStyle: {
      width: config.lineWidth || 1,
      opacity: config.lineOpacity ?? 0.5,
    },
    color: colors[i % colors.length],
    silent: true,
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    xAxis: {
      type: 'value',
      show: config.xAxis !== false,
      splitLine: { show: config.showGridLines !== false },
    },
    yAxis: {
      type: 'value',
      show: config.yAxis !== false,
      splitLine: { show: config.showGridLines !== false },
    },
    legend: { show: false },
    series,
  };
}

// ========= Map 3D Chart =========
// Renders as a 3D bar chart with region labels since map GeoJSON registration is not available.
export function buildMap3DChartOption(data: any[], config: any): any {
  // Data format: [{ name: 'region', value: number }, ...]
  const seriesData = data.map(d => ({
    name: String(d.name),
    value:
      typeof d.value === 'number'
        ? d.value
        : Array.isArray(d.value)
          ? d.value[2] || 0
          : 0,
  }));

  const categories = seriesData.map(d => d.name);
  const values = seriesData.map((d, i) => [i, 0, d.value]);
  const maxVal = Math.max(...seriesData.map(d => d.value || 0), 1);

  return {
    color: getColors(config.colorScheme),
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) =>
        `${params.name || categories[params.value?.[0]] || ''}: ${formatTooltipValue(config, params.value?.[2] ?? '')}`,
    },
    visualMap: {
      show: config.showVisualMap !== false,
      min: 0,
      max: maxVal,
    },
    xAxis3D: {
      ...build3DAxis('category', ''),
      data: categories,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
        rotate: 30,
        margin: 12,
      },
    },
    yAxis3D: {
      ...build3DAxis('category', ''),
      data: [''],
    },
    zAxis3D: build3DAxis('value', config.zAxisLabel || 'Value'),
    grid3D: {
      ...build3DGrid(config),
      // Map3D is a flat bar grid (depth: 40 default) since y is a
      // single category — override depth to keep that shape but
      // inherit all the rest (camera distance, margins, typography).
      boxWidth: 100,
      boxDepth: 30,
      boxHeight: 60,
      light: {
        main: { intensity: 1.2 },
        ambient: { intensity: 0.3 },
      },
    },
    series: [
      {
        type: 'bar3D',
        data: values.map((v, i) => ({ value: v, name: categories[i] })),
        shading: 'lambert',
        label: {
          show: config.showDataLabel || false,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
        itemStyle: { opacity: 0.85 },
      },
    ],
  };
}

// ========= Flow GL Chart =========
// Renders a vector field as directional arrows on a cartesian grid.
// Data format: [{ data: [[x, y, vx, vy], ...] }]
// ========= Geo: shared data resolution =========
//
// Wave 4 geo pipeline. Map builders (world-map / choropleth / point-map /
// bubble-map) consume the GeoConfig on `config.geo` plus flat geo* fallbacks,
// and accept EITHER pre-shaped data OR raw analysis rows:
//   - Choropleth: pre-shaped `{ name, value }[]` is used as-is. Raw rows (array
//     of flat objects) are joined to feature names via joinRegionData when the
//     geo region/value fields are configured.
//   - Point/bubble: rows are turned into validated `[lon, lat, value]` points
//     via buildLatLonPoints.
// The registered map NAME comes from `config.geo.regionSet` (via the renderer's
// getRequiredMap contract); the builder binds `series.map` to the same name so
// it must already be registered (the renderer awaits ensureMapRegistered).
//
// IMPORTANT: these builders never fetch or register anything — that is the
// renderer + GeoRegistryService's job. They are pure option producers.

/** Read the geo field config (typed GeoConfig on `config.geo` + fallbacks). */
function readGeoFields(config: any): {
  regionSet: string;
  regionField?: string;
  valueField: string;
  latField?: string;
  lonField?: string;
  labelField?: string;
  codeField?: string;
  codeProperty?: string;
  nameProperty: string;
  useAliases: boolean;
} {
  const geo = config?.geo || {};
  return {
    regionSet: String(geo.regionSet || geo.mapId || config?.geoRegionSet || 'world'),
    regionField: geo.regionField || config?.geoRegionField,
    valueField: geo.valueField || config?.geoValueField || 'value',
    latField: geo.latField || config?.geoLatField,
    lonField: geo.lonField || config?.geoLonField,
    labelField: geo.labelField || config?.geoLabelField,
    codeField: geo.codeField || config?.geoCodeField,
    codeProperty: geo.codeProperty || config?.geoCodeProperty,
    // GeoJSON property the series matches names against (region-set-agnostic).
    nameProperty: geo.nameProperty || config?.worldMapNameProperty || 'name',
    // English alias convenience layer — on by default, disableable.
    useAliases: geo.useAliases !== false,
  };
}

/**
 * True when `data` looks like the ECharts map shape already ({name,value}[]),
 * vs raw analysis rows we still need to join. A row with a `value` key AND a
 * `name` key is treated as pre-shaped; anything else with the configured
 * region field is treated as raw rows.
 */
function isPreShapedRegionData(data: any[]): boolean {
  if (!Array.isArray(data) || data.length === 0) return true;
  const first = data[0];
  return (
    first !== null &&
    typeof first === 'object' &&
    'name' in first &&
    'value' in first
  );
}

/**
 * Resolve choropleth `{name,value}[]` from either pre-shaped data or raw rows.
 * Returns the data plus any unmatched region labels (for a UI warning — stamped
 * on the option under `__geoUnmatched` so a caller can surface it without a
 * separate channel; ECharts ignores unknown top-level keys).
 */
function resolveRegionData(
  data: any[],
  config: any,
): { data: { name: string; value: number }[]; unmatched: string[] } {
  const fields = readGeoFields(config);
  if (isPreShapedRegionData(data) || !fields.regionField) {
    // Already shaped (or we lack the fields to join) — pass through, coercing
    // value to number and name to string.
    const shaped = (Array.isArray(data) ? data : []).map((d: any) => ({
      name: String(d?.name ?? ''),
      value: typeof d?.value === 'number' ? d.value : Number(d?.value) || 0,
    }));
    return { data: shaped, unmatched: [] };
  }
  // Raw rows → join to feature names / codes.
  const join = joinRegionData(
    data,
    {
      regionField: fields.regionField,
      valueField: fields.valueField,
      nameProperty: fields.nameProperty,
      codeField: fields.codeField,
      codeProperty: fields.codeProperty,
      useAliases: fields.useAliases,
    },
    // The GeoJSON is registered with ECharts by name; the builder can't read it
    // back, so name-matching against the registered topology happens inside
    // ECharts. For the join we still need the topology to resolve canonical
    // names — callers that want name normalisation pass it on config.geojson.
    config?.geojson || config?.geo?.geojson || { features: [] },
  );
  return { data: join.data, unmatched: join.unmatched };
}

// ========= Choropleth / World Map Chart =========
// Data-bound region-shaded map. `mapName` is the registered region set (world /
// us-states / any asset the BE serves); the series binds to it by name and
// colours regions by value via a continuous visualMap.
// Data: pre-shaped `{ name, value }[]` OR raw rows + geo field config.
export function buildChoroplethOption(data: any[], config: any): any {
  const fields = readGeoFields(config);
  const resolved = resolveRegionData(data, config);
  const rows = resolved.data;

  const colors = getColors(config.colorScheme || 'default');
  const values = rows.map(d => (typeof d.value === 'number' ? d.value : 0));
  const minVal =
    config.worldMapVisualMapMin ??
    config.geoVisualMapMin ??
    (values.length ? Math.min(...values) : 0);
  const maxVal =
    config.worldMapVisualMapMax ??
    config.geoVisualMapMax ??
    (values.length ? Math.max(...values) : 100);
  // Diverging low→high; palette is reversed so the first (strongest) colour
  // maps to the high end, matching the rest of the app's colour direction.
  const colorLow = colors[colors.length - 1] || '#e0f3f8';
  const colorHigh = colors[0] || '#08589e';

  const option: any = {
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) =>
        `${params.name}: ${
          params.value == null || Number.isNaN(params.value)
            ? 'N/A'
            : formatTooltipValue(config, params.value)
        }`,
    },
    visualMap: {
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 100,
      text: ['High', 'Low'],
      realtime: false,
      calculable: true,
      orient: config.visualMapOrient || 'vertical',
      left: 0,
      bottom: 20,
      inRange: {
        color: Array.isArray(config.visualMapColors) &&
          config.visualMapColors.length >= 2
          ? config.visualMapColors
          : [colorLow, colorHigh],
      },
      textStyle: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    series: [
      {
        type: 'map',
        map: fields.regionSet,
        // Legacy alias kept so older ECharts option readers still bind.
        mapType: fields.regionSet,
        roam: config.worldMapRoam !== false,
        nameProperty: fields.nameProperty,
        aspectScale: config.worldMapAspectScale ?? 0.75,
        selectedMode: config.worldMapSelectable ? 'single' : false,
        label: {
          show: config.worldMapShowLabels || false,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.dataLabel.fontSize,
          color: CHART_TYPOGRAPHY.dataLabel.color,
        },
        emphasis: {
          label: { show: true },
          itemStyle: { areaColor: adjustColorOpacity(colorHigh, 0.8) },
        },
        itemStyle: {
          borderColor: CHART_TYPOGRAPHY.colors.axis,
          borderWidth: 0.5,
        },
        data: rows,
      },
    ],
  };
  // Surface unmatched regions for a UI warning without a side channel. ECharts
  // ignores unknown top-level option keys, so this is inert to rendering.
  if (resolved.unmatched.length) {
    option.__geoUnmatched = resolved.unmatched;
  }
  return option;
}

/**
 * World map — retained id `world-map`. Now data-bound: delegates to the
 * choropleth builder with the region set defaulted to 'world'. Existing configs
 * that passed pre-shaped `{name,value}[]` still render (pass-through path).
 */
export function buildWorldMapChartOption(data: any[], config: any): any {
  // Ensure the region set defaults to 'world' for the legacy world-map id
  // without mutating the caller's config object.
  const geo = { ...(config?.geo || {}) };
  if (!geo.regionSet && !geo.mapId) geo.regionSet = 'world';
  return buildChoroplethOption(data, { ...config, geo });
}

// ========= Point Map / Bubble Map =========
// Markers positioned at lat/lon on a geo coordinate system. Point map = fixed
// symbol size; bubble map = symbol size encodes a measure. Binds the geo
// coordinateSystem to the registered region set so the basemap draws behind the
// points. Data: raw rows with lat/lon (+ optional value/label) fields.
function buildGeoScatterOption(
  data: any[],
  config: any,
  variant: 'point' | 'bubble',
): any {
  const fields = readGeoFields(config);
  const colors = getColors(config.colorScheme || 'default');
  const primary = colors[0] || '#5470c6';

  const built = fields.latField && fields.lonField
    ? buildLatLonPoints(data, {
        latField: fields.latField,
        lonField: fields.lonField,
        valueField: fields.valueField,
        labelField: fields.labelField,
      })
    : { points: [], invalidCount: 0 };

  const points = built.points;
  const vals = points.map(p => p.value[2]).filter(v => Number.isFinite(v));
  const maxVal = vals.length ? Math.max(...vals) : 1;
  const minVal = vals.length ? Math.min(...vals) : 0;

  // Bubble: size ∝ sqrt(value) so AREA (not radius) encodes magnitude.
  const minPx = config.geoBubbleMinSize ?? 6;
  const maxPx = config.geoBubbleMaxSize ?? 40;
  const sizeFor = (v: number): number => {
    if (variant === 'point') return config.scatterSymbolSize || 8;
    if (maxVal <= minVal) return (minPx + maxPx) / 2;
    const t = Math.sqrt((v - minVal) / (maxVal - minVal));
    return minPx + t * (maxPx - minPx);
  };

  const option: any = {
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const v = params.value?.[2];
        return `${params.name}${
          v == null ? '' : `<br/>${formatTooltipValue(config, v)}`
        }`;
      },
    },
    geo: {
      map: fields.regionSet,
      roam: config.worldMapRoam !== false,
      nameProperty: fields.nameProperty,
      aspectScale: config.worldMapAspectScale ?? 0.75,
      itemStyle: {
        areaColor: CHART_TYPOGRAPHY.colors.grid,
        borderColor: CHART_TYPOGRAPHY.colors.axis,
        borderWidth: 0.5,
      },
      emphasis: { itemStyle: { areaColor: CHART_TYPOGRAPHY.colors.grid } },
    },
    series: [
      {
        type: variant === 'bubble' ? 'scatter' : 'effectScatter',
        coordinateSystem: 'geo',
        data: points.map(p => ({
          name: p.name,
          value: p.value,
        })),
        symbolSize: (val: any) => sizeFor(Array.isArray(val) ? val[2] : val),
        itemStyle: {
          color: primary,
          opacity: 0.75,
        },
        ...(variant === 'point'
          ? {
              rippleEffect: { brushType: 'stroke', scale: 2.5 },
              showEffectOn: 'render',
            }
          : {}),
        emphasis: { scale: 1.2 },
      },
    ],
  };

  // Bubble map: colour points continuously by value when the scale is enabled.
  if (variant === 'bubble') {
    option.visualMap = {
      show: config.visualMapShow !== false,
      type: 'continuous',
      min: Number.isFinite(minVal) ? minVal : 0,
      max: Number.isFinite(maxVal) ? maxVal : 100,
      dimension: 2,
      calculable: true,
      orient: config.visualMapOrient || 'vertical',
      left: 0,
      bottom: 20,
      inRange: {
        color:
          Array.isArray(config.visualMapColors) &&
          config.visualMapColors.length >= 2
            ? config.visualMapColors
            : [colors[colors.length - 1] || '#e0f3f8', colors[0] || '#08589e'],
      },
      textStyle: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    };
  }

  if (built.invalidCount > 0) {
    option.__geoInvalidPoints = built.invalidCount;
  }
  return option;
}

export function buildPointMapOption(data: any[], config: any): any {
  return buildGeoScatterOption(data, config, 'point');
}

export function buildBubbleMapOption(data: any[], config: any): any {
  return buildGeoScatterOption(data, config, 'bubble');
}

// ========= Flow Lines Chart =========
// Renders animated directional flow lines on a cartesian plane using auto-layout.
// Sources are placed on the left, targets on the right, mixed nodes in the middle.
// Data format: nodes: [{ name }], links: [{ source, target, value }]
export function buildFlowLinesChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  const colors = getColors(config.colorScheme || 'default');
  const primaryColor = colors[0] || '#5470c6';

  // Determine node columns based on connectivity
  const sourceSet = new Set<string>(links.map((l: any) => String(l.source)));
  const targetSet = new Set<string>(links.map((l: any) => String(l.target)));

  const leftNodes: string[] = [];
  const middleNodes: string[] = [];
  const rightNodes: string[] = [];

  nodes.forEach((n: any) => {
    const name = String(n.name);
    const isSource = sourceSet.has(name);
    const isTarget = targetSet.has(name);
    if (isSource && !isTarget) leftNodes.push(name);
    else if (isTarget && !isSource) rightNodes.push(name);
    else middleNodes.push(name);
  });

  // Fallback: if all nodes are both source and target, split by appearance order
  if (
    leftNodes.length === 0 &&
    rightNodes.length === 0 &&
    middleNodes.length > 0
  ) {
    const half = Math.ceil(middleNodes.length / 2);
    leftNodes.push(...middleNodes.splice(0, half));
    rightNodes.push(...middleNodes);
    middleNodes.length = 0;
  }

  // Assign (x, y) positions in [0, 100] coordinate space
  const nodePos: { [name: string]: [number, number] } = {};
  const assignY = (names: string[], xVal: number): void => {
    names.forEach((name, i) => {
      const y = ((i + 1) / (names.length + 1)) * 100;
      nodePos[name] = [xVal, y];
    });
  };
  assignY(leftNodes, 10);
  assignY(middleNodes, 50);
  assignY(rightNodes, 88);

  // Fallback position for nodes without explicit mapping
  nodes.forEach((n: any, i: number) => {
    const name = String(n.name);
    if (!nodePos[name]) {
      nodePos[name] = [50, ((i + 1) / (nodes.length + 1)) * 100];
    }
  });

  const scatterData = nodes.map((n: any) => {
    const pos = nodePos[String(n.name)] || [50, 50];
    return { name: String(n.name), value: [pos[0], pos[1]] };
  });

  const lineData = links.map((l: any) => {
    const src = nodePos[String(l.source)] || [10, 50];
    const tgt = nodePos[String(l.target)] || [88, 50];
    return {
      coords: [src, tgt],
      value: l.value ?? 1,
    };
  });

  const maxVal = Math.max(...links.map((l: any) => l.value ?? 1), 1);
  // The Properties pane's "Show Effect" toggle binds `flowLinesEffectExtra`,
  // but the builder only read `flowLinesEffect` — so the toggle (and the
  // Period/Trail/Symbol sub-controls it gates) did nothing. Honour the UI key,
  // falling back to the legacy key, then default on.
  const showEffect =
    config.flowLinesEffectExtra !== undefined
      ? config.flowLinesEffectExtra !== false
      : config.flowLinesEffect !== false;

  return {
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        if (params.seriesType === 'scatter') return String(params.name);
        const link = links[params.dataIndex];
        if (link) return `${link.source} → ${link.target}: ${formatTooltipValue(config, link.value ?? 1)}`;
        return '';
      },
    },
    xAxis: { show: false, min: 0, max: 100 },
    yAxis: { show: false, min: 0, max: 100 },
    series: [
      {
        type: 'lines',
        coordinateSystem: 'cartesian2d',
        data: lineData,
        polyline: false,
        lineStyle: {
          width: (params: any) => {
            const val = params.data?.value ?? 1;
            return Math.max(
              1,
              Math.min(6, (val / maxVal) * (config.flowLinesWidth ?? 3)),
            );
          },
          color: primaryColor,
          curveness: config.flowLinesCurveness ?? 0.3,
          opacity: 0.6,
        },
        effect: {
          show: showEffect,
          period: config.flowLinesPeriod ?? config.flowLinesEffectPeriod ?? 4,
          trailLength: config.flowLinesTrailLength ?? 0.7,
          color: primaryColor,
          symbolSize: config.flowLinesEffectSymbolSize ?? 4,
        },
      },
      {
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        data: scatterData,
        symbolSize: 12,
        itemStyle: { color: primaryColor, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          formatter: (params: any) => String(params.name),
          position: 'right',
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
          fontSize: CHART_TYPOGRAPHY.axisLabel.fontSize,
          color: 'inherit',
        },
        emphasis: { scale: 1.4 },
        z: 2,
      },
    ],
  };
}

export function buildFlowGLChartOption(data: any[], config: any): any {
  let vectorData: any[] = [];
  if (data.length > 0 && data[0].data) {
    vectorData = data[0].data;
  } else if (data.length > 0 && Array.isArray(data[0])) {
    vectorData = data;
  }

  if (vectorData.length === 0) {
    return { series: [] };
  }

  const colors = getColors(config.colorScheme);

  // Compute velocity magnitudes for sizing
  let maxMag = 0;
  const processed = vectorData.map((v: any) => {
    const vx = v[2] || 0;
    const vy = v[3] || 0;
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > maxMag) maxMag = mag;
    // angle in degrees: 0° = right, 90° = up; ECharts rotates CW so negate
    const angle = (-Math.atan2(vy, vx) * 180) / Math.PI;
    return { x: v[0], y: v[1], mag, angle };
  });
  if (maxMag === 0) maxMag = 1;

  // Arrow data: each point gets size based on magnitude, rotation based on direction
  const arrowData = processed.map(p => ({
    value: [p.x, p.y, p.mag],
    symbolRotate: p.angle,
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (params: any) => {
        const d = params.data?.value || params.value;
        // User precision wins when set; otherwise fall back to the
        // 2/3-decimal defaults that read well for a vector field.
        const hasPrec = typeof config.tooltipPrecision === 'number';
        const fpos = (v: number) => hasPrec ? formatTooltipValue(config, v) : v.toFixed(2);
        const fmag = (v: number) => hasPrec ? formatTooltipValue(config, v) : v.toFixed(3);
        return `Position: (${fpos(d[0])}, ${fpos(d[1])})<br/>Magnitude: ${fmag(d[2])}`;
      },
    },
    grid: buildGrid(config),
    xAxis: {
      type: 'value',
      show: true,
      splitLine: {
        show: true,
        lineStyle: { type: 'dashed', color: CHART_TYPOGRAPHY.colors.grid },
      },
    },
    yAxis: {
      type: 'value',
      show: true,
      splitLine: {
        show: true,
        lineStyle: { type: 'dashed', color: CHART_TYPOGRAPHY.colors.grid },
      },
    },
    visualMap: {
      show: true,
      min: 0,
      max: +maxMag.toFixed(3),
      dimension: 2,
      orient: 'vertical',
      right: 0,
      top: 'center',
      text: ['High', 'Low'],
      calculable: true,
      inRange: {
        color:
          colors.length >= 2
            ? [colors[1], colors[0]]
            : ['#50a3ba', '#eac736', '#d94e5d'],
      },
    },
    series: [
      {
        type: 'scatter',
        data: arrowData,
        symbol: 'arrow',
        symbolSize: (val: any) => {
          const mag = val[2] || 0;
          return Math.max(6, (mag / maxMag) * 22);
        },
        itemStyle: { opacity: 0.85 },
      },
    ],
  };
}

// ========= Lines 3D Chart =========
export function buildLines3DChartOption(data: any[], config: any): any {
  // Data format: [[lng, lat], ...] — pairs of geographic coordinates
  // Each consecutive pair forms a directed arc on the globe
  const colors = getColors(config.colorScheme);
  const lineColor = colors[0] || '#00e5ff';

  let segments: { coords: number[][] }[] = [];
  if (Array.isArray(data) && data.length > 1) {
    const pts: number[][] = [];
    if (Array.isArray(data[0])) {
      data.forEach((pt: number[]) => {
        if (isFinite(pt[0]) && isFinite(pt[1])) pts.push([pt[0], pt[1]]);
      });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({ coords: [pts[i], pts[i + 1]] });
    }
  }

  const showEffect = config.lines3DEffect !== false;

  return {
    ...buildAnimation(config),
    globe: {
      baseColor: config.globeBaseColor || '#1c3561',
      shading: 'color',
      viewControl: {
        autoRotate: config.autoRotate !== false,
        autoRotateSpeed: config.autoRotateSpeed || 8,
        // Pulled back for Lines3D arcs to render fully visible.
        distance: config.viewDistance ?? 260,
      },
      light: {
        main: { intensity: 1.0, shadow: false },
        ambient: { intensity: 0.8 },
      },
      atmosphere: { show: true },
    },
    series: [
      {
        type: 'lines3D',
        coordinateSystem: 'globe',
        data: segments,
        lineStyle: {
          color: lineColor,
          width: config.lines3DLineWidth ?? 3,
          opacity: 1.0,
        },
        effect: {
          show: showEffect,
          period: config.lines3DEffectPeriod ?? 3,
          trailWidth: config.lines3DTrailWidth ?? 5,
          trailLength: config.lines3DTrailLength ?? 0.25,
          trailColor: colors[1] || '#ffffff',
          trailOpacity: 1.0,
        },
      },
    ],
  };
}

// ========= Polygons 3D Chart =========
// Uses geo3D coordinate system (requires 'polygons3d_world' map to be registered).
// Data format: [{ name, coords: [[lng, lat], ...] }, ...]
export function buildPolygons3DChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  let polygonData: { name: string; coords: number[][] }[] = [];
  if (Array.isArray(data) && data.length > 0 && data[0]?.coords) {
    polygonData = data;
  }

  // Assign each polygon a color from the active color scheme
  const seriesData = polygonData.map((poly, i) => ({
    name: poly.name,
    coords: [poly.coords],
    itemStyle: {
      color: colors[i % colors.length],
      opacity: config.polygons3DOpacity ?? 0.85,
      borderWidth: config.polygons3DBorderWidth ?? 1,
      borderColor: config.polygons3DBorderColor || '#ffffff',
    },
  }));

  return {
    ...buildAnimation(config),
    geo3D: {
      map: 'polygons3d_world',
      shading: 'lambert',
      viewControl: {
        autoRotate: config.autoRotate !== false,
        autoRotateSpeed: config.autoRotateSpeed || 4,
        alpha: 40,
        beta: 0,
        // Polygons render with the world map laid flat; pull camera
        // back so the full continent extent is visible at default zoom.
        distance: config.viewDistance ?? 180,
      },
      light: {
        main: { intensity: 1.5, shadow: false },
        ambient: { intensity: 0.6 },
      },
      itemStyle: {
        color: '#1a2a4a',
        borderColor: '#3a5a8a',
        borderWidth: 0.5,
      },
      groundPlane: { show: false },
      boxWidth: 100,
      boxHeight: 10,
    },
    series: [
      {
        type: 'polygons3D',
        coordinateSystem: 'geo3D',
        multiPolygon: false,
        data: seriesData,
      },
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Wave 4: statistical / specialized chart builders
//
// These consume the SAME data shapes the transformer already emits for the
// cartesian / hierarchical families:
//   - single series:  { name, value }[]
//   - multi series:    [{ name, series: [{ name, value }] }]
//   - node+link:       (nodes[], links[], config)
// Each reuses the shared axis/legend/tooltip/animation helpers so it inherits
// the app's typography + Properties-pane wiring. Builders that need genuine
// statistical PRE-PROCESSING (violin/density/ridgeline/hexbin/qq/ecdf) render a
// clear empty-state and are listed for transformer support — they never
// half-render a misleading chart.
// ══════════════════════════════════════════════════════════════════════════

/** Coerce a datum to { name, value } regardless of incoming shape. */
function toNameValue(d: any): { name: string; value: number } {
  if (d && typeof d === 'object') {
    return {
      name: String(d.name ?? d.label ?? ''),
      value: typeof d.value === 'number' ? d.value : Number(d.value) || 0,
    };
  }
  return { name: '', value: Number(d) || 0 };
}

/** Flatten a possibly-multi-series payload to a single { name, value }[]. */
function flattenToSingleSeries(data: any[]): { name: string; value: number }[] {
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
function buildEmptyStateOption(config: any, message: string): any {
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
export function buildBulletChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const measure = points[0]?.value ?? 0;
  const label = points[0]?.name || config.bulletLabel || 'Measure';
  // Target: explicit config, else a point whose name mentions "target".
  const targetPoint = points.find(p => /target/i.test(p.name));
  const target =
    config.bulletTarget != null
      ? Number(config.bulletTarget)
      : targetPoint
        ? targetPoint.value
        : undefined;

  const colors = getColors(config.colorScheme || 'default');
  const bands: number[] = Array.isArray(config.bulletBands)
    ? config.bulletBands.map((b: any) => Number(b)).filter((b: number) => Number.isFinite(b))
    : [];
  const axisMax =
    config.bulletMax != null
      ? Number(config.bulletMax)
      : Math.max(measure, target ?? 0, ...bands, 1) * 1.1;

  // Qualitative band backgrounds (light → dark grey by default).
  const bandGreys = ['#eeeeee', '#dddddd', '#cccccc', '#bbbbbb'];
  const markAreaData: any[] = [];
  let lower = 0;
  bands
    .slice()
    .sort((a, b) => a - b)
    .forEach((upper, i) => {
      markAreaData.push([
        { xAxis: lower, itemStyle: { color: bandGreys[i % bandGreys.length] } },
        { xAxis: upper },
      ]);
      lower = upper;
    });

  const markLineData: any[] = [];
  if (target != null) {
    markLineData.push({
      xAxis: target,
      lineStyle: { color: CHART_TYPOGRAPHY.colors.strong, width: 2, type: 'solid' },
      label: {
        show: true,
        formatter: config.bulletTargetLabel || 'Target',
        ...CHART_TYPOGRAPHY.dataLabel,
      },
    });
  }

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: () =>
        `${label}: ${formatTooltipValue(config, measure)}${
          target != null ? `<br/>Target: ${formatTooltipValue(config, target)}` : ''
        }`,
    },
    grid: { left: 80, right: 30, top: 20, bottom: 30, containLabel: true },
    xAxis: { ...buildValueAxis(config, 'x'), max: axisMax, nice: false },
    yAxis: buildCategoryAxis(config, [label], 'y'),
    series: [
      {
        type: 'bar',
        data: [measure],
        barWidth: config.bulletBarWidth ?? 18,
        itemStyle: { color: colors[0], borderRadius: 2 },
        label: buildDataLabel(config, 'right'),
        z: 3,
        markArea: { silent: true, data: markAreaData },
        markLine: { symbol: ['none', 'none'], data: markLineData, z: 4 },
      },
    ],
  };
}

// ========= KPI Delta =========
// Render-only big-number + delta vs a comparison value. Data: { name, value }[]
// where point[0] is the current value and point[1] (or config.kpiCompare) is the
// comparison. Up = good (green) by default; set config.kpiInvert for "down is
// good". Pairs with Wave 1's time-intel for the comparison value.
export function buildKpiDeltaOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const current = points[0]?.value ?? 0;
  const compare =
    config.kpiCompare != null
      ? Number(config.kpiCompare)
      : points[1]?.value != null
        ? points[1].value
        : undefined;

  const hint = config?.valueFormat;
  const fmt = (v: number): string =>
    hint && hint.kind && hint.kind !== 'auto'
      ? formatValueByHint(v, hint)
      : String(formatTooltipValue(config, v));

  const delta = compare != null ? current - compare : undefined;
  const pct =
    compare != null && compare !== 0 ? (delta! / Math.abs(compare)) * 100 : undefined;
  const up = delta != null && delta >= 0;
  const good = config.kpiInvert ? !up : up;
  const deltaColor = good ? '#16a34a' : '#dc2626';
  const arrow = up ? '▲' : '▼';

  const title = points[0]?.name || config.kpiLabel || '';

  const elements: any[] = [
    {
      type: 'text',
      left: 'center',
      top: '38%',
      silent: true,
      style: {
        text: fmt(current),
        fill: CHART_TYPOGRAPHY.colors.strong,
        font: `700 32px ${CHART_TYPOGRAPHY.fontFamily}`,
        textAlign: 'center',
      },
    },
  ];
  if (title) {
    elements.push({
      type: 'text',
      left: 'center',
      top: '26%',
      silent: true,
      style: {
        text: title,
        fill: CHART_TYPOGRAPHY.colors.muted,
        font: `500 12px ${CHART_TYPOGRAPHY.fontFamily}`,
        textAlign: 'center',
      },
    });
  }
  if (delta != null) {
    const pctTxt = pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
    elements.push({
      type: 'text',
      left: 'center',
      top: '58%',
      silent: true,
      style: {
        text: `${arrow} ${fmt(Math.abs(delta))}${pctTxt}`,
        fill: deltaColor,
        font: `600 14px ${CHART_TYPOGRAPHY.fontFamily}`,
        textAlign: 'center',
      },
    });
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: false },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'value', show: false },
    series: [],
    graphic: { elements },
  };
}

// ========= Pareto Chart =========
// Sorted descending bars + cumulative-% line on a secondary (right) axis.
// Data: { name, value }[]. The 80% guide line is drawn on the % axis.
export function buildParetoChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data)
    .slice()
    .sort((a, b) => b.value - a.value);
  const categories = points.map(p => p.name);
  const values = points.map(p => p.value);
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0) || 1;

  let running = 0;
  const cumulativePct = values.map(v => {
    running += v > 0 ? v : 0;
    return Math.round((running / total) * 1000) / 10;
  });

  const colors = getColors(config.colorScheme || 'default');

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'axis'),
      axisPointer: { type: 'shadow' },
    },
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: [
      { ...buildValueAxis(config, 'y'), nice: true },
      {
        type: 'value',
        name: config.paretoPctAxisName || 'Cumulative %',
        min: 0,
        max: 100,
        position: 'right',
        axisLabel: {
          formatter: '{value}%',
          ...CHART_TYPOGRAPHY.axisLabel,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
        },
        splitLine: { show: false },
        nameTextStyle: {
          ...CHART_TYPOGRAPHY.axisName,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
        },
      },
    ],
    series: [
      {
        name: config.paretoBarName || 'Value',
        type: 'bar',
        yAxisIndex: 0,
        data: values,
        itemStyle: { color: colors[0], borderRadius: [3, 3, 0, 0] },
        label: buildDataLabel(config, 'top'),
      },
      {
        name: config.paretoLineName || 'Cumulative %',
        type: 'line',
        yAxisIndex: 1,
        data: cumulativePct,
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: colors[1] || '#ef4444', width: 2 },
        itemStyle: { color: colors[1] || '#ef4444' },
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          data: [
            {
              yAxis: 80,
              lineStyle: { color: CHART_TYPOGRAPHY.colors.axis, type: 'dashed' },
              label: { show: true, formatter: '80%', ...CHART_TYPOGRAPHY.dataLabel },
            },
          ],
        },
      },
    ],
  };
}

// ========= Lollipop Chart =========
// Stems (thin bars) + dots. Data: { name, value }[]. Honours sort/topN via the
// cartesian analytics pass (bars are a real bar series).
export function buildLollipopChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const categories = points.map(p => p.name);
  const values = points.map(p => p.value);
  const colors = getColors(config.colorScheme || 'default');
  const horizontal = config.rotate === true || config.lollipopHorizontal === true;

  const catAxis = buildCategoryAxis(config, categories, horizontal ? 'y' : 'x');
  const valAxis = { ...buildValueAxis(config, horizontal ? 'x' : 'y'), nice: true };

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'axis'), axisPointer: { type: 'shadow' } },
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: [
      {
        // Thin bar = stem.
        type: 'bar',
        data: values,
        barWidth: config.lollipopStemWidth ?? 2,
        itemStyle: { color: colors[0] },
        z: 1,
        ...(config.showDataLabel ? { label: buildDataLabel(config, horizontal ? 'right' : 'top') } : {}),
        ...buildMarkOverlays(config),
      },
      {
        // Dot head at the same coordinates via a scatter overlay.
        type: 'scatter',
        data: values.map((v, i) => (horizontal ? [v, i] : [i, v])),
        symbolSize: config.lollipopDotSize ?? 12,
        itemStyle: { color: colors[0] },
        z: 2,
      },
    ],
  };
}

// ========= Cleveland Dot Plot =========
// One dot per category on a value axis (no stem). Data: { name, value }[].
export function buildClevelandDotChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const categories = points.map(p => p.name);
  const values = points.map(p => p.value);
  const colors = getColors(config.colorScheme || 'default');
  // Cleveland plots are conventionally horizontal (categories on Y).
  const horizontal = config.clevelandHorizontal !== false;

  const catAxis = buildCategoryAxis(config, categories, horizontal ? 'y' : 'x');
  const valAxis = { ...buildValueAxis(config, horizontal ? 'x' : 'y'), nice: true };

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'item') },
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: [
      {
        type: 'scatter',
        data: values.map((v, i) => (horizontal ? [v, i] : [i, v])),
        symbolSize: config.clevelandDotSize ?? 12,
        itemStyle: { color: colors[0] },
        label: config.showDataLabel
          ? {
              show: true,
              position: horizontal ? 'right' : 'top',
              formatter: (p: any) =>
                formatTooltipValue(config, p.value[horizontal ? 0 : 1]),
              ...CHART_TYPOGRAPHY.dataLabel,
            }
          : undefined,
      },
    ],
  };
}

// ========= Dumbbell Chart =========
// Two dots per category joined by a connecting bar (before/after). Data:
// multi-series [{ name, series:[{name,value}] }] with two series, OR
// { name, value, value2 }[]. Draws a line segment + two scatter series.
export function buildDumbbellChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const horizontal = config.dumbbellHorizontal !== false;

  // Resolve two value arrays keyed by category.
  let categories: string[] = [];
  let aVals: number[] = [];
  let bVals: number[] = [];
  let aName = config.dumbbellStartName || 'Start';
  let bName = config.dumbbellEndName || 'End';

  const first = Array.isArray(data) ? data[0] : undefined;
  if (first && Array.isArray(first.series)) {
    // Multi-series: two groups, each a series of {name,value}.
    const g0 = data[0];
    const g1 = data[1] || { name: bName, series: [] };
    aName = String(g0.name || aName);
    bName = String(g1.name || bName);
    const catSet: string[] = (g0.series || []).map((p: any) => String(p.name));
    categories = catSet;
    const m1 = new Map<string, number>(
      (g1.series || []).map((p: any) => [String(p.name), Number(p.value) || 0]),
    );
    aVals = (g0.series || []).map((p: any) => Number(p.value) || 0);
    bVals = categories.map(c => m1.get(c) ?? 0);
  } else {
    // Flat rows with value + value2.
    const rows = Array.isArray(data) ? data : [];
    categories = rows.map((d: any) => String(d.name ?? ''));
    aVals = rows.map((d: any) => Number(d.value) || 0);
    bVals = rows.map((d: any) => Number(d.value2 ?? d.valueEnd ?? 0) || 0);
  }

  const catAxis = buildCategoryAxis(config, categories, horizontal ? 'y' : 'x');
  const valAxis = { ...buildValueAxis(config, horizontal ? 'x' : 'y'), nice: true };

  // Connecting segments as a custom-free approach: use a line series per
  // category is heavy; instead draw with markLine between the two scatter
  // points via a lightweight 'lines'-like bar. Simplest faithful render:
  // a thin bar from min→max per category using two stacked scatter + a
  // connector built from a line series across [a,b] per index.
  const connectors: any[] = categories.map((_, i) => {
    const a = aVals[i];
    const b = bVals[i];
    return {
      coords: horizontal
        ? [[a, i], [b, i]]
        : [[i, a], [i, b]],
    };
  });

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'item') },
    ...buildLegendWithTitle(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: [
      {
        // Connector segments.
        type: 'lines',
        coordinateSystem: 'cartesian2d',
        data: connectors,
        lineStyle: {
          color: CHART_TYPOGRAPHY.colors.axis,
          width: config.dumbbellBarWidth ?? 4,
          opacity: 1,
        },
        z: 1,
        silent: true,
      },
      {
        name: aName,
        type: 'scatter',
        data: aVals.map((v, i) => (horizontal ? [v, i] : [i, v])),
        symbolSize: config.dumbbellDotSize ?? 11,
        itemStyle: { color: colors[0] },
        z: 2,
      },
      {
        name: bName,
        type: 'scatter',
        data: bVals.map((v, i) => (horizontal ? [v, i] : [i, v])),
        symbolSize: config.dumbbellDotSize ?? 11,
        itemStyle: { color: colors[1] || '#ef4444' },
        z: 2,
      },
    ],
  };
}

// ========= Slope Chart =========
// Two-point line per series showing change between two periods. Data:
// multi-series [{ name, series:[{name,value}] }] (each series = one line across
// the two category positions), OR { name, value, value2 }[].
export function buildSlopeChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const startLabel = config.slopeStartLabel || 'Before';
  const endLabel = config.slopeEndLabel || 'After';

  const first = Array.isArray(data) ? data[0] : undefined;
  const seriesList: { name: string; a: number; b: number }[] = [];

  if (first && Array.isArray(first.series)) {
    (data || []).forEach((g: any) => {
      const pts = g.series || [];
      seriesList.push({
        name: String(g.name ?? ''),
        a: Number(pts[0]?.value) || 0,
        b: Number(pts[1]?.value ?? pts[0]?.value) || 0,
      });
    });
  } else {
    (Array.isArray(data) ? data : []).forEach((d: any) => {
      seriesList.push({
        name: String(d.name ?? ''),
        a: Number(d.value) || 0,
        b: Number(d.value2 ?? d.valueEnd ?? 0) || 0,
      });
    });
  }

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (p: any) => `${p.seriesName}: ${formatTooltipValue(config, p.value[1])}`,
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: {
      type: 'category',
      data: [startLabel, endLabel],
      boundaryGap: true,
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    },
    yAxis: { ...buildValueAxis(config, 'y'), nice: true },
    series: seriesList.map(s => ({
      name: s.name,
      type: 'line',
      data: [s.a, s.b],
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2 },
      endLabel: {
        show: config.showDataLabel !== false,
        formatter: s.name,
        ...CHART_TYPOGRAPHY.dataLabel,
      },
      emphasis: { focus: 'series' },
    })),
  };
}

// ========= Bump Chart =========
// Rank-over-time lines. Data: multi-series [{ name, series:[{name(period),value(rank)}]}].
// Y axis is inverted so rank 1 sits on top. Falls back to plotting raw values
// if the payload isn't multi-series.
export function buildBumpChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const first = Array.isArray(data) ? data[0] : undefined;

  // Collect the ordered period axis from the first series.
  let periods: string[] = [];
  const series: { name: string; values: number[] }[] = [];

  if (first && Array.isArray(first.series)) {
    periods = (first.series || []).map((p: any) => String(p.name));
    (data || []).forEach((g: any) => {
      const m = new Map<string, number>(
        (g.series || []).map((p: any) => [String(p.name), Number(p.value) || 0]),
      );
      series.push({
        name: String(g.name ?? ''),
        values: periods.map(pr => m.get(pr) ?? 0),
      });
    });
  } else {
    const pts = flattenToSingleSeries(data);
    periods = pts.map(p => p.name);
    series.push({ name: config.bumpSeriesName || 'Series', values: pts.map(p => p.value) });
  }

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'axis') },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: {
      type: 'category',
      data: periods,
      boundaryGap: false,
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    },
    yAxis: {
      ...buildValueAxis(config, 'y'),
      // Rank axis: invert so 1 is at the top when the values are ranks.
      inverse: config.bumpInvertRank !== false,
      nice: true,
    },
    series: series.map(s => ({
      name: s.name,
      type: 'line',
      data: s.values,
      smooth: config.bumpSmooth !== false ? 0.4 : false,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 2 },
      endLabel: {
        show: config.showDataLabel !== false,
        formatter: s.name,
        ...CHART_TYPOGRAPHY.dataLabel,
      },
      emphasis: { focus: 'series' },
    })),
  };
}

// ========= Radial Bar Chart =========
// Bars on a polar radius axis (categories around the angle axis). Data:
// { name, value }[]. Distinct from bar-polar (which is angle-category bars) by
// using a radial layout with rounded caps.
export function buildRadialBarChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const categories = points.map(p => p.name);
  const values = points.map(p => p.value);
  const colors = getColors(config.colorScheme || 'default');

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'item') },
    ...buildLegendWithTitle(config),
    toolbox: buildToolbox(config),
    polar: { radius: [config.radialInnerRadius ?? 30, '80%'] },
    angleAxis: {
      max: config.radialAngleMax ?? (values.length ? Math.max(...values) * 1.1 : 100),
      startAngle: config.radialStartAngle ?? 90,
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
    },
    radiusAxis: {
      type: 'category',
      data: categories,
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      z: 10,
    },
    series: [
      {
        type: 'bar',
        data: values,
        coordinateSystem: 'polar',
        roundCap: true,
        label: config.showDataLabel
          ? { show: true, position: 'middle', formatter: '{b}', ...CHART_TYPOGRAPHY.dataLabel }
          : undefined,
        itemStyle: { borderRadius: config.roundEdges ? 4 : 0 },
      },
    ],
  };
}

// ========= Wind Rose =========
// Polar STACKED bars by direction. Data: multi-series
// [{ name(direction bucket), series:[{name(category),value}] }] OR
// { name, value }[]. Reuses the polar coordinate system with stacked bars.
export function buildWindRoseChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const first = Array.isArray(data) ? data[0] : undefined;

  if (first && Array.isArray(first.series)) {
    // Directions = the inner series names (shared axis); one stacked series per
    // outer group.
    const directions = (first.series || []).map((p: any) => String(p.name));
    const groups = data || [];
    return {
      color: colors,
      ...buildAnimation(config),
      tooltip: { ...buildTooltip(config, 'item') },
      legend: buildLegend(config),
      toolbox: buildToolbox(config),
      polar: {},
      angleAxis: {
        type: 'category',
        data: directions,
        startAngle: config.windRoseStartAngle ?? 90,
        axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      },
      radiusAxis: {
        axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      },
      series: groups.map((g: any) => {
        const m = new Map<string, number>(
          (g.series || []).map((p: any) => [String(p.name), Number(p.value) || 0]),
        );
        return {
          name: String(g.name ?? ''),
          type: 'bar',
          coordinateSystem: 'polar',
          stack: 'windrose',
          data: directions.map((d: string) => m.get(d) ?? 0),
        };
      }),
    };
  }

  // Single-series fallback: directions with a single magnitude each.
  const points = flattenToSingleSeries(data);
  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'item') },
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    polar: {},
    angleAxis: {
      type: 'category',
      data: points.map(p => p.name),
      startAngle: config.windRoseStartAngle ?? 90,
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
    },
    radiusAxis: {
      axisLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
    },
    series: [
      {
        type: 'bar',
        coordinateSystem: 'polar',
        data: points.map(p => p.value),
      },
    ],
  };
}

// ========= Calendar Heatmap =========
// Value per day on a calendar grid. Data: { name(date), value }[] where name is
// an ISO date (YYYY-MM-DD) or anything Date-parseable. Year is derived from the
// data (or config.calendarYear).
export function buildCalendarHeatmapOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  // Normalise to [yyyy-MM-dd, value].
  const cells: [string, number][] = [];
  const years = new Set<number>();
  points.forEach(p => {
    const d = new Date(p.name);
    if (Number.isNaN(d.getTime())) return;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    years.add(d.getFullYear());
    cells.push([iso, p.value]);
  });

  const year =
    config.calendarYear ||
    (years.size ? Array.from(years).sort()[years.size - 1] : new Date().getFullYear());

  const vals = cells.map(c => c[1]).filter(v => Number.isFinite(v));
  const colors = getColors(config.colorScheme || 'default');

  return {
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'item'),
      formatter: (p: any) =>
        `${p.value[0]}: ${formatTooltipValue(config, p.value[1])}`,
    },
    visualMap: {
      show: config.visualMapShow !== false,
      min: config.visualMapMin ?? (vals.length ? Math.min(...vals) : 0),
      max: config.visualMapMax ?? (vals.length ? Math.max(...vals) : 100),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      top: 0,
      inRange: {
        color:
          Array.isArray(config.visualMapColors) && config.visualMapColors.length >= 2
            ? config.visualMapColors
            : [colors[colors.length - 1] || '#e0f3f8', colors[0] || '#08589e'],
      },
      textStyle: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
    },
    calendar: {
      top: 50,
      left: 30,
      right: 20,
      cellSize: ['auto', config.calendarCellSize ?? 14],
      range: String(year),
      itemStyle: { borderColor: '#fff', borderWidth: 1, color: CHART_TYPOGRAPHY.colors.grid },
      dayLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      monthLabel: { ...CHART_TYPOGRAPHY.axisLabel, fontFamily: CHART_TYPOGRAPHY.fontFamily },
      yearLabel: { show: false },
      splitLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: cells,
        label: {
          show: config.showDataLabel === true,
          ...CHART_TYPOGRAPHY.dataLabel,
        },
      },
    ],
  };
}

// ========= Streamgraph =========
// Centre-baseline stacked areas over time (themeRiver). Reuses the theme-river
// builder, which already handles both the triple shape and {name,value}[].
export function buildStreamgraphOption(data: any[], config: any): any {
  // themeRiver IS a stream/silhouette layout; delegate to the existing builder.
  return buildThemeRiverChartOption(data, config);
}

// ========= Marimekko (Mekko / variable-width stacked bar) =========
// Variable-width stacked bars: bar WIDTH ∝ each category's share of the grand
// total, bar HEIGHT stacks the sub-series to 100%. Data: multi-series
// [{ name(category), series:[{name(segment),value}] }]. Implemented with a
// value X axis and per-category custom widths via barWidth + offset math is not
// expressible in plain stacked bars, so we use category share for the X extent
// and 100%-normalised stacks for height.
export function buildMarimekkoOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const first = Array.isArray(data) ? data[0] : undefined;

  if (!first || !Array.isArray(first.series)) {
    // Not enough structure for a true mekko — need category × segment.
    return buildEmptyStateOption(
      config,
      'Marimekko requires a category dimension and a segment breakdown.\nConfigure a color/stack dimension to enable.',
    );
  }

  const categories: string[] = (data || []).map((g: any) => String(g.name ?? ''));
  // Segment names come from the union of inner series names.
  const segSet = new Set<string>();
  (data || []).forEach((g: any) =>
    (g.series || []).forEach((p: any) => segSet.add(String(p.name))),
  );
  const segments = Array.from(segSet);

  // Category totals → widths (share of grand total).
  const catTotals = (data || []).map((g: any) =>
    (g.series || []).reduce((s: number, p: any) => s + (Number(p.value) || 0), 0),
  );
  const grand = catTotals.reduce((s, v) => s + v, 0) || 1;

  // X positions: cumulative share midpoints; each bar's width = its share.
  const widths = catTotals.map(t => (t / grand) * 100);
  const centers: number[] = [];
  let cursor = 0;
  widths.forEach(w => {
    centers.push(cursor + w / 2);
    cursor += w;
  });

  // Height: 100%-normalised stack per category.
  const segSeries = segments.map((seg, si) => {
    const dataPts = (data || []).map((g: any, ci: number) => {
      const found = (g.series || []).find((p: any) => String(p.name) === seg);
      const raw = found ? Number(found.value) || 0 : 0;
      const pct = catTotals[ci] > 0 ? (raw / catTotals[ci]) * 100 : 0;
      // Custom bar: value carries [center, pct] with per-bar width via
      // itemStyle is not supported; use a stacked bar on a category axis whose
      // widths approximate share by setting barWidth per the largest share.
      return pct;
    });
    return {
      name: seg,
      type: 'bar' as const,
      stack: 'mekko',
      data: dataPts,
      itemStyle: { color: colors[si % colors.length] },
      label: config.showDataLabel
        ? {
            show: true,
            position: 'inside' as const,
            formatter: (p: any) => (p.value >= 6 ? `${Math.round(p.value)}%` : ''),
            ...CHART_TYPOGRAPHY.dataLabel,
          }
        : undefined,
    };
  });

  // X axis labels combine the category name with its share so the variable
  // "width" reads even though ECharts bars are equal-width on a category axis.
  const catLabels = categories.map((c, i) => `${c}\n${Math.round(widths[i])}%`);

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'axis'),
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex ?? 0;
        const header = `${categories[idx]} (${Math.round(widths[idx])}% of total)`;
        const lines = params.map(
          (pp: any) => `${pp.marker}${pp.seriesName}: ${Math.round(pp.value)}%`,
        );
        return [header, ...lines].join('<br/>');
      },
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: {
      type: 'category',
      data: catLabels,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
        interval: 0,
      },
      axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%',
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      splitLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.grid, type: 'dashed' } },
    },
    series: segSeries,
  };
}

// ========= Cycle Plot =========
// Seasonal sub-series: for each season position (e.g. month), a mini line of
// the values across cycles, laid out left-to-right by season. Data:
// multi-series [{ name(season), series:[{name(cycle),value}] }] OR {name,value}[]
// (falls back to a single line).
export function buildCyclePlotOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme || 'default');
  const first = Array.isArray(data) ? data[0] : undefined;

  if (!first || !Array.isArray(first.series)) {
    // Single series → plain line across the categories.
    const points = flattenToSingleSeries(data);
    return {
      color: colors,
      ...buildAnimation(config),
      tooltip: { ...buildTooltip(config, 'axis') },
      grid: buildGrid(config),
      toolbox: buildToolbox(config),
      xAxis: buildCategoryAxis(config, points.map(p => p.name), 'x'),
      yAxis: { ...buildValueAxis(config, 'y'), nice: true },
      series: [{ type: 'line', data: points.map(p => p.value), symbol: 'circle' }],
    };
  }

  // Build a flat x-axis of season→cycle positions and one continuous line, with
  // a per-season mean markLine. Seasons are the outer groups.
  const seasons = (data || []).map((g: any) => String(g.name ?? ''));
  const flatLabels: string[] = [];
  const flatValues: number[] = [];
  const meanMarks: any[] = [];
  let xIndex = 0;
  (data || []).forEach((g: any, gi: number) => {
    const pts = g.series || [];
    const startX = xIndex;
    pts.forEach((p: any) => {
      flatLabels.push(`${seasons[gi]}`);
      flatValues.push(Number(p.value) || 0);
      xIndex += 1;
    });
    const endX = xIndex - 1;
    const mean =
      pts.length > 0
        ? pts.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0) / pts.length
        : 0;
    // Mean segment for this season block.
    meanMarks.push([
      { xAxis: startX, yAxis: mean },
      { xAxis: endX, yAxis: mean },
    ]);
  });

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'axis') },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: {
      type: 'category',
      data: flatLabels,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
        interval: 0,
      },
      axisLine: { lineStyle: { color: CHART_TYPOGRAPHY.colors.axis } },
    },
    yAxis: { ...buildValueAxis(config, 'y'), nice: true },
    series: [
      {
        type: 'line',
        data: flatValues,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 1.5 },
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          lineStyle: { color: '#ef4444', type: 'solid', width: 1.5 },
          data: meanMarks,
        },
      },
    ],
  };
}

// ========= Arc / Chord / Network (graph-family) =========
// All three are node+link relationship graphs with different layouts. They
// share ECharts' `graph` series; layout differs (none-with-x for arc, circular
// for chord, force for network). Data: (nodes[], links[], config).
function buildRelationshipGraphOption(
  nodes: any[],
  links: any[],
  config: any,
  layout: 'arc' | 'circular' | 'force',
): any {
  const colors = getColors(config.colorScheme || 'default');
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeLinks = Array.isArray(links) ? links : [];

  // Arc diagram: nodes on a horizontal line, links drawn as arcs above.
  const graphNodes = safeNodes.map((n: any, i: number) => {
    const base: any = {
      name: String(n.name ?? n.id ?? i),
      value: n.value ?? 1,
      symbolSize: n.symbolSize ?? Math.max(8, Math.min(40, Number(n.value) || 10)),
      itemStyle: { color: colors[i % colors.length] },
    };
    if (layout === 'arc') {
      base.x = i;
      base.y = 0;
    }
    return base;
  });

  const graphLinks = safeLinks.map((l: any) => ({
    source: String(l.source),
    target: String(l.target),
    value: l.value ?? 1,
    lineStyle: { width: Math.max(1, Math.min(8, Number(l.value) || 1)), opacity: 0.5, curveness: layout === 'arc' ? 0.3 : 0.2 },
  }));

  const layoutMap = { arc: 'none', circular: 'circular', force: 'force' } as const;

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { ...buildTooltip(config, 'item') },
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    series: [
      {
        type: 'graph',
        layout: layoutMap[layout],
        data: graphNodes,
        links: graphLinks,
        roam: config.graphRoam !== false,
        draggable: layout === 'force',
        ...(layout === 'circular' ? { circular: { rotateLabel: true } } : {}),
        ...(layout === 'force'
          ? {
              force: {
                repulsion: config.graphRepulsion ?? 120,
                edgeLength: config.graphEdgeLength ?? 80,
                gravity: 0.1,
              },
            }
          : {}),
        label: {
          show: config.showDataLabel !== false,
          position: layout === 'arc' ? 'bottom' : 'right',
          ...CHART_TYPOGRAPHY.dataLabel,
        },
        lineStyle: { color: 'source', curveness: layout === 'arc' ? 0.3 : 0.2 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 4 } },
      },
    ],
  };
}

export function buildArcChartOption(nodes: any[], links: any[], config: any): any {
  return buildRelationshipGraphOption(nodes, links, config, 'arc');
}

export function buildChordChartOption(nodes: any[], links: any[], config: any): any {
  return buildRelationshipGraphOption(nodes, links, config, 'circular');
}

export function buildNetworkChartOption(nodes: any[], links: any[], config: any): any {
  return buildRelationshipGraphOption(nodes, links, config, 'force');
}

// ========= Statistical-binning stubs (need transformer support) =========
// These require genuine statistical PRE-PROCESSING (kernel density, quantile
// computation, hex binning) that belongs in the data-transform layer, not the
// pure option builder. Rendering them from raw {name,value}[] would produce a
// misleading chart, so they show a clear empty-state until the transformer
// emits the binned/pre-computed shape. Listed in the wave report for routing.

export function buildViolinStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'Violin plot requires density-binned data.\nComing via the data pipeline.',
  );
}

export function buildDensityStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'Density plot requires kernel-density estimation.\nComing via the data pipeline.',
  );
}

export function buildRidgelineStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'Ridgeline plot requires per-group density bins.\nComing via the data pipeline.',
  );
}

export function buildHexbinStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'Hexbin requires 2D hexagonal binning.\nComing via the data pipeline.',
  );
}

export function buildQqPlotStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'Q-Q plot requires quantile computation.\nComing via the data pipeline.',
  );
}

export function buildEcdfStubOption(_data: any[], config: any): any {
  return buildEmptyStateOption(
    config,
    'ECDF requires sorted cumulative distribution.\nComing via the data pipeline.',
  );
}

// ========= Unified Dispatcher =========

type NodeLinkBuilder = (nodes: any[], links: any[], config: any) => any;
type DataConfigBuilder = (data: any[], config: any) => any;
type DataConfigTypeBuilder = (
  data: any[],
  config: any,
  chartType: string,
) => any;

const NODE_LINK_BUILDERS: Record<string, NodeLinkBuilder> = {
  sankey: buildSankeyChartOption,
  graph: buildGraphChartOption,
  graphgl: buildGraphGLChartOption,
  'flow-lines': buildFlowLinesChartOption,
  // Wave 4 relationship graphs (node+link, distinct layouts).
  arc: buildArcChartOption,
  chord: buildChordChartOption,
  network: buildNetworkChartOption,
};

const CHART_TYPE_BUILDERS: Record<string, DataConfigTypeBuilder> = {
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

const SIMPLE_BUILDERS: Record<string, DataConfigBuilder> = {
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
function isCartesianOption(option: any): boolean {
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
function datumValue(d: any): number {
  if (d && typeof d === 'object' && 'value' in d) return Number((d as any).value);
  return Number(d);
}

/**
 * Format a numeric (or date) value using the dataset formatHint shape
 * { kind, decimals, currencyCode, dateFormat, thousands }. Mirrors the hint
 * contract used across datasets so a currency/percent/decimal/date format set
 * on a field renders consistently in charts. Returns a string; passes through
 * non-finite input untouched (so category strings survive).
 */
function formatValueByHint(value: any, hint: any): string {
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
function applySortAndLimit(option: any, config: any): void {
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
      (limitMode === 'bottom' ? byMeasure.slice(-n) : byMeasure.slice(0, n)),
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
function applyStackingOverride(option: any, config: any): void {
  const mode = config?.stacking;
  if (mode !== 'stacked' && mode !== 'percent') return;
  if (!isCartesianOption(option)) return;
  const series: any[] = option.series || [];
  if (series.length === 0) return;

  if (mode === 'percent') {
    const len = Math.max(...series.map(s => (Array.isArray(s.data) ? s.data.length : 0)));
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
function applyNullHandling(option: any, config: any): void {
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
    return mode === 'hide' ? { ...s, data, connectNulls: false } : { ...s, data };
  });
}

/**
 * Value-axis scale + explicit min/max. 'log' switches yAxis.type to 'log'
 * (ECharts requires strictly positive data — falls back silently to linear when
 * any value is <= 0). Explicit yScaleMin / yScaleMax pin the domain. No-op when
 * everything is at its default.
 */
function applyValueAxisScale(option: any, config: any): void {
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
function applyPerFieldFormat(option: any, config: any): void {
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
function applyDataLabelContent(option: any, config: any): void {
  if (config?.labelContent !== 'percent') return;
  if (config?.valueFormat && config.valueFormat.kind && config.valueFormat.kind !== 'auto') return;
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
function applyDualAxis(option: any, config: any, chartType?: string): void {
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
      type: entry.type === 'bar' || entry.type === 'line' ? entry.type : sr.type,
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
function applyTrend(option: any, config: any): void {
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
function applySmallMultiples(option: any, config: any): void {
  const cfg = config?.smallMultiples;
  const enabled =
    cfg && (cfg.enabled === true || cfg.facetColumn) && !Array.isArray(option.yAxis);
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
function applyCartesianAnalytics(
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
export function buildChartOption(
  data: any,
  config: any,
  chartType: string,
): any {
  if (!chartType) return {};

  // Node+link charts: data is { nodes: [], links: [] }
  const nodeLinkBuilder = NODE_LINK_BUILDERS[chartType];
  if (nodeLinkBuilder) {
    const d = data || { nodes: [], links: [] };
    return nodeLinkBuilder(d.nodes || [], d.links || [], config);
  }

  // Charts that need chartType variant
  const typedBuilder = CHART_TYPE_BUILDERS[chartType];
  if (typedBuilder) {
    const built = typedBuilder(data, config, chartType);
    // Track E1: dual-axis / trend / small-multiples post-process. No-op
    // for non-cartesian types and when the config keys are absent.
    return applyCartesianAnalytics(built, config, chartType);
  }

  // Simple (data, config) charts
  const simpleBuilder = SIMPLE_BUILDERS[chartType];
  if (simpleBuilder) {
    return simpleBuilder(data, config);
  }

  return {};
}
