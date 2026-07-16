import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListDashboardComponent } from './components/list-dashboard/list-dashboard.component';
import { ViewDashboardComponent } from './components/view-dashboard/view-dashboard.component';
import { ShareDashboardDialogComponent } from './components/share-dashboard-dialog/share-dashboard-dialog.component';
import { DashboardPreloadGateComponent } from './components/dashboard-preload-gate/dashboard-preload-gate.component';
import { DashboardWidgetComponent } from './components/dashboard-widget/dashboard-widget.component';
import { ScheduleDeliveryDialogComponent } from './components/schedule-delivery-dialog/schedule-delivery-dialog.component';
import { DashboardRoutingModule } from './dashboard-routing.module';

@NgModule({
  declarations: [
    ListDashboardComponent,
    ViewDashboardComponent,
    ShareDashboardDialogComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    DashboardRoutingModule,
    SharedModule,
    SharedChartsModule,
    AppPrimeNGModule,
    // Standalone — the shared unified list table + its projected-empty
    // directive. `UsGridCellDirective` stays: the table reuses it verbatim
    // for per-cell templates.
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
    // Standalone dashboard-consume components (Dashboard & Analysis v2).
    // Shared with the standalone embed viewer via their own imports.
    DashboardPreloadGateComponent,
    DashboardWidgetComponent,
    ScheduleDeliveryDialogComponent,
    // Canonical shared chip / status-pill / count / tag / filter element.
    ChipComponent,
  ],
})
export class DashboardModule {}
