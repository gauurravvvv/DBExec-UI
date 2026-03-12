import { COLOR_PALETTES } from './chart-config.helper';

// ========= Helper Functions =========

function getColors(colorScheme: string): string[] {
  return COLOR_PALETTES[colorScheme] || COLOR_PALETTES['vivid'];
}

function buildLegend(config: any): any {
  if (!config.legend) return { show: false };
  const legend: any = {
    show: true,
    type: config.legendType || 'scroll',
    textStyle: {
      fontSize: 12,
      color: '#666',
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

function buildTooltip(config: any, defaultTrigger: string = 'item'): any {
  const trigger = config.tooltipTrigger || defaultTrigger;
  const tooltip: any = {
    show: !config.tooltipDisabled,
    trigger,
    confine: true,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    padding: [8, 12],
    textStyle: {
      color: '#374151',
      fontSize: 13,
    },
    extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);',
  };
  if (config.axisPointerType && config.axisPointerType !== 'none') {
    tooltip.axisPointer = {
      type: config.axisPointerType,
      lineStyle: { color: '#9ca3af', type: 'dashed' },
      crossStyle: { color: '#9ca3af' },
      shadowStyle: { color: 'rgba(150, 150, 150, 0.08)' },
    };
  }
  return tooltip;
}

function buildGrid(config: any): any {
  return {
    left: 60,
    right: config.legend && config.legendPosition !== 'below' && config.legendPosition !== 'top' ? 150 : 30,
    bottom: config.showXAxisLabel ? 60 : 40,
    top: config.legend && config.legendPosition === 'top' ? 50 : 30,
    containLabel: true,
  };
}

function buildAnimation(config: any): any {
  return {
    animation: config.animations !== false,
    animationDuration: config.animationDuration ?? 1000,
    animationEasing: config.animationEasing || 'cubicOut',
  };
}

function buildDataLabel(config: any, defaultPosition?: string): any {
  if (!config.showDataLabel) return undefined;
  return {
    show: true,
    position: config.labelPosition || defaultPosition || 'top',
    fontSize: config.labelFontSize || 12,
    color: '#555',
    fontWeight: 500,
  };
}

function buildCategoryAxis(config: any, categories: string[], axis: 'x' | 'y'): any {
  const isX = axis === 'x';
  const showAxis = isX ? config.xAxis !== false : config.yAxis !== false;
  const showLabel = isX ? config.showXAxisLabel : config.showYAxisLabel;
  const label = isX ? config.xAxisLabel : config.yAxisLabel;
  const result: any = {
    type: 'category',
    data: categories,
    show: showAxis,
    name: showLabel ? label : '',
    nameLocation: 'middle',
    nameGap: isX ? 35 : 55,
    nameTextStyle: { color: '#666', fontSize: 12, fontWeight: 500 },
    boundaryGap: config.boundaryGap !== false,
    axisTick: { alignWithLabel: true, lineStyle: { color: '#d1d5db' } },
    axisLine: { lineStyle: { color: '#d1d5db' } },
    axisLabel: {
      rotate: isX ? (config.xAxisLabelRotate || 0) : 0,
      overflow: (isX ? config.trimXAxisTicks : config.trimYAxisTicks) ? 'truncate' : 'none',
      width: ((isX ? config.maxXAxisTickLength : config.maxYAxisTickLength) || 16) * 7,
      color: '#666',
      fontSize: 11,
    },
    splitLine: {
      show: config.showGridLines !== false,
      lineStyle: { type: config.gridLineStyle || 'dashed', color: '#f0f0f0' },
    },
  };
  if (isX && config.inverseX) result.inverse = true;
  if (!isX && config.inverseY) result.inverse = true;
  return result;
}

function buildValueAxis(config: any, axis: 'x' | 'y'): any {
  const isX = axis === 'x';
  const showAxis = isX ? config.xAxis !== false : config.yAxis !== false;
  const showLabel = isX ? config.showXAxisLabel : config.showYAxisLabel;
  const label = isX ? config.xAxisLabel : config.yAxisLabel;
  const result: any = {
    type: 'value',
    show: showAxis,
    name: showLabel ? label : '',
    nameLocation: 'middle',
    nameGap: isX ? 35 : 55,
    nameTextStyle: { color: '#666', fontSize: 12, fontWeight: 500 },
    axisTick: { lineStyle: { color: '#d1d5db' } },
    axisLine: { lineStyle: { color: '#d1d5db' } },
    axisLabel: { color: '#666', fontSize: 11 },
    splitLine: {
      show: config.showGridLines !== false,
      lineStyle: { type: config.gridLineStyle || 'dashed', color: '#f0f0f0' },
    },
    scale: config.autoScale || false,
    min: config.yScaleMin,
    max: config.yScaleMax,
    nice: config.niceScale || false,
  };
  if (isX && config.inverseX) result.inverse = true;
  if (!isX && config.inverseY) result.inverse = true;
  return result;
}

function getSmooth(config: any): boolean | number {
  if (!config.lineSmooth) return false;
  const smoothness = config.lineSmoothness;
  if (smoothness !== undefined && smoothness !== null && smoothness > 0 && smoothness < 1) {
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
function convertMultiSeries(data: any[]): { categories: string[]; seriesList: { name: string; values: number[] }[] } {
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
      group.series.forEach((item: any) => valueMap.set(String(item.name), item.value));
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
      dataView: { title: 'Data', readOnly: true, lang: ['Data View', 'Close', 'Refresh'] },
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
  return [
    {
      type: 'slider', ...index, bottom: 5, height: 20,
      borderColor: '#e5e7eb',
      backgroundColor: '#fafafa',
      fillerColor: 'rgba(99, 102, 241, 0.12)',
      handleStyle: { color: '#6366f1', borderColor: '#6366f1' },
      textStyle: { color: '#666', fontSize: 11 },
    },
    { type: 'inside', ...index },
  ];
}

// ========= Bar Chart =========
export function buildBarChartOption(data: any[], config: any, chartType: string, multiData?: any[]): any {
  const colors = getColors(config.colorScheme);
  const isHorizontal = chartType.includes('horizontal');
  const isMulti = chartType.includes('2d') || chartType.includes('stacked') || chartType.includes('normalized');
  const isStacked = chartType.includes('stacked') || chartType.includes('normalized');
  const isNormalized = chartType.includes('normalized');

  const borderRadius = config.roundEdges
    ? (isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0])
    : undefined;

  const option: any = {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config, isMulti ? 'axis' : 'item'),
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
  };

  const barSeriesBase: any = {};
  if (config.barWidth) barSeriesBase.barWidth = config.barWidth;
  if (config.showBackground) barSeriesBase.showBackground = true;

  if (isMulti) {
    const sourceData = multiData && multiData.length > 0 ? multiData : data;
    const { categories, seriesList } = convertMultiSeries(sourceData);

    if (isNormalized) {
      const totals = categories.map((_, i) =>
        seriesList.reduce((sum, s) => sum + (s.values[i] || 0), 0)
      );
      option.series = seriesList.map(s => ({
        ...barSeriesBase,
        name: s.name,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: config.emphasis || 'series' },
        data: s.values.map((v, i) => (totals[i] ? +((v / totals[i]) * 100).toFixed(1) : 0)),
        label: config.showDataLabel ? { show: true, formatter: '{c}%', fontSize: config.labelFontSize || 12 } : undefined,
        itemStyle: borderRadius ? { borderRadius } : undefined,
      }));
      if (isHorizontal) {
        option.yAxis = { type: 'category', data: categories };
        option.xAxis = { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } };
      } else {
        option.xAxis = { type: 'category', data: categories };
        option.yAxis = { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } };
      }
    } else {
      option.series = seriesList.map(s => ({
        ...barSeriesBase,
        name: s.name,
        type: 'bar',
        ...(isStacked ? { stack: 'total' } : {}),
        data: s.values,
        emphasis: { focus: config.emphasis || 'series' },
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

    option.series = [{
      ...barSeriesBase,
      type: 'bar',
      data: values,
      label: buildDataLabel(config, isHorizontal ? 'right' : 'top'),
      barGap: config.barGap || '30%',
      barCategoryGap: config.barCategoryGap || '20%',
      itemStyle: borderRadius ? { borderRadius } : undefined,
    }];

    if (isHorizontal) {
      option.yAxis = buildCategoryAxis(config, categories, 'y');
      option.xAxis = buildValueAxis(config, 'x');
    } else {
      option.xAxis = buildCategoryAxis(config, categories, 'x');
      option.yAxis = buildValueAxis(config, 'y');
    }
  }

  const barZoom = buildDataZoom(config, isHorizontal ? 'y' : 'x');
  if (barZoom.length) {
    option.dataZoom = barZoom;
    option.grid.bottom = 80;
  }

  return option;
}

// ========= Line Chart =========
export function buildLineChartOption(data: any[], config: any, chartType: string = 'line'): any {
  const colors = getColors(config.colorScheme);
  const { categories, seriesList } = convertMultiSeries(data);
  const isStacked = chartType === 'line-stacked';
  const isStep = chartType === 'line-step';
  const smooth = isStep ? false : getSmooth(config);
  const step = isStep ? (config.lineStep !== 'none' ? config.lineStep || 'middle' : 'middle') : getStep(config);

  const option: any = {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series: seriesList.map(s => ({
      name: s.name,
      type: 'line',
      data: s.values,
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
      areaStyle: config.rangeFillOpacity > 0 ? { opacity: config.rangeFillOpacity } : undefined,
      emphasis: { focus: config.emphasis || 'series' },
    })),
  };

  if (config.dataZoom) {
    option.dataZoom = buildDataZoom(config);
    option.grid.bottom = 80;
  }

  return option;
}

// ========= Area Chart =========
export function buildAreaChartOption(data: any[], config: any, chartType: string): any {
  const colors = getColors(config.colorScheme);
  const { categories, seriesList } = convertMultiSeries(data);
  const isStacked = chartType === 'area-stacked' || chartType === 'area-normalized';
  const isNormalized = chartType === 'area-normalized';
  const smooth = getSmooth(config);
  const step = getStep(config);

  const areaOpacity = config.areaOpacity ?? (isStacked ? 0.7 : 0.4);

  const option: any = {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    legend: buildLegend(config),
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
    emphasis: { focus: config.emphasis || 'series' },
  };

  if (isNormalized) {
    const totals = categories.map((_, i) =>
      seriesList.reduce((sum, s) => sum + (s.values[i] || 0), 0)
    );
    option.yAxis.max = 100;
    option.yAxis.axisLabel = { formatter: '{value}%' };
    option.series = seriesList.map(s => ({
      ...lineSeriesBase,
      name: s.name,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.8 },
      data: s.values.map((v, i) => (totals[i] ? +((v / totals[i]) * 100).toFixed(1) : 0)),
      smooth: step ? false : smooth,
      step: step || undefined,
    }));
  } else {
    option.series = seriesList.map(s => ({
      ...lineSeriesBase,
      name: s.name,
      type: 'line',
      ...(isStacked ? { stack: 'total' } : {}),
      areaStyle: { opacity: areaOpacity },
      data: s.values,
      smooth: step ? false : smooth,
      step: step || undefined,
    }));
  }

  if (config.dataZoom) {
    option.dataZoom = buildDataZoom(config);
    option.grid.bottom = 80;
  }

  return option;
}

// ========= Pie Chart =========
export function buildPieChartOption(data: any[], config: any, chartType: string): any {
  const colors = getColors(config.colorScheme);
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
  const roseType = config.roseType && config.roseType !== 'none' ? config.roseType : undefined;

  // Selected mode
  const selectedMode = config.pieSelectedMode && config.pieSelectedMode !== 'none'
    ? config.pieSelectedMode
    : false;

  const option: any = {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    series: [{
      type: 'pie',
      radius,
      data: pieData,
      label: labelConfig,
      labelLine: { show: config.pieLabelLine !== false },
      roseType: roseType,
      startAngle: config.pieStartAngle ?? 90,
      padAngle: config.piePadAngle ?? 0,
      selectedMode: selectedMode,
      selectedOffset: config.pieSelectedOffset ?? 10,
      itemStyle: {
        borderRadius: config.pieBorderRadius ?? 0,
      },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.2)' },
      },
    }],
  };

  // Advanced pie: add detail legend with values
  if (isAdvanced) {
    option.legend = {
      show: true,
      type: config.legendType || 'scroll',
      orient: 'vertical',
      right: 10,
      top: 'middle',
      formatter: (name: string) => {
        const item = pieData.find(d => d.name === name);
        return item ? `${name}: ${item.value}` : name;
      },
    };
    option.series[0].center = ['35%', '50%'];
  }

  // Pie grid: center the pie
  if (isGrid) {
    option.series[0].center = ['50%', '50%'];
    option.series[0].roseType = 'area';
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
    option.series[0].label = { position: 'inner', fontSize: 10 };
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

  return option;
}

// ========= Polar / Radar Chart =========
export function buildPolarChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
  const { categories, seriesList } = convertMultiSeries(data);

  // Compute max for each category (indicator)
  const maxValues = categories.map((_, i) =>
    Math.max(...seriesList.map(s => s.values[i] || 0)) * 1.2
  );

  const indicator = categories.map((name, i) => {
    const displayName = config.labelTrim && name.length > (config.labelTrimSize || 10)
      ? name.substring(0, config.labelTrimSize || 10) + '...'
      : name;
    return { name: displayName, max: config.autoScale ? maxValues[i] : undefined };
  });

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    legend: buildLegend(config),
    radar: {
      indicator,
      shape: config.radarShape || 'polygon',
      splitArea: { show: config.showGridLines !== false, areaStyle: { opacity: 0.1 } },
      splitLine: { show: config.showGridLines !== false },
      axisLine: { show: config.xAxis !== false },
      axisName: { show: config.xAxis !== false },
    },
    series: [{
      type: 'radar',
      data: seriesList.map(s => ({
        name: s.name,
        value: s.values,
        areaStyle: { opacity: config.radarAreaOpacity ?? 0.15 },
      })),
      emphasis: {
        lineStyle: { width: 3 },
      },
    }],
  };
}

// ========= Gauge Chart =========
export function buildGaugeChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  const gaugeData = data.map(d => ({
    name: String(d.name),
    value: d.value,
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    series: [{
      type: 'gauge',
      min: config.min || 0,
      max: config.max || 100,
      startAngle: config.gaugeStartAngle ?? 225,
      endAngle: config.gaugeEndAngle ?? -45,
      splitNumber: config.splitNumber ?? 10,
      axisTick: {
        show: config.gaugeShowScale !== false,
        splitNumber: config.tickSplitNumber ?? 5,
      },
      axisLine: {
        show: true,
        lineStyle: {
          width: config.gaugeAxisLineWidth ?? 15,
          color: [[1, colors[0] || '#5AA454']],
        },
      },
      axisLabel: {
        show: config.gaugeShowScale !== false,
        distance: 25,
        fontSize: 11,
      },
      splitLine: {
        show: config.gaugeShowScale !== false,
        length: 15,
      },
      pointer: {
        show: config.gaugeShowPointer !== false,
        length: `${config.gaugePointerLength ?? 60}%`,
        width: 6,
      },
      progress: {
        show: config.gaugeShowProgress || false,
        width: config.gaugeAxisLineWidth ?? 15,
      },
      detail: {
        show: config.gaugeShowValue !== false,
        formatter: config.units ? `{value} ${config.units}` : '{value}',
        fontSize: 20,
        offsetCenter: [0, '70%'],
      },
      title: { show: true, offsetCenter: [0, '90%'], fontSize: 14 },
      data: gaugeData.length > 0 ? [gaugeData[0]] : [{ value: 0, name: '' }],
    }],
  };
}

// ========= Heat Map Chart =========
export function buildHeatMapChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

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
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      position: 'top',
      formatter: (params: any) => {
        const d = params.data || params.value;
        return `${xCategories[d[0]]} / ${yCategories[d[1]]}: ${d[2]}`;
      },
    },
    legend: buildLegend(config),
    grid: {
      ...buildGrid(config),
      top: 30,
      bottom: config.showXAxisLabel ? 60 : 40,
    },
    xAxis: {
      type: 'category',
      data: xCategories,
      show: config.xAxis !== false,
      name: config.showXAxisLabel ? config.xAxisLabel : '',
      nameLocation: 'middle',
      nameGap: 35,
      splitArea: { show: true },
      axisLabel: {
        rotate: config.xAxisLabelRotate || 0,
        overflow: config.trimXAxisTicks ? 'truncate' : 'none',
        width: (config.maxXAxisTickLength || 16) * 7,
      },
    },
    yAxis: {
      type: 'category',
      data: yCategories,
      show: config.yAxis !== false,
      name: config.showYAxisLabel ? config.yAxisLabel : '',
      nameLocation: 'middle',
      nameGap: 55,
      splitArea: { show: true },
      axisLabel: {
        overflow: config.trimYAxisTicks ? 'truncate' : 'none',
        width: (config.maxYAxisTickLength || 16) * 7,
      },
    },
    visualMap: {
      min: minVal,
      max: maxVal,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: colors.length >= 2
          ? [colors[colors.length - 1], colors[0]]
          : ['#f5f5f5', colors[0] || '#3b82f6'],
      },
    },
    series: [{
      type: 'heatmap',
      data: heatData,
      label: { show: config.heatmapShowLabels !== false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
      },
    }],
  };
}

// ========= Tree Map Chart =========
export function buildTreeMapChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
  const treeData = data.map(d => ({
    name: String(d.name),
    value: d.value,
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      formatter: (params: any) => `${params.name}: ${params.value}`,
    },
    series: [{
      type: 'treemap',
      data: treeData,
      roam: config.treemapRoam || false,
      nodeClick: false,
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
      levels: [{
        itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 3 },
      }],
    }],
  };
}

// ========= Bubble Chart =========
export function buildBubbleChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
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
    data: (group.series || []).map((pt: any) => [pt.x, pt.y, pt.r || pt.value || 0]),
    symbolSize: (val: any) => {
      const r = val[2] || 0;
      if (rMax === rMin) return (minR + maxR) / 2;
      return minR + ((r - rMin) / (rMax - rMin)) * (maxR - minR);
    },
    emphasis: { focus: config.emphasis || 'series' },
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      formatter: (params: any) => {
        const d = params.data || params.value;
        return `${params.seriesName}<br/>X: ${d[0]}, Y: ${d[1]}, Size: ${d[2]}`;
      },
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    xAxis: buildValueAxis(config, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series,
  };
}

// ========= Scatter Chart =========
export function buildScatterChartOption(data: any[], config: any, chartType: string = 'scatter'): any {
  const isEffect = chartType === 'effect-scatter';
  const colors = getColors(config.colorScheme);

  const scatterData = data.map(d => ({
    name: String(d.name),
    value: [String(d.name), d.value],
  }));

  const categories = data.map(d => String(d.name));

  const option: any = {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        return `${d.name}: ${d.value[1]}`;
      },
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    toolbox: buildToolbox(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series: [{
      type: isEffect ? 'effectScatter' : 'scatter',
      data: scatterData,
      symbol: config.scatterSymbolShape || 'circle',
      symbolSize: config.scatterSymbolSize || 10,
      ...(isEffect ? {
        rippleEffect: { brushType: 'stroke', scale: config.effectRippleScale ?? 3 },
        showEffectOn: 'render',
      } : {}),
      label: buildDataLabel(config),
      emphasis: {
        focus: config.emphasis || 'series',
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
      },
    }],
  };

  const zoom = buildDataZoom(config, 'x');
  if (zoom.length) {
    option.dataZoom = zoom;
    option.grid.bottom = 80;
  }

  return option;
}

// ========= Funnel Chart =========
export function buildFunnelChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
  const funnelData = data.map(d => ({ name: String(d.name), value: d.value }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    legend: buildLegend(config),
    toolbox: buildToolbox(config),
    series: [{
      type: 'funnel',
      left: '10%',
      top: 40,
      bottom: 20,
      width: '80%',
      min: 0,
      max: Math.max(...data.map(d => d.value), 100),
      minSize: '0%',
      maxSize: '100%',
      sort: config.funnelSort || 'descending',
      funnelAlign: config.funnelAlign || 'center',
      gap: config.funnelGap ?? 2,
      label: {
        show: config.labels !== false,
        position: 'inside',
        formatter: '{b}: {c}',
        fontSize: config.labelFontSize || 12,
      },
      labelLine: { show: false },
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 1,
      },
      emphasis: {
        label: { fontSize: 14, fontWeight: 'bold' },
      },
      data: funnelData,
    }],
  };
}

// ========= Sunburst Chart =========
export function buildSunburstChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  const sunburstData = data.map(d => ({
    name: String(d.name),
    value: d.value,
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      formatter: (params: any) => `${params.name}: ${params.value}`,
    },
    toolbox: buildToolbox(config),
    series: [{
      type: 'sunburst',
      data: sunburstData,
      radius: ['15%', '90%'],
      label: {
        show: config.labels !== false,
        rotate: 'radial',
        fontSize: config.labelFontSize || 10,
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: '#fff',
      },
      emphasis: {
        focus: 'ancestor',
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
      },
      levels: [
        {},
        { r0: '15%', r: '50%', label: { rotate: 'tangential' } },
        { r0: '50%', r: '70%', label: { align: 'right' } },
        { r0: '70%', r: '90%', label: { position: 'outside', padding: 3, silent: false } },
      ],
    }],
  };
}

// ========= Sankey Chart =========
export function buildSankeyChartOption(nodes: any[], links: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'item',
      triggerOn: 'mousemove',
    },
    toolbox: buildToolbox(config),
    series: [{
      type: 'sankey',
      data: nodes,
      links: links,
      orient: config.sankeyOrient || 'horizontal',
      nodeWidth: config.sankeyNodeWidth || 20,
      nodeGap: config.sankeyNodeGap || 8,
      layoutIterations: 32,
      emphasis: {
        focus: 'adjacency',
      },
      lineStyle: {
        color: 'gradient',
        curveness: 0.5,
      },
      label: {
        show: config.labels !== false,
        fontSize: config.labelFontSize || 11,
      },
    }],
  };
}

// ========= Waterfall Chart =========
export function buildWaterfallChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
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
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const idx = params[0].dataIndex;
        const cat = categories[idx];
        const pos = typeof positiveData[idx] === 'number' ? positiveData[idx] : 0;
        const neg = typeof negativeData[idx] === 'number' ? negativeData[idx] : 0;
        const val = (pos as number) - (neg as number);
        return `${cat}: ${val >= 0 ? '+' : ''}${val}`;
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
        emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
        data: transparentData,
      },
      {
        name: 'Increase',
        type: 'bar',
        stack: 'waterfall',
        data: positiveData,
        itemStyle: {
          color: colors[0] || '#5AA454',
          ...(borderRadius ? { borderRadius } : {}),
        },
        label: buildDataLabel(config, 'top'),
      },
      {
        name: 'Decrease',
        type: 'bar',
        stack: 'waterfall',
        data: negativeData,
        itemStyle: {
          color: colors[1] || '#C62828',
          ...(borderRadius ? { borderRadius } : {}),
        },
        label: buildDataLabel(config, 'bottom'),
      },
    ],
  };

  const zoom = buildDataZoom(config, 'x');
  if (zoom.length) {
    option.dataZoom = zoom;
    option.grid.bottom = 80;
  }

  return option;
}

// ========= Box Plot Chart =========
export function buildBoxPlotChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

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
      const values = item.series.map((s: any) => s.value).sort((a: number, b: number) => a - b);
      const len = values.length;
      if (len === 0) {
        boxData.push([0, 0, 0, 0, 0]);
      } else {
        const q1 = values[Math.floor(len * 0.25)];
        const median = values[Math.floor(len * 0.5)];
        const q3 = values[Math.floor(len * 0.75)];
        boxData.push([values[0], q1, median, q3, values[len - 1]]);
      }
    } else if (item.value !== undefined) {
      boxData.push([item.value, item.value, item.value, item.value, item.value]);
    }
  });

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        return `${params.name}<br/>Min: ${d[0]}<br/>Q1: ${d[1]}<br/>Median: ${d[2]}<br/>Q3: ${d[3]}<br/>Max: ${d[4]}`;
      },
    },
    legend: buildLegend(config),
    grid: buildGrid(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: {
      ...buildValueAxis(config, 'y'),
      nice: true,
    },
    series: [{
      type: 'boxplot',
      data: boxData,
      itemStyle: {
        color: colors[0] || '#5AA454',
        borderColor: colors[1] || '#333',
      },
    }],
  };
}

// ========= Graph / Network Chart =========
export function buildGraphChartOption(nodes: any[], links: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
    },
    toolbox: buildToolbox(config),
    legend: buildLegend(config),
    series: [{
      type: 'graph',
      layout: config.graphLayout || 'force',
      roam: true,
      draggable: true,
      data: nodes.map((n: any) => ({
        ...n,
        symbolSize: Math.max(10, Math.min(n.value || 20, 60)),
        label: { show: config.labels !== false, fontSize: config.labelFontSize || 11 },
      })),
      links: links,
      categories: [],
      force: {
        repulsion: config.graphRepulsion || 200,
        edgeLength: config.graphEdgeLength || 100,
        gravity: config.graphGravity ?? 0.1,
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
    }],
  };
}

// ========= Tree Chart =========
export function buildTreeChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  const treeData = {
    name: 'Root',
    children: data.map(d => ({
      name: String(d.name),
      value: d.value,
    })),
  };

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'item',
      formatter: (params: any) => `${params.name}${params.value ? ': ' + params.value : ''}`,
    },
    toolbox: buildToolbox(config),
    series: [{
      type: 'tree',
      data: [treeData],
      orient: config.treeOrient || 'TB',
      layout: config.treeLayout || 'orthogonal',
      symbol: 'circle',
      symbolSize: 10,
      label: {
        show: config.labels !== false,
        position: config.treeOrient === 'LR' || config.treeOrient === 'RL' ? 'right' : 'top',
        fontSize: config.labelFontSize || 11,
      },
      leaves: {
        label: {
          position: config.treeOrient === 'LR' || config.treeOrient === 'RL' ? 'right' : 'bottom',
        },
      },
      expandAndCollapse: true,
      animationDuration: 550,
      animationDurationUpdate: 750,
      initialTreeDepth: 3,
    }],
  };
}

// ========= Theme River Chart =========
export function buildThemeRiverChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  const riverData = data.map((d, i) => [i, d.value, String(d.name)]);

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      trigger: 'axis',
    },
    toolbox: buildToolbox(config),
    singleAxis: {
      type: 'value',
      bottom: 30,
    },
    series: [{
      type: 'themeRiver',
      data: riverData,
      label: {
        show: config.labels !== false,
        fontSize: config.labelFontSize || 11,
      },
      emphasis: {
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.3)' },
      },
    }],
  };
}

// ========= Pictorial Bar Chart =========
export function buildPictorialBarChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
  const categories = data.map(d => String(d.name));
  const values = data.map(d => d.value);

  const symbol = config.pictorialSymbol || 'roundRect';

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config, 'axis'),
    toolbox: buildToolbox(config),
    grid: buildGrid(config),
    xAxis: buildCategoryAxis(config, categories, 'x'),
    yAxis: buildValueAxis(config, 'y'),
    series: [{
      type: 'pictorialBar',
      data: values,
      symbol: symbol,
      symbolRepeat: config.pictorialRepeat || false,
      symbolSize: config.pictorialRepeat ? [20, 6] : ['100%', '100%'],
      symbolClip: !config.pictorialRepeat,
      barCategoryGap: '40%',
      label: buildDataLabel(config, 'top'),
    }],
  };
}

// ========= Polar Bar Chart =========
export function buildPolarBarChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);
  const categories = data.map(d => String(d.name));
  const values = data.map(d => d.value);

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: buildTooltip(config),
    toolbox: buildToolbox(config),
    legend: buildLegend(config),
    angleAxis: {
      type: 'category',
      data: categories,
      axisLabel: { fontSize: 10 },
    },
    radiusAxis: {
      show: config.yAxis !== false,
    },
    polar: {
      radius: [`${config.polarBarInnerRadius ?? 15}%`, '80%'],
    },
    series: [{
      type: 'bar',
      data: values,
      coordinateSystem: 'polar',
      label: buildDataLabel(config, 'middle'),
      itemStyle: {
        borderRadius: config.roundEdges ? 4 : 0,
      },
    }],
  };
}

// ========= Radar Chart (standalone) =========
export function buildRadarChartOption(data: any[], config: any): any {
  // Radar uses the same logic as polar chart
  return buildPolarChartOption(data, config);
}

// ========= Candlestick Chart =========
export function buildCandlestickChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: each item = [open, close, low, high] or { name, value: [open, close, low, high] }
  let categories: string[] = [];
  let values: number[][] = [];

  if (data.length > 0 && data[0].value && Array.isArray(data[0].value)) {
    categories = data.map(d => String(d.name));
    values = data.map(d => d.value);
  } else if (data.length > 0 && Array.isArray(data[0])) {
    categories = data.map((_, i) => `Day ${i + 1}`);
    values = data;
  } else {
    return {};
  }

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: {
      ...buildTooltip(config, 'axis'),
      formatter: (params: any) => {
        const d = params[0];
        if (!d) return '';
        return `${d.name}<br/>Open: ${d.data[0]}<br/>Close: ${d.data[1]}<br/>Low: ${d.data[2]}<br/>High: ${d.data[3]}`;
      },
    },
    legend: buildLegend(config),
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
      scale: config.niceScale !== false,
      splitLine: { show: config.showGridLines !== false },
    },
    dataZoom: buildDataZoom(config),
    series: [{
      type: 'candlestick',
      data: values,
      itemStyle: {
        color: colors[0] || '#ec0000',
        color0: colors[1] || '#00da3c',
        borderColor: colors[0] || '#ec0000',
        borderColor0: colors[1] || '#00da3c',
      },
    }],
  };
}

// ========= Parallel Chart =========
export function buildParallelChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: { dimensions: ['dim1', 'dim2', ...], data: [[v1, v2, ...], ...] }
  // Or array of objects with named fields
  let dimensions: string[] = [];
  let seriesData: number[][] = [];

  if (data.length > 0 && data[0].dimensions) {
    dimensions = data[0].dimensions;
    seriesData = data[0].data || [];
  } else if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    dimensions = Object.keys(data[0]);
    seriesData = data.map(d => dimensions.map(dim => d[dim]));
  } else {
    return {};
  }

  const parallelAxis = dimensions.map((dim, i) => ({
    dim: i,
    name: dim,
    type: typeof seriesData[0]?.[i] === 'number' ? 'value' : 'category',
  }));

  return {
    color: colors,
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    legend: buildLegend(config),
    parallelAxis,
    parallel: {
      left: 80,
      right: 80,
      bottom: 60,
      top: 60,
      parallelAxisDefault: {
        type: 'value',
        nameLocation: 'end',
        nameGap: 20,
        nameTextStyle: { fontSize: 12 },
      },
    },
    series: [{
      type: 'parallel',
      lineStyle: {
        width: config.parallelLineWidth || 1,
        opacity: config.parallelLineOpacity ?? 0.5,
      },
      smooth: config.parallelSmooth || false,
      data: seriesData,
    }],
  };
}

// ========= 3D Charts (require echarts-gl) =========

// ========= Bar 3D Chart =========
export function buildBar3DChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: [[x, y, z], ...] or [{ name, value: [x, y, z] }, ...]
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  const maxVal = Math.max(...seriesData.map(d => d[2] || 0), 1);

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    visualMap: {
      max: maxVal,
      inRange: { color: colors.slice(0, 5) },
      show: false,
    },
    xAxis3D: { type: 'category', name: config.xAxisLabel || '' },
    yAxis3D: { type: 'category', name: config.yAxisLabel || '' },
    zAxis3D: { type: 'value', name: config.zAxisLabel || '' },
    grid3D: {
      boxWidth: config.grid3DBoxWidth || 100,
      boxDepth: config.grid3DBoxDepth || 100,
      boxHeight: config.grid3DBoxHeight || 100,
      viewControl: { autoRotate: config.autoRotate || false },
    },
    series: [{
      type: 'bar3D',
      data: seriesData.map(d => ({ value: d })),
      shading: config.shading || 'lambert',
      label: { show: config.showDataLabel || false, fontSize: 10 },
      itemStyle: { opacity: config.itemOpacity ?? 0.8 },
    }],
  };
}

// ========= Line 3D Chart =========
export function buildLine3DChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: [[x, y, z], ...]
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    xAxis3D: { type: 'value', name: config.xAxisLabel || '' },
    yAxis3D: { type: 'value', name: config.yAxisLabel || '' },
    zAxis3D: { type: 'value', name: config.zAxisLabel || '' },
    grid3D: {
      viewControl: { autoRotate: config.autoRotate || false },
    },
    series: [{
      type: 'line3D',
      data: seriesData,
      lineStyle: {
        width: config.lineWidth || 2,
        color: colors[0],
        opacity: config.lineOpacity ?? 1,
      },
    }],
  };
}

// ========= Scatter 3D Chart =========
export function buildScatter3DChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => d.value);
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    xAxis3D: { type: 'value', name: config.xAxisLabel || '' },
    yAxis3D: { type: 'value', name: config.yAxisLabel || '' },
    zAxis3D: { type: 'value', name: config.zAxisLabel || '' },
    grid3D: {
      viewControl: { autoRotate: config.autoRotate || false },
    },
    series: [{
      type: 'scatter3D',
      data: seriesData,
      symbolSize: config.scatterSymbolSize || 10,
      itemStyle: {
        color: colors[0],
        opacity: config.itemOpacity ?? 0.8,
      },
    }],
  };
}

// ========= Surface Chart =========
export function buildSurfaceChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: [[x, y, z], ...] coordinate grid
  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0]?.value) {
    seriesData = data.map(d => d.value);
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    visualMap: {
      show: config.showVisualMap || false,
      dimension: 2,
      inRange: { color: colors.slice(0, 5) },
    },
    xAxis3D: { type: 'value', name: config.xAxisLabel || '' },
    yAxis3D: { type: 'value', name: config.yAxisLabel || '' },
    zAxis3D: { type: 'value', name: config.zAxisLabel || '' },
    grid3D: {
      viewControl: { autoRotate: config.autoRotate || false },
    },
    series: [{
      type: 'surface',
      data: seriesData,
      shading: config.shading || 'lambert',
      wireframe: { show: config.wireframe !== false },
      itemStyle: { opacity: config.itemOpacity ?? 0.9 },
    }],
  };
}

// ========= Globe Chart =========
export function buildGlobeChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

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
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      formatter: (params: any) => {
        const idx = params.dataIndex;
        const name = tooltipNames[idx] || '';
        const val = params.value?.[2] ?? '';
        return name ? `${name}: ${val}` : `${val}`;
      },
    },
    globe: {
      baseColor: config.globeBaseColor || '#304156',
      shading: 'color',
      viewControl: {
        autoRotate: config.autoRotate !== false,
        autoRotateSpeed: config.autoRotateSpeed || 10,
        distance: 200,
      },
      light: {
        main: { intensity: 1.2, shadow: false },
        ambient: { intensity: 0.6 },
      },
      layers: [{
        type: 'blend',
        blendTo: 'emission',
        texture: 'none',
      }],
    },
    series: [{
      type: 'scatter3D',
      coordinateSystem: 'globe',
      data: seriesData,
      symbolSize: (val: any) => Math.max(6, (val?.[2] || 10) / 5),
      label: {
        show: config.showDataLabel || false,
        formatter: (params: any) => tooltipNames[params.dataIndex] || '',
        fontSize: 10,
      },
      itemStyle: {
        color: colors[0],
        opacity: 0.9,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
      },
    }],
  };
}

// ========= Graph GL Chart =========
export function buildGraphGLChartOption(nodes: any[], links: any[], config: any): any {
  const colors = getColors(config.colorScheme);

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
  } else if (Array.isArray(nodes) && nodes.length > 0 && nodes[0]?.nodes && nodes[0]?.links) {
    // Array where first element wraps nodes/links
    graphNodes = nodes[0].nodes;
    graphLinks = nodes[0].links;
  } else if (Array.isArray(nodes)) {
    graphNodes = nodes;
    graphLinks = Array.isArray(links) ? links : [];
  }

  if (!graphNodes.length) return {};

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    series: [{
      type: 'graphGL',
      nodes: graphNodes.map((n: any, i: number) => ({
        name: String(n.name || n.id || i),
        value: n.value || 1,
        symbolSize: n.symbolSize || config.nodeSize || 10,
        itemStyle: { color: colors[i % colors.length] },
      })),
      edges: graphLinks.map((l: any) => ({
        source: String(l.source),
        target: String(l.target),
      })),
      forceAtlas2: {
        steps: 5,
        gravity: config.graphGravity || 0.1,
        edgeWeightInfluence: 1,
      },
    }],
  };
}

// ========= Scatter GL Chart =========
export function buildScatterGLChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  let seriesData: any[] = [];
  if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data;
  } else if (data.length > 0 && data[0].value) {
    seriesData = data.map(d => [d.value[0], d.value[1]]);
  } else if (data.length > 0 && data[0].name !== undefined) {
    seriesData = data.map(d => [d.name, d.value]);
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    xAxis: { type: 'value', show: config.xAxis !== false, splitLine: { show: config.showGridLines !== false } },
    yAxis: { type: 'value', show: config.yAxis !== false, splitLine: { show: config.showGridLines !== false } },
    series: [{
      type: 'scatterGL',
      data: seriesData,
      symbolSize: config.scatterSymbolSize || 5,
      itemStyle: {
        color: colors[0],
        opacity: config.itemOpacity ?? 0.6,
      },
    }],
  };
}

// ========= Lines GL Chart =========
export function buildLinesGLChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: [{ coords: [[x1, y1], [x2, y2], ...] }, ...]
  let seriesData: any[] = [];
  if (data.length > 0 && data[0].coords) {
    seriesData = data;
  } else if (data.length > 0 && Array.isArray(data[0])) {
    seriesData = data.map(d => ({ coords: d }));
  }

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    xAxis: { type: 'value', show: config.xAxis !== false },
    yAxis: { type: 'value', show: config.yAxis !== false },
    series: [{
      type: 'linesGL',
      polyline: true,
      data: seriesData,
      lineStyle: {
        color: colors[0],
        width: config.lineWidth || 1,
        opacity: config.lineOpacity ?? 0.5,
      },
    }],
  };
}

// ========= Map 3D Chart =========
// Renders as a 3D bar chart with region labels since map GeoJSON registration is not available.
export function buildMap3DChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Data format: [{ name: 'region', value: number }, ...]
  const seriesData = data.map(d => ({
    name: String(d.name),
    value: typeof d.value === 'number' ? d.value : (Array.isArray(d.value) ? d.value[2] || 0 : 0),
  }));

  const categories = seriesData.map(d => d.name);
  const values = seriesData.map((d, i) => [i, 0, d.value]);
  const maxVal = Math.max(...seriesData.map(d => d.value || 0), 1);

  return {
    ...buildAnimation(config),
    tooltip: {
      show: !config.tooltipDisabled,
      formatter: (params: any) => `${params.name || categories[params.value?.[0]] || ''}: ${params.value?.[2] ?? ''}`,
    },
    visualMap: {
      show: config.showVisualMap !== false,
      min: 0,
      max: maxVal,
      inRange: { color: colors.slice(0, 5) },
    },
    xAxis3D: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis3D: { type: 'category', data: [''] },
    zAxis3D: { type: 'value', name: 'Value' },
    grid3D: {
      boxWidth: 120,
      boxDepth: 40,
      viewControl: { autoRotate: config.autoRotate || false },
      light: {
        main: { intensity: 1.2 },
        ambient: { intensity: 0.3 },
      },
    },
    series: [{
      type: 'bar3D',
      data: values.map((v, i) => ({ value: v, name: categories[i] })),
      shading: 'lambert',
      label: { show: config.showDataLabel || false, fontSize: 10 },
      itemStyle: { opacity: 0.85 },
    }],
  };
}

// ========= Flow GL Chart =========
// FlowGL requires a vector field. Since it needs specific texture/function format,
// we render as a scatter chart with arrows to visualize the vector field.
export function buildFlowGLChartOption(data: any[], config: any): any {
  const colors = getColors(config.colorScheme);

  // Extract vector field data: [x, y, vx, vy]
  let vectorData: any[] = [];
  if (data.length > 0 && data[0].data) {
    vectorData = data[0].data;
  } else if (data.length > 0 && Array.isArray(data[0])) {
    vectorData = data;
  }

  // Convert vector field to scatter + line overlay for visualization
  const scatterData = vectorData.map((v: any) => [v[0], v[1]]);
  const lineData = vectorData.map((v: any) => ({
    coords: [
      [v[0], v[1]],
      [v[0] + (v[2] || 0) * 0.05, v[1] + (v[3] || 0) * 0.05],
    ],
  }));

  return {
    ...buildAnimation(config),
    tooltip: { show: !config.tooltipDisabled },
    xAxis: { type: 'value', show: true, splitLine: { show: false } },
    yAxis: { type: 'value', show: true, splitLine: { show: false } },
    series: [
      {
        type: 'scatter',
        data: scatterData,
        symbolSize: 4,
        itemStyle: { color: colors[0], opacity: 0.8 },
      },
      {
        type: 'lines',
        polyline: false,
        data: lineData,
        lineStyle: { color: colors[1] || colors[0], width: 1.5, opacity: 0.6 },
        effect: {
          show: true,
          period: 4,
          trailLength: 0.3,
          symbolSize: 3,
          color: colors[2] || colors[0],
        },
      },
    ],
  };
}
