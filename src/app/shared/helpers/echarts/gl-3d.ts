/* Extracted from echarts-option-builder.ts — gl-3d chart builders. */

import {
  buildLatLonPoints,
  joinRegionData,
} from '../../../modules/analyses/helpers/geo-registry';
import {
  formatTooltipValue,
} from './chart-postprocess';
import {
  CHART_TYPOGRAPHY,
  buildAnimation,
  buildTooltip,
  getColors,
} from './chart-primitives';
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
export function build3DAxis(
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
export function build3DGrid(config: any): any {
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
