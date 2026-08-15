import { DragDropModule as CdkDragDropModule } from '@angular/cdk/drag-drop';
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
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { SharedModule } from 'src/app/shared';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { EmailChipsInputComponent } from 'src/app/shared/components/email-chips-input/email-chips-input.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { QbDesignComponent } from './components/qb-design/qb-design.component';
import { QbFormDesignerComponent } from './components/qb-form-designer/qb-form-designer.component';
import { QbJoinDesignerComponent } from './components/qb-join-designer/qb-join-designer.component';
import { QbOutputColumnsComponent } from './components/qb-output-columns/qb-output-columns.component';
import { QbPromptPaletteComponent } from './components/qb-prompt-palette/qb-prompt-palette.component';
import { QbSettingsComponent } from './components/qb-settings/qb-settings.component';
import { RunQueryBuilderComponent } from './components/run-query-builder/run-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';
import { QbRuntimeSharedModule } from './qb-runtime-shared.module';
import { QueryBuilderRoutingModule } from './query-builder-routing.module';

@NgModule({
  declarations: [
    AddQueryBuilderComponent,
    EditQueryBuilderComponent,
    ListQueryBuilderComponent,
    ViewQueryBuilderComponent,
    // Query Builder v2 — runtime composer (business-user screen). The six
    // tree->SQL runtime components now live in QbRuntimeSharedModule (imported
    // below) so the Form Builder composer reuses them without duplication.
    RunQueryBuilderComponent,
    // Query Builder v2 — admin design surface
    QbDesignComponent,
    QbFormDesignerComponent,
    QbPromptPaletteComponent,
    QbJoinDesignerComponent,
    QbOutputColumnsComponent,
    QbSettingsComponent,
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
    // The routeless runtime components (qb-filter-tree / -group-node /
    // -condition-row / -value-control / -sql-preview / -summary).
    QbRuntimeSharedModule,
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
    TableModule,
    // CDK drag-drop for the form designer / output-columns reordering.
    // Aliased because the PrimeNG DragDropModule above shares the name.
    CdkDragDropModule,
    // Standalone shared controls (not re-exported by SharedModule)
    ButtonComponent,
    ChipComponent,
    EmailChipsInputComponent,
    // Unified list table + its cell/empty directives (all standalone).
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
  ],
})
export class QueryBuilderModule {}
