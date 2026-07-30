/* Extracted from echarts-option-builder.ts — cartesian-basic chart builders. */

import {
  applyCartesianAnalytics,
  applyDualAxis,
  extractNumericSample,
} from './chart-analytics';
import {
  applyConditionalFormatting,
  applyGradient,
  buildCategoryAxis,
  convertMultiSeries,
  formatTooltipValue,
} from './chart-postprocess';
import {
  buildAnimation,
  buildDataLabel,
  buildDataZoom,
  buildEmphasis,
  buildGrid,
  buildLegendWithTitle,
  buildMarkOverlays,
  buildPerfFlags,
  buildToolbox,
  buildTooltip,
  buildValueAxis,
  buildVisualMap,
  getColors,
  getSmooth,
  getStep,
  makeGradient,
} from './chart-primitives';
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
      extractNumericSample(
        multiData && multiData.length > 0 ? multiData : data,
      ),
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
            return (
              params.seriesName +
              ': ' +
              formatTooltipValue(config, params.value)
            );
          }
          // Axis trigger — filter out null/undefined entries
          const valid = params.filter((p: any) => p.value != null);
          if (valid.length === 0) return '';
          let result = valid[0].axisValueLabel || '';
          valid.forEach((p: any) => {
            result +=
              '<br/>' +
              p.marker +
              ' ' +
              p.seriesName +
              ': ' +
              formatTooltipValue(config, p.value);
          });
          return result;
        },
      };
    } else {
      option.series = [
        {
          ...barSeriesBase,
          // Series name = the derived measure label (drives the tooltip series
          // name + single-series legend). Falls back to the value-axis label
          // then '' — never the literal placeholder "Value".
          name: config._yAxisFieldLabel || config.yAxisLabel || '',
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
          config.pictorialSymbolMargin != null &&
          config.pictorialSymbolMargin !== ''
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
