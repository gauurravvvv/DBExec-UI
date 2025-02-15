import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddEnvironmentComponent } from './components/add-environment/add-environment.component';
import { EditEnvironmentComponent } from './components/edit-environment/edit-environment.component';
import { ListEnvironmentComponent } from './components/list-environment/list-environment.component';
import { ViewEnvironmentComponent } from './components/view-environment/view-environment.component';
import { EnvironmentRoutingModule } from './environment-routing.module';

@NgModule({
  declarations: [
    AddEnvironmentComponent,
    EditEnvironmentComponent,
    ListEnvironmentComponent,
    ViewEnvironmentComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    EnvironmentRoutingModule,
    SharedModule,
  ],
})
export class EnvironmentModule {}
