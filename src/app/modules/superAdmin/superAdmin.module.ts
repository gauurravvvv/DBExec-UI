import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { ListSuperAdminComponent } from './components/list-super-admin/list-super-admin.component';
import { AddSuperAdminComponent } from './components/add-super-admin/add-super-admin.component';
import { EditSuperAdminComponent } from './components/edit-super-admin/edit-super-admin.component';
import { ViewSuperAdminComponent } from './components/view-super-admin/view-super-admin.component';
import { SuperAdminRoutingModule } from './super-admin-routing.module';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';

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
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    SuperAdminRoutingModule,
    AppPrimeNGModule,
  ],
})
export class SuperAdminModule {}
