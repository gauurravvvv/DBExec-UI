import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddUserComponent } from './components/add-user/add-user.component';
import { EditUserComponent } from './components/edit-user/edit-user.component';
import { ListUserComponent } from './components/list-user/list-user.component';
import { ViewUserComponent } from './components/view-user/view-user.component';
import { UsersRoutingModule } from './users-routing.module';

@NgModule({
  declarations: [
    ListUserComponent,
    AddUserComponent,
    EditUserComponent,
    ViewUserComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    UsersRoutingModule,
    SharedModule,
  ],
})
export class UsersModule {}
