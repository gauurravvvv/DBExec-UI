import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddEnvironmentComponent } from './components/add-environment/add-environment.component';
import { EditEnvironmentComponent } from './components/edit-environment/edit-environment.component';
import { ListEnvironmentComponent } from './components/list-environment/list-environment.component';
import { EnvironmentRoutingModule } from './environment-routing.module';
import { MenuModule } from 'primeng/menu';

@NgModule({
  declarations: [
    AddEnvironmentComponent,
    EditEnvironmentComponent,
    ListEnvironmentComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    EnvironmentRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class EnvironmentModule {}
