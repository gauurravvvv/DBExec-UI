import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddSystemGroupComponent } from './components/add-system-group/add-system-group.component';
import { EditSystemGroupComponent } from './components/edit-system-group/edit-system-group.component';
import { ListSystemGroupComponent } from './components/list-system-group/list-system-group.component';
import { ViewSystemGroupComponent } from './components/view-system-group/view-system-group.component';
import { SystemGroupsRoutingModule } from './system-groups-routing.module';

@NgModule({
  declarations: [
    AddSystemGroupComponent,
    EditSystemGroupComponent,
    ListSystemGroupComponent,
    ViewSystemGroupComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SystemGroupsRoutingModule,
    SharedModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class SystemGroupsModule {}
