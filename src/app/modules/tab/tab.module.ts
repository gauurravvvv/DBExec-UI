import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddTabComponent } from './component/add-tab/add-tab.component';
import { ListTabComponent } from './component/list-tab/list-tab.component';
import { EditTabComponent } from './component/edit-tab/edit-tab.component';
import { ViewTabComponent } from './component/view-tab/view-tab.component';
import { TabRoutingModule } from './tab-routing.module';

@NgModule({
  declarations: [
    AddTabComponent,
    ListTabComponent,
    EditTabComponent,
    ViewTabComponent,
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
    TabRoutingModule,
  ],
})
export class TabModule {}
