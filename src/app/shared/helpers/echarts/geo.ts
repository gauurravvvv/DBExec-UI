/* Extracted from echarts-option-builder.ts — geo chart builders. */

import {
  buildLatLonPoints,
  joinRegionData,
} from '../../../modules/analyses/helpers/geo-registry';
import {
  formatTooltipValue,
} from './chart-postprocess';
import {
  CHART_TYPOGRAPHY,
  adjustColorOpacity,
  buildAnimation,
  buildGrid,
  buildTooltip,
  getColors,
} from './chart-primitives';
/** Read the geo field config (typed GeoConfig on `config.geo` + fallbacks). */
export function readGeoFields(config: any): {
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
    regionSet: String(
      geo.regionSet || geo.mapId || config?.geoRegionSet || 'world',
    ),
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

/**
 * True when `data` looks like the ECharts map shape already ({name,value}[]),
 * vs raw analysis rows we still need to join. A row with a `value` key AND a
 * `name` key is treated as pre-shaped; anything else with the configured
 * region field is treated as raw rows.
 */
export function isPreShapedRegionData(data: any[]): boolean {
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

/**
 * Resolve choropleth `{name,value}[]` from either pre-shaped data or raw rows.
 * Returns the data plus any unmatched region labels (for a UI warning — stamped
 * on the option under `__geoUnmatched` so a caller can surface it without a
 * separate channel; ECharts ignores unknown top-level keys).
 */
export function resolveRegionData(
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
        color:
          Array.isArray(config.visualMapColors) &&
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

// ========= Point Map / Bubble Map =========
// Markers positioned at lat/lon on a geo coordinate system. Point map = fixed
// symbol size; bubble map = symbol size encodes a measure. Binds the geo
// coordinateSystem to the registered region set so the basemap draws behind the
// points. Data: raw rows with lat/lon (+ optional value/label) fields.
export function buildGeoScatterOption(
  data: any[],
  config: any,
  variant: 'point' | 'bubble',
): any {
  const fields = readGeoFields(config);
  const colors = getColors(config.colorScheme || 'default');
  const primary = colors[0] || '#5470c6';

  const built =
    fields.latField && fields.lonField
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
        if (link)
          return `${link.source} → ${link.target}: ${formatTooltipValue(config, link.value ?? 1)}`;
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
        const fpos = (v: number) =>
          hasPrec ? formatTooltipValue(config, v) : v.toFixed(2);
        const fmag = (v: number) =>
          hasPrec ? formatTooltipValue(config, v) : v.toFixed(3);
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
