import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddOrganisationComponent } from './components/add-organisation/add-organisation.component';
import { EditOrganisationComponent } from './components/edit-organisation/edit-organisation.component';
import { ListOrganisationComponent } from './components/list-organisation/list-organisation.component';
import { ViewOrganisationComponent } from './components/view-organisation/view-organisation.component';
import { OrganisationRoutingModule } from './organisation-routing.module';

@NgModule({
  declarations: [
    AddOrganisationComponent,
    EditOrganisationComponent,
    ListOrganisationComponent,
    ViewOrganisationComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RippleModule,
    OrganisationRoutingModule,
    AppPrimeNGModule,
    SharedModule,
  ],
})
export class OrganisationModule {}
