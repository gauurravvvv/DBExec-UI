import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { AddAlertComponent } from './components/add-alert/add-alert.component';
import { AlertConditionBuilderComponent } from './components/alert-condition-builder/alert-condition-builder.component';
import { AlertHistoryComponent } from './components/alert-history/alert-history.component';
import { EditAlertComponent } from './components/edit-alert/edit-alert.component';
import { ListAlertComponent } from './components/list-alert/list-alert.component';
import { TypedValueInputComponent } from './components/typed-value-input/typed-value-input.component';
import { ViewAlertComponent } from './components/view-alert/view-alert.component';
import { AlertsRoutingModule } from './alerts-routing.module';

@NgModule({
  declarations: [
    ListAlertComponent,
    AddAlertComponent,
    EditAlertComponent,
    ViewAlertComponent,
    AlertConditionBuilderComponent,
    TypedValueInputComponent,
    AlertHistoryComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    AlertsRoutingModule,
    SharedModule,
    // Standalone — the shared unified list table + its projected-empty
    // directive. `UsGridCellDirective` supplies per-cell templates.
    CustomTableComponent,
    CustomTableEmptyDirective,
    UsGridCellDirective,
  ],
})
export class AlertsModule {}
