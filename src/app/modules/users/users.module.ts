import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
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
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    UsersRoutingModule,
    AppPrimeNGModule,
  ],
})
export class UsersModule {}
