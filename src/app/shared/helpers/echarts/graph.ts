/* Extracted from echarts-option-builder.ts — graph chart builders. */

import {
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
} from './chart-primitives';
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

// ========= Arc / Chord / Network (graph-family) =========
// All three are node+link relationship graphs with different layouts. They
// share ECharts' `graph` series; layout differs (none-with-x for arc, circular
// for chord, force for network). Data: (nodes[], links[], config).
export function buildRelationshipGraphOption(
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
      symbolSize:
        n.symbolSize ?? Math.max(8, Math.min(40, Number(n.value) || 10)),
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
    lineStyle: {
      width: Math.max(1, Math.min(8, Number(l.value) || 1)),
      opacity: 0.5,
      curveness: layout === 'arc' ? 0.3 : 0.2,
    },
  }));

  const layoutMap = {
    arc: 'none',
    circular: 'circular',
    force: 'force',
  } as const;

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


export function buildArcChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  return buildRelationshipGraphOption(nodes, links, config, 'arc');
}


export function buildChordChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  return buildRelationshipGraphOption(nodes, links, config, 'circular');
}


export function buildNetworkChartOption(
  nodes: any[],
  links: any[],
  config: any,
): any {
  return buildRelationshipGraphOption(nodes, links, config, 'force');
}

// ========= Statistical-binning stubs (need transformer support) =========
// These require genuine statistical PRE-PROCESSING (kernel density, quantile
// computation, hex binning) that belongs in the data-transform layer, not the
// pure option builder. Rendering them from raw {name,value}[] would produce a
// misleading chart, so they show a clear empty-state until the transformer
// emits the binned/pre-computed shape. Listed in the wave report for routing.

