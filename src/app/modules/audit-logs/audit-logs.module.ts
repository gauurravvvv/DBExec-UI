import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AuditLogsRoutingModule } from './audit-logs-routing.module';
import { AuditDetailDrawerComponent } from './components/audit-detail-drawer/audit-detail-drawer.component';
import { ListAuditLogsComponent } from './components/list-audit-logs/list-audit-logs.component';

@NgModule({
  declarations: [ListAuditLogsComponent, AuditDetailDrawerComponent],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    AuditLogsRoutingModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
    // Standalone canonical UI kit pieces (not re-exported by SharedModule).
    ButtonComponent,
    ChipComponent,
  ],
})
export class AuditLogsModule {}
