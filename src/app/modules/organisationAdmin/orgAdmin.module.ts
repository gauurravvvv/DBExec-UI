import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddOrgAdminComponent } from './components/add-org-admin/add-org-admin.component';
import { EditOrgAdminComponent } from './components/edit-org-admin/edit-org-admin.component';
import { ListOrgAdminComponent } from './components/list-org-admin/list-org-admin.component';
import { ViewOrgAdminComponent } from './components/view-org-admin/view-org-admin.component';
import { OrgAdminRoutingModule } from './org-admin-routing.module';
import { DropdownModule } from 'primeng/dropdown';

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
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    OrgAdminRoutingModule,
    AppPrimeNGModule,
    DropdownModule,
  ],
})
export class OrgAdminModule {}
