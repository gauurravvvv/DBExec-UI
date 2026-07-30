/* Extracted from echarts-option-builder.ts — part-to-whole chart builders. */

import {
  flattenToSingleSeries,
  formatTooltipValue,
} from './chart-postprocess';
import {
  CHART_TYPOGRAPHY,
  buildAnimation,
  buildLegend,
  buildLegendWithTitle,
  buildToolbox,
  buildTooltip,
  getColors,
  makeGradient,
} from './chart-primitives';
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
        return item
          ? `${name}: ${formatTooltipValue(config, item.value)}`
          : name;
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
      formatter: (params: any) =>
        `${params.name}: ${formatTooltipValue(config, params.value)}`,
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
      formatter: (params: any) =>
        `${params.name}: ${formatTooltipValue(config, params.value)}`,
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
      max:
        config.radialAngleMax ??
        (values.length ? Math.max(...values) * 1.1 : 100),
      startAngle: config.radialStartAngle ?? 90,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    radiusAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
      z: 10,
    },
    series: [
      {
        type: 'bar',
        data: values,
        coordinateSystem: 'polar',
        roundCap: true,
        label: config.showDataLabel
          ? {
              show: true,
              position: 'middle',
              formatter: '{b}',
              ...CHART_TYPOGRAPHY.dataLabel,
            }
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
        axisLabel: {
          ...CHART_TYPOGRAPHY.axisLabel,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
        },
      },
      radiusAxis: {
        axisLabel: {
          ...CHART_TYPOGRAPHY.axisLabel,
          fontFamily: CHART_TYPOGRAPHY.fontFamily,
        },
      },
      series: groups.map((g: any) => {
        const m = new Map<string, number>(
          (g.series || []).map((p: any) => [
            String(p.name),
            Number(p.value) || 0,
          ]),
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
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
    },
    radiusAxis: {
      axisLabel: {
        ...CHART_TYPOGRAPHY.axisLabel,
        fontFamily: CHART_TYPOGRAPHY.fontFamily,
      },
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
