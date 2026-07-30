/* Extracted from echarts-option-builder.ts — cartesian-derived chart builders. */

import {
  buildCategoryAxis,
  flattenToSingleSeries,
  formatTooltipValue,
} from './chart-postprocess';
import {
  CHART_TYPOGRAPHY,
  buildAnimation,
  buildDataLabel,
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
              lineStyle: {
                color: CHART_TYPOGRAPHY.colors.axis,
                type: 'dashed',
              },
              label: {
                show: true,
                formatter: '80%',
                ...CHART_TYPOGRAPHY.dataLabel,
              },
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

// ========= Lollipop Chart =========
// Stems (thin bars) + dots. Data: { name, value }[]. Honours sort/topN via the
// cartesian analytics pass (bars are a real bar series).
export function buildLollipopChartOption(data: any[], config: any): any {
  const points = flattenToSingleSeries(data);
  const categories = points.map(p => p.name);
  const values = points.map(p => p.value);
  const colors = getColors(config.colorScheme || 'default');
  const horizontal =
    config.rotate === true || config.lollipopHorizontal === true;

  const catAxis = buildCategoryAxis(config, categories, horizontal ? 'y' : 'x');
  const valAxis = {
    ...buildValueAxis(config, horizontal ? 'x' : 'y'),
    nice: true,
  };

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
        ...(config.showDataLabel
          ? { label: buildDataLabel(config, horizontal ? 'right' : 'top') }
          : {}),
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
  const valAxis = {
    ...buildValueAxis(config, horizontal ? 'x' : 'y'),
    nice: true,
  };

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
  const valAxis = {
    ...buildValueAxis(config, horizontal ? 'x' : 'y'),
    nice: true,
  };

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
        ? [
            [a, i],
            [b, i],
          ]
        : [
            [i, a],
            [i, b],
          ],
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
      formatter: (p: any) =>
        `${p.seriesName}: ${formatTooltipValue(config, p.value[1])}`,
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: {
      type: 'category',
      data: [startLabel, endLabel],
      boundaryGap: true,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
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
        (g.series || []).map((p: any) => [
          String(p.name),
          Number(p.value) || 0,
        ]),
      );
      series.push({
        name: String(g.name ?? ''),
        values: periods.map(pr => m.get(pr) ?? 0),
      });
    });
  } else {
    const pts = flattenToSingleSeries(data);
    periods = pts.map(p => p.name);
    series.push({
      name: config.bumpSeriesName || 'Series',
      values: pts.map(p => p.value),
    });
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
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
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

  const categories: string[] = (data || []).map((g: any) =>
    String(g.name ?? ''),
  );
  // Segment names come from the union of inner series names.
  const segSet = new Set<string>();
  (data || []).forEach((g: any) =>
    (g.series || []).forEach((p: any) => segSet.add(String(p.name))),
  );
  const segments = Array.from(segSet);

  // Category totals → widths (share of grand total).
  const catTotals = (data || []).map((g: any) =>
    (g.series || []).reduce(
      (s: number, p: any) => s + (Number(p.value) || 0),
      0,
    ),
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
            formatter: (p: any) =>
              p.value >= 6 ? `${Math.round(p.value)}%` : '',
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
      splitLine: {
        lineStyle: { color: CHART_TYPOGRAPHY.colors.grid, type: 'dashed' },
      },
    },
    series: segSeries,
  };
}

// ========= Cycle Plot =========
// Seasonal sub-series: for each season position (e.g. month), a mini line of
// the values across cycles, laid out left-to-right by season. Data:
// multi-series [{ name(season), series:[{name(cycle),value}] }] OR {name,value}[]
// (falls back to a single line).

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
      xAxis: buildCategoryAxis(
        config,
        points.map(p => p.name),
        'x',
      ),
      yAxis: { ...buildValueAxis(config, 'y'), nice: true },
      series: [
        { type: 'line', data: points.map(p => p.value), symbol: 'circle' },
      ],
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
        ? pts.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0) /
          pts.length
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
