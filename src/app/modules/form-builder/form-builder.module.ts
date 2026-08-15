import { DragDropModule as CdkDragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { SharedModule } from 'src/app/shared';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddFormComponent } from './components/add-form/add-form.component';
import { FbComposeComponent } from './components/fb-compose/fb-compose.component';
import { FbDesignComponent } from './components/fb-design/fb-design.component';
import { ListFormComponent } from './components/list-form/list-form.component';
import { ViewFormComponent } from './components/view-form/view-form.component';
import { FormBuilderRoutingModule } from './form-builder-routing.module';

@NgModule({
  declarations: [
    ListFormComponent,
    AddFormComponent,
    ViewFormComponent,
    FbComposeComponent,
    FbDesignComponent,
    // fb-* designer components are added to this array in Tasks 4–9.
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    SharedModule,
    AppPrimeNGModule,
    FormBuilderRoutingModule,
    // CDK drag-drop — aliased because PrimeNG's DragDropModule shares the name
    // (FB uses CDK only).
    CdkDragDropModule,
    SkeletonModule,
    TableModule,
    AccordionModule,
    TooltipModule,
    SelectButtonModule,
    InputSwitchModule,
    // Standalone shared controls (NOT re-exported by SharedModule).
    ButtonComponent,
    ChipComponent,
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
  ],
})
export class FormBuilderModule {}
