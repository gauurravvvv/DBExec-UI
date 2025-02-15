import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ListUsersComponent } from './components/list-users/list-users.component';
import { AddUsersComponent } from './components/add-users/add-users.component';
import { EditUsersComponent } from './components/edit-users/edit-users.component';
import { ViewUsersComponent } from './components/view-users/view-users.component';
import { UsersRoutingModule } from './users-routing.module';

@NgModule({
  declarations: [
    ListUsersComponent,
    AddUsersComponent,
    EditUsersComponent,
    ViewUsersComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    UsersRoutingModule,
    SharedModule,
  ],
})
export class UsersModule {}
