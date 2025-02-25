import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddCredentialsComponent } from './components/add-credentials/add-credentials.component';
import { EditCredentialsComponent } from './components/edit-credentials/edit-credentials.component';
import { ListCredentialsComponent } from './components/list-credentials/list-credentials.component';
import { ViewCredentialsComponent } from './components/view-credentials/view-credentials.component';
import { CredentialsRoutingModule } from './credentials-routing.module';

@NgModule({
  declarations: [
    AddCredentialsComponent,
    EditCredentialsComponent,
    ListCredentialsComponent,
    ViewCredentialsComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    CredentialsRoutingModule,
    SharedModule,
    MenuModule,
  ],
})
export class CredentialsModule {}
