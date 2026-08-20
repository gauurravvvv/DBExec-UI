import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddConnectorComponent } from './components/add-connector/add-connector.component';
import { EditConnectorComponent } from './components/edit-connector/edit-connector.component';
import { ListConnectorComponent } from './components/list-connector/list-connector.component';
import { ViewConnectorComponent } from './components/view-connector/view-connector.component';
import { ConnectorRoutingModule } from './connector-routing.module';

@NgModule({
  declarations: [
    AddConnectorComponent,
    EditConnectorComponent,
    ListConnectorComponent,
    ViewConnectorComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    ConnectorRoutingModule,
    SharedModule,
    SharedChartsModule,
    MenuModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
    ChipComponent,
  ],
})
export class ConnectorModule {}
