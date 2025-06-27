import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { QueryRoutingModule } from './query-routing.module';
import { RunQueryComponent } from './components/run-query/run-query.component';
import { ChartModule } from 'primeng/chart';

@NgModule({
  declarations: [RunQueryComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    AppPrimeNGModule,
    QueryRoutingModule,
    SharedModule,
    ChartModule,
  ],
})
export class QueryModule {}
