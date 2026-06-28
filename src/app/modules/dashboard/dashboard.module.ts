import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsDataGridComponent } from 'src/app/shared/components/us-data-grid/us-data-grid.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListDashboardComponent } from './components/list-dashboard/list-dashboard.component';
import { ViewDashboardComponent } from './components/view-dashboard/view-dashboard.component';
import { DashboardRoutingModule } from './dashboard-routing.module';

@NgModule({
  declarations: [ListDashboardComponent, ViewDashboardComponent],
  imports: [
    CommonModule,
    FormsModule,
    DashboardRoutingModule,
    SharedModule,
    SharedChartsModule,
    AppPrimeNGModule,
    UsDataGridComponent,
    UsGridCellDirective,
  ],
})
export class DashboardModule {}
