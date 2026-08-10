import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';

import { AddSystemRoleComponent } from './components/add-system-role/add-system-role.component';
import { EditSystemRoleComponent } from './components/edit-system-role/edit-system-role.component';
import { ListSystemRoleComponent } from './components/list-system-role/list-system-role.component';
import { ViewSystemRoleComponent } from './components/view-system-role/view-system-role.component';
import { SystemRoleRoutingModule } from './system-roles-routing.module';

@NgModule({
  declarations: [
    AddSystemRoleComponent,
    EditSystemRoleComponent,
    ListSystemRoleComponent,
    ViewSystemRoleComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SystemRoleRoutingModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class SystemRoleModule {}
