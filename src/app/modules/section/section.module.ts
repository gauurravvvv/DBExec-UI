import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { SharedModule } from 'src/app/shared';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddSectionComponent } from './components/add-section/add-section.component';
import { EditSectionComponent } from './components/edit-section/edit-section.component';
import { ListSectionComponent } from './components/list-section/list-section.component';
import { ViewSectionComponent } from './components/view-section/view-section.component';
import { SectionRoutingModule } from './section-routing.module';

@NgModule({
  declarations: [
    AddSectionComponent,
    EditSectionComponent,
    ListSectionComponent,
    ViewSectionComponent,
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
    SharedModule,
    SectionRoutingModule,
  ],
})
export class SectionModule {}
