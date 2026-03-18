import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListAuditLogsComponent } from './components/list-audit-logs/list-audit-logs.component';

const routes: Routes = [
  { path: '', component: ListAuditLogsComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuditRoutingModule {}
