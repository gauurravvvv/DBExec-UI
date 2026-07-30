/**
 * Per-shape chart data transforms.
 *
 * Extracted verbatim from ChartDataTransformerService: these build a specific
 * chart family's data structure and read no instance state, so they are free
 * functions. The service dispatches to them from transformDataRaw.
 */
import {
  looksTemporal,
} from './temporal';
import {
  ChartDataMapping,
  MultiSeriesData,
  SingleSeriesData,
} from '../models';
import {
  aggregateSamples,
  formatBinBoundary,
  formatCategoryLabel,
  formatLabelValue,
  isColumnNumeric,
  percentile,
  sortChronologicallyIfTemporal,
  toNumber,
} from './chart-transform-utils';

/**
 * Transform data to 3D coordinate format: [[x, y, z], ...]
 * Used for bar3d, line3d, scatter3d chart types.
 *
 * bar3D uses category axes on x and y, so the values must be the raw category
 * strings rather than `toNumber()` (which collapses every string to NaN→0 and
 * piled all 1000 rows on cell [0,0,…]). For line3d / scatter3d the axes are
 * numeric, so we still coerce to number. When the x/y columns are categorical
 * we also AGGREGATE by (x,y) — summing z — so a 4-region × 4-product dataset
 * produces 16 bars instead of 1000 overlapping ones.
 */
export function transformTo3DFormat(
  rawData: any[],
  mapping: ChartDataMapping,
  chartType?: string,
): any[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
    return [];
  }

  // Detect categorical x/y from the first non-null value.
  const xSample = rawData.find(r => r[mapping.xAxisColumn!] != null)?.[
    mapping.xAxisColumn!
  ];
  const ySample = rawData.find(r => r[mapping.yAxisColumn!] != null)?.[
    mapping.yAxisColumn!
  ];
  const xIsCategory = typeof xSample === 'string' && isNaN(Number(xSample));
  const yIsCategory = typeof ySample === 'string' && isNaN(Number(ySample));

  // Only bar3D uses category axes; line3D / scatter3D have value axes and
  // expect numeric data. Don't promote string data into a category-axis
  // aggregation for those — that would only stack everything at (0,0).
  if (chartType === 'bar3d' && (xIsCategory || yIsCategory)) {
    // Aggregate by (x,y) group, summing z.
    const groups = new Map<string, [any, any, number]>();
    for (const row of rawData) {
      const xRaw = row[mapping.xAxisColumn!];
      const yRaw = row[mapping.yAxisColumn!];
      const x = xIsCategory ? String(xRaw ?? '') : toNumber(xRaw);
      const y = yIsCategory ? String(yRaw ?? '') : toNumber(yRaw);
      const z = mapping.zAxisColumn
        ? toNumber(row[mapping.zAxisColumn])
        : 0;
      if (!isFinite(z)) continue;
      const key = JSON.stringify([x, y]);
      const prev = groups.get(key);
      if (prev) {
        prev[2] += z;
      } else {
        groups.set(key, [x, y, z]);
      }
    }
    return Array.from(groups.values());
  }

  return rawData
    .map(row => {
      const x = toNumber(row[mapping.xAxisColumn!]);
      const y = toNumber(row[mapping.yAxisColumn!]);
      const z = mapping.zAxisColumn
        ? toNumber(row[mapping.zAxisColumn])
        : 0;
      return [x, y, z];
    })
    .filter(([x, y, z]) => isFinite(x) && isFinite(y) && isFinite(z));
}

/**
 * Transform data to box plot format
 * Box plots need: [{ name, value: [min, q1, median, q3, max] }]
 * Groups by x-axis and calculates statistics for y-axis values
 */
export function transformToBoxPlotFormat(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  // Prefer the new `sampleColumn` role (raw samples — the canonical
  // ECharts input for boxplot). Fall back to yAxisColumn for visuals
  // created before the role spec existed.
  const sampleCol = mapping.sampleColumn ?? mapping.yAxisColumn;
  if (!mapping.xAxisColumn || !sampleCol) {
    return [];
  }

  const groupMap = new Map<string, number[]>();

  // Group numeric values by category
  rawData.forEach(row => {
    const category = formatLabelValue(row[mapping.xAxisColumn!]);
    const value = toNumber(row[sampleCol!]);

    if (!groupMap.has(category)) {
      groupMap.set(category, []);
    }
    groupMap.get(category)!.push(value);
  });

  // Calculate box plot statistics for each group
  return Array.from(groupMap.entries()).map(([category, values]) => {
    const sorted = values.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const q1 = percentile(sorted, 25);
    const median = percentile(sorted, 50);
    const q3 = percentile(sorted, 75);

    return {
      name: category,
      value: [min, q1, median, q3, max],
    };
  });
}

/**
 * Transform data to bubble chart format
 * Bubble charts need: [{ name: 'Series', series: [{ name, x, y, r }] }]
 * Uses x-axis for x, y-axis for y, z-axis for bubble size (r)
 */
export function transformToBubbleFormat(
  rawData: any[],
  mapping: ChartDataMapping,
): MultiSeriesData[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
    return [];
  }

  // ECharts bubble (scatter with size) expects numeric x AND y. When the
  // x column is non-numeric we substitute the row index as x (treating
  // bubble as a strip-plot grouped by category label). Previously this
  // function used `row[xAxisColumn]` twice — once as the category label,
  // once as the numeric x — which collapsed x to 0 for any category x.
  const isXNumeric = isColumnNumeric(rawData, mapping.xAxisColumn);
  const categoryMap = new Map<string, any[]>();

  rawData.forEach((row, rowIdx) => {
    // When X is numeric (the true XY scatter/bubble case) every row is a
    // distinct point — grouping by the X value would create one
    // single-point series per row (hundreds of series, each a different
    // colour). Put them all in ONE series instead. Only group into
    // separate (coloured) series when X is categorical.
    const category = isXNumeric
      ? 'points'
      : formatLabelValue(row[mapping.xAxisColumn!]);
    const x = isXNumeric ? toNumber(row[mapping.xAxisColumn!]) : rowIdx;
    const y = toNumber(row[mapping.yAxisColumn!]);
    const r = mapping.zAxisColumn
      ? toNumber(row[mapping.zAxisColumn])
      : 10; // Default size if no z-axis

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }

    categoryMap.get(category)!.push({
      name: category,
      x: x,
      y: y,
      r: Math.max(r, 1), // Ensure minimum size
    });
  });

  // Convert to multi-series format
  return Array.from(categoryMap.entries()).map(([category, points]) => ({
    name: category,
    series: points,
  }));
}

/**
 * Lines 3D on globe — pair-of-points segments. Prefer lng/lat roles
 * when set; fall back to x/y for backwards compat (legacy behaviour
 * was to read xAxis as lng and yAxis as lat).
 */
export function transformToGeoLines3D(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  const lngCol = mapping.lngColumn ?? mapping.xAxisColumn;
  const latCol = mapping.latColumn ?? mapping.yAxisColumn;
  if (!lngCol || !latCol) return [];
  return rawData
    .map(row => {
      const lng = toNumber(row[lngCol]);
      const lat = toNumber(row[latCol]);
      return isFinite(lng) && isFinite(lat) ? [lng, lat, 0] : null;
    })
    .filter((v): v is number[] => v !== null);
}

/**
 * Globe / geo overlay — `[{value: [lng, lat, value]}, ...]`.
 * `lngColumn` / `latColumn` are required; `yAxisColumn` (if set)
 * carries the third numeric value, otherwise 1.
 */
export function transformToGeoLngLatValue(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  const { lngColumn, latColumn, yAxisColumn } = mapping;
  if (!lngColumn || !latColumn) return [];
  return rawData
    .map(row => {
      const lng = toNumber(row[lngColumn]);
      const lat = toNumber(row[latColumn]);
      const value = yAxisColumn ? toNumber(row[yAxisColumn]) : 1;
      return isFinite(lng) && isFinite(lat)
        ? { value: [lng, lat, value] }
        : null;
    })
    .filter((v): v is { value: number[] } => v !== null);
}

/**
 * Transform raw data to heat-map format (3D: row, column, value)
 * Groups data by xAxisColumn (rows) with yAxisColumn (columns) and zAxisColumn (values)
 */
export function transformToHeatMapFormat(
  rawData: any[],
  mapping: ChartDataMapping,
): MultiSeriesData[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn || !mapping.zAxisColumn) {
    return [];
  }

  // Detect if Z-axis is numeric
  const isZAxisNumeric = isColumnNumeric(rawData, mapping.zAxisColumn);
  const rowMap = new Map<string, Map<string, number>>();

  rawData.forEach(row => {
    const rowName = formatLabelValue(row[mapping.xAxisColumn!]);
    const colName = formatLabelValue(row[mapping.yAxisColumn!]);

    let value: number;
    if (isZAxisNumeric) {
      value = toNumber(row[mapping.zAxisColumn!]);
    } else {
      // Count occurrences for non-numeric Z-axis
      value = 1;
    }

    if (!rowMap.has(rowName)) {
      rowMap.set(rowName, new Map());
    }
    const colMap = rowMap.get(rowName)!;
    const existing = colMap.get(colName) || 0;
    colMap.set(colName, existing + value);
  });

  return Array.from(rowMap.entries()).map(([rowName, colMap]) => ({
    name: rowName,
    series: Array.from(colMap.entries()).map(([colName, value]) => ({
      name: colName,
      value,
    })),
  }));
}

/**
 * Hierarchical — tree/treemap/sunburst. Reads `xAxisColumn` (name),
 * `yAxisColumn` (value), `parentColumn` (parent-name). Rows with a null
 * or empty parent become roots. Returns a forest (array of trees); the
 * tree builder wraps a single synthetic root around it if needed.
 *
 * If no `parentColumn` is set, returns flat `{name, value}[]` as siblings
 * of an implicit root — matches old behaviour.
 */
export function transformToHierarchy(rawData: any[], mapping: ChartDataMapping): any {
  const { xAxisColumn, yAxisColumn, parentColumn } = mapping;
  if (!xAxisColumn) {
    return [];
  }
  if (!parentColumn) {
    // Flat fallback (no hierarchy). AGGREGATE by name — previously this
    // mapped every raw row 1:1, so a treemap/sunburst over e.g. 1000 rows of
    // 4 products produced 1000 tiny slivers instead of 4 summed tiles. Sum
    // the value per distinct name so each category is one node. When
    // yAxisColumn is absent (e.g. tree chart with just xAxis), use a row
    // count so the tree builder still has nodes to render.
    const agg = new Map<string, number>();
    rawData.forEach(row => {
      const name = formatLabelValue(row[xAxisColumn]);
      if (!name || name === '(empty)') return;
      const v = yAxisColumn ? toNumber(row[yAxisColumn]) : 1;
      agg.set(name, (agg.get(name) || 0) + v);
    });
    return Array.from(agg.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }
  // Build a name → node map, then attach children to their parents.
  const nodes = new Map<
    string,
    { name: string; value: number; children: any[] }
  >();
  rawData.forEach(row => {
    const name = formatLabelValue(row[xAxisColumn]);
    // When yAxis isn't mapped (tree chart with just xAxis + parent), each
    // row contributes a count of 1.
    const value = yAxisColumn ? toNumber(row[yAxisColumn]) : 1;
    if (!name || name === '(empty)') return;
    if (nodes.has(name)) {
      // Aggregate duplicate-named rows
      nodes.get(name)!.value += value;
    } else {
      nodes.set(name, { name, value, children: [] });
    }
  });
  const roots: any[] = [];
  rawData.forEach(row => {
    const name = formatLabelValue(row[xAxisColumn]);
    const node = nodes.get(name);
    if (!node) return;
    const rawParent = row[parentColumn];
    const parentName =
      rawParent === null || rawParent === undefined || rawParent === ''
        ? null
        : formatLabelValue(rawParent);
    if (parentName === null || parentName === name) {
      if (!roots.includes(node)) roots.push(node);
    } else {
      const parent = nodes.get(parentName);
      if (parent && !parent.children.includes(node)) {
        parent.children.push(node);
      } else if (!parent && !roots.includes(node)) {
        // Orphan — parent doesn't exist; treat as root so it still renders.
        roots.push(node);
      }
    }
  });
  return roots;
}

/**
 * Histogram — auto-bin the numeric `xAxisColumn` into frequency buckets and
 * return `{name, value}[]` where name is the bin range label and value is the
 * count of rows in that bin. Bin count comes from `mapping.histogramBins`;
 * 0/undefined falls back to Sturges' rule (⌈log2(n)⌉ + 1), capped to [1, 50].
 *
 * Non-numeric / null cells are skipped. When the column has no numeric spread
 * (all identical, or < 2 usable values) a single bucket is returned so the
 * chart still renders rather than blanking.
 */
export function transformToHistogram(
  rawData: any[],
  mapping: ChartDataMapping,
): SingleSeriesData[] {
  const col = mapping.xAxisColumn;
  if (!col) return [];

  const values: number[] = [];
  rawData.forEach(row => {
    const raw = row[col];
    if (raw === null || raw === undefined || raw === '') return;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) values.push(n);
  });
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    // No spread — one bucket holding every row.
    return [{ name: formatBinBoundary(min), value: values.length }];
  }

  // Bin count: explicit config wins; otherwise Sturges' rule.
  const requested = Math.floor(mapping.histogramBins || 0);
  const sturges = Math.ceil(Math.log2(values.length)) + 1;
  const binCount = Math.max(
    1,
    Math.min(50, requested > 0 ? requested : sturges),
  );

  const width = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  values.forEach(v => {
    // Last bin is inclusive of max so the maximum value isn't dropped.
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  });

  return counts.map((count, i) => {
    const lo = min + i * width;
    const hi = i === binCount - 1 ? max : lo + width;
    return {
      name: `${formatBinBoundary(lo)}–${formatBinBoundary(hi)}`,
      value: count,
    };
  });
}

/**
 * Lines GL — multi-segment polyline. Each row contributes a vertex; the
 * builder splits into `[start, end]` pairs.
 */
export function transformToLineSegments(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  const lngCol = mapping.lngColumn ?? mapping.xAxisColumn;
  const latCol = mapping.latColumn ?? mapping.yAxisColumn;
  if (!lngCol || !latCol) return [];
  const points: number[][] = [];
  rawData.forEach(row => {
    const x = toNumber(row[lngCol]);
    const y = toNumber(row[latCol]);
    if (isFinite(x) && isFinite(y)) points.push([x, y]);
  });
  // Build consecutive [start, end] pairs as separate line segments.
  const segments: any[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ coords: [points[i], points[i + 1]] });
  }
  return segments;
}

/**
 * Multi-series bars / lines / areas. `xAxisColumn` defines the category;
 * `yAxisColumn` is the first value series; `valueColumns` carries any
 * additional series. Output shape matches `MultiSeriesData[]`:
 *
 *   [{ name: <seriesName>, series: [{ name: <category>, value: <n> }, ...] }]
 *
 * One outer entry per series — that's what every consumer of multi-series
 * shape (line/area/2D-bar builders) already expects.
 */
export function transformToMultiSeriesByValueColumns(
  rawData: any[],
  mapping: ChartDataMapping,
): MultiSeriesData[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
    return [];
  }
  const valueCols = [mapping.yAxisColumn!, ...(mapping.valueColumns ?? [])];

  // One shared raw-label map so every series orders on the same underlying
  // x value (a temporal dimension sorts chronologically across all series).
  const rawByLabel = new Map<string, unknown>();

  // Aggregate one value per (series, category), honouring the chosen
  // aggregate (SUM/AVG/MIN/MAX/COUNT/…) instead of blindly summing so combo /
  // stacked / multi-line measures are correct client-side.
  const aggFn = mapping.aggregate ?? null;
  return valueCols.map(col => {
    const isNumeric = isColumnNumeric(rawData, col);
    const countMode = aggFn === 'count' || (!isNumeric && !aggFn);
    const buckets = new Map<string, number[]>();
    const counts = new Map<string, number>();
    rawData.forEach(row => {
      const rawName = row[mapping.xAxisColumn!];
      const name = formatCategoryLabel(rawName, mapping);
      if (!rawByLabel.has(name)) rawByLabel.set(name, rawName);
      if (countMode) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      } else {
        const b = buckets.get(name) ?? [];
        b.push(toNumber(row[col]));
        buckets.set(name, b);
      }
    });
    const series = countMode
      ? Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
      : Array.from(buckets.entries()).map(([name, samples]) => ({
          name,
          value: aggregateSamples(samples, aggFn, mapping.percentile),
        }));
    return {
      name: col,
      // Chronological order for a temporal x; insertion order otherwise
      // (unchanged for non-time charts).
      series: sortChronologicallyIfTemporal(series, rawByLabel),
    };
  });
}

/**
 * Candlestick — `[[open, close, low, high], ...]` per category.
 * Empty rows or missing role columns surface as `null` data items so
 * ECharts skips them rather than rendering a zero-height candle.
 */
export function transformToOhlc(rawData: any[], mapping: ChartDataMapping): any {
  const { xAxisColumn, openColumn, highColumn, lowColumn, closeColumn } =
    mapping;
  if (
    !xAxisColumn ||
    !openColumn ||
    !highColumn ||
    !lowColumn ||
    !closeColumn
  ) {
    return { categories: [], values: [] };
  }
  const categories: string[] = [];
  const values: (number[] | null)[] = [];
  rawData.forEach(row => {
    categories.push(formatLabelValue(row[xAxisColumn]));
    const o = toNumber(row[openColumn]);
    const c = toNumber(row[closeColumn]);
    const l = toNumber(row[lowColumn]);
    const h = toNumber(row[highColumn]);
    if (!isFinite(o) || !isFinite(c) || !isFinite(l) || !isFinite(h)) {
      values.push(null);
    } else {
      values.push([o, c, l, h]);
    }
  });
  return { categories, values };
}

/**
 * Parallel — `[[d0, d1, ...dN], ...]` plus `parallelAxis[]` config. Reads
 * `dimensionColumns` (ordered). xAxis is optional and, when set, used as
 * the line-name (legend entry).
 */
export function transformToParallel(rawData: any[], mapping: ChartDataMapping): any {
  const { xAxisColumn, dimensionColumns } = mapping;
  if (!dimensionColumns?.length) {
    return { axes: [], data: [] };
  }
  const axes = dimensionColumns.map((col, idx) => ({
    dim: idx,
    name: col,
    type: isColumnNumeric(rawData, col) ? 'value' : 'category',
  }));
  const data = rawData.map(row => {
    const values = dimensionColumns.map(col => {
      return isColumnNumeric(rawData, col)
        ? toNumber(row[col])
        : formatLabelValue(row[col]);
    });
    const name = xAxisColumn
      ? formatLabelValue(row[xAxisColumn])
      : undefined;
    return name ? { name, value: values } : values;
  });
  return { axes, data };
}

/**
 * Transform data to polygons3D format: [{name, coords: [[lng, lat], ...]}]
 * Groups rows by xAxisColumn (name) and collects [lng, lat] pairs from y/z columns
 */
export function transformToPolygons3DFormat(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn || !mapping.zAxisColumn) {
    return [];
  }

  const polyMap = new Map<string, number[][]>();

  rawData.forEach(row => {
    const name = formatLabelValue(row[mapping.xAxisColumn!]);
    const lng = toNumber(row[mapping.yAxisColumn!]);
    const lat = toNumber(row[mapping.zAxisColumn!]);

    if (!isFinite(lng) || !isFinite(lat)) return;

    if (!polyMap.has(name)) {
      polyMap.set(name, []);
    }
    polyMap.get(name)!.push([lng, lat]);
  });

  return Array.from(polyMap.entries()).map(([name, coords]) => ({
    name,
    coords,
  }));
}

/**
 * Radar — `{indicators: [{name, max}], series: [{name, value:[v1..vK]}]}`.
 *
 * `xAxisColumn` defines the grouping (one polygon per distinct category) and
 * `indicatorColumns` defines the K radar axes. Each indicator value is the
 * SUM of that column for the rows in the group (matches the bar/line family
 * aggregation default — see `transformToBar` etc.). The indicator's max is
 * also derived from the grouped values, so the axis scale tracks the
 * aggregated polygons, not the raw rows.
 *
 * Previously this returned one polygon per raw row, which produced ~N
 * overlapping shapes (5040 for the demo dataset) and looked like noise.
 */
export function transformToRadar(rawData: any[], mapping: ChartDataMapping): any {
  const { xAxisColumn, indicatorColumns } = mapping;
  if (!xAxisColumn || !indicatorColumns?.length) {
    return { indicators: [], series: [] };
  }

  // Group rows by xAxisColumn → indicator values are summed within group.
  const groups = new Map<string, number[]>();
  for (const row of rawData) {
    const key = formatLabelValue(row[xAxisColumn]);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = indicatorColumns.map(() => 0);
      groups.set(key, bucket);
    }
    indicatorColumns.forEach((col, i) => {
      const v = toNumber(row[col]);
      if (isFinite(v)) bucket![i] += v;
    });
  }

  const series = Array.from(groups, ([name, value]) => ({ name, value }));

  const indicators = indicatorColumns.map((col, i) => {
    const max = Math.max(0, ...series.map(s => s.value[i]).filter(isFinite));
    return { name: col, max: max || 1 };
  });

  return { indicators, series };
}

/**
 * Transform data to sankey format (source → target with value)
 * Sankey needs: { nodes: [{name}], links: [{source, target, value}] }
 * Uses x-axis for source, y-axis for target, z-axis for value
 */
export function transformToSankeyFormat(
  rawData: any[],
  mapping: ChartDataMapping,
): any {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
    return { nodes: [], links: [] };
  }

  const nodeSet = new Set<string>();
  const linkMap = new Map<string, number>();

  const hasValue = !!mapping.zAxisColumn;
  const isZNumeric = hasValue
    ? isColumnNumeric(rawData, mapping.zAxisColumn!)
    : false;

  rawData.forEach(row => {
    const source = formatLabelValue(row[mapping.xAxisColumn!]);
    const target = formatLabelValue(row[mapping.yAxisColumn!]);
    if (source === target) return; // Skip self-loops

    nodeSet.add(source);
    nodeSet.add(target);

    const linkKey = `${source}→${target}`;
    const value =
      hasValue && isZNumeric ? toNumber(row[mapping.zAxisColumn!]) : 1;

    const existing = linkMap.get(linkKey) || 0;
    linkMap.set(linkKey, existing + value);
  });

  const nodes = Array.from(nodeSet).map(name => ({ name }));
  const links = Array.from(linkMap.entries()).map(([key, value]) => {
    const [source, target] = key.split('→');
    return { source, target, value };
  });

  return { nodes, links };
}

/**
 * Transform raw data to single-series format: [{name, value}]
 * Used for bar, pie, gauge, treemap, card charts
 *
 * Smart aggregation:
 * - Detects if Y-axis column is numeric by sampling
 * - If numeric: sums values by X-axis category
 * - If non-numeric: counts occurrences by X-axis category
 */
export function transformToSingleSeries(
  rawData: any[],
  mapping: ChartDataMapping,
): SingleSeriesData[] {
  if (!mapping.xAxisColumn || !mapping.yAxisColumn) {
    return [];
  }

  // Detect if Y-axis column contains numeric values by sampling
  const isYAxisNumeric = isColumnNumeric(rawData, mapping.yAxisColumn);
  // The explicit aggregate wins; 'count' works on any column (numeric or
  // not). For a non-numeric measure with no explicit aggregate we still count
  // occurrences (legacy). Otherwise gather the numeric samples per category
  // and reduce them with the chosen function so AVG/MIN/MAX/etc. are correct
  // — not silently summed.
  const agg = mapping.aggregate ?? null;
  const countMode = agg === 'count' || (!isYAxisNumeric && !agg);
  // Samples per category (only used when not in pure count mode).
  const samplesByLabel = new Map<string, number[]>();
  const countByLabel = new Map<string, number>();
  // Remember one RAW x value per label so a temporal dimension can be
  // ordered chronologically by the underlying date, not the label text.
  const rawByLabel = new Map<string, unknown>();

  rawData.forEach(row => {
    // Process X-axis value (category/name) — Wave 2 label formatting +
    // null-as-member applied here.
    const rawName = row[mapping.xAxisColumn!];
    const name = formatCategoryLabel(rawName, mapping);
    if (!rawByLabel.has(name)) rawByLabel.set(name, rawName);

    if (countMode) {
      countByLabel.set(name, (countByLabel.get(name) || 0) + 1);
      return;
    }
    const bucket = samplesByLabel.get(name) ?? [];
    bucket.push(toNumber(row[mapping.yAxisColumn!]));
    samplesByLabel.set(name, bucket);
  });

  // Keep zero buckets (code-review CR-2). A legitimate zero total — a
  // month with no sales, a category that summed to 0 — is real data: the
  // point must render as 0, not vanish (which would leave a misleading gap
  // in a time series and connect neighbouring points across the hole). The
  // multi-series path never filtered zeros, so keeping them here also makes
  // single- and multi-series charts of the same data agree.
  const points = countMode
    ? Array.from(countByLabel.entries()).map(([name, value]) => ({
        name,
        value,
      }))
    : Array.from(samplesByLabel.entries()).map(([name, samples]) => ({
        name,
        value: aggregateSamples(samples, agg, mapping.percentile),
      }));

  // Temporal dimension → chronological order; otherwise keep the legacy
  // value-descending order so non-time charts are unchanged.
  if (looksTemporal(points.map(p => rawByLabel.get(p.name)))) {
    return sortChronologicallyIfTemporal(points, rawByLabel);
  }
  return points.sort((a, b) => b.value - a.value);
}

/**
 * Theme river — `[[time, value, category], ...]`. If `timeColumn` is set
 * we use its values; otherwise we synthesise a time axis from the row
 * index so legacy visuals still render (the old behaviour).
 */
export function transformToThemeRiver(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  const { xAxisColumn, yAxisColumn, timeColumn } = mapping;
  if (!xAxisColumn || !yAxisColumn) return [];
  return rawData.map((row, idx) => {
    const time = timeColumn ? row[timeColumn] : idx;
    const value = toNumber(row[yAxisColumn]);
    const category = formatLabelValue(row[xAxisColumn]);
    return [time, value, category];
  });
}

/**
 * Flow GL — vector field `[[x, y, vx, vy], ...]`. Needs four columns
 * mapped: x = lngColumn, y = latColumn, vx = xAxisColumn, vy = yAxisColumn
 * (legacy roles repurposed for the velocity components).
 */
export function transformToVectorField(
  rawData: any[],
  mapping: ChartDataMapping,
): any[] {
  const { lngColumn, latColumn, xAxisColumn, yAxisColumn } = mapping;
  if (!lngColumn || !latColumn || !xAxisColumn || !yAxisColumn) return [];
  return rawData
    .map(row => {
      const x = toNumber(row[lngColumn]);
      const y = toNumber(row[latColumn]);
      const vx = toNumber(row[xAxisColumn]);
      const vy = toNumber(row[yAxisColumn]);
      return isFinite(x) && isFinite(y) && isFinite(vx) && isFinite(vy)
        ? [x, y, vx, vy]
        : null;
    })
    .filter((v): v is number[] => v !== null);
}

/**
 * Build a ChartDataMapping from a Visual — central helper consumed by all
 * the call sites so they don't each have to know which role columns to
 * forward. New roles added to Visual only need to be added here.
 */
