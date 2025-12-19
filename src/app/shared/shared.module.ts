import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { AppPrimeNGModule } from './modules/app-primeng.module';
import { ChangePasswordDialogComponent } from './components/change-password-dialog/change-password-dialog.component';
import { ConfigurableBarChartComponent } from './components/configurable-bar-chart/configurable-bar-chart.component';
import { ConfigurableLineChartComponent } from './components/configurable-line-chart/configurable-line-chart.component';
import { ConfigurableAreaChartComponent } from './components/configurable-area-chart/configurable-area-chart.component';
import { ConfigurablePolarChartComponent } from './components/configurable-polar-chart/configurable-polar-chart.component';
import { ConfigurablePieChartComponent } from './components/configurable-pie-chart/configurable-pie-chart.component';
import { ConfigurableGaugeChartComponent } from './components/configurable-gauge-chart/configurable-gauge-chart.component';
import { ConfigurableCardChartComponent } from './components/configurable-card-chart/configurable-card-chart.component';
import { ConfigurableHeatmapChartComponent } from './components/configurable-heatmap-chart/configurable-heatmap-chart.component';
import { ConfigurableTreemapChartComponent } from './components/configurable-treemap-chart/configurable-treemap-chart.component';

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
    ConfigurableTreemapChartComponent
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AppPrimeNGModule, NgxChartsModule],
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
    ConfigurableTreemapChartComponent
  ],
})
export class SharedModule {}


