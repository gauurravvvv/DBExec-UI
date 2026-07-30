/* Extracted from echarts-option-builder.ts — build-chart-option chart builders. */

import {
  applyCartesianAnalytics,
} from './chart-analytics';
import {
  CHART_TYPE_BUILDERS,
  NODE_LINK_BUILDERS,
  SIMPLE_BUILDERS,
} from './chart-postprocess';
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

