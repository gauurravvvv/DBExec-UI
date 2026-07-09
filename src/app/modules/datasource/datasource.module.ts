import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { CustomTableEmptyDirective } from 'src/app/shared/components/custom-table/custom-table-empty.directive';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { AddDatasourceComponent } from './components/add-datasource/add-datasource.component';
import { EditDatasourceComponent } from './components/edit-datasource/edit-datasource.component';
import { ListDatasourceComponent } from './components/list-datasource/list-datasource.component';
import { ViewDatasourceComponent } from './components/view-datasource/view-datasource.component';
import { DatasourceRoutingModule } from './datasource-routing.module';

@NgModule({
  declarations: [
    AddDatasourceComponent,
    EditDatasourceComponent,
    ListDatasourceComponent,
    ViewDatasourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    DatasourceRoutingModule,
    SharedModule,
    SharedChartsModule,
    MenuModule,
    UsGridCellDirective,
    CustomTableComponent,
    CustomTableEmptyDirective,
  ],
})
export class DatasourceModule {}
