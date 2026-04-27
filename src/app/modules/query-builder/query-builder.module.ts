import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { CheckboxModule } from 'primeng/checkbox';
import { DragDropModule } from 'primeng/dragdrop';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RadioButtonModule } from 'primeng/radiobutton';
import { RippleModule } from 'primeng/ripple';
import { SkeletonModule } from 'primeng/skeleton';
import { SliderModule } from 'primeng/slider';
import { TabViewModule } from 'primeng/tabview';
import { SharedModule } from 'src/app/shared';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { ConfigureQueryBuilderComponent } from './components/configure-query-builder/configure-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ExecuteQueryBuilderComponent } from './components/execute-query-builder/execute-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';
import { QueryBuilderRoutingModule } from './query-builder-routing.module';

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
