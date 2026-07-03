import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ChangeSummaryDialogComponent } from './components/change-summary-dialog/change-summary-dialog.component';
import { DbAccessHomeComponent } from './components/db-access-home/db-access-home.component';
import { DbAccessWorkspaceComponent } from './components/db-access-workspace/db-access-workspace.component';
import { DbAuditComponent } from './components/db-audit/db-audit.component';
import { DbEffectivePrivilegesComponent } from './components/db-effective-privileges/db-effective-privileges.component';
import { DbGrantMatrixComponent } from './components/db-grant-matrix/db-grant-matrix.component';
import { DbMappingsComponent } from './components/db-mappings/db-mappings.component';
import { DbRolesComponent } from './components/db-roles/db-roles.component';
import { DbUsersComponent } from './components/db-users/db-users.component';
import { DbAccessRoutingModule } from './db-access-routing.module';

@NgModule({
  declarations: [
    ChangeSummaryDialogComponent,
    DbAccessHomeComponent,
    DbAccessWorkspaceComponent,
    DbUsersComponent,
    DbRolesComponent,
    DbGrantMatrixComponent,
    DbEffectivePrivilegesComponent,
    DbMappingsComponent,
    DbAuditComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SharedModule,
    DbAccessRoutingModule,
  ],
})
export class DbAccessModule {}
