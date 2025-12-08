import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { QueryRoutingModule } from './query-routing.module';
import { RunQueryComponent } from './components/run-query/run-query.component';
import { SaveDatasetDialogComponent } from './components/save-dataset-dialog/save-dataset-dialog.component';
import { ChartModule } from 'primeng/chart';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { AngularSplitModule } from 'angular-split';

@NgModule({
  declarations: [RunQueryComponent, SaveDatasetDialogComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    AppPrimeNGModule,
    QueryRoutingModule,
    SharedModule,
    ChartModule,
    NgxChartsModule,
    AngularSplitModule,
  ],
})
export class QueryModule {}
