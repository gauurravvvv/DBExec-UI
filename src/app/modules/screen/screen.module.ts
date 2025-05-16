import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
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
import { ConfigureScreenComponent } from './components/configure-screen/configure-screen.component';
import { RouterModule } from '@angular/router';
import { InputSwitchModule } from 'primeng/inputswitch';

@NgModule({
  declarations: [
    AddScreenComponent,
    EditScreenComponent,
    ListScreenComponent,
    ViewScreenComponent,
    ConfigureScreenComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    AppPrimeNGModule,
    ScreenRoutingModule,
    RouterModule,
    InputSwitchModule,
  ],
  exports: [ConfigureScreenComponent],
})
export class ScreenModule {}
