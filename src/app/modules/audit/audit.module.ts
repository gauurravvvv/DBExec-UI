import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AuditRoutingModule } from './audit-routing.module';
import { ListAuditLogsComponent } from './components/list-audit-logs/list-audit-logs.component';

@NgModule({
  declarations: [ListAuditLogsComponent],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    AuditRoutingModule,
    SharedModule,
  ],
})
export class AuditModule {}
