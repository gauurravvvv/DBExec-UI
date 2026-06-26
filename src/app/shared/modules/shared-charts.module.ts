import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { ConfigurableCardChartComponent } from '../components/configurable-card-chart/configurable-card-chart.component';
import { EchartVisualComponent } from '../components/echart-visual/echart-visual.component';

/**
 * Lazy-load echarts-gl on first need. Each call returns a shared
 * promise so concurrent requests reuse the same import. Imported by
 * EchartVisualComponent before rendering a chart whose type requires
 * GL (any chart for which requiresGl(type) is true).
 *
 * Memoised because import() caches on the module level anyway; the
 * extra ref-counter is just so we can synchronously check "is it
 * already loaded?" without re-entering the promise.
 */
let glLoadPromise: Promise<unknown> | null = null;
export function loadEchartsGl(): Promise<unknown> {
  if (!glLoadPromise) {
    glLoadPromise = import('echarts-gl');
  }
  return glLoadPromise;
}

@NgModule({
  declarations: [EchartVisualComponent, ConfigurableCardChartComponent],
  imports: [
    CommonModule,
    NgxEchartsModule.forRoot({
      // Only the core echarts is loaded eagerly on first chart render.
      // echarts-gl loads on demand via loadEchartsGl() above so charts
      // that do not need GL (most of them) do not pay the ~500KB cost.
      echarts: () => import('echarts'),
    }),
  ],
  exports: [
    EchartVisualComponent,
    ConfigurableCardChartComponent,
    // Re-export so feature modules that import SharedChartsModule can
    // use the `echarts` attribute-directive directly without doing
    // their own NgxEchartsModule.forRoot() (which would re-register
    // the echarts loader). View-datasource uses this for its donut.
    NgxEchartsModule,
  ],
})
export class SharedChartsModule {}
