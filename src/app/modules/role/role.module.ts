import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';

import { RoleRoutingModule } from './role-routing.module';
import { AddRoleComponent } from './components/add-role/add-role.component';
import { EditRoleComponent } from './components/edit-role/edit-role.component';
import { ListRoleComponent } from './components/list-role/list-role.component';
import { ViewRoleComponent } from './components/view-role/view-role.component';

@NgModule({
  declarations: [
    AddRoleComponent,
    EditRoleComponent,
    ListRoleComponent,
    ViewRoleComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    RoleRoutingModule,
    SharedModule,
  ],
})
export class RoleModule {}
