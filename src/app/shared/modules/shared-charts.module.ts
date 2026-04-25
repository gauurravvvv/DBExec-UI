import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { EchartVisualComponent } from '../components/echart-visual/echart-visual.component';
import { ConfigurableCardChartComponent } from '../components/configurable-card-chart/configurable-card-chart.component';

@NgModule({
  declarations: [EchartVisualComponent, ConfigurableCardChartComponent],
  imports: [
    CommonModule,
    NgxEchartsModule.forRoot({
      echarts: () =>
        import('echarts').then(async ec => {
          await import('echarts-gl');
          return ec;
        }),
    }),
  ],
  exports: [EchartVisualComponent, ConfigurableCardChartComponent],
})
export class SharedChartsModule {}
