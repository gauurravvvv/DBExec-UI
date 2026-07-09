import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';

import { AddRoleComponent } from './components/add-role/add-role.component';
import { EditRoleComponent } from './components/edit-role/edit-role.component';
import { ListRoleComponent } from './components/list-role/list-role.component';
import { ViewRoleComponent } from './components/view-role/view-role.component';
import { RoleRoutingModule } from './role-routing.module';

@NgModule({
  declarations: [
    AddRoleComponent,
    EditRoleComponent,
    ListRoleComponent,
    ViewRoleComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    RoleRoutingModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class RoleModule {}
