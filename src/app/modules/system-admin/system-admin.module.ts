import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddSystemAdminComponent } from './components/add-system-admin/add-system-admin.component';
import { EditSystemAdminComponent } from './components/edit-system-admin/edit-system-admin.component';
import { ListSystemAdminComponent } from './components/list-system-admin/list-system-admin.component';
import { ViewSystemAdminComponent } from './components/view-system-admin/view-system-admin.component';
import { SystemAdminRoutingModule } from './system-admin-routing.module';

@NgModule({
  declarations: [
    ListSystemAdminComponent,
    AddSystemAdminComponent,
    EditSystemAdminComponent,
    ViewSystemAdminComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SystemAdminRoutingModule,
    SharedModule,
  ],
})
export class SystemAdminModule {}
