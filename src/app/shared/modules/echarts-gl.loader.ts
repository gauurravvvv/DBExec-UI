/**
 * echarts-gl lazy loader — extracted from shared-charts.module.ts to break a
 * circular import.
 *
 * EchartVisualComponent needs loadEchartsGl(), and SharedChartsModule declares
 * EchartVisualComponent. Keeping loadEchartsGl in the module file made the
 * component import the module and the module import the component — a cycle
 * that threw "Cannot access 'EchartVisualComponent' before initialization" when
 * a lazy chunk (prompt / query-builder) pulled the shared barrel. This file has
 * no Angular/component dependencies, so both sides import it one-way.
 *
 * Lazy-load echarts-gl on first need. Each call returns a shared promise so
 * concurrent requests reuse the same import. Memoised because import() caches at
 * the module level anyway; the extra ref just lets callers check "already
 * loaded?" without re-entering the promise.
 */
let glLoadPromise: Promise<unknown> | null = null;

export function loadEchartsGl(): Promise<unknown> {
  if (!glLoadPromise) {
    glLoadPromise = import('echarts-gl');
  }
  return glLoadPromise;
}
