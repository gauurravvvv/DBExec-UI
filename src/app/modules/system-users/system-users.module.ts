import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddSystemUserComponent } from './components/add-system-user/add-system-user.component';
import { BulkAddSystemUserComponent } from './components/bulk-add-system-user/bulk-add-system-user.component';
import { EditSystemUserComponent } from './components/edit-system-user/edit-system-user.component';
import { ListSystemUserComponent } from './components/list-system-user/list-system-user.component';
import { ViewSystemUserComponent } from './components/view-system-user/view-system-user.component';
import { SystemUsersRoutingModule } from './system-users-routing.module';

@NgModule({
  declarations: [
    ListSystemUserComponent,
    AddSystemUserComponent,
    BulkAddSystemUserComponent,
    EditSystemUserComponent,
    ViewSystemUserComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SystemUsersRoutingModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class SystemUsersModule {}
