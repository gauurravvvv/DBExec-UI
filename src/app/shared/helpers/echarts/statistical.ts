/* Extracted from echarts-option-builder.ts — statistical chart builders. */

import * as echarts from 'echarts';
import {
  applyGradient,
  buildCategoryAxis,
  convertMultiSeries,
  flattenToSingleSeries,
  formatTooltipValue,
  formatValueByHint,
} from './chart-postprocess';
import {
  CHART_TYPOGRAPHY,
  buildAnimation,
  buildDataLabel,
  buildDataZoom,
  buildEmphasis,
  buildEmptyStateOption,
  buildGrid,
  buildLegend,
  buildLegendWithTitle,
  buildMarkOverlays,
  buildToolbox,
  buildTooltip,
  buildValueAxis,
  getColors,
} from './chart-primitives';
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
    ? config.bulletBands
        .map((b: any) => Number(b))
        .filter((b: number) => Number.isFinite(b))
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
      lineStyle: {
        color: CHART_TYPOGRAPHY.colors.strong,
        width: 2,
        type: 'solid',
      },
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
          target != null
            ? `<br/>Target: ${formatTooltipValue(config, target)}`
            : ''
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
    compare != null && compare !== 0
      ? (delta! / Math.abs(compare)) * 100
      : undefined;
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
    const pctTxt =
      pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
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
    (years.size
      ? Array.from(years).sort()[years.size - 1]
      : new Date().getFullYear());

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
          Array.isArray(config.visualMapColors) &&
          config.visualMapColors.length >= 2
            ? config.visualMapColors
            : [colors[colors.length - 1] || '#e0f3f8', colors[0] || '#08589e'],
      },
      textStyle: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    calendar: {
      top: 50,
      left: 30,
      right: 20,
      cellSize: ['auto', config.calendarCellSize ?? 14],
      range: String(year),
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 1,
        color: CHART_TYPOGRAPHY.colors.grid,
      },
      dayLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      monthLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
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

