import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListOrgAdminComponent } from './components/list-org-admin/list-org-admin.component';
import { AddOrgAdminComponent } from './components/add-org-admin/add-org-admin.component';
import { EditOrgAdminComponent } from './components/edit-org-admin/edit-org-admin.component';
import { ViewOrgAdminComponent } from './components/view-org-admin/view-org-admin.component';
import { OrgAdminRoutingModule } from './org-admin-routing.module';

@NgModule({
  declarations: [
    ListOrgAdminComponent,
    AddOrgAdminComponent,
    EditOrgAdminComponent,
    ViewOrgAdminComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    OrgAdminRoutingModule,
    SharedModule,
  ],
})
export class OrgAdminModule {}
