import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgxChartsModule } from '@swimlane/ngx-charts';
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
import { CustomDropdownComponent } from './components/custom-dropdown/custom-dropdown.component';
import { CustomInputComponent } from './components/custom-input/custom-input.component';
import { CustomMultiselectComponent } from './components/custom-multiselect/custom-multiselect.component';
import { CustomToggleComponent } from './components/custom-toggle/custom-toggle.component';
import { GlobalSearchComponent } from './components/global-search/global-search.component';
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
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomToggleComponent,
    GlobalSearchComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    NgxChartsModule,
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
    CustomInputComponent,
    CustomDropdownComponent,
    CustomMultiselectComponent,
    CustomToggleComponent,
    GlobalSearchComponent,
  ],
})
export class SharedModule {}
