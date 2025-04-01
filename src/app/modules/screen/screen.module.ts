import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { ScreenRoutingModule } from './screen-routing.module';
import { AddScreenComponent } from './components/add-screen/add-screen.component';
import { EditScreenComponent } from './components/edit-screen/edit-screen.component';
import { ListScreenComponent } from './components/list-screen/list-screen.component';
import { ViewScreenComponent } from './components/view-screen/view-screen.component';

@NgModule({
  declarations: [
    AddScreenComponent,
    EditScreenComponent,
    ListScreenComponent,
    ViewScreenComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    AppPrimeNGModule,
    ScreenRoutingModule,
  ],
})
export class ScreenModule {}
