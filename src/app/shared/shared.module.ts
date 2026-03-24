import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgxEchartsModule } from 'ngx-echarts';
import { ChangePasswordDialogComponent } from './components/change-password-dialog/change-password-dialog.component';
import { ConfigurableAreaChartComponent } from './components/configurable-area-chart/configurable-area-chart.component';
import { ConfigurableBarChartComponent } from './components/configurable-bar-chart/configurable-bar-chart.component';
import { ConfigurableBoxChartComponent } from './components/configurable-box-chart/configurable-box-chart.component';
import { ConfigurableBubbleChartComponent } from './components/configurable-bubble-chart/configurable-bubble-chart.component';
import { ConfigurableCardChartComponent } from './components/configurable-card-chart/configurable-card-chart.component';
import { ConfigurableGaugeChartComponent } from './components/configurable-gauge-chart/configurable-gauge-chart.component';
import { ConfigurableHeatmapChartComponent } from './components/configurable-heatmap-chart/configurable-heatmap-chart.component';
import { ConfigurableLineChartComponent } from './components/configurable-line-chart/configurable-line-chart.component';
import { ConfigurablePieChartComponent } from './components/configurable-pie-chart/configurable-pie-chart.component';
import { ConfigurablePolarChartComponent } from './components/configurable-polar-chart/configurable-polar-chart.component';
import { ConfigurableTreemapChartComponent } from './components/configurable-treemap-chart/configurable-treemap-chart.component';
import { ConfigurableScatterChartComponent } from './components/configurable-scatter-chart/configurable-scatter-chart.component';
import { ConfigurableFunnelChartComponent } from './components/configurable-funnel-chart/configurable-funnel-chart.component';
import { ConfigurableSunburstChartComponent } from './components/configurable-sunburst-chart/configurable-sunburst-chart.component';
import { ConfigurableSankeyChartComponent } from './components/configurable-sankey-chart/configurable-sankey-chart.component';
import { ConfigurableWaterfallChartComponent } from './components/configurable-waterfall-chart/configurable-waterfall-chart.component';
import { ConfigurableGraphChartComponent } from './components/configurable-graph-chart/configurable-graph-chart.component';
import { ConfigurableTreeChartComponent } from './components/configurable-tree-chart/configurable-tree-chart.component';
import { ConfigurableThemeRiverChartComponent } from './components/configurable-theme-river-chart/configurable-theme-river-chart.component';
import { ConfigurablePictorialBarChartComponent } from './components/configurable-pictorial-bar-chart/configurable-pictorial-bar-chart.component';
import { ConfigurablePolarBarChartComponent } from './components/configurable-polar-bar-chart/configurable-polar-bar-chart.component';
import { ConfigurableRadarChartComponent } from './components/configurable-radar-chart/configurable-radar-chart.component';
import { ConfigurableCandlestickChartComponent } from './components/configurable-candlestick-chart/configurable-candlestick-chart.component';
import { ConfigurableParallelChartComponent } from './components/configurable-parallel-chart/configurable-parallel-chart.component';
import { ConfigurableBar3dChartComponent } from './components/configurable-bar3d-chart/configurable-bar3d-chart.component';
import { ConfigurableLine3dChartComponent } from './components/configurable-line3d-chart/configurable-line3d-chart.component';
import { ConfigurableScatter3dChartComponent } from './components/configurable-scatter3d-chart/configurable-scatter3d-chart.component';
import { ConfigurableSurfaceChartComponent } from './components/configurable-surface-chart/configurable-surface-chart.component';
import { ConfigurableGlobeChartComponent } from './components/configurable-globe-chart/configurable-globe-chart.component';
import { ConfigurableGraphGlChartComponent } from './components/configurable-graphgl-chart/configurable-graphgl-chart.component';
import { ConfigurableScatterGlChartComponent } from './components/configurable-scattergl-chart/configurable-scattergl-chart.component';
import { ConfigurableLinesGlChartComponent } from './components/configurable-linesgl-chart/configurable-linesgl-chart.component';
import { ConfigurableMap3dChartComponent } from './components/configurable-map3d-chart/configurable-map3d-chart.component';
import { ConfigurableFlowGlChartComponent } from './components/configurable-flowgl-chart/configurable-flowgl-chart.component';
import { CustomCalendarComponent } from './components/custom-calendar/custom-calendar.component';
import { CustomCheckboxComponent } from './components/custom-checkbox/custom-checkbox.component';
import { CustomDaterangeComponent } from './components/custom-daterange/custom-daterange.component';
import { CustomDropdownComponent } from './components/custom-dropdown/custom-dropdown.component';
import { CustomInputComponent } from './components/custom-input/custom-input.component';
import { CustomMultiselectComponent } from './components/custom-multiselect/custom-multiselect.component';
import { CustomNumberComponent } from './components/custom-number/custom-number.component';
import { CustomRadioComponent } from './components/custom-radio/custom-radio.component';
import { CustomRangesliderComponent } from './components/custom-rangeslider/custom-rangeslider.component';
import { CustomTextareaComponent } from './components/custom-textarea/custom-textarea.component';
import { CustomToggleComponent } from './components/custom-toggle/custom-toggle.component';
import { GlobalSearchComponent } from './components/global-search/global-search.component';
import { AddCustomFieldDialogComponent } from '../modules/dataset/components/add-custom-field-dialog/add-custom-field-dialog.component';
import { SaveAnalysesDialogComponent } from '../modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AppPrimeNGModule } from './modules/app-primeng.module';

@NgModule({
  declarations: [
    ChangePasswordDialogComponent,
    ConfigurableBarChartComponent,
    ConfigurableLineChartComponent,
    ConfigurableAreaChartComponent,
    ConfigurablePolarChartComponent,
    ConfigurablePieChartComponent,
    ConfigurableGaugeChartComponent,
    ConfigurableCardChartComponent,
    ConfigurableHeatmapChartComponent,
    ConfigurableTreemapChartComponent,
    ConfigurableBubbleChartComponent,
    ConfigurableBoxChartComponent,
    ConfigurableScatterChartComponent,
    ConfigurableFunnelChartComponent,
    ConfigurableSunburstChartComponent,
    ConfigurableSankeyChartComponent,
    ConfigurableWaterfallChartComponent,
    ConfigurableGraphChartComponent,
    ConfigurableTreeChartComponent,
    ConfigurableThemeRiverChartComponent,
    ConfigurablePictorialBarChartComponent,
    ConfigurablePolarBarChartComponent,
    ConfigurableRadarChartComponent,
    ConfigurableCandlestickChartComponent,
    ConfigurableParallelChartComponent,
    ConfigurableBar3dChartComponent,
    ConfigurableLine3dChartComponent,
    ConfigurableScatter3dChartComponent,
    ConfigurableSurfaceChartComponent,
    ConfigurableGlobeChartComponent,
    ConfigurableGraphGlChartComponent,
    ConfigurableScatterGlChartComponent,
    ConfigurableLinesGlChartComponent,
    ConfigurableMap3dChartComponent,
    ConfigurableFlowGlChartComponent,
    CustomCalendarComponent,
    CustomCheckboxComponent,
    CustomDaterangeComponent,
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomNumberComponent,
    CustomRadioComponent,
    CustomRangesliderComponent,
    CustomTextareaComponent,
    CustomToggleComponent,
    GlobalSearchComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    NgxEchartsModule.forRoot({
      echarts: () =>
        import('echarts').then(async ec => {
          await import('echarts-gl');
          return ec;
        }),
    }),
  ],
  exports: [
    ChangePasswordDialogComponent,
    ConfigurableBarChartComponent,
    ConfigurableLineChartComponent,
    ConfigurableAreaChartComponent,
    ConfigurablePolarChartComponent,
    ConfigurablePieChartComponent,
    ConfigurableGaugeChartComponent,
    ConfigurableCardChartComponent,
    ConfigurableHeatmapChartComponent,
    ConfigurableTreemapChartComponent,
    ConfigurableBubbleChartComponent,
    ConfigurableBoxChartComponent,
    ConfigurableScatterChartComponent,
    ConfigurableFunnelChartComponent,
    ConfigurableSunburstChartComponent,
    ConfigurableSankeyChartComponent,
    ConfigurableWaterfallChartComponent,
    ConfigurableGraphChartComponent,
    ConfigurableTreeChartComponent,
    ConfigurableThemeRiverChartComponent,
    ConfigurablePictorialBarChartComponent,
    ConfigurablePolarBarChartComponent,
    ConfigurableRadarChartComponent,
    ConfigurableCandlestickChartComponent,
    ConfigurableParallelChartComponent,
    ConfigurableBar3dChartComponent,
    ConfigurableLine3dChartComponent,
    ConfigurableScatter3dChartComponent,
    ConfigurableSurfaceChartComponent,
    ConfigurableGlobeChartComponent,
    ConfigurableGraphGlChartComponent,
    ConfigurableScatterGlChartComponent,
    ConfigurableLinesGlChartComponent,
    ConfigurableMap3dChartComponent,
    ConfigurableFlowGlChartComponent,
    CustomCalendarComponent,
    CustomCheckboxComponent,
    CustomDaterangeComponent,
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomNumberComponent,
    CustomRadioComponent,
    CustomRangesliderComponent,
    CustomTextareaComponent,
    CustomToggleComponent,
    GlobalSearchComponent,
    AddCustomFieldDialogComponent,
    SaveAnalysesDialogComponent,
  ],
})
export class SharedModule {}
