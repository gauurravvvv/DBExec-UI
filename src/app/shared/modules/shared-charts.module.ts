import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { ConfigurableCardChartComponent } from '../components/configurable-card-chart/configurable-card-chart.component';
import { EchartVisualComponent } from '../components/echart-visual/echart-visual.component';

// loadEchartsGl moved to ./echarts-gl.loader to break the module<->component
// circular import. Re-exported here for existing importers.
export { loadEchartsGl } from './echarts-gl.loader';

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
