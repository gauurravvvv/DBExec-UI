import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDbRoleComponent } from './components/add-db-role/add-db-role.component';
import { AddDbUserComponent } from './components/add-db-user/add-db-user.component';
import { ChangeSummaryDialogComponent } from './components/change-summary-dialog/change-summary-dialog.component';
import { DbAccessWorkspaceComponent } from './components/db-access-workspace/db-access-workspace.component';
import { DbAuditComponent } from './components/db-audit/db-audit.component';
import { DbEffectivePrivilegesComponent } from './components/db-effective-privileges/db-effective-privileges.component';
import { DbGrantMatrixComponent } from './components/db-grant-matrix/db-grant-matrix.component';
import { DbMappingsComponent } from './components/db-mappings/db-mappings.component';
import { DbRolesComponent } from './components/db-roles/db-roles.component';
import { DbUsersComponent } from './components/db-users/db-users.component';
import { EditDbRoleComponent } from './components/edit-db-role/edit-db-role.component';
import { EditDbUserComponent } from './components/edit-db-user/edit-db-user.component';
import { ViewDbRoleComponent } from './components/view-db-role/view-db-role.component';
import { ViewDbUserComponent } from './components/view-db-user/view-db-user.component';
import { DbAccessRoutingModule } from './db-access-routing.module';

@NgModule({
  declarations: [
    ChangeSummaryDialogComponent,
    DbAccessWorkspaceComponent,
    DbUsersComponent,
    DbRolesComponent,
    DbGrantMatrixComponent,
    DbEffectivePrivilegesComponent,
    DbMappingsComponent,
    DbAuditComponent,
    // Full add / edit / view SCREENS for users + roles
    AddDbUserComponent,
    EditDbUserComponent,
    ViewDbUserComponent,
    AddDbRoleComponent,
    EditDbRoleComponent,
    ViewDbRoleComponent,
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
