import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { FolderTreeComponent } from 'src/app/shared/components/folder-tree/folder-tree.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListDashboardComponent } from './components/list-dashboard/list-dashboard.component';
import { ViewDashboardComponent } from './components/view-dashboard/view-dashboard.component';
import { ShareDashboardDialogComponent } from './components/share-dashboard-dialog/share-dashboard-dialog.component';
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
    // Standalone shared folder-tree rail (Track F).
    FolderTreeComponent,
  ],
})
export class DashboardModule {}
