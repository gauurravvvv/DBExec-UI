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
import { EmailChipsInputComponent } from 'src/app/shared/components/email-chips-input/email-chips-input.component';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { AddQueryBuilderComponent } from './components/add-query-builder/add-query-builder.component';
import { EditQueryBuilderComponent } from './components/edit-query-builder/edit-query-builder.component';
import { ListQueryBuilderComponent } from './components/list-query-builder/list-query-builder.component';
import { QbAppearanceFormComponent } from './components/qb-appearance-form/qb-appearance-form.component';
import { QbConditionRowComponent } from './components/qb-condition-row/qb-condition-row.component';
import { QbDesignComponent } from './components/qb-design/qb-design.component';
import { QbFilterTreeComponent } from './components/qb-filter-tree/qb-filter-tree.component';
import { QbFormDesignerComponent } from './components/qb-form-designer/qb-form-designer.component';
import { QbGroupNodeComponent } from './components/qb-group-node/qb-group-node.component';
import { QbJoinDesignerComponent } from './components/qb-join-designer/qb-join-designer.component';
import { QbOutputColumnsComponent } from './components/qb-output-columns/qb-output-columns.component';
import { QbPromptPaletteComponent } from './components/qb-prompt-palette/qb-prompt-palette.component';
import { QbSettingsComponent } from './components/qb-settings/qb-settings.component';
import { QbSqlPreviewComponent } from './components/qb-sql-preview/qb-sql-preview.component';
import { QbSummaryComponent } from './components/qb-summary/qb-summary.component';
import { QbValueControlComponent } from './components/qb-value-control/qb-value-control.component';
import { QbValueSourceComponent } from './components/qb-value-source/qb-value-source.component';
import { RunQueryBuilderComponent } from './components/run-query-builder/run-query-builder.component';
import { ViewQueryBuilderComponent } from './components/view-query-builder/view-query-builder.component';
import { QueryBuilderRoutingModule } from './query-builder-routing.module';

@NgModule({
  declarations: [
    AddQueryBuilderComponent,
    EditQueryBuilderComponent,
    ListQueryBuilderComponent,
    ViewQueryBuilderComponent,
    // Query Builder v2 — runtime composer (business-user screen)
    RunQueryBuilderComponent,
    QbFilterTreeComponent,
    QbGroupNodeComponent,
    QbConditionRowComponent,
    QbValueControlComponent,
    QbSqlPreviewComponent,
    QbSummaryComponent,
    // Query Builder v2 — admin design surface
    QbDesignComponent,
    QbFormDesignerComponent,
    QbPromptPaletteComponent,
    QbAppearanceFormComponent,
    QbJoinDesignerComponent,
    QbOutputColumnsComponent,
    QbSettingsComponent,
    QbValueSourceComponent,
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
    TableModule,
    // CDK drag-drop for the form designer / output-columns reordering.
    // Aliased because the PrimeNG DragDropModule above shares the name.
    CdkDragDropModule,
    // Standalone shared controls (not re-exported by SharedModule)
    ButtonComponent,
    ChipComponent,
    EmailChipsInputComponent,
  ],
})
export class QueryBuilderModule {}
