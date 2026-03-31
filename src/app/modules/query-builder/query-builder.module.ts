import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { QueryBuilderRoutingModule } from './query-builder-routing.module';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';
import { ConfigureQueryBuilderComponent } from './components/configure-query-builder/configure-query-builder.component';
import { ExecuteQueryBuilderComponent } from './components/execute-query-builder/execute-query-builder.component';
import { RouterModule } from '@angular/router';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TabViewModule } from 'primeng/tabview';
import { AccordionModule } from 'primeng/accordion';
import { DragDropModule } from 'primeng/dragdrop';
import { SkeletonModule } from 'primeng/skeleton';
import { InputNumberModule } from 'primeng/inputnumber';
import { CalendarModule } from 'primeng/calendar';
import { SliderModule } from 'primeng/slider';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SharedModule } from 'src/app/shared';

@NgModule({
  declarations: [
    AddQueryBuilderComponent,
    EditQueryBuilderComponent,
    ListQueryBuilderComponent,
    ViewQueryBuilderComponent,
    ConfigureQueryBuilderComponent,
    ExecuteQueryBuilderComponent,
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
    QueryBuilderRoutingModule,
    RouterModule,
    InputSwitchModule,
    TabViewModule,
    AccordionModule,
    SharedModule,
    DragDropModule,
    SkeletonModule,
    InputNumberModule,
    CalendarModule,
    SliderModule,
    RadioButtonModule,
  ],
  exports: [ConfigureQueryBuilderComponent],
})
export class QueryBuilderModule {}
