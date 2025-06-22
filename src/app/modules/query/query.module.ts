import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { QueryRoutingModule } from './query-routing.module';
import { RunQueryComponent } from './component/run-query/run-query.component';

@NgModule({
  declarations: [RunQueryComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppPrimeNGModule,
    QueryRoutingModule,
    SharedModule,
  ],
})
export class QueryModule {}
