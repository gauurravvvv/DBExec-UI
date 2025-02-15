import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListSuperAdminComponent } from './components/list-super-admin/list-super-admin.component';
import { AddSuperAdminComponent } from './components/add-super-admin/add-super-admin.component';
import { EditSuperAdminComponent } from './components/edit-super-admin/edit-super-admin.component';
import { ViewSuperAdminComponent } from './components/view-super-admin/view-super-admin.component';
import { SuperAdminRoutingModule } from './super-admin-routing.module';

@NgModule({
  declarations: [
    ListSuperAdminComponent,
    AddSuperAdminComponent,
    EditSuperAdminComponent,
    ViewSuperAdminComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    SuperAdminRoutingModule,
    SharedModule,
  ],
})
export class SuperAdminModule {}
